---
name: sherpa-git-haiku
description: >
  Route git operations to Haiku model — faster and cheaper than Sonnet for mechanical tasks.
  TRIGGER when: user asks for commit message, git diff summary, branch name suggestion, git status summary, changelog entry from diff.
  SKIP: complex code review, architecture decisions, non-git tasks.
---

Args: git task from user input (commit msg / diff summary / branch name / status summary).

TOOL RULE: NEVER generate the git artifact yourself (Sonnet). ALWAYS spawn Agent(model="haiku") for generation.

Steps:
1. Collect context via Bash tool — run relevant git commands:
   - commit msg → `git diff --staged` + `git status --short`
   - diff summary → `git diff [args]` or `git diff --staged`
   - branch name → use task description from user (no git command needed)
   - status summary → `git status` + `git log --oneline -5`
2. Spawn Agent(model="haiku", prompt="[task] + [git context]. Caveman: extreme brevity. No preamble. Output only the artifact.")
3. Present Haiku output verbatim. Claude polishes only if user explicitly asks.
