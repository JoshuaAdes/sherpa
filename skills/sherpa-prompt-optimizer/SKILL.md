---
name: prompt-optimizer
description: >
  Optimize prompt for clarity + token efficiency. Gemini rewrites, browser editor opens for direct editing.
  Trigger: optimize prompt, improve prompt, refine prompt, /sherpa:prompt-optimizer, make prompt better, too wordy.
  TRIGGER when: user wants to improve a prompt before submitting it.
  SKIP: user gives a direct implementation command (not asking to optimize a prompt).
---

Args: prompt text + optional --backend flag.

No delegation — Node script calls backend directly. Do NOT make a separate [G] call for this skill.

Flow:
1. Bash: `cat ~/.sherpa-plugin-root` (Win: `type %USERPROFILE%\.sherpa-plugin-root`) → PLUGIN_ROOT
2. Run (blocking): `node "[PLUGIN_ROOT]/hooks/sherpa-prompt-optimizer-ui.js" "[prompt]" [--backend gemini|claude|codex]`
   - Node calls backend → browser opens with optimized prompt pre-filled
   - User edits directly in browser textarea · picks backend + model in UI
   - Clicks "Use It" or "Cancel" → Node exits, prints JSON to stdout
3. Parse stdout JSON: `{"status":"submit"|"cancel"|"timeout","text":"..."}`
   - `submit` → execute `text` as the actual task (no further Claude relay of optimizer output)
   - `cancel` or `timeout` → inform user, stop

Backend: `SHERPA_OPTIMIZER_BACKEND=gemini|claude|codex` env (default: gemini) · `--backend` arg overrides env.
Gemini: free, default · Flash Lite/Flash/Pro model picker.
Claude: CLI-only, no API key · Haiku/Sonnet/Opus model picker.
Codex: CLI-only · dynamic model discovery (probes on first use, caches 24h in `~/.sherpa/codex-models.json`) · discovered model buttons shown in UI · fallback `['gpt-5.4-mini','gpt-5.5']` if probe fails.
Legacy: `--backend haiku|sonnet|opus` still accepted (maps to claude + matching model).

Token cost: ~0 Claude tokens for optimization relay — Node handles backend call directly.
Claude only pays tokens when executing the final approved prompt.
