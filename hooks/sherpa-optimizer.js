// UserPromptSubmit hook — nudges user toward /sherpa:prompt-optimizer for long prompts.
// Zero Gemini calls, zero extra Claude tokens — just a length check.
const fs = require('fs');

async function main() {
  let input = '';
  try {
    for await (const chunk of process.stdin) {
      input += chunk;
    }
    if (!input) return;
    const data = JSON.parse(input);

    const prompt = data.prompt;
    // 200 chars ≈ ~50 tokens — short enough to be fine as-is, long enough to benefit from optimization
    if (!prompt || prompt.length <= 200) return;

    // stdout output becomes a system-reminder injected into Claude's context
    process.stdout.write("Sherpa: long prompt detected — run /sherpa:prompt-optimizer to refine.\n");
  } catch (err) {
    // Hook failure must never interrupt the main Claude workflow
  }
}

main();
