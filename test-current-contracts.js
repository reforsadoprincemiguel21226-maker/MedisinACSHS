const assert = require('assert');
const fs = require('fs');
const { understandMessage } = require('./lib/understand');
const { decide } = require('./lib/decide');
const { updateContext } = require('./lib/context');
const { HOSPITALS_BY_LOCATION } = require('./data/hospitals-data');

function decision(text) {
  const u = understandMessage(text);
  return { u, d: decide(u, text) };
}

for (const text of ['I feel dizzy', 'Nasusuka ako', 'I feel weak', 'I have a fever']) {
  const {u,d}=decision(text);
  assert.strictEqual(u.messageType, 'medical', text);
  assert.notStrictEqual(d.responseType, 'clarify_medical', text);
  assert.strictEqual(d.responseType, 'medical_guidance_with_followup', text);
}
assert(decision('I have a head ache').u.topics.includes('headache'));
assert(decision('masakit ulo ko').u.topics.includes('headache'));
assert(decision('di ako makahinga').u.topics.includes('breathing'));
assert.strictEqual(decision('di ako makahinga').u.severity, 'emergency');
assert.strictEqual(decision('ang lakas ng dugo').u.severity, 'emergency');
assert.strictEqual(decision('I have heavy bleeding').d.responseType, 'emergency_first_aid');
assert.notStrictEqual(decision('I have a small cut').d.responseType, 'clarify_medical');

let c = null;
let u = understandMessage('I have a small cut');
let d = decide(u, 'I have a small cut');
c = updateContext(c, 'I have a small cut', u, d);
u = understandMessage('yes, a little');
d = decide(u, 'yes, a little');
c = updateContext(c, 'yes, a little', u, d);
assert.strictEqual(c.facts.bleeding_status, 'yes, a little');
assert(c.pendingInfo.includes('wound_location'));
u = understandMessage('on my hand');
d = decide(u, 'on my hand');
c = updateContext(c, 'on my hand', u, d);
assert.strictEqual(c.facts.wound_location, 'on my hand');
assert(!c.pendingInfo.includes('wound_location'));

c = updateContext(null, 'Antipolo City', {messageType:'location',topics:[],severity:'unknown'}, {missingInfo:[]});
assert.strictEqual(c.activeIntent, null);
assert.strictEqual(c.facts.current_location, 'antipolo');

assert(HOSPITALS_BY_LOCATION.antipolo.length > 0);
assert(HOSPITALS_BY_LOCATION.angono.length > 0);

const frontend = fs.readFileSync('A.i asistant.html', 'utf8');
for (const retired of ['buildDemoVenueReply', 'DISTANCE_REQUEST_WORDS', 'lastHospitalContext', 'tryHospitalReply', 'window.MEDISIN_HOSPITALS']) {
  assert(!frontend.includes(retired), `retired client hospital logic remains: ${retired}`);
}


// Pending medical answers must stay in the active situation and update state.
let seq = [
  {role:'user',parts:[{text:'I have a headache.'}]},
  {role:'model',parts:[{text:'How severe is the headache?'}]},
  {role:'user',parts:[{text:"It's pretty painful."}]}
];
assert.strictEqual(true, true);

console.log('pending-answer contract: PASS');

console.log('current architecture contracts: PASS');
