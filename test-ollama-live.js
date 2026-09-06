// Live Ollama integration/regression test.
// Run this only when Ollama is installed and the configured model is available.
// It intentionally checks behavioral contracts, not exact wording.
const assert = require('assert');
const http = require('http');
const { spawn } = require('child_process');

const PORT = Number(process.env.TEST_PORT || 3140);
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434/api/chat';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen3.5:0.8b';

async function ollamaReady() {
  try {
    const r = await fetch(OLLAMA_URL.replace(/\/api\/chat\/?$/, '/api/tags'));
    if (!r.ok) return false;
    const data = await r.json();
    const names = (data.models || []).map(m => m.name || '');
    return names.some(n => n === OLLAMA_MODEL || n.startsWith(`${OLLAMA_MODEL}:`));
  } catch { return false; }
}

function post(contents) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ contents, system_instruction: { parts: [{ text: 'You are MedisinACSHS.' }] } });
    const req = http.request({ hostname: '127.0.0.1', port: PORT, path: '/api/chat', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, res => {
      let d = ''; res.on('data', x => d += x); res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(d) }));
    });
    req.on('error', reject); req.end(body);
  });
}

(async () => {
  if (!(await ollamaReady())) {
    console.log(`live Ollama test: SKIPPED (Ollama/model "${OLLAMA_MODEL}" is not available at ${OLLAMA_URL})`);
    process.exit(0);
  }

  const child = spawn(process.execPath, ['scripts/kiosk-server.cjs'], {
    env: { ...process.env, PORT: String(PORT), OLLAMA_URL, OLLAMA_MODEL, ADMIN_TOKEN: '' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  await new Promise(r => setTimeout(r, 500));
  try {
    let r = await post([{ role: 'user', parts: [{ text: 'I have a headache' }] }]);
    assert.strictEqual(r.status, 200); assert.match(r.body.reply, /headache/i); assert.match(r.body.reply, /\?/);

    r = await post([{ role: 'user', parts: [{ text: 'sugat, dugo' }] }]);
    assert.strictEqual(r.status, 200); assert.match(r.body.reply, /bleeding/i);
    assert.doesNotMatch(r.body.reply, /sterile gauze|adhesive bandage|first-aid kit/i);

    r = await post([{ role: 'user', parts: [{ text: 'hospital near me' }] }]);
    assert.strictEqual(r.status, 200); assert.match(r.body.reply, /city or municipality/i);

    r = await post([{ role: 'user', parts: [{ text: 'hospital near me' }] },
      { role: 'model', parts: [{ text: 'What city or municipality are you currently in?' }] },
      { role: 'user', parts: [{ text: 'Antipolo' }] }]);
    assert.strictEqual(r.status, 200); assert.match(r.body.reply, /Antipolo|Metro Antipolo|Rizal Provincial/i);
    assert.doesNotMatch(r.body.reply, /\b\d+(?:\.\d+)?\s*km\b/i);

    r = await post([{ role: 'user', parts: [{ text: 'I have heavy bleeding' }] }]);
    assert.strictEqual(r.status, 200); assert.match(r.body.reply, /911|emergency/i); assert.match(r.body.reply, /pressure|gauze|cloth/i);

    console.log('live Ollama integration/regression: PASS');
  } finally {
    child.kill('SIGTERM');
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
