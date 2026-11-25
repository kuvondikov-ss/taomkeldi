// Kuryer ekrani: smena → joriy buyurtma (hozirgi vazifa, olish/yetkazish, yo'nalish va aloqa, mijozdan olinadigan summa,
// bitta asosiy keyingi amal) → yangi takliflar → statistika va tarix (ikkinchi darajada).
// Barcha tekshiruvlar serverda (services/dispatch.js); bu yerda faqat ko'rinish.
import { get, post, ApiError } from '../api.js';
import { t, formatSum } from '../i18n.js';
import { icon } from '../../ui/icons.js';
import { toast, confirmDialog, setLoading } from '../../ui/components.js';
import { stateBlock } from './cards.js';
import { PING_ACTIVE_MS, PING_IDLE_MS } from '../../shared/tracking.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const errText = (e) => (e instanceof ApiError && e.message ? e.message : t('offline'));
const route = (lat, lon) => (lat != null && lon != null ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}` : null);
const tel = (p) => (p ? `<a class="link" href="tel:${esc(String(p).replace(/[^\d+]/g, ''))}">${esc(p)}</a>` : '—');
const REFRESH_MS = 20_000;

function addressText(o) {
  const d = o.address_details || {};
  return [o.address_text, d.entrance && `${t('k_entrance')} ${d.entrance}`, d.floor && `${t('k_floor')} ${d.floor}`, d.apartment && `${t('k_apartment')} ${d.apartment}`]
    .filter(Boolean).map(esc).join(', ') || '—';
}

const collectHtml = (o) => (o.collect_amount
  ? `<b class="price">${formatSum(o.collect_amount)}</b>`
  : `<b>${t('k_collect_none')}</b>`);

// Hozirgi vazifa va bitta asosiy amal.
function task(o) {
  if (o.status === 'on_way') return { text: t('k_task_deliver'), action: 'deliver', label: t('k_btn_delivered') };
  if (o.status === 'ready') return { text: t('k_task_pickup'), action: 'pickup', label: t('k_btn_picked') };
  return { text: t('k_task_wait'), action: null, label: t('k_wait_btn') };
}

function orderCard(o) {
  const tk = task(o);
  const toR = route(o.restaurant_lat, o.restaurant_lon);
  const toC = route(o.address_lat, o.address_lon);
  const beforePickup = o.status !== 'on_way';
  const card = document.createElement('article');
  card.className = 'card courier-order';
  card.innerHTML = `<div class="card-body stack">
    <div class="row" style="justify-content:space-between"><span class="h3">#${o.id} · ${esc(o.restaurant_name)}</span><span class="badge ${o.status === 'on_way' ? 'badge-success' : o.status === 'ready' ? 'badge-warning' : ''}">${t(`status_${o.status}`)}</span></div>
    <div class="courier-task">${icon(o.status === 'on_way' ? 'pin' : 'store')}<b>${tk.text}</b></div>
    <div class="courier-leg ${beforePickup ? 'is-current' : ''}">
      <span class="xs text-2">${t('k_pickup_label')}</span>
      <span>${esc(o.restaurant_name)}${o.restaurant_address ? `, ${esc(o.restaurant_address)}` : ''}</span>
      <span class="row courier-links">${toR ? `<a class="link" href="${toR}" target="_blank" rel="noopener">${icon('pin', { className: 'icon-inline' })}${t('k_route')}</a>` : ''}${o.restaurant_phone ? `<span>${icon('phone', { className: 'icon-inline' })}${tel(o.restaurant_phone)}</span>` : ''}</span>
    </div>
    <div class="courier-leg ${beforePickup ? '' : 'is-current'}">
      <span class="xs text-2">${t('k_dropoff_label')}</span>
      <span>${addressText(o)}</span>
      ${o.comment ? `<span class="small text-2">${esc(o.comment)}</span>` : ''}
      <span class="row courier-links">${toC ? `<a class="link" href="${toC}" target="_blank" rel="noopener">${icon('pin', { className: 'icon-inline' })}${t('k_route')}</a>` : ''}<span>${icon('user', { className: 'icon-inline' })}${esc(o.customer_name || '—')} · ${tel(o.customer_phone)}</span></span>
    </div>
    <div class="courier-collect"><span class="small">${t('k_collect_label')}</span>${collectHtml(o)}</div>
    <p class="xs text-2">${o.items.map((i) => `${esc(i.name)} × ${i.qty}`).join(', ')}</p>
    <button class="btn btn-primary btn-block" data-act="${tk.action || ''}" ${tk.action ? '' : 'disabled'}>${tk.label}</button>
    <button class="btn btn-ghost btn-block" data-act="${beforePickup ? 'release' : 'problem'}">${beforePickup ? t('k_btn_release') : t('k_btn_problem')}</button>
  </div>`;
  return card;
}

function offerCard(o) {
  const card = document.createElement('article');
  card.className = 'card courier-offer';
  card.innerHTML = `<div class="card-body stack" style="gap:var(--sp-2)">
    <div class="row" style="justify-content:space-between"><span class="h3">#${o.id} · ${esc(o.restaurant_name)}</span><span class="badge">${t(`status_${o.status}`)}</span></div>
    <span class="small"><span class="text-2">${t('k_dropoff_label')}:</span> ${addressText(o)}</span>
    <div class="courier-collect"><span class="small">${t('k_collect_label')}</span>${collectHtml(o)}</div>
    <div class="row" style="gap:var(--sp-2)"><button class="btn btn-primary grow" data-offer="accept">${t('k_btn_accept')}</button><button class="btn btn-secondary" data-offer="decline">${t('k_btn_skip')}</button></div>
  </div>`;
  return card;
}

export async function renderCourier(el) {
  el.innerHTML = `<main class="page stack"><h1 class="h2">${t('courier')}</h1><div class="stack" id="c-body" aria-busy="true"><div class="skeleton" style="height:120px"></div></div></main>`;
  const body = el.querySelector('#c-body');
  let timer = null;
  let busy = false;
  let last = null;      // oxirgi dashboard
  let pingTimer = null;
  let geoState = null;  // 'ok' | 'denied' | 'unsupported'

  // Joylashuv: ekran ochiq bo'lganda — yo'ldagi buyurtma bo'lsa ~15 s, aks holda ~60 s (shared/tracking.js).
  // Fonda yoki yopiq ilovada brauzer GPS bermaydi — buni va'da qilmaymiz, Telegram jonli joylashuvi tavsiya qilinadi.
  const needsGps = (d) => !!d && (d.active.length > 0 || d.shifts.some((s) => s.is_online));
  function schedulePing(delay) {
    clearTimeout(pingTimer);
    if (!needsGps(last) || geoState === 'denied' || geoState === 'unsupported') return;
    const onWay = last.active.some((o) => o.status === 'on_way');
    pingTimer = setTimeout(ping, delay ?? (onWay ? PING_ACTIVE_MS : PING_IDLE_MS));
  }
  function ping() {
    if (!navigator.geolocation) { geoState = 'unsupported'; paintGeo(); return; }
    if (document.visibilityState !== 'visible') { schedulePing(); return; }
    navigator.geolocation.getCurrentPosition(async (p) => {
      try { await post('/courier/location', { lat: p.coords.latitude, lon: p.coords.longitude }); geoState = 'ok'; } catch { /* keyingi urinishda */ }
      paintGeo();
      schedulePing();
    }, (err) => {
      geoState = err.code === 1 ? 'denied' : geoState;
      paintGeo();
      schedulePing();
    }, { enableHighAccuracy: true, timeout: 10_000, maximumAge: 10_000 });
  }
  function paintGeo() {
    const n = body.querySelector('#gps-note');
    if (!n) return;
    n.textContent = geoState === 'denied' ? t('k_gps_denied') : geoState === 'unsupported' ? t('k_gps_unsupported') : t('k_gps_note');
    n.classList.toggle('warn-text', geoState === 'denied' || geoState === 'unsupported');
  }

  async function run(btn, fn, ok) {
    if (busy) return;
    busy = true;
    setLoading(btn, true);
    try {
      await fn();
      if (ok) toast(ok, { type: 'success' });
    } catch (e) {
      const reason = e instanceof ApiError ? e.details?.reason : null;
      const key = { taken: 'k_taken_alert', offline: 'k_offline_alert', offer_closed: 'k_offer_closed_alert', picked_up: 'k_picked_alert' }[reason];
      toast(key ? t(key) : errText(e), { type: 'error', timeout: 5000 });
    } finally {
      busy = false;
      if (btn.isConnected) setLoading(btn, false);
      await load();
    }
  }

  async function load() {
    let d;
    try { d = await get('/courier/dashboard'); } catch (e) {
      body.innerHTML = '';
      body.removeAttribute('aria-busy');
      body.append(stateBlock({ iconName: e instanceof ApiError && e.status === 403 ? 'scooter' : 'wifiOff', error: !(e instanceof ApiError && e.status === 403), title: e instanceof ApiError && e.status === 403 ? t('k_not_courier') : errText(e) }));
      return;
    }
    body.removeAttribute('aria-busy');
    body.innerHTML = '';
    const firstGps = !needsGps(last) && needsGps(d);
    last = d;
    const anyOnline = d.shifts.some((s) => s.is_online);

    // 1) Smena
    const shifts = document.createElement('div');
    shifts.className = 'card';
    shifts.innerHTML = `<div class="card-body stack" style="gap:var(--sp-2)">${d.shifts.map((s) => `
      <label class="row check-row"><span class="switch"><input type="checkbox" data-shift="${s.courier_id}" ${s.is_online ? 'checked' : ''} ${s.restaurant_status !== 'active' ? 'disabled' : ''}><span></span></span>
        <span class="grow"><b>${esc(s.restaurant_name)}</b><br><span class="xs text-2">${s.is_online ? t('k_on_shift') : t('k_off_shift')}</span></span></label>`).join('')}</div>`;
    shifts.querySelectorAll('[data-shift]').forEach((inp) => inp.addEventListener('change', () => run(inp.closest('label'), () => post('/courier/shift', { courier_id: Number(inp.dataset.shift), online: inp.checked }),
      inp.checked ? t('k_shift_on_toast') : t('k_shift_off_toast'))));
    if (needsGps(d)) shifts.querySelector('.card-body').insertAdjacentHTML('beforeend', '<p class="xs text-2" id="gps-note"></p>');
    body.append(shifts);
    paintGeo();
    if (firstGps) schedulePing(0);
    else if (!needsGps(d)) clearTimeout(pingTimer);

    // 2) Joriy buyurtmalar
    if (d.active.length) {
      const h = document.createElement('h2');
      h.className = 'h3';
      h.textContent = t('k_current');
      body.append(h);
      for (const o of d.active) {
        const card = orderCard(o);
        card.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', async () => {
          const act = b.dataset.act;
          if (!act) return;
          if (act === 'release' || act === 'problem') {
            const ok = await confirmDialog({ title: t(act === 'release' ? 'k_release_q' : 'k_problem_q'), text: t(act === 'release' ? 'k_release_text' : 'k_problem_text'), confirm: t(act === 'release' ? 'k_btn_release' : 'k_btn_problem'), cancel: t('cancel'), danger: act === 'release' });
            if (!ok) return;
          }
          const okText = { pickup: t('k_picked_toast'), deliver: t('k_delivered_toast'), release: t('k_released_ok'), problem: t('k_problem_ok') }[act];
          run(b, () => post(`/courier/orders/${o.id}/${act}`), okText);
        }));
        body.append(card);
      }
    }

    // 3) Takliflar
    if (d.offers.length) {
      const h = document.createElement('h2');
      h.className = 'h3';
      h.textContent = t('k_offers');
      body.append(h);
      for (const o of d.offers) {
        const card = offerCard(o);
        card.querySelectorAll('[data-offer]').forEach((b) => b.addEventListener('click', () => run(b, () => post(`/courier/offers/${o.id}/${b.dataset.offer}`), b.dataset.offer === 'accept' ? t('k_accept_ok') : null)));
        body.append(card);
      }
    }

    if (!d.active.length && !d.offers.length) {
      body.append(stateBlock({ iconName: 'scooter', title: anyOnline ? t('k_empty_online') : t('k_empty_offline'), text: anyOnline ? t('k_empty_online_text') : t('k_empty_offline_text') }));
    }

    // 4) Statistika va tarix — ikkinchi darajada
    const stats = document.createElement('details');
    stats.className = 'card';
    stats.innerHTML = `<summary class="card-body row" style="cursor:pointer"><span class="grow h3">${t('k_stats')}</span><span class="small text-2">${t('k_today_short', { n: d.today.delivered })}</span></summary>
      <div class="card-body stack" style="padding-top:0">
        <div class="metrics"><div class="metric"><span class="metric-value">${d.today.delivered}</span><span class="xs text-2">${t('k_today_delivered')}</span></div>
          <div class="metric"><span class="metric-value">${formatSum(d.today.cash)}</span><span class="xs text-2">${t('k_today_cash')}</span></div></div>
        ${d.history.length ? `<div class="list">${d.history.map((x) => `<div class="list-item"><span class="grow"><span class="small">#${x.id} · ${esc(x.restaurant_name)}</span><span class="xs text-2">${t(`status_${x.status}`)} · ${esc(x.address_text || '')}</span></span><span class="price small">${formatSum(x.total)}</span></div>`).join('')}</div>` : `<p class="small text-2">${t('k_no_history')}</p>`}
      </div>`;
    body.append(stats);
  }

  await load();
  // Takliflar va holat o'zgarishi uchun davriy yangilash (ekran ochiq va hech narsa bajarilmayotganda).
  timer = setInterval(() => { if (!busy && document.visibilityState === 'visible') load(); }, REFRESH_MS);
  return () => { clearInterval(timer); clearTimeout(pingTimer); };
}
