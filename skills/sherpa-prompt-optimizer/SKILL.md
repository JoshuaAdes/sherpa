---
name: prompt-optimizer
description: >
  Optimize prompt for clarity + token efficiency. Gemini rewrites, browser editor opens for direct editing.
  Trigger: optimize prompt, improve prompt, refine prompt, /sherpa:prompt-optimizer, make prompt better, too wordy.
  TRIGGER when: user wants to improve a prompt before submitting it.
  SKIP: user gives a direct implementation command (not asking to optimize a prompt).
---

Args: prompt text + optional --backend flag.

No delegation — Node script calls Gemini directly. Do NOT make a separate [G] call for this skill.

Flow:
1. Bash: `cat ~/.sherpa-plugin-root` (Win: `type %USERPROFILE%\.sherpa-plugin-root`) → PLUGIN_ROOT
2. Run (blocking): `node "[PLUGIN_ROOT]/hooks/sherpa-prompt-optimizer-ui.js" "[prompt]" [--backend gemini|haiku]`
   - Node calls Gemini (or Haiku) → browser opens with optimized prompt pre-filled
   - User edits directly in browser textarea (word/line level, no chat needed)
   - Clicks "Use It" or "Cancel" → Node exits, prints JSON to stdout
3. Parse stdout JSON: `{"status":"submit"|"cancel"|"timeout","text":"..."}`
   - `submit` → execute `text` as the actual task (no further Claude relay of optimizer output)
   - `cancel` or `timeout` → inform user, stop

Backend: `SHERPA_OPTIMIZER_BACKEND=gemini|haiku` env (default: gemini) · `--backend [model]` arg overrides env.
Gemini: free, default. Haiku: needs `ANTHROPIC_API_KEY`, better Claude alignment.

Token cost: ~0 Claude tokens for optimization relay — Node handles Gemini call directly.
Claude only pays tokens when executing the final approved prompt.
