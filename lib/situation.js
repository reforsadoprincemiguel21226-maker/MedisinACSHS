// MedisinACSHS 2.0 — Situation State (additive state model)
//
// This layer does not diagnose or make new medical decisions. It turns the
// already-authoritative Understanding + Decision + Context outputs into a
// compact, human-readable situation state that can be used by the response
// layer and, when appropriate, shown in the UI as a transparency summary.

const TOPIC_LABELS = {
  minor_wound: 'wound or cut',
  severe_bleeding: 'severe bleeding',
  burn: 'burn',
  injury: 'injury',
  fever: 'fever',
  headache: 'headache',
  dizziness: 'dizziness',
  nausea: 'nausea',
  stomach_pain: 'stomach pain',
  cough: 'cough',
  sore_throat: 'sore throat',
  breathing: 'breathing difficulty',
  chest_pain: 'chest pain',
  fainting: 'fainting',
  seizure: 'seizure',
  allergy: 'allergy symptoms',
  eye_issue: 'eye issue',
  nosebleed: 'nosebleed',
  runny_nose: 'runny nose',
  diarrhea: 'diarrhea',
  weakness: 'weakness',
  fatigue: 'fatigue',
  anxiety: 'anxiety',
  cold_exposure: 'cold exposure',
  heat_exhaustion: 'heat exhaustion',
  chemical_exposure: 'chemical exposure',
  head_injury: 'head injury',
  palpitations: 'palpitations',
  confusion: 'confusion',
  spinal_injury: 'possible spinal injury',
  choking: 'choking',
  other_medical: 'medical concern',
};

const INFO_LABELS = {
  bleeding_status: 'whether the wound is still bleeding',
  wound_location: 'where the wound is located',
  burn_extent_or_location: 'how large/severe the burn is and where it is',
  injury_severity_or_function: 'how severe the injury is and whether movement/function is affected',
  associated_symptoms_or_severity: 'other symptoms and how severe they are',
  pain_severity_or_red_flags: 'pain severity or warning symptoms',
  temperature_or_duration: 'temperature and/or how long the fever has lasted',
  severity_or_worsening_details: 'whether it is severe or getting worse',
  current_location: 'current location',
  which_symptom_is_the_main_concern: 'which symptom is the main concern',
  request_or_problem: 'what help is being requested',
  symptoms_or_relevant_details: 'a little more detail about the symptoms',
  symptom_context: 'context around the symptom',
};

const SEVERITY_LABELS = {
  unknown: 'Not established',
  minor: 'Minor based on the information provided',
  potentially_severe: 'Potentially serious',
  emergency: 'Emergency-level',
};

const EMERGENCY_TOPICS = new Set([
  'severe_bleeding', 'fainting', 'seizure', 'spinal_injury', 'breathing', 'chest_pain',
  'chemical_exposure',
]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function labelTopic(topic) {
  return TOPIC_LABELS[topic] || String(topic || '').replace(/_/g, ' ');
}

function labelInfo(category) {
  return INFO_LABELS[category] || String(category || '').replace(/_/g, ' ');
}

function compactText(value, max = 180) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function buildSituationState(structured, options = {}) {
  const understanding = structured?.understanding || {};
  const decision = structured?.decision || {};
  const context = structured?.relevantContext || {};
  const topics = Array.isArray(understanding.topics) ? understanding.topics : [];
  const facts = context?.facts && typeof context.facts === 'object' ? context.facts : {};
  const pendingInfo = Array.isArray(decision.missingInfo) ? decision.missingInfo : [];
  const knownFacts = [];

  if (understanding.matchedSignals?.length) {
    knownFacts.push(`You mentioned: ${understanding.matchedSignals.map(compactText).join(', ')}`);
  }
  for (const [category, value] of Object.entries(facts)) {
    if (category === 'current_location') continue;
    if (typeof value === 'string' && value.trim()) {
      knownFacts.push(`${labelInfo(category)}: ${compactText(value)}`);
    }
  }

  const emergencyFlags = unique([
    ...(topics.filter(topic => EMERGENCY_TOPICS.has(topic)).map(labelTopic)),
    ...(understanding.severity === 'emergency' ? ['emergency-level evidence'] : []),
  ]);

  const relevantKit = options.kitRecommendation
    ? compactText(options.kitRecommendation, 220)
    : (decision.kitReady ? 'A relevant kit item may be available.' : 'No kit item was established for this turn.');

  const state = {
    version: 1,
    active: understanding.messageType === 'medical',
    messageType: understanding.messageType || 'other',
    topic: topics.length ? topics.map(labelTopic).join(', ') : null,
    topics: topics.map(labelTopic),
    bodyLocation: facts.wound_location || null,
    severity: understanding.severity || 'unknown',
    severityLabel: SEVERITY_LABELS[understanding.severity] || SEVERITY_LABELS.unknown,
    knownFacts: unique(knownFacts),
    unknownFacts: unique(pendingInfo.map(labelInfo)),
    timeline: null,
    changes: [],
    relevantKit,
    emergencyFlags,
    nextBestQuestion: pendingInfo.length ? labelInfo(pendingInfo[0]) : null,
    responseType: decision.responseType || null,
    urgency: decision.urgency || null,
  };

  // A hospital/location turn is a valid state too, but it is not a medical
  // situation. Keeping it explicit prevents the UI from pretending that a
  // directory lookup is a medical assessment.
  if (understanding.messageType === 'hospital' || understanding.messageType === 'location') {
    state.active = false;
    state.topic = 'hospital or medical-facility lookup';
    state.topics = ['hospital or medical-facility lookup'];
    state.severity = 'unknown';
    state.severityLabel = 'Not a medical assessment';
    state.unknownFacts = [];
    state.nextBestQuestion = null;
  }

  return state;
}

module.exports = { buildSituationState, TOPIC_LABELS, INFO_LABELS };
