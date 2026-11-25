// Mini App kirish nuqtasi: autentifikatsiya, holat, marshrutlar.
import { get, canAuth, ApiError } from './api.js';
import { state, currentAddress, reloadAddresses } from './state.js';
import { t, setLang } from './i18n.js';
import { applyTelegramTheme } from '../ui/theme.js';
import { hydrateIcons } from '../ui/icons.js';
import { renderHome } from './views/home.js';
import { renderSearch } from './views/search.js';
import { renderFavorites } from './views/favorites.js';
import { renderRestaurant } from './views/restaurant.js';
import { renderCart } from './views/cart.js';
import { renderCheckout } from './views/checkout.js';
import { renderOrder } from './views/order.js';
import { renderAdmin } from './views/admin.js';
import { renderPanelList, renderPanel, renderPanelSection } from './views/panel.js';
import { renderApply } from './views/apply.js';
import { renderPicker } from './views/picker.js';
import { renderAddressForm } from './views/address-form.js';
import { renderAddresses } from './views/addresses.js';
import { renderProfile, renderOrders } from './views/simple.js';
import { renderCourier } from './views/courier.js';

const tg = applyTelegramTheme();
tg?.ready();
tg?.expand?.();

const view = document.getElementById('view');
const nav = document.getElementById('nav');
let cleanup = null;

// Marshrut → [render, { nav, needsAddress }]
const ROUTES = [
  [/^$/, renderHome, { nav: 'home', needsAddress: true }],
  [/^search$/, renderSearch, { nav: 'search', needsAddress: true }],
  [/^favorites$/, renderFavorites, { needsAddress: true }],
  [/^r\/(\d+)$/, renderRestaurant, { needsAddress: true }],
  [/^cart$/, renderCart, { needsAddress: true }],
  [/^checkout$/, renderCheckout, { needsAddress: true }],
  [/^order\/(\d+)$/, renderOrder, { map: true }],
  [/^orders$/, renderOrders, { nav: 'orders' }],
  [/^profile$/, renderProfile, { nav: 'profile' }],
  [/^addresses$/, renderAddresses, {}],
  [/^address\/pick$/, renderPicker, { fullscreen: true, map: true }],
  [/^address\/new$/, (el, p, _m, ctx) => renderAddressForm(el, null, p, ctx), {}],
  [/^address\/(\d+)\/edit$/, (el, p, m, ctx) => renderAddressForm(el, Number(m[1]), p, ctx), {}],
  [/^admin$/, renderAdmin, {}],
  [/^panel$/, renderPanelList, {}],
  [/^panel\/(\d+)$/, renderPanel, {}],
  [/^panel\/(\d+)\/(orders|menu|couriers|staff|settings|report)$/, renderPanelSection, {}],
  [/^apply$/, renderApply, {}],
  [/^courier$/, renderCourier, {}],
];

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  return { path, params: new URLSearchParams(query) };
}

// Orqaga qaytganda aylantirish joyi (va shu orqali faol kategoriya tabi) tiklanadi.
const scrollMemory = new Map();
let currentKey = null;
let navType = 'push';

export function go(path, { replace = false } = {}) {
  const url = `#/${path}`;
  if (replace) history.replaceState(null, '', url);
  else history.pushState(null, '', url);
  navType = replace ? 'replace' : 'push';
  render();
}

function setNav(active) {
  nav.hidden = !active;
  nav.querySelectorAll('[data-nav]').forEach((a) => {
    if (a.dataset.nav === active) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  document.body.classList.toggle('has-nav', !!active);
}

let renderSeq = 0;
async function render() {
  const seq = ++renderSeq;
  if (currentKey) scrollMemory.set(currentKey, window.scrollY);
  const restoreScroll = navType === 'pop';
  navType = 'pop'; // keyingi hashchange (orqaga/oldinga) uchun
  cleanup?.();
  cleanup = null;
  const { path, params } = parseHash();
  currentKey = location.hash;
  const route = ROUTES.find(([re]) => re.test(path)) || ROUTES[0];
  const [re, fn, opts] = route;

  // Manzil tanlanmaguncha restoranlar, qidiruv, savat ochilmaydi.
  if (opts.needsAddress && !currentAddress()) {
    const hasSaved = state.addresses.length > 0;
    return go(hasSaved ? 'addresses?choose=1' : 'address/pick', { replace: true });
  }

  setNav(opts.nav || null);
  document.body.classList.toggle('fullscreen', !!opts.fullscreen);
  // Xaritani surish Telegram'ning "yopish uchun pastga suring" imo-ishorasi bilan to'qnashmasin (SDK 7.7+).
  if (opts.map) tg?.disableVerticalSwipes?.(); else tg?.enableVerticalSwipes?.();
  if (tg?.BackButton) {
    if (opts.nav === 'home') tg.BackButton.hide();
    else tg.BackButton.show();
  }
  view.innerHTML = '';
  window.scrollTo(0, 0);
  const result = await fn(view, params, path.match(re), { go });
  if (seq !== renderSeq) { if (typeof result === 'function') result(); return; } // eskirgan render
  if (typeof result === 'function') cleanup = result;
  hydrateIcons(view);
  if (restoreScroll && scrollMemory.has(currentKey)) {
    const y = scrollMemory.get(currentKey);
    requestAnimationFrame(() => window.scrollTo(0, y));
    setTimeout(() => window.scrollTo(0, y), 150); // rasmlar yuklangach
  }
}

function fatal(title, text, retry) {
  view.innerHTML = `
    <div class="card state-error"><div class="state">
      <div class="state-icon"><i data-icon="${retry ? 'wifiOff' : 'info'}"></i></div>
      <p class="h3"></p><p class="small text-2"></p>
      ${retry ? `<button class="btn btn-secondary" id="retry"><i data-icon="refresh" data-icon-class="icon-sm"></i>${t('retry')}</button>` : ''}
    </div></div>`;
  view.querySelector('.h3').textContent = title;
  view.querySelector('.small').textContent = text;
  hydrateIcons(view);
  view.querySelector('#retry')?.addEventListener('click', () => location.reload());
}

async function boot() {
  hydrateIcons(document);
  if (tg?.initDataUnsafe?.user?.language_code?.startsWith('ru')) setLang('ru'); // faqat dastlabki ko'rinish
  if (!canAuth()) {
    nav.hidden = true;
    return fatal(t('outside_tg'), t('outside_tg_hint'), false);
  }
  try {
    const [me, config] = await Promise.all([get('/me'), get('/config')]);
    state.me = me;
    state.config = config;
    setLang(me.user.lang);
    state.region = await (await fetch(config.region.geojson_url)).json();
    await reloadAddresses();
  } catch (e) {
    if (e instanceof ApiError && e.code !== 'NETWORK' && e.message) return fatal(e.message, '', false);
    return fatal(t('offline'), t('offline_hint'), true);
  }
  nav.querySelectorAll('[data-nav-label]').forEach((el) => { el.textContent = t(el.dataset.navLabel); });
  tg?.BackButton?.onClick(() => history.back());
  // Klaviatura: matn maydoni fokusda bo'lsa pastki panellar yashiriladi (tokens.css: body.kb-open).
  const typing = (el) => el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'submit', 'file', 'range'].includes(el.type)));
  document.addEventListener('focusin', (e) => { if (typing(e.target)) document.body.classList.add('kb-open'); });
  document.addEventListener('focusout', () => setTimeout(() => { if (!typing(document.activeElement)) document.body.classList.remove('kb-open'); }, 50));
  window.addEventListener('hashchange', render); // orqaga/oldinga; go() o'zi render qiladi
  render();
}

boot();
