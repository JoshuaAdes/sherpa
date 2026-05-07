const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

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
}

if (!available('gemini')) {
  missing.push('gemini CLI: required for Sherpa delegation. Install: npm install -g @google/gemini-cli');
}

if (missing.length === 0) {
  fs.writeFileSync(flagFile, '');
  process.exit(0);
}

console.log('Sherpa health check: missing tools detected.');
missing.forEach(item => console.log('  - ' + item));
console.log('Ask user to install missing tools and run the install commands above if they confirm.');
