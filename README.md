# Sherpa

> Carries the load so Claude can focus on the climb.

Claude Code plugin. Delegates low-logic tasks to Gemini and Codex CLIs. Claude stays master — all final decisions stay with Claude. Writes: Claude by default, Codex when explicitly asked.

---

## What It Does

| Mode | Trigger | Result |
|---|---|---|
| Delegation | large file, log, codebase | Delegate reads/searches, Claude gets summary |
| Web Search | search / look up / docs for | Gemini uses native Google Search — faster, no Claude WebFetch tokens |
| Onboarding | "understand this project" | Quick or deep project map, no broad Claude reads |
| Brainstorm | "brainstorm alternatives for X" | Gemini + Codex generate options, Claude synthesizes |
| Plan Review | before complex implementation | Delegate flags edge cases and failure points |
| Codex Write | "use codex to write this" | Codex codes with context package, Claude reviews |
| Rate Limit Recovery | Claude hits limit mid-task | Gemini/Codex resume from handoff file or session log |
| Handoff | context heavy / "save tokens" | Claude packages context, Codex drives to completion |

---

## Install

```bash
# Required
npm install -g @google/gemini-cli

# Optional (enables write mode and context handoff)
npm install -g @openai/codex

# Install plugin
/plugin install JoshuaAdes/sherpa
```

---

## How It Works

1. Claude spots a delegatable task
2. Asks: `Y once · A always · C Claude · N skip`
3. Delegate runs, output pipes inline to Claude
4. Claude acts on the compressed result

Rolling session log in `.sherpa/`. Sherpa routes reads to Gemini by default — Claude reads direct when delegation is skipped, failed, or user chooses C.

---

## Philosophy

Claude is expensive on high-volume, low-logic work — reading large files, scanning logs, searching the web, exploring codebases. That cost is avoidable.
Sherpa intercepts those tasks before Claude touches them, routes them to free or cheap CLI models, and pipes back a compressed result. Claude spends tokens only where its reasoning actually matters.

---

## License

MIT + Commons Clause
Free to use, modify, and deploy internally. Selling this plugin or products built primarily on it is not permitted.
See [LICENSE](LICENSE).
