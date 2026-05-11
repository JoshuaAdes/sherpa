// SessionStart hook — checks required tools once per machine, then stamps a flag file to skip future runs.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const flagFile = path.join(os.homedir(), '.sherpa-health-ok');

function available(cmd) {
  try { execSync(cmd + ' --version', { stdio: 'ignore' }); return true; }
  catch { return false; }
}

// Always verify vendor rg copy — survives gemini-cli updates that wipe bundle/vendor/ripgrep/
// Runs even when flag file exists so CLI updates don't silently break file search
function ensureVendorRg() {
  if (!available('rg')) return false;
  try {
    const { execFileSync } = require('child_process');
    const rgSrc = process.platform === 'win32'
      ? execFileSync('where', ['rg'], { encoding: 'utf8' }).split('\n')[0].trim()
      : execFileSync('which', ['rg'], { encoding: 'utf8' }).trim();

    const geminiMain = process.platform === 'win32'
      ? execFileSync('where', ['gemini'], { encoding: 'utf8' }).split('\n')[0].trim()
      : execFileSync('which', ['gemini'], { encoding: 'utf8' }).trim();
    // Windows: bin=npm\gemini → package=npm\node_modules\...
    // macOS/Linux: bin=.../bin/gemini → package=.../lib/node_modules\... or ../node_modules/...
    const binDir = path.dirname(geminiMain);
    const candidates = [
      path.resolve(binDir, 'node_modules', '@google', 'gemini-cli'),
      path.resolve(binDir, '..', 'lib', 'node_modules', '@google', 'gemini-cli'),
      path.resolve(binDir, '..', 'node_modules', '@google', 'gemini-cli'),
    ];
    const geminiRoot = candidates.find(p => fs.existsSync(path.join(p, 'package.json')));
    if (!geminiRoot) return false;
    const arch = process.arch === 'x64' ? 'x64' : process.arch;
    const binName = `rg-${process.platform}-${arch}${process.platform === 'win32' ? '.exe' : ''}`;
    const vendorDir = path.join(geminiRoot, 'bundle', 'vendor', 'ripgrep');
    const rgDest = path.join(vendorDir, binName);

    if (!fs.existsSync(rgDest)) {
      fs.mkdirSync(vendorDir, { recursive: true });
      fs.copyFileSync(rgSrc, rgDest);
    }
    return true;
  } catch (_) { return false; }
}

ensureVendorRg();

// Skip remaining checks if already passed — avoids re-running on every session
if (fs.existsSync(flagFile)) process.exit(0);

const missing = [];

if (!available('rg')) {
  const install = process.platform === 'win32'
    ? 'winget install BurntSushi.ripgrep.MSVC'
    : process.platform === 'darwin'
    ? 'brew install ripgrep'
    : 'sudo apt install ripgrep';
  missing.push('ripgrep (rg): required for Gemini file search. Install: ' + install);
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
