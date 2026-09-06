// Standalone static file server + /api/chat. The production medical reply
// path is deterministic for speed and safety; Ollama configuration is retained
// for development/extension rather than being required for routine replies.
// RAG: retrieves matching chunks from
// admin-uploaded documents (data/rag.js) and feeds them to the model as
// context instead of letting it free-generate medical advice.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const rag = require('../data/rag.js');
// Structured medical pipeline imported from the stronger 2.0 work, while
// keeping v7's existing RAG, emotional-support, hospital, and UI behavior.
const { understandMessage } = require('./understand.js');
const { decide } = require('./decide.js');
const { blankContext, updateContext, getRelevantContext } = require('./context.js');
const { blankMemory, sanitizeMemory, buildMemory } = require('./session-memory.js');
const { mapKitItems } = require('./map-kit.js');
const { buildSituationState } = require('./situation.js');
const { MEDICAL_GUIDANCE } = require('../data/medical-guidance.js');

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434/api/chat';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen3.5:0.8b';
// If Ollama is enabled for future communication-layer work, these settings
// keep its local memory footprint bounded. Routine production replies do not
// call Ollama.
const OLLAMA_NUM_CTX = Number(process.env.OLLAMA_NUM_CTX) || 1024;
const OLLAMA_TEMPERATURE = Number(process.env.OLLAMA_TEMPERATURE) || 0.15;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const MAX_HISTORY_MESSAGES = 8;

function isAdmin(req) {
    if (!ADMIN_TOKEN) return false;
    const header = req.headers['authorization'] || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const a = Buffer.from(token);
    const b = Buffer.from(ADMIN_TOKEN);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const MIME = {
    '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.png': 'image/png', '.webmanifest': 'application/manifest+json'
};

function serveStatic(req, res) {
    let urlPath;
    try { urlPath = decodeURIComponent(req.url.split('?')[0]); }
    catch { return res.writeHead(400).end('Bad request'); }

    // Block dotfiles/dot-dirs (.git, .env, .claude, ...) and anything not in
    // the MIME allowlist, so the static server can't be used to read source
    // or config files off the disk — only the site's own known asset types.
    if (urlPath.split('/').some((seg) => seg.startsWith('.'))) return res.writeHead(403).end('Forbidden');

    const staticRoot = path.join(__dirname, '..', 'public');
    const filePath = path.join(staticRoot, urlPath === '/' ? 'index.html' : urlPath);
    const root = staticRoot + path.sep;
    if (filePath !== staticRoot && !filePath.startsWith(root)) return res.writeHead(403).end('Forbidden');

    const ext = path.extname(filePath);
    if (!MIME[ext]) return res.writeHead(404).end('Not found');

    fs.readFile(filePath, (err, data) => {
        if (err) return res.writeHead(404).end('Not found');
        res.writeHead(200, { 'Content-Type': MIME[ext] });
        res.end(data);
    });
}

const MAX_CHAT_BODY_BYTES = 64 * 1024; // chat messages are short
const MAX_UPLOAD_BODY_BYTES = 20 * 1024 * 1024; // base64 PDF/txt/md, generous but bounded

function readBody(req, maxBytes) {
    // Vercel Node Functions may provide an already-parsed request.body.
    // Keep the same helper usable by the local HTTP server and Vercel.
    if (Object.prototype.hasOwnProperty.call(req, 'body')) {
        return Promise.resolve(req.body ?? {});
    }
    return new Promise((resolve, reject) => {
        const parts = [];
        let bytes = 0;
        req.on('data', (chunk) => {
            bytes += chunk.length;
            if (bytes > maxBytes) {
                reject(new Error('Body too large'));
                req.destroy();
                return;
            }
            parts.push(chunk);
        });
        req.on('end', () => {
            try { resolve(parts.length ? JSON.parse(Buffer.concat(parts).toString('utf8')) : {}); }
            catch (e) { reject(e); }
        });
        req.on('error', reject);
    });
}

function isCrisisMessage(userText) {
    const normalized = String(userText)
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (/\b(suicide|suicidal|self harm|kms|kys)\b/.test(normalized)) return true;
    if (/\b(kill\s+my\s*self|hurt\s+my\s*self|end\s+my\s+life|don't\s+want\s+to\s+live|do\s+not\s+want\s+to\s+live)\b/.test(normalized)) return true;
    return /\b(want|wants|wanted|wanna|thinking about|thinking of|plan to|planning to|going to|feel like)\b.{0,32}\b(die|dying|kill|killing|hurt|ending)\b/.test(normalized)
        && /\b(myself|my self|me|my life|dead|die|dying)\b/.test(normalized);
}

function detectEmotionalState(userText) {
    const normalized = String(userText).toLowerCase();
    const states = [
        ['grief', ['died', 'death', 'passed away', 'lost my', 'grieving', 'grief', 'mourning']],
        ['panic', ['panic attack', 'panicking', 'cannot calm down', 'can t calm down', 'heart is racing', 'hard to breathe']],
        ['anxiety', ['anxious', 'anxiety', 'worried', 'worrying', 'nervous', 'scared', 'afraid', 'natatakot', 'takot']],
        ['sadness', ['sad', 'malungkot', 'nalulungkot', 'lungkot']],
        ['loneliness', ['alone', 'lonely', 'no one', 'nobody', 'isolated', 'left out']],
        ['anger', ['angry', 'furious', 'mad', 'rage', 'irritated', 'annoyed']],
        ['shame', ['ashamed', 'embarrassed', 'humiliated', 'worthless', 'failure']],
        ['frustration', ['frustrated', 'frustrating', 'fed up', 'stuck', 'cannot handle', 'can t handle']],
        ['stress', ['stressed', 'stress']],
        ['overwhelm', ['overwhelmed', 'too much', 'everything on me', 'under pressure']]
    ];
    return states.find(([, terms]) => terms.some((term) => normalized.includes(term)))?.[0] || 'general';
}

const CASUAL_PATTERNS = [
    /^(hi|hello|hey|good morning|good afternoon|good evening|kumusta|kamusta)([!?,.\s]|$)/i,
    /^(thanks|thank you|thx|ty|thank u|salamat|maraming salamat|salamat po|thank you po|tysm)([!?,.\s]|$)/i,
    /^(okay|ok|okey|alright|all right|got it|understood|noted|okay na|ok na|sige|gets|gets ko)([!?,.\s]|$)/i,
    /^(yes|yeah|yep|yup|sure|correct|right|exactly|oo|opo|tama|tama yan)([!?,.\s]|$)/i,
    /^(no|nope|nah|not really|no thanks|hindi|ayoko|hindi po)([!?,.\s]|$)/i,
    /^(good|nice|great|awesome|amazing|perfect|excellent|cool|sweet|nice one|ayos|astig|solid|goods)([!?,.\s]|$)/i,
    /^(wow|whoa|oh wow|grabe|ang lupit)([!?,.\s]|$)/i,
    /^(sorry|my bad|my mistake|sorry po|pasensya|pasensya na)([!?,.\s]|$)/i,
    /^(bye|goodbye|see you|see ya|later|talk later|gotta go|alis na ako|bye po)([!?,.\s]|$)/i,
    /^(never mind|nevermind|forget it|it's fine|dont worry|wag na|huwag na|wala na)([!?,.\s]|$)/i
];

function isCasualMessage(userText) {
    const text = String(userText || '').trim();
    return CASUAL_PATTERNS.some((pattern) => pattern.test(text));
}

function buildCasualReply(userText) {
    const text = String(userText || '').trim().toLowerCase();
    // Casual conversation can be relaxed and Filipino. Medical turns remain
    // English so the medical response path stays simple and consistent.
    if (/^(thanks|thank you|thx|ty|thank u|salamat|maraming salamat|salamat po|thank you po|tysm)/i.test(text)) {
        return ['Walang anuman!', 'Walang problema!', 'Sige, happy to help!', 'Ayos lang!', 'Walang anuman, ingat!'][Math.floor(Math.random() * 5)];
    }
    if (/^(hi|hello|hey|good morning|good afternoon|good evening|kumusta|kamusta)/i.test(text)) {
        return ['Hi! Kumusta?', 'Hello! Ano ang maitutulong ko?', 'Hey! Kumusta ka?', 'Kumusta! Ano ang kailangan mo?'][Math.floor(Math.random() * 4)];
    }
    if (/^(good|nice|great|awesome|amazing|perfect|excellent|cool|sweet|nice one|ayos|astig|solid|goods)/i.test(text)) {
        return ['Ayos!', 'Nice!', 'Buti naman!', 'Good to hear!', 'Solid!'][Math.floor(Math.random() * 5)];
    }
    if (/^(bye|goodbye|see you|see ya|later|talk later|gotta go|alis na ako|bye po)/i.test(text)) {
        return ['Sige, ingat!', 'Bye! Ingat ka.', 'Sige, hanggang sa muli!', 'Ingat!'][Math.floor(Math.random() * 4)];
    }
    if (/^(sorry|my bad|my mistake|sorry po|pasensya|pasensya na)/i.test(text)) return 'Okay lang!';
    if (/^(never mind|nevermind|forget it|it's fine|dont worry|wag na|huwag na|wala na)/i.test(text)) return 'Sige, okay lang.';
    if (/^(no|nope|nah|not really|no thanks|hindi|ayoko|hindi po)/i.test(text)) return 'Sige, walang problema.';
    return ['Sige!', 'Gets!', 'Okay!', 'Ayos!'][Math.floor(Math.random() * 4)];
}

function isMedicationRequest(text) {
    return /\b(?:medicine|medication|meds|drug|drugs|pill|pills|tablet|tablets|capsule|capsules|gamot|uminom ng gamot|take medicine|take meds|take this medicine|take this medication|what medicine|which medicine|what meds|which meds|what pill|what tablet|what dosage|how many (?:pills|tablets|capsules)|pwede ba (?:akong|ako) (?:uminom|mag[- ]take) (?:ng )?(?:gamot|meds?|medicine)|ano (?:ang|yung) gamot|anong gamot)\b/i.test(String(text || ''));
}

function buildMedicationBoundaryReply() {
    return 'I can provide general health information, but I **cannot prescribe medication or tell you what medicine to take**. If you may need medication, a doctor, pharmacist, or other qualified healthcare professional can assess your situation and provide the proper recommendation or prescription if needed.';
}

const KIT_RECOMMENDATIONS = {
    wound_care: 'Recommended from the kit: **sterile gauze pads** for bleeding control; use an **adhesive bandage** for a small wound after cleaning. **Medical adhesive tape** can secure gauze.',
    burn_care: 'Recommended from the kit: **burn dressing (sterile non-stick)** for covering a minor burn after cooling it with clean running water.',
    injury_support: 'Recommended from the kit: **instant cold packs / compresses** for minor swelling, inflammation, or pain from minor bumps or sprains; an **elastic bandage** can provide localized compression and support for minor strains and sprains.',
    temperature: 'Recommended from the kit: **digital thermometer** to check and record body temperature.',
    hygiene: 'Recommended from the kit: **disposable medical gloves** for first-aid protection; **isopropyl alcohol / hand sanitizer** for hand hygiene when soap and water are unavailable; **medical face masks** for basic infection control.',
    cpr: 'Recommended from the kit: **CPR face shield / barrier device** as a one-way-valve barrier during CPR. Call emergency services first and follow dispatcher/CPR guidance.',
};

function buildMedkitInventoryReply() {
    const groups = new Map();
    for (const item of KIT) {
        if (!groups.has(item.category)) groups.set(item.category, []);
        groups.get(item.category).push(item.name);
    }
    const lines = ['The MedisinACSHS first-aid kit contains:'];
    for (const [category, items] of groups) {
        lines.push(`\n**${category}**`);
        for (const item of items) lines.push(`- ${item}`);
    }
    return lines.join('\n');
}

function buildMedkitExplanationReply() {
    const groups = new Map();
    for (const item of KIT) {
        if (!groups.has(item.category)) groups.set(item.category, []);
        groups.get(item.category).push(item);
    }
    const lines = ['Here is what each item in the MedisinACSHS kit is for, based on the kit reference:'];
    for (const [category, items] of groups) {
        lines.push(`\n**${category}**`);
        for (const item of items) {
            const uses = item.uses.map((use) => use.charAt(0).toUpperCase() + use.slice(1)).join('; ');
            lines.push(`- **${item.name}** — ${uses}.`);
        }
    }
    return lines.join('\n');
}

function isKitAvailabilityRequest(text) {
    const n = String(text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    return /\b(do you have|does (?:the )?(?:med )?kit have|is there (?:a|an)?|are there)\b/i.test(n) &&
        /\b(tourniquet|antibiotic|antibiotics|painkiller|painkillers|paracetamol|ibuprofen|inhaler|epipen|epi pen|thermometer|gauze|bandage|burn dressing|tweezers|scissors|saline|gloves|mask|masks|cold pack|elastic bandage|triangular bandage|cpr|face shield|tape|cotton swabs|antiseptic|sanitizer|thermal blanket|medicine|medication|drug|pills?|tablets?|capsules?)\b/i.test(n);
}

function buildKitAvailabilityReply(text) {
    const n = String(text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const aliases = [
        [['tourniquet'], null],
        [['antibiotic', 'antibiotics', 'medicine', 'medication', 'drug', 'painkiller', 'painkillers', 'paracetamol', 'ibuprofen', 'inhaler', 'epipen', 'epi pen', 'pills', 'pill', 'tablets', 'tablet', 'capsules', 'capsule'], null],
        [['gauze'], 'Sterile Gauze Pads'],
        [['bandage'], 'Adhesive Bandages (Assorted Sizes)'],
        [['burn dressing'], 'Burn Dressing (Sterile Non-Stick)'],
        [['thermometer'], 'Digital Thermometer'],
        [['tweezers'], 'Fine-Tip Tweezers'],
        [['scissors'], 'Medical Scissors'],
        [['saline'], 'Sterile Saline Solution'],
        [['gloves'], 'Disposable Medical Gloves'],
        [['mask', 'masks'], 'Medical Face Masks'],
        [['cold pack'], 'Instant Cold Packs / Compresses'],
        [['elastic bandage'], 'Elastic Bandage (ACE Type)'],
        [['triangular bandage'], 'Triangular Bandage'],
        [['cpr', 'face shield'], 'CPR Face Shield / Barrier Device'],
        [['tape'], 'Medical Adhesive Tape'],
        [['cotton swabs'], 'Cotton Swabs'],
        [['antiseptic'], 'Antiseptic Solution / Wipes'],
        [['sanitizer'], 'Isopropyl Alcohol / Hand Sanitizer'],
        [['thermal blanket'], 'Emergency Thermal Blanket (Mylar)'],
    ];
    for (const [terms, itemName] of aliases) {
        if (terms.some(term => n.includes(term))) {
            if (itemName) return `Yes. The kit contains **${itemName}**.`;
            return `No. A **${terms[0]}** is not listed in the MedisinACSHS kit reference.`;
        }
    }
    return null;
}

function getKitRecommendation(intent) {
    return KIT_RECOMMENDATIONS[intent] || '';
}

const { HOSPITALS_BY_LOCATION } = require('../data/hospitals-data.js');
const { KIT } = require('../data/kit.js');

const LOCATION_LABELS = {
    angono: 'Angono', baras: 'Baras', binangonan: 'Binangonan', cainta: 'Cainta',
    cardona: 'Cardona', jalajala: 'Jalajala', morong: 'Morong', pililla: 'Pililla',
    montalban: 'Rodriguez (Montalban)', sanmateo: 'San Mateo', tanay: 'Tanay',
    taytay: 'Taytay', teresa: 'Teresa', antipolo: 'Antipolo City'
};

const LOCATION_ALIASES = {
    antipolo: 'antipolo', 'antipolo city': 'antipolo', angono: 'angono', baras: 'baras',
    binangonan: 'binangonan', cainta: 'cainta', cardona: 'cardona', jalajala: 'jalajala',
    morong: 'morong', pililla: 'pililla', rodriguez: 'montalban', montalban: 'montalban',
    'san mateo': 'sanmateo', sanmateo: 'sanmateo', tanay: 'tanay', taytay: 'taytay', teresa: 'teresa'
};

function normalizeLocation(text) {
    const value = String(text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    if (LOCATION_ALIASES[value]) return LOCATION_ALIASES[value];
    const aliases = Object.keys(LOCATION_ALIASES).sort((a, b) => b.length - a.length);
    for (const alias of aliases) {
        const re = new RegExp(`(^|\\s)${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\s|$)`, 'i');
        if (re.test(value)) return LOCATION_ALIASES[alias];
    }
    return null;
}

function buildLocalHospitalReply({ locationKey, emergency = false } = {}) {
    const hospitals = HOSPITALS_BY_LOCATION[locationKey];
    if (!hospitals) return 'I do not have a hospital listing for that location in the current MedisinACSHS hospital dataset.';
    const locationLabel = LOCATION_LABELS[locationKey] || locationKey;
    const lines = hospitals.map(([name, address]) => {
        const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name}, ${address}`)}`;
        return `- **${name}**\n  Address: ${address}\n  [Google Maps](${maps})`;
    });
    const intro = emergency
        ? `**This may need urgent medical attention. Call 911 and get emergency help right away.** If you can travel safely, here are the listed facilities for **${locationLabel}**:`
        : `Here are the listed hospitals and medical facilities in **${locationLabel}**:`;
    return `${intro}\n\n${lines.join('\n')}`;
}

function isHospitalLookupMessage(text) {
    const n = normalizeForIntent(text);
    return /\b(hospital|ospital|clinic|klinika|pagamutan)\b/i.test(n) &&
        /\b(near me|nearby|near|nearest|closest|which|where|saan|malapit|pupunta|go to)\b/i.test(n)
        || /\b(hospital|ospital|clinic|klinika|pagamutan)\b$/i.test(n);
}

const INTENT_TERMS = {
    emergency: ['emergency', 'urgent', '911', 'unconscious', 'not breathing', 'cannot breathe', 'can t breathe', 'chest pain', 'severe bleeding', 'heavy bleeding', 'ang lakas ng dugo', 'malakas ang dugo', 'stroke', 'malakas ang pagdurugo', 'ang lakas ng dugo', 'malakas ang dugo', 'hindi tumitigil ang dugo', 'ang lakas ng dugo', 'malakas ang dugo', 'hirap huminga', 'di ako makahinga', 'nahimatay', 'walang malay', 'nakuryente'],
    emotional_support: ['sad', 'malungkot', 'nalulungkot', 'lungkot', 'scared', 'natatakot', 'takot', 'afraid', 'anxious', 'anxiety', 'overwhelmed', 'alone', 'lonely', 'upset', 'stressed', 'crying', 'grief', 'grieving', 'mourning', 'died', 'death', 'passed away', 'lost my', 'dog died', 'cat died', 'pet died', 'worried', 'panic', 'too much', 'everything on me', 'pressure', 'can t cope', 'need support', 'talk to me', 'can you talk', 'listen to me', 'emotional support'],
    wound_care: ['wound', 'cut', 'scrape', 'bleeding', 'blood', 'gauze', 'bandage', 'antiseptic', 'saline', 'splinter', 'sugat', 'dugo', 'gasgas', 'hiwa'],
    burn_care: ['burn', 'scald', 'hot water', 'chemical burn', 'electrical burn', 'non stick dressing', 'paso', 'napaso'],
    injury_support: ['sprain', 'strain', 'swelling', 'swollen', 'puffy', 'twisted ankle', 'turned ankle', 'hurt ankle', 'bruise', 'bump', 'cold pack', 'cold compress', 'elastic bandage', 'sling', 'namamaga', 'pamamaga', 'pilay', 'pasa'],
    temperature: ['temperature', 'fever', 'thermometer', 'mainit ang katawan', 'lagnat'],
    hygiene: ['hand hygiene', 'sanitize', 'sanitizer', 'gloves', 'mask', 'infection control', 'wash my hands'],
    cpr: ['cpr', 'rescue breathing', 'face shield', 'cardiopulmonary'],
    hospital_lookup: ['hospital', 'ospital', 'clinic', 'doctor', 'emergency room', 'nearest', 'malapit na ospital', 'where should i go', 'where do i go', 'saan ako pupunta', 'which hospital'],
    medkit_inventory: ['medkit', 'first aid kit', 'first-aid kit', 'what do i need', 'supplies', 'equipment']
};

const INTENT_EXPANSIONS = {
    emergency: 'urgent emergency immediate danger call 911 professional help',
    emotional_support: 'emotional support overwhelmed worried lonely trusted adult counselor',
    wound_care: 'minor wound cut scrape bleeding gauze bandage clean dressing first aid',
    burn_care: 'minor burn scald burn dressing non stick dressing first aid',
    injury_support: 'minor injury sprain swelling bump bruise cold compress elastic bandage support',
    temperature: 'check body temperature fever digital thermometer',
    hygiene: 'hand hygiene gloves masks infection control first aid',
    cpr: 'CPR rescue breathing face shield barrier emergency services',
    hospital_lookup: 'hospital clinic emergency department healthcare professional nearby',
    medkit_inventory: 'basic first aid kit inventory supplies purpose use'
};

function normalizeForIntent(userText) {
    return String(userText).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Same keyword scoring as before, but returns [intent, score] so callers can
// tell "no keyword matched" (score 0) apart from a real classification.
function classifyIntentScored(userText) {
    const normalized = normalizeForIntent(userText);
    const scores = Object.entries(INTENT_TERMS).map(([intent, terms]) => [
        intent,
        terms.reduce((score, term) => score + (normalized.includes(term) ? (term.includes(' ') ? 2 : 1) : 0), 0)
    ]).sort((a, b) => b[1] - a[1]);
    // A zero-score message has no recognized legacy intent. Never let the
    // first key in INTENT_TERMS (currently "emergency") become the accidental
    // default. This was the root cause of unrelated messages such as bare
    // locations, capabilities, and other general questions being routed to
    // the emergency responder.
    return scores[0][1] > 0 ? scores[0] : ['general_health', 0];
}

function classifyIntent(userText) {
    const [intent, score] = classifyIntentScored(userText);
    return score ? intent : 'general_health';
}

// The most recent user message before the current (last) one, so a short
// follow-up can inherit the topic of the message that came before it.
function getPriorUserText(contents) {
    const userIndexes = [];
    (contents || []).forEach((c, i) => { if (c?.role !== 'model') userIndexes.push(i); });
    if (userIndexes.length < 2) return '';
    const priorIndex = userIndexes[userIndexes.length - 2];
    return (contents[priorIndex]?.parts || []).map((p) => p?.text || '').join('\n').trim();
}

// Phrases that signal a first-aid situation is getting worse. None of these
// say what "it" is on their own (e.g. "it won't stop"), so they only escalate
// the intent when the conversation already established a topic that can
// become an emergency.
const ESCALATION_TERMS = [
    'wont stop', 'not stopping', 'doesnt stop', 'keeps bleeding', 'still bleeding',
    'bleeding a lot', 'lot of blood', 'soaking through', 'soaked through',
    'getting worse', 'worse and worse', 'cant breathe', 'passed out',
    'not waking up', 'hindi tumitigil', 'di tumitigil', 'lumalala'
];
const ESCALATABLE_INTENTS = new Set(['wound_care', 'burn_care', 'injury_support', 'cpr', 'temperature']);

// Once escalated, add topic-specific terms (not just generic "emergency call
// 911" words) so retrieval lands on the matching emergency RAG entry instead
// of whichever generic emergency chunk happens to share the fewest words.
const ESCALATION_EXPANSIONS = {
    wound_care: 'severe bleeding heavy bleeding wont stop bleeding direct pressure gauze call 911 emergency',
    burn_care: 'severe burn deep burn large burn electrical burn chemical burn emergency call 911',
    injury_support: 'possible fracture severe injury deformity numbness circulation emergency call 911',
    cpr: 'unconscious not breathing cpr call 911 emergency',
    temperature: 'heat stroke confusion seizure emergency call 911'
};

function hasEscalationSignal(normalizedText) {
    return ESCALATION_TERMS.some((term) => normalizedText.includes(term));
}

// Resolves the intent and the text used for RAG retrieval for the CURRENT
// turn, folding in the previous user message when the latest message has no
// medical/emotional/emergency keyword of its own. This is the context-
// retention fix: a short follow-up like "puncture, it's painful" or "yes,
// boiling water" is judged together with what the user said right before it,
// instead of being classified as an unrelated, keyword-less message.
function resolveEffectiveIntent(lastUserText, contents) {
    const [freshIntent, freshScore] = classifyIntentScored(lastUserText);
    const priorUserText = getPriorUserText(contents);

    let intent = freshIntent;
    let queryText = lastUserText;

    if (!freshScore && priorUserText) {
        const combinedText = `${priorUserText} ${lastUserText}`;
        const [combinedIntent, combinedScore] = classifyIntentScored(combinedText);
        if (combinedScore) {
            intent = combinedIntent;
            queryText = combinedText;
        }
    }

    if (intent !== 'emergency' && hasEscalationSignal(normalizeForIntent(lastUserText))) {
        const priorIntent = priorUserText ? classifyIntentScored(priorUserText)[0] : null;
        const baseIntent = ESCALATABLE_INTENTS.has(intent) ? intent : priorIntent;
        if (ESCALATABLE_INTENTS.has(baseIntent)) {
            intent = 'emergency';
            queryText = `${queryText} ${ESCALATION_EXPANSIONS[baseIntent] || 'severe emergency call 911'}`;
        }
    }

    return { intent, queryText };
}

function buildEmotionalSupportReply(userText, history = []) {
    if (isCrisisMessage(userText)) {
        return 'I am sorry you are facing this, and your safety matters. **Are you in immediate danger, or have you already hurt yourself or someone else?**\n\nIf yes, call **911** now, go to the nearest emergency department, and tell a trusted adult who can stay with you. Move away from anything you could use to cause harm and stay with another person.';
    }

    const cleanedText = userText.trim().replace(/[.!?]+$/, '');
    const hasFollowedUp = history.some((message) => message.role === 'model');
    if (/\b(can you talk|talk to me|listen to me)\b/i.test(cleanedText)) {
        return 'Yes, we can talk. I will listen without judging you. You can start with whatever feels easiest, even if it is only a few words.\n\n**What is happening for you right now?**';
    }
    if (/\b(died|death|passed away|lost my|grieving|grief|mourning)\b/i.test(cleanedText)) {
        return `I am sorry about your loss. Losing someone or a beloved pet can hurt deeply, and there is no single right way to grieve.\n\nBe gentle with yourself today. You could remember them by talking with someone you trust, looking at a favorite photo, or taking a quiet moment.\n\n**Would you like to tell me about them, or would you rather have quiet support right now?**`;
    }
    const state = detectEmotionalState(cleanedText);
    const stateGuidance = {
        panic: 'Try placing both feet on the floor and taking a slow breath out longer than you breathe in.',
        anxiety: 'Name one thing you can control in the next few minutes and let the rest wait for now.',
        loneliness: 'If possible, send a simple message to someone safe, such as "Can we talk for a few minutes?"',
        sadness: 'If possible, talk to someone you trust or give yourself a quiet moment to process what you are feeling.',
        anger: 'Give yourself a little space before responding, and try a slow breath or a short walk.',
        shame: 'A difficult moment does not define your worth. Speak to yourself as gently as you would speak to someone you care about.',
        frustration: 'Pause and choose the smallest part of the problem that you can handle first.',
        stress: 'Take one small next step and give yourself permission to pause before trying to handle everything at once.',
        overwhelm: 'You do not have to solve everything at once. Choose one small next step.',
        general: 'Take one slow breath and focus on what you need in this moment.'
    }[state];
    const reflectionByState = {
        panic: 'It sounds like you are feeling panicked right now.',
        anxiety: 'It sounds like you are feeling anxious right now.',
        sadness: 'It sounds like you are feeling sad right now.',
        loneliness: 'It sounds like you are feeling alone right now.',
        anger: 'It sounds like you are feeling angry or frustrated right now.',
        shame: 'It sounds like you are being hard on yourself right now.',
        frustration: 'It sounds like you are feeling frustrated right now.',
        stress: 'It sounds like you are feeling stressed right now.',
        overwhelm: 'It sounds like you are feeling overwhelmed right now.',
        general: 'It sounds like you are going through a difficult moment right now.'
    };
    const reflection = reflectionByState[state] || 'It sounds like you are going through a difficult moment right now.';
    const question = hasFollowedUp
        ? '**Would it help to talk about what happened, or would you rather focus on calming down first?**'
        : '**What part of this feels heaviest right now?**';
    return `${reflection}\n\n${stateGuidance} Be kind to yourself; this feeling does not define you. If you can, contact a trusted adult, family member, school counselor, or healthcare professional.\n\n${question}`;
}

function getTopicGuidance(understanding) {
    const topics = Array.isArray(understanding?.topics) ? understanding.topics : [];
    for (const topic of topics) {
        if (MEDICAL_GUIDANCE[topic]) return { topic, ...MEDICAL_GUIDANCE[topic] };
    }
    return null;
}

function buildFormattedMedicalReply(understanding, structured = {}, guidance = null, kitItems = [], userText = '') {
    if (!guidance) return buildGeneralMedicalFallback(understanding, structured);

    const topicLabels = {
        headache: 'headache', dizziness: 'dizziness', nausea: 'nausea',
        weakness: 'weakness', fever: 'fever', sore_throat: 'sore throat',
        cough: 'cough', stomach_pain: 'stomach pain', diarrhea: 'diarrhea',
        runny_nose: 'runny nose', minor_wound: 'cut or wound', burn: 'burn',
        injury: 'injury', sleepiness: 'sleepiness', fatigue: 'fatigue',
        skin_rash: 'skin rash', nosebleed: 'nosebleed', eye_issue: 'eye concern',
        palpitations: 'racing heartbeat', anxiety: 'anxiety'
    };
    const topics = Array.isArray(understanding?.topics) ? understanding.topics : [];
    const label = topicLabels[topics[0]] || 'this concern';
    const text = String(userText || '').trim();
    const openers = {
        headache: /since (this )?morning/i.test(text)
            ? 'Since the headache started this morning, start with a few simple things that may help.'
            : 'A headache can be frustrating, so start with a few simple steps that are generally safe for a common headache.',
        burn: /hot pan|hot water|boiling|napaso|burned|burnt/i.test(text)
            ? 'That kind of burn can really hurt, so the first priority is to cool the skin safely.'
            : 'A burn can be painful, so start with simple first aid to cool and protect the area.',
        minor_wound: (() => {
            const facts = structured?.relevantContext?.facts || {};
            const location = String(facts.wound_location || '').trim();
            const stopped = facts.bleeding_status === 'not bleeding';
            if (location && stopped) {
                return `Since the cut is on your ${location} and the bleeding has stopped, focus on cleaning and protecting it.`;
            }
            if (location) {
                return `Since the cut is on your ${location}, focus on cleaning it and keeping it protected.`;
            }
            if (/finger|hand|kamay|daliri/i.test(text)) {
                return 'A cut on the hand or finger can bleed and become irritated easily, so start by cleaning and protecting it.';
            }
            return 'For a cut or wound, start with simple wound care and check whether there is active bleeding.';
        })(),
        injury: 'For a minor injury, the first priority is to protect the area and limit swelling or further strain.',
        dizziness: 'Feeling dizzy can make you unsteady, so start by sitting or lying somewhere safe.',
        fever: 'If you are feeling feverish, start by checking your temperature and giving your body time to rest.',
        sleepiness: 'Feeling unusually sleepy can have many everyday causes, so start by checking your recent rest and how you are feeling overall.'
    };
    const opener = openers[topics[0]] || `If you’re dealing with ${label}, start with these simple steps.`;
    const lines = [opener];
    for (const action of (guidance.actions || [])) lines.push(`- ${action}`);

    let relevant = Array.isArray(kitItems) ? kitItems.slice(0, 3) : [];
    // Only surface kit items that directly address the established situation.
    // Generic PPE/tools should not crowd out the actual treatment item.
    const directKitByTopic = {
        minor_wound: ['Sterile Gauze Pads', 'Adhesive Bandages (Assorted Sizes)', 'Medical Adhesive Tape'],
        burn: ['Burn Dressing (Sterile Non-Stick)'],
        injury: ['Instant Cold Packs / Compresses', 'Elastic Bandage (ACE Type)'],
        fever: ['Digital Thermometer'],
        eye_issue: ['Sterile Saline Solution'],
        nosebleed: ['Sterile Gauze Pads'],
        fainting: ['CPR Face Shield / Barrier Device']
    };
    const preferred = directKitByTopic[topics[0]];
    if (preferred) {
        relevant = preferred.map(name => relevant.find(item => item.name === name)).filter(Boolean);
    }
    if (relevant.length && !structured?.decision?.clarificationOnly) {
        lines.push('');
        lines.push('**From the MedisinACSHS kit:**');
        for (const item of relevant.slice(0, 3)) {
            const use = Array.isArray(item.uses) && item.uses.length
                ? item.uses[0].charAt(0).toUpperCase() + item.uses[0].slice(1)
                : 'Use this item only for its intended first-aid purpose.';
            lines.push(`- **${item.name}** — ${use}.`);
        }
        lines.push('If you need any assistance with how to use an item from the kit, just ask.');
    }

    lines.push('');
    lines.push(guidance.summary);

    const pending = structured?.decision?.missingInfo?.[0];
    const questionByCategory = {
        bleeding_status: 'Is the cut bleeding right now?',
        wound_location: 'Where is the cut located?',
        burn_extent_or_location: 'Where is the burn, and about how large is it?',
        injury_severity_or_function: 'Can you move or walk normally?',
        associated_symptoms_or_severity: 'Are you having any other symptoms?',
        pain_severity_or_red_flags: 'How severe is the pain?',
        temperature_or_duration: 'Have you checked your temperature, and how long have you had the fever?',
        severity_or_worsening_details: 'Is it getting worse, or is it improving?',
        symptom_context: 'Did you get enough sleep or rest?',
        symptoms_or_relevant_details: 'What other symptoms are you noticing?'
    };
    if (pending && structured?.decision?.needsMoreInfo) {
        lines.push('');
        lines.push(`**${guidance.followUp || questionByCategory[pending]}**`);
    }
    return lines.join('\n');
}

function buildGeneralMedicalFallback(understanding, structured = {}) {
    const topic = getTopicGuidance(understanding);
    const labels = {
        headache: 'headache', dizziness: 'dizziness', nausea: 'nausea', weakness: 'weakness',
        fever: 'fever', sore_throat: 'sore throat', cough: 'cough', stomach_pain: 'stomach pain',
        minor_wound: 'cut or wound', burn: 'burn', injury: 'injury', sleepiness: 'sleepiness',
        fatigue: 'fatigue', skin_rash: 'skin rash', diarrhea: 'diarrhea', runny_nose: 'runny nose',
        nosebleed: 'nosebleed', eye_issue: 'eye concern', anxiety: 'anxiety', palpitations: 'racing heartbeat'
    };
    const questionByCategory = {
        bleeding_status: 'Is the wound bleeding right now?',
        wound_location: 'Where is the wound located?',
        burn_extent_or_location: 'Where is the burn, and about how large is it?',
        injury_severity_or_function: 'Can you move or walk normally?',
        associated_symptoms_or_severity: 'Are you having any other symptoms?',
        pain_severity_or_red_flags: 'How severe is the pain?',
        temperature_or_duration: 'Have you checked your temperature, and how long have you had the fever?',
        severity_or_worsening_details: 'Is it getting worse, or is it improving?',
        symptom_context: 'Did you get enough sleep or rest?',
        symptoms_or_relevant_details: 'What other symptoms are you noticing?'
    };
    if (topic) {
        const label = labels[topic.topic] || 'this situation';
        const steps = topic.actions.map((a) => `- ${a}`).join('\n');
        const decision = structured?.decision || {};
        const pending = Array.isArray(decision.missingInfo) ? decision.missingInfo[0] : null;
        const question = pending ? questionByCategory[pending] : null;
        const reason = question ? `\n\nSymptoms like this can vary from person to person, so one more detail will help me make the guidance more specific.` : '';
        const followUp = question ? `\n**${question}**` : '';
        return `Here’s what you can do for a common ${label}:\n${steps}\n\n${topic.summary}${reason}${followUp}`;
    }
    return 'I can give general first-aid information, but I need a little more detail about what is happening before I can make the guidance specific. What symptoms or injury are you dealing with?';
}

function buildOptionalKitOffer(understanding, decision) {
    // A kit offer is a contextual add-on, never the response to an
    // underspecified complaint. In particular, generic "sugat"/"dugo"
    // messages must be clarified before mentioning kit treatment.
    if (!decision?.firstAid || decision?.clarificationOnly || !decision?.kitReady) return '';
    const topics = new Set(understanding?.topics || []);
    const kitTopics = new Set(['minor_wound','burn','injury','fever','nosebleed','eye_issue','fainting','breathing','severe_bleeding','choking']);
    if (![...topics].some((t) => kitTopics.has(t))) return '';
    return '\n\nIf there is anything in the MedisinACSHS kit you want to know more about, just ask. I can also guide you through how to use an item.';
}

function buildDefaultRagReply(matches) {
    const facts = [...new Set(matches.map((match) => match.text.trim()))].slice(0, 2);
    return `Based on the MedisinACSHS medkit reference:\n\n${facts.join('\n\n')}\n\nFollow the product label and seek professional help if the injury is severe or worsening.`;
}


function buildStructuredContext(contents) {
    let context = null;
    for (const item of (contents || [])) {
        if (item?.role === 'model') continue;
        const text = (item?.parts || []).map((p) => p?.text || '').join('\n').trim();
        if (!text) continue;
        const understanding = understandMessage(text);
        const decision = decide(understanding, text);
        context = updateContext(context, text, understanding, decision);
    }
    return context;
}

function explicitlyAnswersForContext(text, category) {
    const value = String(text || '').trim();
    if (category === 'bleeding_status') {
        return /^(yes|yeah|yep|yup|oo|opo|no|nope|nah|hindi|hindi po|not really)\s*[.!?]*$/i.test(value)
            || /\b(not bleeding|no bleeding|isn'?t bleeding|is not bleeding|stopped bleeding|bleeding stopped|the bleeding stopped|it stopped bleeding|it has stopped bleeding|still bleeding|bleeding a lot|bleeding heavily|heavy bleeding|bleeding badly|bleeding a little|small bleeding|a little bleeding|slight bleeding|won'?t stop bleeding|wont stop bleeding|dumudugo|hindi dumudugo|tumigil ang dugo|tumigil na ang dugo|hindi tumitigil ang dugo|meron|may dugo|kaunti|konti|marami|malakas ang dugo)\b/i.test(value);
    }
    if (category === 'wound_location') {
        return /\b(on|at|in|sa)\s+(my|the|aking)\s+(finger|hand|arm|leg|foot|knee|head|face|daliri|kamay|braso|binti|paa|tuhod|mukha)\b/i.test(value)
            || /\b(finger|hand|arm|leg|foot|knee|head|face|daliri|kamay|braso|binti|paa|tuhod|mukha)\b/i.test(value);
    }
    return false;
}

function pendingAnswerLooksPlausible(text, category) {
    const n = String(text || '').toLowerCase().normalize('NFKC').replace(/\s+/g, ' ').trim();
    if (!n) return false;
    const patterns = {
        symptom_context: /^(?:no|nope|nah|not really|yes|yeah|yep|oo|opo|hindi)\s*[.!?]*$|\b(slept badly|slept well|didn'?t sleep|did not sleep|sleep well|sleep badly|not enough sleep|not enough rest|lack of sleep|rested|didn'?t rest|did not rest|tulog|natulog|pahinga|kagabi|last night|usual|unusual|sleepier than normal|more sleepy than usual)\b/i,
        pain_severity_or_red_flags: /\b(pain|painful|hurt|hurts|mild|moderate|severe|very|worst|matindi|malala|sobrang sakit|vomit|vomiting|blood|faint|fainted|dizzy|confused)\b/i,
        associated_symptoms_or_severity: /\b(mild|moderate|severe|very|pain|painful|hurt|vomit|vomiting|dizzy|dizziness|faint|fainted|chest pain|shortness of breath|lagnat|matindi|malala|nahihilo|nasusuka|nanghihina|weak|weakness|worse|worsening|sudden|bigla)\b/i,
        temperature_or_duration: /\b(\d+(?:\.\d+)?\s*(?:°\s*)?(?:c|f)|temperature|degree|degrees|yesterday|today|days?|hours?|weeks?|kahapon|ngayon|araw|oras|since|started|nagsimula)\b/i,
        severity_or_worsening_details: /\b(mild|moderate|severe|worse|worsening|getting worse|better|improving|matindi|malala|lumalala|gumagaling|heavy|a lot|lot of blood|hindi tumitigil|di tumitigil)\b/i,
        injury_severity_or_function: /\b(can walk|can't walk|cannot walk|can move|can't move|cannot move|swollen|swelling|deformed|numb|pain|painful|mild|moderate|severe|matindi|malala|hindi makalakad|makalakad|makagalaw|hindi makagalaw)\b/i,
        symptoms_or_relevant_details: /\b(pain|painful|hurt|hurts|bleeding|blood|vomit|vomiting|dizzy|dizziness|sleepy|tired|fever|cough|rash|swollen|swelling|started|since|today|yesterday|hours?|days?|morning|night|last night|a little|slight|moderate|severe|mild|matindi|malala|kaunti|konti|marami|malakas|masakit|nahihilo|nasusuka|nanghihina|pagod|antok|sakit)\b/i,
    };
    return !!patterns[category] && patterns[category].test(n);
}

function sameSituationUpdateLooksPlausible(text, topics, facts = {}) {
    const n = String(text || '').toLowerCase().normalize('NFKC').replace(/\s+/g, ' ').trim();
    if (!n) return false;
    const patterns = [
        /\b(bleed|bleeding|blood|stopped|stop|dumudugo|dugo|tumigil|malakas|kaunti|konti|marami)\b/i,
        /\b(pain|painful|hurt|hurts|sore|matindi|malala|masakit|sobrang sakit)\b/i,
        /\b(mild|moderate|severe|very|worse|worsening|better|improving|getting worse|lumalala|gumagaling)\b/i,
        /\b(sleep|slept|rest|tulog|natulog|pahinga|kagabi|last night|usual|unusual|sleepier|tired|pagod|antok)\b/i,
        /\b(\d+(?:\.\d+)?\s*(?:°\s*)?(?:c|f)|temperature|degree|degrees|today|yesterday|days?|hours?|weeks?|ngayon|kahapon|araw|oras)\b/i,
        /\b(on|at|in|sa)\s+(my|the|aking)\s+(finger|hand|arm|leg|foot|knee|head|face|daliri|kamay|braso|binti|paa|tuhod|mukha)\b/i,
        /\b(can walk|can't walk|cannot walk|can move|can't move|cannot move|swollen|swelling|deformed|numb|makalakad|makagalaw|namamaga)\b/i,
        /\b(vomit|vomiting|nauseous|nausea|dizzy|dizziness|faint|fainted|confused|nahihilo|nasusuka|nahimatay|nalilito)\b/i,
    ];
    return patterns.some(re => re.test(n));
}

function contextFactForDecision(category, value) {
    const text = String(value || '').trim();
    if (category === 'bleeding_status') {
        if (/^(no|nope|nah|hindi|hindi po|not really)\s*[.!?]*$/i.test(text)
            || /\b(hindi dumudugo|walang dugo|tumigil ang dugo|tumigil na ang dugo|not bleeding|no bleeding|stopped bleeding|bleeding stopped|the bleeding stopped|it stopped bleeding|it has stopped bleeding)\b/i.test(text)) return 'not bleeding';
        if (/^(yes|yeah|yep|yup|oo|opo)\s*[.!?]*$/i.test(text)
            || /\b(meron|may dugo|dumudugo|kaunti|konti|marami|malakas|bleeding|small bleeding|a little bleeding|slight bleeding|still bleeding)\b/i.test(text)) return 'still bleeding';
    }
    return text;
}

function extractContextualFactUpdates(text, activeTopics = []) {
    const value = String(text || '').trim();
    const n = value.toLowerCase().normalize('NFKC').replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
    const topics = new Set(activeTopics || []);
    const updates = {};

    // Corrections/additions to wound location. Accept natural phrasing such as
    // "actually it's on my index finger" rather than requiring "on my finger".
    if (topics.has('minor_wound') || topics.has('wound')) {
        const locationPatterns = [
            /\b(?:actually\s+)?(?:it(?:'s| is)|the (?:cut|wound))\s+(?:is|was)?\s*(?:on|at|in)\s+(?:my|the)?\s*(right|left|middle|index|thumb|little|pinky|ring)?\s*(finger|hand|arm|forearm|leg|foot|knee|head|face|daliri|kamay|braso|binti|paa|tuhod|mukha)\b/i,
            /\b(?:actually\s+)?(?:on|at|in)\s+(?:my|the)?\s*(right|left|middle|index|thumb|little|pinky|ring)?\s*(finger|hand|arm|forearm|leg|foot|knee|head|face|daliri|kamay|braso|binti|paa|tuhod|mukha)\b/i,
            /\b(?:actually\s+)?(?:my|the)\s+(right|left|middle|index|thumb|little|pinky|ring)\s+(finger|hand|arm|forearm|leg|foot|knee|head|face)\b/i,
        ];
        for (const re of locationPatterns) {
            const match = n.match(re);
            if (match) {
                const side = match[1] ? `${match[1]} ` : '';
                updates.wound_location = `${side}${match[2]}`.trim();
                break;
            }
        }
    }

    if (topics.has('minor_wound')) {
        if (/\b(?:not bleeding|no bleeding|isn't bleeding|is not bleeding|stopped bleeding|bleeding stopped|not anymore|no more bleeding|wala na ang dugo|hindi na dumudugo|tumigil na ang dugo|tumigil ang dugo)\b/i.test(n)) {
            updates.bleeding_status = 'not bleeding';
        } else if (/\b(?:still bleeding|bleeding a lot|bleeding heavily|bleeding badly|bleeding|dumudugo|may dugo|maraming dugo|malakas ang dugo|kaunting dugo|kaunti ang dugo)\b/i.test(n)) {
            updates.bleeding_status = 'still bleeding';
        }
    }

    return updates;
}

function isContextualFollowup(text, activeContext) {
    if (!activeContext?.activeSituation || activeContext.activeIntent !== 'medical') return false;
    const n = String(text || '').toLowerCase().normalize('NFKC').replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
    if (!n) return false;

    // Explicit corrections/additions: "actually it's on my index finger",
    // "also it hurts", "now it stopped".
    if (/^(actually|also|and|but|now|update|correction|i mean)\b/i.test(n)) return true;

    // Pronoun-based follow-ups refer naturally to the currently active medical
    // situation. Keep this narrow so ordinary unrelated questions don't inherit
    // medical context merely because a situation exists.
    if (/\b(it|that|this|the cut|the wound|the burn|my finger|my hand|my arm|my leg|my foot)\b/i.test(n) &&
        /\b(what should i|what do i|how do i|should i|can i|do i need|is it|does it|will it|what now|what next|what about)\b/i.test(n)) return true;

    // Short action requests after an established medical situation.
    if (/^(what should i do|what do i do|what should i do now|what can i do|what now|what next)\??$/i.test(n)) return true;

    return false;
}

function reconnectMedicalContext(lastUserText, priorContext) {
    const activeTopics = priorContext?.activeSituation?.topics || [];
    const factUpdates = extractContextualFactUpdates(lastUserText, activeTopics);
    const effectiveText = [
        priorContext?.originMessage,
        ...Object.entries(priorContext?.facts || {}).map(([category, value]) => contextFactForDecision(category, value)),
        ...Object.entries(factUpdates).map(([category, value]) => contextFactForDecision(category, value)),
        String(lastUserText || '').trim(),
    ].filter(Boolean).join(' ');
    const effectiveUnderstanding = understandMessage(effectiveText);
    const effectiveDecision = decide(effectiveUnderstanding, effectiveText);
    const effectiveContext = updateContext(priorContext, lastUserText, effectiveUnderstanding, effectiveDecision);
    for (const [category, value] of Object.entries(factUpdates)) {
        effectiveContext.facts[category] = value;
        effectiveContext.pendingInfo = effectiveContext.pendingInfo.filter(item => item !== category);
    }
    return reconcileDecisionWithContext({
        understanding: effectiveUnderstanding,
        decision: effectiveDecision,
        context: effectiveContext,
        relevantContext: getRelevantContext(effectiveContext, effectiveUnderstanding),
    });
}

function getStructuredMedicalState(lastUserText, contents, sessionMemory = null) {
    const userItems = (contents || []).filter((item) => item?.role !== 'model');
    const priorItems = userItems.slice(0, -1);
    const memory = sanitizeMemory(sessionMemory);
    const priorContext = memory.activeContext || buildStructuredContext(priorItems);
    const understanding = understandMessage(lastUserText);
    const initialDecision = decide(understanding, lastUserText);

    // A pending medical question must be resolved from the conversation context
    // even when the new turn is not classified as medical on its own. Answers
    // such as "meron, kaunti" or "on my hand" are valid context updates, not
    // new standalone complaints. This prevents the same question from being
    // asked again on the next turn.
    const shortYesNo = /^(yes|yeah|yep|yup|sure|correct|right|no|nope|nah|not really|oo|opo|tama|hindi|hindi po|ayoko)\s*[.!?]*$/i.test(String(lastUserText || '').trim());
    const canBePendingAnswer = understanding.messageType !== 'greeting' &&
        understanding.messageType !== 'hospital' && understanding.messageType !== 'location' &&
        (understanding.messageType !== 'casual' || shortYesNo);
    const activeTopics = new Set(priorContext?.activeSituation?.topics || []);
    const currentTopics = new Set(understanding?.topics || []);
    const introducesNewMedicalTopic = understanding.messageType === 'medical' &&
        currentTopics.size > 0 && activeTopics.size > 0 && ![...currentTopics].some(t => activeTopics.has(t));

    // Reconnect ambiguous follow-ups to the active medical situation even when
    // the current message has no medical keyword of its own. This is the key
    // distinction between storing memory and actually using memory: phrases
    // such as "actually it's on my index finger" and "what should I do with it?"
    // update/continue the existing wound rather than falling into the generic
    // capability response.
    if (!introducesNewMedicalTopic && isContextualFollowup(lastUserText, priorContext)) {
        return reconnectMedicalContext(lastUserText, priorContext);
    }

    if (canBePendingAnswer && !introducesNewMedicalTopic && priorContext?.activeIntent === 'medical' && priorContext.pendingInfo?.length) {
        // Resolve the current turn against the pending category BEFORE asking
        // Stage 1/2.1 to interpret the turn as a fresh complaint. An answer is
        // accepted only when it plausibly matches the requested information;
        // otherwise the old medical situation is suspended rather than leaking
        // into an unrelated request.
        const pendingFacts = {};
        for (const category of priorContext.pendingInfo) {
            if (explicitlyAnswersForContext(lastUserText, category) || pendingAnswerLooksPlausible(lastUserText, category)) {
                pendingFacts[category] = String(lastUserText || '').trim();
            }
        }
        if (Object.keys(pendingFacts).length === 0 && !sameSituationUpdateLooksPlausible(lastUserText, [...activeTopics], priorContext?.facts || {})) {
            const freshContext = updateContext(blankContext(), lastUserText, understanding, initialDecision);
            const freshRelevantContext = getRelevantContext(freshContext, understanding);
            return reconcileDecisionWithContext({ understanding, decision: initialDecision, context: freshContext, relevantContext: freshRelevantContext });
        }
        // A new turn can update an already-known fact even when that category
        // is no longer the current question (e.g. "actually, it stopped now").
        if (sameSituationUpdateLooksPlausible(lastUserText, [...activeTopics], priorContext?.facts || {})) {
            const t = String(lastUserText || '').trim();
            if (activeTopics.has('minor_wound') && /\b(bleed|bleeding|blood|stopped|not anymore|no more|tumigil|wala na|dumudugo|dugo|malakas|kaunti|konti|marami)\b/i.test(t)) {
                pendingFacts.bleeding_status = t;
            } else if (activeTopics.has('headache') && /\b(pain|painful|hurt|hurts|mild|moderate|severe|very|worst|matindi|malala|sobrang sakit)\b/i.test(t)) {
                pendingFacts.pain_severity_or_red_flags = t;
            } else if ((activeTopics.has('dizziness') || activeTopics.has('nausea') || activeTopics.has('weakness')) &&
                       /\b(pain|painful|hurt|vomit|vomiting|dizzy|dizziness|faint|fainted|chest pain|shortness of breath|lagnat|matindi|malala|weak|weakness|worse|worsening|sudden|bigla)\b/i.test(t)) {
                pendingFacts.associated_symptoms_or_severity = t;
            } else if (activeTopics.has('sleepiness') && /\b(no|nope|nah|not really|yes|yeah|yep|oo|opo|hindi|slept|sleep|rest|tulog|natulog|pahinga|kagabi|last night|usual|unusual)\b/i.test(t)) {
                pendingFacts.symptom_context = t;
            } else if (activeTopics.has('fever') && /\b(\d+(?:\.\d+)?\s*(?:°\s*)?(?:c|f)|temperature|degree|degrees|yesterday|today|days?|hours?|weeks?|kahapon|ngayon|araw|oras|since|started|nagsimula)\b/i.test(t)) {
                pendingFacts.temperature_or_duration = t;
            } else if (activeTopics.has('burn') && /\b(small|large|tiny|wide|minor|major|first degree|second degree|third degree|hand|arm|leg|face|chest|back|finger|daliri|kamay|braso|binti|mukha|dibdib|likod)\b/i.test(t)) {
                pendingFacts.burn_extent_or_location = t;
            } else if (activeTopics.has('injury') && /\b(can walk|can't walk|cannot walk|can move|can't move|cannot move|swollen|swelling|deformed|numb|pain|painful|mild|moderate|severe|matindi|malala|hindi makalakad|makalakad|makagalaw|hindi makagalaw)\b/i.test(t)) {
                pendingFacts.injury_severity_or_function = t;
            } else if (/\b(on|at|in|sa)\s+(my|the|aking)\s+(finger|hand|arm|leg|foot|knee|head|face|daliri|kamay|braso|binti|paa|tuhod|mukha)\b/i.test(t)) {
                pendingFacts.wound_location = t;
            }
        }
        const effectiveText = [
            priorContext.originMessage,
            ...Object.entries(priorContext.facts || {}).map(([category, value]) => contextFactForDecision(category, value)),
            ...Object.entries(pendingFacts).map(([category, value]) => contextFactForDecision(category, value)),
            lastUserText,
        ].filter(Boolean).join(' ');
        const effectiveUnderstanding = understandMessage(effectiveText);
        const effectiveDecision = decide(effectiveUnderstanding, effectiveText);
        const effectiveContext = updateContext(priorContext, lastUserText, effectiveUnderstanding, effectiveDecision);
        for (const [category, value] of Object.entries(pendingFacts)) {
            effectiveContext.facts[category] = category === 'bleeding_status' ? contextFactForDecision(category, value) : value;
            effectiveContext.pendingInfo = effectiveContext.pendingInfo.filter(item => item !== category);
        }
        const effectiveRelevantContext = getRelevantContext(effectiveContext, effectiveUnderstanding);
        const resolved = reconcileDecisionWithContext({
            understanding: effectiveUnderstanding,
            decision: effectiveDecision,
            context: effectiveContext,
            relevantContext: effectiveRelevantContext,
        });
        return resolved;
    }

    const context = updateContext(priorContext, lastUserText, understanding, initialDecision);
    const relevantContext = getRelevantContext(context, understanding);
    return reconcileDecisionWithContext({ understanding, decision: initialDecision, context, relevantContext });
}

function buildMinorWoundReply(userText, structured = {}, contents = []) {
    const contextFacts = structured?.relevantContext?.facts || {};
    const users = (contents || []).filter((c) => c?.role !== 'model');
    const bleedingPositive = /\b(still bleeding|bleeding|bleeding a little|small bleeding|a little bleeding|slight bleeding|meron|may dugo|dumudugo|kaunti|konti|marami|malakas)\b/i;
    const bleedingStopped = /\b(stopped bleeding|the bleeding stopped|bleeding stopped|tumigil ang dugo|hindi dumudugo|walang dugo|not bleeding|no bleeding|isn'?t bleeding)\b/i;
    let latestBleeding = null;
    for (let i = users.length - 1; i >= 0; i--) {
        const t = (users[i]?.parts || []).map((p) => p?.text || '').join(' ').trim();
        if (bleedingStopped.test(t)) { latestBleeding = false; break; }
        if (bleedingPositive.test(t)) { latestBleeding = true; break; }
    }
    if (latestBleeding === null && typeof contextFacts.bleeding_status === 'string') {
        const t = contextFacts.bleeding_status;
        latestBleeding = bleedingStopped.test(t) ? false : bleedingPositive.test(t) ? true : null;
    }
    if (latestBleeding === null) {
        latestBleeding = bleedingPositive.test(String(userText || '')) && !bleedingStopped.test(String(userText || ''));
    }
    if (latestBleeding) {
        return 'For a small cut with a little bleeding, use **sterile gauze pads** from the kit and apply gentle pressure until the bleeding slows or stops. Then gently rinse the cut with clean water and cover it with an **adhesive bandage** if it is small.';
    }
    return 'Gently rinse the small cut with clean water, then cover it with an **adhesive bandage**. If it starts bleeding, use **sterile gauze pads** from the kit and apply gentle pressure.';
}

function buildEmergencyFirstAidReply(userText, understanding = {}) {
    const text = String(userText || '').trim();
    const topics = new Set(understanding?.topics || []);
    const unresponsive = /unresponsive|not responding|isn'?t responding|is not responding|collapsed|walang malay/i.test(text);
    const severeBleeding = topics.has('severe_bleeding') || /heavy bleeding|severe bleeding|bleeding quite a lot|bleeding a lot|bleeding heavily|bleeding badly|won'?t stop bleeding|hindi tumitigil ang dugo|malakas ang dugo|malakas ang pagdurugo/i.test(text);
    const breathing = topics.has('breathing') || /not breathing|can'?t breathe|cannot breathe|hirap huminga|di ako makahinga|hindi humihinga/i.test(text);
    if (unresponsive) return 'A person who has suddenly collapsed and is not responding needs emergency help right away. **Call 911 now.**\n\nWhile help is coming:\n- **Check whether they are breathing normally.**\n- If they are **not breathing normally**, start CPR if you are trained, or follow the 911 dispatcher’s instructions immediately.\n- If available, use the **CPR face shield / barrier device** from the MedisinACSHS kit during rescue breathing.\n- **Alert a teacher, school clinic staff, or another responsible adult immediately**, and stay with the person.\n\nIf you need any assistance with how to use an item from the kit, just ask.';
    if (severeBleeding) return 'Heavy bleeding can become an emergency quickly. **Call 911 or get emergency help right away.**\n\nWhile help is coming:\n- **Press firmly and continuously on the bleeding area** using sterile gauze from the kit or a clean cloth.\n- **Keep steady pressure** and do not keep lifting the gauze to check the wound.\n- **Alert a teacher, school clinic staff, or another responsible adult immediately** if you are at school.\n\nIf you need any assistance with how to use an item from the kit, just ask.';
    if (breathing) return 'Trouble breathing can be an emergency. **Call 911 or get emergency help right away.**\n\nWhile help is coming:\n- **Stay with the person and keep them in a position where they can breathe as comfortably as possible.**\n- Follow the 911 dispatcher’s instructions and alert a teacher, school clinic staff, or another responsible adult immediately.';
    return 'This may be an emergency. **Call 911 or get emergency help right away.**\n\n**Alert a teacher, school clinic staff, or another responsible adult immediately**, and follow the emergency dispatcher’s instructions.';
}

function buildNaturalClarificationReply(category, text, options = {}) {
    // Medical conversation stays in English. This keeps the medical path
    // consistent and avoids making the health-response prompt handle a second
    // language. Casual conversation can still use Filipino.
    const filipino = false;
    const replies = {
        bleeding_status: filipino
            ? ['Dumudugo ba yung sugat?', 'May dugo ba sa sugat ngayon?', 'Dumudugo ba yung hiwa ngayon?']
            : ['Is the cut bleeding at all?', 'Is there any bleeding from the cut?', 'Is the cut bleeding right now?'],
        wound_location: filipino
            ? ['Saan banda yung sugat?', 'Anong parte ng katawan yung may sugat?', 'Saan mo nakuha yung sugat — sa daliri, kamay, braso, o ibang parte?']
            : ['Where is the cut located?', 'What part of your body is the wound on?', 'Where did you get the cut — your finger, hand, arm, or somewhere else?'],
        burn_extent_or_location: filipino
            ? ['Saan banda yung paso, at gaano kalaki?', 'Anong parte ang napaso, at maliit lang ba o malawak yung paso?']
            : ['Where is the burn, and about how large is it?', 'What part was burned, and is it small or fairly large?'],
        injury_severity_or_function: filipino
            ? ['Gaano kasakit o kalala yung injury, at nakakagalaw ka ba nang maayos?', 'Nakakagalaw o nakakalakad ka ba nang maayos, at may pamamaga ba?']
            : ['How severe is the injury, and can you move normally?', 'Can you move or walk normally, and is there any swelling?'],
        associated_symptoms_or_severity: filipino
            ? ['Gaano kalala yung nararamdaman mo, at may iba ka pa bang sintomas?', 'May iba ka pa bang nararamdaman, o gaano ito kalala?']
            : ['How severe is it, and are you having any other symptoms?', 'Are you having any other symptoms, or how severe does it feel?'],
        pain_severity_or_red_flags: filipino
            ? ['Gaano kasakit, at may iba ka pa bang napapansin gaya ng pagsusuka o pagdurugo?', 'Gaano katindi yung sakit? May iba ka pa bang sintomas?']
            : ['How severe is the pain, and are you noticing anything else such as vomiting or bleeding?', 'How bad is the pain? Are you having any other symptoms?'],
        temperature_or_duration: filipino
            ? ['May nasukat ka bang temperature, at gaano na katagal ang lagnat?', 'Ano yung temperature mo, kung nasukat mo, at kailan nagsimula?']
            : ['Have you checked your temperature, and how long have you had the fever?', 'What is your temperature, if you checked it, and when did it start?'],
        severity_or_worsening_details: filipino
            ? ['Gaano ito kalala, at lumalala ba o gumagaling?', 'Mas lumalala ba ito, o gumagaling naman?']
            : ['How severe is it, and is it getting worse?', 'Has it been getting worse, or is it improving?'],
        symptom_context: filipino
            ? ['Kulang lang ba sa tulog kagabi, o parang mas unusual yung antok mo kaysa usual?', 'Nakapagpahinga ka ba nang maayos kagabi, o iba yung antok na nararamdaman mo ngayon?']
            : ['Did you just not get enough sleep last night, or does this sleepiness feel unusual for you?', 'Did you get enough rest last night, or are you feeling sleepier than you normally do?'],
        symptoms_or_relevant_details: filipino
            ? ['Ano pa yung napapansin mong sintomas, at gaano ito kalala?', 'Pwede mo bang sabihin nang kaunti kung ano yung nararamdaman mo?']
            : ['What other symptoms are you noticing, and how severe are they?', 'Can you tell me a little more about what you are feeling?'],
        which_symptom_is_the_main_concern: filipino
            ? ['Alin sa mga sintomas yung pinaka-nakakaabala sa iyo ngayon?', 'Alin yung pinaka-problema mo sa mga nabanggit mo?']
            : ['Which symptom is bothering you the most right now?', 'Which of those is your main concern right now?'],
    };
    const choices = replies[category] || replies.symptoms_or_relevant_details;
    const question = choices[Math.floor(Math.random() * choices.length)];

    // Clarification should not become a dead-end questionnaire. When we can
    // already give safe, general first-aid guidance without knowing the
    // missing detail, give that guidance in the same message and mention the
    // actual kit item that can help. The question remains limited to the one
    // detail that materially changes the next step.
    if (category === 'bleeding_status') {
        return filipino
            ? `Habang nililinaw natin, kung maliit lang ang hiwa, banlawan ito nang dahan-dahan gamit ang malinis na umaagos na tubig at takpan pagkatapos. Kung may dugo, puwedeng gumamit ng **sterile gauze pads** mula sa kit at idiin nang marahan.\n\n${question}`
            : `For a small cut, you can gently rinse it with clean running water and cover it afterward. If it is bleeding, you can use **sterile gauze pads** from the kit and apply gentle pressure.\n\n${question}`;
    }

    if (category === 'wound_location' && /\b(bleeding|bleed|blood|dumudugo|dugo)\b/i.test(text)) {
        return filipino
            ? `Dahil may kaunting pagdurugo, gumamit ng **sterile gauze pads** mula sa kit at idiin nang marahan hanggang humina o tumigil ang dugo. Pagkatapos, banlawan nang dahan-dahan gamit ang malinis na tubig at takpan ng **adhesive bandage** kung maliit ang hiwa.\n\n${question}`
            : `Since you mentioned a little bleeding, use **sterile gauze pads** from the kit and apply gentle pressure until the bleeding slows or stops. Then gently rinse the cut with clean water and cover it with an **adhesive bandage** if it is small.\n\n${question}`;
    }

    return question;
}

function structuredMedicalGate(lastUserText, contents, sessionMemory = null) {
    // Context resolution is performed once in getStructuredMedicalState. Keeping
    // this wrapper side-effect-free prevents a second pass from accidentally
    // dropping facts such as a previous "no" answer.
    return getStructuredMedicalState(lastUserText, contents, sessionMemory);
}


function mapStructuredTopicToV7Intent(understanding) {
    const topics = new Set(understanding?.topics || []);
    const map = [
        ['minor_wound', 'wound_care'],
        ['burn', 'burn_care'],
        ['injury', 'injury_support'],
        ['fever', 'temperature'],
        ['cpr', 'cpr'],
        ['chest_pain', 'emergency'],
        ['breathing', 'emergency'],
        ['eye_issue', 'general_health'],
        ['nosebleed', 'wound_care'],
        ['cold_exposure', 'general_health'],
        ['heat_exhaustion', 'temperature'],
        ['hygiene', 'hygiene'],
    ];
    for (const [topic, intent] of map) if (topics.has(topic)) return intent;
    return 'general_health';
}

function isCapabilityRequest(text) {
    return /^(what can you do|what do you do|what are you able to do|what can you help me with|how can you help me|what is this|what is medisinacshs)\s*[?!.,]*$/i.test(String(text || '').trim());
}

function isMedkitInventoryRequest(text) {
    const n = String(text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!/\b(med kit|medkit|first aid kit|first-aid kit)\b/i.test(n)) return false;
    if (/\b(what should i put|what should i include|what do i need to put|what should be in)\b/i.test(n)) return false;
    return /\b(what(?:'s| is| are)?|whats|what do you have|contents|items|inside|include|included|list|supplies|equipment)\b/i.test(n);
}

function isMedkitExplanationRequest(text, contents = []) {
    const n = String(text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const asksPurpose = /\b(explain|purpose|use|uses|used|do|does|for|mean|meaning)\b/.test(n) &&
        /\b(each|every|these|those|them|items|things|ones)\b/.test(n);
    const direct = /\b(what (?:does|do) each (?:one|item|of these|of them)|explain (?:what )?each|what are (?:these|they) for|what does each item do)\b/i.test(n);
    if (asksPurpose || direct) return true;
    // A follow-up immediately after the kit inventory can omit the words
    // "med kit"; use the prior assistant turn only as conversational context.
    const priorModelText = [...(contents || [])].reverse().find((c) => c?.role === 'model')?.parts?.map((p) => p?.text || '').join(' ') || '';
    return /medisinacshs first-aid kit contains|medisinacshs kit includes/i.test(priorModelText) &&
        /\b(explain|what|purpose|use|uses|used|do|does)\b/i.test(n) && /\b(each|these|them|items)\b/i.test(n);
}

function isContextualMedkitQuestion(text, contents = []) {
    const n = String(text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!/\b(how does this work|how does this work|how do these work|how do they work|what does this do|what do these do|how is this used|how is this used)\b/i.test(n)) return false;
    const priorModelText = [...(contents || [])].reverse().find((c) => c?.role === 'model')?.parts?.map((p) => p?.text || '').join(' ') || '';
    return /medisinacshs first-aid kit contains|first-aid kit contains|kit includes|medkit|first-aid kit/i.test(priorModelText);
}

function buildCapabilityReply() {
    return 'I can help with basic first-aid guidance, information about the MedisinACSHS kit, emotional support, emergency guidance, and finding listed hospitals or medical facilities by location. I cannot diagnose conditions or prescribe medication.';
}

function extractHospitalLocationFromConversation(contents, structured) {
    const direct = normalizeLocation([...contents].reverse().find((c) => c?.role !== 'model')?.parts?.map((p) => p?.text || '').join(' ') || '');
    if (direct) return direct;
    const fact = structured?.relevantContext?.facts?.current_location;
    return normalizeLocation(fact) || null;
}

function inferNextMissingInfo(decision, understanding, facts) {
    const d = decision || {};
    const topics = new Set(understanding?.topics || []);
    const known = facts || {};
    if (d.urgency === 'emergency') return null;
    if (topics.has('headache') && known.pain_severity_or_red_flags && !known.associated_symptoms_or_severity) return 'associated_symptoms_or_severity';
    if (topics.has('minor_wound') && known.bleeding_status && !known.wound_location) return 'wound_location';
    if (topics.has('burn') && known.burn_extent_or_location && !known.pain_severity_or_red_flags) return 'pain_severity_or_red_flags';
    if (topics.has('injury') && known.injury_severity_or_function && !known.pain_severity_or_red_flags) return 'pain_severity_or_red_flags';
    return null;
}

function reconcileDecisionWithContext(structured) {
    const s = structured || {};
    const d = s.decision || {};
    const facts = s.relevantContext?.facts || {};
    if (d.urgency === 'emergency') return s;
    const answered = new Set(Object.keys(facts));
    let remaining = Array.isArray(d.missingInfo) ? d.missingInfo.filter((item) => !answered.has(item)) : [];
    if (remaining.length === 0) {
        const next = inferNextMissingInfo(d, s.understanding, facts);
        if (next) remaining = [next];
    }
    if (remaining.length === 0 && (!d.missingInfo || d.missingInfo.length === 0)) return s;
    if (remaining.length === (d.missingInfo || []).length && remaining.every((x, i) => x === d.missingInfo[i])) return s;
    return {
        ...s,
        decision: {
            ...d,
            missingInfo: remaining,
            needsMoreInfo: remaining.length > 0,
            followUp: remaining.length > 0,
            kitReady: remaining.length === 0 ? (d.firstAid || d.kitReady) : d.kitReady,
            responseType: remaining.length === 0 && d.firstAid ? 'minor_first_aid' : (remaining.length > 0 ? 'medical_guidance_with_followup' : d.responseType),
        }
    };
}

async function handleChat(req, res) {
    let body;
    try { body = await readBody(req, MAX_CHAT_BODY_BYTES); }
    catch { return sendJson(res, 400, { error: 'Invalid JSON body' }); }

    const { contents, system_instruction, session_memory } = body;
    if (!Array.isArray(contents) || contents.length === 0) {
        return sendJson(res, 400, { error: 'contents array missing' });
    }

    const lastUserText = [...contents].reverse()
        .find((c) => c?.role !== 'model')?.parts?.map((p) => p?.text || '').join('\n').trim() || '';
    const systemText = (system_instruction?.parts?.[0]?.text || '').trim();

    const sessionMemory = sanitizeMemory(session_memory || blankMemory());
    const structured = reconcileDecisionWithContext(structuredMedicalGate(lastUserText, contents, sessionMemory));
    const respond = (reply, assessment) => {
        const nextMemory = buildMemory(sessionMemory, structured?.context || sessionMemory.activeContext, lastUserText, reply, structured?.decision);
        return sendChatReply(res, reply, assessment, nextMemory);
    };
    let situationState = buildSituationState(structured);
    const assessment = () => ({ ...situationState });

    // Safety/role boundaries come before general conversation.
    if (isCrisisMessage(lastUserText)) {
        return respond(buildEmotionalSupportReply(lastUserText, contents), assessment());
    }
    if (isMedicationRequest(lastUserText)) {
        return respond(buildMedicationBoundaryReply(), assessment());
    }
    if (isCapabilityRequest(lastUserText)) {
        return respond(buildCapabilityReply(), assessment());
    }
    if (isKitAvailabilityRequest(lastUserText)) {
        const reply = buildKitAvailabilityReply(lastUserText);
        if (reply) return respond(reply, assessment());
    }
    if (isMedkitExplanationRequest(lastUserText, contents)) {
        return respond(buildMedkitExplanationReply(), assessment());
    }
    if (isMedkitInventoryRequest(lastUserText)) {
        return respond(buildMedkitInventoryReply(), assessment());
    }
    if (isContextualMedkitQuestion(lastUserText, contents)) {
        return respond(buildMedkitExplanationReply(), assessment());
    }
    if (/\b(what should i put|what should i include|what do i need to put|what should be in)\b/i.test(lastUserText)
        && /\b(first[- ]aid kit|med kit|medkit)\b/i.test(lastUserText)) {
        return sendChatReply(res,
            'For treating small cuts, useful items include:\n\n' +
            '- **Sterile Gauze Pads** — use them to apply pressure if the cut is bleeding.\n' +
            '- **Adhesive Bandages (Assorted Sizes)** — use them to cover a small cut after cleaning and when bleeding is controlled.\n' +
            '- **Medical Adhesive Tape** — use it to secure gauze when needed.\n' +
            '- **Antiseptic Solution / Wipes** — use according to the product directions for appropriate wound hygiene.\n\n' +
            'These are the relevant items already included in the MedisinACSHS kit.\n\nIf you need any assistance with how to use an item from the kit, just ask.', assessment());
    }
    if (isCasualMessage(lastUserText) && structured.understanding.messageType !== 'medical') {
        return respond(buildCasualReply(lastUserText), assessment());
    }

    // Emotional support remains separate from medical response generation.
    const legacyIntent = classifyIntentScored(lastUserText)[0];
    if (legacyIntent === 'emotional_support') {
        return respond(buildEmotionalSupportReply(lastUserText, contents), assessment());
    }

    // Hospital lookup is server-authoritative. No demo venue and no distance calculation.
    const priorText = getPriorUserText(contents);
    const hospitalRequested = isHospitalLookupMessage(lastUserText);
    const recentConversation = `${priorText} ${lastUserText}`;
    const hospitalContext = /\b(hospital|ospital|clinic|klinika|pagamutan|nearest|near me|closest|where should i go|where do i go|saan ako pupunta)\b/i.test(recentConversation);
    const suppliedLocation = normalizeLocation(lastUserText);
    const contextLocation = normalizeLocation(structured?.relevantContext?.facts?.current_location || '');
    const locationReply = structured.understanding.messageType === 'location' && hospitalContext;
    const explicitLocationHospitalRequest = !!suppliedLocation && /\b(hospital|ospital|clinic|klinika|pagamutan|where|which|go to|can i go|can i find)\b/i.test(lastUserText);
    if (hospitalRequested || locationReply || (suppliedLocation && hospitalContext) || explicitLocationHospitalRequest) {
        const locationKey = suppliedLocation || contextLocation;
        if (!locationKey) {
            const updated = buildSituationState({
                ...structured,
                understanding: { ...structured.understanding, messageType: 'hospital' },
                decision: { ...structured.decision, responseType: 'hospital_lookup', needsLocation: true, missingInfo: ['current_location'] }
            });
            return respond('What city or municipality are you currently in?', updated);
        }
        const emergencyContext = structured.understanding.severity === 'emergency' || /\b(heavy bleeding|severe bleeding|cannot breathe|can't breathe|di ako makahinga|chest pain|unconscious|stroke|seizure)\b/i.test(recentConversation);
        const reply = buildLocalHospitalReply({ locationKey, emergency: emergencyContext });
        const hospitalAssessment = {
            ...assessment(),
            active: false,
            messageType: 'hospital',
            topic: 'hospital or medical-facility lookup',
            topics: ['hospital or medical-facility lookup'],
            severity: 'unknown',
            severityLabel: emergencyContext ? 'Emergency context retained' : 'Not a medical assessment',
            bodyLocation: null,
            knownFacts: [`Current area: ${LOCATION_LABELS[locationKey] || locationKey}`],
            unknownFacts: [],
            relevantKit: 'Not applicable to a hospital directory lookup.',
            emergencyFlags: emergencyContext ? ['Emergency context retained'] : [],
            nextBestQuestion: null,
            responseType: 'hospital_lookup',
            urgency: emergencyContext ? 'emergency' : 'routine'
        };
        return respond(reply, hospitalAssessment);
    }

    // Medical path is authoritative: no legacy intent scorer may override it.
    if (structured.understanding.messageType === 'medical') {
        // Some cases are intentionally clarification-only. This is a hard
        // gate: do not call Ollama or expose baseline guidance until the
        // missing high-value fact has been supplied.
        if (structured.decision.clarificationOnly) {
            // Never make a medical clarification a dead end. Give the safe
            // baseline care we can already support, then ask one high-value
            // question that can change the next step. Do not mention kit items
            // until the situation is specific enough to justify them.
            const firstMissing = structured.decision.missingInfo?.[0] || null;
            if (structured.understanding.topics?.includes('minor_wound')) {
                const question = firstMissing === 'bleeding_status'
                    ? '**Is the cut bleeding right now?**'
                    : '**Where is the cut located?**';
                const reply = 'For a small cut, you can:\n\n- **Gently rinse the wound with clean running water.**\n- **Cover it with a clean dressing** after cleaning.\n\nFor a cut, the next step depends on whether there is active bleeding.\n\n' + question;
                return respond(reply, situationState);
            }
            const base = buildGeneralMedicalFallback(structured.understanding, {
                ...structured,
                decision: { ...structured.decision, missingInfo: [firstMissing] }
            });
            return respond(base, situationState);
        }
        if (structured.decision.urgency === 'emergency') {
            situationState = buildSituationState(structured, { kitRecommendation: '' });
            return respond(buildEmergencyFirstAidReply(lastUserText, structured.understanding), situationState);
        }

        const guidance = getTopicGuidance(structured.understanding);
        const kitItems = mapKitItems(structured.understanding, structured.decision, { limit: 4 });
        const kitHint = kitItems.length ? kitItems.map((i) => `${i.name}: ${i.uses.join('; ')}`).join('\n') : '';
        situationState = buildSituationState(structured, { kitRecommendation: kitHint });

        const firstMissing = structured.decision.missingInfo?.[0] || null;
        const formatted = buildFormattedMedicalReply(
            structured.understanding,
            structured,
            guidance,
            kitItems,
            lastUserText
        );
        return respond(formatted, situationState);
    }

    // General/non-medical conversation: keep v7's flexibility without routing through medical logic.
    if (/^(?:how does this work|how do these work|what is this)\??$/i.test(lastUserText.trim())) {
        return respond('If you mean the MedisinACSHS kiosk, it combines the first-aid kit with an assistant that can explain the kit, provide basic first-aid information, and help with emergency or hospital-related questions.', assessment());
    }
    return respond('I can help with basic first-aid and health information, the MedisinACSHS kit, emotional support, and hospital lookup by location. What would you like help with?', assessment());
}

function sendChatReply(res, reply, assessment, sessionMemory = null) {
    return sendJson(res, 200, { reply, assessment, sessionMemory });
}

function sendJson(res, status, body) {
    res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
}

// Admin: manage the RAG document store. Auth: `Authorization: Bearer <ADMIN_TOKEN>`.
// Upload is JSON {filename, contentBase64} rather than multipart — avoids
// pulling in a multipart-parsing dependency for one form field.
async function handleAdmin(req, res, url) {
    if (!ADMIN_TOKEN) return sendJson(res, 503, { error: 'ADMIN_TOKEN not set on the server — admin routes disabled' });
    if (!isAdmin(req)) return sendJson(res, 401, { error: 'Invalid or missing admin token' });

    if (req.method === 'GET' && url.pathname === '/api/admin/docs') {
        return sendJson(res, 200, { docs: rag.listDocs() });
    }

    if (req.method === 'POST' && url.pathname === '/api/admin/docs') {
        let body;
        try { body = await readBody(req, MAX_UPLOAD_BODY_BYTES); }
        catch (e) { return sendJson(res, 400, { error: e.message === 'Body too large' ? 'File too large' : 'Invalid JSON body' }); }

        const { filename, contentBase64 } = body;
        if (!filename || !contentBase64) return sendJson(res, 400, { error: 'filename and contentBase64 required' });

        try {
            const doc = await rag.saveDoc(filename, Buffer.from(contentBase64, 'base64'));
            return sendJson(res, 200, { doc });
        } catch (e) {
            return sendJson(res, 400, { error: e.message });
        }
    }

    if (req.method === 'DELETE' && url.pathname === '/api/admin/docs') {
        const id = url.searchParams.get('id') || '';
        const ok = rag.deleteDoc(id);
        return sendJson(res, ok ? 200 : 404, ok ? { deleted: id } : { error: 'Document not found' });
    }

    sendJson(res, 404, { error: 'Not found' });
}


module.exports = { handleChat, handleAdmin };
