// Stage 1 — topic keyword data.
//
// Deliberately just data: phrase lists per topic. The matching STRATEGY
// (order, phrase-vs-word, priority) lives in lib/understand.js. Keeping
// them apart makes it obvious when someone is tempted to sneak decision
// logic in here.
//
// Multi-word phrases are listed before single words within each topic so
// callers can prefer the more specific match. Includes English and common
// Filipino/Taglish terms since the school population is mixed-language.

const TOPIC_KEYWORDS = {
  cpr: [
    "cpr", "cardiopulmonary resuscitation", "cardiac arrest", "heart stopped", "not breathing and unconscious",
  ],
  severe_bleeding: [
    "severe bleeding", "heavy bleeding", "bleeding heavily", "profuse bleeding", "bleeding a lot", "bleeding badly",
    "won't stop bleeding", "wont stop bleeding", "malakas na dumudugo", "ang lakas ng dugo", "malakas ang dugo",
    "sobrang dumudugo", "hindi tumitigil ang dugo",
  ],
  chest_pain: [
    "chest pain", "pain in my chest", "sakit ng dibdib", "sakit sa dibdib", "sumasakit dibdib ko", "sumasakit ang dibdib ko", "sumasakit ang dibdib",
    "masakit ang dibdib",
  ],
  breathing: [
    "difficulty breathing", "trouble breathing", "shortness of breath",
    "can't breathe", "cannot breathe", "cant breathe", "hard to breathe", "hirap huminga",
    "hindi makahinga", "hindi ako makahinga", "hindi na ako makahinga", "di ako makahinga",
    "hindi siya makahinga", "nahihirapan huminga", "nahihirapan akong huminga",
  ],
  choking: [
    "choking", "choked", "object stuck in throat", "something stuck in my throat", "something is stuck in my throat",
    "something stuck in the throat", "nakabara sa lalamunan", "may nakabara sa lalamunan",
    "nasasakal", "nabibilaukan",
  ],
  seizure: [
    "seizure", "having a seizure", "convulsion", "nagse-seizure", "may seizure", "kombulsyon",
  ],
  fainting: [
    "fainted", "fainting", "passed out", "lost consciousness",
    "nahimatay", "nawalan ng malay",
  ],
  eye_issue: [
    "dust in my eye", "something in my eye", "something got in my eye", "foreign object in my eye",
    "eye is red", "red eye", "alikabok sa mata", "may bagay sa mata", "may pumasok sa mata",
    "namumula ang mata",
  ],
  nosebleed: [
    "nosebleed", "bleeding nose", "my nose is bleeding", "dumudugo ang ilong", "pagdurugo ng ilong", "nose bleed",
  ],
  runny_nose: [
    "runny nose", "stuffy nose", "sipon", "baradong ilong",
  ],
  diarrhea: [
    "diarrhea", "diarrhoea", "loose stool", "nagtatae", "pagtatae",
  ],
  palpitations: [
    "heart is racing", "heart racing", "fast heartbeat", "heart beating fast", "mabilis ang tibok ng puso",
    "kumakabog ang dibdib", "palpitations",
  ],
  fatigue: [
    "tired", "fatigue", "pagod", "pagod lang ako", "sobrang pagod",
  ],
  anxiety: [
    "anxious", "anxiety", "nervous", "kinakabahan", "kabado",
  ],
  weakness: [
    "weak", "weakness", "suddenly weak", "biglang nanghina", "nanghihina",
  ],
  cold_exposure: [
    "hypothermia", "very cold", "so cold", "shivering", "shaking from cold", "nilalamig", "nanginginig",
    "basang-basa at malamig", "nabasa at sobrang lamig",
  ],
  heat_exhaustion: [
    "heat exhaustion", "heatstroke", "heat stroke", "nahilo sa init", "nahilo dahil sa init", "dizzy from the heat", "feel dizzy from the heat",
    "sobrang init", "init ng katawan",
  ],
  spinal_injury: [
    "spinal injury", "spine injury", "back injury after fall", "possible spinal injury",
    "posibleng spinal injury", "sakit sa gulugod pagkatapos mahulog",
  ],
  confusion: [
    "confused", "confusion", "suddenly confused", "biglang nalito", "nalilito",
  ],
  allergy: [
    "allergic reaction", "allergy", "itchy after eating", "nangangati pagkatapos kumain",
    "nangangati ako pagkatapos kumain", "namamaga ang lips", "namamaga ang labi", "namamaga ang dila", "my lips are swelling", "my tongue is swelling",
  ],
  chemical_exposure: [
    "chemical burn", "chemical in my eye", "chemical got in my eye", "chemical got on my skin", "chemical exposure",
    "kemikal sa mata", "kemikal sa balat", "napasukan ng kemikal",
  ],
  head_injury: [
    "head injury", "hit my head", "hit on the head", "bumped my head", "matamaan ang ulo",
    "natamaan ang ulo", "nahulog at tumama ang ulo",
  ],
  burn: [
    "burn", "burned", "burnt", "got burned", "paso", "napaso", "nasunog",
  ],
  minor_wound: [
    "small cut", "minor cut", "small wound", "cut", "wound", "maliit akong sugat", "maliit na sugat", "scratch", "scrape", "cut myself",
    "sugat", "gasgas", "nasugatan ng kaunti", "bleeding", "blood", "dugo", "dumudugo", "splinter", "tinik", "tinikan",
  ],
  dislocation: [
    "dislocation", "dislocated", "joint out of place", "joint popped out", "shoulder popped out", "shoulder dislocation", "dislocated shoulder", "balik sa joint", "na-dislocate", "dislocate", "na dislocate",
  ],
  fracture: [
    "fracture", "fractured", "broken bone", "broken bones", "broken arm", "broken leg", "broken wrist", "broken ankle", "broken finger", "broken hand", "broken foot", "broke my bone", "broke my arm", "broke my leg", "broke my wrist", "broke my ankle", "broke my finger", "broke my hand", "broke my foot", "bone is broken", "bali ang buto", "nabali ang buto", "nabali", "bali",
  ],
  sprain: [
    "sprain", "sprained", "sprain injury", "pilay", "napilay", "na-sprain",
  ],
  injury: [
    "injured", "injury", "twisted my ankle",
    "injured", "injury", "broke", "broken", "twisted my ankle", "napilay",
  ],
  fever: [
    "fever", "high temperature", "temperature", "thermometer", "°c", "degrees", "lagnat", "may lagnat", "mataas na lagnat",
  ],
  skin_rash: [
    "rash", "skin rash", "rashes", "pantal", "butlig", "namamantal",
  ],
  headache: [
    "headache", "head ache", "migraine", "my head hurts", "sakit ng ulo", "masakit ang ulo", "masakit ulo ko", "sumasakit ulo ko",
  ],
  dizziness: [
    "dizzy", "lightheaded", "light headed", "i feel dizzy", "nahihilo", "hilo", "hilo ako",
  ],
  sleepiness: [
    "sleepy", "drowsy", "antok", "inaantok", "gusto ko matulog",
  ],
  nausea: [
    "nausea", "nauseous", "feel like vomiting", "want to vomit", "i feel nauseous",
    "nasusuka", "naduwal", "parang masusuka",
  ],
  stomach_pain: [
    "stomach ache", "stomach pain", "stomachache", "abdominal pain", "my stomach hurts",
    "sakit ng tiyan", "masakit ang tiyan", "masakit tiyan", "sakit ng sikmura",
    "sumasakit ang tiyan", "sumasakit tiyan",
  ],
  cough: [
    "cough", "coughing", "ubo", "may ubo", "umuubo",
  ],
  sore_throat: [
    "sore throat", "throat hurts", "my throat hurts", "masakit lalamunan", "masakit ang lalamunan",
  ],
};

// Generic medical-ish words that, on their own, don't map to a specific
// topic above but do indicate SOME medical concern. Used for the
// other_medical fallback rather than defaulting to "other".
const GENERIC_MEDICAL_WORDS = [
  "sakit", "masakit", "sick", "hindi maganda pakiramdam",
  "not feeling well", "hindi ok", "may sakit",
];

const CASUAL_PHRASES = [
  "thanks", "thank you", "thx", "ty", "thank u", "salamat", "maraming salamat", "salamat po",
  "okay", "ok", "okey", "alright", "all right", "got it", "understood", "noted", "okay na", "ok na", "sige", "gets", "gets ko",
  "good", "nice", "great", "awesome", "amazing", "perfect", "excellent", "cool", "sweet", "nice one", "ayos", "astig", "solid", "goods",
  "wow", "whoa", "grabe", "ang lupit", "sorry", "my bad", "my mistake", "sorry po", "pasensya", "pasensya na",
  "bye", "goodbye", "see you", "see ya", "later", "talk later", "gotta go", "alis na ako", "bye po",
  "never mind", "nevermind", "forget it", "it's fine", "dont worry", "wag na", "huwag na"
];

const GREETING_PHRASES = [
  "hi", "hello", "hey", "kumusta", "kamusta", "good morning", "good afternoon",
  "good evening", "magandang umaga", "magandang hapon", "magandang gabi",
];

const HOSPITAL_PHRASES = [
  "hospital", "ospital", "pagamutan", "clinic", "klinika", "emergency room",
  "er ", "urgent care",
];

// Words that push severity up one level when combined with a topic.
const INTENSIFIERS = [
  "severe", "very severe", "matindi", "matinding", "sobrang matindi",
  "napakatindi", "malala", "lumalala", "getting worse", "sobra", "grabe",
  "extremely",
];

// Phrases that indicate emergency regardless of topic keyword matched.
const EMERGENCY_OVERRIDE_PHRASES = [
  "can't breathe", "cannot breathe", "cant breathe", "hindi na makahinga", "di ako makahinga", "not breathing",
  "hindi humihinga", "hindi ako makahinga", "hindi na ako makahinga",
  "hindi siya makahinga", "unconscious", "unresponsive", "walang malay", "namamaga ang lips", "namamaga ang labi", "namamaga ang dila", "my lips are swelling", "my tongue is swelling",
];

module.exports = {
  TOPIC_KEYWORDS,
  GENERIC_MEDICAL_WORDS,
  GREETING_PHRASES,
  HOSPITAL_PHRASES,
  CASUAL_PHRASES,
  INTENSIFIERS,
  EMERGENCY_OVERRIDE_PHRASES,
};
