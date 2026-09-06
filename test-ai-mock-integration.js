// Contract test for the REAL AI request path using a local fake Ollama server.
// This proves the app builds a brief, calls the model, validates its output,
// and falls back safely when the model violates the communication contract.
const assert = require('assert');
const http = require('http');
const { spawn } = require('child_process');

const FAKE_PORT = 3199;
const APP_PORT = 3198;
let lastPrompt = '';

const fake = http.createServer((req, res) => {
  let body = '';
  req.on('data', c => { body += c; });
  req.on('end', () => {
    const parsed = JSON.parse(body || '{}');
    lastPrompt = parsed?.messages?.[1]?.content || '';
    let reply = 'A headache can have several causes, so start with rest and some water. If it is getting worse or comes with other warning signs, get medical help.';
    if (/unsafe-test/i.test(lastPrompt)) reply = 'You have a migraine. Take ibuprofen 400 mg.';
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: { content: reply } }));
  });
});

function post(contents, sessionMemory) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ contents, session_memory: sessionMemory || undefined });
    const req = http.request({ hostname: '127.0.0.1', port: APP_PORT, path: '/api/chat', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } }, res => {
      let data = ''; res.on('data', c => data += c); res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
    });
    req.on('error', reject); req.end(payload);
  });
}

(async () => {
  await new Promise((resolve, reject) => fake.listen(FAKE_PORT, '127.0.0.1', err => err ? reject(err) : resolve()));
  const child = spawn(process.execPath, ['scripts/kiosk-server.cjs'], {
    env: { ...process.env, PORT: String(APP_PORT), OLLAMA_URL: `http://127.0.0.1:${FAKE_PORT}/api/chat`, OLLAMA_MODEL: 'fake-model', AI_TIMEOUT_MS: '3000', AI_ENABLED: 'true', ADMIN_TOKEN: '' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  await new Promise(r => setTimeout(r, 450));
  try {
    let r = await post([{ role: 'user', parts: [{ text: 'I have a headache' }] }]);
    assert.strictEqual(r.status, 200);
    assert.match(r.body.reply, /headache/i);
    assert.doesNotMatch(r.body.reply, /AI_TEST_DO_NOT_EXPECT_THIS/i);
    assert.match(lastPrompt, /APPROVED MEDICAL BRIEF/);
    assert.match(lastPrompt, /latestUserMessage/);
    assert.match(lastPrompt, /retrievedKnowledge/);

    const memory = r.body.sessionMemory;
    r = await post([
      { role: 'user', parts: [{ text: 'I have a headache' }] },
      { role: 'model', parts: [{ text: r.body.reply }] },
      { role: 'user', parts: [{ text: 'What should I do now?' }] },
    ], memory);
    assert.strictEqual(r.status, 200);
    assert.match(r.body.reply, /headache|rest|water/i);

    r = await post([{ role: 'user', parts: [{ text: 'unsafe-test: I have a headache' }] }]);
    assert.strictEqual(r.status, 200);
    assert.doesNotMatch(r.body.reply, /ibuprofen|400\s*mg|you have a migraine/i);

    console.log('AI mock integration path: PASS');
  } finally {
    child.kill('SIGTERM');
    await new Promise(resolve => fake.close(resolve));
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
