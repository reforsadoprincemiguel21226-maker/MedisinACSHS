const refreshButton = document.getElementById("refresh-button");
const settingsButton = document.getElementById("settings-button");
const settingsOverlay = document.getElementById("settings-overlay");
const settingsClose = document.getElementById("settings-close");

refreshButton?.addEventListener("click", () => {
    window.location.reload();
});

function openSettings() {
    settingsOverlay.hidden = false;
    settingsOverlay.setAttribute("aria-hidden", "false");
    settingsClose?.focus();
}

function closeSettings() {
    settingsOverlay.hidden = true;
    settingsOverlay.setAttribute("aria-hidden", "true");
    settingsButton?.focus();
}

settingsButton?.addEventListener("click", openSettings);
settingsClose?.addEventListener("click", closeSettings);
document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && settingsOverlay && !settingsOverlay.hidden) closeSettings();
});


// Inventory warnings reflect only records entered in this kiosk browser.
(function updateInventoryBadge() {
    const badge = document.getElementById('inventory-home-badge');
    if (!badge || !window.ARIAInventory) return;
    function refresh() {
        const items = window.ARIAInventory.warnings(window.ARIAInventory.read());
        badge.hidden = items.length === 0;
        badge.textContent = ''; // The home notification is an unnumbered red dot.
        badge.setAttribute('aria-label', items.length + ' expiring or expired inventory entries');
    }
    refresh();
    window.addEventListener('pageshow', refresh);
    window.addEventListener('focus', refresh);
    window.addEventListener('storage', refresh);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
    window.setInterval(refresh, 60000);
})();
