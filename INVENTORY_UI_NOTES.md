# ARIA Inventory — UI v1 handoff

This UI replaces the third home menu destination (formerly Medalendar) by explicit project request. The old `public/plan-schedule.html` is now a redirect for bookmarks; the rest of the kiosk is unchanged.

## Files to edit

- `public/inventory.html` — accessible inventory page and confirmation dialog.
- `public/css/inventory.css` — layout, header, rows, indicators, touchscreen styles.
- `public/assets/js/inventory.js` — category editor, row management, warning menu, delete actions.
- `public/assets/js/inventory-store.js` — **single source for UI persistence and expiration rules**.
- `public/home.html`, `public/assets/js/home.js`, `public/css/home.css` — third menu link and warning badge.
- `public/assets/images/inventory-{add,edit,trash,warning}.png` — icons supplied by the user, background removed for add/edit/trash.

## Behavior

- Starts with **no categories** when the browser has no saved inventory. "Add Supplies" creates an unnamed category with **five blank rows**.
- Click pencil to edit category name and rows; the trash icon appears beside it. Trash asks "Are you sure you want to delete [name]?"; the red X deletes a nonempty row immediately. The blank row has no X.
- Row fields: quantity (free text, e.g. `22 PCS`), supply name, expiration date (optional). When the last row has both quantity and supply name, a new blank bottom row appears. No item or category is prepopulated from the example screenshots.
- Warnings count **records**, not individual units. An expired item is one with a date before the current local calendar day. "Expiring soon" is today through the next **30 calendar days**. Blank dates and entries missing item name or quantity are not counted. If both kinds exist, the warning button shows separate red and yellow counts; the home icon shows a **red** badge with the total flagged records.
- Tapping the warning button with no flagged records plays a small press animation. Otherwise, the dropdown lists expired first, then expiring; selecting an item scrolls its row into view and highlights it.
- Data is saved in `localStorage` under `aria.inventory.v1` for the current browser/origin. Refresh and returning from home preserve edits. Browser data clearing, private browsing, or changing the origin/hostname can reset access to saved records. No cloud synchronization, account sharing, backup/export, authorization, or server persistence is implemented in this UI phase.

## Important integration boundary

**The editable UI ledger is not yet connected to the chatbot's medically approved physical-kit reference (`data/kit.js`).** No frontend row changes currently cause the assistant to claim that a particular item exists or is safe to recommend. This intentionally avoids letting arbitrary names entered into a browser override the approved medical catalog. Before live deployment or research claims of an integrated inventory, Area 4 / Area 1 should define one validated server-backed source of truth, update the chat API/mapping, and decide rules for expired/out-of-stock items and use descriptions. Without that, the current chatbot can still describe its existing approved catalog independently of this editable ledger.

## Verification

- `node test-inventory-ui.js` checks persistence schema, date boundaries, record counts, home link, control names and uploaded assets.
- `node test-inventory-interactions.js` exercises add/edit/auto-row/warning/scroll/row deletion/category confirmation with a small DOM event harness. This is *not* a substitute for a real rendered browser test.
- `node test-ui-maintenance.js` checks precache file paths and single public UI source.
- `npm run test:all` runs existing regression tests; live Ollama verification may be skipped when unavailable.
- Manual Chromium kiosk verification is still required, including 800 × 480 layout, touch targets, editing, date picker, dropdown scrolling, persistence and deletion. Automated headless browser navigation was blocked by environment policy during this build, not counted as a pass.

### v2 interface adjustments
- One blank row per new category; adding a category enters Edit mode immediately.
- Expiry dates display/edit as MM/DD/YY and are persisted as YYYY-MM-DD for calculations. Two-digit years map to 2000–2099.
- Home notification is an unnumbered red dot positioned above the circular menu icon.
- Warning asset has a transparent outside and trash asset's white cutouts are transparent.

### v3 interaction and image refinements
- Initial category contains **one blank row**, begins in Edit mode, and automatically adds a new bottom row once the last row has quantity and a supply name.
- Expiry input is **MM/DD/YY** (2000–2099), stored internally as full ISO `YYYY-MM-DD` so expiry comparisons remain reliable. Invalid entered dates do not become warning records.
- The category-name Enter key advances to the first quantity cell. Enter in a quantity cell advances to supplies; supplies advances to expiry; expiry advances to next-row quantity. Enter on an empty field exits category Edit mode. Tab remains supported.
- Warning icon artwork has a transparent external background while retaining the white circular symbol; trash artwork's white background/cutouts are transparent.
- The home warning badge is a red **unnumbered** dot above the inventory circle, and is shown when at least one expiry warning exists.
- `public/css/press-feedback.css` + `public/assets/js/press-feedback.js` add a lightening/press response to buttons and links across kiosk pages. Same-origin page links briefly animate before navigation; in-page buttons animate on click without delaying their actual operations. Respect reduced-motion settings.
- Service worker shell cache version bumped to v14 to prevent old cached button styling.

## Inventory UI v3 adjustments (October 2026)
- `public/css/inventory.css`: search `USER TUNING` for warning badge offsets and the MM/DD/YY field sizing.
- `public/css/home.css`: search `USER TUNING — HOME INVENTORY RED DOT` and adjust `--badge-right` and `--badge-bottom` for the plain red inventory warning dot. It now belongs to the lower-right rim, not upper-right.
- `public/assets/images/inventory-warning.png`: transparent interior with white ring and pale teal exclamation.
- `public/assets/images/inventory-trash.png`: transparency is based on the red glyph; white negative-space strokes are transparent.
- `public/assets/js/inventory.js`: search `EDIT GUIDE` and `ENTER POLICY`. Three separate text fields MM/DD/YY continue storing YYYY-MM-DD. Enter on an unchanged or empty field exits category Edit mode; Enter after a changed field advances to next date part/row.
- The browser-local inventory storage remains distinct from the chatbot's approved physical kit catalog.
