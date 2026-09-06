const assert = require('assert');
const { understandMessage } = require('./lib/understand');
const { decide } = require('./lib/decide');
const { MEDICAL_GUIDANCE } = require('./data/medical-guidance');
const { KIT } = require('./data/kit');

// Core high-risk coverage must exist as deterministic knowledge, not depend on Ollama.
for (const topic of ['fracture','dislocation','sprain','severe_bleeding','cpr','choking','seizure','spinal_injury','head_injury','burn','minor_wound']) {
  assert(MEDICAL_GUIDANCE[topic], `missing guidance: ${topic}`);
  assert(MEDICAL_GUIDANCE[topic].actions.length >= 2, `guidance too thin: ${topic}`);
}

let u = understandMessage('I think I broke my arm.');
assert(u.topics.includes('fracture'), 'broken arm should recognize fracture');
assert.strictEqual(decide(u, 'I think I broke my arm.').urgency, 'urgent');

u = understandMessage('My shoulder is dislocated.');
assert(u.topics.includes('dislocation'), 'dislocation should be recognized');
assert.strictEqual(decide(u, 'My shoulder is dislocated.').urgency, 'urgent');

u = understandMessage('How do I perform CPR?');
assert(u.topics.includes('cpr'), 'CPR request should be recognized');
assert.strictEqual(decide(u, 'How do I perform CPR?').responseType, 'cpr_guidance');

u = understandMessage('Someone is in cardiac arrest and not breathing.');
assert(u.topics.includes('cpr'), 'cardiac arrest should recognize CPR');
assert.strictEqual(u.severity, 'emergency');

assert.strictEqual(KIT.length, 18, 'expected 18 physical kit items');
for (const item of KIT) assert(item.uses?.length, `kit item missing purpose: ${item.name}`);

console.log('medical coverage checks: PASS');
