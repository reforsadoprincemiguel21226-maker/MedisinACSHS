/* Lightweight kiosk touch feedback; no dependency on framework or backend. */
(() => {
  'use strict';
  const animationMs = 150;
  document.addEventListener('click', (event) => {
    const control = event.target.closest('button, a[href], [role="button"]');
    if (!control || event.defaultPrevented || control.disabled || event.button !== 0) return;
    control.classList.remove('aria-pressed');
    void control.offsetWidth;
    control.classList.add('aria-pressed');
    setTimeout(() => control.classList.remove('aria-pressed'), 210);
    if (control.tagName !== 'A' || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || control.hasAttribute('download') || control.target && control.target !== '_self') return;
    const destination = new URL(control.href, location.href);
    if (destination.origin !== location.origin || destination.pathname === location.pathname && destination.search === location.search && destination.hash) return;
    event.preventDefault();
    setTimeout(() => { location.href = destination.href; }, animationMs);
  }, true);
})();
