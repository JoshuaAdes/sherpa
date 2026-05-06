# Changelog

## 0.3.0 — 2026-05-06

### Self-Healing
- Health & Environment section: detect missing `rg` before first Gemini call each session
- Intercept Gemini "Ripgrep is not available" output mid-task → trigger heal → retry
- Heal sequence: notify user → Y/N → OS-specific install → verify → retry or fallback `grep`

### Rate Limit Recovery
- Handoff mode now writes `sherpa-handoff.md` capsule (task / decided / done / next / constraints / files)
- New Rate Limit Recovery section: Gemini or Codex resume from handoff file or session log
- Rolling `.sherpa/session.log` via PostToolUse hooks — always-fresh context if Claude dies mid-task

### Hooks
- `hooks/sherpa-session-log.ps1` — Windows PostToolUse hook, fires on Edit/Write/Bash only
- `hooks/sherpa-session-log.sh` — bash equivalent for macOS/Linux
- Hook registered in `plugin.json`; zero Claude token cost (silent file write)

### Protocol Accuracy Fixes (multi-agent review: G + C + Claude)
- `[C]` definition: `codex -q` → `codex exec` (flag did not exist, broke all Codex read commands)
- Master Claude: "All writes...Claude only" → "Decisions/architecture: Claude only. Writes: Claude by default — Codex when explicitly asked"
- README: "all decisions and writes remain with Claude" → accurate write delegation language
- README: "No cache files" → "Rolling session log in `.sherpa/`"
- README: "Claude never reads raw large files" → "Sherpa routes reads to Gemini by default — Claude reads direct when delegation skipped, failed, or user chooses C"
- README: "full context" → "context package" (Codex gets a structured prompt, not Claude's context window)
- README: Rate Limit Recovery row added to What It Does table

### Architecture
- Dropped `SHERPA_DELEGATION.md` drop-in — `skills/sherpa-delegation/SKILL.md` is now single source of truth
- Plugin-only distribution — no drop-in path
- `CLAUDE.md` updated to load protocol directly from `SKILL.md`

### Test Suite
- `tests/hook-golden-io.ps1` + `.sh` — golden IO tests for both hook scripts
- `tests/sync-sentinel.ps1` — local sync check: SKILL.md body ↔ SHERPA_DELEGATION.md
- `tests/fixtures/` — Edit / Write / Bash / Read tool JSON fixtures
- CI (`validate.yml`): Manifest Contract, Protocol Sections, Protocol Variables, Hook Golden IO tests

---

## 0.2.0 — 2026-05-06

### Architecture
- Bimodal file format: Zone 1 prose (safety rules) + Zone 2 compressed (mechanical rules)
- Single file for both standalone and plugin — test = ship, no sync drift
- Shorthand keys [G] [C] [OUT] [P] defined once, used throughout (~30% token reduction)

### New Modes
- **Brainstorm**: Gemini generates alternatives, Codex generates code alternatives (if installed), Claude synthesizes
- **Codex Write**: user-initiated, Codex gets write access with full context package, Claude reviews
- **Handoff**: context pressure triggers Codex takeover with structured handoff prompt

### CLI Support
- Codex added as optional delegate (skip silently if absent)
- Trust handling: Gemini via `GEMINI_CLI_TRUST_WORKSPACE=true` env var; Codex via `~/.codex/config.toml`
- Failure menu extended: C · S switch CLI · N skip

### Protocol
- Permission system unchanged: Y · A · C · N
- Autopilot logging and revocation unchanged
- Master Claude rule made explicit at top of file
- No silent fallbacks — all failures surface to user

---

## 0.1.0 — initial

- Gemini-only delegation protocol
- Onboarding Q/D workflow
- Planning & review workflow
- Permission system with autopilot
- Failure handling
