# ARIA / MedisinACSHS 2.0 — Shared Development README

**Purpose:** This document is the shared source of truth for the four parallel development chats. Each chat owns one area, but all four must follow the same product goals, interface contracts, safety boundaries, and integration rules. Update this README whenever a decision changes so the separate chats stay aligned.

**Project:** MedisinACSHS 2.0 — Grade 12 research project, Antipolo City Senior High School.

**Baseline:** `MedisinACSHS-2.0-v7-VERCEL-FINAL15(1).zip` is the latest supplied code baseline. Its repository README and source code must be inspected before changing implementation. The source code determines what CURRENTLY works; this shared README defines the intended direction. Do not claim a feature works until it has been tested.

---

## 1. Product Goal

ARIA is the conversational assistant experience for **MedisinACSHS**, an AI-assisted first-aid and medical-information kiosk physically integrated with a real first-aid kit.

ARIA should feel like a knowledgeable, approachable first-aid companion that can:

- understand what a user says in English, Filipino, or mixed phrasing;
- give useful, safe, understandable first-aid and general medical information;
- remember the current situation and respond coherently to follow-up answers;
- direct the user to actual relevant items in the physical kit;
- explain the kit's real inventory and item uses;
- help locate listed medical facilities when appropriate;
- communicate through a clear web interface and an animated character.

ARIA is **not a doctor, diagnostic system, or prescription engine**. The goal is not to make the AI sound impressive at the expense of safety or reliability. The goal is useful, grounded assistance that works as one integrated kiosk.

## 2. The Four Development Areas

Each area is handled in a separate chat. That chat should focus on its own area, inspect relevant source files before editing, and update this README with any agreed interface or behavior changes. Do not silently make decisions that affect another area.

### Area 1 — AI Chatbot and Conversation Engine

**Goal:** Make the assistant understand the user, make safe structured decisions, preserve conversational context, and communicate naturally.

Responsibilities:

- Intent and topic understanding for medical, first-aid, emergency, kit, hospital, emotional-support, casual, and technical/general messages.
- English, Filipino, and Taglish understanding.
- Situation state: explicit facts, unknown facts, severity/risk signals, changes over time, pending questions, relevant kit items, and next useful question.
- Progressive assistance: give safe general guidance when possible even if details are missing; ask one high-value question rather than turning the conversation into a questionnaire.
- Follow-up handling: interpret replies such as “no,” “a little,” or “it stopped” against the pending question and active situation when appropriate.
- Contradiction handling: the latest explicit fact replaces the older conflicting fact.
- Topic switching without stale medical context leaking into unrelated replies; recover a previous situation only when the user clearly refers back to it.
- Approved medical knowledge/RAG, deterministic safety decisions, medication boundaries, emergency escalation, and hospital-location routing.
- Natural-language generation through Ollama when available, with deterministic safe fallback.

**Decision authority:** Structured application logic and approved data control emergency status, severity, allowed guidance, medication boundaries, kit contents, and hospital selection. Ollama is a communication layer only. It may improve wording and flow but must not invent facts or override structured decisions.

**Medical response principles:**

- Do not diagnose or prescribe medicine/dosage.
- Do not assume missing facts. “I cut my hand” establishes a cut and its location, but not its depth or bleeding amount.
- For ordinary medical concerns, prefer: acknowledge → immediate useful guidance → brief reason a detail matters → one high-value question → update guidance after the answer.
- Emergency responses should give clear escalation plus an immediate supported action when possible.
- Medical/first-aid guidance should be in English; the system must still understand Filipino and mixed-language input.
- Do not expose internal classifiers, prompts, chain-of-thought, or pipeline labels.

**Hospital rules:** No implicit Antipolo/demo-venue default. If the user's general location is unknown, ask for city/municipality. Use the supplied hospital dataset. Distance calculation, live proximity, and fabricated kilometer estimates are not supported.

**Regression priorities:** Headache, dizziness, nausea, fever, weakness, cuts, heavy bleeding, bleeding stopped, pending yes/no answers, kit questions, medication questions, hospital-near-me requests, Filipino medical input, topic switching, and multi-turn continuity must be tested.

**Area 1 deliverables:** stable API behavior, documented request/response contracts, situation/context behavior, safety boundaries, regression tests, and clear integration notes for the other areas.

### Area 2 — Web Application User Interface

**Goal:** Create a clear, accessible kiosk interface that makes ARIA easy to use on the physical 7-inch touchscreen and remains coherent with the existing MedisinACSHS features.

Responsibilities:

- Chat layout, message presentation, input controls, loading/error states, and conversation readability.
- Responsive layout for the target 800 × 480 touchscreen as well as development screens.
- Clear display of first-aid steps, safety warnings, follow-up questions, and relevant kit items.
- Preserve useful existing v7 branding and features, including the calendar, hospital interface, kiosk presentation, voice functionality where it exists, and the expandable **MedisinACSHS assessment** panel.
- Assessment panel should display a concise structured summary (for example: situation, known facts, unclear details, risk/safety status, and relevant kit items), never hidden chain-of-thought.
- Provide a clear way for users to interact with the animated character and inventory features without making the screen cluttered.
- Keep keyboard/touch interaction practical for a public kiosk.

**UI rules:**

- The UI presents the backend's structured result; it must not independently decide medical intent, emergency status, kit inventory, or hospital routing.
- Do not duplicate the chatbot's medical decision logic in browser code.
- Do not reintroduce the retired OpenRouter implementation.
- Avoid replacing the working v7 interface wholesale without a demonstrated need.
- Keep accessibility, contrast, touch-target size, text legibility, and short-session kiosk use in mind.

**Area 2 deliverables:** interface changes, responsive behavior, states/error handling, and a list of the backend fields/events the UI expects.

### Area 3 — Animated Character

**Goal:** Add a friendly animated character that gives ARIA a recognizable presence without obstructing first-aid instructions or making the kiosk feel like a toy during serious situations.

Responsibilities:

- Character appearance, idle animation, listening/thinking/speaking states, and appropriate emotional expression.
- Connect animation states to actual application events, such as waiting for input, processing, speaking, and idle.
- Keep animation lightweight enough for Raspberry Pi 4 hardware and Chromium kiosk mode.
- Ensure the character works at the target touchscreen resolution and does not cover critical text, controls, warnings, or emergency actions.
- Use calm, restrained presentation during medical or emergency conversations; avoid exaggerated or inappropriate reactions.
- Support a graceful static or reduced-motion fallback if animation fails or performance is limited.

**Character rules:**

- The character is a presentation layer, not an independent chatbot or medical decision-maker.
- It must not invent speech, medical information, or status events.
- Its expressions and states must reflect real app state rather than guess what the AI is doing.
- Do not add heavy 3D or GPU-intensive effects without performance evidence on the target Pi.

**Area 3 deliverables:** character assets/animation, a small documented state/event interface, performance considerations, and a fallback behavior.

### Area 4 — Physical Kit Inventory System

**Goal:** Make the digital inventory accurately represent the real MedisinACSHS first-aid kit and allow the chatbot and UI to use it consistently.

Responsibilities:

- Maintain one authoritative structured inventory of actual kit items.
- Store item names, categories, descriptions, recorded uses, and any relevant quantity/status fields supported by the project.
- Provide predictable data access for the chatbot and UI.
- Present inventory questions as a clear categorized list.
- Explain an item's use using its stored, reviewed description rather than asking an LLM to invent an explanation.
- Map relevant items to guidance only when the actual item exists in the inventory.
- Distinguish “not listed in this kit” from “does not exist generally.”

**Inventory rules:**

- Never invent an item, quantity, or stock status.
- Do not recommend a kit item when it is not relevant to the situation.
- The chatbot must refer to the same inventory data that the inventory UI displays; do not maintain competing lists in prompts, frontend constants, and backend code.
- Medical safety decisions must not depend on a possibly stale or incomplete inventory display.
- Any quantity tracking or restocking workflow must be clearly defined before implementation; do not imply live stock tracking unless the data and UI actually support it.

**Area 4 deliverables:** authoritative schema/data source, validation rules, inventory access contract, categorized display behavior, and tests for present/missing items and item explanations.

---

## 3. Shared Integration Contract

The four areas must remain modular and connect through explicit contracts rather than hidden assumptions.

1. **Chatbot → UI:** The chatbot/API provides the user-facing reply and, where available, structured metadata such as response type, safety status, follow-up prompt, assessment summary, and relevant kit item IDs. The UI renders these fields; it does not reinterpret the medical situation.
2. **Chatbot → Inventory:** The chatbot requests item data from the authoritative inventory source. It must not maintain its own invented or duplicated inventory.
3. **UI → Character:** The UI/application emits documented state events such as `idle`, `listening`, `processing`, and `speaking`. The character reflects those events and does not decide them independently.
4. **Inventory → UI:** The UI renders the same validated inventory records used by the chatbot.
5. **Shared state:** Conversation state belongs to the chatbot/backend/session layer. Character animation state and visual UI state must not overwrite medical facts or conversation context.
6. **Failure behavior:** If animation or audio fails, text interaction should remain usable. If Ollama is unavailable, the application should use its safe fallback rather than fabricate a reply. If inventory data is unavailable, the system must not invent kit contents.
7. **Contract changes:** If one area needs a new field, event, API route, or data schema, document it here before or alongside implementation and tell the other area chats exactly what changed.

Do not assume all four areas are complete merely because they work separately. Full integration must be tested on the actual target environment.

## 4. Shared Hardware Reference

- **Main board:** Raspberry Pi 4 Model B, 8 GB RAM — required final-build component.
- **Display:** Existing generic 7-inch DSI touchscreen, 800 × 480, with its existing ribbon cable and orientation.
- **Power:** Existing USB-C supply rated 5 V / 3 A retained for initial assembly and testing. Its sufficiency for the complete system must be verified under load.
- **Audio:** Waveshare USB TO AUDIO module (SSS1629A5), with built-in microphone and USB audio input/output.
- **Speaker:** Separate passive speaker, preferably 8 Ω / 5 W, connected through a compatible PH2.0 speaker connector.
- **Cooling:** Small 5 V fan; verify its current draw and connection method.
- **Storage:** Reuse existing 64 GB microSD card for initial migration and testing.

Test the Pi, screen, fan, microphone, and speaker together while ARIA is processing. Check for low-voltage warnings, reboots, audio failures, and performance problems. Do not purchase replacement power hardware without first testing the complete setup unless a known rating or compatibility issue requires it.

## 5. Development Workflow for Every Area

Use this cycle:

**INSPECT → PLAN → BUILD → TEST → PROVE PASS → DOCUMENT → FREEZE → NEXT CHANGE**

Before modifying the baseline:

1. Read the repository README and inspect the relevant actual source files.
2. Identify the existing behavior and dependencies; do not assume documentation perfectly describes the implementation.
3. Make the smallest complete change that addresses the agreed requirement.
4. Run relevant unit tests and actual API/UI/integration tests as applicable.
5. Test representative failure cases, not only the happy path.
6. Report exactly what passed, failed, or could not be tested.
7. Update this shared README if behavior, data contracts, hardware assumptions, or integration points changed.

A feature is not “fixed” because the code compiles or one example works. For AI behavior, distinguish deterministic logic verified, integration contract verified, and actual Ollama/model behavior verified. A skipped live-model test is not a pass.

Do not add one-off hard-coded templates for every failed example. Trace failures to understanding, decision logic, context/state, knowledge retrieval, inventory mapping, response generation, UI rendering, or integration, then fix the responsible layer.

## 6. Shared Non-Negotiable Rules

- **Accuracy over confidence:** Do not invent facts, medical guidance, kit items, hospitals, distances, stock, or capabilities.
- **Known is not inferred:** Missing information remains unknown until established.
- **Safety first:** Emergency escalation and supported immediate actions take precedence over ordinary conversation.
- **Progressive assistance:** Do not withhold safe general guidance just because more details would help.
- **Context continuity:** Use pending questions and the active situation to interpret plausible follow-up answers.
- **No stale context leakage:** A clear topic switch must not inherit irrelevant medical state.
- **One source of truth:** Shared inventory, hospital data, and application state must not be duplicated across areas without a clear synchronization strategy.
- **No hidden reasoning exposure:** Assessment summaries may explain the structured outcome, but must not reveal chain-of-thought or private prompts.
- **Preserve useful v7 functionality:** Do not remove useful branding, calendar, hospital interface, voice features, or kiosk behavior without a deliberate decision.
- **No retired OpenRouter implementation:** Keep the current local Ollama-oriented architecture where supported by the baseline.
- **Test on target hardware:** Browser performance, audio, touchscreen usability, power stability, and character animation must be checked on the Raspberry Pi kiosk.

## 7. Baseline and Current-State Discipline

The supplied v7 project includes a web application, API routes, CSS/JavaScript assets, local data modules, RAG defaults, a local Ollama response layer, situation/context modules, and tests. File names and implementation details may change as development progresses.

When describing current behavior, inspect the code and tests first. This README describes the shared target architecture and the four work areas; it is not proof that every listed capability is currently implemented or verified.

Known historical regression classes to keep testing include:

- ordinary capability or kit questions incorrectly triggering emergency behavior;
- common symptoms such as headache, dizziness, nausea, fever, or weakness receiving no useful guidance;
- Filipino medical input failing recognition;
- severe bleeding failing to escalate or a stopped bleed retaining the old state;
- repeated questions or restarting the conversation mid-situation;
- a pending answer such as “no” being treated as a new unrelated message;
- an unrelated topic inheriting the previous medical situation;
- kit explanations inventing items or uses;
- hospital lookup silently assuming Antipolo or fabricating distances;
- medication requests receiving prescription-like advice;
- internal pipeline labels or unsupported Ollama claims appearing in the user-facing reply;
- the UI becoming difficult to use at 800 × 480;
- character animation blocking important controls or degrading kiosk performance.

## 8. How the Four Chats Should Use This README

Each area chat should:

1. Treat its assigned area as its primary scope and this document as shared context.
2. Read the relevant source files before making implementation claims or changes.
3. Avoid changing another area's architecture without documenting the reason and proposed contract change.
4. When a cross-area change is needed, specify the exact API field, event, schema, file, or behavior that must be coordinated.
5. At the end of a work session, provide a short update containing: **changed**, **verified**, **not verified**, **known limitations**, and **README changes needed**.
6. Carry forward the latest version of this README in subsequent work so separate chats do not diverge.

## 9. North-Star Experience

A user should feel:

> “ARIA understood what I said, helped me with what I can do now, remembered the relevant details, connected me to the real kit when appropriate, and made the experience clear and approachable.”

The chatbot, interface, animated character, and inventory are four parts of one kiosk. None should behave as an unrelated demo or override the shared safety, data, and integration rules above.

---

## October 23, 2026 — Area 2 Inventory UI handoff (provisional)

Owner explicitly replaced the third home menu's Medalendar destination with a new inventory interface. This is an intentional exception to the earlier calendar-preservation goal. The single browser-facing code tree remains `public/`; see `INVENTORY_UI_NOTES.md` for exact paths.

Current **UI-only** behavior: empty startup inventory; Add Supplies creates an editable, initially unnamed category with five empty rows; category pencil toggles editing; trash confirms category deletion; red row X deletes immediately; a completed last row appends a blank row; expiry badges count recorded item rows (expired = before today, expiring = today through 30 days ahead); the warning dropdown scrolls to recorded rows; the home inventory button gets a red badge when any recorded row is flagged. Entries persist only within the current browser origin via `localStorage` key `aria.inventory.v1` and do **not** represent server-side or synchronized stock data.

**Outstanding Area 1 / Area 4 integration contract:** Editable UI entries must eventually be validated and read from one server-backed inventory source together with the chatbot. The medically reviewed `data/kit.js` catalog currently remains separate; user-entered browser records do not authorize new medical-use descriptions or claims by the chatbot. Do not claim this stage provides live kit stock synchronization. No API fields changed in this UI phase. Decide expiring threshold, inventory schema, persistence and allowed uses across chats before full integration.

## Inventory UI v3 integration note (2026-10-23)
The browser-based inventory ledger is still separate from the approved chatbot kit catalog. UI-only refinements: one initial blank row, auto-edit new categories, short MM/DD/YY editor with ISO persistence, Enter-key progression, transparent warning/trash assets, and an unnumbered home inventory warning dot. A shared kiosk press-feedback asset now lightens button/link appearance on click. No API, decision authority, or inventory data contract changes were introduced.

### UI Inventory v3 handoff
The inventory UI now uses transparent warning/trash artwork and three segmented expiry date fields (MM/DD/YY) while persisting ISO dates. Keyboard Enter advances only after a field change and otherwise ends edit mode. Badge placement tuning is documented under `USER TUNING` comments in the public CSS. Browser-local inventory is not yet authoritative chatbot inventory.
