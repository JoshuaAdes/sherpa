---
name: handoff
description: Package current session into sherpa-handoff.md and hand off to Codex or Gemini to continue. Use when context is heavy or you want to save Claude tokens.
---

Write `sherpa-handoff.md` in machine-compressed format:
```
TASK: [goal — one line]
DECIDED: [decision]·[decision]·[decision]
DONE: [step]·[step]·[step]
NEXT: 1.[step] 2.[step] 3.[step]
CONSTRAINTS: [rule]·[rule]·[rule]
FILES: [path]✓ [path]✗ [path]([size])
TOOLS: [group]([tool],[tool]) [group]([tool])
```
Rules: ALL CAPS headers · `·` between list items · `→` for flow · `✓`/`✗` for done/pending · `~L40` for line refs · no prose, no articles, pure data.

Then: `[C] "read sherpa-handoff.md, continue task"` or `[G] "read sherpa-handoff.md, continue task. AI consumption only. No preamble. Caveman: extreme brevity, symbols, 0 filler."`
Claude steps back. Resume: user says "back to Claude".
