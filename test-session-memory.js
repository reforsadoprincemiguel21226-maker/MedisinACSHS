const assert = require('assert');
const { blankMemory, buildMemory } = require('./lib/session-memory.js');
const { blankContext, updateContext } = require('./lib/context.js');
const { understandMessage } = require('./lib/understand.js');
const { decide } = require('./lib/decide.js');

let ctx = blankContext();
let u = understandMessage('I cut my finger and it is bleeding');
let d = decide(u, 'I cut my finger and it is bleeding');
ctx = updateContext(ctx, 'I cut my finger and it is bleeding', u, d);
const memory1 = buildMemory(blankMemory(), ctx, 'I cut my finger and it is bleeding', 'For a small cut, clean it and cover it.', d);

u = understandMessage('no bro');
d = decide(u, 'no bro');
ctx = updateContext(ctx, 'no bro', u, d);
assert(ctx.activeSituation, 'casual/uncategorized turn must not erase active situation');
const memory2 = buildMemory(memory1, ctx, 'no bro', 'Okay — I am still with you on the cut.', d);
assert.strictEqual(memory2.conversationSummary.activeTopic, 'minor_wound');
assert.strictEqual(memory2.recentTurns.length, 2);
console.log('session memory: PASS');
