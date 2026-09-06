// Curated baseline guidance derived from the project's existing emergency-RAG
// and kit reference material. This is a factual support layer, not a diagnosis engine.
const MEDICAL_GUIDANCE = {
  headache: {
    summary: 'Headaches can have many causes, so start with simple supportive care and watch for warning signs.',
    actions: ['Rest somewhere comfortable and drink some water.', 'Avoid strenuous activity for now and monitor whether the headache improves.'],
    followUp: 'How severe is the headache, and is it getting worse or coming with vomiting, vision changes, confusion, weakness, or fainting?'
  },
  dizziness: {
    summary: 'Dizziness can have many causes. The immediate priority is keeping yourself safe from a fall.',
    actions: ['Sit or lie down somewhere safe and avoid standing up suddenly.'],
    followUp: 'Did the dizziness start suddenly, or are you having vomiting, vision changes, confusion, weakness, or fainting?'
  },
  nausea: {
    summary: 'Nausea can have many causes, so keep things simple while you see how you feel.',
    actions: ['Rest somewhere comfortable and take small sips of water if you can keep fluids down.'],
    followUp: 'Have you vomited?'
  },
  weakness: {
    summary: 'Weakness can happen with tiredness, stress, dehydration, illness, or other causes, so what comes with it matters.',
    actions: ['Sit or lie down somewhere safe and rest for a moment. If you can drink normally, take some water.'],
    followUp: 'Did the weakness start suddenly?'
  },
  fever: {
    summary: 'Checking your temperature can help you keep track of a fever and decide what to do next.',
    actions: ['Use the digital thermometer in the kit if available, follow its instructions, rest, and drink fluids regularly.'],
    followUp: 'Have you checked your temperature?'
  },
  sore_throat: {
    summary: 'For an ordinary sore throat, simple supportive care is usually the first step.',
    actions: ['Rest your voice and drink water or warm fluids regularly. Warm salt-water gargling may help if you can gargle safely.'],
    followUp: 'Are you having trouble swallowing or breathing?'
  },
  cough: {
    summary: 'A cough can have many causes, so focus on comfort while watching for breathing problems or other warning signs.',
    actions: ['Rest and drink fluids regularly.'],
    followUp: 'Are you having trouble breathing?'
  },
  stomach_pain: {
    summary: 'Stomach pain can have many causes, so the next step depends on how severe it is and what else is happening.',
    actions: ['Rest and take fluids as tolerated while you monitor how the pain changes.'],
    followUp: 'How severe is the pain?'
  },
  diarrhea: {
    summary: 'Keeping hydrated is important when you have diarrhea.',
    actions: ['Drink fluids regularly and rest.'],
    followUp: 'Are you able to drink fluids normally?'
  },
  runny_nose: {
    summary: 'A runny or stuffy nose is often managed with simple supportive care.',
    actions: ['Rest and drink fluids regularly.'],
    followUp: 'Are you having trouble breathing?'
  },
  minor_wound: {
    summary: 'For a cut or other minor wound, start with basic wound care and check whether there is active bleeding.',
    actions: ['Gently rinse the wound with clean running water. If it is bleeding, apply steady direct pressure with clean gauze or a clean cloth. Once bleeding is controlled, cover a small wound with an adhesive bandage or appropriate dressing.'],
    followUp: 'Is the wound bleeding right now?'
  },
  burn: {
    summary: 'For a minor thermal burn, cooling and protecting the area are the first priorities.',
    actions: ['Cool the burn with clean running water and do not apply ice directly to the skin. A sterile non-stick burn dressing from the kit can protect a minor burn afterward.'],
    followUp: 'Where is the burn?'
  },
  injury: {
    summary: 'For a minor injury such as a bump or sprain, protect the area and watch how movement and swelling change.',
    actions: ['Rest the injured area. An instant cold pack from the kit can help with swelling from a minor bump or sprain.'],
    followUp: 'Can you move or walk normally?'
  },
  nosebleed: {
    summary: 'For a nosebleed, positioning and steady pressure are the first steps.',
    actions: ['Sit upright, lean slightly forward, and pinch the soft part of the nose continuously. Do not tilt your head backward.'],
    followUp: 'Is the bleeding heavy or not stopping?'
  },
  eye_issue: {
    summary: 'For a minor eye irritation or foreign material, gentle irrigation is the safest first step.',
    actions: ['If appropriate, rinse the eye gently with sterile saline or clean water. Do not dig into the eye or try to remove an embedded object.'],
    followUp: 'What got into the eye?'
  },
  sleepiness: {
    summary: 'Ordinary sleepiness can come from lack of rest, while unusual or severe drowsiness needs more context.',
    actions: ['If you are simply tired, rest somewhere safe and give yourself a chance to recover.'],
    followUp: 'Did you get enough sleep?'
  },
  skin_rash: {
    summary: 'A rash can have many causes, so avoid assuming what caused it from the description alone.',
    actions: ['Avoid any new product or obvious irritant that seems to make it worse and monitor how it changes.'],
    followUp: 'When did the rash start?'
  },
  palpitations: {
    summary: 'A racing or pounding heartbeat can have several causes and should be assessed in context.',
    actions: ['Sit down and rest for a moment rather than pushing through the symptoms.'],
    followUp: 'Did the racing heartbeat start suddenly?'
  },
  fatigue: {
    summary: 'Fatigue can have many causes, including lack of rest, stress, or illness.',
    actions: ['Take a break, rest, and drink some water if you can.'],
    followUp: 'How long have you been feeling this tired?'
  },
  anxiety: {
    summary: 'Stress or anxiety can feel intense even when there is no immediate danger.',
    actions: ['Slow things down, relax your shoulders, and focus on one small thing you can manage right now.'],
    followUp: 'Do you feel physically safe right now?'
  }
};
module.exports = { MEDICAL_GUIDANCE };
