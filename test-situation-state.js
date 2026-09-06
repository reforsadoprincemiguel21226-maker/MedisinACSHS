const { updateContext } = require('./lib/context.js');
const assert = require('assert');
const { understandMessage } = require('./lib/understand');
const { decide } = require('./lib/decide');
const { buildSituationState } = require('./lib/situation');

function stateFor(text, facts = {}) {
  const understanding = understandMessage(text);
  const decision = decide(understanding, text);
  return buildSituationState({ understanding, decision, relevantContext: { facts } });
}

let s = stateFor('I got a deep cut');
assert.strictEqual(s.active, true);
assert.strictEqual(s.topic, 'wound or cut');
assert.strictEqual(s.severity, 'potentially_severe');
assert.ok(s.unknownFacts.length >= 1);

s = stateFor('di ako makahinga');
assert.strictEqual(s.severity, 'emergency');
assert.ok(s.emergencyFlags.includes('breathing difficulty'));
assert.strictEqual(s.nextBestQuestion, null);

s = stateFor('dumudugo kamay ko', { bleeding_status: 'not bleeding', wound_location: 'hand' });
assert.strictEqual(s.bodyLocation, 'hand');
assert.strictEqual(s.unknownFacts.length, 0);

console.log('situation-state regression: PASS');

const locationContext = updateContext(null, 'Antipolo City', { messageType:'location', topics:[], severity:'unknown' }, { missingInfo:[] });
assert.strictEqual(locationContext.facts.current_location, 'antipolo');
console.log('standalone location persistence: PASS');
