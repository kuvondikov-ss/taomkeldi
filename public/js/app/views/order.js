// Buyurtma sahifasi va jonli kuzatuv.
// Tartib: raqam va haqiqiy holat (+ ma'lumot yetarli bo'lsa taxminiy vaqt) → to'lov (kerak bo'lsa) → xarita, joylashuv yangilangan vaqt,
// kuryer bilan aloqa → baholash / qayta buyurtma → yig'iladigan tafsilotlar. Katta dekorativ belgi yo'q — xarita yuqorida turadi.
// Joylashuv chegaralari (3 / 20 daqiqa) — shared/tracking.js da; server ham shu qiymatlarni ishlatadi.
import { get, post, ApiError } from '../api.js';
import { t, formatSum, getLang } from '../i18n.js';
import { icon } from '../../ui/icons.js';
import { confirmDialog, toast, setLoading } from '../../ui/components.js';
import { stateBlock } from './cards.js';
import { state, currentAddress } from '../state.js';
import * as cart from '../cart.js';

const STEPS = {
  delivery: ['new', 'accepted', 'ready', 'on_way', 'delivered'],
  pickup: ['new', 'accepted', 'ready', 'delivered'],
};
const ACTIVE = ['pending_payment', 'new', 'accepted', 'ready', 'on_way'];
const POLL_MS = 15_000;
const stepLabel = (s, type) => {
  if (s === 'ready') return t(type === 'pickup' ? 'step_ready_pickup' : 'step_ready_delivery');
  if (s === 'delivered' && type === 'pickup') return t('step_delivered_pickup');
  return t(`step_${s}`);
};
const time = (ms) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const dateTime = (ms) => new Date(ms).toLocaleString([], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const errText = (e) => (e instanceof ApiError && e.message ? e.message : t('offline'));
const ago = (ms) => {
  const m = Math.floor(ms / 60_000);
  return m < 1 ? t('ago_now') : t('ago_min', { n: m });
};
const km = (m) => (m < 1000 ? t('dist_m', { n: Math.round(m / 10) * 10 }) : t('dist_km', { n: (m / 1000).toFixed(1).replace('.', getLang() === 'ru' ? ',' : '.') }));

export async function renderOrder(el, _p, m, { go }) {
  const id = Number(m[1]);
  let timer;
  let map = null;
  let layers = null;
  let fitted = false;

  el.innerHTML = `<main class="page stack order">
    <div id="o-head"><div class="skeleton skeleton-title"></div><div class="skeleton skeleton-text"></div></div>
    <div id="payment" class="stack"></div>
    <section id="track" class="card track" hidden><div id="track-map" class="track-map"></div><div class="card-body stack" id="track-info"></div></section>
    <div id="o-after" class="stack"></div>
    <div id="o-details" class="stack"></div>
    <div id="actions" class="stack"></div>
  </main>`;

  async function load() {
    clearTimeout(timer);
    try {
      const { order } = await get(`/orders/${id}`);
      let tracking = null;
      // Kuzatuv (taxminiy vaqt, kuryer, joylashuv) — faqat faol buyurtmada; xato bo'lsa sahifa baribir ochiladi.
      if (ACTIVE.includes(order.status) && order.status !== 'pending_payment') {
        try { ({ tracking } = await get(`/orders/${id}/tracking`)); } catch { tracking = null; }
      }
      draw(order, tracking);
      if (ACTIVE.includes(order.status)) timer = setTimeout(load, POLL_MS);
    } catch (err) {
      el.innerHTML = '<main class="page"></main>';
      el.firstChild.append(stateBlock({ iconName: 'receipt', error: true, title: errText(err), action: { label: t('retry'), onClick: () => location.reload() } }));
    }
  }

  // ---------- Yuqori: raqam, holat, taxminiy vaqt ----------
  function drawHead(o, tr) {
    const cancelled = o.status === 'cancelled';
    let eta = '';
    if (tr?.eta?.kind === 'travel') eta = t('eta_travel', { from: tr.eta.from, to: tr.eta.to });
    else if (tr?.eta?.kind === 'prep') eta = tr.eta.from > 0 ? t('eta_prep', { from: tr.eta.from, to: tr.eta.to }) : t('eta_prep_soon');
    const head = el.querySelector('#o-head');
    head.innerHTML = `
      <div class="row" style="justify-content:space-between;align-items:flex-start">
        <div><h1 class="h2">${t('order_title', { id: o.id })}</h1><p class="small text-2 rname"></p></div>
        <span class="badge ${cancelled ? 'badge-danger' : o.status === 'delivered' ? 'badge-success' : 'badge-warning'}">${stepLabel(o.status, o.type)}</span>
      </div>
      ${ACTIVE.includes(o.status) ? `<p class="h3 track-status">${t(`track_${o.status}${o.type === 'pickup' && o.status === 'ready' ? '_pickup' : ''}`)}</p>` : ''}
      ${eta ? `<p class="small text-2">${eta}${tr?.eta?.kind === 'travel' ? ` · ${t('straight_line')}` : ''}</p>` : ''}`;
    head.querySelector('.rname').textContent = `${o.restaurant.name} · ${dateTime(o.created_at)}`;
  }

  // ---------- Xarita va kuryer ----------
  function ensureMap() {
    if (map || !window.L || !state.config?.map) return map;
    map = window.L.map(el.querySelector('#track-map'), { zoomControl: false, attributionControl: true });
    window.L.tileLayer(state.config.map.tileUrl, { attribution: state.config.map.attribution, maxZoom: 19 }).addTo(map);
    layers = window.L.layerGroup().addTo(map);
    return map;
  }
  const dot = (cls, label) => window.L.divIcon({ className: `track-pin ${cls}`, html: `<span>${label}</span>`, iconSize: [30, 30], iconAnchor: [15, 15] });

  function drawTrack(o, tr) {
    const box = el.querySelector('#track');
    const showMap = o.type === 'delivery' && ['accepted', 'ready', 'on_way'].includes(o.status) && tr;
    box.hidden = !showMap;
    if (!showMap) return;
    const info = el.querySelector('#track-info');
    const loc = tr.location;
    const reasonKey = { no_courier: 'track_no_courier', not_on_way: 'track_not_on_way', no_location: 'track_no_location', too_old: 'track_too_old' }[tr.location_reason];
    info.innerHTML = `
      ${loc ? `<p class="small ${loc.state === 'stale' ? 'warn-text' : ''}">${icon(loc.state === 'stale' ? 'clock' : 'pin', { className: 'icon-inline' })} ${loc.state === 'stale' ? t('loc_stale', { ago: ago(loc.age_ms) }) : t('loc_live', { ago: ago(loc.age_ms) })}${tr.distance_m != null ? ` · ${t('courier_dist', { d: km(tr.distance_m) })}` : ''}</p>` : ''}
      ${!loc && reasonKey ? `<p class="small text-2">${t(reasonKey)}</p>` : ''}
      ${tr.courier ? `<div class="row courier-contact">${icon('scooter')}<span class="grow"><b class="cname"></b><br><span class="xs text-2">${t('your_courier')}</span></span>${tr.courier.phone ? `<a class="btn btn-secondary" href="tel:${tr.courier.phone.replace(/[^\d+]/g, '')}">${icon('phone', { className: 'icon-sm' })}${t('call')}</a>` : ''}</div>` : ''}
      ${loc ? `<p class="xs text-2">${t('loc_note')}</p>` : ''}`;
    if (tr.courier) info.querySelector('.cname').textContent = tr.courier.name;

    if (!ensureMap()) { el.querySelector('#track-map').hidden = true; return; }
    layers.clearLayers();
    const pts = [];
    if (tr.restaurant?.lat != null) { window.L.marker([tr.restaurant.lat, tr.restaurant.lon], { icon: dot('pin-restaurant', '🍽'), title: tr.restaurant.name }).addTo(layers); pts.push([tr.restaurant.lat, tr.restaurant.lon]); }
    if (tr.destination) { window.L.marker([tr.destination.lat, tr.destination.lon], { icon: dot('pin-home', '🏠') }).addTo(layers); pts.push([tr.destination.lat, tr.destination.lon]); }
    if (loc) {
      // Haqiqiy oxirgi nuqta; animatsiya yo'q. Eski nuqta xira ko'rsatiladi.
      window.L.marker([loc.lat, loc.lon], { icon: dot(`pin-courier ${loc.state === 'stale' ? 'is-stale' : ''}`, '🛵'), zIndexOffset: 1000 }).addTo(layers);
      pts.push([loc.lat, loc.lon]);
    }
    if (pts.length && !fitted) {
      if (pts.length === 1) map.setView(pts[0], 15, { animate: false });
      else map.fitBounds(pts, { padding: [36, 36], animate: false, maxZoom: 16 });
      fitted = !!loc; // kuryer paydo bo'lgach bir marta moslashtiramiz, keyin foydalanuvchi o'zi suradi
    }
    setTimeout(() => map.invalidateSize(), 0);
  }

  // ---------- Baholash va qayta buyurtma ----------
  function drawAfter(o) {
    const box = el.querySelector('#o-after');
    box.innerHTML = '';
    if (o.viewer_role !== 'customer') return;
    if (o.status === 'delivered') {
      const r = o.rating;
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `<div class="card-body stack" style="gap:var(--sp-2)">
        <h2 class="h3">${r ? t('rated_title') : t('rate_title')}</h2>
        <div class="row stars" role="radiogroup" aria-label="${t('rate_title')}">${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="star-btn" role="radio" data-n="${n}" aria-checked="${r?.stars === n}" aria-label="${n}">${icon('star')}</button>`).join('')}</div>
        <textarea class="textarea" rows="2" maxlength="500" placeholder="${t('rate_comment')}"></textarea>
        <button class="btn btn-primary" type="button" disabled>${r ? t('rate_update') : t('rate_send')}</button>
      </div>`;
      let stars = r?.stars || 0;
      const paint = () => card.querySelectorAll('.star-btn').forEach((b) => { b.classList.toggle('on', Number(b.dataset.n) <= stars); b.setAttribute('aria-checked', String(Number(b.dataset.n) === stars)); });
      const ta = card.querySelector('textarea');
      ta.value = r?.comment || '';
      const send = card.querySelector('.btn');
      paint();
      card.querySelectorAll('.star-btn').forEach((b) => b.addEventListener('click', () => { stars = Number(b.dataset.n); paint(); send.disabled = false; }));
      ta.addEventListener('input', () => { send.disabled = !stars; });
      send.addEventListener('click', async () => {
        setLoading(send, true);
        try {
          const { rating } = await post(`/orders/${o.id}/rating`, { stars, comment: ta.value.trim() || null });
          o.rating = rating;
          toast(t('rate_thanks'), { type: 'success' });
          drawAfter(o);
        } catch (e) { toast(errText(e), { type: 'error' }); setLoading(send, false); }
      });
      box.append(card);
    }
    if (['delivered', 'cancelled'].includes(o.status)) {
      const b = Object.assign(document.createElement('button'), { className: 'btn btn-secondary btn-block', type: 'button' });
      b.innerHTML = `${icon('refresh', { className: 'icon-sm' })}<span>${t('reorder')}</span>`;
      b.addEventListener('click', () => reorder(o, b));
      box.append(b);
    }
  }

  async function reorder(o, btn) {
    const addr = currentAddress();
    if (!addr) { toast(t('choose_address'), { type: 'error' }); go('addresses'); return; }
    setLoading(btn, true);
    try {
      const r = await post(`/orders/${o.id}/reorder`, { address_id: addr.id });
      const byId = new Map(r.products.map((p) => [p.id, p]));
      const ok = r.lines.filter((l) => l.status === 'ok' && byId.has(l.product_id));
      if (!ok.length) { toast(t('reorder_none'), { type: 'error', timeout: 5000 }); return; }
      const notes = [];
      const missing = r.lines.length - ok.length;
      if (missing) notes.push(t('reorder_missing', { n: missing }));
      if (ok.some((l) => l.price_changed)) notes.push(t('reorder_price_changed'));
      if (!r.restaurant.is_open) notes.push(t('reorder_closed'));
      if (!r.delivery?.deliverable && o.type === 'delivery') notes.push(t('reorder_not_deliverable'));
      const cur = cart.getCart();
      const replacing = cur.restaurantId != null && cart.count() > 0;
      if (notes.length || replacing) {
        const text = [...notes, replacing ? t('reorder_replace') : ''].filter(Boolean).join('\n');
        if (!(await confirmDialog({ title: t('reorder_q', { n: ok.length }), text, confirm: t('reorder_go'), cancel: t('cancel') }))) return;
      }
      cart.clearCart();
      const rest = { id: r.restaurant.id, name: r.restaurant.name };
      const nameOf = (p) => (getLang() === 'ru' && p.name_ru) || p.name_uz;
      for (const l of ok) {
        const p = byId.get(l.product_id);
        cart.setQty(rest, { id: p.id, name: nameOf(p), price: p.price, portion: p.portion, image_path: p.image_path, is_available: !!p.is_available }, l.qty, { force: true });
      }
      go('cart');
    } catch (e) {
      const reason = e instanceof ApiError ? e.details?.reason : null;
      toast(reason === 'restaurant_unavailable' ? t('reorder_restaurant_off') : errText(e), { type: 'error', timeout: 5000 });
    } finally {
      if (btn.isConnected) setLoading(btn, false);
    }
  }

  // ---------- Tafsilotlar (yig'iladigan) ----------
  function drawDetails(o) {
    const reached = new Map(o.events.filter((e) => e.to_status).map((e) => [e.to_status, e.created_at]));
    const steps = [...(o.status === 'pending_payment' || reached.has('pending_payment') ? ['pending_payment'] : []), ...STEPS[o.type]];
    const curIdx = steps.indexOf(o.status);
    const cancelled = o.status === 'cancelled';
    const cancelEvent = o.events.find((e) => e.to_status === 'cancelled');
    const box = el.querySelector('#o-details');
    box.innerHTML = `
      ${cancelled ? `<div class="alert alert-danger">${icon('info')}<span class="creason"></span></div>` : ''}
      ${o.payment_status === 'refund_requested' ? `<div class="alert alert-warning">${icon('alert')}<span>${t('refund_note')}</span></div>` : ''}
      ${cancelled ? '' : `<details class="card" ${ACTIVE.includes(o.status) && o.type === 'pickup' ? 'open' : ''}><summary class="card-body row"><span class="grow h3">${t('status_history')}</span>${icon('chevron')}</summary>
        <div class="card-body" style="padding-top:0"><ol class="steps">${steps.map((s, i) => `<li class="step ${i < curIdx ? 'done' : i === curIdx ? 'current' : ''}">
          <span class="step-dot">${i < curIdx ? icon('check', { className: 'icon-sm' }) : ''}</span>
          <span class="grow">${stepLabel(s, o.type)}</span><span class="xs text-2">${reached.has(s) ? time(reached.get(s)) : ''}</span></li>`).join('')}</ol></div></details>`}
      <details class="card"><summary class="card-body row"><span class="grow h3">${t('order_details')}</span><span class="price small">${formatSum(o.total)}</span>${icon('chevron')}</summary>
        <div class="card-body stack" style="padding-top:0">
          <div class="list">
            ${o.type === 'delivery' ? `<div class="list-item">${icon('pin')}<span class="grow small addr"></span></div>` : `<div class="list-item">${icon('store')}<span class="grow small paddr"></span></div>`}
            <div class="list-item">${icon('receipt')}<span class="grow small">${t('payment_status')}: ${t(`pay_${o.payment_method}`)} · ${t(`ps_${o.payment_status}`)}</span></div>
          </div>
          <div class="list">${o.items.map((it) => `<div class="list-item"><span class="grow"><span class="iname"></span> <span class="text-2">× ${it.qty}</span></span><span class="price">${formatSum(it.line_total)}</span></div>`).join('')}</div>
          <div>
            <div class="row sum-row"><span>${t('items_title')}</span><span>${formatSum(o.items_total)}</span></div>
            ${o.type === 'delivery' ? `<div class="row sum-row"><span>${t('delivery_fee', { sum: '' }).trim()}</span><span>${o.delivery_fee ? formatSum(o.delivery_fee) : t('delivery_free')}</span></div>` : ''}
            <div class="row sum-row total-row"><span>${t('total')}</span><span class="price">${formatSum(o.total)}</span></div>
          </div>
        </div></details>
      ${ACTIVE.includes(o.status) ? `<p class="xs text-2" style="text-align:center">${t('refreshing')}</p>` : ''}`;
    box.querySelectorAll('.iname').forEach((n, i) => { n.textContent = o.items[i].name; });
    if (box.querySelector('.addr')) box.querySelector('.addr').textContent = o.address_text || '';
    if (box.querySelector('.paddr')) box.querySelector('.paddr').textContent = `${t('pickup_from')}: ${o.restaurant.address_text || o.restaurant.name}`;
    if (cancelled) box.querySelector('.creason').textContent = `${t('step_cancelled')}${cancelEvent?.data?.reason ? `. ${t('cancel_reason', { reason: cancelEvent.data.reason === 'payment_timeout' ? t('expired_note') : cancelEvent.data.reason })}` : ''}`;
  }

  function drawActions(o) {
    const actions = el.querySelector('#actions');
    actions.innerHTML = '';
    const cancelled = o.status === 'cancelled';
    const canCancel = o.viewer_role === 'customer' && o.actions.includes('cancelled');
    if (canCancel) {
      const b = Object.assign(document.createElement('button'), { className: 'btn btn-danger btn-block', type: 'button', textContent: t('cancel_order') });
      b.addEventListener('click', async () => {
        if (!(await confirmDialog({ title: t('cancel_confirm'), confirm: t('cancel_order'), cancel: t('cancel'), danger: true }))) return;
        try {
          await post(`/orders/${o.id}/cancel`, {});
          toast(t('cancelled_ok'), { type: 'success' });
        } catch (err) {
          toast(errText(err), { type: 'error' });
        }
        load();
      });
      actions.append(b);
    } else if (!cancelled && o.status !== 'delivered') {
      actions.append(Object.assign(document.createElement('p'), { className: 'small text-2', textContent: t('cancel_later_hint') }));
    }
    if (!cancelled && o.status !== 'delivered' && o.restaurant.phone) {
      const a = Object.assign(document.createElement('a'), { className: 'btn btn-ghost btn-block', href: `tel:${o.restaurant.phone}` });
      a.innerHTML = `${icon('phone', { className: 'icon-sm' })}<span></span>`;
      a.querySelector('span').textContent = t('contact_restaurant');
      actions.append(a);
    }
  }

  function draw(o, tr) {
    drawHead(o, tr);
    drawPayment(o);
    drawTrack(o, tr);
    drawAfter(o);
    drawDetails(o);
    drawActions(o);
  }

  // --- To'lov bloki ---
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); toast(t('copied'), { type: 'success' }); } catch { toast(text); }
  }
  const alertBox = (kind, iconName, text) => {
    const a = document.createElement('div');
    a.className = kind ? `alert alert-${kind}` : 'alert';
    a.innerHTML = `${icon(iconName)}<span></span>`;
    a.querySelector('span').textContent = text;
    return a;
  };

  function drawPayment(o) {
    const box = el.querySelector('#payment');
    box.innerHTML = '';
    if (o.status === 'cancelled') {
      if (o.payment_method === 'card_transfer' && o.payment_claimed_at && o.events.some((e) => e.to_status === 'cancelled')) {
        const ev = o.events.find((e) => e.to_status === 'cancelled');
        if (ev?.data?.reason !== 'payment_timeout') box.append(alertBox('warning', 'alert', t('rejected_note')));
      }
      return;
    }
    if (o.payment_method === 'cash') {
      if (o.status !== 'delivered') box.append(alertBox('', 'receipt', o.type === 'pickup' ? `${t('cash_to_pay', { sum: formatSum(o.total) })}. ${t('cash_pickup_note')}` : t('cash_to_pay', { sum: formatSum(o.total) })));
      return;
    }
    // Kartaga o'tkazma — to'lov kutilmoqda: karta, egasi, aniq summa, nusxalash, "To'ladim".
    if (o.payment_method === 'card_transfer' && o.status === 'pending_payment' && o.payment_details) {
      const d = o.payment_details;
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `<div class="card-body stack transfer">
        <h2 class="h3">${t('transfer_title')}</h2>
        <div class="copy-row"><span class="grow"><span class="xs text-2">${t('card_number')}</span><span class="h3 mono card-no"></span></span><button class="btn btn-secondary small" data-copy="card">${icon('copy', { className: 'icon-sm' })}${t('copy')}</button></div>
        <div class="copy-row"><span class="grow"><span class="xs text-2">${t('card_holder')}</span><span class="holder"></span></span></div>
        <div class="copy-row"><span class="grow"><span class="xs text-2">${t('amount')}</span><span class="h3 price">${formatSum(d.amount)}</span></span><button class="btn btn-secondary small" data-copy="amount">${icon('copy', { className: 'icon-sm' })}${t('copy')}</button></div>
        <p class="small" style="color:var(--warning)">${t('transfer_deadline', { time: time(d.expires_at) })}</p>
        <button class="btn btn-primary btn-lg btn-block" id="i-paid">${t('i_paid')}</button>
      </div>`;
      card.querySelector('.card-no').textContent = d.card_number.replace(/(\d{4})(?=\d)/g, '$1 ');
      card.querySelector('.holder').textContent = d.card_holder;
      card.querySelector('[data-copy="card"]').addEventListener('click', () => copy(d.card_number));
      card.querySelector('[data-copy="amount"]').addEventListener('click', () => copy(String(d.amount)));
      card.querySelector('#i-paid').addEventListener('click', async (e) => {
        if (!(await confirmDialog({ title: t('i_paid_confirm'), text: t('i_paid_text'), confirm: t('i_paid'), cancel: t('cancel') }))) return;
        e.target.disabled = true;
        try {
          await post(`/orders/${o.id}/payment-claim`, {});
        } catch (err) {
          toast(errText(err), { type: 'error' });
        }
        load();
      });
      box.append(card);
      return;
    }
    if (o.payment_method === 'card_transfer' && o.payment_status === 'claimed') box.append(alertBox('warning', 'clock', t('transfer_checking')));
    if (o.payment_method !== 'cash' && o.payment_status === 'paid' && o.status !== 'delivered') box.append(alertBox('success', 'check', t('transfer_paid')));
    // Onlayn to'lov — Telegram invoice. "To'landi" holatini faqat server (Telegram xabari) belgilaydi.
    if (o.payment_method === 'online' && o.status === 'pending_payment') {
      box.append(alertBox('warning', 'clock', t('online_wait', { time: time(o.payment_expires_at) })));
      const b = Object.assign(document.createElement('button'), { className: 'btn btn-primary btn-lg btn-block', type: 'button', textContent: t('pay_now', { sum: formatSum(o.total) }) });
      b.addEventListener('click', async () => {
        const tg = window.Telegram?.WebApp;
        if (!tg?.initData || !tg.openInvoice) return toast(t('online_unavailable'), { type: 'error' });
        b.disabled = true;
        try {
          const { link } = await post(`/orders/${o.id}/invoice`, {});
          tg.openInvoice(link, (status) => {
            b.disabled = false;
            if (status === 'failed') toast(t('payment_failed'), { type: 'error' });
            setTimeout(load, status === 'paid' ? 1500 : 0); // natijani serverdan olamiz
          });
        } catch (err) {
          b.disabled = false;
          toast(errText(err), { type: 'error' });
        }
      });
      box.append(b);
    }
  }

  await load();
  return () => { clearTimeout(timer); map?.remove(); };
}
