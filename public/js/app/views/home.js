// Bosh sahifa (5-bosqich asosi): yetkazish manzili va shu manzilga yetkazadigan restoranlar.
// To'liq bosh sahifa (qidiruv, banner, oshxona turlari, saralash) — 6-bosqich.
import { currentAddress } from '../state.js';
import { get, ApiError } from '../api.js';
import { t, formatSum } from '../i18n.js';
import { icon } from '../../ui/icons.js';

export async function renderHome(el, _p, _m, { go }) {
  const addr = currentAddress();
  el.innerHTML = `
    <main class="page stack">
      <header class="app-header">
        <img class="logo logo-light" src="/brand/taomkeldi-compact-light.svg" alt="Taomkeldi">
        <img class="logo logo-dark" src="/brand/taomkeldi-compact-dark.svg" alt="Taomkeldi">
      </header>
      <button class="address-bar" id="addr" type="button">
        ${icon('pin')}
        <span class="grow"><span class="xs text-2">${t('deliver_to')}</span><span class="address-bar-text"></span></span>
        ${icon('chevron')}
      </button>
      <h2 class="h2">${t('restaurants_title')}</h2>
      <div id="list" class="stack" aria-busy="true">
        ${'<div class="card"><div class="skeleton skeleton-media" style="aspect-ratio:16/7"></div><div class="card-body"><div class="skeleton skeleton-title"></div><div class="skeleton skeleton-text"></div></div></div>'.repeat(2)}
      </div>
    </main>`;
  el.querySelector('.address-bar-text').textContent = addr.label ? `${addr.label} · ${addr.text}` : addr.text;
  el.querySelector('#addr').addEventListener('click', () => go('addresses'));

  const list = el.querySelector('#list');
  try {
    const { restaurants } = await get(`/restaurants?address_id=${addr.id}`);
    list.removeAttribute('aria-busy');
    if (!restaurants.length) {
      list.innerHTML = `<div class="card"><div class="state"><div class="state-icon">${icon('store')}</div><p class="h3">${t('no_restaurants')}</p><p class="small text-2">${t('no_restaurants_hint')}</p><button class="btn btn-secondary" id="change">${t('change_address')}</button></div></div>`;
      list.querySelector('#change').addEventListener('click', () => go('addresses'));
      return;
    }
    list.innerHTML = '';
    for (const r of restaurants) {
      const card = document.createElement('article');
      card.className = `card${r.is_open ? '' : ' is-closed'}`;
      card.innerHTML = `
        <img class="card-media wide" alt="" src="${r.cover_path || '/brand/placeholder.svg'}">
        <div class="card-body">
          <div class="row" style="justify-content:space-between;align-items:flex-start">
            <span class="h3 title-2l name"></span>
            <span class="badge ${r.is_open ? 'badge-success' : 'badge-danger'}">${t(r.is_open ? 'open' : 'closed')}</span>
          </div>
          <span class="small text-2">${t('distance', { km: (r.delivery.distance_m / 1000).toFixed(1) })} · ${t('delivery_fee', { sum: formatSum(r.delivery.delivery_fee) })}</span>
          ${r.is_open ? '' : `<span class="small" style="color:var(--danger)">${t('closed_hint')}</span>`}
        </div>`;
      card.querySelector('.name').textContent = r.name;
      list.append(card);
    }
  } catch (err) {
    list.removeAttribute('aria-busy');
    list.innerHTML = `<div class="card state-error"><div class="state"><div class="state-icon">${icon('wifiOff')}</div><p class="h3"></p><button class="btn btn-secondary" id="retry">${t('retry')}</button></div></div>`;
    list.querySelector('.h3').textContent = err instanceof ApiError && err.message ? err.message : t('offline');
    list.querySelector('#retry').addEventListener('click', () => renderHome(el, _p, _m, { go }));
  }
}
