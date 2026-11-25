// Yetkazish nuqtasini tanlash: xarita pini, GPS/Telegram joylashuvi, qidiruv, saqlangan manzillar.
// Hudud tekshiruvi Mini App'da ham, serverda ham BIR XIL fayl va kod bilan: /geo/jizzax.json + geo-core.js
import { state } from '../state.js';
import { get, ApiError } from '../api.js';
import { t } from '../i18n.js';
import { pointInGeometry } from '../../shared/geo-core.js';
import { icon } from '../../ui/icons.js';

const JIZZAX_CITY = [40.1158, 67.8422];

export function renderPicker(el, params, _m, { go }) {
  const target = params.get('for') || 'new'; // 'new' | <address id>
  const tg = window.Telegram?.WebApp;
  el.innerHTML = `
    <div class="picker">
      <div class="picker-map" id="map" role="application" aria-label="${t('pick_title')}"></div>
      <div class="map-pin" aria-hidden="true">${icon('pin')}</div>
      <form class="picker-top" id="search-form" role="search">
        <label class="search">
          <span class="visually-hidden">${t('search_placeholder')}</span>${icon('search')}
          <input class="input" id="q" type="search" enterkeyhint="search" autocomplete="off" placeholder="${t('search_placeholder')}">
        </label>
        <div class="search-results card" id="results" hidden></div>
      </form>
      <button class="btn btn-icon fab-locate" id="locate" aria-label="${t('my_location')}">${icon('pin')}</button>
      <div class="picker-bottom">
        <p class="small text-2">${t('pick_hint')}</p>
        <div class="row" style="align-items:flex-start">
          <span class="picker-pin-icon">${icon('pin')}</span>
          <p class="h3" id="place" aria-live="polite">${t('resolving')}</p>
        </div>
        <div class="alert alert-warning" id="notice" hidden></div>
        <div class="row picker-actions">
          ${state.addresses.length ? `<button class="btn btn-secondary" id="saved" type="button">${t('saved_addresses')}</button>` : ''}
          <button class="btn btn-primary btn-lg grow" id="confirm" disabled>${t('deliver_here')}</button>
        </div>
      </div>
    </div>`;

  const $ = (s) => el.querySelector(s);
  const place = $('#place');
  const notice = $('#notice');
  const confirmBtn = $('#confirm');
  const results = $('#results');
  const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

  function showNotice(text, { action } = {}) {
    notice.hidden = !text;
    notice.innerHTML = '';
    if (!text) return;
    notice.append(Object.assign(document.createElement('span'), { textContent: text }));
    if (action) {
      const b = Object.assign(document.createElement('button'), { className: 'btn btn-ghost', type: 'button', textContent: action.label });
      b.addEventListener('click', action.onClick);
      notice.append(b);
    }
  }

  // --- Xarita ---
  const editing = target !== 'new' ? state.addresses.find((a) => a.id === Number(target)) : null;
  const start = state.draft ? [state.draft.lat, state.draft.lon]
    : editing ? [editing.lat, editing.lon]
      : JIZZAX_CITY;
  const map = window.L.map($('#map'), { zoomControl: false, attributionControl: true }).setView(start, 15);
  window.L.tileLayer(state.config.map.tileUrl, { attribution: state.config.map.attribution, maxZoom: 19 }).addTo(map);
  const regionLayer = window.L.geoJSON(state.region, {
    interactive: false,
    style: { color: cssVar('--brand'), weight: 2, dashArray: '6 6', fill: false },
  }).addTo(map);
  map.setMaxBounds(regionLayer.getBounds().pad(0.25));
  map.setMinZoom(8);
  if (sessionStorage.getItem('devUser')) window.__pickerMap = map; // faqat lokal sinov (?dev=)

  let current = null; // { lat, lon, inside, text }
  let seq = 0;
  let timer = null;

  async function onMove() {
    const c = map.getCenter();
    const lat = Number(c.lat.toFixed(6));
    const lon = Number(c.lng.toFixed(6));
    const inside = pointInGeometry(state.region.geometry, lat, lon);
    current = { lat, lon, inside, text: null };
    const mySeq = ++seq;
    clearTimeout(timer);
    if (!inside) {
      place.textContent = t('choose_address');
      confirmBtn.disabled = true;
      showNotice(t('outside_area'), { action: { label: t('change_address'), onClick: () => map.setView(JIZZAX_CITY, 14, { animate: false }) } });
      return;
    }
    showNotice('');
    confirmBtn.disabled = false;
    place.textContent = t('resolving');
    if (!state.config.geocoder) { place.textContent = `${lat.toFixed(5)}, ${lon.toFixed(5)}`; return; }
    timer = setTimeout(async () => {
      try {
        const { place: p } = await get(`/geo/reverse?lat=${lat}&lon=${lon}`);
        if (mySeq !== seq) return;
        current.text = p.text;
        place.textContent = p.text || `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
      } catch {
        if (mySeq !== seq) return;
        place.textContent = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
        showNotice(t('resolve_failed'));
      }
    }, 700);
  }
  map.on('moveend', onMove);
  onMove();

  // Pin xaritaning ko'rinadigan qismi markazida tursin (pastki panel balandligi o'zgaradi).
  const picker = $('.picker');
  const bottom = $('.picker-bottom');
  const ro = new ResizeObserver(() => {
    picker.style.setProperty('--picker-bottom-h', `${bottom.offsetHeight}px`);
    map.invalidateSize();
  });
  ro.observe(bottom);

  // --- Joylashuv: Telegram LocationManager (Bot API 8.0+) yoki brauzer geolokatsiyasi ---
  const moveTo = (lat, lon) => map.setView([lat, lon], 17, { animate: false });
  async function locate() {
    showNotice(t('locating'));
    const lm = tg?.LocationManager;
    if (lm && tg.isVersionAtLeast?.('8.0')) {
      if (!lm.isInited) await new Promise((r) => lm.init(r));
      if (lm.isLocationAvailable) {
        lm.getLocation((data) => {
          if (data) { showNotice(''); return moveTo(data.latitude, data.longitude); }
          showNotice(t('gps_denied'), { action: { label: t('gps_settings'), onClick: () => lm.openSettings() } });
        });
        return;
      }
    }
    if (!navigator.geolocation) return showNotice(t('gps_unsupported'));
    navigator.geolocation.getCurrentPosition(
      (pos) => { showNotice(''); moveTo(pos.coords.latitude, pos.coords.longitude); },
      (err) => showNotice(err.code === 1 ? t('gps_denied') : t('gps_failed')),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }
  $('#locate').addEventListener('click', locate);

  // --- Qidiruv (faqat yuborilganda; avtomatik to'ldirish yo'q — Nominatim qoidasi) ---
  $('#search-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = $('#q').value.trim();
    results.hidden = false;
    results.innerHTML = '';
    const msg = (text) => { results.innerHTML = '<p class="small text-2 search-msg"></p>'; results.firstChild.textContent = text; };
    if (q.length < 3) return msg(t('search_short'));
    if (!state.config.geocoder) return msg(t('geocoder_off'));
    msg(t('loading'));
    try {
      const { results: list } = await get(`/geo/search?q=${encodeURIComponent(q)}`);
      if (!list.length) return msg(t('search_none'));
      results.innerHTML = '';
      for (const r of list) {
        const b = Object.assign(document.createElement('button'), { type: 'button', className: 'list-item small' });
        b.textContent = r.text;
        b.addEventListener('click', () => { results.hidden = true; $('#q').blur(); moveTo(r.lat, r.lon); });
        results.append(b);
      }
    } catch (err) {
      msg(err instanceof ApiError && err.message ? err.message : t('geocoder_off'));
    }
  });

  $('#saved')?.addEventListener('click', () => go('addresses?choose=1'));

  confirmBtn.addEventListener('click', () => {
    if (!current?.inside) return;
    state.draft = { lat: current.lat, lon: current.lon, text: current.text, for: target };
    go(target === 'new' ? 'address/new' : `address/${target}/edit`);
  });

  return () => { clearTimeout(timer); ro.disconnect(); map.remove(); };
}
