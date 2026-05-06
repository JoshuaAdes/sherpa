# Sherpa

> Carries the load so Claude can focus on the climb.

Claude Code plugin. Routes tasks to the right model: Gemini for research, search, large-file analysis, and brainstorming — Codex for write mode and context handoff. Claude stays master orchestrator, focused on decisions, architecture, and final writes.

---

## What It Does

| Mode | Trigger | Result |
|---|---|---|
| Delegation | large file, log, codebase | Delegate reads/searches, Claude gets summary |
| Web Search | search / look up / docs for | Gemini uses native Google Search — faster, no Claude WebFetch tokens |
| Onboarding | "understand this project" | Quick or deep project map, no broad Claude reads |
| Brainstorm | "brainstorm alternatives for X" | Gemini always · Codex optional (user chooses) · Claude synthesizes |
| Plan Review | before complex implementation | Delegate flags edge cases and failure points |
| Codex Write | "use codex to write this" | Codex codes with context package, Claude reviews |
| Rate Limit Recovery | Claude hits limit mid-task | Gemini/Codex resume from handoff file or session log |
| Handoff | context heavy / "save tokens" | Claude packages context, Codex drives to completion |

---

## Install

**1. Install CLI dependencies**
```bash
# Required
npm install -g @google/gemini-cli

# Optional (enables write mode and context handoff)
npm install -g @openai/codex
```

**2. Install plugin**

```bash
/plugin marketplace add JoshuaAdes/sherpa
/plugin install sherpa@sherpa
```

---

## How It Works

1. Claude spots a delegatable task
2. Asks: `Y once · A always · C Claude · N skip`
3. Delegate runs, output pipes inline to Claude
4. Claude acts on the compressed result

Rolling session log in `.sherpa/`. Sherpa routes reads to Gemini by default — Claude reads direct when delegation is skipped, failed, or user chooses C.

---

## Commands

Explicit slash commands — complement automatic delegation, don't replace it.

| Command | What it does |
|---|---|
| `/sherpa:handoff` | Package session → `sherpa-handoff.md`, hand off to Codex |
| `/sherpa:brainstorm [topic]` | Gemini always · Codex optional (G or GC prompt) · Claude synthesizes |
| `/sherpa:search [query]` | Gemini web search via built-in Google Search |
| `/sherpa:onboard` | Quick or deep project map via Gemini |

---

## Philosophy

Claude Code excels at coding decisions, architecture, and final writes. A lot of real engineering work isn't that: research, docs, web search, file reads, log scans, codebase exploration.

Gemini's free tier and large context window handle token-expensive analysis without burning Claude tokens. Gemini brainstorming brings genuinely different intelligence — not a budget substitute. Gemini's built-in Google Search covers what Claude Code can't do natively. Codex takes over for write-heavy tasks and context handoffs.

Sherpa intercepts each task, routes it to the right model, and pipes back a compressed result. Claude spends tokens only where its reasoning actually matters. When context gets heavy, you can trigger a handoff — Sherpa packages the session into a handoff file and Codex drives to completion. If a rate limit hits mid-task, the rolling session log means work resumes without losing a step.

---

## License

MIT + Commons Clause
Free to use, modify, and deploy internally. Selling this plugin or products built primarily on it is not permitted.
See [LICENSE](LICENSE).
