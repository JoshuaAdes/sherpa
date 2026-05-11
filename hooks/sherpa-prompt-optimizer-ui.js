'use strict';
const http = require('http');
const { spawn } = require('child_process');
const crypto = require('crypto');
const os = require('os');
const path = require('path');
const fs = require('fs');

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
const MODEL_CHAIN = ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'];

// async spawn — does not block the HTTP server / SSE while Gemini runs
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

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => { stdout += d; });
    child.stderr.on('data', d => { stderr += d; });

    const timer = setTimeout(() => { child.kill(); }, 90000);

    child.on('close', async (code) => {
      clearTimeout(timer);
      const isQuota = stderr.includes('QUOTA_EXHAUSTED') ||
                      stderr.includes('TerminalQuotaError') ||
                      stderr.includes('exhausted your capacity');
      if (isQuota && modelIndex < MODEL_CHAIN.length - 1) {
        toStderr(`Sherpa: ${model} quota exhausted — falling back to ${MODEL_CHAIN[modelIndex + 1]}`);
        resolve(await runGeminiAsync(prompt, modelIndex + 1));
        return;
      }
      if (code !== 0 || !stdout.trim()) { resolve(null); return; }
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
function buildHTML(nonce) {
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8">
<title>⚡ Sherpa — Prompt Optimizer</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,sans-serif;max-width:820px;margin:32px auto;padding:0 24px;color:#1a1a1a}
h2{font-size:20px;color:#b45309;margin-bottom:4px}
.sub{color:#666;font-size:13px;margin-bottom:20px}
#loading{text-align:center;padding:60px 0}
.spinner{width:36px;height:36px;border:3px solid #e5e7eb;border-top-color:#f59e0b;border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 12px}
@keyframes spin{to{transform:rotate(360deg)}}
.loading-text{color:#666;font-size:14px}
#result{display:none}
.cards{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px}
.card{border:2px solid #e5e7eb;border-radius:8px;padding:14px;cursor:pointer;transition:border-color 0.15s,box-shadow 0.15s}
.card:hover{border-color:#d1d5db}
.card.selected{border-color:#2563eb;box-shadow:0 0 0 3px #bfdbfe}
.card.orig.selected{border-color:#6366f1;box-shadow:0 0 0 3px #c7d2fe}
.card-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#9ca3af;margin-bottom:8px}
.card.selected .card-label{color:#2563eb}
.card.orig.selected .card-label{color:#6366f1}
.card-ta{width:100%;min-height:80px;font-size:13px;line-height:1.6;color:#374151;border:none;background:transparent;resize:none;outline:none;font-family:inherit;cursor:pointer;padding:0;pointer-events:none;white-space:pre-wrap;word-break:break-word;display:block}
.card.active .card-ta{cursor:text;pointer-events:all;resize:vertical}
.row{display:flex;gap:8px;align-items:center}
button{padding:8px 20px;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;transition:background 0.1s}
.btn-use{background:#2563eb;color:#fff}.btn-use:hover{background:#1d4ed8}
.btn-reopt{background:#f59e0b;color:#fff}.btn-reopt:hover{background:#d97706}
.btn-reopt:disabled{background:#fde68a;color:#92400e;cursor:not-allowed}
.btn-cancel{background:#f3f4f6;color:#374151;margin-left:auto}.btn-cancel:hover{background:#e5e7eb}
.status{font-size:12px;color:#6b7280}
.warn{color:#b45309;background:#fef3c7;border:1px solid #fde68a;padding:8px 12px;border-radius:6px;margin-bottom:12px;font-size:13px}
</style>
</head><body>
<h2>⚡ Sherpa — Prompt Optimizer</h2>
<div class="sub">Click a card to edit it · Re-optimize anytime</div>

<div id="loading">
  <div class="spinner"></div>
  <div class="loading-text">Optimizing with Gemini…</div>
</div>

<div id="result">
  <div id="warn-box"></div>
  <div class="cards">
    <div class="card orig" id="card-orig" onclick="activateCard('orig')">
      <div class="card-label">Original</div>
      <textarea class="card-ta" id="text-orig" onclick="event.stopPropagation()"></textarea>
    </div>
    <div class="card" id="card-opt" onclick="activateCard('opt')">
      <div class="card-label">✨ Optimized</div>
      <textarea class="card-ta" id="text-opt" onclick="event.stopPropagation()"></textarea>
    </div>
  </div>
  <div class="row">
    <button class="btn-use" onclick="submitPrompt()">Use It</button>
    <button class="btn-reopt" id="btn-reopt" onclick="reoptimize()">Re-optimize</button>
    <span class="status" id="status-msg"></span>
    <button class="btn-cancel" onclick="cancelPrompt()">Cancel</button>
  </div>
</div>

<script>
const nonce = '${nonce}';
let sel = 'opt';
let orig = '';

const es = new EventSource('/events?n=' + nonce);
es.onmessage = e => {
  const d = JSON.parse(e.data);
  if (d.type === 'ready') showResult(d.original, d.optimized, d.error);
  if (d.type === 'reoptimized') updateOpt(d.text, d.error);
};

function showResult(original, optimized, error) {
  orig = original;
  document.getElementById('loading').style.display = 'none';
  document.getElementById('result').style.display = 'block';
  document.getElementById('text-orig').value = orig;
  document.getElementById('text-opt').value = optimized || orig;
  if (error || !optimized) {
    document.getElementById('warn-box').innerHTML =
      '<div class="warn">Optimizer failed — showing original. Edit or re-optimize.</div>';
    initActive('orig');
  } else {
    initActive('opt');
  }
}

function updateOpt(text, error) {
  const btn = document.getElementById('btn-reopt');
  const status = document.getElementById('status-msg');
  btn.disabled = false; btn.textContent = 'Re-optimize';
  if (error || !text) { status.textContent = 'Re-optimize failed — try again'; return; }
  document.getElementById('text-opt').value = text;
  status.textContent = '';
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
  document.getElementById('text-' + which).focus();
}

function activateCard(which) {
  if (sel !== which) {
    sel = which;
    ['orig', 'opt'].forEach(w => {
      const card = document.getElementById('card-' + w);
      const on = w === which;
      card.classList.toggle('selected', on);
      card.classList.toggle('active', on);
    });
  }
  document.getElementById('text-' + which).focus();
}

function getActiveText() {
  return document.getElementById('text-' + sel).value.trim();
}

function reoptimize() {
  const btn = document.getElementById('btn-reopt');
  const status = document.getElementById('status-msg');
  btn.disabled = true; btn.textContent = 'Optimizing…';
  status.textContent = 'Running Gemini…';
  fetch('/reoptimize?n=' + nonce, {
    method: 'POST', body: getActiveText(), headers: {'content-type': 'text/plain'}
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

function submitPrompt() { go('/submit', getActiveText()); }
function cancelPrompt() { go('/cancel', orig); }
</script>
</body></html>`;
}

// ── server ────────────────────────────────────────────────────────────────────
async function main() {
  if (!originalPrompt) originalPrompt = await readStdin();

  const nonce = crypto.randomBytes(16).toString('hex');
  let done = false;
  let sseClient = null;
  let pendingEvent = null; // buffer result if Gemini finishes before SSE connects

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
      res.end(buildHTML(nonce));
      return;
    }

    // SSE endpoint — browser connects immediately, keeps connection open
    if (req.method === 'GET' && url.pathname === '/events') {
      if (!validNonce) { res.writeHead(403); res.end(); return; }
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      });
      res.write(':\n\n');
      sseClient = res;
      // If Gemini already finished before browser connected, flush now
      if (pendingEvent) {
        try { res.write('data: ' + JSON.stringify(pendingEvent) + '\n\n'); }
        catch (_) {}
      }
      req.on('close', () => { sseClient = null; });
      return;
    }

    if (!validNonce) { res.writeHead(403); res.end('forbidden'); return; }

    if (req.method === 'POST' && url.pathname === '/reoptimize') {
      let body = '';
      req.on('data', d => { if (body.length < 512 * 1024) body += d; });
      req.on('end', async () => {
        res.writeHead(200); res.end('ok');
        const text = await optimize(body.trim());
        sendSSE({ type: 'reoptimized', text, error: !text });
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

    // Run optimization concurrently — browser shows spinner, SSE delivers result when ready
    try {
      const optimized = await optimize(originalPrompt);
      sendSSE({ type: 'ready', original: originalPrompt, optimized, error: !optimized });
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
