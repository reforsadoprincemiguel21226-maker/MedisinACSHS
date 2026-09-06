const assert = require('assert');
const { buildCommunicationBrief, buildSystemPrompt, validateGeneratedReply } = require('./lib/ai-response.js');

const memory = {
  conversationSummary: {
    lastGuidance: 'Use sterile gauze and apply steady pressure.',
  },
  recentTurns: [
    { user: 'I cut my palm while opening a can.', assistant: 'Is it bleeding right now?' },
    { user: 'It is bleeding a little, but I can control it.', assistant: 'Use sterile gauze and steady pressure.' },
    { user: 'What in the kit can I use for that?', assistant: 'Use sterile gauze for pressure.' },
  ],
};

const brief = buildCommunicationBrief({
  userText: 'What should I do now?',
  understanding: { topics: ['minor_wound'], severity: 'minor' },
  decision: { urgency: 'routine', missingInfo: [] },
  context: { facts: { wound_location: 'palm', bleeding_status: 'still bleeding' } },
  guidance: {
    actions: ['Apply steady direct pressure with clean gauze or a clean cloth until bleeding is controlled.', 'Once bleeding is controlled, rinse the wound with clean running water and cover it.'],
    summary: 'Protect the wound and monitor it.',
    followUp: '',
  },
  kitItems: [{ name: 'Sterile Gauze Pads', uses: ['apply pressure to bleeding wounds'] }],
  sessionMemory: memory,
});

assert.strictEqual(brief.situation, 'minor_wound');
assert.strictEqual(brief.knownFacts.wound_location, 'palm');
assert.strictEqual(brief.knownFacts.bleeding_status, 'still bleeding');
assert.match(brief.previousGuidance, /sterile gauze/i);
assert.strictEqual(brief.recentConversation.length, 3);
assert.match(buildSystemPrompt(), /latest message, not the whole conversation/i);
assert.match(buildSystemPrompt(), /current question/i);

assert.strictEqual(validateGeneratedReply('Keep steady pressure with the gauze for now.', brief), true);
assert.strictEqual(validateGeneratedReply('You have a serious infection. Take ibuprofen 400 mg.', brief), false);
assert.strictEqual(validateGeneratedReply('', brief), false);

console.log('AI communication layer contracts: PASS');
