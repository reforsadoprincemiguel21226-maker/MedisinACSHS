const assert = require('assert');
const { understandMessage } = require('./lib/understand');
const { decide } = require('./lib/decide');
const { updateContext } = require('./lib/context');

function add(context, text) {
  const u = understandMessage(text);
  const d = decide(u, text);
  return updateContext(context, text, u, d);
}

let c = add(null, 'I feel sleepy.');
assert(c.pendingInfo.includes('symptom_context'), 'sleepiness should ask for context');
assert(!c.facts.symptom_context, 'the symptom itself must not answer its own context question');

c = add(c, 'no');
assert.strictEqual(c.facts.symptom_context, 'no');
assert(!c.pendingInfo.includes('symptom_context'));

c = add(null, 'I have a small cut.');
c = add(c, 'yes, a little');
assert.strictEqual(c.facts.bleeding_status, 'yes, a little');
c = add(c, 'actually, the bleeding stopped.');
assert.strictEqual(c.facts.bleeding_status, 'actually, the bleeding stopped.');
assert(!/a little/i.test(c.facts.bleeding_status));

c = add(null, 'I have a small cut.');
c = add(c, 'on my hand');
assert.strictEqual(c.facts.wound_location, 'on my hand');

console.log('progressive state regression: PASS');


// Generic wound language must clarify before guidance/kit content.
{
  const u = understandMessage('sugat, dugo');
  const d = decide(u, 'sugat, dugo');
  assert.strictEqual(d.responseType, 'medical_clarification_only');
  assert.strictEqual(d.firstAid, false);
  assert.strictEqual(d.kitReady, false);
  assert.strictEqual(d.missingInfo[0], 'bleeding_status');
}

{
  const u = understandMessage('I have a small cut');
  const d = decide(u, 'I have a small cut');
  assert.strictEqual(d.responseType, 'medical_guidance_with_followup');
  assert.strictEqual(d.firstAid, true);
}

console.log('generic-wound clarification gate: PASS');
