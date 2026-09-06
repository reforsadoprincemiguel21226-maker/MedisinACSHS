// MedisinACSHS 2.0 — Stage 5: relevance-driven conversation context
//
// Context is a compact state layer between turns. It does NOT reclassify
// messages, diagnose, retrieve knowledge, select kit items, or generate text.
// Stage 1 remains authoritative for the current message; Stage 2.1 remains
// authoritative for the current decision.
const { TOWN_ALIASES } = require('../data/locations.js');

const SEVERITY_ORDER = ['unknown', 'minor', 'potentially_severe', 'emergency'];
const INFO_CATEGORIES = new Set([
  'bleeding_status', 'wound_location', 'burn_extent_or_location',
  'injury_severity_or_function', 'associated_symptoms_or_severity',
  'pain_severity_or_red_flags', 'temperature_or_duration',
  'severity_or_worsening_details', 'current_location',
  'which_symptom_is_the_main_concern', 'request_or_problem',
  'symptoms_or_relevant_details', 'symptom_context',
]);

function blankContext() {
  return {
    version: 1,
    activeSituation: null,
    pendingInfo: [],
    facts: {},
    activeIntent: null,
    originMessage: '',
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalize(text) {
  return String(text || '').toLowerCase().normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function contains(text, phrase) {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(text);
}

function extractKnownLocation(text) {
  const clean = normalize(text);
  const names = Object.keys(TOWN_ALIASES).sort((a, b) => b.length - a.length);
  for (const name of names) {
    if (contains(clean, name)) return TOWN_ALIASES[name];
  }
  return null;
}

function sameTopic(situation, understanding) {
  const previous = new Set(situation?.topics || []);
  const current = new Set(understanding?.topics || []);
  return [...current].some(topic => previous.has(topic));
}

function highestSeverity(a, b) {
  return SEVERITY_ORDER.indexOf(a) >= SEVERITY_ORDER.indexOf(b) ? a : b;
}

function explicitlyAnswers(text, category) {
  switch (category) {
    case 'bleeding_status':
      // A bare yes/no is a valid answer here because Stage 6 asked a single
      // binary bleeding question immediately before this turn. Do not apply
      // this shortcut to unrelated categories such as wound location.
      return /^(yes|yeah|yep|yup|oo|opo|no|nope|nah|hindi|hindi po|not really)\s*[.!?]*$/i.test(text)
        || /\b(not bleeding|no bleeding|isn't bleeding|is not bleeding|stopped bleeding|bleeding stopped|the bleeding stopped|it stopped bleeding|it has stopped bleeding|still bleeding|bleeding a lot|bleeding heavily|heavy bleeding|bleeding badly|bleeding a little|small bleeding|a little bleeding|slight bleeding|won't stop bleeding|wont stop bleeding|dumudugo|hindi dumudugo|tumigil ang dugo|tumigil na ang dugo|hindi tumitigil ang dugo|meron|may dugo|kaunti|konti|marami|malakas ang dugo|yes a little|yes small|a little|small bleeding|light bleeding|slight bleeding)\b/i.test(text);
    case 'wound_location':
      return /\b(on|at|in|sa)\s+(my|the|aking|kamay|braso|daliri|finger|hand|arm|leg|paa|foot|tuhod|knee|ulo|head|face|mukha)\b/i.test(text) || /\b(finger|hand|arm|leg|foot|knee|head|face|daliri|kamay|braso|binti|paa|tuhod|mukha)\b/i.test(text);
    case 'burn_extent_or_location':
      return /\b(small|large|tiny|wide|minor|major|first degree|second degree|third degree|hand|arm|leg|face|chest|back|finger|daliri|kamay|braso|binti|mukha|dibdib|likod)\b/i.test(text);
    case 'injury_severity_or_function':
      return /\b(can walk|can't walk|cannot walk|can move|can't move|cannot move|swollen|swelling|deformed|numb|matindi|malala|mild|severe|hindi makalakad|makalakad|makagalaw|hindi makagalaw)\b/i.test(text);
    case 'associated_symptoms_or_severity':
      return /\b(mild|moderate|severe|very|fainted|passed out|chest pain|shortness of breath|vomit|vomiting|lagnat|malala|matindi)\b/i.test(text);
    case 'pain_severity_or_red_flags':
      return /\b(mild|moderate|severe|very painful|worst|blood|vomit|vomiting|fainted|passed out|matindi|malala|sobrang sakit)\b/i.test(text);
    case 'temperature_or_duration':
      return /\b(\d+(?:\.\d+)?\s*(?:°\s*)?(?:c|f)|temperature|degree|degrees|yesterday|today|days?|hours?|weeks?|kahapon|ngayon|araw|oras)\b/i.test(text);
    case 'severity_or_worsening_details':
      return /\b(mild|moderate|severe|worse|worsening|getting worse|better|improving|matindi|malala|lumalala|gumagaling)\b/i.test(text);
    case 'current_location':
      return !!extractKnownLocation(text);
    case 'which_symptom_is_the_main_concern':
      return /\b(main|mainly|mostly|worst|pinakamasakit|pinakamalaking problema|pinakamalala)\b/i.test(text);
    case 'symptom_context':
      // Do not let the symptom itself (e.g. "sleepy" / "antok") satisfy
      // the pending question. This category is asking about sleep/rest context,
      // so only answers that provide that context should be stored as a fact.
      return /^(?:no|nope|nah|not really|yes|yeah|yep|oo|opo|hindi|hindi po)\s*[.!?]*$/i.test(text)
        || /\b(slept badly|slept well|didn'?t sleep|did not sleep|sleep well|sleep badly|not enough sleep|not enough rest|lack of sleep|rested|didn'?t rest|did not rest|tulog|natulog|pahinga|kagabi|last night|usual|unusual|sleepier than normal|more sleepy than usual)\b/i.test(text);
    case 'request_or_problem':
    case 'symptoms_or_relevant_details':
      return normalize(text).length > 0;
    default:
      return false;
  }
}


function looksLikeNewUnrelatedTopic(understanding, activeSituation) {
  if (!understanding || understanding.messageType !== 'medical') return false;
  const current = new Set(understanding.topics || []);
  const previous = new Set(activeSituation?.topics || []);
  if (current.size === 0 || previous.size === 0) return false;
  return ![...current].some(topic => previous.has(topic));
}

function pendingAnswerLooksPlausible(text, category) {
  const t = normalize(text);
  if (!t) return false;
  if (category === 'bleeding_status') return explicitlyAnswers(t, category);
  if (category === 'wound_location') return explicitlyAnswers(t, category);
  if (category === 'symptom_context') return /\b(no|nope|nah|not really|yes|yeah|yep|oo|opo|hindi|slept|sleep|rest|tulog|natulog|pahinga|kagabi|last night|usual|unusual)\b/i.test(t);
  if (category === 'pain_severity_or_red_flags') return /\b(pain|painful|hurt|hurts|mild|moderate|severe|very|worst|matindi|malala|sobrang sakit|vomit|vomiting|blood|faint|fainted|dizzy|confused)\b/i.test(t);
  if (category === 'associated_symptoms_or_severity') return /\b(mild|moderate|severe|very|pain|painful|hurt|vomit|vomiting|dizzy|dizziness|faint|fainted|chest pain|shortness of breath|lagnat|matindi|malala|nahihilo|nasusuka|nanghihina|weak|weakness|worse|worsening|sudden|bigla)\b/i.test(t);
  if (category === 'temperature_or_duration') return /\b(\d+(?:\.\d+)?\s*(?:°\s*)?(?:c|f)|temperature|degree|degrees|yesterday|today|days?|hours?|weeks?|kahapon|ngayon|araw|oras|since|started|nagsimula)\b/i.test(t);
  if (category === 'severity_or_worsening_details') return /\b(mild|moderate|severe|worse|worsening|getting worse|better|improving|matindi|malala|lumalala|gumagaling|heavy|a lot|lot of blood|hindi tumitigil|di tumitigil)\b/i.test(t);
  if (category === 'injury_severity_or_function') return /\b(can walk|can't walk|cannot walk|can move|can't move|cannot move|swollen|swelling|deformed|numb|pain|painful|mild|moderate|severe|matindi|malala|hindi makalakad|makalakad|makagalaw|hindi makagalaw)\b/i.test(t);
  if (category === 'wound_location') return explicitlyAnswers(t, category);
  return false;
}

function sanitizeInputContext(input) {
  const base = blankContext();
  if (!input || typeof input !== 'object') return base;
  if (input.version === 1) base.version = 1;
  if (input.activeIntent === 'hospital_lookup' || input.activeIntent === 'medical') base.activeIntent = input.activeIntent;
  if (typeof input.originMessage === 'string') base.originMessage = input.originMessage.slice(0, 1000);
  if (input.activeSituation && typeof input.activeSituation === 'object') {
    const s = input.activeSituation;
    base.activeSituation = {
      messageType: typeof s.messageType === 'string' ? s.messageType : 'other',
      topics: Array.isArray(s.topics) ? s.topics.filter(x => typeof x === 'string') : [],
      severity: SEVERITY_ORDER.includes(s.severity) ? s.severity : 'unknown',
    };
  }
  if (Array.isArray(input.pendingInfo)) base.pendingInfo = input.pendingInfo.filter(x => INFO_CATEGORIES.has(x));
  if (input.facts && typeof input.facts === 'object') {
    for (const [k, v] of Object.entries(input.facts)) if (INFO_CATEGORIES.has(k) && typeof v === 'string') base.facts[k] = v;
  }
  return base;
}

/**
 * Update compact conversation context from ONE new turn.
 * Stage 1/2.1 outputs are supplied by the caller and remain authoritative.
 */
function updateContext(previousContext, message, understanding, decision) {
  const context = sanitizeInputContext(previousContext);
  const u = understanding || {};
  const d = decision || {};
  const text = normalize(message);

  // Emergency evidence takes precedence and starts a fresh active situation.
  // Do not carry stale hospital intent or old symptoms into it.
  if (u.messageType === 'medical') {
    const previousTopics = new Set(context.activeSituation?.topics || []);
    const previousPendingInfo = [...context.pendingInfo];
    context.activeIntent = 'medical';
    if (!context.activeSituation || !sameTopic(context.activeSituation, u)) context.originMessage = String(message || '').slice(0, 1000);
    context.activeSituation = {
      messageType: 'medical',
      topics: Array.isArray(u.topics) ? [...u.topics] : [],
      severity: SEVERITY_ORDER.includes(u.severity) ? u.severity : 'unknown',
    };
    const currentTopics = new Set(context.activeSituation.topics);
    const sameSituation = [...currentTopics].some(topic => previousTopics.has(topic));
    const retainedFacts = {};
    for (const [key, value] of Object.entries(context.facts)) {
      // Facts are retained only when the new turn still concerns at least
      // one of the previous active topics. Hospital location is never a
      // medical fact and is deliberately dropped.
      if (key !== 'current_location' && sameSituation) retainedFacts[key] = value;
    }
    context.facts = retainedFacts;
    context.pendingInfo = Array.isArray(d.missingInfo) ? [...d.missingInfo] : [];

    // A new medical message can itself answer an existing category. Check
    // the previous pending questions as well as the current decision's
    // missingInfo. Stage 2 may already have filtered an answered detail out
    // of d.missingInfo, but that answer still needs to be stored as a fact so
    // later turns do not ask the same question again.
    const answerableCategories = [...new Set([...previousPendingInfo, ...context.pendingInfo])];
    for (const category of answerableCategories) {
      if (explicitlyAnswers(text, category)) {
        context.facts[category] = text;
        context.pendingInfo = context.pendingInfo.filter(x => x !== category);
      }
    }
    // Preserve explicit location information even when it is not currently
    // the missing field. This prevents a later answer such as "it stopped"
    // from losing the fact that the original message already said "on my hand".
    if (u.topics?.includes('minor_wound') && explicitlyAnswers(text, 'wound_location')) {
      context.facts.wound_location = text;
      context.pendingInfo = context.pendingInfo.filter(x => x !== 'wound_location');
    }
    return context;
  }

  if (u.messageType === 'hospital') {
    context.activeIntent = 'hospital_lookup';
    context.activeSituation = {
      messageType: 'hospital', topics: [], severity: 'unknown',
    };
    context.pendingInfo = ['current_location'];
    // Hospital intent supersedes an older medical situation for relevance.
    context.facts = {};
    return context;
  }

  if (u.messageType === 'location') {
    const location = extractKnownLocation(text);
    if (location) {
      // A stated location is useful context on its own, but it must not create
      // hospital intent. This lets a user say "I'm in Antipolo" first and
      // ask "hospital near me" on the next turn without making the location
      // itself a hospital request.
      context.facts.current_location = location;
      if (context.activeIntent === 'hospital_lookup') {
        context.pendingInfo = context.pendingInfo.filter(x => x !== 'current_location');
        context.activeSituation = { messageType: 'hospital', topics: [], severity: 'unknown' };
      }
    }
    return context;
  }

  // A short/uncategorized turn can still be an answer to the active
  // situation's pending information. This is context resolution, not a
  // replacement for Stage 1 classification.
  if (u.messageType === 'greeting') return context;
  if (context.activeIntent === 'medical' && context.pendingInfo.length > 0) {
    for (const category of [...context.pendingInfo]) {
      if (explicitlyAnswers(text, category)) {
        context.facts[category] = text;
        context.pendingInfo = context.pendingInfo.filter(x => x !== category);
      }
    }
  }
  // Keep the active situation through casual/uncategorized turns. A short
  // conversational message such as "no bro" must not erase a medical
  // situation that was established a few turns earlier. Relevance filtering
  // still prevents this state from being injected into unrelated responses;
  // the state is simply retained so a later follow-up can reconnect to it.
  if (u.messageType === 'other') return context;
  return context;
}

function getRelevantContext(context, understanding) {
  const c = sanitizeInputContext(context);
  const u = understanding || {};
  if (!c.activeSituation) return blankContext();

  if (u.messageType === 'medical' && c.activeIntent !== 'medical') return blankContext();
  if (u.messageType === 'hospital' && c.activeIntent !== 'hospital_lookup') return blankContext();

  if (u.messageType === 'medical') {
    const relevantFacts = {};
    for (const [key, value] of Object.entries(c.facts)) {
      if (key === 'current_location') continue;
      relevantFacts[key] = value;
    }
    return {
      version: 1,
      activeSituation: clone(c.activeSituation),
      pendingInfo: c.pendingInfo.filter(x => x !== 'current_location'),
      facts: relevantFacts,
      activeIntent: 'medical',
      originMessage: c.originMessage,
    };
  }

  // A vague/uncategorized reply can still be relevant when the active medical
  // context has pending Stage 2.1 information. This exposes only the compact
  // existing context; it does not classify the new message or create a new
  // medical intent. Stage 6 can then acknowledge the answer and ask the next
  // still-pending category, if Stage 2.1 originally requested more detail.
  if ((u.messageType === 'vague_request' || u.messageType === 'other') &&
      c.activeIntent === 'medical' && c.activeSituation) {
    const relevantFacts = {};
    for (const [key, value] of Object.entries(c.facts)) {
      if (key !== 'current_location') relevantFacts[key] = value;
    }
    return {
      version: 1,
      activeSituation: clone(c.activeSituation),
      pendingInfo: [...c.pendingInfo],
      facts: relevantFacts,
      activeIntent: 'medical',
      originMessage: c.originMessage,
    };
  }

  if (u.messageType === 'hospital' || u.messageType === 'location') {
    return {
      version: 1,
      activeSituation: clone(c.activeSituation),
      pendingInfo: [...c.pendingInfo],
      facts: c.facts.current_location ? { current_location: c.facts.current_location } : {},
      activeIntent: c.activeIntent === 'hospital_lookup' ? 'hospital_lookup' : null,
    };
  }

  return blankContext();
}

module.exports = { blankContext, updateContext, getRelevantContext, extractKnownLocation, sanitizeInputContext };
