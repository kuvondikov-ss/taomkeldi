// Restoran sahifasi (6-bosqich asosi): ma'lumot va menyu ro'yxati.
// Kategoriya tablari, taom oynasi va savat — 7-bosqich.
import { currentAddress } from '../state.js';
import { get, ApiError } from '../api.js';
import { t, getLang, formatSum } from '../i18n.js';
import { icon } from '../../ui/icons.js';
import { cuisineName, deliveryLine, ratingHtml, stateBlock } from './cards.js';

const nameOf = (x) => (getLang() === 'ru' && x.name_ru) || x.name_uz;

export async function renderRestaurant(el, params, m, { go }) {
  const id = Number(m[1]);
  const addr = currentAddress();
  el.innerHTML = '<main class="page stack" aria-busy="true"><div class="card"><div class="skeleton skeleton-media" style="aspect-ratio:16/9"></div><div class="card-body"><div class="skeleton skeleton-title"></div></div></div></main>';
  let r;
  try {
    r = (await get(`/restaurants/${id}?address_id=${addr.id}`)).restaurant;
  } catch (err) {
    el.innerHTML = '<main class="page"></main>';
    el.firstChild.append(stateBlock({
      iconName: err instanceof ApiError && err.code === 'NOT_FOUND' ? 'store' : 'wifiOff', error: true,
      title: err instanceof ApiError && err.message ? err.message : t('offline'),
      action: { label: t('nav_home'), onClick: () => go('') },
    }));
    return;
  }

  el.innerHTML = `
    <main class="page stack restaurant">
      <img class="card-media wide restaurant-cover" alt="" src="${r.cover_path || '/brand/placeholder.svg'}">
      <div class="stack" style="gap:var(--sp-1)">
        <div class="row" style="justify-content:space-between;align-items:flex-start">
          <h1 class="h2 rname"></h1>
          <span class="badge ${r.is_open ? 'badge-success' : 'badge-danger'}">${t(r.is_open ? 'open' : 'closed')}</span>
        </div>
        <p class="small text-2 cuisines"></p>
        <p class="small">${ratingHtml(r)}${r.rating ? ' · ' : ''}${deliveryLine(r)}</p>
        ${r.min_order ? `<p class="small text-2">${t('min_order', { sum: formatSum(r.min_order) })}</p>` : ''}
      </div>
      ${r.is_open ? '' : `<div class="alert alert-danger">${icon('info')}<span>${t('closed_hint')}</span></div>`}
      ${r.delivery?.deliverable ? '' : `<div class="alert alert-warning">${icon('alert')}<span>${t('not_deliverable')}</span></div>`}
      <div class="alert">${icon('info')}<span>${t('ordering_soon')}</span></div>
      <div id="menu" class="stack"></div>
    </main>`;
  el.querySelector('.rname').textContent = r.name;
  el.querySelector('.cuisines').textContent = r.cuisines.map(cuisineName).join(', ');

  const menu = el.querySelector('#menu');
  if (!r.products.length) {
    menu.append(stateBlock({ iconName: 'dish', title: t('menu_empty') }));
    return;
  }
  const groups = [...r.categories.map((c) => ({ id: c.id, title: nameOf(c) })), { id: null, title: t('other') }];
  for (const g of groups) {
    const items = r.products.filter((p) => (g.id === null ? !r.categories.some((c) => c.id === p.category_id) : p.category_id === g.id));
    if (!items.length) continue;
    const sec = document.createElement('section');
    sec.className = 'stack';
    sec.innerHTML = '<h2 class="h3"></h2><div class="list"></div>';
    sec.querySelector('h2').textContent = g.title;
    for (const p of items) {
      const row = document.createElement('div');
      row.className = `list-item product-row${p.is_available ? '' : ' is-unavailable'}`;
      row.id = `p-${p.id}`;
      row.innerHTML = `<span class="grow"><span class="h3 title-2l pname"></span><span class="xs text-2 portion"></span></span>
        <span class="stack" style="gap:0;align-items:flex-end">
          <span class="price">${formatSum(p.price)}</span>
          ${p.old_price && p.old_price > p.price ? `<span class="price-old">${formatSum(p.old_price)}</span>` : ''}
          ${p.is_available ? '' : `<span class="badge badge-danger">${t('out_of_stock')}</span>`}
        </span>`;
      row.querySelector('.pname').textContent = nameOf(p);
      row.querySelector('.portion').textContent = p.portion || '';
      sec.querySelector('.list').append(row);
    }
    menu.append(sec);
  }
  // Qidiruvdan taom tanlangan bo'lsa — o'sha taomga o'tamiz va belgilaymiz.
  const pid = params.get('product');
  const target = pid && el.querySelector(`#p-${CSS.escape(pid)}`);
  if (target) {
    target.classList.add('is-highlighted');
    setTimeout(() => target.scrollIntoView({ block: 'center' }), 50);
  }
}
