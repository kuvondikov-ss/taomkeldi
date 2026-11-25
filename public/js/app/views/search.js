// Qidiruv: restoran va taom nomi bo'yicha (faqat tanlangan manzilga yetkazadigan restoranlar).
// So'nggi so'rovlar qurilmada saqlanadi.
import { state, currentAddress } from '../state.js';
import { get, ApiError } from '../api.js';
import { t, getLang, formatSum } from '../i18n.js';
import { icon } from '../../ui/icons.js';
import { restaurantCard, stateBlock } from './cards.js';

const KEY = () => `recentSearches:${state.me.user.id}`;
const loadRecent = () => { try { return JSON.parse(localStorage.getItem(KEY())) || []; } catch { return []; } };
const saveRecent = (q) => {
  const list = [q, ...loadRecent().filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 8);
  localStorage.setItem(KEY(), JSON.stringify(list));
};

export function renderSearch(el, params, _m, { go }) {
  const addr = currentAddress();
  el.innerHTML = `
    <main class="page stack">
      <form id="form" role="search">
        <label class="search"><span class="visually-hidden">${t('search_home')}</span>${icon('search')}
          <input class="input" id="q" type="search" enterkeyhint="search" autocomplete="off" maxlength="80" placeholder="${t('search_home')}">
        </label>
      </form>
      <div id="out" class="stack" aria-live="polite"></div>
    </main>`;
  const input = el.querySelector('#q');
  const out = el.querySelector('#out');
  let seq = 0;
  let timer;

  function showRecent() {
    const recent = loadRecent();
    out.innerHTML = '';
    if (!recent.length) {
      out.innerHTML = `<p class="small text-2">${t('search_min')}</p>`;
      return;
    }
    const head = document.createElement('div');
    head.className = 'row';
    head.style.justifyContent = 'space-between';
    head.innerHTML = `<span class="label">${t('recent')}</span><button class="btn btn-ghost small" type="button">${t('clear')}</button>`;
    head.querySelector('button').addEventListener('click', () => { localStorage.removeItem(KEY()); showRecent(); });
    const chips = document.createElement('div');
    chips.className = 'chip-row';
    for (const q of recent) {
      const c = Object.assign(document.createElement('button'), { className: 'chip', type: 'button', textContent: q });
      c.addEventListener('click', () => { input.value = q; run(q, true); });
      chips.append(c);
    }
    out.append(head, chips);
  }

  async function run(raw, remember) {
    const q = raw.trim();
    const mySeq = ++seq;
    if (q.length < 2) return showRecent();
    history.replaceState(null, '', `#/search?q=${encodeURIComponent(q)}`);
    try {
      const data = await get(`/search?address_id=${addr.id}&q=${encodeURIComponent(q)}`);
      if (mySeq !== seq) return;
      if (remember) saveRecent(q);
      out.innerHTML = '';
      if (!data.restaurants.length && !data.products.length) {
        out.append(stateBlock({ iconName: 'search', title: t('nothing_found'), text: t('nothing_found_hint') }));
        return;
      }
      if (data.restaurants.length) {
        out.insertAdjacentHTML('beforeend', `<h2 class="h3">${t('found_restaurants')}</h2>`);
        for (const r of data.restaurants) out.append(restaurantCard(r, { go }));
      }
      if (data.products.length) {
        out.insertAdjacentHTML('beforeend', `<h2 class="h3">${t('found_dishes')}</h2>`);
        const list = document.createElement('div');
        list.className = 'list';
        for (const p of data.products) {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'list-item';
          b.innerHTML = `${icon('dish')}<span class="grow"><span class="h3 title-2l pname"></span><span class="small text-2 rname"></span></span>
            <span class="stack" style="gap:0;align-items:flex-end"><span class="price">${formatSum(p.price)}</span>${p.is_available ? '' : `<span class="badge badge-danger">${t('out_of_stock')}</span>`}</span>`;
          b.querySelector('.pname').textContent = (getLang() === 'ru' && p.name_ru) || p.name_uz;
          b.querySelector('.rname').textContent = p.restaurant_name;
          b.addEventListener('click', () => { saveRecent(q); go(`r/${p.restaurant_id}?product=${p.id}`); });
          list.append(b);
        }
        out.append(list);
      }
    } catch (err) {
      if (mySeq !== seq) return;
      out.innerHTML = '';
      out.append(stateBlock({ iconName: 'wifiOff', error: true, title: err instanceof ApiError && err.message ? err.message : t('offline') }));
    }
  }

  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => run(input.value, false), 300); });
  el.querySelector('#form').addEventListener('submit', (e) => { e.preventDefault(); clearTimeout(timer); input.blur(); run(input.value, true); });

  const initial = params.get('q') || '';
  input.value = initial;
  if (initial) run(initial, false); else showRecent();
  setTimeout(() => { if (!initial) input.focus(); }, 50);
  return () => clearTimeout(timer);
}
