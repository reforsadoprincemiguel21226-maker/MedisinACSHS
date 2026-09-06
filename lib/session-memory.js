// MedisinACSHS 2.0 — Persistent conversation memory
//
// This is deliberately NOT RAG and does not contain chain-of-thought. It is a
// compact, machine-readable snapshot of established conversation facts so a
// future AI communication layer does not have to replay the entire transcript.
// Safety decisions remain authoritative in understand/decide/context.

const MEMORY_VERSION = 1;
const MAX_RECENT_TURNS = 6;
const MAX_SUSPENDED = 4;

function cleanText(value, max = 500) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function blankMemory() {
  return {
    version: MEMORY_VERSION,
    activeContext: null,
    conversationSummary: {
      activeTopic: null,
      userGoal: null,
      knownFacts: {},
      pendingInfo: [],
      lastGuidance: '',
      unresolved: [],
    },
    recentTurns: [],
    suspendedSituations: [],
  };
}

function sanitizeMemory(input) {
  const base = blankMemory();
  if (!input || typeof input !== 'object') return base;

  if (input.activeContext && typeof input.activeContext === 'object') {
    base.activeContext = clone(input.activeContext);
  }

  const summary = input.conversationSummary;
  if (summary && typeof summary === 'object') {
    base.conversationSummary.activeTopic = cleanText(summary.activeTopic, 120) || null;
    base.conversationSummary.userGoal = cleanText(summary.userGoal, 200) || null;
    if (summary.knownFacts && typeof summary.knownFacts === 'object') {
      for (const [k, v] of Object.entries(summary.knownFacts).slice(0, 20)) {
        if (typeof v === 'string') base.conversationSummary.knownFacts[k] = cleanText(v, 250);
      }
    }
    if (Array.isArray(summary.pendingInfo)) {
      base.conversationSummary.pendingInfo = summary.pendingInfo.filter(x => typeof x === 'string').slice(0, 8);
    }
    base.conversationSummary.lastGuidance = cleanText(summary.lastGuidance, 700);
    if (Array.isArray(summary.unresolved)) {
      base.conversationSummary.unresolved = summary.unresolved.filter(x => typeof x === 'string').slice(0, 8);
    }
  }

  if (Array.isArray(input.recentTurns)) {
    base.recentTurns = input.recentTurns.slice(-MAX_RECENT_TURNS).map(t => ({
      user: cleanText(t?.user, 350),
      assistant: cleanText(t?.assistant, 500),
    })).filter(t => t.user || t.assistant);
  }

  if (Array.isArray(input.suspendedSituations)) {
    base.suspendedSituations = input.suspendedSituations.slice(-MAX_SUSPENDED).map(s => ({
      topic: cleanText(s?.topic, 120),
      originMessage: cleanText(s?.originMessage, 350),
      facts: s?.facts && typeof s.facts === 'object' ? clone(s.facts) : {},
      severity: cleanText(s?.severity, 40),
    }));
  }

  return base;
}

function topicFromContext(context) {
  return context?.activeSituation?.topics?.[0] || null;
}

function buildMemory(previous, context, userText, assistantText, decision = {}) {
  const memory = sanitizeMemory(previous);
  const previousTopic = memory.activeContext?.activeSituation?.topics?.[0] || null;
  const currentTopic = topicFromContext(context);

  // Preserve a prior medical situation as a suspended snapshot when a new
  // medical topic replaces it. This lets a later explicit reference recover it
  // without mixing facts from two situations.
  if (previousTopic && currentTopic && previousTopic !== currentTopic) {
    memory.suspendedSituations.push({
      topic: previousTopic,
      originMessage: memory.activeContext?.originMessage || '',
      facts: memory.activeContext?.facts || {},
      severity: memory.activeContext?.activeSituation?.severity || 'unknown',
    });
    memory.suspendedSituations = memory.suspendedSituations.slice(-MAX_SUSPENDED);
  }

  // Never replace an established conversation context with a blank context
  // produced by an unrelated/casual turn. A structured blank object is still
  // truthy in JavaScript, so checking only `context ? ...` would silently erase
  // the memory we worked to preserve. New active situations may replace the
  // old one, but non-contextual turns must leave the active situation intact.
  if (context?.activeSituation) {
    memory.activeContext = clone(context);
  } else if (!memory.activeContext && context) {
    memory.activeContext = clone(context);
  }
  const facts = memory.activeContext?.facts || {};
  memory.conversationSummary = {
    activeTopic: currentTopic || memory.conversationSummary.activeTopic,
    userGoal: memory.activeContext?.activeIntent || memory.conversationSummary.userGoal,
    knownFacts: Object.fromEntries(Object.entries(facts).slice(0, 20)),
    pendingInfo: Array.isArray(memory.activeContext?.pendingInfo) ? memory.activeContext.pendingInfo.slice(0, 8) : [],
    lastGuidance: cleanText(assistantText, 700),
    unresolved: Array.isArray(decision?.missingInfo) ? decision.missingInfo.slice(0, 8) : [],
  };

  memory.recentTurns.push({
    user: cleanText(userText, 350),
    assistant: cleanText(assistantText, 500),
  });
  memory.recentTurns = memory.recentTurns.slice(-MAX_RECENT_TURNS);
  return memory;
}

module.exports = { blankMemory, sanitizeMemory, buildMemory };
