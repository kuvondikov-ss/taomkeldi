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
      // Tarix: raqam, restoran, sana, jami, holat (faol — ajratilgan), baho; tafsilot — bosilganda.
      const active = !['delivered', 'cancelled'].includes(o.status);
      const tone = o.status === 'cancelled' ? 'badge-danger' : o.status === 'delivered' ? 'badge-success' : 'badge-warning';
      const when = new Date(o.created_at).toLocaleString([], { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
      row.innerHTML = `<span class="grow stack" style="gap:2px"><span class="h3"></span>
          <span class="xs text-2">${when}${o.items_count ? ` · ${t('items_n', { n: o.items_count })}` : ''}${o.rating ? ` · ★ ${o.rating}` : ''}</span>
          <span><span class="badge ${tone}">${t(`status_${o.status}`)}</span>${active ? ` <span class="xs text-2">${t('tap_to_track')}</span>` : ''}</span></span>
        <span class="price">${formatSum(o.total)}</span>${icon('chevron')}`;
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
        <button class="list-item" id="contact">${icon('phone')}<span class="grow"><span>${t('contact_title')}</span><br><span class="small text-2" id="contact-val"></span></span>${icon('edit')}</button>
        <button class="list-item" id="addresses">${icon('pin')}<span class="grow">${t('addresses_title')}</span>${icon('chevron')}</button>
        <button class="list-item" data-go="favorites">${icon('heart')}<span class="grow">${t('favorites')}</span>${icon('chevron')}</button>
        <button class="list-item" data-go="orders">${icon('receipt')}<span class="grow">${t('orders_title')}</span>${icon('chevron')}</button>
      </div>
      <form class="card" id="contact-form" hidden><div class="card-body stack">
        <div class="field"><label class="label" for="c-name">${t('contact_name')}</label><input class="input" id="c-name" maxlength="60" autocomplete="name"></div>
        <div class="field"><label class="label" for="c-phone">${t('contact_phone')}</label><input class="input" id="c-phone" inputmode="tel" autocomplete="tel" placeholder="+998 90 123 45 67"></div>
        <div class="row" style="gap:var(--sp-2)"><button class="btn btn-primary grow" type="submit">${t('save')}</button><button class="btn btn-ghost" type="button" id="c-cancel">${t('cancel')}</button></div>
      </div></form>
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
  // Qabul qiluvchi ismi va telefoni (checkout'da ham shu ishlatiladi).
  const contactVal = el.querySelector('#contact-val');
  const showContact = () => { contactVal.textContent = user.contact_name || user.phone ? [user.contact_name, user.phone].filter(Boolean).join(' · ') : t('contact_empty'); };
  showContact();
  const form = el.querySelector('#contact-form');
  el.querySelector('#contact').addEventListener('click', () => {
    form.hidden = !form.hidden;
    form.querySelector('#c-name').value = user.contact_name || [user.first_name, user.last_name].filter(Boolean).join(' ');
    form.querySelector('#c-phone').value = user.phone || '';
  });
  form.querySelector('#c-cancel').addEventListener('click', () => { form.hidden = true; });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const { contact } = await put('/me/contact', { name: form.querySelector('#c-name').value.trim(), phone: form.querySelector('#c-phone').value.trim() });
      user.contact_name = contact.name;
      user.phone = contact.phone;
      showContact();
      form.hidden = true;
      toast(t('saved_ok'), { type: 'success' });
    } catch (err) {
      const field = err instanceof ApiError ? err.details?.field : null;
      toast(field === 'phone' ? t('contact_phone_bad') : field === 'name' ? t('contact_name_bad') : err instanceof ApiError && err.message ? err.message : t('offline'), { type: 'error' });
    }
  });
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
