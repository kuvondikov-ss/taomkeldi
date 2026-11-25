// Sevimli restoranlar (tanlangan manzilga yetkazmasa ham ko'rinadi, holati bilan).
import { currentAddress } from '../state.js';
import { get, ApiError } from '../api.js';
import { t } from '../i18n.js';
import { restaurantCard, skeletonCards, stateBlock } from './cards.js';

export async function renderFavorites(el, _p, _m, { go }) {
  el.innerHTML = `<main class="page stack"><h1 class="h2">${t('favorites')}</h1><div id="list" class="stack" aria-busy="true">${skeletonCards(1)}</div></main>`;
  const list = el.querySelector('#list');
  try {
    const { restaurants } = await get(`/favorites?address_id=${currentAddress().id}`);
    list.removeAttribute('aria-busy');
    list.innerHTML = '';
    const empty = () => list.append(stateBlock({ iconName: 'heart', title: t('favorites_empty'), text: t('favorites_empty_hint') }));
    if (!restaurants.length) return empty();
    for (const r of restaurants) {
      const card = restaurantCard(r, {
        go,
        onFavoriteChange: (_r, on) => { if (!on) { card.remove(); if (!list.children.length) empty(); } },
      });
      list.append(card);
    }
  } catch (err) {
    list.innerHTML = '';
    list.append(stateBlock({ iconName: 'wifiOff', error: true, title: err instanceof ApiError && err.message ? err.message : t('offline') }));
  }
}
