// Restoran paneli: restoranlar ro'yxati, bosh ekran (bo'limlar + tayyorlik ro'yxati) va bo'limlar.
import { state } from '../state.js';
import { get, ApiError } from '../api.js';
import { t, formatSum, getLang } from '../i18n.js';
import { icon } from '../../ui/icons.js';
import { stateBlock } from './cards.js';
import { renderPanelOrders } from './panel-orders.js';
import { renderPanelMenu } from './panel-menu.js';
import { renderPanelCouriers, renderPanelStaff } from './panel-team.js';
import { renderPanelSettings, renderPanelReport } from './panel-settings.js';

const ITEMS = ['info', 'menu', 'work_hours', 'delivery', 'payment', 'couriers', 'group'];
const SECTIONS = [['orders', 'receipt'], ['menu', 'dish'], ['couriers', 'scooter'], ['staff', 'users'], ['settings', 'settings'], ['report', 'chart']];
const RENDER = {
  orders: renderPanelOrders, menu: renderPanelMenu, couriers: renderPanelCouriers,
  staff: renderPanelStaff, settings: renderPanelSettings, report: renderPanelReport,
};

// #/panel/:rid/:section — sarlavha, bo'limlar tablari va bo'lim mazmuni.
export async function renderPanelSection(el, params, m, { go }) {
  const rid = Number(m[1]);
  const section = m[2];
  const mine = state.me.roles.staff.find((s) => s.restaurantId === rid);
  const role = mine?.role || (state.me.roles.platformAdmin ? 'admin' : null);
  el.innerHTML = `
    <main class="page stack panel-section">
      <div class="row" style="justify-content:space-between"><a class="small" href="#/panel/${rid}">${icon('back', { className: 'icon-inline' })} <span class="rn"></span></a><span class="xs text-2">${role ? t(role === 'admin' ? 'admin' : `role_${role}_t`) : ''}</span></div>
      <div class="tabs" role="tablist">${SECTIONS.map(([k]) => `<a class="tab" role="tab" href="#/panel/${rid}/${k}" aria-selected="${k === section}">${t(`s_${k}`)}</a>`).join('')}</div>
      <div id="section" class="stack"></div>
    </main>`;
  el.querySelector('.rn').textContent = mine?.restaurantName || t('panel_title');
  return RENDER[section](el.querySelector('#section'), params, rid, { go, role });
}

export function renderPanelList(el, _p, _m, { go }) {
  const staff = state.me.roles.staff;
  // Restoranni faqat platforma admini qo'shadi (Admin → Yangi restoran) — bu yerda "ulash" tugmasi yo'q.
  el.innerHTML = `<main class="page stack"><h1 class="h2">${t('panel_title')}</h1><div class="list" id="list"></div></main>`;
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
  let r, report;
  try {
    r = await get(`/panel/restaurants/${rid}/readiness`);
    report = await get(`/panel/restaurants/${rid}/report`).then(x => x.report).catch(() => null);
  } catch (e) {
    el.innerHTML = '<main class="page"></main>';
    el.firstChild.append(stateBlock({ iconName: 'info', error: true, title: e instanceof ApiError && e.message ? e.message : t('offline') }));
    return;
  }
  const ru = getLang() === 'ru';
  const metric = (label, value) => `<div class="metric"><span class="metric-value">${value}</span><span class="xs text-2">${label}</span></div>`;
  const summary = report ? `<section class="card"><div class="card-body stack"><h2 class="h3">${t('rep_today')}</h2><div class="metrics">${metric(t('rep_orders'), report.today.orders)}${metric(t('rep_delivered'), report.today.delivered)}${metric(t('rep_revenue'), formatSum(report.today.revenue))}${metric(ru ? 'Выручка за блюда' : 'Taomlar tushumi', formatSum(report.today.food_revenue))}${metric(t('fin_delivery_fees'), formatSum(report.today.delivery_revenue))}${metric(ru ? 'Блюд в меню' : 'Menyudagi taomlar', report.counts.products)}${metric(ru ? 'Доступно блюд' : 'Sotuvdagi taomlar', report.counts.available)}${metric(ru ? 'Чистая прибыль' : 'Sof foyda', '—')}</div><p class="xs text-2">${ru ? 'Для расчёта прибыли нужны данные о расходах.' : 'Sof foydani hisoblash uchun xarajatlar ma’lumoti kerak.'}</p><a class="btn btn-secondary" href="#/panel/${rid}/report">${t('s_report')}</a></div></section>` : '';
  const done = r.items.filter((i) => i.done).length;
  el.innerHTML = `
    <main class="page stack">
      <div class="row" style="justify-content:space-between;align-items:flex-start">
        <div><h1 class="h2 n"></h1><p class="small text-2">${r.viewer_role === 'admin' ? t('admin') : t(`role_${r.viewer_role}_t`)}</p></div>
        <span class="badge ${r.restaurant.status === 'active' ? 'badge-success' : 'badge-danger'}">${t(`rs_${r.restaurant.status}`)}</span>
      </div>
      ${r.restaurant.status_reason && r.restaurant.status !== 'active' ? '<div class="alert alert-danger"><span class="reason"></span></div>' : ''}
      ${summary}
      <section class="stack">
        <nav class="section-grid">${SECTIONS.map(([k, ic]) => `<a class="section-tile" href="#/panel/${rid}/${k}">${icon(ic)}<span>${t(`s_${k}`)}</span></a>`).join('')}</nav>
        <div class="row" style="justify-content:space-between"><h2 class="h3">${t('readiness_title')}</h2><span class="small text-2">${done}/${r.items.length}</span></div>
        <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${r.items.length}" aria-valuenow="${done}"><span style="width:${(done / r.items.length) * 100}%"></span></div>
        <div class="alert ${r.ready ? 'alert-success' : 'alert-warning'}">${icon(r.ready ? 'check' : 'alert')}<span>${r.ready ? t('ready_all') : t('ready_missing', { n: r.missing.length })}</span></div>
        <ul class="list checklist">${ITEMS.map((k) => {
          const it = r.items.find((x) => x.key === k);
          return `<li class="list-item ${it.done ? 'is-done' : ''}"><span class="check-dot">${it.done ? icon('check', { className: 'icon-sm' }) : ''}</span><span class="grow">${t(`r_${k}`)}</span></li>`;
        }).join('')}</ul>
      </section>
    </main>`;
  el.querySelector('.n').textContent = r.restaurant.name;
  if (el.querySelector('.reason')) el.querySelector('.reason').textContent = t('status_reason', { r: r.restaurant.status_reason });
}
