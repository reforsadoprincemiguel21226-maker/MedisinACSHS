/* ARIA kiosk inventory UI — one persisted browser-side record for all UI pages.
 * This is an operational ledger, not the approved medical guidance catalog in data/kit.js.
 * Move storage behind a shared validated API before claiming chatbot-stock synchronization.
 */
(function (root) {
  'use strict';
  const KEY = 'aria.inventory.v1';
  const EXPIRING_DAYS = 30;
  const validDate = /^\d{4}-\d{2}-\d{2}$/;

  function cleanString(value, length = 120) {
    return typeof value === 'string' ? value.trim().slice(0, length) : '';
  }
  function cleanRow(row) {
    if (!row || typeof row !== 'object') return null;
    return {
      id: cleanString(row.id, 80) || createId(),
      quantity: cleanString(row.quantity, 40),
      supplies: cleanString(row.supplies, 120),
      expiry: validDate.test(row.expiry || '') && !Number.isNaN(new Date(row.expiry + 'T12:00:00').getTime()) ? row.expiry : ''
    };
  }
  function cleanCategory(category) {
    if (!category || typeof category !== 'object') return null;
    return {
      id: cleanString(category.id, 80) || createId(),
      name: cleanString(category.name, 90),
      rows: (Array.isArray(category.rows) ? category.rows : []).slice(0, 300).map(cleanRow).filter(Boolean)
    };
  }
  function sanitize(data) {
    return { version: 1, categories: (Array.isArray(data?.categories) ? data.categories : [])
      .slice(0, 60).map(cleanCategory).filter(Boolean) };
  }
  function read() {
    try {
      const raw = root.localStorage.getItem(KEY);
      return sanitize(raw ? JSON.parse(raw) : {});
    } catch { return sanitize({}); }
  }
  function write(data) {
    try {
      root.localStorage.setItem(KEY, JSON.stringify(sanitize(data)));
      return true;
    } catch { return false; }
  }
  function createId() {
    return typeof root.crypto?.randomUUID === 'function'
      ? root.crypto.randomUUID() : 'item-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  }
  function localDayNumber(iso) {
    if (!validDate.test(iso || '')) return NaN;
    const [year, month, day] = iso.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return NaN;
    return Date.UTC(year, month - 1, day) / 86400000;
  }
  function expiryStatus(iso, now = new Date()) {
    const itemDay = localDayNumber(iso);
    if (!Number.isFinite(itemDay)) return '';
    const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000;
    const days = itemDay - today;
    return days < 0 ? 'expired' : days <= EXPIRING_DAYS ? 'expiring' : '';
  }
  function warnings(data, now = new Date()) {
    const items = [];
    for (const category of sanitize(data).categories) {
      for (const row of category.rows) {
        if (!row.supplies || !row.quantity) continue;
        const status = expiryStatus(row.expiry, now);
        if (status) items.push({ categoryId: category.id, categoryName: category.name, rowId: row.id,
          name: row.supplies, quantity: row.quantity, expiry: row.expiry, status });
      }
    }
    items.sort((a, b) => (a.status === b.status ? a.expiry.localeCompare(b.expiry) : a.status === 'expired' ? -1 : 1));
    return items;
  }
  root.ARIAInventory = { KEY, EXPIRING_DAYS, read, write, sanitize, warnings, expiryStatus, createId };
})(window);
