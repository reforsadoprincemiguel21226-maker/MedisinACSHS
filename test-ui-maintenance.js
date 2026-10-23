const assert = require('assert');
const fs = require('fs');
const path = require('path');

const publicRoot = path.join(__dirname, 'public');
const htmlPath = path.join(publicRoot, 'A.i asistant.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const css = fs.readFileSync(path.join(publicRoot, 'css', 'ai-assistant.css'), 'utf8');
const sw = fs.readFileSync(path.join(publicRoot, 'sw.js'), 'utf8');

assert(!html.includes('This summary shows the known facts and safety factors behind this reply, not private internal reasoning.'));
assert(!html.includes('assessment-note'));
assert(!css.includes('.assessment-note'));
assert(html.includes('How ARIA decided'));
assert(html.includes('css/ai-assistant.css?v=aria-chat-4'));
assert(sw.includes("const CACHE_NAME = 'medisinacshs-shell-v15-inventory-segments'"));
assert(sw.includes("'/css/ai-assistant.css?v=aria-chat-4'"));
assert(!sw.includes("'/data/hospitals-data.js'"));

const assetBlock = sw.match(/const STATIC_ASSETS = \[([\s\S]*?)\];/);
assert(assetBlock, 'service worker static asset list must exist');
const assets = [...assetBlock[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
for (const asset of assets) {
  const pathname = decodeURIComponent(asset.split('?')[0]);
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filePath = path.resolve(publicRoot, relative);
  assert(filePath.startsWith(publicRoot + path.sep), `asset path escapes public root: ${asset}`);
  assert(fs.existsSync(filePath), `service worker precaches missing asset: ${asset}`);
}

// There must be one authoritative frontend copy; the runtime serves public/.
for (const relative of ['index.html', 'home.html', 'A.i asistant.html', 'sw.js', 'css/ai-assistant.css', 'css/home.css']) {
  assert(!fs.existsSync(path.join(__dirname, relative)), `obsolete duplicate frontend file remains: ${relative}`);
}
console.log('UI cache and single-source maintenance checks: PASS');
