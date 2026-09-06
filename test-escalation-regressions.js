const assert = require('assert');
const { understandMessage } = require('./lib/understand');
const { decide } = require('./lib/decide');
const { handleChat } = require('./lib/server-core');

function check(text) {
  const u = understandMessage(text);
  const d = decide(u, text);
  return { u, d };
}

let x = check('I burned my hand and now the skin is badly damaged.');
assert(x.u.topics.includes('burn'));
assert.equal(x.u.severity, 'potentially_severe');
assert.equal(x.d.responseType, 'urgent_medical_guidance');
assert.equal(x.d.urgency, 'urgent');

function chat(contents, memory) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ contents, session_memory: memory });
    const req = {
      method: 'POST', headers: {},
      on(event, fn) {
        if (event === 'data') setImmediate(() => fn(Buffer.from(payload)));
        if (event === 'end') setImmediate(() => fn());
        return this;
      }
    };
    const res = {
      writeHead(status) { this.status = status; return this; },
      end(body) { resolve({ status: this.status, body: JSON.parse(body) }); }
    };
    handleChat(req, res).catch(reject);
  });
}

(async () => {
  let contents = [];
  let memory = null;
  const turns = [
    'I touched a hot pan and burned my hand.',
    'It hurts but I can still move my fingers.',
    'There’s a blister forming.',
    'Actually the blister got bigger and the skin looks really damaged.'
  ];
  let last;
  for (const text of turns) {
    contents.push({ role: 'user', parts: [{ text }] });
    last = await chat(contents, memory);
    assert.equal(last.status, 200);
    memory = last.body.sessionMemory;
    contents.push({ role: 'model', parts: [{ text: last.body.reply }] });
  }
  assert.equal(last.body.assessment.urgency, 'urgent');
  assert(/prompt medical assessment|urgent medical|assessed promptly/i.test(last.body.reply), 'escalated burn must explicitly recommend prompt assessment');
  assert(!/For a minor thermal burn|protect a minor burn/i.test(last.body.reply), 'escalated burn must not be described as minor');

  contents = [];
  memory = null;
  for (const text of ['My friend suddenly collapsed.', "They aren't responding."]) {
    contents.push({ role: 'user', parts: [{ text }] });
    last = await chat(contents, memory);
    assert.equal(last.status, 200);
    memory = last.body.sessionMemory;
    contents.push({ role: 'model', parts: [{ text: last.body.reply }] });
  }
  assert.equal(last.body.assessment.urgency, 'emergency', 'unresponsive follow-up must retain emergency context');
  assert(/Call 911/i.test(last.body.reply), 'unresponsive follow-up must give emergency action');

  console.log('escalation regressions: PASS');
})().catch((err) => { console.error(err); process.exit(1); });
