// Stage 4 — authoritative physical first-aid kit inventory.
// This file describes what is actually in the kit and the intended general use
// supplied for this project. It is not a diagnosis or treatment engine.

const KIT = [
  { id: 'adhesive-bandages', name: 'Adhesive Bandages (Assorted Sizes)', category: 'Wound Care & Bleeding Control', uses: ['protecting minor cuts, abrasions, and superficial wounds from contamination'], topics: ['minor_wound'], minSeverity: 'minor' },
  { id: 'sterile-gauze-pads', name: 'Sterile Gauze Pads', category: 'Wound Care & Bleeding Control', uses: ['wound coverage', 'absorption of exudate', 'primary bleeding control'], topics: ['minor_wound', 'severe_bleeding', 'injury', 'nosebleed'], minSeverity: 'minor' },
  { id: 'medical-adhesive-tape', name: 'Medical Adhesive Tape', category: 'Wound Care & Bleeding Control', uses: ['securing gauze pads, dressings, and bandages firmly to the skin'], topics: ['minor_wound', 'injury'], minSeverity: 'minor' },
  { id: 'cotton-swabs', name: 'Cotton Swabs', category: 'Wound Care & Bleeding Control', uses: ['precise application of topical medications', 'targeted cleaning of minor wounds'], topics: ['minor_wound'], minSeverity: 'minor' },
  { id: 'burn-dressing', name: 'Burn Dressing (Sterile Non-Stick)', category: 'Wound Care & Bleeding Control', uses: ['cooling, soothing, and protecting minor burns while preventing adhesion to the wound bed'], topics: ['burn'], minSeverity: 'minor' },
  { id: 'antiseptic-solution-wipes', name: 'Antiseptic Solution / Wipes', category: 'Antiseptics & Personal Hygiene', uses: ['disinfecting the peri-wound area to help prevent infection in minor injuries'], topics: ['minor_wound', 'injury'], minSeverity: 'minor' },
  { id: 'isopropyl-alcohol-hand-sanitizer', name: 'Isopropyl Alcohol / Hand Sanitizer', category: 'Antiseptics & Personal Hygiene', uses: ['hand hygiene before administering first aid to minimize cross-contamination'], topics: ['minor_wound', 'burn', 'injury', 'severe_bleeding', 'breathing', 'fainting'], minSeverity: 'unknown', role: 'hygiene' },
  { id: 'disposable-medical-gloves', name: 'Disposable Medical Gloves', category: 'PPE & Infection Control', uses: ['universal-precaution barrier to protect rescuer and patient from cross-infection'], topics: ['minor_wound', 'burn', 'injury', 'severe_bleeding', 'fainting', 'nosebleed'], minSeverity: 'unknown', role: 'PPE' },
  { id: 'medical-face-masks', name: 'Medical Face Masks', category: 'PPE & Infection Control', uses: ['basic respiratory droplet containment and general infection control'], topics: ['cough', 'sore_throat'], minSeverity: 'minor', role: 'PPE' },
  { id: 'cpr-face-shield', name: 'CPR Face Shield / Barrier Device', category: 'PPE & Infection Control', uses: ['one-way-valve barrier during CPR to reduce fluid transmission'], topics: ['fainting', 'breathing'], minSeverity: 'emergency' },
  { id: 'elastic-bandage', name: 'Elastic Bandage (ACE Type)', category: 'Injury Support & Immobilization', uses: ['localized compression and structural support for minor strains and sprains'], topics: ['injury'], minSeverity: 'minor' },
  { id: 'triangular-bandage', name: 'Triangular Bandage', category: 'Injury Support & Immobilization', uses: ['constructing slings, securing splints, or binding extremity injuries'], topics: ['injury'], minSeverity: 'minor' },
  { id: 'instant-cold-pack', name: 'Instant Cold Packs / Compresses', category: 'Injury Support & Immobilization', uses: ['localized cryotherapy to reduce swelling, inflammation, and pain from minor bumps or sprains'], topics: ['injury'], minSeverity: 'minor' },
  { id: 'medical-scissors', name: 'Medical Scissors', category: 'Medical Tools & Instruments Safety', uses: ['cutting gauze, medical tape, bandages, or clothing safely near the skin'], topics: ['minor_wound', 'burn', 'injury', 'severe_bleeding'], minSeverity: 'minor', role: 'tool' },
  { id: 'fine-tip-tweezers', name: 'Fine-Tip Tweezers', category: 'Medical Tools & Instruments Safety', uses: ['extracting superficial splinters or foreign materials from the skin'], topics: ['minor_wound', 'injury'], minSeverity: 'minor', role: 'tool' },
  { id: 'digital-thermometer', name: 'Digital Thermometer', category: 'Medical Tools & Instruments Safety', uses: ['objective assessment of body temperature'], topics: ['fever'], minSeverity: 'minor', role: 'assessment' },
  { id: 'emergency-thermal-blanket', name: 'Emergency Thermal Blanket (Mylar)', category: 'Environmental Support & Diagnostics', uses: ['retaining body heat to help prevent hypothermia and support thermal regulation'], topics: ['injury', 'fainting', 'cold_exposure'], minSeverity: 'unknown', role: 'environmental_support' },
  { id: 'sterile-saline-solution', name: 'Sterile Saline Solution', category: 'Environmental Support & Diagnostics', uses: ['mechanical irrigation and rinsing of debris from eyes or minor wounds'], topics: ['minor_wound', 'injury', 'eye_issue'], minSeverity: 'minor', role: 'irrigation' },
];

module.exports = { KIT };
