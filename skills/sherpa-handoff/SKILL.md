---
name: handoff
description: Package current session into sherpa-handoff.md and hand off to Codex or Gemini to continue. Use when context is heavy or you want to save Claude tokens.
---

Write `sherpa-handoff.md`:
```
task: [goal]
decided: [key decisions]
done: [completed steps]
next: [next step]
constraints: [rules/patterns]
files: [key paths]
```
Then: `[C] "read sherpa-handoff.md, continue task"` or `[G] "read sherpa-handoff.md, continue task. [OUT]"`
Claude steps back. Resume: user says "back to Claude".
