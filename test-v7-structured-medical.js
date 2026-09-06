const assert = require('assert');
const { understandMessage } = require('./lib/understand.js');
const { decide } = require('./lib/decide.js');
const { updateContext } = require('./lib/context.js');

function check(message, expectedType, expectedSeverity, expectedResponse) {
  const u = understandMessage(message);
  const d = decide(u, message);
  assert.strictEqual(u.messageType, expectedType, message);
  assert.strictEqual(u.severity, expectedSeverity, message);
  assert.strictEqual(d.responseType, expectedResponse, message);
  return { u, d };
}

check('I have a small cut', 'medical', 'minor', 'medical_guidance_with_followup');
check('I have bleeding', 'medical', 'minor', 'medical_guidance_with_followup');
check('I have heavy bleeding', 'medical', 'emergency', 'emergency_first_aid');
check('I am bleeding a lot', 'medical', 'emergency', 'emergency_first_aid');
check('I cannot breathe', 'medical', 'emergency', 'emergency_first_aid');
check('inaantok ako', 'medical', 'minor', 'medical_guidance_with_followup');
check('I feel sleepy. Is this normal?', 'medical', 'minor', 'minor_first_aid');

let context = null;
let u = understandMessage('I have a small cut');
let d = decide(u, 'I have a small cut');
context = updateContext(context, 'I have a small cut', u, d);
u = understandMessage('no');
d = decide(u, 'no');
context = updateContext(context, 'no', u, d);
assert.deepStrictEqual(context.pendingInfo, ['wound_location']);
assert.strictEqual(context.facts.bleeding_status, 'no');

// Regression: a descriptive bleeding reply must satisfy the previous pending
// bleeding question and remain available as context for the next turn.
let c2 = null;
let u2 = understandMessage('I have a small cut');
let d2 = decide(u2, 'I have a small cut');
c2 = updateContext(c2, 'I have a small cut', u2, d2);
u2 = understandMessage('yes small bleeding');
d2 = decide(u2, 'yes small bleeding');
c2 = updateContext(c2, 'yes small bleeding', u2, d2);
assert.strictEqual(c2.facts.bleeding_status, 'yes small bleeding');
assert.deepStrictEqual(c2.pendingInfo, ['wound_location']);

u2 = understandMessage('on my hand');
d2 = decide(u2, 'on my hand');
c2 = updateContext(c2, 'on my hand', u2, d2);
assert.strictEqual(c2.facts.bleeding_status, 'yes small bleeding');
assert.strictEqual(c2.facts.wound_location, 'on my hand');
assert.deepStrictEqual(c2.pendingInfo, []);

console.log('v7 structured medical regression: PASS');
