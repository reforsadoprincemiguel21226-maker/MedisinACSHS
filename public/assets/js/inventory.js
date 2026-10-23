/* ARIA Inventory: presentation/editor of the operational ledger in inventory-store.js. */
(() => {
  'use strict';
  const Store = window.ARIAInventory;
  if (!Store) return;
  const state = Store.read();
  const editing = new Set();
  const categoryList = document.getElementById('categories');
  const scroller = document.getElementById('inventory-scroll');
  const warningButton = document.getElementById('warning-button');
  const warningList = document.getElementById('warning-list');
  const warningBadges = document.getElementById('warning-badges');
  const statusMessage = document.getElementById('save-status');
  const dialog = document.getElementById('delete-dialog');
  const question = document.getElementById('delete-question');
  let pendingDeleteId = null;

  function save() {
    statusMessage.hidden = Store.write(state);
    renderWarnings();
  }
  function ensureBlankRow(category) {
    if (!category.rows.length) {
      category.rows.push({ id: Store.createId(), quantity: '', supplies: '', expiry: '' });
    } else if (category.rows.at(-1).quantity && category.rows.at(-1).supplies) {
      category.rows.push({ id: Store.createId(), quantity: '', supplies: '', expiry: '' });
    }
  }
  function makeButton(label, className, imgPath) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.setAttribute('aria-label', label);
    button.title = label;
    const img = document.createElement('img');
    img.src = imgPath;
    img.alt = '';
    button.append(img);
    return button;
  }
  function displayExpiry(iso) {
    if (!iso) return '';
    const [year, month, day] = iso.split('-');
    return `${month}/${day}/${year.slice(-2)}`;
  }
  // EDIT GUIDE: MM, DD and YY are separate fields. Expiry is still stored as YYYY-MM-DD.
  function parseParts(month, day, yearShort) {
    if (!/^\d{1,2}$/.test(month) || !/^\d{1,2}$/.test(day) || !/^\d{2}$/.test(yearShort)) return '';
    const m = +month, d = +day, y = 2000 + +yearShort;
    const date = new Date(y, m - 1, d);
    if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return '';
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  // ENTER POLICY: if a field's value has not changed since focus, Enter exits Edit mode.
  // If it changed, Enter advances to the next field, or from YY to next row's quantity.
  function enterBehavior(input, category, nextFocus, validate = () => true) {
    let onFocusValue = input.value;
    input.addEventListener('focus', () => { onFocusValue = input.value; });
    input.addEventListener('keydown', event => {
      if (event.key !== 'Enter' || event.isComposing) return;
      event.preventDefault();
      if (!input.value.trim() || input.value === onFocusValue) { finishEdit(category.id); return; }
      if (!validate()) { input.reportValidity?.(); return; }
      nextFocus();
    });
  }
  function focusNextRow(category, row, item) {
    const next = row.nextElementSibling;
    if (next) { next.querySelector('.cell:first-child input')?.focus(); return; }
    if (item.quantity.trim() && item.supplies.trim()) {
      ensureBlankRow(category);
      const nextItem = category.rows.at(-1);
      if (nextItem !== item) {
        row.parentElement.append(makeRow(category, nextItem, true));
        row.nextElementSibling?.querySelector('.cell:first-child input')?.focus(); return;
      }
    }
    finishEdit(category.id);
  }
  function makeRow(category, item, editMode) {
    const row = document.createElement('div');
    row.className = 'inventory-row';
    row.dataset.categoryId = category.id;
    row.dataset.rowId = item.id;
    const isBlank = !item.quantity && !item.supplies && !item.expiry;
    const fields = [
      ['quantity', 'Quantity, for example 22 PCS', 'text', 40],
      ['supplies', 'Supply name', 'text', 120],
      ['expiry', 'Expiration date', 'text', 8]
    ];
    for (const [field, label, type, maxLength] of fields) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      if (editMode && field === 'expiry') {
        // EDIT GUIDE: three visible inputs, not a single MM/DD/YY text bar.
        const parts = item.expiry ? displayExpiry(item.expiry).split('/') : ['', '', ''];
        const wrapper = document.createElement('div'); wrapper.className = 'date-parts';
        const inputs = [];
        ['MM', 'DD', 'YY'].forEach((part, index) => {
          if (index) { const slash = document.createElement('span'); slash.className = 'date-separator'; slash.textContent = '/'; wrapper.append(slash); }
          const input = document.createElement('input');
          input.type = 'text'; input.inputMode = 'numeric'; input.maxLength = 2;
          input.placeholder = part; input.value = parts[index];
          input.className = 'date-' + part.toLowerCase() + (part === 'YY' ? ' date-year' : '');
          input.setAttribute('aria-label', part === 'MM' ? 'Expiration month' : part === 'DD' ? 'Expiration day' : 'Expiration year, two digits');
          input.addEventListener('input', () => {
            const parsed = parseParts(...inputs.map(el => el.value));
            if (parsed || inputs.every(el => !el.value.trim())) item.expiry = parsed;
            // A partial date is allowed while moving between components.
            save(); updateDeleteButton();
          });
          inputs.push(input); wrapper.append(input);
        });
        inputs.forEach((input, index) => enterBehavior(input, category, () => {
          if (index < 2) inputs[index + 1].focus();
          else { const parsed = parseParts(...inputs.map(el => el.value));
            if (parsed) { item.expiry = parsed; save(); focusNextRow(category, row, item); }
            else { input.setCustomValidity?.('Enter a valid MM/DD/YY date'); input.reportValidity?.(); }
          }
        }));
        cell.append(wrapper);
      } else if (editMode) {
        const input = document.createElement('input');
        input.type = type; input.value = item[field];
        input.setAttribute('aria-label', label); input.maxLength = maxLength;
        input.placeholder = field === 'quantity' ? 'e.g. 2 PCS' : 'Item name';
        input.addEventListener('input', () => {
          item[field] = input.value;
          updateDeleteButton();
          if (category.rows.at(-1) === item && item.quantity.trim() && item.supplies.trim()) {
            ensureBlankRow(category);
            row.parentElement.append(makeRow(category, category.rows.at(-1), true));
          }
          save();
        });
        enterBehavior(input, category, () => {
          if (field === 'quantity') row.querySelector('.cell:nth-child(2) input')?.focus();
          else row.querySelector('.date-mm')?.focus();
        });
        cell.append(input);
      } else if (field === 'expiry' && item.expiry) {
        const text = document.createElement('span'); text.className = 'expiry-tag';
        const level = Store.expiryStatus(item.expiry);
        if (level) text.classList.add(level);
        text.textContent = displayExpiry(item.expiry); cell.append(text);
      } else { cell.textContent = item[field]; }
      row.append(cell);
    }
    function updateDeleteButton() {
      row.querySelector('.delete-row')?.remove();
      row.querySelectorAll('.has-remove').forEach(cell => cell.classList.remove('has-remove'));
      if (!editMode || (!item.quantity && !item.supplies && !item.expiry)) return;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'delete-row';
      remove.textContent = '×';
      remove.title = 'Delete this row';
      remove.setAttribute('aria-label', `Delete row ${item.supplies || 'unnamed supply'}`);
      remove.addEventListener('click', () => {
        category.rows = category.rows.filter(entry => entry.id !== item.id);
        ensureBlankRow(category);
        save();
        renderCategories();
      });
      const cell = row.lastElementChild;
      cell.classList.add('has-remove');
      cell.append(remove);
    }
    updateDeleteButton();
    if (isBlank) row.classList.add('blank-row');
    return row;
  }
  function finishEdit(id) {
    editing.delete(id);
    save();
    renderCategories();
  }
  function renderCategories() {
    categoryList.replaceChildren();
    for (const category of state.categories) {
      ensureBlankRow(category);
      const editMode = editing.has(category.id);
      const section = document.createElement('section');
      section.className = 'inventory-category';
      section.dataset.categoryId = category.id;
      const heading = document.createElement('div');
      heading.className = 'category-heading';
      const titleSlot = document.createElement('div');
      titleSlot.style.gridColumn = '2';
      if (editMode) {
        const input = document.createElement('input');
        input.className = 'category-title-input';
        input.value = category.name;
        input.placeholder = 'Category name';
        input.maxLength = 90;
        input.setAttribute('aria-label', 'Category name');
        input.addEventListener('input', () => { category.name = input.value; save(); });
        enterBehavior(input, category, () => section.querySelector('.inventory-row .cell:first-child input')?.focus());
        titleSlot.append(input);
      } else {
        const title = document.createElement('h2');
        title.textContent = category.name || 'NEW CATEGORY';
        if (!category.name) title.classList.add('is-placeholder');
        titleSlot.append(title);
      }
      heading.append(titleSlot);
      const actions = document.createElement('div');
      actions.className = 'category-actions';
      if (editMode) {
        const trash = makeButton('Delete category', 'trash-button', 'assets/images/inventory-trash.png?v=5');
        trash.addEventListener('click', () => showDelete(category));
        actions.append(trash);
      }
      const edit = makeButton(editMode ? 'Finish editing category' : 'Edit category', 'edit-button', 'assets/images/inventory-edit.png');
      edit.setAttribute('aria-pressed', editMode ? 'true' : 'false');
      edit.addEventListener('click', () => {
        if (editMode) editing.delete(category.id); else editing.add(category.id);
        save(); renderCategories();
        const updated = categoryList.querySelector(`[data-category-id="${CSS.escape(category.id)}"]`);
        if (!editMode) updated?.querySelector('.category-title-input')?.focus();
      });
      actions.append(edit); heading.append(actions); section.append(heading);
      const columns = document.createElement('div');
      columns.className = 'category-grid';
      for (const headingText of ['QUANTITY', 'SUPPLIES', 'EXPIRATION DATE']) {
        const label = document.createElement('div'); label.className = 'table-header'; label.textContent = headingText; columns.append(label);
      }
      section.append(columns);
      const rows = document.createElement('div'); rows.className = 'category-rows';
      for (const item of category.rows) rows.append(makeRow(category, item, editMode));
      section.append(rows);
      categoryList.append(section);
    }
  }
  function renderWarnings() {
    warningBadges.replaceChildren();
    const items = Store.warnings(state);
    const expiring = items.filter(item => item.status === 'expiring').length;
    const expired = items.filter(item => item.status === 'expired').length;
    for (const [kind, count] of [['expiring', expiring], ['expired', expired]]) {
      if (!count) continue;
      const badge = document.createElement('span');
      badge.className = 'count-badge ' + kind;
      badge.textContent = String(count);
      warningBadges.append(badge);
    }
    warningButton.setAttribute('aria-label', `${expired} expired and ${expiring} expiring supplies`);
    if (!items.length) { closeWarnings(); return; }
    if (!warningList.hidden) populateWarnings(items);
  }
  function populateWarnings(items) {
    warningList.replaceChildren();
    const title = document.createElement('h2');
    title.textContent = 'Expiry warnings';
    warningList.append(title);
    for (const item of items) {
      const button = document.createElement('button'); button.type = 'button';
      button.className = 'warning-entry ' + item.status;
      const strong = document.createElement('strong'); strong.textContent = item.name;
      const detail = document.createElement('span');
      detail.textContent = `${item.status === 'expired' ? 'Expired' : 'Expiring soon'} · ${displayExpiry(item.expiry)} · ${item.categoryName || 'Unnamed category'}`;
      button.append(strong, detail);
      button.addEventListener('click', () => {
        closeWarnings();
        const target = Array.from(categoryList.querySelectorAll('.inventory-row'))
          .find(row => row.dataset.categoryId === item.categoryId && row.dataset.rowId === item.rowId);
        if (!target) return;
        const location = target.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 9;
        scroller.scrollTo({ top: location, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
        target.classList.remove('row-flash'); void target.offsetWidth;
        target.classList.add('row-flash');
      });
      warningList.append(button);
    }
  }
  function closeWarnings() {
    warningList.hidden = true;
    warningButton.setAttribute('aria-expanded', 'false');
  }
  warningButton.addEventListener('click', () => {
    const items = Store.warnings(state);
    if (!items.length) {
      warningButton.classList.remove('wiggle'); void warningButton.offsetWidth;
      warningButton.classList.add('wiggle');
      return;
    }
    const opening = warningList.hidden;
    if (opening) populateWarnings(items);
    warningList.hidden = !opening;
    warningButton.setAttribute('aria-expanded', String(opening));
  });
  document.addEventListener('click', (event) => {
    if (!event.target.closest('.warning-wrap')) closeWarnings();
  });
  document.getElementById('add-category').addEventListener('click', () => {
    const category = { id: Store.createId(), name: '', rows: [{ id: Store.createId(), quantity: '', supplies: '', expiry: '' }] };
    state.categories.push(category);
    editing.add(category.id);
    save(); renderCategories();
    const newNameInput = Array.from(categoryList.children).find(el => el.dataset.categoryId === category.id)?.querySelector('.category-title-input');
    newNameInput?.focus();
    const section = Array.from(categoryList.children).find(el => el.dataset.categoryId === category.id);
    if (section) {
      const offset = section.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 10;
      scroller.scrollTo({ top: offset, behavior: 'smooth' });
    }
  });
  function showDelete(category) {
    pendingDeleteId = category.id;
    question.textContent = `Are you sure you want to delete ${category.name || 'this unnamed category'}?`;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else if (window.confirm(question.textContent)) performDelete();
  }
  function performDelete() {
    if (!pendingDeleteId) return;
    state.categories = state.categories.filter(category => category.id !== pendingDeleteId);
    editing.delete(pendingDeleteId);
    pendingDeleteId = null;
    save(); renderCategories();
    if (dialog.open) dialog.close();
  }
  document.getElementById('confirm-delete').addEventListener('click', performDelete);
  document.getElementById('cancel-delete').addEventListener('click', () => { pendingDeleteId = null; dialog.close(); });
  dialog.addEventListener('cancel', () => { pendingDeleteId = null; });
  document.getElementById('inventory-refresh').addEventListener('click', () => window.location.reload());
  // Date status changes at midnight without requiring any edits.
  const expiryRefresh = () => {
    renderWarnings();
    if (!editing.size) renderCategories();
  };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) expiryRefresh(); });
  window.addEventListener('focus', expiryRefresh);
  window.setInterval(expiryRefresh, 60000);
  renderCategories(); renderWarnings();
})();
