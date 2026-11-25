// Restoran kartasi (bosh sahifa, qidiruv, sevimlilar uchun bitta komponent).
import { put, del, ApiError } from '../api.js';
import { t, getLang, formatSum } from '../i18n.js';
import { icon } from '../../ui/icons.js';
import { toast } from '../../ui/components.js';

export const cuisineName = (c) => (getLang() === 'ru' ? c.name_ru : c.name_uz);

export function deliveryLine(r) {
  const d = r.delivery;
  if (!d?.deliverable) return t('not_deliverable');
  const fd = r.free_delivery || {};
  return [
    `${icon('clock', { className: 'icon-inline' })} ${t('eta', d.eta_min)}`,
    fd.kind === 'always' ? `<span class="free-text">${t('free_always')}</span>` : t('delivery_fee', { sum: formatSum(d.delivery_fee) }),
    fd.kind === 'threshold' ? `<span class="free-text">${t('free_from_short', { sum: formatSum(fd.threshold) })}</span>` : '',
  ].filter(Boolean).join(' · ');
}

export function ratingHtml(r) {
  if (!r.rating) return ''; // reyting o'ylab topilmaydi
  return `<span class="rating">${icon('star', { className: 'icon-inline' })} ${r.rating.value.toFixed(1)} <span class="text-2">(${r.rating.count})</span></span>`;
}

export function restaurantCard(r, { go, onFavoriteChange } = {}) {
  const el = document.createElement('article');
  el.className = `card restaurant-card${r.is_open ? '' : ' is-closed'}`;
  el.innerHTML = `
    <div class="card-cover">
      <img class="card-media wide" alt="" loading="lazy" src="${r.cover_path || '/brand/placeholder.svg'}">
      ${r.has_promo ? `<span class="badge badge-warning cover-badge">${t('promo')}</span>` : ''}
      ${r.free_delivery?.kind === 'always' ? `<span class="badge badge-success cover-badge cover-badge-2">${t('free_badge')}</span>` : ''}
      <button class="btn btn-icon fav-btn" type="button" aria-pressed="${r.is_favorite}" aria-label="${t(r.is_favorite ? 'fav_remove' : 'fav_add')}">${icon('heart')}</button>
    </div>
    <button class="card-body card-open" type="button">
      <span class="row" style="justify-content:space-between;align-items:flex-start;width:100%">
        <span class="h3 title-2l name"></span>
        <span class="badge ${r.is_open ? 'badge-success' : 'badge-danger'}">${t(r.is_open ? 'open' : 'closed')}</span>
      </span>
      <span class="small text-2 cuisines"></span>
      <span class="small meta">${ratingHtml(r)}${r.rating ? ' · ' : ''}${deliveryLine(r)}</span>
      ${r.is_open ? '' : `<span class="small danger-text">${t('closed_hint')}</span>`}
    </button>`;
  el.querySelector('.name').textContent = r.name;
  el.querySelector('.cuisines').textContent = r.cuisines.map(cuisineName).join(', ');
  el.querySelector('.card-open').addEventListener('click', () => go?.(`r/${r.id}`));
  const fav = el.querySelector('.fav-btn');
  fav.addEventListener('click', async () => {
    const on = fav.getAttribute('aria-pressed') !== 'true';
    fav.setAttribute('aria-pressed', String(on)); // darhol ko'rsatamiz, xato bo'lsa qaytaramiz
    try {
      if (on) await put(`/favorites/${r.id}`);
      else await del(`/favorites/${r.id}`);
      r.is_favorite = on;
      fav.setAttribute('aria-label', t(on ? 'fav_remove' : 'fav_add'));
      onFavoriteChange?.(r, on);
    } catch (err) {
      fav.setAttribute('aria-pressed', String(!on));
      toast(err instanceof ApiError && err.message ? err.message : t('offline'), { type: 'error' });
    }
  });
  return el;
}

export function skeletonCards(n = 2) {
  return '<div class="card"><div class="skeleton skeleton-media" style="aspect-ratio:16/9"></div><div class="card-body"><div class="skeleton skeleton-title"></div><div class="skeleton skeleton-text"></div></div></div>'.repeat(n);
}

export function stateBlock({ iconName, title, text = '', action, error = false }) {
  const wrap = document.createElement('div');
  wrap.className = `card${error ? ' state-error' : ''}`;
  wrap.innerHTML = `<div class="state"><div class="state-icon">${icon(iconName)}</div><p class="h3"></p><p class="small text-2"></p></div>`;
  wrap.querySelector('.h3').textContent = title;
  wrap.querySelector('.small').textContent = text;
  if (action) {
    const b = Object.assign(document.createElement('button'), { className: 'btn btn-secondary', type: 'button', textContent: action.label });
    b.addEventListener('click', action.onClick);
    wrap.querySelector('.state').append(b);
  }
  return wrap;
}
