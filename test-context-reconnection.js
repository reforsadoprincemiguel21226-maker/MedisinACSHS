const assert = require('assert');
const http = require('http');
const { spawn } = require('child_process');

function post(port, contents, session_memory) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ contents, session_memory });
    const req = http.request({
      hostname: '127.0.0.1', port, path: '/api/chat', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => {
      let data = '';
      res.on('data', x => data += x);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.end(body);
  });
}

(async () => {
  const port = 3142;
  const child = spawn(process.execPath, ['scripts/kiosk-server.cjs'], {
    env: { ...process.env, PORT: String(port), ADMIN_TOKEN: '' },
    stdio: ['ignore', 'ignore', 'ignore']
  });
  await new Promise(r => setTimeout(r, 450));
  try {
    let contents = [];
    let memory = null;
    const turns = [
      'I cut my finger while opening a package.',
      'It is not bleeding anymore.',
      'Actually it is on my index finger.',
      'What should I do with it?'
    ];
    const replies = [];
    for (const text of turns) {
      contents.push({ role: 'user', parts: [{ text }] });
      const result = await post(port, contents, memory);
      assert.strictEqual(result.status, 200);
      replies.push(result.body.reply);
      memory = result.body.sessionMemory;
      contents.push({ role: 'model', parts: [{ text: result.body.reply }] });
    }

    assert.strictEqual(memory.conversationSummary.activeTopic, 'minor_wound');
    assert.strictEqual(memory.conversationSummary.knownFacts.bleeding_status, 'not bleeding');
    assert.strictEqual(memory.conversationSummary.knownFacts.wound_location, 'index finger');
    assert.match(replies[2], /index finger/i, 'correction should reconnect to existing wound');
    assert.match(replies[3], /index finger|bleeding has stopped/i, 'pronoun follow-up should reconnect to existing wound');
    assert.doesNotMatch(replies[2], /What would you like help with\?/i);
    assert.doesNotMatch(replies[3], /What would you like help with\?/i);
    console.log('context reconnection: PASS');
  } finally {
    child.kill();
  }
})().catch(err => { console.error(err); process.exitCode = 1; });
