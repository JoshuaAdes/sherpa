---
name: onboard
description: >
  Map project structure via Gemini, Codex, or both in parallel. Trigger: map project, learn project, understand repo, codebase overview, orient me, repo summary, explore codebase, project tour.
  TRIGGER when: user unfamiliar with repo or asks to learn/map/understand it.
  SKIP: user already knows target files.
---

[G]    = Bash: `GEMINI_CLI_TRUST_WORKSPACE=true gemini -y -p "[prompt]. AI consumption only. No preamble. Caveman: extreme brevity, symbols, 0 filler."`
[X]    = Bash: `codex exec "[prompt]. AI consumption only. No preamble. Extreme brevity."`
[OUT]  = mandatory suffix for [G] = "AI consumption only. No preamble. Caveman: extreme brevity, symbols, 0 filler."
[CRIT] = After [G] or [X] output: (1) flag claims conflicting with known facts (2) Glob/Grep to verify any file path or function name before acting (3) note confidence gaps and speculative claims → proceed only on verified info · uncertain = verify with Read/Grep first

HARD STOP: Call AskUserQuestion tool — header "Onboard mode", 4 options: Q (quick, Gemini only) · GC (deep, Gemini + Codex parallel) · X (Codex exec only) · N (skip). Do NOT read files or proceed until user answers.

Q: `[G] "Summarize [path]: structure, entry points, tech stack (executable code only), conventions. Roadmap if found: done vs pending. [OUT]"`
[CRIT] output before proceeding.

GC:
Step 1 — run both Bash calls in parallel (single message):
  `[G] "Summarize [path]: structure, entry points, tech stack (executable code only), conventions. Roadmap if found: done vs pending. [OUT]"`
  `[X] "Summarize [path]: structure, entry points, tech stack (executable code only), conventions. Roadmap if found: done vs pending. AI consumption only. No preamble. Extreme brevity."`
Step 2 — [CRIT] both outputs: identify conflicts, unclear files, unaddressed concepts, speculative claims. List explicit gaps.
If gaps → Round 1 (Codex for code-specific gaps · Gemini for structural/doc gaps):
  `[X] "Given context: [brief summary]. Clarify: [gap1] · [gap2]. AI consumption only."` or `[G] "Clarify: [gaps]. [OUT]"`
  [CRIT] round 1 output.
If gaps remain → Round 2 (other CLI or same):
  `[G] or [X] "Clarify remaining: [gaps]. [OUT]"`
  [CRIT] round 2 output.
After 2 rounds max → Claude self-check: Read/Glob/Grep specific files for unresolved uncertainties.
Final synthesis: Claude combines all verified info.

X: `[X] "Summarize [path]: structure, entry points, tech stack (executable code only), conventions. Roadmap if found: done vs pending. AI consumption only. No preamble. Extreme brevity."`
[CRIT] output before proceeding.
X fails → Claude reads flagged files directly.

N: abort, do nothing.
After onboarding: Claude reads only files it actively edits. Sherpa owns all exploration.
