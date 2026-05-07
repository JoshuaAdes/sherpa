---
name: onboard
description: >
  Map project structure via Gemini. Trigger: map project, learn project, understand repo, codebase overview, orient me, repo summary, explore codebase, project tour.
  TRIGGER when: user unfamiliar with repo or asks to learn/map/understand it.
  SKIP: user already knows target files.
---

> Sherpa: onboard? Q quick · D deep · C Claude · N skip

Q: `[G] "Summarize [path]: structure, entry points, tech stack (executable code only), conventions. Roadmap if found: done vs pending. [OUT]"`

D: run Q → flag files unclear or undescribed → `[G] "Deep dive [flagged files]. Exact behavior, logic flow, edge cases. [OUT]"`
D fails → Claude reads flagged files directly.
After onboarding: Claude reads only files it actively edits. Sherpa owns all exploration.
