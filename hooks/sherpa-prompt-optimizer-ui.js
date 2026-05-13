'use strict';
const http = require('http');
const { spawn } = require('child_process');
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
const backend = backendArg || process.env.SHERPA_OPTIMIZER_BACKEND || 'gemini';

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

let activeChild = null;

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

    child.stdout.on('data', d => { stdout += d; });
    child.stderr.on('data', d => {
      stderr += d;
      if (!capacityKilled && isCapacityErr(stderr)) {
        capacityKilled = true;
        try { child.kill(); } catch (_) {}
      }
    });

    const timer = setTimeout(() => { child.kill(); }, 45000);

    child.on('close', async (code) => {
      clearTimeout(timer);
      if (activeChild === child) activeChild = null;
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

async function optimizeWithHaiku(prompt) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) { toStderr('ANTHROPIC_API_KEY not set'); return null; }
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001', max_tokens: 1024,
        system: 'You optimize Claude Code prompts. Return optimized prompt only — no explanation, no preamble.',
        messages: [{ role: 'user', content: 'Optimize: ' + prompt }]
      })
    });
    const data = await resp.json();
    return data.content?.[0]?.text?.trim() || null;
  } catch (e) { toStderr('Haiku error: ' + e.message); return null; }
}

function optimize(prompt) {
  return backend === 'haiku' ? optimizeWithHaiku(prompt) : runGeminiAsync(prompt);
}

// ── HTML ──────────────────────────────────────────────────────────────────────
function buildHTML(nonce, origPrompt) {
  const escaped = (origPrompt || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const json = JSON.stringify(origPrompt || '');
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

<div class="model-row">
  <span class="model-label">Model:</span>
  <button class="btn-model active" id="model-lite" onclick="setModel('lite')">Flash Lite</button>
  <button class="btn-model" id="model-flash" onclick="setModel('flash')">Flash</button>
  <button class="btn-model" id="model-pro" onclick="setModel('pro')">Pro</button>
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
let sel = 'orig';
let optimizing = true;
let phase = 'initial'; // 'initial' | 'reoptimizing'
let selectedModel = 'lite';

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
  if (phase === 'initial') {
    if (d.type === 'ready') showResult(d.optimized, d.error);
    if (d.type === 'stopped') showStopped();
  }
  if (d.type === 'reoptimized') updateOpt(d.text, d.error);
};

function showResult(optimized, error) {
  optimizing = false;
  document.getElementById('btn-stop').style.display = 'none';
  document.getElementById('status').textContent = '';
  setOptText(optimized || origText);
  document.getElementById('btn-opt').disabled = false;
  if (error || !optimized) {
    document.getElementById('warn-box').innerHTML =
      '<div class="warn">Optimizer failed — showing original. Edit or re-optimize.</div>';
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

function setOptText(text) {
  document.getElementById('opt-inner').style.display = 'none';
  const ta = document.getElementById('text-opt');
  ta.style.display = 'block';
  ta.value = text;
}

function updateOpt(text, error) {
  optimizing = false;
  document.getElementById('btn-stop').style.display = 'none';
  const reoptBtn = document.getElementById('btn-reopt');
  reoptBtn.disabled = false;
  reoptBtn.textContent = 'Re-optimize';
  document.getElementById('status').textContent = '';
  if (error || !text) {
    document.getElementById('opt-inner').innerHTML =
      '<div class="opt-msg" style="font-style:italic">Re-optimize failed — try again</div>';
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
  document.getElementById('status').textContent = 'Running Gemini…';
  const reoptBody = sel === 'opt' && document.getElementById('text-opt').style.display !== 'none'
    ? document.getElementById('text-opt').value.trim()
    : document.getElementById('text-orig').value.trim();
  fetch('/reoptimize?n=' + nonce + '&model=' + selectedModel, {
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
</script>
</body></html>`;
}

// ── server ────────────────────────────────────────────────────────────────────
async function main() {
  if (!originalPrompt) originalPrompt = await readStdin();

  const nonce = crypto.randomBytes(16).toString('hex');
  let done = false;
  let sseClient = null;
  let pendingEvent = null;
  let userStopped = false;

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
      res.end(buildHTML(nonce, originalPrompt));
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
      if (activeChild) { try { activeChild.kill(); } catch (_) {} activeChild = null; }
      res.writeHead(200); res.end('ok');
      return;
    }

    if (req.method === 'POST' && url.pathname === '/reoptimize') {
      const modelKey = url.searchParams.get('model') || 'lite';
      const modelIdx = MODEL_KEY_MAP[modelKey] ?? 0;
      let body = '';
      req.on('data', d => { if (body.length < 512 * 1024) body += d; });
      req.on('end', async () => {
        userStopped = false;
        res.writeHead(200); res.end('ok');
        const text = await runGeminiAsync(body.trim(), modelIdx);
        if (!userStopped) {
          sendSSE({ type: 'reoptimized', text, error: !text });
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
        const isSubmit = url.pathname === '/submit';
        finish(server, isSubmit ? 'submit' : 'cancel', isSubmit ? body.trim() : originalPrompt);
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
        sendSSE({ type: 'ready', original: originalPrompt, optimized, error: !optimized });
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
      finish(server, 'timeout', originalPrompt);
    }
  }, 10 * 60 * 1000).unref();
}

main().catch(e => {
  process.stderr.write('Fatal: ' + e.message + '\n');
  process.stdout.write(JSON.stringify({ status: 'timeout', text: originalPrompt }));
  process.exit(0);
});
