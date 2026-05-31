// UserPromptSubmit hook — three modes:
// 1. /sherpa:prompt-optimizer or !!opt [--backend X] [prompt] → launches optimizer directly, no skill overhead
// 2. Long prompt / optimize-mode active → soft-suggest or mandatory reminder
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const OPTIMIZE_MODE_FLAG = path.join(os.homedir(), '.sherpa-optimize-mode');
const PLUGIN_ROOT_FLAG   = path.join(os.homedir(), '.sherpa-plugin-root');
const OPTIMIZER_FILENAME = 'sherpa-prompt-optimizer-ui.js';

function getOptimizerPath() {
  try {
    const root = fs.readFileSync(PLUGIN_ROOT_FLAG, 'utf8').trim();
    const p = path.join(root, 'hooks', OPTIMIZER_FILENAME);
    if (fs.existsSync(p)) return p;
  } catch (_) {}
  return path.join(__dirname, OPTIMIZER_FILENAME);
}

async function runOptimizer(promptText, backend) {
  return new Promise((resolve) => {
    const nodeArgs = [getOptimizerPath()];
    if (promptText) nodeArgs.push(promptText);
    if (backend)    { nodeArgs.push('--backend'); nodeArgs.push(backend); }
    const child = spawn(process.execPath, nodeArgs, {
      stdio: ['ignore', 'pipe', 'inherit'] // stdin:ignored, stdout:captured, stderr:shown in terminal
    });
    let stdout = '';
    child.stdout.on('data', d => { stdout += d; });
    child.on('error', () => resolve(null));
    child.on('close', () => {
      try { resolve(JSON.parse(stdout.trim())); }
      catch (_) { resolve(null); }
    });
  });
}

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

    // ── /sherpa:prompt-optimizer or !!opt — run optimizer directly, no skill overhead ──
    const SKILL_RE = /^\/sherpa:(?:sherpa-)?prompt-optimizer\b/i;
    if (SKILL_RE.test(prompt) || /^!!opt\b/i.test(prompt)) {
      let remaining = prompt.replace(SKILL_RE, '').replace(/^!!opt\s*/i, '').trim();
      let triggerBackend = null;
      const backendMatch = remaining.match(/^--backend\s+(\S+)\s*/i);
      if (backendMatch) { triggerBackend = backendMatch[1]; remaining = remaining.slice(backendMatch[0].length).trim(); }

      // Fall back to optimize-mode backend if no explicit flag
      if (!triggerBackend) {
        try {
          const modeRaw = fs.readFileSync(OPTIMIZE_MODE_FLAG, 'utf8').trim();
          const mode = JSON.parse(modeRaw);
          if (mode && mode.backend) triggerBackend = mode.backend;
        } catch (_) {}
      }

      const result = await runOptimizer(remaining, triggerBackend);
      if (result && result.status === 'submit' && result.text) {
        process.stdout.write('Sherpa: prompt optimized in browser. Execute:\n\n' + result.text);
      } else if (result && result.status === 'cancel') {
        process.stdout.write('Sherpa: optimizer cancelled — prompt not submitted.');
      } else if (!result) {
        process.stdout.write('Sherpa: optimizer failed to launch.');
      }
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
      process.stdout.write(
        `SHERPA OPTIMIZE MODE ACTIVE (backend: ${backend}): ` +
        `You MUST invoke /sherpa:prompt-optimizer with --backend ${backend} on this prompt BEFORE executing the task. ` +
        `Do not proceed with the task until the user submits or cancels the optimizer. ` +
        `Deactivate: /sherpa:optimize-mode off`
      );
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
