// Komponentlar uchun kichik yordamchilar: toast, sheet, dialog, yuklanish holati, tablar, chiplar.
import { icon } from './icons.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// --- Toast ---
let region;
export function toast(message, { type = 'info', timeout = 3000 } = {}) {
  if (!region) {
    region = document.createElement('div');
    region.className = 'toast-region';
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', 'polite');
    document.body.append(region);
  }
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  const ic = type === 'success' ? 'check' : type === 'error' ? 'alert' : 'info';
  el.innerHTML = `${icon(ic, { className: 'icon-sm' })}<span>${esc(message)}</span>`;
  region.append(el);
  setTimeout(() => el.remove(), timeout);
  return el;
}

// --- Bottom sheet ---
export function openSheet(sheet) {
  const backdrop = document.createElement('div');
  backdrop.className = 'backdrop';
  document.body.append(backdrop);
  const prevFocus = document.activeElement;
  sheet.hidden = false;
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  requestAnimationFrame(() => {
    backdrop.classList.add('is-open');
    sheet.classList.add('is-open');
    (sheet.querySelector('[autofocus], button, [href], input') || sheet).focus({ preventScroll: true });
  });
  function close() {
    sheet.classList.remove('is-open');
    backdrop.classList.remove('is-open');
    document.removeEventListener('keydown', onKey);
    const done = () => { sheet.hidden = true; backdrop.remove(); prevFocus?.focus?.(); };
    const ms = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dur')) || 0;
    setTimeout(done, ms);
  }
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  backdrop.addEventListener('click', close);
  sheet.querySelectorAll('[data-sheet-close]').forEach((b) => b.addEventListener('click', close, { once: true }));
  return { close };
}

// --- Tasdiqlash dialogi (native <dialog>) ---
export function confirmDialog({ title, text = '', confirm = 'Tasdiqlash', cancel = 'Bekor qilish', danger = false }) {
  return new Promise((resolve) => {
    const d = document.createElement('dialog');
    d.className = 'dialog';
    d.innerHTML = `
      <h2 class="h2">${esc(title)}</h2>
      ${text ? `<p class="text-2">${esc(text)}</p>` : ''}
      <div class="dialog-actions">
        <button class="btn btn-secondary" value="cancel">${esc(cancel)}</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" value="ok">${esc(confirm)}</button>
      </div>`;
    document.body.append(d);
    d.addEventListener('click', (e) => {
      const v = e.target.closest('button')?.value;
      if (v) d.close(v);
    });
    d.addEventListener('close', () => { resolve(d.returnValue === 'ok'); d.remove(); });
    d.showModal();
  });
}

// --- Tugma yuklanish holati ---
export function setLoading(button, loading) {
  button.classList.toggle('is-loading', loading);
  button.setAttribute('aria-busy', String(loading));
  button.disabled = loading;
}

// --- Tablar: bosish va klaviatura (chap/o'ng) ---
export function initTabs(tablist, onChange) {
  const tabs = [...tablist.querySelectorAll('[role="tab"]')];
  const select = (tab) => {
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
    });
    tab.scrollIntoView({ inline: 'nearest', block: 'nearest' });
    onChange?.(tab);
  };
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => select(t));
    t.addEventListener('keydown', (e) => {
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!d) return;
      const next = tabs[(i + d + tabs.length) % tabs.length];
      next.focus();
      select(next);
    });
  });
}

// --- Chiplar: aria-pressed almashuvi; single=true bo'lsa bittasi tanlanadi ---
export function initChips(row, { single = false, onChange } = {}) {
  row.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip || chip.disabled) return;
    const on = chip.getAttribute('aria-pressed') !== 'true';
    if (single) row.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', 'false'));
    chip.setAttribute('aria-pressed', String(on));
    onChange?.(chip, on);
  });
}

// --- Narx formati: 35000 → "35 000 so'm" ---
export function formatSum(n, lang = 'uz') {
  const s = Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return lang === 'ru' ? `${s} сум` : `${s} so‘m`;
}
