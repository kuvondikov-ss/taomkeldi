// Restoran paneli (10-bosqich): restoranlar ro'yxati va egasining birinchi ekrani — tayyorlik ro'yxati.
// Buyurtmalar, menyu, kuryerlar, xodimlar, sozlamalar — 11-bosqich.
import { state } from '../state.js';
import { get, ApiError } from '../api.js';
import { t } from '../i18n.js';
import { icon } from '../../ui/icons.js';
import { stateBlock } from './cards.js';

const ITEMS = ['info', 'menu', 'work_hours', 'delivery', 'payment', 'couriers', 'group'];

export function renderPanelList(el, _p, _m, { go }) {
  const staff = state.me.roles.staff;
  el.innerHTML = `<main class="page stack"><h1 class="h2">${t('panel_title')}</h1><div class="list" id="list"></div>
    <button class="btn btn-secondary" id="apply">${icon('plus', { className: 'icon-sm' })}${t('connect_restaurant')}</button></main>`;
  el.querySelector('#apply').addEventListener('click', () => go('apply'));
  const list = el.querySelector('#list');
  if (!staff.length) {
    list.replaceWith(stateBlock({ iconName: 'store', title: t('no_restaurants_panel') }));
    return;
  }
  if (staff.length === 1) return go(`panel/${staff[0].restaurantId}`, { replace: true });
  for (const s of staff) {
    const b = Object.assign(document.createElement('button'), { className: 'list-item', type: 'button' });
    b.innerHTML = `${icon('store')}<span class="grow"><span class="h3 n"></span><span class="small text-2">${t(`role_${s.role}_t`)} · ${t(`rs_${s.restaurantStatus}`)}</span></span>${icon('chevron')}`;
    b.querySelector('.n').textContent = s.restaurantName;
    b.addEventListener('click', () => go(`panel/${s.restaurantId}`));
    list.append(b);
  }
}

export async function renderPanel(el, _p, m) {
  const rid = Number(m[1]);
  el.innerHTML = '<main class="page stack"><div class="skeleton skeleton-title"></div></main>';
  let r;
  try {
    r = await get(`/panel/restaurants/${rid}/readiness`);
  } catch (e) {
    el.innerHTML = '<main class="page"></main>';
    el.firstChild.append(stateBlock({ iconName: 'info', error: true, title: e instanceof ApiError && e.message ? e.message : t('offline') }));
    return;
  }
  const done = r.items.filter((i) => i.done).length;
  el.innerHTML = `
    <main class="page stack">
      <div class="row" style="justify-content:space-between;align-items:flex-start">
        <div><h1 class="h2 n"></h1><p class="small text-2">${r.viewer_role === 'admin' ? t('admin') : t(`role_${r.viewer_role}_t`)}</p></div>
        <span class="badge ${r.restaurant.status === 'active' ? 'badge-success' : 'badge-danger'}">${t(`rs_${r.restaurant.status}`)}</span>
      </div>
      ${r.restaurant.status_reason && r.restaurant.status !== 'active' ? '<div class="alert alert-danger"><span class="reason"></span></div>' : ''}
      <section class="stack">
        <div class="row" style="justify-content:space-between"><h2 class="h3">${t('readiness_title')}</h2><span class="small text-2">${done}/${r.items.length}</span></div>
        <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${r.items.length}" aria-valuenow="${done}"><span style="width:${(done / r.items.length) * 100}%"></span></div>
        <div class="alert ${r.ready ? 'alert-success' : 'alert-warning'}">${icon(r.ready ? 'check' : 'alert')}<span>${r.ready ? t('ready_all') : t('ready_missing', { n: r.missing.length })}</span></div>
        <ul class="list checklist">${ITEMS.map((k) => {
          const it = r.items.find((x) => x.key === k);
          return `<li class="list-item ${it.done ? 'is-done' : ''}"><span class="check-dot">${it.done ? icon('check', { className: 'icon-sm' }) : ''}</span><span class="grow">${t(`r_${k}`)}</span></li>`;
        }).join('')}</ul>
      </section>
      <div class="alert">${icon('info')}<span>${t('panel_sections_soon')}</span></div>
    </main>`;
  el.querySelector('.n').textContent = r.restaurant.name;
  if (el.querySelector('.reason')) el.querySelector('.reason').textContent = t('status_reason', { r: r.restaurant.status_reason });
}
