// PostToolUse hook — receives tool event JSON via stdin, appends one line to .sherpa/session.log
const fs = require('fs');
const path = require('path');

async function main() {
  let input = '';
  try {
    // stdin is a stream; must drain fully before parsing
    for await (const chunk of process.stdin) {
      input += chunk;
    }
    if (!input) return;
    const data = JSON.parse(input);

    const tool = data.tool_name;
    // Read/other tools don't mutate state — nothing useful to log
    if (!['Edit', 'Write', 'Bash'].includes(tool)) return;

    const toolInput = data.tool_input || {};
    let detail = '';
    if (tool === 'Edit' || tool === 'Write') {
      detail = toolInput.file_path || '';
    } else if (tool === 'Bash') {
      // Truncate at 80 chars — log is for resumption context, not full audit; start of command is enough
      detail = (toolInput.command || '').replace(/\r\n|\n|\r/g, ' ').substring(0, 80);
    }

    const sherpaDir = path.join(process.cwd(), '.sherpa');
    if (!fs.existsSync(sherpaDir)) {
      fs.mkdirSync(sherpaDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    const logLine = `${timestamp} ${tool} ${detail}\n`;
    fs.appendFileSync(path.join(sherpaDir, 'session.log'), logLine);
  } catch (err) {
    // Hook failure must never interrupt the main Claude workflow
  }
}

main();
