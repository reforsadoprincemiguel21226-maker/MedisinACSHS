// Location gazetteer — migrated DATA from the old MedisinACSHS project
// (data/hospitals-data.js -> townAliases), not its decision logic.
//
// Purpose in Stage 1: recognize when a message IS a place name (e.g. the
// user replying "Antipolo" to "hospital near me"), so it can be tagged as
// message_type "location". This does NOT decide what to do with that
// location — that's Stage 7 (Hospitals) plus later Stage 5 (Context).

const TOWN_ALIASES = {
  "antipolo": "antipolo",
  "antipolo city": "antipolo",
  "morong": "morong",
  "angono": "angono",
  "binangonan": "binangonan",
  "montalban": "montalban",
  "rodriguez": "montalban",
  "rodriguez montalban": "montalban",
  "rodriguez (montalban)": "montalban",
  "taytay": "taytay",
  "san mateo": "sanmateo",
  "sanmateo": "sanmateo",
  "cainta": "cainta",
  "tanay": "tanay",
  "pililla": "pililla",
  "pillila": "pililla",
  "cardona": "cardona",
  "jalajala": "jalajala",
  "teresa": "teresa",
};

// All known surface forms, longest first so multi-word names
// ("san mateo") match before any partial single-word collision.
const KNOWN_PLACE_NAMES = Object.keys(TOWN_ALIASES).sort(
  (a, b) => b.length - a.length
);

module.exports = { TOWN_ALIASES, KNOWN_PLACE_NAMES };
