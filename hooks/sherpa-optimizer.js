// UserPromptSubmit hook — soft-suggests optimizer for long prompts; mandatory in optimize-mode.
// Optimize mode: flag file ~/.sherpa-optimize-mode contains {"backend":"gemini"|"haiku"|"codex"}
const fs = require('fs');
const os = require('os');
const path = require('path');

const OPTIMIZE_MODE_FLAG = path.join(os.homedir(), '.sherpa-optimize-mode');

async function main() {
  let input = '';
  try {
    for await (const chunk of process.stdin) {
      input += chunk;
    }
    if (!input) return;
    const data = JSON.parse(input);
    const prompt = data.prompt;
    if (!prompt) return;

    // Skip all optimize-mode control commands — never optimize meta-control prompts
    if (/sherpa.*optimize.?mode/i.test(prompt) ||
        /optimize.?mode\s*(on|off|disable|stop|deactivat)/i.test(prompt)) {
      return;
    }

    // Check optimize mode flag
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

    // Soft suggest for long prompts (200 chars ≈ ~50 tokens)
    if (prompt.length <= 200) return;
    process.stdout.write("Sherpa: long prompt detected — run /sherpa:prompt-optimizer to refine.\n");
  } catch (err) {
    // Hook failure must never interrupt the main Claude workflow
  }
}

main();
