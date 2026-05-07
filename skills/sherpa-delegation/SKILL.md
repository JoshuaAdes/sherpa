---
name: sherpa-delegation
description: Delegates low-logic high-volume tasks to Gemini or Codex CLI to save Claude tokens. Handles: codebase exploration, bulk data reading, web research, log analysis, code search, multi-agent brainstorming, plan review, codex write mode, and context handoff. Claude remains master orchestrator — all final decisions stay with Claude, writes by default. Codex writes only when user explicitly asks. Activates when Claude is about to read large sources, explore a codebase, look up live docs, analyze logs, or when user requests brainstorming, delegation, or handoff.
---

# Sherpa
STATUS: ON · disable: set STATUS to OFF or say "stop sherpa"

## Master Claude
Claude = orchestrator. Decisions, architecture: Claude only.
Security · auth · complex refactors → Claude always, no exceptions.
Writes: Claude by default — Codex only when user explicitly asks (Codex Write / Handoff).
Delegates read, summarize, search, generate options by default — write only on explicit request.
No-delegate: silent file reads where Claude reads full content just to pass it — same tokens, no savings.
Delegate OK: user explicitly asks brainstorm/reasoning on file content → pass summary/excerpt only, not full content.

## Trust & Failure
[G] trust error → set env GEMINI_CLI_TRUST_WORKSPACE=true · retry
[G] HTTP 429 → quota exhausted, retries automatically
[C] absent → skip silently, use [G]
[C] trust error → add `[projects."/path"] trust_level = "trusted"` to ~/.codex/config.toml · retry
Any other failure → stop, do not fall back silently → C Claude handles · S switch CLI · N skip

---

[G]   = `GEMINI_CLI_TRUST_WORKSPACE=true gemini -y -p "[prompt]. AI consumption only. No preamble. Caveman: extreme brevity, symbols, 0 filler."` — trust env + [OUT] on EVERY call, no exceptions
[C]   = `codex exec "[prompt]. AI consumption only. No preamble. Extreme brevity."` read · `codex "[prompt]"` write  (optional — skip if absent)
[OUT] = mandatory suffix for [G] · [C] read calls = "AI consumption only. No preamble. Caveman: extreme brevity, symbols, 0 filler."
[P]   = Y once · A always (autopilot) · C Claude · N skip

## Health & Environment
Triggers:
- Before first [G] call each session: run `rg --version` silently
- [G] output contains "Ripgrep is not available" or "Falling back to GrepTool" → intercept, heal, retry

Heal sequence:
1. Auto-install without asking — ripgrep is required for Gemini to work properly. Notify user after.
2. Detect OS → run:
   - Windows: `winget install BurntSushi.ripgrep.MSVC`
   - macOS: `brew install ripgrep`
   - Linux (apt): `sudo apt install ripgrep`
   - Linux (dnf): `sudo dnf install ripgrep`
   - Cargo fallback: `cargo install ripgrep`
3. Verify: `rg --version` → ok → retry [G] command · fail → fallback `grep` + notify
4. N → fallback `grep` + continue

## Delegation
Autopilot log: Sherpa (auto): [CLI] → [task] → [prompt]
Revoke: "stop auto [task]"
Ask [P] before delegating unless autopilot set or user explicitly requests.

| Trigger | Command |
|---|---|
| large file / CSV / JSON / XML / DB | `[G] "Look at [file]. Fields, row count, types, anomalies. [OUT]"` |
| overview / how is X / where is Y | `[G] "Look at [path]. Structure + where [topic] lives. [OUT]"` |
| latest / current / what version | `[G] "Latest [lib] [feature]. Example, version, URL. [OUT]"` |
| search / look up / docs for / how does [external] work | `[G] "Search: [query]. Key facts, code example if relevant, source URL. [OUT]"` |
| error / trace / crash / log | `[G] "Look at [log]. Root cause, error line, one-sentence fix. [OUT]"` |
| find where / which file / locate | `[G] "Look at [path]. Which file handles [logic]? Path only."` |
| brainstorm / ideas / alternatives | → Brainstorm |
| user asks [C] to write or edit code | → Codex Write |
| context heavy / hand off / save tokens | → Handoff |

## Onboarding
Trigger: understand / summarize / onboard / unfamiliar project / learn project / map codebase / codebase overview / orient me / project tour

> Sherpa: onboard? Q quick · D deep · C Claude · N skip

Q: `[G] "Summarize [path]: structure, entry points, tech stack (executable code only), conventions. Roadmap if found: done vs pending. [OUT]"`

D: run Q → flag files unclear or undescribed → `[G] "Deep dive [flagged files]. Exact behavior, logic flow, edge cases. [OUT]"`
D fails → Claude reads flagged files directly.
After onboarding: Claude reads only files it actively edits. Sherpa owns all exploration.

## Brainstorm
Trigger: brainstorm / ideas for / options for / alternatives / think through / compare approaches / help me decide / pros and cons

> Sherpa: brainstorm with G Gemini only · GC Gemini + Codex · N skip

G: `[G] "7 alternatives for [topic]. Each: name · tradeoff · 1 sentence. [OUT]"` → Claude synthesizes.
GC: run G → `[C] exec "Alternatives for [topic]. Each: approach · tradeoff · 3-line sketch. [OUT]"` → Claude synthesizes all.
Final call: Claude only.

## Plan Review
1. Claude drafts plan
2. `[G] "Review: [plan]. Missing edge cases and failure points only. [OUT]"`
3. Claude adjusts. Repeat once if serious issues.
4. Claude implements.

## Codex Write
Trigger: user explicitly asks [C] to write or edit code

`[C] "[task]. Decided: [key decisions]. Done: [completed steps]. Next: [remaining]. Key files: [paths]."`
Claude reviews all [C] output before marking task complete.

## Handoff
Trigger: context pressure · "hand off" · "continue with codex" · "save tokens"

> Sherpa: context heavy — hand off to [C]? Y · C keep going · N stop

If Y:
1. Write `sherpa-handoff.md` (machine-compressed):
   ```
   TASK: [goal]
   DECIDED: [decision]·[decision]
   DONE: [step]·[step]
   NEXT: 1.[step] 2.[step]
   CONSTRAINTS: [rule]·[rule]
   FILES: [path]✓ [path]✗
   ```
   Rules: ALL CAPS · `·` between items · `→` flow · `✓`/`✗` done/pending · no prose.
2. `[C] "read sherpa-handoff.md, continue task"`
Claude steps back. [C] drives. Return: "back to Claude".

## Rate Limit Recovery
If Claude hits rate limit mid-task:
- `sherpa-handoff.md` exists → `[G] "read sherpa-handoff.md, continue task. [OUT]"` or `[C] "read sherpa-handoff.md, continue task"`
- No handoff file → `[G] "read .sherpa/session.log, summarize what Claude was doing, continue. [OUT]"`
User runs resume cmd after Claude recovers.
