// UserPromptSubmit hook — three modes:
// 1. /sherpa:prompt-optimizer [--backend X] [prompt] → emits bare node command; Claude runs it (blocking)
// 2. optimize-mode active → mandatory reminder
// 3. Long prompt → soft-suggest
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const OPTIMIZE_MODE_FLAG = path.join(os.homedir(), '.sherpa-optimize-mode');

async function main() {
  let input = '';
  try {
    for await (const chunk of process.stdin) { input += chunk; }
    if (!input) return;
    const data = JSON.parse(input);
    const prompt = data.prompt;
    if (!prompt && prompt !== '') return;

    // Skip optimize-mode control commands
    if (/sherpa.*optimize.?mode/i.test(prompt) ||
        /optimize.?mode\s*(on|off|disable|stop|deactivat)/i.test(prompt)) {
      return;
    }

    // ── /sherpa:prompt-optimizer — emit absolute-path node command, Claude runs it (blocking) ──
    const SKILL_RE = /^\/sherpa:(?:sherpa-)?prompt-optimizer\b/i;
    if (SKILL_RE.test(prompt)) {
      let remaining = prompt.replace(SKILL_RE, '').trim();
      let triggerBackend = null;
      const backendMatch = remaining.match(/^--backend\s+(\S+)\s*/i);
      if (backendMatch) { triggerBackend = backendMatch[1]; remaining = remaining.slice(backendMatch[0].length).trim(); }
      if (!triggerBackend) {
        try {
          const modeRaw = fs.readFileSync(OPTIMIZE_MODE_FLAG, 'utf8').trim();
          const mode = JSON.parse(modeRaw);
          if (mode && mode.backend) triggerBackend = mode.backend;
        } catch (_) {}
      }
      let pluginRoot = '';
      try { pluginRoot = fs.readFileSync(path.join(os.homedir(), '.sherpa-plugin-root'), 'utf8').trim(); } catch (_) {}
      const scriptPath = pluginRoot
        ? path.join(pluginRoot, 'hooks', 'sherpa-prompt-optimizer-ui.js')
        : path.join(__dirname, 'sherpa-prompt-optimizer-ui.js');
      const backendFlag = triggerBackend ? ` --backend ${triggerBackend}` : '';
      const promptArg  = remaining ? ` "${remaining.replace(/"/g, '\\"')}"` : '';
      process.stdout.write(`node "${scriptPath}"${promptArg}${backendFlag}`);
      return;
    }

    // ── optimize-mode active — mandatory reminder ──────────────────────────────
    let optimizeMode = null;
    try {
      const raw = fs.readFileSync(OPTIMIZE_MODE_FLAG, 'utf8').trim();
      optimizeMode = JSON.parse(raw);
    } catch (_) {}

    if (optimizeMode && optimizeMode.backend) {
      const backend = optimizeMode.backend;
      process.stdout.write(`OPT-MODE(${backend}): run /sherpa:prompt-optimizer --backend ${backend} before this task.`);
      return;
    }

    // ── soft suggest for long prompts ──────────────────────────────────────────
    if (prompt.length <= 200) return;
    process.stdout.write("Sherpa: long prompt detected — run /sherpa:prompt-optimizer to refine.\n");
  } catch (err) {
    // Hook failure must never interrupt the main Claude workflow
  }
}

main();
