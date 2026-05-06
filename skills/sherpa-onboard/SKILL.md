---
name: onboard
description: Run quick or deep project onboarding via Gemini. Maps structure, entry points, tech stack, conventions.
---

> Sherpa: onboard? Q quick · D deep · C Claude · N skip

Q: `[G] "Summarize [path]: structure, entry points, tech stack (executable code only), conventions. Roadmap if found: done vs pending. [OUT]"`

D: run Q → flag files unclear or undescribed → `[G] "Deep dive [flagged files]. Exact behavior, logic flow, edge cases. [OUT]"`
D fails → Claude reads flagged files directly.
After onboarding: Claude reads only files it actively edits. Sherpa owns all exploration.
