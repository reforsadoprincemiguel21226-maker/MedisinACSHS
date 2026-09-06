# MedisinACSHS 2.0 — v7 Progressive Assistance / Current Handoff

## Purpose
This README is the authoritative handoff/specification for the current MedisinACSHS 2.0 development state. Read it before changing code. When a requirement changes, retire the old requirement everywhere it exists: code, prompts, RAG defaults, tests, comments, and documentation.

## 1. Product identity
MedisinACSHS is a **physical first-aid-kit kiosk with an AI-assisted conversational interface**. The assistant lives beside a real first-aid kit.

The intended identity is:

> A helpful first-aid companion attached to the kiosk and kit, not a generic chatbot and not a kit advertisement.

The physical kit is always available, but the user is **not assumed to be opening the assistant because they need the kit**.

The assistant can provide:
- basic first-aid and health information
- emergency guidance
- physical-kit information and item-use guidance
- conversational context and follow-up assistance
- emotional support
- technical/general support
- hospital/medical-facility lookup by the user's general location

## 2. Research alignment and boundaries
The research project presents MedisinACSHS as an AI-assisted first-aid solution with a chatbot, physical first-aid kit, calendar, and hospital locator intended to support emergency readiness, accessibility, clear guidance, and confidence during first-aid situations.

The system is **not**:
- a diagnostic system
- a doctor replacement
- a prescription engine
- a real-time GPS/navigation service
- a real-time hospital-distance calculator

It must not:
- diagnose conditions
- prescribe medication or dosage
- invent medical facts
- invent kit items
- invent hospitals
- fabricate distances or live availability
- override an established emergency decision
- expose hidden chain-of-thought or private reasoning

## 3. Current architecture
The intended pipeline is:

**Stage 0 — Foundation**
Project structure, kiosk/UI, local server, local Ollama, RAG infrastructure.

**Stage 1 — Understanding**
Determine what the user's current message means: greeting, casual, medical, emergency-relevant, hospital request, location, emotional support, technical/general, etc. Recognize medical topics and explicit severity signals. Handle natural English, Filipino, and mixed input.

Stage 1 answers: **"What is this message saying?"**

**Stage 2.1 — Decision + information sufficiency**
Determine what the system should do now: general guidance, first-aid guidance, emergency action, hospital lookup, clarification, etc. Identify the highest-value missing detail when one is needed.

Stage 2.1 answers: **"What level of assistance is justified by what we know?"**

It must distinguish:
1. enough information for specific guidance;
2. not enough for specific guidance, but enough for safe general guidance + one useful question;
3. not enough even for useful general guidance, requiring clarification.

"Missing information" must never automatically mean "do not help."

**Stage 3 — Factual knowledge / RAG**
Retrieve approved medical information. Critical safety decisions should not depend solely on semantic retrieval. RAG supplements structured/approved guidance; it does not authorize free invention.

**Stage 4 — Physical kit mapping**
Map the situation to actual MedisinACSHS kit items. Only items in `data/kit.js` may be claimed as present.

**Stage 5 — Conversation context**
Maintain a compact active situation and resolve follow-ups such as:
- "it's bleeding now"
- "it stopped"
- "what about this?"
- "how do I use it?"
- "no" as an answer to a pending yes/no question
- a previously supplied city for a later hospital request

Stage 5 is context/state management. It is **not a second classifier and not a response writer**.

**Stage 6 — Natural-language response**
Turn established state, approved guidance, and kit facts into natural user-facing communication. Ollama is a communication layer, not a medical decision-maker.

**Stage 7 — Hospital/location lookup**
Use the user's general city/municipality to select facilities from the approved hospital dataset.

**Stage 8 — Safety/stress testing**
Stress-test boundaries, ambiguity, context, escalation, grounding, and failure recovery.

**Stage 9 — Full integration**
Freeze only after earlier stages are proven.

## 4. Development rule
Always use:

> **BUILD → TEST → PROVE PASS → FREEZE → NEXT STAGE**

Do not create a new canned response for every failed test. Trace the failure to the responsible layer and fix the underlying mechanism once.

## 5. v7 is the base
The project uses **v7 as the base** because its UI, conversational feel, RAG, emotional-support, voice, calendar, and hospital features were already promising.

The newer structured work was selectively merged where it improved safety and consistency.

Do not replace v7 wholesale with the abandoned rigid Stage 6 implementation.

## 6. Situation State — current contract
`lib/situation.js` presents a compact state summary built from established pipeline outputs.

The conceptual state is:
- topic/situation
- symptoms/injury
- body location when known
- severity/risk as established upstream
- known facts
- unknown facts
- relevant changes/timeline
- emergency indicators
- relevant kit items
- next useful information
- response type/urgency

### Fact rules
- A fact explicitly provided by the user is known.
- An absent fact is unknown; it is not permission to assume.
- New information can replace older contradictory information.
- An unrelated new topic suspends the previous active situation instead of allowing it to leak into the new response.
- An answer to a pending question is processed against that question before the message is treated as a new standalone turn.

Examples:

`I cut my hand` → bleeding unknown

`It is bleeding a little` → bleeding = light/active

`Actually, it stopped` → bleeding = stopped; the older light-bleeding state must not remain authoritative

`I have a headache` → headache situation

`What's the weather?` → unrelated topic; do not continue the headache response

## 7. Progressive assistance response contract
For ordinary medical situations, the preferred response pattern is:

**Acknowledge → address the problem → give useful general steps → explain briefly why more detail would help → ask one high-value question → update guidance on the next turn.**

The assistant should not behave like a questionnaire.

### When information is incomplete
The user should still receive safe, useful help that already applies.

Example style:

> Here's what you can do for a common headache:
> - Rest somewhere comfortable and drink some water.
>
> Headaches can vary quite a bit, so one more detail can help me make the guidance more specific. How severe is the pain?

The exact wording may vary. The behavior must remain consistent.

### When the user answers
The answer must be incorporated into the same situation. Do not restart with:

> "What would you like help with?"

Do not ask again for a fact that was just supplied.

### When enough information is established
Stop asking unnecessary questions and give the practical guidance that follows from the known situation.

## 8. Emergency response contract
Emergency decisions are deterministic and remain higher priority than routine conversational questions.

An emergency response should contain:
1. clear emergency escalation;
2. an immediate actionable first-aid step when one is supported;
3. relevant kit guidance when applicable;
4. calm, direct wording;
5. no invented victim/situation details.

Avoid internal labels such as:
- "life-threatening external bleeding"
- "based on my classification"
- "do not delay for routine questions"

unless the user-facing wording genuinely needs them.

Do not say "the person" unless the user has established that someone else is the patient.

## 9. Response-generation / Ollama contract
The final kiosk release prioritizes **fast, deterministic, safety-controlled medical responses**. The current medical response path does not require Ollama, so the kiosk remains usable when Ollama is unavailable and does not incur model startup/latency on routine first-aid questions.

The structured pipeline remains authoritative for:
- severity;
- emergency status;
- diagnosis boundaries;
- medication/dosage boundaries;
- hospital selection;
- kit contents;
- supported medical facts.

Ollama configuration and the live integration regression test are retained for development/extension of the communication layer, but deterministic responses are the production fallback and current default. A live Ollama test is only evidence when Ollama and the configured model are actually running.

## 10. Medical language policy
For **casual conversation**, Filipino or relaxed Taglish is acceptable.

For **medical/first-aid guidance**, keep the response in English even if the user writes in Filipino. The system should still understand Filipino and mixed-language input.

## 11. Physical-kit policy
The kit is a persistent product capability, not the assumed reason for every conversation.

When relevant, directly connect the actual item to the action:

> "Use the sterile gauze from the kit to apply steady pressure..."

Do not force kit content into:
- weather/general questions
- unrelated technical questions
- ordinary emotional conversation
- casual greetings

A natural optional offer is acceptable after relevant assistance:

> "If you'd like more information about anything in the first-aid kit, just ask. I can also guide you through how to use an item."

Kit inventory questions must be answered from the actual kit data and formatted clearly by category and bullet point.

Kit-item explanation questions should use the item's recorded `uses` data.

## 12. Medication boundary
Whenever the user asks what medicine to take, whether they should take a medicine, or asks for dosage:

- clearly state that MedisinACSHS cannot prescribe medication or dosage;
- provide general information only when supported;
- recommend a doctor, pharmacist, or other qualified healthcare professional for proper assessment and prescription/recommendation when needed.

Do not allow a general Ollama reply to bypass this boundary.

## 13. Hospital/local-service contract
The demo venue is **not** the user's location.

There is no implicit Antipolo default.

Current flow:

`hospital near me`
→ if no user location is known, ask for the user's general city/municipality
→ user supplies `Antipolo`
→ map `Antipolo` to the approved Antipolo facility list

Supported location data is in `data/hospitals-data.js` and the supplied hospital-location reference.

Distance is **not a current capability**. Do not fabricate kilometer estimates or pretend to calculate real-time proximity.

The old client-side concepts `demoVenue`, `buildDemoVenueReply`, `DISTANCE_REQUEST_WORDS`, and `lastHospitalContext` are retired from active routing and must not be reintroduced.

A standalone location must not itself create hospital intent.

## 14. Casual, emotional, and technical conversation
Casual messages should not trigger medical routing.

Examples:
- `hi`
- `kumusta`
- `thanks`
- `okay`

The static kiosk opening message already introduces MedisinACSHS. Do not repeat the full introduction after every greeting.

Emotional-support messages should be empathetic and human. Do not mechanically repeat the user's literal sentence inside a canned reflection.

Technical/general questions should remain separate from medical routing.

## 15. Explainability panel
The UI may show a collapsed **MedisinACSHS assessment** panel.

It may expose a concise structured summary such as:
- situation understood
- known facts
- missing information
- risk/severity
- relevant kit
- emergency status
- next useful detail

It must not expose hidden chain-of-thought or private reasoning.

## 16. Known failure classes from prior stress testing
These were previously observed and are part of the regression contract:

- common symptoms incorrectly falling back to "I don't have that information";
- headache/dizziness/nausea/weakness not reaching useful guidance;
- Filipino breathing phrases not being recognized;
- chest pain being treated too casually;
- heavy bleeding not escalating when new evidence appears;
- old bleeding state overriding "stopped" or "heavy" updates;
- small-cut questions assuming bleeding before it was established;
- clarification questions becoming a long questionnaire;
- repeated questions for information already supplied;
- assistant restarting with "Hello, how can I help you?" mid-conversation;
- unrelated topics inheriting the previous medical state;
- kit questions being mistaken for emergencies;
- hospital requests silently defaulting to Antipolo;
- fabricated/legacy distance behavior;
- medication requests receiving prescription-like advice;
- internal classification/RAG/dataset language leaking to the user;
- Ollama generating unsupported medical advice;
- assistant messages rendering the name below rather than above the response.

A future change is not complete until these failure classes are either fixed or explicitly re-scoped by a current requirement.

## 17. Current testing philosophy
Do not run hundreds of near-identical symptom prompts just to increase a test count.

Prefer coverage by failure mode:
- recognition
- information sufficiency
- progressive assistance
- context update
- contradiction handling
- topic switching
- kit relevance
- emergency escalation/de-escalation
- medication boundary
- hospital location
- language handling
- Ollama grounding
- UI/assessment presentation

When a test fails, capture the exact conversation and trace it through the pipeline.

## 18. Current interaction-state refinement
The pending-question contract is explicit: an assistant follow-up question is part of the active situation. The next user turn must first be checked as a possible answer to that pending question before it is treated as a new standalone intent.

For sleepiness, the initial statement (for example `I feel sleepy`) must not satisfy its own `symptom_context` question. Answers such as `no`, `I slept badly last night`, `usual`, or `sleepier than normal` are eligible updates to the pending context.

For evolving wound states, the latest bleeding statement replaces the previous bleeding fact. Phrases such as `the bleeding stopped`, `it stopped bleeding`, `bleeding heavily`, and their Filipino equivalents must update the same `bleeding_status` field rather than coexist as contradictory authoritative facts.

This rule is a regression requirement, not an optional conversational enhancement.

## 18. Current validation notes
Pure deterministic tests and API tests are useful, but they are not proof of real model writing quality.

Ollama configuration remains available at `http://localhost:11434/api/chat` with default model `qwen3.5:0.8b` for development/extension. The production medical reply path is deterministic so that safety and latency do not depend on model availability.

For live model validation, run `node test-ollama-live.js` on a machine where Ollama is running and the configured model is installed. A `SKIPPED` result means live model behavior was not tested in that environment.

Do not claim "Ollama behavior proven" from deterministic fallback-only tests.

## 19. Latest repaired behavior
The current baseline specifically enforces progressive medical assistance. A recognized medical statement may receive safe general guidance immediately even when situation-specific details are still missing. The response should then ask one useful question, and the next user turn must update the same active situation before standalone intent handling.

The pending-question state is authoritative for the next turn: a reply such as `no`, `yes`, `a little`, `on my hand`, `38.5 C`, or `I slept badly last night` is first interpreted against the pending information request when it plausibly answers it. The system must not discard that answer just because the raw message would otherwise look casual or vague.

For evolving situations, new facts replace contradictory older facts. For example, `bleeding a little` followed by `the bleeding stopped` must leave the active state as stopped bleeding, and `bleeding a little` followed by `bleeding heavily` must escalate the state without retaining the older amount as authoritative.

Unrelated topics suspend the active medical situation rather than inheriting it into the new reply. The prior situation may be recovered only when the user clearly refers back to it.

Kit integration is contextual: when a mapped kit item is relevant, the response should name and direct the user to that actual item; when the kit is not relevant, it should remain in the background.

Generic wound wording is now a deliberate clarification gate. Inputs such as `sugat` or `sugat, dugo` do not receive wound-care instructions or a kit recommendation until the system establishes the bleeding status. A clearly described `small cut`, active `bleeding`, or similarly specific statement can still receive the appropriate baseline guidance while asking the next high-value question.

## 20. Next development objective
The final integration goal is to keep **progressive assistance + persistent situation state + deterministic safety-controlled communication** stable across representative medical situations without reintroducing old routing conflicts. Ollama can be re-enabled as a communication enhancement later without moving decision authority out of the structured pipeline.

## 21. Core principle
> **The structured pipeline decides what assistance is justified. The knowledge and kit layers provide what is grounded. Context keeps the situation coherent. The response layer communicates it clearly. Ollama, when used, never overrides the structured decision. The assistant never invents what the system does not know.**

## Latest behavior fixes (September 2026)

The current release keeps the deterministic medical pipeline authoritative and prevents the conversational model from overriding established medical routing or formatting.

- Medical replies are English-only.
- A medical concern receives useful supported care immediately when possible; clarification is never a question-only dead end.
- Follow-up questions are limited to information that can materially change the next step. Once the available information is sufficient, no follow-up is added.
- Clear emergency evidence (including an unresponsive/collapsed person and severe bleeding) is routed directly to emergency first aid instead of the generic capability response.
- Medical guidance is rendered as readable bullet steps with important actions and kit items emphasized in bold.
- Relevant kit items are actively explained in context instead of being dumped as a generic inventory. Generic/underspecified wound complaints do not trigger a kit recommendation prematurely.
- "What should I put in a first-aid kit for treating small cuts?" is treated as a targeted kit-content recommendation, not an inventory request.
- Hospital lookup accepts an explicit municipality such as Antipolo directly and uses the supplied hospital dataset without distance calculation.
- Voice replies are OFF by default. When browser speech synthesis is supported, the header control lets the user turn automatic assistant voice replies on/off. User messages and typing indicators are never spoken. Voice speaks the final rendered assistant reply and strips Markdown formatting for playback.
- The assessment panel ends with the normal summary note and does not mention hidden model thoughts.

### Voice support

Voice playback uses the browser's built-in `speechSynthesis` API; no additional speech service is required. Voice input remains separate from automatic voice playback. Chrome/Edge are recommended for the broadest browser speech support.

## Persistent conversation memory (Stage 7)
## Context reconnection (Stage 7.1)

Persistent memory is not used as a replacement for RAG. RAG remains the knowledge-retrieval layer, while session memory stores the active conversation state. Stage 7.1 adds an explicit context-reconnection pass for ambiguous follow-ups and corrections. When an active medical situation exists, messages such as "actually it is on my index finger" or "what should I do with it?" can reconnect to that situation instead of falling into the generic capability response. Established facts are updated rather than duplicated, and unrelated/casual turns do not erase the active situation. The memory snapshot is also protected from accidental replacement by a blank context.

The system deliberately does not store diagnoses or chain-of-thought. It stores bounded structured facts, pending information, recent turns, and suspended situations.

The assistant now keeps a compact session-memory snapshot separate from RAG. RAG remains for knowledge retrieval; conversation memory stores the active situation, established facts, pending information, a short recent-turn window, and suspended situation snapshots. The browser sends this compact state with each request and stores it in `sessionStorage`, while the server validates and updates it.

Casual/uncategorized turns no longer erase the active situation. This prevents short conversational messages such as “no bro” from destroying an established medical context. A new medical topic can replace the active topic while the previous situation is retained as a suspended snapshot.

The memory layer contains structured state, not hidden chain-of-thought or diagnoses. It is intended to become the compact context supplied to Ollama/cloud AI later, so the AI does not need the entire transcript to preserve continuity.
