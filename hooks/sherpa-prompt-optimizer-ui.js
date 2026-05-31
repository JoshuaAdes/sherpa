'use strict';
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const crypto = require('crypto');

// ── args ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
let backendArg = null;
const promptParts = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--backend' && args[i + 1]) { backendArg = args[++i]; }
  else { promptParts.push(args[i]); }
}
let originalPrompt = promptParts.join(' ');
const rawBackend = backendArg || process.env.SHERPA_OPTIMIZER_BACKEND || 'gemini';
// Normalize legacy single-model backend names to 'claude'
const LEGACY_TO_CLAUDE = { haiku: 'claude', sonnet: 'claude', opus: 'claude' };
const LEGACY_MODEL_KEY  = { haiku: 'lite',  sonnet: 'flash',  opus: 'pro'   };
const backend = LEGACY_TO_CLAUDE[rawBackend] || rawBackend;
const initialModelKey = LEGACY_MODEL_KEY[rawBackend] || 'lite';

// ── helpers ───────────────────────────────────────────────────────────────────
const toStderr = msg => process.stderr.write(msg + '\n');

async function readStdin() {
  if (process.stdin.isTTY) return '';
  let data = '';
  for await (const chunk of process.stdin) { data += chunk; }
  return data.trim();
}

function openBrowser(url) {
  toStderr('Sherpa optimizer: ' + url);
  if (process.env.SHERPA_NO_BROWSER) return;
  if (process.platform === 'linux' && !process.env.DISPLAY) {
    toStderr('No DISPLAY — open manually: ' + url);
    return;
  }
  let cmd, cmdArgs;
  if (process.platform === 'win32') { cmd = 'cmd'; cmdArgs = ['/c', 'start', '""', url]; }
  else if (process.platform === 'darwin') { cmd = 'open'; cmdArgs = [url]; }
  else { cmd = 'xdg-open'; cmdArgs = [url]; }
  try {
    const child = require('child_process').spawn(cmd, cmdArgs, {
      detached: true, stdio: 'ignore', shell: process.platform === 'win32'
    });
    child.unref();
  } catch (e) { toStderr('Could not open browser: ' + e.message); }
}

// ── backends ──────────────────────────────────────────────────────────────────
const MODEL_CHAIN = ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-pro'];
const MODEL_KEY_MAP = { lite: 0, flash: 1, pro: 2 };
const CLAUDE_MODEL_IDS = {
  lite:  'claude-haiku-4-5-20251001',
  flash: 'claude-sonnet-4-6',
  pro:   'claude-opus-4-7'
};

let activeChild = null;
let pendingDone = null; // force-resolve hook — stop handler calls this immediately after kill
let lastOptError = '';

function runGeminiAsync(prompt, modelIndex = 0) {
  return new Promise((resolve) => {
    const model = MODEL_CHAIN[modelIndex];
    const instruction =
      'Optimize this Claude Code prompt. Goals: remove ambiguity, improve specificity, ' +
      'reduce tokens, preserve full intent. Return optimized prompt only — no explanation, no preamble. PROMPT: ';
    const fullPrompt = (instruction + prompt).replace(/\n/g, ' ');
    const cmd = `gemini -y --model ${model} -p ` + JSON.stringify(fullPrompt);

    const child = spawn(cmd, [], {
      shell: true,
      env: { ...process.env, GEMINI_CLI_TRUST_WORKSPACE: 'true' }
    });
    activeChild = child;

    let stdout = '';
    let stderr = '';
    let capacityKilled = false;

    const isCapacityErr = s =>
      s.includes('MODEL_CAPACITY_EXHAUSTED') || s.includes('No capacity available') ||
      s.includes('QUOTA_EXHAUSTED') || s.includes('TerminalQuotaError') ||
      s.includes('exhausted your capacity');

    let resolved = false;
    function earlyResolve(val) {
      if (!resolved) { resolved = true; if (activeChild === child) activeChild = null; pendingDone = null; resolve(val); }
    }
    pendingDone = () => earlyResolve(null);

    child.stdout.on('data', d => { stdout += d; });
    child.stderr.on('data', d => {
      stderr += d;
      if (!capacityKilled && isCapacityErr(stderr)) {
        capacityKilled = true;
        killChild(child);
        if (modelIndex >= MODEL_CHAIN.length - 1) {
          // Last model exhausted — resolve immediately, don't wait for process death
          lastOptError = 'All Gemini models capacity exhausted (free tier daily limit). Try Claude or Codex backend.';
          toStderr('Sherpa: all Gemini models exhausted');
          earlyResolve(null);
        }
      }
    });

    const timer = setTimeout(() => { killChild(child); earlyResolve(null); }, 45000);

    child.on('close', async (code) => {
      clearTimeout(timer);
      if (activeChild === child) activeChild = null;
      if (resolved) return;
      if ((capacityKilled || isCapacityErr(stderr)) && modelIndex < MODEL_CHAIN.length - 1) {
        toStderr(`Sherpa: ${model} capacity exhausted — falling back to ${MODEL_CHAIN[modelIndex + 1]}`);
        resolve(await runGeminiAsync(prompt, modelIndex + 1));
        return;
      }
      if (code !== 0 || !stdout.trim()) {
        if (stderr.trim()) toStderr(`Sherpa: ${model} stderr: ${stderr.trim().slice(0, 300)}`);
        resolve(null); return;
      }
      resolve(stdout.trim());
    });
  });
}

function killChild(child) {
  if (!child) return;
  try { child.kill(); } catch (_) {}
  if (process.platform === 'win32') {
    try {
      spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
    } catch (_) {}
  }
}

function optimizeWithClaude(prompt, model) {
  return new Promise((resolve) => {
    const instruction =
      'Optimize this Claude Code prompt. Goals: remove ambiguity, improve specificity, ' +
      'reduce tokens, preserve full intent. Return optimized prompt only — no explanation, no preamble. PROMPT: ';
    const fullPrompt = (instruction + prompt).replace(/\n/g, ' ');
    const nullDev = process.platform === 'win32' ? 'NUL' : '/dev/null';
    const cmd = `claude --model ${model} -p ` + JSON.stringify(fullPrompt) + ` < ${nullDev}`;
    const child = spawn(cmd, [], {
      shell: true,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    activeChild = child;

    let stdout = '';
    let stderr = '';
    let resolved = false;
    function done(val) {
      if (resolved) return; resolved = true;
      if (activeChild === child) activeChild = null;
      pendingDone = null;
      resolve(val);
    }
    pendingDone = done;

    const timer = setTimeout(() => {
      killChild(child);
      lastOptError = `${model} timeout (30s)`;
      toStderr(`Sherpa: ${model} timeout`);
      done(null);
    }, 30000);

    child.stdout.on('data', d => { stdout += d; });
    child.stderr.on('data', d => { stderr += d; });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (resolved) return;
      if (code !== 0 || !stdout.trim()) {
        const errMsg = stderr.trim().replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').trim().slice(0, 400);
        if (errMsg) { toStderr(`Sherpa: ${model} stderr: ${errMsg}`); lastOptError = errMsg; }
        done(null); return;
      }
      lastOptError = '';
      const clean = stdout.trim().replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').trim();
      done(clean || null);
    });
  });
}

let CODEX_MODEL_IDS = { lite: 'gpt-5.4-mini', flash: 'gpt-5.5' };
const CODEX_FALLBACK_MODELS = ['gpt-5.4-mini', 'gpt-5.5'];

function optimizeWithCodex(prompt, modelKey) {
  const modelId = CODEX_MODEL_IDS[modelKey];
  const fileName = 'sherpa-opt-' + Date.now() + '.txt';
  const tmpFile = path.join(process.cwd(), fileName);
  return new Promise((resolve) => {
    const instruction =
      'Optimize this Claude Code prompt for clarity, specificity, and brevity. ' +
      'Output ONLY the optimized prompt — no explanation, no preamble. ' +
      'Either print it to stdout OR write it to the file "' + fileName + '" in the current directory. ' +
      'PROMPT: ' + prompt;
    const modelFlag = modelId ? '-m ' + modelId + ' ' : '';
    const cmd = 'codex exec ' + modelFlag + JSON.stringify(instruction);
    const child = spawn(cmd, [], {
      shell: true,
      env: sanitizeEnv(),
      stdio: ['ignore', 'pipe', 'pipe']
    });
    activeChild = child;

    let stdout = '';
    let stderr = '';
    let resolved = false;
    function done(val) {
      if (resolved) return; resolved = true;
      if (activeChild === child) activeChild = null;
      pendingDone = null;
      resolve(val);
    }
    pendingDone = done;

    child.on('error', err => {
      lastOptError = 'Codex not found: ' + err.message;
      toStderr('Sherpa: ' + lastOptError);
      done(null);
    });

    const timer = setTimeout(() => {
      killChild(child);
      lastOptError = 'Codex timeout (60s)';
      toStderr('Sherpa: Codex timeout');
      done(null);
    }, 60000);

    child.stdout.on('data', d => { stdout += d; });
    child.stderr.on('data', d => { stderr += d; });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (resolved) return;
      const stdoutResult = stdout.trim().replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').trim();
      let fileResult = '';
      try {
        fileResult = fs.readFileSync(tmpFile, 'utf8').trim();
        try { fs.unlinkSync(tmpFile); } catch (_) {}
      } catch (_) {}
      const result = fileResult || stdoutResult;
      if (result) { lastOptError = ''; done(result); return; }
      // Strip banner (everything up to and including second '--------') to show actual error
      const rawErr = stderr.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
      const sep = '--------';
      const i2 = rawErr.indexOf(sep, rawErr.indexOf(sep) + 1);
      const errFull = (i2 !== -1 ? rawErr.slice(i2 + sep.length) : rawErr).trim();
      toStderr('Sherpa: Codex full stderr:\n' + errFull); // log full output for debugging
      const errBody = errFull.length > 300 ? '...' + errFull.slice(-300) : errFull;
      lastOptError = 'Codex: no output (exit ' + code + ')' + (errBody ? ' — ' + errBody : '');
      toStderr('Sherpa: ' + lastOptError);
      done(null);
    });
  });
}

function optimize(prompt) {
  if (backend === 'claude') return optimizeWithClaude(prompt, CLAUDE_MODEL_IDS[initialModelKey] || 'claude-sonnet-4-6');
  if (backend === 'codex')  return optimizeWithCodex(prompt, initialModelKey);
  return runGeminiAsync(prompt);
}

// ── codex model discovery ─────────────────────────────────────────────────────
const CODEX_CANDIDATES = ['gpt-5.4-mini', 'gpt-5.5', 'gpt-5.5-codex', 'gpt-5-codex', 'gpt-5'];
const MODEL_ID_RE = /^[a-z0-9.\-]+$/i;
const SHERPA_DIR = path.join(os.homedir(), '.sherpa');
const CODEX_CACHE_FILE = path.join(SHERPA_DIR, 'codex-models.json');
const CACHE_TTL_POS = 24 * 3600 * 1000; // 24h

function sanitizeEnv() {
  const keep = ['PATH','HOME','USER','SHELL','TMPDIR','TEMP','TMP',
                 'USERPROFILE','APPDATA','LOCALAPPDATA','SYSTEMROOT','WINDIR',
                 'USERNAME','COMPUTERNAME','SYSTEMDRIVE'];
  const env = {};
  for (const k of keep) { if (process.env[k] != null) env[k] = process.env[k]; }
  return env;
}

function getCodexVersion() {
  try {
    const r = spawnSync('codex', ['--version'], { shell: false, encoding: 'utf8', timeout: 5000 });
    return r.stdout ? r.stdout.trim().split('\n')[0].trim() : null;
  } catch (_) { return null; }
}

function loadCodexModelsCache() {
  try {
    const data = JSON.parse(fs.readFileSync(CODEX_CACHE_FILE, 'utf8'));
    if (!data || data.v !== 1 || !Array.isArray(data.models) || typeof data.detectedAt !== 'number') return { models: null, valid: false };
    const models = data.models.filter(m => typeof m === 'string' && MODEL_ID_RE.test(m));
    if (!models.length) return { models: null, valid: false };
    const ver = getCodexVersion();
    if (data.codexVersion && ver && data.codexVersion !== ver) return { models, valid: false };
    const age = Date.now() - data.detectedAt;
    const ttl = typeof data.ttl === 'number' ? data.ttl : CACHE_TTL_POS;
    return { models, valid: age < ttl };
  } catch (_) { return { models: null, valid: false }; }
}

function saveCodexModelsCache(models, version) {
  if (!models || !models.length) return;
  try {
    fs.mkdirSync(SHERPA_DIR, { recursive: true });
    const tmp = path.join(SHERPA_DIR, 'codex-models.' + process.pid + '.' + crypto.randomBytes(4).toString('hex') + '.tmp');
    fs.writeFileSync(tmp, JSON.stringify({ v: 1, codexVersion: version || '', detectedAt: Date.now(), ttl: CACHE_TTL_POS, models }), 'utf8');
    fs.renameSync(tmp, CODEX_CACHE_FILE);
  } catch (e) { toStderr('Sherpa: cache write failed: ' + e.message); }
}

async function detectCodexModels(onStatus) {
  const found = [];
  const version = getCodexVersion();
  const sEnv = sanitizeEnv();
  let authFailed = false;

  for (const modelId of CODEX_CANDIDATES) {
    if (authFailed) break;
    if (onStatus) onStatus(modelId, 'probing');
    const result = await new Promise(res => {
      let stdout = '', stderr = '', ssz = 0, esz = 0;
      // MODEL_ID_RE-validated modelId from hardcoded list — safe to interpolate in shell cmd
      const probeCmd = 'codex exec -m ' + modelId + ' x';
      const child = spawn(probeCmd, [], {
        shell: true, env: sEnv, stdio: ['ignore','pipe','pipe']
      });
      child.on('error', () => { clearTimeout(timer); res('transient_error'); });
      const timer = setTimeout(() => { killChild(child); res('transient_error'); }, 15000);
      child.stdout.on('data', d => { if ((ssz += d.length) < 65536) stdout += d; });
      child.stderr.on('data', d => {
        if ((esz += d.length) < 65536) stderr += d;
        if (stderr.includes('not supported when using Codex')) killChild(child);
        else if (/\b(401|403|login required)\b/i.test(stderr)) { authFailed = true; killChild(child); }
      });
      child.on('close', code => {
        clearTimeout(timer);
        const err = stderr.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
        if (err.includes('not supported when using Codex')) { res('rejected'); return; }
        if (authFailed || /\b(401|403|login required)\b/i.test(err)) { res('auth_error'); return; }
        if (code === 0 && stdout.trim()) { res('usable'); return; }
        res('transient_error');
      });
    });
    if (onStatus) onStatus(modelId, result);
    if (result === 'usable') found.push(modelId);
    if (result === 'auth_error') break;
    await new Promise(r => setTimeout(r, 300));
  }

  if (found.length) saveCodexModelsCache(found, version);
  return found.length ? found : null;
}

// ── HTML ──────────────────────────────────────────────────────────────────────
function buildHTML(nonce, origPrompt, backendName, initialMK, cachedCodexModels) {
  const escaped = (origPrompt || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const json = JSON.stringify(origPrompt || '');
  const isGemini = backendName === 'gemini' || !backendName;
  const isClaude = backendName === 'claude';
  const isCodex  = backendName === 'codex';
  const mk = initialMK || 'lite';
  const backendLabel = JSON.stringify((backendName || 'gemini').charAt(0).toUpperCase() + (backendName || 'gemini').slice(1));
  const codexL0 = (cachedCodexModels && cachedCodexModels[0]) || CODEX_FALLBACK_MODELS[0];
  const codexL1 = (cachedCodexModels && cachedCodexModels[1]) || CODEX_FALLBACK_MODELS[1];
  const codexAlreadyDetected = isCodex && !!cachedCodexModels;
  const LABELS_MAP = { gemini: ['Flash Lite','Flash','Pro'], claude: ['Haiku','Sonnet','Opus'], codex: [codexL0, codexL1, ''] };
  const modelLabels = LABELS_MAP[backendName] || LABELS_MAP.gemini;
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8">
<title>⚡ Sherpa — Prompt Optimizer</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,sans-serif;max-width:820px;margin:32px auto;padding:0 24px;color:#1a1a1a}
h2{font-size:20px;color:#b45309;margin-bottom:4px;text-align:center}
.sub{color:#666;font-size:13px;margin-bottom:20px;text-align:center}
.cards{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px}
.card{border:2px solid #e5e7eb;border-radius:8px;padding:14px;cursor:pointer;transition:border-color 0.15s,box-shadow 0.15s;min-height:140px}
.card:hover{border-color:#d1d5db}
.card.selected{border-color:#2563eb;box-shadow:0 0 0 3px #bfdbfe}
.card.orig.selected{border-color:#6366f1;box-shadow:0 0 0 3px #c7d2fe}
.card-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#9ca3af;margin-bottom:8px}
.card.selected .card-label{color:#2563eb}
.card.orig.selected .card-label{color:#6366f1}
.card-ta{width:100%;min-height:80px;font-size:13px;line-height:1.6;color:#374151;border:none;background:transparent;resize:none;outline:none;font-family:inherit;cursor:pointer;padding:0;pointer-events:none;white-space:pre-wrap;word-break:break-word;display:block}
.card.active .card-ta{cursor:text;pointer-events:all;resize:vertical}
.opt-inner{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px 0;gap:8px}
.spinner{width:28px;height:28px;border:3px solid #e5e7eb;border-top-color:#f59e0b;border-radius:50%;animation:spin 0.8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.opt-msg{color:#9ca3af;font-size:13px}
.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
button{padding:8px 20px;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;transition:background 0.1s}
.btn-orig{background:#6366f1;color:#fff}.btn-orig:hover{background:#4f46e5}
.btn-opt{background:#2563eb;color:#fff}.btn-opt:hover{background:#1d4ed8}
.btn-opt:disabled{background:#bfdbfe;color:#93c5fd;cursor:not-allowed}
.btn-stop{background:#ef4444;color:#fff}.btn-stop:hover{background:#dc2626}
.btn-stop:disabled{background:#fca5a5;cursor:not-allowed}
.btn-reopt{background:#f59e0b;color:#fff}.btn-reopt:hover{background:#d97706}
.btn-reopt:disabled{background:#fde68a;color:#92400e;cursor:not-allowed}
.btn-cancel{background:#f3f4f6;color:#374151;margin-left:auto}.btn-cancel:hover{background:#e5e7eb}
.status{font-size:12px;color:#6b7280}
.warn{color:#b45309;background:#fef3c7;border:1px solid #fde68a;padding:8px 12px;border-radius:6px;margin-bottom:12px;font-size:13px}
.model-row{display:flex;gap:6px;align-items:center;margin-bottom:10px}
.model-label{font-size:12px;color:#6b7280;font-weight:600;margin-right:2px}
.btn-model{padding:4px 12px;border:1px solid #d1d5db;border-radius:12px;cursor:pointer;font-size:11px;font-weight:600;background:#f9fafb;color:#374151;transition:all 0.1s}
.btn-model.active{background:#1a1a1a;color:#fff;border-color:#1a1a1a}
</style>
</head><body>
<h2>⚡ Sherpa — Prompt Optimizer</h2>
<div class="sub">Click a card to edit · Re-optimize anytime</div>

<div id="warn-box"></div>

<div class="cards">
  <div class="card orig selected active" id="card-orig" onclick="activateCard('orig')">
    <div class="card-label">Original</div>
    <textarea class="card-ta" id="text-orig" onclick="event.stopPropagation()">${escaped}</textarea>
  </div>
  <div class="card" id="card-opt" onclick="activateCard('opt')">
    <div class="card-label">✨ Optimized</div>
    <div id="opt-inner" class="opt-inner">
      <div class="spinner"></div>
      <div class="opt-msg">Optimizing…</div>
    </div>
    <textarea class="card-ta" id="text-opt" onclick="event.stopPropagation()" style="display:none"></textarea>
  </div>
</div>

<div class="model-row" id="backend-row">
  <span class="model-label">Backend:</span>
  <button class="btn-model${isGemini ? ' active' : ''}" id="backend-gemini" onclick="setBackend('gemini')">Gemini</button>
  <button class="btn-model${isClaude ? ' active' : ''}" id="backend-claude" onclick="setBackend('claude')">Claude</button>
  <button class="btn-model${isCodex ? ' active' : ''}" id="backend-codex" onclick="setBackend('codex')">Codex</button>
</div>
<div class="model-row" id="model-row">
  <span class="model-label">Model:</span>
  <button class="btn-model${mk === 'lite'  ? ' active' : ''}" id="model-lite"  onclick="setModel('lite')">${modelLabels[0]}</button>
  <button class="btn-model${mk === 'flash' ? ' active' : ''}" id="model-flash" onclick="setModel('flash')">${modelLabels[1]}</button>
  <button class="btn-model${mk === 'pro'   ? ' active' : ''}" id="model-pro"   onclick="setModel('pro')" style="${isCodex ? 'display:none' : ''}">${modelLabels[2]}</button>
</div>

<div class="row">
  <button class="btn-orig" onclick="submitOrig()">Use Original</button>
  <button class="btn-opt" id="btn-opt" onclick="submitOpt()" disabled>Use Optimized</button>
  <button class="btn-stop" id="btn-stop" onclick="stopOpt()">Stop</button>
  <button class="btn-reopt" id="btn-reopt" onclick="reoptimize()">Re-optimize</button>
  <span class="status" id="status"></span>
  <button class="btn-cancel" onclick="cancelPrompt()">Cancel</button>
</div>

<script>
const nonce = '${nonce}';
const origText = ${json};
const backendLabel = ${backendLabel};
let sel = 'orig';
let optimizing = true;
let phase = 'initial'; // 'initial' | 'reoptimizing'
let selectedModel = ${JSON.stringify(mk)};
let selectedBackend = backendLabel.toLowerCase();
let codexProbed = ${JSON.stringify(codexAlreadyDetected)};
let codexProbing = false;

const BACKEND_MODEL_LABELS = {
  gemini: ['Flash Lite', 'Flash', 'Pro'],
  claude: ['Haiku', 'Sonnet', 'Opus'],
  codex:  [${JSON.stringify(codexL0)}, ${JSON.stringify(codexL1)}, '']
};

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function startCodexProbe() {
  if (codexProbing || codexProbed) return;
  codexProbing = true;
  const lite = document.getElementById('model-lite');
  const flash = document.getElementById('model-flash');
  lite.textContent = 'Detecting…';
  lite.disabled = true;
  lite.classList.remove('active');
  flash.style.display = 'none';
  fetch('/probe-codex?n=' + nonce, { method: 'POST' }).catch(() => {});
}

function updateCodexModels(models) {
  codexProbing = false;
  codexProbed = true;
  const list = (models && models.length) ? models : ${JSON.stringify(CODEX_FALLBACK_MODELS)};
  const lite = document.getElementById('model-lite');
  const flash = document.getElementById('model-flash');
  lite.textContent = escHtml(list[0]);
  lite.disabled = false;
  if (list.length >= 2) {
    flash.textContent = escHtml(list[1]);
    flash.style.display = '';
  } else {
    flash.style.display = 'none';
  }
  if (selectedBackend === 'codex') setModel('lite');
}

function setBackend(b) {
  selectedBackend = b;
  ['gemini','claude','codex'].forEach(k => {
    document.getElementById('backend-' + k).classList.toggle('active', k === b);
  });
  const labels = BACKEND_MODEL_LABELS[b] || BACKEND_MODEL_LABELS.gemini;
  ['lite','flash','pro'].forEach((k, i) => {
    const btn = document.getElementById('model-' + k);
    btn.textContent = labels[i];
    btn.style.display = labels[i] === '' ? 'none' : '';
  });
  setModel('lite');
  if (b === 'codex') startCodexProbe();
}

function setModel(m) {
  selectedModel = m;
  ['lite','flash','pro'].forEach(k => {
    document.getElementById('model-' + k).classList.toggle('active', k === m);
  });
}

function updateReoptLabel() {
  const btn = document.getElementById('btn-reopt');
  if (!btn.disabled) {
    const label = sel === 'opt' && document.getElementById('text-opt').style.display !== 'none'
      ? 'Re-optimize Optimized' : 'Re-optimize Original';
    btn.textContent = label;
  }
}

const es = new EventSource('/events?n=' + nonce);
es.onmessage = e => {
  const d = JSON.parse(e.data);
  if (d.type === 'expired') { showExpired(); return; }
  if (d.type === 'codex-models') { updateCodexModels(d.models); return; }
  if (phase === 'initial') {
    if (d.type === 'ready') showResult(d.optimized, d.error, d.errorDetail);
    if (d.type === 'stopped') showStopped();
  }
  if (d.type === 'reoptimized') updateOpt(d.text, d.error, d.errorDetail, d.stopped);
};
es.onerror = () => {
  // Server gone (reloaded after timeout, or crashed) — show expired message
  if (!optimizing) return; // if we already got a result, don't overwrite
  showExpired();
  es.close();
};

function showResult(optimized, error, errorDetail) {
  optimizing = false;
  document.getElementById('btn-stop').style.display = 'none';
  document.getElementById('status').textContent = '';
  setOptText(optimized || origText);
  document.getElementById('btn-opt').disabled = false;
  if (error || !optimized) {
    const detail = errorDetail ? '<br><small style="opacity:.7">' + errorDetail.slice(0, 200) + '</small>' : '';
    document.getElementById('warn-box').innerHTML =
      '<div class="warn">Optimizer failed — showing original. Edit or re-optimize.' + detail + '</div>';
  } else {
    initActive('opt');
  }
}

function showStopped() {
  optimizing = false;
  document.getElementById('opt-inner').innerHTML =
    '<div class="opt-msg" style="font-style:italic">Stopped — re-optimize or use original</div>';
  document.getElementById('text-opt').value = origText;
  document.getElementById('btn-opt').disabled = false;
  document.getElementById('btn-stop').style.display = 'none';
  document.getElementById('status').textContent = '';
}

function showExpired() {
  document.getElementById('warn-box').innerHTML =
    '<div class="warn">Session expired — close this tab and run <strong>/sherpa:prompt-optimizer</strong> again.</div>';
  document.getElementById('btn-stop').style.display = 'none';
  document.getElementById('btn-reopt').disabled = true;
  document.getElementById('btn-opt').disabled = true;
  optimizing = false;
}

function setOptText(text) {
  document.getElementById('opt-inner').style.display = 'none';
  const ta = document.getElementById('text-opt');
  ta.style.display = 'block';
  ta.value = text;
}

function updateOpt(text, error, errorDetail, stopped) {
  optimizing = false;
  document.getElementById('btn-stop').style.display = 'none';
  const reoptBtn = document.getElementById('btn-reopt');
  reoptBtn.disabled = false;
  reoptBtn.textContent = 'Re-optimize';
  document.getElementById('status').textContent = '';
  if (stopped) {
    document.getElementById('opt-inner').innerHTML =
      '<div class="opt-msg" style="font-style:italic">Stopped — re-optimize or use original</div>';
    document.getElementById('opt-inner').style.display = 'flex';
    document.getElementById('text-opt').style.display = 'none';
    document.getElementById('btn-opt').disabled = false;
    return;
  }
  if (error || !text) {
    const detail = errorDetail ? '<br><small style="opacity:.7;font-style:normal">' + errorDetail.slice(0, 200) + '</small>' : '';
    document.getElementById('opt-inner').innerHTML =
      '<div class="opt-msg" style="font-style:italic">Re-optimize failed — try again' + detail + '</div>';
    document.getElementById('opt-inner').style.display = 'flex';
    document.getElementById('text-opt').style.display = 'none';
    document.getElementById('btn-opt').disabled = true;
    return;
  }
  setOptText(text);
  document.getElementById('btn-opt').disabled = false;
  initActive('opt');
}

function initActive(which) {
  sel = which;
  ['orig', 'opt'].forEach(w => {
    const card = document.getElementById('card-' + w);
    const on = w === which;
    card.classList.toggle('selected', on);
    card.classList.toggle('active', on);
  });
  const ta = document.getElementById('text-' + which);
  if (ta && ta.style.display !== 'none') ta.focus();
  updateReoptLabel();
}

function activateCard(which) {
  if (which === 'opt' && document.getElementById('text-opt').style.display === 'none') return;
  if (sel !== which) {
    sel = which;
    ['orig', 'opt'].forEach(w => {
      const card = document.getElementById('card-' + w);
      const on = w === which;
      card.classList.toggle('selected', on);
      card.classList.toggle('active', on);
    });
  }
  const ta = document.getElementById('text-' + which);
  if (ta && ta.style.display !== 'none') ta.focus();
  updateReoptLabel();
}

async function stopOpt() {
  document.getElementById('btn-stop').disabled = true;
  await fetch('/stop?n=' + nonce, { method: 'POST' });
}

async function reoptimize() {
  if (optimizing) {
    document.getElementById('btn-stop').disabled = true;
    await fetch('/stop?n=' + nonce, { method: 'POST' });
  }
  phase = 'reoptimizing';
  optimizing = true;
  const inner = document.getElementById('opt-inner');
  inner.style.display = 'flex';
  inner.innerHTML = '<div class="spinner"></div><div class="opt-msg">Optimizing…</div>';
  document.getElementById('text-opt').style.display = 'none';
  document.getElementById('btn-opt').disabled = true;
  document.getElementById('btn-stop').style.display = '';
  document.getElementById('btn-stop').disabled = false;
  const reoptBtn = document.getElementById('btn-reopt');
  reoptBtn.disabled = true;
  reoptBtn.textContent = 'Optimizing…';
  const label = selectedBackend.charAt(0).toUpperCase() + selectedBackend.slice(1);
  document.getElementById('status').textContent = 'Running ' + label + '…';
  const reoptBody = sel === 'opt' && document.getElementById('text-opt').style.display !== 'none'
    ? document.getElementById('text-opt').value.trim()
    : document.getElementById('text-orig').value.trim();
  fetch('/reoptimize?n=' + nonce + '&model=' + selectedModel + '&backend=' + selectedBackend, {
    method: 'POST',
    body: reoptBody,
    headers: {'content-type': 'text/plain'}
  });
}

function go(endpoint, body) {
  fetch(endpoint + '?n=' + nonce, {
    method: 'POST', body, headers: {'content-type': 'text/plain'}
  }).then(() => {
    document.body.innerHTML = '<p style="font-family:system-ui;padding:48px 24px;color:#374151">Done — closing tab…</p>';
    setTimeout(() => window.close(), 600);
  }).catch(() => {});
}

function submitOrig() {
  go('/submit', document.getElementById('text-orig').value.trim());
}
function submitOpt() {
  const ta = document.getElementById('text-opt');
  go('/submit', ta.style.display !== 'none' ? ta.value.trim() : document.getElementById('text-orig').value.trim());
}
function cancelPrompt() { go('/cancel', origText); }
if (selectedBackend === 'codex') startCodexProbe();
</script>
</body></html>`;
}

// ── server ────────────────────────────────────────────────────────────────────
async function main() {
  if (!originalPrompt) originalPrompt = await readStdin();

  // Load cached Codex models if backend is codex
  let cachedCodexModels = null;
  if (backend === 'codex') {
    const cached = loadCodexModelsCache();
    if (cached.valid && cached.models && cached.models.length) {
      cachedCodexModels = cached.models;
      if (cached.models[0]) CODEX_MODEL_IDS.lite  = cached.models[0];
      if (cached.models[1]) CODEX_MODEL_IDS.flash = cached.models[1];
    }
  }

  const nonce = crypto.randomBytes(16).toString('hex');
  let done = false;
  let sseClient = null;
  let pendingEvent = null;
  let userStopped = false;
  let serverPhase = 'initial'; // 'initial' | 'reoptimizing'

  function sendSSE(data) {
    pendingEvent = data;
    if (sseClient) {
      try { sseClient.write('data: ' + JSON.stringify(data) + '\n\n'); }
      catch (_) {}
    }
  }

  function finish(server, status, text) {
    server.close(() => {
      process.stdout.write(JSON.stringify({ status, text }));
      process.exit(0);
    });
    setTimeout(() => {
      process.stdout.write(JSON.stringify({ status, text }));
      process.exit(0);
    }, 2000).unref();
  }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const validNonce = url.searchParams.get('n') === nonce;

    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
      res.end(buildHTML(nonce, originalPrompt, backend, initialModelKey, cachedCodexModels));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/events') {
      if (!validNonce) { res.writeHead(403); res.end(); return; }
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      });
      res.write(':\n\n');
      sseClient = res;
      if (pendingEvent) {
        try { res.write('data: ' + JSON.stringify(pendingEvent) + '\n\n'); }
        catch (_) {}
      }
      req.on('close', () => { sseClient = null; });
      return;
    }

    if (!validNonce) { res.writeHead(403); res.end('forbidden'); return; }

    if (req.method === 'POST' && url.pathname === '/stop') {
      userStopped = true;
      killChild(activeChild);
      activeChild = null;
      // Force-resolve any pending optimization immediately — don't wait for process close event.
      // Covers: process won't die, close event delayed, Codex 60s timer, etc.
      const pd = pendingDone; pendingDone = null;
      if (pd) pd(null);
      res.writeHead(200); res.end('ok');
      const stoppedSSE = serverPhase === 'reoptimizing'
        ? { type: 'reoptimized', text: null, error: false, stopped: true }
        : { type: 'stopped' };
      sendSSE(stoppedSSE);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/reoptimize') {
      const modelKey = url.searchParams.get('model') || 'lite';
      const modelIdx = MODEL_KEY_MAP[modelKey] ?? 0;
      const reqBackend = url.searchParams.get('backend') || backend;
      let body = '';
      req.on('data', d => { if (body.length < 512 * 1024) body += d; });
      req.on('end', async () => {
        userStopped = false;
        serverPhase = 'reoptimizing';
        res.writeHead(200); res.end('ok');
        let text;
        if (reqBackend === 'gemini')      text = await runGeminiAsync(body.trim(), modelIdx);
        else if (reqBackend === 'claude') text = await optimizeWithClaude(body.trim(), CLAUDE_MODEL_IDS[modelKey] || 'claude-sonnet-4-6');
        else if (reqBackend === 'codex')  text = await optimizeWithCodex(body.trim());
        else                             text = await optimize(body.trim());
        serverPhase = 'initial';
        if (!userStopped) {
          sendSSE({ type: 'reoptimized', text, error: !text, errorDetail: lastOptError });
        }
      });
      return;
    }

    if (req.method === 'POST' && (url.pathname === '/submit' || url.pathname === '/cancel')) {
      let body = '';
      req.on('data', d => { if (body.length < 512 * 1024) body += d; });
      req.on('end', () => {
        res.writeHead(200); res.end('ok');
        if (done) return;
        done = true;
        if (activeChild) { killChild(activeChild); activeChild = null; }
        const pd = pendingDone; pendingDone = null; if (pd) pd(null);
        const isSubmit = url.pathname === '/submit';
        finish(server, isSubmit ? 'submit' : 'cancel', isSubmit ? body.trim() : originalPrompt);
      });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/probe-codex') {
      res.writeHead(202); res.end('accepted');
      detectCodexModels().then(models => {
        if (models) {
          if (models[0]) CODEX_MODEL_IDS.lite  = models[0];
          if (models[1]) CODEX_MODEL_IDS.flash = models[1];
        }
        sendSSE({ type: 'codex-models', models: models || CODEX_FALLBACK_MODELS });
      }).catch(e => {
        toStderr('Sherpa: probe error: ' + e.message);
        sendSSE({ type: 'codex-models', models: CODEX_FALLBACK_MODELS });
      });
      return;
    }

    res.writeHead(404); res.end();
  });

  server.on('error', err => {
    toStderr('Server error: ' + err.message);
    if (!done) { done = true; finish(server, 'timeout', originalPrompt); }
  });

  process.on('SIGINT', () => { if (!done) { done = true; finish(server, 'timeout', originalPrompt); } });
  process.on('SIGTERM', () => { if (!done) { done = true; finish(server, 'timeout', originalPrompt); } });

  server.listen(0, '127.0.0.1', async () => {
    const port = server.address().port;
    process.stderr.write('\x1b]0;⚡ SHERPA: Edit prompt in browser then return here\x07');
    openBrowser(`http://127.0.0.1:${port}`);

    try {
      const optimized = await optimize(originalPrompt);
      if (userStopped) {
        sendSSE({ type: 'stopped' });
      } else {
        sendSSE({ type: 'ready', original: originalPrompt, optimized, error: !optimized, errorDetail: lastOptError });
      }
    } catch (e) {
      toStderr('Optimizer error: ' + e.message);
      sendSSE({ type: 'ready', original: originalPrompt, optimized: null, error: true });
    }
  });

  setTimeout(() => {
    if (!done) {
      done = true;
      toStderr('Timeout — using original.');
      sendSSE({ type: 'expired' }); // notify browser before server dies
      setTimeout(() => finish(server, 'timeout', originalPrompt), 500);
    }
  }, 5 * 60 * 1000).unref();
}

main().catch(e => {
  process.stderr.write('Fatal: ' + e.message + '\n');
  process.stdout.write(JSON.stringify({ status: 'timeout', text: originalPrompt }));
  process.exit(0);
});
