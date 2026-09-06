// Regression tests for contextual kit questions.
// These are intentionally conversational: the latest turn does not repeat the
// injury, so the server must use the established session context instead of
// dumping the whole inventory or falling back to capabilities.
const assert = require('assert');
const http = require('http');
const { spawn } = require('child_process');

const APP_PORT = 3208;

function post(contents, sessionMemory) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ contents, session_memory: sessionMemory || undefined });
    const req = http.request({ hostname: '127.0.0.1', port: APP_PORT, path: '/api/chat', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
    });
    req.on('error', reject);
    req.end(payload);
  });
}

async function conversation(turns) {
  let contents = [];
  let memory = null;
  const replies = [];
  for (const text of turns) {
    contents.push({ role: 'user', parts: [{ text }] });
    const result = await post(contents, memory);
    assert.strictEqual(result.status, 200);
    replies.push(result.body.reply);
    memory = result.body.sessionMemory;
    contents.push({ role: 'model', parts: [{ text: result.body.reply }] });
  }
  return replies;
}

(async () => {
  const child = spawn(process.execPath, ['scripts/kiosk-server.cjs'], {
    env: { ...process.env, PORT: String(APP_PORT), AI_ENABLED: 'false', ADMIN_TOKEN: '' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  await new Promise(r => setTimeout(r, 400));
  try {
    let replies = await conversation([
      'I cut my finger while opening a package.',
      'It is not bleeding anymore.',
      'Do I need anything from the kit?'
    ]);
    assert.match(replies[2], /Adhesive Bandages \(Assorted Sizes\)/i);
    assert.match(replies[2], /bleeding again.*Sterile Gauze Pads/i);
    assert.doesNotMatch(replies[2], /The MedisinACSHS first-aid kit contains:/i);

    replies = await conversation([
      'I touched a hot pan and burned my hand.',
      'What can I use from the kit?'
    ]);
    assert.match(replies[1], /Burn Dressing \(Sterile Non-Stick\)/i);
    assert.doesNotMatch(replies[1], /Adhesive Bandages \(Assorted Sizes\).*Sterile Gauze Pads.*Medical Adhesive Tape/i);

    replies = await conversation([
      'I twisted my ankle playing basketball.',
      'Can I use something from the kit?'
    ]);
    assert.match(replies[1], /Instant Cold Packs \/ Compresses/i);
    assert.match(replies[1], /Elastic Bandage \(ACE Type\)/i);
    assert.doesNotMatch(replies[1], /The MedisinACSHS first-aid kit contains:/i);

    console.log('contextual kit questions: PASS');
  } finally {
    child.kill('SIGTERM');
  }
})().catch(err => { console.error(err); process.exitCode = 1; });
