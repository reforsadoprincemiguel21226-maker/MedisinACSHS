'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = __dirname;
const publicDir = path.join(root, 'public');
const html = fs.readFileSync(path.join(publicDir, 'inventory.html'), 'utf8');
const home = fs.readFileSync(path.join(publicDir, 'home.html'), 'utf8');
const script = fs.readFileSync(path.join(publicDir, 'assets/js/inventory.js'), 'utf8');
const storeScript = fs.readFileSync(path.join(publicDir, 'assets/js/inventory-store.js'), 'utf8');

const saved = new Map();
let id = 0;
const context = vm.createContext({
  window: {
    localStorage: {
      getItem: k => saved.get(k) ?? null,
      setItem: (k,v) => saved.set(k,v)
    },
    crypto: { randomUUID: () => `record-${++id}` }
  },
  Date, Math, JSON, Array, String, Number
});
vm.runInContext(storeScript, context);
const { read, write, warnings, expiryStatus, EXPIRING_DAYS } = context.window.ARIAInventory;
assert.equal(EXPIRING_DAYS, 30);
const date = new Date(2026, 9, 23);
assert.equal(expiryStatus('2026-10-22', date), 'expired');
assert.equal(expiryStatus('2026-10-23', date), 'expiring');
assert.equal(expiryStatus('2026-11-22', date), 'expiring');
assert.equal(expiryStatus('2026-11-23', date), '');
assert.equal(expiryStatus('2026-02-31', date), '');
assert.equal(expiryStatus('', date), '');

const inventory = { categories: [{ id: 'wound', name: 'Wound Care', rows: [
  { id: 'a', quantity: '2 PCS', supplies: 'Bandage', expiry: '2026-10-20' },
  { id: 'b', quantity: '1 PCS', supplies: 'Gauze', expiry: '2026-11-12' },
  { id: 'c', quantity: '', supplies: 'Missing quantity', expiry: '2026-10-20' },
  { id: 'd', quantity: '5 PCS', supplies: 'Unused', expiry: '' },
  { id: 'e', quantity: '1 PCS', supplies: 'Gloves', expiry: '2027-02-01' }
]}] };
assert.equal(write(inventory), true);
assert.equal(read().categories[0].rows.length, 5);
let flags = warnings(read(), date);
assert.equal(flags.length, 2);
assert.equal(flags[0].status, 'expired');
assert.equal(flags[0].name, 'Bandage');
assert.equal(flags[1].status, 'expiring');
assert.equal(flags[1].name, 'Gauze');
assert.equal(warnings({ categories: [] }, date).length, 0);
saved.set('aria.inventory.v1', '{bad json');
assert.equal(read().categories.length, 0, 'corrupt local data must not break page');

assert.match(home, /href="inventory\.html"/);
assert.match(home, /id="inventory-home-badge"/);
assert.doesNotMatch(home, /href="plan-schedule\.html"/);
for (const id of ['warning-button', 'warning-list', 'add-category', 'delete-dialog', 'inventory-scroll']) {
  assert(html.includes(`id="${id}"`), `inventory UI is missing ${id}`);
}
for (const token of ['ensureBlankRow', 'showDelete', 'performDelete', 'renderWarnings', 'scrollTo', 'localStorage']) {
  assert(script.includes(token) || storeScript.includes(token), `inventory action missing ${token}`);
}
for (const img of ['inventory-add.png','inventory-edit.png','inventory-trash.png','inventory-warning.png']) {
  assert(fs.existsSync(path.join(publicDir, 'assets/images', img)), `missing asset ${img}`);
}
assert(fs.readFileSync(path.join(publicDir, 'plan-schedule.html'), 'utf8').includes('inventory.html'));
console.log('Inventory UI contracts, persistence, warnings and assets: PASS');
