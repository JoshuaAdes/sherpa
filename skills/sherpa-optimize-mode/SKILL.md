---
name: optimize-mode
description: >
  (beta) Toggle persistent prompt optimization mode. When ON, every prompt auto-invokes optimizer before execution.
  User picks backend (Gemini/Haiku/Codex). Deactivate anytime with /sherpa:optimize-mode off.
  Trigger: optimize mode on/off, always optimize prompts, persistent optimize, auto-optimize,
  /sherpa:optimize-mode, /sherpa:optimize-mode off.
---

Toggle persistent prompt optimization. ON = every prompt optimized before execution. OFF = manual only.

Flag file: `%USERPROFILE%\.sherpa-optimize-mode` (Win) / `~/.sherpa-optimize-mode` (other)
Format: `{"backend":"gemini"|"haiku"|"codex"}`

## Detect current state

Read flag file. Exists + valid JSON → report active + backend. Error/missing → report OFF.

## Turning OFF

Args contain `off` / `disable` / `stop` / `deactivate` — OR mode is currently ON and user typed bare `/sherpa:optimize-mode` (toggle):

- Win: `del /f "%USERPROFILE%\.sherpa-optimize-mode" 2>nul`
- Other: `rm -f ~/.sherpa-optimize-mode`
- Tell user: "Optimize mode OFF. Prompts no longer auto-optimized."

## Turning ON

1. If backend not specified in args: HARD STOP — AskUserQuestion header "Optimizer backend", 3 options:
   - Gemini · free, default, Flash-Lite → Flash → Pro fallback chain
   - Haiku · Claude-aligned, needs ANTHROPIC_API_KEY
   - Codex · code-focused, needs Codex CLI installed
   Wait for answer.

2. Write flag file:
   - Win: `echo {"backend":"[backend]"} > "%USERPROFILE%\.sherpa-optimize-mode"`
   - Other: `printf '{"backend":"[backend]"}' > ~/.sherpa-optimize-mode`

3. Tell user:
   "Optimize mode ON — backend: [backend].
   Every prompt will pass through the optimizer before execution.
   Deactivate: /sherpa:optimize-mode off"

## Notes
- `/sherpa:prompt-optimizer --backend [backend]` is the skill invoked per-prompt when mode is active
- Short commands and mode-control prompts are skipped automatically by the hook
- Backend can be changed by running `/sherpa:optimize-mode on [backend]` again
