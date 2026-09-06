// MedisinACSHS 2.0 — Stage 2.1: Decision + information sufficiency
// Deterministic decision planning. No RAG, Ollama, kit/hospital data,
// conversation context, or natural-language response generation.
//
// Stage 2.1 adds one important responsibility:
// decide whether the current information is sufficient for useful guidance.
// It identifies the kind of information that is missing, but DOES NOT write
// the question. Later response-generation/context stages can turn this into
// natural language and ask only the highest-value question first.
const SEVERITY_ORDER = ["unknown", "minor", "potentially_severe", "emergency"];


function messageContains(text, pattern) {
  return pattern.test(String(text || ''));
}


function isAmbiguousSymptomStatement(message, topics) {
  const text = String(message || '').toLowerCase().normalize('NFKC').replace(/\s+/g, ' ').trim();
  if (topics.length !== 1 || text.split(' ').length > 8) return false;
  const lowContextTopics = new Set(['sleepiness', 'fatigue', 'dizziness', 'weakness', 'headache', 'nausea']);
  if (!topics.every(topic => lowContextTopics.has(topic))) return false;
  if (text.includes('?')) return false;
  const explicitRequest = /\b(why|how|what|is this|is it|normal|should i|can i|help|advice|what can i do|ano ang|bakit|paano|normal ba|dapat ba|tulong)\b/i.test(text);
  if (explicitRequest) return false;
  const detailSignal = /\b(no|yes|yeah|yep|oo|opo|hindi|slept|sleep|rested|last night|yesterday|today|pain|painful|hurt|vomit|vomiting|nausea|dizziness|dizzy|faint|fainted|chest pain|shortness of breath|severe|moderate|mild|worse|worsening|better|improving|suddenly|bigla|matindi|malala|masakit|nahihilo|nasusuka|nanghihina|pagod|kaunti|marami|malakas)\b/i.test(text.replace(/\b(sleepy|tired|dizzy|nauseous|weak|headache)\b/gi, ''));
  if (detailSignal) return false;
  const urgent = /\b(severe|very|extreme|extremely|worst|faint|fainted|confused|confusion|can't breathe|cannot breathe|hirap huminga|nahimatay|malala|matindi|lumalala|suddenly)\b/i.test(text);
  return !urgent;
}

function hasCurrentDetail(message, category) {
  switch (category) {
    case 'bleeding_status':
      return messageContains(message, /^(yes|yeah|yep|yup|oo|opo|no|nope|nah|hindi|hindi po|not really)\s*[.!?]*$/i)
        || messageContains(message, /\b(not bleeding|no bleeding|isn'?t bleeding|is not bleeding|stopped bleeding|still bleeding|bleeding a lot|bleeding badly|bleeding a little|small bleeding|a little bleeding|slight bleeding|won'?t stop bleeding|dumudugo|hindi dumudugo|tumigil ang dugo|hindi tumitigil ang dugo)\b/i);
    case 'wound_location':
      return messageContains(message, /\b(on|at|in|sa)\s+(my|the|aking)\s+(finger|hand|arm|leg|foot|knee|head|face|daliri|kamay|braso|binti|paa|tuhod|mukha)\b/i) || messageContains(message, /\b(finger|hand|arm|leg|foot|knee|head|face|daliri|kamay|braso|binti|paa|tuhod|mukha)\b/i);
    case 'burn_extent_or_location':
      return messageContains(message, /\b(small|large|tiny|wide|minor|major|first degree|second degree|third degree|hand|arm|leg|face|chest|back|finger|daliri|kamay|braso|binti|mukha|dibdib|likod)\b/i);
    case 'injury_severity_or_function':
      return messageContains(message, /\b(can walk|can't walk|cannot walk|can move|can't move|cannot move|swollen|swelling|deformed|numb|mild|moderate|severe|matindi|malala|hindi makalakad|makalakad|makagalaw|hindi makagalaw)\b/i);
    case 'associated_symptoms_or_severity':
      return messageContains(message, /\b(mild|moderate|severe|very|fainted|passed out|chest pain|shortness of breath|vomit|vomiting|lagnat|malala|matindi)\b/i);
    case 'pain_severity_or_red_flags':
      return messageContains(message, /\b(mild|moderate|severe|very painful|worst|blood|vomit|vomiting|fainted|passed out|matindi|malala|sobrang sakit)\b/i);
    case 'temperature_or_duration':
      return messageContains(message, /\b(\d+(?:\.\d+)?\s*(?:°\s*)?(?:c|f)|temperature|degree|degrees|yesterday|today|days?|hours?|weeks?|kahapon|ngayon|araw|oras)\b/i);
    case 'severity_or_worsening_details':
      return messageContains(message, /\b(mild|moderate|severe|worse|worsening|getting worse|better|improving|matindi|malala|lumalala|gumagaling)\b/i);
    case 'symptom_context':
      return messageContains(message, /\b(no|nope|nah|not really|yes|yeah|yep|oo|opo|hindi|slept|sleep|rest|tulog|natulog|pahinga|kagabi|last night|yesterday|today|hours?|usual|unusual)\b/i);
    case 'symptoms_or_relevant_details':
      return messageContains(message, /\b(pain|painful|hurt|hurts|bleeding|blood|vomit|vomiting|dizzy|dizziness|sleepy|tired|fever|cough|rash|swollen|swelling|started|since|today|yesterday|hours?|days?|morning|night|last night|a little|slight|moderate|severe|mild|matindi|malala|kaunti|konti|marami|malakas|masakit|nahihilo|nasusuka|nanghihina|pagod|antok|sakit)\b/i);
    default:
      return false;
  }
}

function filterAnsweredDetails(message, categories) {
  return categories.filter((category) => !hasCurrentDetail(message, category));
}

function baseDecision() {
  return {
    responseType: "general_information",
    urgency: "routine",
    firstAid: false,
    followUp: false,
    needsMoreInfo: false,
    missingInfo: [],
    hospital: false,
    hotline: false,
    needsLocation: false,
    kitReady: false,
    reason: "No specific action is required from the available information.",
  };
}

function decide(understanding, rawMessage = "") {
  const u = understanding || {};
  const type = u.messageType || "other";
  const topics = Array.isArray(u.topics) ? u.topics : [];
  const severity = SEVERITY_ORDER.includes(u.severity) ? u.severity : "unknown";
  const base = baseDecision();

  if (type === "greeting") {
    return { ...base, responseType: "greeting", reason: "The message is a greeting." };
  }

  if (type === "casual") {
    return {
      ...base,
      responseType: "casual_conversation",
      reason: "The message is a normal conversational turn and does not introduce a medical action."
    };
  }

  if (type === "vague_request") {
    return {
      ...base,
      responseType: "clarify_or_capabilities",
      followUp: true,
      needsMoreInfo: true,
      missingInfo: ["request_or_problem"],
      reason: "The user has not provided enough information to choose a specific action.",
    };
  }

  if (type === "hospital") {
    return {
      ...base,
      responseType: "hospital_lookup",
      followUp: true,
      needsMoreInfo: true,
      missingInfo: ["current_location"],
      hospital: true,
      needsLocation: true,
      reason: "Hospital recommendations depend on the user's current city or barangay.",
    };
  }

  if (type === "location") {
    return {
      ...base,
      responseType: "resolve_location_context",
      reason: "A location was supplied, but Stage 2 has no conversation context to know why.",
    };
  }

  if (type === "medical") {
    if (topics.includes("cpr") && u.severity !== "emergency") {
      return { ...base, responseType: "cpr_guidance", urgency: "urgent", firstAid: true, kitReady: true, followUp: false, needsMoreInfo: false, missingInfo: [], reason: "CPR is safety-critical guidance and should be presented as explicit ordered steps." };
    }
    const ambiguousMissing = topics.includes("sleepiness")
      ? "symptom_context"
      : topics.includes("headache")
        ? "pain_severity_or_red_flags"
        : topics.includes("dizziness") || topics.includes("nausea") || topics.includes("weakness")
          ? "associated_symptoms_or_severity"
          : "symptoms_or_relevant_details";
    if (isAmbiguousSymptomStatement(rawMessage, topics) && severity !== "emergency") {
      const missingInfo = [ambiguousMissing];
      return {
        ...base,
        responseType: "medical_guidance_with_followup",
        urgency: "routine",
        firstAid: true,
        kitReady: false,
        followUp: true,
        needsMoreInfo: true,
        missingInfo,
        reason: "The message names an everyday symptom without enough context for highly specific guidance, so provide safe general guidance and ask one useful follow-up.",
      };
    }

    if (severity === "emergency") {
      return {
        ...base,
        responseType: "emergency_first_aid",
        urgency: "emergency",
        firstAid: true,
        kitReady: true,
        hospital: true,
        hotline: true,
        needsLocation: true,
        reason: "The understanding layer identified emergency-level evidence, so action should not be delayed by routine follow-up questions.",
      };
    }

    if (severity === "potentially_severe") {
      return {
        ...base,
        responseType: "urgent_medical_guidance",
        urgency: "urgent",
        firstAid: true,
        kitReady: false,
        followUp: true,
        needsMoreInfo: true,
        missingInfo: ["severity_or_worsening_details"],
        hospital: true,
        reason: "The situation may require prompt professional assessment based on the available evidence; additional details can refine the guidance.",
      };
    }

    if (severity === "minor") {
      const firstAidTopics = [
        "minor_wound", "burn", "injury", "sprain", "fracture", "dislocation", "fever", "headache", "dizziness",
        "nausea", "stomach_pain", "cough", "sore_throat", "sleepiness",
        "eye_issue", "nosebleed", "runny_nose", "diarrhea", "weakness", "cold_exposure",
        "allergy", "chemical_exposure", "head_injury", "palpitations", "fatigue", "anxiety", "skin_rash",
        "heat_exhaustion", "choking", "seizure", "spinal_injury", "confusion", "fracture", "dislocation", "sprain", "severe_bleeding", "cpr",
      ];
      const firstAid = firstAidTopics.some((t) => topics.includes(t));

      // Ask only when the answer can materially change what we should tell
      // the user. One highest-value missing detail is enough for this stage.
      const missingInfo = [];
      if (topics.includes("minor_wound")) {
        missingInfo.push("bleeding_status", "wound_location");
      } else if (topics.includes("burn")) {
        missingInfo.push("burn_extent_or_location");
      } else if (topics.includes("fracture") || topics.includes("dislocation") || topics.includes("injury") || topics.includes("sprain")) {
        missingInfo.push("injury_severity_or_function");
      } else if (topics.includes("dizziness")) {
        missingInfo.push("associated_symptoms_or_severity");
      } else if (topics.includes("nausea")) {
        missingInfo.push("associated_symptoms_or_severity");
      } else if (topics.includes("stomach_pain")) {
        missingInfo.push("pain_severity_or_red_flags");
      } else if (topics.includes("fever")) {
        missingInfo.push("temperature_or_duration");
      } else if (topics.includes("nosebleed")) {
        missingInfo.push("severity_or_worsening_details");
      } else if (topics.includes("eye_issue")) {
        missingInfo.push("severity_or_worsening_details");
      }

      // Multiple topics can justify another question, but do not turn this
      // into a questionnaire. The response layer should ask one at a time.
      if (missingInfo.length === 0 && topics.length > 1) {
        missingInfo.push("which_symptom_is_the_main_concern");
      }

      const unresolvedMissingInfo = filterAnsweredDetails(rawMessage, missingInfo);
      const followUp = unresolvedMissingInfo.length > 0;
      const explicitMinorWound = Array.isArray(u.matchedSignals) && u.matchedSignals.some(signal =>
        ["small cut", "minor cut", "small wound", "maliit akong sugat", "maliit na sugat", "scratch", "scrape", "gasgas", "splinter", "tinik", "tinikan"].includes(signal)
      );
      const explicitBleedingStatement = Array.isArray(u.matchedSignals) && u.matchedSignals.some(signal =>
        ["bleeding", "bleed", "dumudugo", "blood", "nosebleed", "heavy bleeding", "severe bleeding"].includes(signal)
      );
      const kitReady = firstAid && (
        topics.includes("fever") ||
        topics.includes("burn") ||
        topics.includes("injury") ||
        topics.includes("eye_issue") ||
        topics.includes("nosebleed") ||
        topics.includes("cold_exposure") ||
        topics.length > 1 ||
        (topics.includes("minor_wound") && (explicitMinorWound || explicitBleedingStatement || unresolvedMissingInfo.length === 0))
      );
      // A generic wound statement is too underspecified for even a generic
      // wound-care instruction. Do not let Stage 6 turn "sugat" or
      // "sugat, dugo" into treatment plus a kit offer before we know the
      // bleeding status. A clearly described small cut/scratch remains
      // eligible for useful baseline care while we clarify the next detail.
      const woundNeedsClarificationOnly = topics.includes("minor_wound") &&
        !explicitMinorWound && !explicitBleedingStatement && unresolvedMissingInfo.length > 0;

      if (followUp) {
        return {
          ...base,
          responseType: woundNeedsClarificationOnly ? "medical_clarification_only" : "medical_guidance_with_followup",
          firstAid: woundNeedsClarificationOnly ? false : firstAid,
          kitReady: woundNeedsClarificationOnly ? false : kitReady,
          followUp: true,
          needsMoreInfo: true,
          clarificationOnly: woundNeedsClarificationOnly,
          missingInfo: unresolvedMissingInfo,
          reason: woundNeedsClarificationOnly
            ? "The wound description is too underspecified for safe general wound-care instructions, so ask the highest-value clarification first."
            : "A medical topic is recognized and safe general guidance is available, but one or more details would improve specificity."
        };
      }

      return {
        ...base,
        responseType: firstAid ? "minor_first_aid" : "general_medical_information",
        firstAid,
        kitReady,
        followUp: false,
        needsMoreInfo: false,
        missingInfo: [],
        reason: "The available information is sufficient for the applicable general guidance; do not escalate without additional evidence.",
      };
    }

    return {
      ...base,
      responseType: "medical_guidance_with_followup",
      firstAid: true,
      followUp: true,
      needsMoreInfo: true,
      missingInfo: ["symptoms_or_relevant_details"],
      reason: "A medical concern is present but no specific topic is established; provide only conservative general guidance and ask for the most useful detail.",
    };
  }

  return base;
}

module.exports = { decide, SEVERITY_ORDER, isAmbiguousSymptomStatement };
