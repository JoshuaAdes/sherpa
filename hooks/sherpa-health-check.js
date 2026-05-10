// SessionStart hook — checks required tools once per machine, then stamps a flag file to skip future runs.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Skip check if already passed on this machine — avoids re-running on every session
const flagFile = path.join(os.homedir(), '.sherpa-health-ok');
if (fs.existsSync(flagFile)) process.exit(0);

function available(cmd) {
  try { execSync(cmd + ' --version', { stdio: 'ignore' }); return true; }
  catch { return false; }
}

const missing = [];

if (!available('rg')) {
  const install = process.platform === 'win32'
    ? 'winget install BurntSushi.ripgrep.MSVC'
    : process.platform === 'darwin'
    ? 'brew install ripgrep'
    : 'sudo apt install ripgrep';
  missing.push('ripgrep (rg): required for Gemini file search. Install: ' + install);
} else {
  // Gemini CLI ignores system PATH — looks for rg-{platform}-{arch}[.exe] in its own
  // bundle/vendor/ripgrep/ dir. Must copy there or Gemini falls back to slower GrepTool.
  try {
    const { execFileSync } = require('child_process');
    const rgSrc = process.platform === 'win32'
      ? execFileSync('where', ['rg'], { encoding: 'utf8' }).split('\n')[0].trim()
      : execFileSync('which', ['rg'], { encoding: 'utf8' }).trim();

    // Resolve Gemini CLI install root via its own binary location
    const geminiMain = process.platform === 'win32'
      ? execFileSync('where', ['gemini'], { encoding: 'utf8' }).split('\n')[0].trim()
      : execFileSync('which', ['gemini'], { encoding: 'utf8' }).trim();
    const geminiRoot = path.resolve(path.dirname(geminiMain), '..', 'node_modules', '@google', 'gemini-cli');
    const arch = process.arch === 'x64' ? 'x64' : process.arch;
    const binName = `rg-${process.platform}-${arch}${process.platform === 'win32' ? '.exe' : ''}`;
    const vendorDir = path.join(geminiRoot, 'bundle', 'vendor', 'ripgrep');
    const rgDest = path.join(vendorDir, binName);

    if (!fs.existsSync(rgDest)) {
      fs.mkdirSync(vendorDir, { recursive: true });
      fs.copyFileSync(rgSrc, rgDest);
    }
  } catch (_) { /* non-fatal — Gemini falls back to GrepTool */ }
}

if (!available('gemini')) {
  missing.push('gemini CLI: required for Sherpa delegation. Install: npm install -g @google/gemini-cli');
}

if (available('gemini') && !process.env.GEMINI_CLI_TRUST_WORKSPACE) {
  missing.push('GEMINI_CLI_TRUST_WORKSPACE not set. Add to Claude Code settings.json: "env": { "GEMINI_CLI_TRUST_WORKSPACE": "true" }');
}

// Written unconditionally — skills need it to locate hook scripts regardless of health status.
// __dirname = hooks/, dirname(__dirname) = plugin root
fs.writeFileSync(path.join(os.homedir(), '.sherpa-plugin-root'), path.dirname(__dirname));

if (missing.length === 0) {
  fs.writeFileSync(flagFile, '');
  process.exit(0);
}

console.log('Sherpa health check: missing tools detected.');
missing.forEach(item => console.log('  - ' + item));
console.log('Ask user to install missing tools and run the install commands above if they confirm.');
