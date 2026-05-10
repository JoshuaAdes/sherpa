// Skill helper — called blocking from /sherpa:prompt-optimizer.
// Calls Gemini/Haiku to rewrite prompt, opens result in browser for direct editing,
// then prints final JSON to stdout: {"status":"submit"|"cancel"|"timeout","text":"..."}
// stdout = result only. All diagnostics go to stderr so Claude doesn't capture them.
'use strict';
const http = require('http');
const { spawnSync } = require('child_process');
const crypto = require('crypto');
const os = require('os');
const path = require('path');
const fs = require('fs');

// ── args ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
let backendArg = null;
const promptParts = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--backend' && args[i + 1]) { backendArg = args[++i]; }
  else { promptParts.push(args[i]); }
}
let originalPrompt = promptParts.join(' ');
// Precedence: CLI arg > env var > default
const backend = backendArg || process.env.SHERPA_OPTIMIZER_BACKEND || 'gemini';

// ── helpers ───────────────────────────────────────────────────────────────────
const toStderr = msg => process.stderr.write(msg + '\n');

// Used when prompt is passed via stdin instead of args (avoids OS command-line length limits)
async function readStdin() {
  if (process.stdin.isTTY) return ''; // interactive terminal — nothing to read, would block forever
  let data = '';
  for await (const chunk of process.stdin) { data += chunk; }
  return data.trim();
}

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function openBrowser(url) {
  toStderr('Sherpa optimizer: ' + url);

  // Headless Linux has no display — xdg-open would hang or error silently
  if (process.platform === 'linux' && !process.env.DISPLAY) {
    toStderr('No DISPLAY detected — browser cannot be opened automatically.');
    toStderr('Please open manually: ' + url);
    return;
  }

  let cmd, cmdArgs;
  if (process.platform === 'win32') {
    cmd = 'cmd';
    cmdArgs = ['/c', 'start', '""', url]; // `start` is a shell builtin — needs cmd /c wrapper
  }
  else if (process.platform === 'darwin') { cmd = 'open'; cmdArgs = [url]; }
  else { cmd = 'xdg-open'; cmdArgs = [url]; }

  try {
    // spawn + unref: fire-and-forget — we don't wait for browser to close
    const child = require('child_process').spawn(cmd, cmdArgs, {
      detached: true,
      stdio: 'ignore',
      shell: process.platform === 'win32' // `start` requires shell on Windows
    });
    child.unref();
  }
  catch (e) { toStderr('Could not open browser: ' + e.message + '\nOpen manually: ' + url); }
}

// ── backends ──────────────────────────────────────────────────────────────────
function optimizeWithGemini(prompt) {
  const instruction =
    'Optimize this Claude Code prompt. Goals: remove ambiguity, improve specificity, ' +
    'reduce tokens, preserve full intent. Return optimized prompt only — no explanation, no preamble.\n\nPROMPT: ';

  // spawnSync with args array — avoids shell quoting issues on Windows with special chars
  // input: passes prompt via stdin to avoid OS command-line length limits on large prompts
  const result = require('child_process').spawnSync('gemini', ['-y', '-p', instruction], {
    input: prompt,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
    timeout: 30000,
    env: { ...process.env, GEMINI_CLI_TRUST_WORKSPACE: 'true' }
  });

  if (result.status !== 0 || !result.stdout) {
    toStderr('Gemini error: ' + (result.stderr || 'no output'));
    return null;
  }
  return result.stdout.trim();
}

async function optimizeWithHaiku(prompt) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) { toStderr('ANTHROPIC_API_KEY not set — cannot use haiku backend'); return null; }
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: 'You optimize Claude Code prompts. Return optimized prompt only — no explanation, no preamble.',
        messages: [{ role: 'user', content: 'Optimize: ' + prompt }]
      })
    });
    const data = await resp.json();
    return data.content?.[0]?.text?.trim() || null;
  } catch (e) { toStderr('Haiku API error: ' + e.message); return null; }
}

// ── HTML ──────────────────────────────────────────────────────────────────────
function buildHTML(displayText, nonce, errorNote) {
  const safeText = escapeHTML(displayText); // must escape — prompt may contain HTML special chars
  const note = errorNote
    ? `<div class="warn">${escapeHTML(errorNote)}</div>`
    : '';
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8">
<title>Sherpa — Prompt Optimizer</title>
<style>
*{box-sizing:border-box}
body{font-family:system-ui,sans-serif;max-width:720px;margin:48px auto;padding:0 24px;color:#1a1a1a}
h2{margin:0 0 4px;font-size:18px}
.sub{color:#666;font-size:13px;margin-bottom:16px}
.warn{color:#b45309;background:#fef3c7;border:1px solid #fde68a;padding:8px 12px;border-radius:6px;margin-bottom:12px;font-size:13px}
textarea{width:100%;height:220px;font-size:14px;line-height:1.5;padding:10px;border:1px solid #d1d5db;border-radius:6px;resize:vertical;outline:none}
textarea:focus{border-color:#2563eb;box-shadow:0 0 0 2px #bfdbfe}
.row{display:flex;gap:8px;margin-top:12px}
button{padding:8px 20px;border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:500}
.use{background:#2563eb;color:#fff}.use:hover{background:#1d4ed8}
.cancel{background:#f3f4f6;color:#374151}.cancel:hover{background:#e5e7eb}
</style>
</head><body>
<h2>Sherpa — Prompt Optimizer</h2>
<div class="sub">Edit then click <strong>Use It</strong> to execute, or <strong>Cancel</strong> to use original.</div>
${note}
<textarea id="p" autofocus>${safeText}</textarea>
<div class="row">
  <button class="use" onclick="go('/submit')">Use It</button>
  <button class="cancel" onclick="go('/cancel')">Cancel</button>
</div>
<script>
function go(path){
  fetch(path+'?n=${nonce}',{method:'POST',body:document.getElementById('p').value,headers:{'content-type':'text/plain'}})
    .then(()=>document.body.innerHTML='<p style="font-family:system-ui;margin:48px auto;max-width:720px;padding:0 24px">Done — return to Claude Code.</p>')
    .catch(()=>{});
}
</script>
</body></html>`;
}

// ── shutdown ──────────────────────────────────────────────────────────────────
function finish(server, status, text) {
  server.close(() => {
    process.stdout.write(JSON.stringify({ status, text }));
    process.exit(0);
  });
  // server.close() can hang if a browser connection is still open — force exit after 2s
  setTimeout(() => {
    process.stdout.write(JSON.stringify({ status, text }));
    process.exit(0);
  }, 2000).unref(); // unref: don't keep Node alive just for this fallback timer
}

// ── main ──────────────────────────────────────────────────────────────────────
async function main() {
  // Fallback: read prompt from stdin if not passed as CLI arg (supports piped input)
  if (!originalPrompt) {
    originalPrompt = await readStdin();
  }

  let optimized = null;
  let errorNote = null;
  if (originalPrompt) {
    try {
      optimized = backend === 'haiku'
        ? await optimizeWithHaiku(originalPrompt)
        : optimizeWithGemini(originalPrompt);
    } catch (e) { toStderr('Optimizer error: ' + e.message); }
    if (!optimized) errorNote = 'Optimizer failed — editing original prompt.';
  }
  const displayText = optimized || originalPrompt;

  // Random nonce per session — prevents other localhost pages from submitting via CSRF
  const nonce = crypto.randomBytes(16).toString('hex');

  // done flag guards against double-finish if POST arrives twice (e.g. user double-clicks)
  let done = false;

  // Port 0 = OS assigns a free port — eliminates retry logic and port collision across sessions
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');

    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(buildHTML(displayText, nonce, errorNote));
      return;
    }

    if (url.searchParams.get('n') !== nonce) {
      res.writeHead(403); res.end('forbidden'); return;
    }

    if (req.method === 'POST' && (url.pathname === '/submit' || url.pathname === '/cancel')) {
      let body = '';
      // 512KB cap — prompts are text, never legitimately this large; guards against runaway reads
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

  // Clean shutdown on signals — outputs original prompt so Claude can still proceed
  process.on('SIGINT', () => { if (!done) { done = true; finish(server, 'timeout', originalPrompt); } });
  process.on('SIGTERM', () => { if (!done) { done = true; finish(server, 'timeout', originalPrompt); } });

  // Bind to loopback only — never reachable from other machines on the network
  server.listen(0, '127.0.0.1', () => {
    const port = server.address().port;
    openBrowser(`http://127.0.0.1:${port}`);
  });

  // 10-min hard timeout — user walked away; fall back to original so Claude isn't stuck
  setTimeout(() => {
    if (!done) {
      done = true;
      toStderr('Timeout — using original prompt.');
      finish(server, 'timeout', originalPrompt);
    }
  }, 10 * 60 * 1000).unref(); // unref: don't keep Node alive just for the timeout
}

main().catch(e => {
  process.stderr.write('Fatal: ' + e.message + '\n');
  process.stdout.write(JSON.stringify({ status: 'timeout', text: originalPrompt }));
  process.exit(0);
});
