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
