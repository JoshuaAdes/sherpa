# Changelog

## 0.5.7 — 2026-05-31

### Prompt Optimizer — Dynamic Codex model discovery

- **Auto-detect supported Codex models** per user's account tier — no hardcoded list
  - Probe fires lazily (on first Codex backend click, or immediately if `--backend codex`)
  - Sequential probe: candidate list `['gpt-5.4-mini', 'gpt-5.5', 'gpt-5.5-codex', 'gpt-5-codex', 'gpt-5']`, 15s timeout per candidate
  - Error taxonomy: `not supported` → rejected · auth/401/403 → abort · timeout/ENOENT → transient (not cached)
  - Results sent to browser via SSE `{type:'codex-models', models:[...]}` → buttons update live
- **Cache** `~/.sherpa/codex-models.json` — atomic write (tmp+rename), schema validation, allowlist regex on read, 24h TTL, invalidated on CLI version change
- **Browser UX**: Codex model row shows `Detecting…` during probe, then discovered model IDs as buttons
- **Fallback**: if all probes fail, shows hardcoded `['gpt-5.4-mini', 'gpt-5.5']` — optimizer still usable
- **Security**: `sanitizeEnv()` strips secrets from child process env; ENOENT handled gracefully; all model IDs validated against `/^[a-z0-9.\-]+$/i` before use
- `/probe-codex` POST endpoint triggers detection; nonce-protected

## 0.5.6 — 2026-05-31

### Prompt Optimizer — Claude backend + Codex fix + UX improvements

- **Claude backend** (replaces separate Haiku/Sonnet/Opus backends): unified `--backend claude` with Haiku/Sonnet/Opus model picker in UI
  - CLI-only, no `ANTHROPIC_API_KEY` — uses `claude --model X -p "..."` CLI
  - Legacy `--backend haiku|sonnet|opus` still accepted (maps to claude + correct model key)
- **Codex backend** fixed: `codex exec "instruction"` with no `-m` flag — matches brainstorm [C] pattern exactly
  - ChatGPT accounts reject all explicit model flags; default auto-selected model works
  - Model row hidden for Codex backend (no sub-model variants available)
  - 60s timeout; reads stdout or temp file fallback; ANSI stripped; stderr shown on failure
- **Stop/cancel fixed**: `pendingDone` global force-resolves any pending optimization immediately on stop — covers hung processes, slow kill, 60s Codex timer, all boundary cases
- **Session expired UX**: server sends `{type:'expired'}` SSE before shutting down; browser shows "Session expired — run again" message; `es.onerror` handler catches dead server on page reload
- Backend buttons: Gemini · Claude · Codex (replaces Gemini · Haiku)
- Model row: visible for Gemini + Claude, hidden for Codex
- Initial model active button reflects `--backend` arg (e.g. `--backend sonnet` → Claude backend, Sonnet active)
- `CLAUDE_MODEL_IDS` map: lite→haiku-4-5, flash→sonnet-4-6, pro→opus-4-7

## 0.5.5 — 2026-05-31

### Onboard — GC parallel mode + completion loop
- Options restructured: Q (quick Gemini) · GC (deep, Gemini + Codex parallel) · X (Codex exec only) · N — drops D (deep Gemini solo), GC supersedes it
- GC flow: parallel [G]+[X] → [CRIT] both → Claude identifies gaps → Round 1 gap-fill (Codex or Gemini) → [CRIT] → Round 2 if needed → [CRIT] → Claude self-check (Read/Glob/Grep) → synthesize
- Naming matches brainstorm style (GC not P) with descriptions in parens
- `sherpa-onboard/SKILL.md` + Onboarding section of `sherpa-delegation/SKILL.md` both updated

### [CRIT] macro — global critical analysis
- New `[CRIT]` shorthand: flag conflicting claims · Glob/Grep verify file paths/function names · note speculative claims · proceed only on verified info
- Added to `sherpa-delegation/SKILL.md` DSL block with global rule: apply after EVERY [G]/[C] call, no exceptions
- Inlined in `sherpa-onboard/SKILL.md` (standalone skill, needs own definition)
- Added to `sherpa-brainstorm/SKILL.md` after G and GC synthesis steps

### Beta labels
- `sherpa-optimize-mode` consistently tagged (beta) in: skill frontmatter · sherpa-help skills table · README

## 0.5.4 — 2026-05-31

### Onboard — Codex option
- New X (Codex exec) option replaces C (Claude direct) as primary choice — Claude direct remains automatic fallback on failure
- `sherpa-onboard` + `sherpa-delegation` Onboarding section both updated: options now Q quick (Gemini) · D deep (Gemini) · X Codex · N skip

### Prompt Optimizer — Codex backend
- `optimizeWithCodex()` added to `sherpa-prompt-optimizer-ui.js` — spawns `codex exec`, strips ANSI codes
- `SHERPA_OPTIMIZER_BACKEND=codex` / `--backend codex` now valid
- `reoptimize` endpoint uses `optimize()` dispatch instead of hardcoded `runGeminiAsync` — Haiku/Codex now re-optimize correctly

### New skill: sherpa-optimize-mode
- `/sherpa:optimize-mode on [backend]` — writes `~/.sherpa-optimize-mode` flag file with backend choice
- `/sherpa:optimize-mode off` — deletes flag file, deactivates
- Backend choices: Gemini (free default) · Haiku (Claude-aligned) · Codex (code-focused)
- `sherpa-optimizer.js` hook reads flag: if active, injects mandatory system-reminder to invoke optimizer before every prompt
- Deactivation commands automatically skipped by hook (no optimize-loop on control prompts)

## 0.5.3 — 2026-05-17

### sherpa-brainstorm — Fix CLI invocation
- `[G]` and `[C]` now labeled `Bash tool ONLY` — prevents Claude from spawning fake-identity subagents instead of running real CLIs
- Added `TOOL RULE` hard stop: NEVER Agent tool, NEVER impersonate Gemini/Codex as subagent
- GC branch: both Bash calls now explicitly run in parallel
- Fix: `[C]` definition was missing `Bash:` prefix (matched `[G]` style)

### New skill: sherpa-git-haiku
- Git operations (commit msg, diff summary, branch name, status summary) routed to Haiku model
- Trigger: `/sherpa:git-haiku [task]`
- Spawns `Agent(model="haiku")` — Sonnet forbidden from generating the artifact directly
- Listed in sherpa-help skills table

### Tests
- Added `runSkillTest` helper to `tests/hook-golden-io.js`
- 8 new skill validation tests (brainstorm enforcement + git-haiku structure)
- Total: 25 tests, all passing

## 0.5.2 — 2026-05-13

### Prompt Optimizer
- MODEL_CHAIN reordered Flash-Lite → Flash → Pro (fastest first, free tier first)
- Real-time stderr monitoring: kill on `MODEL_CAPACITY_EXHAUSTED` / `No capacity available` → instant model fallback (no 45s hang)
- UI model selector: Flash Lite (default) · Flash · Pro pill buttons — user picks quality level
- Re-optimize uses active (blue-bordered) card content, not always original
- Button label updates dynamically: "Re-optimize Original" / "Re-optimize Optimized"
- Stderr logged on non-quota failure for debuggability

### Skill Protocol — Hard Stops
- `sherpa-onboard`, `sherpa-brainstorm`, `sherpa-delegation`: replaced soft `> Sherpa:` display hints with `HARD STOP: Call AskUserQuestion` — model cannot skip or simulate
- `[P]` redefined as `AskUserQuestion` call before any Gemini/Codex delegation
- `[G]`/`[C]` definitions inlined in `sherpa-onboard` and `sherpa-brainstorm` skill files
- Explicit C (Claude direct) and N (abort) branches added to onboard + brainstorm

### Docs
- README: optimizer mode (beta) + commands table entry
- sherpa-help skill: optimizer entry updated with beta label, Gemini note, model picker
- CLAUDE.md: stale `sherpa-session-log.ps1` reference fixed; optimizer hooks + skill added to File Roles

---

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
