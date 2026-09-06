const assert = require('assert');
const { understandMessage } = require('./lib/understand.js');
const { decide } = require('./lib/decide.js');
function check(msg) {
  return { u: understandMessage(msg), d: decide(understandMessage(msg), msg) };
}

let x = check('I feel dizzy.');
assert.deepStrictEqual(x.u.topics, ['dizziness']);
assert.strictEqual(x.d.responseType, 'medical_guidance_with_followup');

x = check('Nasusuka ako.');
assert(x.u.topics.includes('nausea'));
assert.strictEqual(x.d.responseType, 'medical_guidance_with_followup');

x = check('I have a fever.');
assert(x.u.topics.includes('fever'));
assert.strictEqual(x.d.responseType, 'medical_guidance_with_followup');

x = check('I have heavy bleeding.');
assert(x.u.topics.includes('severe_bleeding'));
assert.strictEqual(x.u.severity, 'emergency');
assert.strictEqual(x.d.responseType, 'emergency_first_aid');

x = check('di ako makahinga');
assert(x.u.topics.includes('breathing'));
assert.strictEqual(x.u.severity, 'emergency');

x = check('masakit ulo ko');
assert(x.u.topics.includes('headache'));

x = check('I have a head ache');
assert(x.u.topics.includes('headache'));

console.log('pipeline contract checks: PASS');
