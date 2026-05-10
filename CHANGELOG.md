# Changelog

## 0.5.1 — 2026-05-10
- Unified all hooks into cross-platform Node.js implementation
- New `sherpa-logger.js` replaces PowerShell/Python session logging
- New `sherpa-optimizer.js` replaces PowerShell prompt optimization notification
- Enhanced `sherpa-prompt-optimizer-ui.js`:
  - Support for long prompts via stdin (avoids OS command line limits)
  - Resilient browser opening with `DISPLAY` check on Linux
  - Non-blocking browser launch with `spawn` and `unref`
- Unified test suite: `tests/hook-golden-io.js` (Node-based, cross-platform)
- Removed redundant `.ps1` and `.sh` hook scripts

## 0.5.0 — 2026-05-08

### Prompt Optimizer
- New skill: `/sherpa:prompt-optimizer [prompt] [--backend gemini|haiku]`
- Browser editor UI — Gemini rewrites prompt, opens in browser textarea, user edits directly (no copy-paste, no chat loop)
- Node.js orchestrates Gemini call — optimized text never enters Claude context, ~0 Claude tokens for optimization relay
- Multi-model: `SHERPA_OPTIMIZER_BACKEND=gemini|haiku` env · `--backend` CLI arg overrides · precedence: arg > env > default
- Haiku backend via `ANTHROPIC_API_KEY` for Claude-aligned rewrites
- Security: server binds `127.0.0.1` only, nonce-protected POST endpoints, HTML-escaped textarea content
- Concurrency-safe: port 0 (OS-assigned) — multiple sessions never collide
- Error handling: Gemini fail → original prompt in editor · browser fail → URL to stderr · 10-min timeout → original
- Soft-suggest hook: `UserPromptSubmit` nudges user when prompt >200 chars, zero extra tokens

### Cross-Platform Hooks (JS-only)
- `hooks/sherpa-logger.js` — replaces `sherpa-session-log.ps1` + `sherpa-session-log.sh`
- `hooks/sherpa-optimizer.js` — cross-platform soft-suggest hook (replaces PS1)
- `hooks/sherpa-prompt-optimizer-ui.js` — Node HTTP server + browser editor
- Deleted: `sherpa-session-log.ps1`, `sherpa-session-log.sh`, `sherpa-prompt-optimizer.ps1`
- All hooks now Node.js — single runtime, works Windows/macOS/Linux

### Health Check
- Writes `~/.sherpa-plugin-root` on SessionStart — skills use it to locate hook scripts at runtime

---

## 0.4.0 — 2026-05-08
- `[G]` format: bake `GEMINI_CLI_TRUST_WORKSPACE=true` into command + health check warning
- Handoff format: machine-compressed ~40% fewer tokens
- SessionStart health check: cross-platform via Node.js
- Fix: `CLAUDE_PLUGIN_ROOT` hook var + auto-install ripgrep on heal
- Enforce `[OUT]` on all G+C read calls — no verbose AI output

## 0.3.0 — 2026-05-06

### Self-Healing
- Detect missing `rg` before first Gemini call each session
- Intercept "Ripgrep is not available" → heal → retry
- OS-specific install: winget / brew / apt / cargo

### Rate Limit Recovery
- Handoff writes `sherpa-handoff.md` capsule (task/decided/done/next/constraints/files)
- Gemini or Codex resume from handoff file or session log
- `.sherpa/session.log` via PostToolUse hook — context survives Claude crash

### Hooks
- `hooks/sherpa-session-log.ps1` — PostToolUse, fires on Edit/Write/Bash only
- Registered in `plugin.json`; zero Claude token cost

### Protocol Fixes (multi-agent review: G+C+Claude)
- `[C]` def: `codex -q` → `codex exec`
- Master Claude write rule: "Claude by default — Codex when explicitly asked"
- README: rate limit recovery row, session log mention, accurate write delegation language

### Architecture
- Dropped `SHERPA_DELEGATION.md` — `skills/sherpa-delegation/SKILL.md` = single source of truth
- Plugin-only distribution

### Tests
- `tests/hook-golden-io.ps1` + `.sh` — golden IO tests for hook scripts
- `tests/fixtures/` — Edit/Write/Bash/Read JSON fixtures

---

## 0.2.0 — 2026-05-06
- Bimodal format: Zone 1 prose (safety) + Zone 2 compressed (mechanical)
- Shorthand keys `[G]` `[C]` `[OUT]` `[P]` — ~30% token reduction
- Brainstorm mode: Gemini always, Codex optional, Claude synthesizes
- Codex Write + Handoff modes
- Codex optional delegate (skip if absent)
- Trust: Gemini env var, Codex config.toml
- No silent fallbacks

---

## 0.1.0 — initial
- Gemini-only delegation protocol
- Onboarding Q/D
- Plan review
- Permission system with autopilot
- Failure handling
