// Profil, buyurtmalar ro'yxati va hali qurilmagan bo'limlar.
import { state } from '../state.js';
import { get, put, ApiError } from '../api.js';
import { t, setLang, getLang, formatSum } from '../i18n.js';
import { icon } from '../../ui/icons.js';
import { toast } from '../../ui/components.js';

export function renderSoon(el, titleKey, textKey) {
  el.innerHTML = `<main class="page stack"><h1 class="h2">${t(titleKey)}</h1>
    <div class="card"><div class="state"><div class="state-icon">${icon('clock')}</div><p class="small text-2">${t(textKey)}</p></div></div></main>`;
}

export async function renderOrders(el) {
  el.innerHTML = `<main class="page stack"><h1 class="h2">${t('orders_title')}</h1><div id="list" class="list" aria-busy="true"><div class="list-item"><div class="skeleton skeleton-text" style="width:70%"></div></div></div></main>`;
  const list = el.querySelector('#list');
  try {
    const { orders } = await get('/orders');
    list.removeAttribute('aria-busy');
    if (!orders.length) {
      list.outerHTML = `<div class="card"><div class="state"><div class="state-icon">${icon('receipt')}</div><p class="h3">${t('orders_empty')}</p></div></div>`;
      return;
    }
    list.innerHTML = '';
    for (const o of orders) {
      const row = document.createElement('a');
      row.className = 'list-item';
      row.href = `#/order/${o.id}`;
      row.innerHTML = `<span class="grow"><span class="h3"></span><span class="small text-2">${t(`status_${o.status}`)}</span></span><span class="price">${formatSum(o.total)}</span>${icon('chevron')}`;
      row.querySelector('.h3').textContent = `#${o.id} · ${o.restaurant_name}`;
      list.append(row);
    }
  } catch (err) {
    const box = Object.assign(document.createElement('div'), { className: 'alert alert-danger' });
    box.textContent = err instanceof ApiError && err.message ? err.message : t('offline');
    list.replaceWith(box);
  }
}

export function renderProfile(el, _p, _m, { go }) {
  const { user, roles } = state.me;
  const work = [
    roles.staff.length && ['panel', 'store'],
    roles.courier.length && ['courier', 'scooter'],
    roles.platformAdmin && ['admin', 'filter'],
  ].filter(Boolean);
  el.innerHTML = `
    <main class="page stack">
      <h1 class="h2">${t('profile_title')}</h1>
      <div class="list">
        <div class="list-item" style="cursor:default">${icon('user')}<span class="grow h3" id="name"></span></div>
        <button class="list-item" id="addresses">${icon('pin')}<span class="grow">${t('addresses_title')}</span>${icon('chevron')}</button>
        <button class="list-item" data-go="apply">${icon('store')}<span class="grow">${t('connect_restaurant')}</span>${icon('chevron')}</button>
      </div>
      <div class="field">
        <span class="label">${t('language')}</span>
        <div class="row" id="lang">
          <button class="chip" data-lang="uz" aria-pressed="${getLang() === 'uz'}">O‘zbekcha</button>
          <button class="chip" data-lang="ru" aria-pressed="${getLang() === 'ru'}">Русский</button>
        </div>
      </div>
      ${work.length ? `<p class="label">${t('work_sections')}</p><div class="list">${work.map(([k, ic]) => `<button class="list-item" data-go="${k}">${icon(ic)}<span class="grow">${t(k)}</span>${icon('chevron')}</button>`).join('')}</div>` : ''}
      <div class="list">
        <div class="list-item" style="cursor:default">${icon('info')}<span class="grow"><span class="h3">${t('help')}</span><br><span class="small text-2">${t('help_text')}</span></span></div>
        <div class="list-item" style="cursor:default">${icon('dish')}<span class="grow"><span class="h3">${t('about')}</span><br><span class="small text-2">${t('about_text')}</span></span></div>
      </div>
    </main>`;
  el.querySelector('#name').textContent = [user.first_name, user.last_name].filter(Boolean).join(' ');
  el.querySelector('#addresses').addEventListener('click', () => go('addresses'));
  el.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => go(b.dataset.go)));
  el.querySelector('#lang').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-lang]');
    if (!b || b.dataset.lang === getLang()) return;
    try {
      await put('/me/lang', { lang: b.dataset.lang });
      state.me.user.lang = b.dataset.lang;
      setLang(b.dataset.lang);
      document.querySelectorAll('[data-nav-label]').forEach((n) => { n.textContent = t(n.dataset.navLabel); });
      renderProfile(el, _p, _m, { go });
    } catch (err) {
      toast(err instanceof ApiError && err.message ? err.message : t('offline'), { type: 'error' });
    }
  });
}
