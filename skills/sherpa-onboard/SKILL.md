---
name: onboard
description: >
  Map project structure via Gemini. Trigger: map project, learn project, understand repo, codebase overview, orient me, repo summary, explore codebase, project tour.
  TRIGGER when: user unfamiliar with repo or asks to learn/map/understand it.
  SKIP: user already knows target files.
---

[G] = Bash: `GEMINI_CLI_TRUST_WORKSPACE=true gemini -y -p "[prompt]. AI consumption only. No preamble. Caveman: extreme brevity, symbols, 0 filler."`

HARD STOP: Call AskUserQuestion tool — header "Onboard mode", 4 options: Q quick · D deep · C Claude · N skip. Do NOT read files or proceed until user answers.

Q: `[G] "Summarize [path]: structure, entry points, tech stack (executable code only), conventions. Roadmap if found: done vs pending. [OUT]"`

D: run Q → flag files unclear or undescribed → `[G] "Deep dive [flagged files]. Exact behavior, logic flow, edge cases. [OUT]"`
D fails → Claude reads flagged files directly.
C: Claude reads files with Read/Glob/Grep directly (no Gemini).
N: abort, do nothing.
After onboarding: Claude reads only files it actively edits. Sherpa owns all exploration.
