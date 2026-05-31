---
name: prompt-optimizer
description: >
  Optimize prompt for clarity + token efficiency. Browser editor opens for direct editing.
  Trigger: optimize prompt, improve prompt, refine prompt, /sherpa:prompt-optimizer, make prompt better, too wordy.
  TRIGGER when: user wants to improve a prompt before submitting it.
  SKIP: user gives a direct implementation command (not asking to optimize a prompt).
---

Hook emits bare node command — run it (blocking, no timeout). stdout JSON {status,text}: status=submit→execute text as task; cancel/timeout→inform user, stop.
