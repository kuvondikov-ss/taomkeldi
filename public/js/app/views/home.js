// Bosh sahifa: header → yetkazish manzili → qidiruv → banner → oshxona turlari → restoranlar.
// Filtrlar URL'da (#/?cuisine=&sort=&promo=1) — orqaga qaytganda saqlanadi.
import { currentAddress } from '../state.js';
import { get, ApiError } from '../api.js';
import { t } from '../i18n.js';
import { icon } from '../../ui/icons.js';
import { restaurantCard, skeletonCards, stateBlock, cuisineName } from './cards.js';

const SORTS = ['recommended', 'rating', 'fast', 'cheap_delivery'];

export async function renderHome(el, params, _m, ctx) {
  const { go } = ctx;
  const addr = currentAddress();
  const f = { cuisine: params.get('cuisine') || '', sort: SORTS.includes(params.get('sort')) ? params.get('sort') : 'recommended', promo: params.get('promo') === '1' };

  el.innerHTML = `
    <main class="page stack home">
      <header class="app-header">
        <img class="logo logo-light" src="/brand/taomkeldi-compact-light.svg" alt="Taomkeldi">
        <img class="logo logo-dark" src="/brand/taomkeldi-compact-dark.svg" alt="Taomkeldi">
        <button class="btn btn-icon btn-ghost" id="favs" aria-label="${t('favorites')}">${icon('heart')}</button>
      </header>
      <button class="address-bar" id="addr" type="button">
        ${icon('pin')}
        <span class="grow"><span class="xs text-2">${t('deliver_to')}</span><span class="address-bar-text"></span></span>
        ${icon('chevron')}
      </button>
      <button class="search search-link" id="search" type="button">${icon('search')}<span class="input">${t('search_home')}</span></button>
      <section class="banner has-photo" aria-labelledby="banner-title">
        <img class="banner-photo" src="/brand/banner-food.webp" alt="" width="740" height="190" decoding="async">
        <div class="banner-text">
          <h2 class="banner-title" id="banner-title">${t('banner_title')}</h2>
          <button class="btn btn-banner" id="banner-cta">${t('banner_cta')}</button>
        </div>
      </section>
      <div class="chip-row" id="cuisines" aria-label="${t('nav_search')}"></div>
      <div class="row filter-row">
        <label class="sort-select">
          <span class="visually-hidden">${t('sort_label')}</span>
          ${icon('filter', { className: 'icon-sm' })}
          <select class="select" id="sort">${SORTS.map((s) => `<option value="${s}" ${f.sort === s ? 'selected' : ''}>${t(`sort_${s}`)}</option>`).join('')}</select>
        </label>
        <button class="chip" id="promo" aria-pressed="${f.promo}">${t('promo')}</button>
      </div>
      <h2 class="h2" id="list-title">${t('restaurants_title')}</h2>
      <div id="list" class="stack" aria-busy="true">${skeletonCards(2)}</div>
    </main>`;

  el.querySelector('.address-bar-text').textContent = addr.label ? `${addr.label} · ${addr.text}` : addr.text;
  el.querySelector('#addr').addEventListener('click', () => go('addresses'));
  el.querySelector('#favs').addEventListener('click', () => go('favorites'));
  el.querySelector('#search').addEventListener('click', () => go('search'));
  el.querySelector('#banner-cta').addEventListener('click', () => el.querySelector('#list-title').scrollIntoView({ behavior: 'smooth', block: 'start' }));

  const setFilter = (patch) => {
    const n = { ...f, ...patch };
    const q = new URLSearchParams();
    if (n.cuisine) q.set('cuisine', n.cuisine);
    if (n.sort !== 'recommended') q.set('sort', n.sort);
    if (n.promo) q.set('promo', '1');
    go(q.toString() ? `?${q}` : '', { replace: true });
  };
  el.querySelector('#sort').addEventListener('change', (e) => setFilter({ sort: e.target.value }));
  el.querySelector('#promo').addEventListener('click', () => setFilter({ promo: !f.promo }));

  const list = el.querySelector('#list');
  const q = new URLSearchParams({ address_id: addr.id, sort: f.sort });
  if (f.cuisine) q.set('cuisine', f.cuisine);
  if (f.promo) q.set('promo', '1');
  try {
    const data = await get(`/restaurants?${q}`);
    // Oshxona turlari — shu manzildagi restoranlarda mavjudlari.
    const chips = el.querySelector('#cuisines');
    if (data.cuisines.length) {
      const all = [{ id: '', label: t('all_cuisines') }, ...data.cuisines.map((c) => ({ id: String(c.id), label: cuisineName(c) }))];
      for (const c of all) {
        const b = Object.assign(document.createElement('button'), { className: 'chip', type: 'button', textContent: c.label });
        b.setAttribute('aria-pressed', String(f.cuisine === c.id));
        b.addEventListener('click', () => setFilter({ cuisine: c.id }));
        chips.append(b);
      }
    } else {
      chips.hidden = true;
    }

    list.removeAttribute('aria-busy');
    list.innerHTML = '';
    if (data.total_in_area === 0) {
      // Bu manzilda umuman restoran yo'q — filtrlangan bo'sh holatdan farqli.
      el.querySelector('.filter-row').hidden = true;
      list.append(stateBlock({ iconName: 'store', title: t('no_restaurants'), text: t('no_restaurants_hint'), action: { label: t('change_address'), onClick: () => go('addresses') } }));
      return;
    }
    if (!data.restaurants.length) {
      list.append(stateBlock({ iconName: 'filter', title: t('filtered_empty'), action: { label: t('reset_filters'), onClick: () => go('', { replace: true }) } }));
      return;
    }
    for (const r of data.restaurants) list.append(restaurantCard(r, { go }));
  } catch (err) {
    list.removeAttribute('aria-busy');
    list.innerHTML = '';
    list.append(stateBlock({
      iconName: 'wifiOff', error: true,
      title: err instanceof ApiError && err.message ? err.message : t('offline'),
      action: { label: t('retry'), onClick: () => renderHome(el, params, _m, ctx) },
    }));
  }
}
