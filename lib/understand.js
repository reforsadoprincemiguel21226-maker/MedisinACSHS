// MedisinACSHS 2.0 — Stage 1: Understanding
//
// Turns one message into structured data:
//   { messageType, topics, severity, confidence, matchedSignals }
//
// "topics" is an array on purpose: a single message can genuinely mention
// more than one thing ("masakit ang tiyan ko, medyo dizzy din" — stomach
// pain AND dizziness). Collapsing that to one topic silently drops
// information the later Decision/Kit stages would need. When exactly one
// thing is mentioned, topics is just a one-element array.
//
// Explicitly OUT of scope here (do not add until later stages pass):
//   - RAG / knowledge retrieval          (Stage 3)
//   - kit contents                       (Stage 4)
//   - conversation history / context     (Stage 5)  <- this fn takes ONE message
//   - natural-language response text     (Stage 6)
//   - hospital lookup by location        (Stage 7)
//
// This is deliberately a pure function: same input text always produces
// the same output. No hidden state, no network calls, no LLM. That's what
// makes it testable and what makes "which layer is responsible" answerable.

const {
  TOPIC_KEYWORDS,
  GENERIC_MEDICAL_WORDS,
  GREETING_PHRASES,
  CASUAL_PHRASES,
  HOSPITAL_PHRASES,
  INTENSIFIERS,
  EMERGENCY_OVERRIDE_PHRASES,
} = require("../data/topic-keywords.js");
const { KNOWN_PLACE_NAMES } = require("../data/locations.js");

// Baseline severity for each topic, BEFORE checking for intensifiers or
// emergency-override phrases in the actual message. This encodes Rule 2
// (escalate based on evidence, not by default) and Rule 1 (don't make
// ordinary symptoms sound scarier than they are) from the handoff brief.
const TOPIC_BASELINE_SEVERITY = {
  minor_wound: "minor",
  burn: "minor",
  fever: "minor",
  sleepiness: "minor",
  headache: "minor",
  skin_rash: "minor",
  dizziness: "minor",
  nausea: "minor",
  stomach_pain: "minor",
  cough: "minor",
  sore_throat: "minor",
  injury: "minor",
  breathing: "potentially_severe",
  chest_pain: "potentially_severe",
  fainting: "emergency",
  choking: "potentially_severe",
  seizure: "emergency",
  allergy: "minor",
  eye_issue: "minor",
  chemical_exposure: "emergency",
  head_injury: "potentially_severe",
  nosebleed: "minor",
  runny_nose: "minor",
  diarrhea: "minor",
  palpitations: "potentially_severe",
  weakness: "minor",
  fatigue: "minor",
  anxiety: "minor",
  cold_exposure: "potentially_severe",
  heat_exhaustion: "potentially_severe",
  spinal_injury: "emergency",
  confusion: "potentially_severe",
  severe_bleeding: "emergency",
  other_medical: "unknown",
};

const SEVERITY_ORDER = ["unknown", "minor", "potentially_severe", "emergency"];

// Topics checked first regardless of where they're mentioned in the
// message — a bleeding or breathing mention shouldn't lose priority just
// because it comes second in the sentence.
const URGENT_TOPICS = ["severe_bleeding", "fainting", "seizure", "spinal_injury", "breathing", "chest_pain"];

function escalateSeverity(current) {
  const idx = SEVERITY_ORDER.indexOf(current);
  if (idx === -1 || idx === SEVERITY_ORDER.length - 1) return current;
  return SEVERITY_ORDER[idx + 1];
}

function maxSeverity(a, b) {
  return SEVERITY_ORDER.indexOf(a) >= SEVERITY_ORDER.indexOf(b) ? a : b;
}

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// True word/phrase containment check (with loose word boundaries), not
// naive substring matching — avoids matching "er" inside "her" etc.
function containsPhrase(normalizedText, phrase) {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i");
  return re.test(normalizedText);
}

function findFirstMatch(normalizedText, phraseList) {
  // Longer phrases first so "chest pain" wins over any looser overlap.
  const sorted = [...phraseList].sort((a, b) => b.length - a.length);
  for (const phrase of sorted) {
    if (containsPhrase(normalizedText, phrase)) return phrase;
  }
  return null;
}

/**
 * Find every topic mentioned in the message, not just one.
 * Ordering: URGENT_TOPICS first (in their fixed safety-critical order,
 * regardless of mention position), then everything else in the order it
 * was actually mentioned in the text.
 * @returns {Array<{topic: string, matchedSignal: string}>}
 */
function detectTopics(normalizedText) {
  const found = [];
  const seen = new Set();

  for (const topic of URGENT_TOPICS) {
    const match = findFirstMatch(normalizedText, TOPIC_KEYWORDS[topic]);
    if (match) {
      found.push({ topic, matchedSignal: match, index: normalizedText.indexOf(match) });
      seen.add(topic);
    }
  }

  const remaining = [];
  for (const topic of Object.keys(TOPIC_KEYWORDS)) {
    if (seen.has(topic)) continue;
    const match = findFirstMatch(normalizedText, TOPIC_KEYWORDS[topic]);
    if (match) {
      remaining.push({ topic, matchedSignal: match, index: normalizedText.indexOf(match) });
    }
  }
  remaining.sort((a, b) => a.index - b.index);

  return [...found, ...remaining].map(({ topic, matchedSignal }) => ({ topic, matchedSignal }));
}

function isKnownPlaceName(normalizedText) {
  // Message type "location" is meant for short, place-only replies
  // (e.g. answering "hospital near me" with "Antipolo"), not a sentence
  // that merely mentions a place in passing. Keep it conservative: only
  // fire when the whole message is essentially just the place name.
  const stripped = normalizedText.replace(/^(sa|in|near|malapit sa)\s+/i, "").trim();
  return KNOWN_PLACE_NAMES.includes(stripped);
}

function deriveSeverityForTopic(normalizedText, topic) {
  const hasEmergencyOverride = EMERGENCY_OVERRIDE_PHRASES.some((p) =>
    containsPhrase(normalizedText, p)
  );
  if (hasEmergencyOverride) return "emergency";

  let severity = TOPIC_BASELINE_SEVERITY[topic] || "unknown";

  // A user saying a wound is "deep" is meaningful evidence even when they
  // do not use words such as "severe". Keep this below emergency by default,
  // but do not let the generic "cut/wound" baseline incorrectly label it
  // minor.
  if (topic === "minor_wound" &&
      ["deep cut", "deep wound", "malalim na hiwa", "malalim na sugat", "malalim ang hiwa", "malalim ang sugat"]
        .some((p) => containsPhrase(normalizedText, p))) {
    severity = "potentially_severe";
  }

  // Explicitly large-volume bleeding is emergency evidence even when the
  // user phrases it naturally as "bleeding quite a lot" rather than using
  // the exact words "heavy" or "severe". Keep this wound-specific so phrases
  // such as "a lot of coughing" cannot accidentally become emergencies.
  if (topic === "minor_wound" &&
      ["bleeding quite a lot", "bleeding a lot", "bleeding heavily", "bleeding badly", "a lot of blood", "lots of blood", "quite a lot of blood", "maraming dugo", "marami ang dugo", "malakas ang dugo", "malakas ang pagdurugo"]
        .some((p) => containsPhrase(normalizedText, p))) {
    severity = "emergency";
  }

  const hasIntensifier = INTENSIFIERS.some((p) => containsPhrase(normalizedText, p));
  if (hasIntensifier && topic) {
    severity = escalateSeverity(severity);
  }

  return severity;
}

// Combined severity across every topic mentioned: the single most severe
// reading wins. One emergency-level topic should not get diluted by also
// mentioning something minor in the same message.
function deriveOverallSeverity(normalizedText, topics) {
  if (topics.length === 0) return "unknown";
  return topics.reduce(
    (worst, topic) => maxSeverity(worst, deriveSeverityForTopic(normalizedText, topic)),
    "unknown"
  );
}

function wordCount(normalizedText) {
  return normalizedText.length === 0 ? 0 : normalizedText.split(" ").length;
}

/**
 * Classify a single message. Pure function, no side effects.
 * @param {string} rawText
 * @returns {{
 *   messageType: "greeting"|"vague_request"|"medical"|"hospital"|"location"|"other",
 *   topics: string[],
 *   severity: "unknown"|"minor"|"potentially_severe"|"emergency",
 *   confidence: number,
 *   matchedSignals: string[]
 * }}
 */
function understandMessage(rawText) {
  const text = normalize(rawText);

  if (text.length === 0) {
    return { messageType: "other", topics: [], severity: "unknown", confidence: 0, matchedSignals: [] };
  }

  // 1. Greeting — checked first since greetings should never be
  //    misread as vague medical requests (Rule 5: "How can I help?" is
  //    fine for greetings, not for obvious symptom statements).
  const greetingMatch = findFirstMatch(text, GREETING_PHRASES);
  if (greetingMatch && wordCount(text) <= 4) {
    return {
      messageType: "greeting",
      topics: [],
      severity: "unknown",
      confidence: 0.9,
      matchedSignals: [greetingMatch],
    };
  }

  // 2. Casual conversational acknowledgments are kept separate from the
  // medical pipeline. This is important for turns such as "thanks" after a
  // medical answer: they should not reopen or advance the medical workflow.
  const casualMatch = CASUAL_PHRASES.find((phrase) => text === phrase);
  if (casualMatch && wordCount(text) <= 6) {
    return {
      messageType: "casual",
      topics: [],
      severity: "unknown",
      confidence: 0.9,
      matchedSignals: [casualMatch],
    };
  }

  // 2. Location — a bare place name, most useful as a reply to a prior
  //    hospital question. No context is available yet in Stage 1, so
  //    this only tags the message type; deciding what to DO with it is
  //    Stage 5 (context) + Stage 7 (hospitals).
  if (isKnownPlaceName(text)) {
    return {
      messageType: "location",
      topics: [],
      severity: "unknown",
      confidence: 0.85,
      matchedSignals: [text],
    };
  }

  // 3. Hospital request — checked before medical topics so "hospital
  //    near me" is not misread as a symptom statement.
  const hospitalMatch = findFirstMatch(text, HOSPITAL_PHRASES);
  if (hospitalMatch) {
    return {
      messageType: "hospital",
      topics: [],
      severity: "unknown",
      confidence: 0.85,
      matchedSignals: [hospitalMatch],
    };
  }

  // 4. Clear emergency language must be recognized even when it does not
  // map neatly to an ordinary symptom topic.
  const directEmergencyPhrases = [
    "unresponsive", "not responding", "isn't responding", "is not responding",
    "collapsed and isn't responding", "collapsed and is not responding",
    "suddenly collapsed and isn't responding", "suddenly collapsed and is not responding",
    "not breathing", "hindi humihinga", "walang malay"
  ];
  const directEmergency = directEmergencyPhrases.find((p) => containsPhrase(text, p));
  if (directEmergency) {
    return {
      messageType: "medical",
      topics: ["fainting"],
      severity: "emergency",
      confidence: 0.98,
      matchedSignals: [`emergency: ${directEmergency}`]
    };
  }

  // 5. Every medical topic mentioned — not just the first/loudest one.
  const topicMatches = detectTopics(text);
  if (topicMatches.length > 0) {
    const topics = topicMatches.map((m) => m.topic);
    const severity = deriveOverallSeverity(text, topics);
    return {
      messageType: "medical",
      topics,
      severity,
      confidence: 0.8,
      matchedSignals: topicMatches.map((m) => m.matchedSignal),
    };
  }

  // 5. Generic medical language without a specific recognizable topic.
  const genericMatch = findFirstMatch(text, GENERIC_MEDICAL_WORDS);
  if (genericMatch) {
    const severity = deriveSeverityForTopic(text, "other_medical");
    return {
      messageType: "medical",
      topics: ["other_medical"],
      severity,
      confidence: 0.5,
      matchedSignals: [genericMatch],
    };
  }

  // 6. Short, non-specific message with no medical/greeting/hospital/
  //    location signal — a vague request rather than "other".
  if (wordCount(text) <= 3) {
    return {
      messageType: "vague_request",
      topics: [],
      severity: "unknown",
      confidence: 0.4,
      matchedSignals: [],
    };
  }

  // 7. Fallback — genuinely doesn't fit a recognized category.
  return {
    messageType: "other",
    topics: [],
    severity: "unknown",
    confidence: 0.3,
    matchedSignals: [],
  };
}

module.exports = { understandMessage, TOPIC_BASELINE_SEVERITY, SEVERITY_ORDER };

