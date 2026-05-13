---
name: sherpa-help
description: >
  Quick-reference card for all Sherpa skills and commands.
  One-shot display, not a persistent mode. Trigger: /sherpa-help,
  "sherpa help", "what sherpa commands", "how do I use sherpa".
---

# Sherpa Help

Display this reference card when invoked. One-shot — do NOT delegate, write files, or persist anything.

## Delegation Prompt

When Sherpa spots a delegatable task, it asks:

| Choice | Input | What happens |
|--------|-------|--------------|
| **Y** | `Y` | Gemini handles task once, result inline |
| **A** | `A` | Auto-delegate same type for rest of session |
| **C** | `C` | Claude handles directly, no delegation |
| **N** | `N` | Skip this time |

## Skills

| Skill | Trigger | Purpose |
|-------|---------|---------|
| **sherpa-brainstorm** | `/sherpa:brainstorm [topic]` | G: Gemini only · GC: Gemini + Codex · Claude synthesizes |
| **sherpa-search** | `/sherpa:search [query]` | Gemini web search via native Google Search |
| **sherpa-onboard** | `/sherpa:onboard` | Quick or deep project map via Gemini |
| **sherpa-handoff** | `/sherpa:handoff` | Package session context → `sherpa-handoff.md` → Codex drives |
| **sherpa-prompt-optimizer** *(beta)* | `/sherpa:prompt-optimizer [prompt]` | Gemini (Flash Lite default) rewrites for clarity + token-efficiency · browser editor · model picker · re-optimize active card · click "Use It" |
| **sherpa-help** | `/sherpa-help` | This card |

## What Gets Delegated

| Task type | Routed to |
|-----------|-----------|
| Large file reads, log scans, codebase exploration | Gemini |
| Web search, docs lookup | Gemini (native Google Search) |
| Brainstorming, alternatives | Gemini · Codex optional |
| Write-heavy tasks, context handoff | Codex |
| Architecture, decisions, final writes | Claude (never delegated) |

## Rate Limit Recovery

Session log at `.sherpa/session.log` — every Edit/Write/Bash recorded.
On rate limit: `/sherpa:handoff` → Codex resumes from handoff file + session log.

## Install

```bash
/plugin marketplace add JoshuaAdes/sherpa
/plugin install sherpa@Sherpa
```

Docs: https://github.com/JoshuaAdes/sherpa-dev
