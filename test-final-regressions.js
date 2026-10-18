const assert = require('assert');
const { understandMessage } = require('./lib/understand.js');
const { decide } = require('./lib/decide.js');
const { mapKitItems } = require('./lib/map-kit.js');
const fs = require('fs');
const html = fs.readFileSync('./A.i asistant.html', 'utf8');

function u(text) { return understandMessage(text); }
function d(text) { const x=u(text); return {u:x,d:decide(x,text)}; }

// Recognition / severity
let x=d('I cut my finger and it is bleeding quite a lot. What should I do?');
assert.equal(x.u.messageType, 'medical');
assert(x.u.topics.includes('minor_wound'));
assert.equal(x.u.severity, 'emergency');
assert.equal(x.d.responseType, 'emergency_first_aid');

x=d("My friend suddenly collapsed and isn't responding. What do I do?");
let curly=d("My friend suddenly collapsed and isn’t responding. What do I do?");
assert.equal(curly.u.severity, 'emergency');
assert.equal(curly.d.responseType, 'emergency_first_aid');
assert.equal(x.u.messageType, 'medical');
assert.equal(x.u.severity, 'emergency');
assert.equal(x.d.responseType, 'emergency_first_aid');

// Contextual sufficiency: location stated in the original burn turn should not
// be asked again; one useful severity question may remain.
x=d('I accidentally touched a hot pan and burned my hand. It hurts and is red.');
assert.equal(x.u.severity, 'potentially_severe');
assert.equal(x.d.responseType, 'urgent_medical_guidance');

// Kit relevance is specific, not inventory dumping.
const kit = mapKitItems(...(() => { const z=d('I have a small cut on my finger.'); return [z.u,z.d,{limit:4}]; })());
assert(kit.some(i => i.name === 'Adhesive Bandages (Assorted Sizes)'));

// UI voice contract: off by default and user messages are never spoken.
assert(/let autoSpeakReplies = false;/.test(html));
const userFn = html.match(/function addUserMessage\(text\) \{[\s\S]*?\n\}/)?.[0] || '';
assert(!/speakReply\(text\)/.test(userFn));
const typingFn = html.match(/function showTyping\(\) \{[\s\S]*?\n\}/)?.[0] || '';
assert(!/speakReply/.test(typingFn));
assert(html.includes('How ARIA decided'));
assert(html.includes('This summary shows the known facts and safety factors behind this reply, not private internal reasoning.'));
assert(!html.includes('footer-note'));
assert(!html.includes('Powered by MedisinACSHS AI - For informational purposes only'));
console.log('final regression checks: PASS');
