// Stage 4 — deterministic mapping from an established decision/understanding
// to actual items in the physical kit. This layer does not diagnose or change
// severity. It only answers: which kit items are relevant to this situation?
const { KIT } = require('../data/kit.js');

const SEVERITY_ORDER = ['unknown', 'minor', 'potentially_severe', 'emergency'];

function severityAtLeast(actual, required) {
  const a = SEVERITY_ORDER.indexOf(actual || 'unknown');
  const r = SEVERITY_ORDER.indexOf(required || 'unknown');
  return a >= r;
}

function topicMatches(item, topics) {
  return (item.topics || []).some(topic => topics.includes(topic));
}

function mapKitItems(understanding, decision, options = {}) {
  const u = understanding || {};
  const d = decision || {};
  const topics = Array.isArray(u.topics) ? u.topics : [];
  const severity = SEVERITY_ORDER.includes(u.severity) ? u.severity : 'unknown';
  const limit = Math.max(1, Math.min(Number(options.limit) || 8, 12));

  // Kit mapping is only meaningful for situations where first aid or a
  // concrete medical-support action has already been established upstream.
  const actionable = d.firstAid === true || d.responseType === 'emergency_first_aid';
  if (!actionable || topics.length === 0) return [];
  // Stage 2.1 may establish that the current information is too incomplete
  // for a useful kit recommendation. Do not turn a generic complaint such as
  // "sugat, dugo" into a product list merely because a topic keyword matched.
  if (d.kitReady === false && d.responseType !== 'emergency_first_aid') return [];

  const scored = KIT.map(item => {
    if (!severityAtLeast(severity, item.minSeverity)) return null;
    if (!topicMatches(item, topics)) return null;

    let score = 0;
    const matchingTopics = (item.topics || []).filter(t => topics.includes(t));
    score += matchingTopics.length * 10;

    // General hygiene/PPE can support many first-aid cases, but should not
    // outrank items that directly address the identified problem.
    if (item.role === 'hygiene') score -= 2;
    if (item.role === 'PPE') score -= 1;
    if (item.role === 'tool' || item.role === 'assessment' || item.role === 'environmental_support') score -= 1;

    // For emergency cases, PPE/barrier items remain eligible, while items
    // intended specifically for minor care are filtered by minSeverity above.
    if (severity === 'emergency' && item.id === 'cpr-face-shield' && topics.includes('fainting')) score += 4;

    return { item, score, matchingTopics };
  }).filter(Boolean)
    .sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id));

  return scored.slice(0, limit).map(({ item, score, matchingTopics }) => ({
    id: item.id,
    name: item.name,
    category: item.category,
    uses: item.uses,
    matchingTopics,
    role: item.role || 'care',
    minSeverity: item.minSeverity,
    mappingScore: score,
  }));
}

module.exports = { mapKitItems, severityAtLeast };
