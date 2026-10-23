'use strict';
// Minimal DOM interaction harness for inventory.js when a real browser is
// unavailable. This verifies event flows, not CSS rendering/touch geometry.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

class E {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.style = {};
    this.attributes = {}; this.events = {}; this.parentElement = null; this.className = '';
    this.hidden = false; this.value = ''; this._text = ''; this.open = false;
    this.classList = {
      add: (...classes) => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...classes])].join(' '); },
      remove: (...classes) => { this.className = this.className.split(/\s+/).filter(x => !classes.includes(x)).join(' '); },
      contains: klass => this.className.split(/\s+/).includes(klass)
    };
  }
  set textContent(s) { this._text = String(s); this.children = []; }
  get textContent() { return this._text + this.children.map(c => c.textContent).join(''); }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return this.attributes[k]; }
  append(...list) { for (const child of list) { child.parentElement = this; this.children.push(child); } }
  replaceChildren(...list) { this.children = []; this._text = ''; this.append(...list); }
  get lastElementChild() { return this.children.at(-1) || null; }
  get nextElementSibling() {
    const siblings = this.parentElement?.children || [];
    return siblings[siblings.indexOf(this) + 1] || null;
  }
  addEventListener(name, f) { (this.events[name] ||= []).push(f); }
  dispatch(name, event = {}) { for (const f of this.events[name] || []) f({ target: this, ...event }); }
  remove() { const list = this.parentElement?.children; if (list) list.splice(list.indexOf(this), 1); }
  descendants() { return this.children.flatMap(c => [c, ...c.descendants()]); }
  matches(selector) {
    if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
    if (selector.startsWith('[data-category-id=')) return this.dataset.categoryId === selector.slice(19,-2);
    return selector.toUpperCase() === this.tagName;
  }
  querySelectorAll(selector) { return this.descendants().filter(e => e.matches(selector)); }
  querySelector(selector) {
    const match = /^\.cell:nth-child\((\d+)\) input$/.exec(selector);
    if (match) return this.children[Number(match[1]) - 1]?.querySelector('INPUT') || null;
    if (selector === '.inventory-row .cell:first-child input')
      return this.querySelector('.inventory-row')?.children[0]?.querySelector('INPUT') || null;
    if (selector === '.cell:first-child input') return this.children[0]?.querySelector('INPUT') || null;
    return this.querySelectorAll(selector)[0] || null;
  }
  closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) || null; }
  focus() { this.focused = true; }
  getBoundingClientRect() { return { top: 50 }; }
  scrollTo(v) { this.lastScroll = v; }
  showModal() { this.open = true; }
  close() { this.open = false; }
}
const ids = ['categories','inventory-scroll','warning-button','warning-list','warning-badges','save-status','delete-dialog','delete-question','add-category','confirm-delete','cancel-delete','inventory-refresh'];
const elements = Object.fromEntries(ids.map(id => [id, new E()]));
elements['warning-list'].hidden = true; elements['save-status'].hidden = true;
const data = new Map(); let counter = 0;
const win = {
  localStorage: { getItem: key => data.get(key) ?? null, setItem: (key,val) => { data.set(key,val); } },
  crypto: { randomUUID: () => `test-id-${++counter}` },
  setInterval: () => {}, addEventListener: () => {}, location: { reload() {} },
  confirm: () => true
};
const doc = {
  getElementById: id => elements[id], createElement: tag => new E(tag),
  addEventListener: () => {}, hidden: false
};
const context = vm.createContext({ window: win, document: doc, Date, Math, JSON, Array, String, Number,
  matchMedia: () => ({ matches: true }), CSS: {escape: value => value} });
const load = name => vm.runInContext(fs.readFileSync(path.join(__dirname,'public/assets/js',name),'utf8'),context);
load('inventory-store.js');load('inventory.js');
const store = win.ARIAInventory;
const click = e => e.dispatch('click');
const fill = (input,value) => { assert(input); input.value = value; input.dispatch('input'); };
const all = selector => elements.categories.querySelectorAll(selector);
assert.equal(all('.inventory-category').length, 0);
click(elements['warning-button']); assert.equal(elements['warning-list'].hidden, true);
click(elements['add-category']);
assert.equal(all('.inventory-category').length, 1);
assert.equal(all('.inventory-row').length, 1, 'one empty row shown initially');
assert.equal(all('.category-title-input').length, 1, 'new category is in edit mode');
fill(all('.category-title-input')[0], 'Wound Care');
let prevented = false;
all('.category-title-input')[0].dispatch('keydown', {key: 'Enter', preventDefault() { prevented = true; }});
assert(prevented, 'Enter is handled in category name');
assert(all('.inventory-row')[0].querySelectorAll('INPUT')[0].focused, 'Enter advances to quantity');
let inputs = all('.inventory-row')[0].querySelectorAll('INPUT');
fill(inputs[0], '2 PCS');
inputs[0].dispatch('keydown', {key:'Enter',preventDefault(){}});
assert(inputs[1].focused, 'quantity Enter focuses supply');
fill(inputs[1], 'Bandages');
inputs[1].dispatch('keydown', {key:'Enter',preventDefault(){}});
assert(inputs[2].focused, 'supply Enter focuses date');
fill(inputs[2], '10');
inputs[2].dispatch('keydown', {key:'Enter',preventDefault(){}});
assert(inputs[3].focused, 'month Enter focuses day');
fill(inputs[3], '20');
inputs[3].dispatch('keydown', {key:'Enter',preventDefault(){}});
assert(inputs[4].focused, 'day Enter focuses two-digit year');
fill(inputs[4], '26');
inputs[4].dispatch('keydown', {key:'Enter',preventDefault(){}});
assert(all('.inventory-row')[1].querySelectorAll('INPUT')[0].focused, 'year Enter advances to next row');
assert.equal(all('.inventory-row').length, 2, 'filled first row adds one blank row');
assert.equal(all('.delete-row').length, 1, 'X on nonempty row only');
const emptyQuantity = all('.inventory-row')[1].querySelectorAll('INPUT')[0];
emptyQuantity.dispatch('keydown', {key:'Enter',preventDefault(){}});
assert.equal(all('.category-title-input').length, 0, 'empty Enter exits edit mode');
click(all('.edit-button')[0]);
// An unchanged populated field exits edit mode rather than skipping past it.
const unchangedName = all('.category-title-input')[0];
unchangedName.dispatch('keydown', {key:'Enter',preventDefault(){}});
assert.equal(all('.category-title-input').length, 0, 'unchanged category field Enter exits edit mode');
click(all('.edit-button')[0]);
assert.equal(store.read().categories[0].rows[0].expiry, '2026-10-20', 'short date stored unambiguously');
assert.equal(elements['warning-badges'].querySelectorAll('.expired').length, 1);
click(all('.edit-button')[0]);
assert.equal(all('.delete-row').length, 0, 'X hidden when editing off');
click(elements['warning-button']);
assert.equal(elements['warning-list'].hidden, false);
assert.equal(elements['warning-list'].querySelectorAll('.warning-entry').length, 1);
click(elements['warning-list'].querySelector('.warning-entry'));
assert.equal(elements['warning-list'].hidden, true);
assert(elements['inventory-scroll'].lastScroll, 'warning item scrolls to its row');
assert.equal(all('.row-flash').length, 1);
const persisted = store.read();
assert.equal(persisted.categories[0].name, 'Wound Care');
assert.equal(persisted.categories[0].rows.length, 2);
click(all('.edit-button')[0]);
click(all('.delete-row')[0]);
assert.equal(all('.delete-row').length, 0, 'X removes a row without confirmation');
click(all('.trash-button')[0]);
assert.equal(elements['delete-dialog'].open, true);
assert.match(elements['delete-question'].textContent, /Wound Care/);
click(elements['confirm-delete']);
assert.equal(all('.inventory-category').length, 0);
assert.equal(store.read().categories.length, 0);
console.log('Inventory interaction flow: PASS');
