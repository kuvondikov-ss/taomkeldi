// Restoran paneli — buyurtmalar: guruhlar, keyingi amal, kuryer biriktirish, tafsilotlar, yangi buyurtma ovozi.
import { get, post, ApiError } from '../api.js';
import { t, formatSum } from '../i18n.js';
import { icon } from '../../ui/icons.js';
import { toast, promptDialog, openSheet } from '../../ui/components.js';
import { stateBlock } from './cards.js';

const GROUPS = ['new', 'preparing', 'ready', 'on_way', 'done'];
const errText = (e) => (e instanceof ApiError && e.message ? e.message : t('offline'));
const time = (ms) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const SOUND_KEY = 'panelSound';

// Yangi buyurtma signali — WebAudio (fayl kerak emas). Foydalanuvchi o'zi yoqadi/o'chiradi.
function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.25].forEach((delay) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.2, ctx.currentTime + delay);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.2);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + delay);
      o.stop(ctx.currentTime + delay + 0.2);
    });
  } catch { /* ovoz qurilmada mavjud emas */ }
}

export async function renderPanelOrders(el, params, rid, { go }) {
  const group = GROUPS.includes(params.get('g')) ? params.get('g') : 'new';
  let couriers = [];
  let known = null; // yangi buyurtmalarni aniqlash uchun ko'rilgan ID'lar
  let timer;
  el.innerHTML = `
    <div class="row" style="justify-content:space-between">
      <div class="tabs" role="tablist" id="groups" style="flex:1;margin-right:0"></div>
      <button class="btn btn-icon btn-ghost" id="sound" aria-pressed="${localStorage.getItem(SOUND_KEY) === '1'}"></button>
    </div>
    <div id="list" class="stack"><div class="skeleton skeleton-text"></div></div>
    <section class="sheet" id="order-sheet" hidden></section>`;
  const soundBtn = el.querySelector('#sound');
  const drawSound = () => {
    const on = localStorage.getItem(SOUND_KEY) === '1';
    soundBtn.innerHTML = icon(on ? 'bell' : 'bellOff');
    soundBtn.setAttribute('aria-label', t(on ? 'sound_on' : 'sound_off'));
    soundBtn.setAttribute('aria-pressed', String(on));
  };
  drawSound();
  soundBtn.addEventListener('click', () => {
    localStorage.setItem(SOUND_KEY, localStorage.getItem(SOUND_KEY) === '1' ? '0' : '1');
    drawSound();
    toast(t(localStorage.getItem(SOUND_KEY) === '1' ? 'sound_on' : 'sound_off'));
    if (localStorage.getItem(SOUND_KEY) === '1') beep();
  });

  async function act(fn, card) {
    card?.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    try {
      await fn();
    } catch (e) {
      toast(e instanceof ApiError && e.code === 'INVALID_TRANSITION' ? t('state_changed') : errText(e), { type: 'error' });
    }
    load();
  }
  const status = (id, to, extra = {}) => post(`/panel/orders/${id}/status`, { to, ...extra });
  const withReason = async (fn) => {
    const reason = await promptDialog({ title: t('reason_title'), confirm: t('save'), cancel: t('cancel'), minLength: 3, danger: true });
    if (reason != null) await fn(reason);
  };

  function actions(o, card) {
    const box = card.querySelector('.order-actions');
    const add = (label, cls, fn) => {
      const b = Object.assign(document.createElement('button'), { className: `btn ${cls}`, type: 'button', textContent: label });
      b.addEventListener('click', () => act(fn, card));
      box.append(b);
    };
    const prepaid = o.payment_method !== 'cash';
    const awaitingPayment = prepaid && o.payment_status !== 'paid';
    if (['pending_payment', 'new'].includes(o.status) && o.payment_method === 'card_transfer' && awaitingPayment) {
      add(t('act_pay_ok'), 'btn-primary', () => post(`/panel/orders/${o.id}/payment`, { action: 'confirm' }));
      add(t('act_pay_no'), 'btn-danger', () => withReason((reason) => post(`/panel/orders/${o.id}/payment`, { action: 'reject', reason })));
      return;
    }
    if (o.status === 'new') {
      for (const n of [15, 30, 45]) add(t('accept_in', { n }), 'btn-primary', () => status(o.id, 'accepted', { prep_minutes: n }));
      add(t('act_reject'), 'btn-danger', () => withReason((reason) => status(o.id, 'cancelled', { reason })));
      return;
    }
    if (o.status === 'accepted') add(t('act_ready'), 'btn-primary', () => status(o.id, 'ready'));
    if (o.status === 'ready' && o.type === 'pickup') add(t('act_handed'), 'btn-primary', () => status(o.id, 'delivered'));
    if (o.status === 'ready' && o.type === 'delivery') add(t('act_on_way'), 'btn-primary', () => status(o.id, 'on_way'));
    if (o.status === 'on_way') add(t('act_delivered'), 'btn-primary', () => status(o.id, 'delivered'));
    if (['accepted', 'ready'].includes(o.status)) add(t('act_cancel'), 'btn-ghost', () => withReason((reason) => status(o.id, 'cancelled', { reason })));
    // O'z kuryerini biriktirish / almashtirish.
    if (o.type === 'delivery' && ['accepted', 'ready'].includes(o.status)) {
      const sel = document.createElement('select');
      sel.className = 'select courier-select';
      sel.setAttribute('aria-label', t('courier_label'));
      const linked = couriers.filter((c) => c.linked);
      sel.innerHTML = `<option value="">${linked.length ? t('choose_courier') : t('no_couriers_online')}</option>${linked.map((c) => `<option value="${c.id}" ${o.courier_id === c.id ? 'selected' : ''}>${c.is_online ? '● ' : ''}${c.name}</option>`).join('')}`;
      sel.addEventListener('change', () => act(() => post(`/panel/orders/${o.id}/courier`, { courier_id: sel.value ? Number(sel.value) : null }), card));
      box.prepend(sel);
    }
  }

  async function details(id) {
    const sheet = el.querySelector('#order-sheet');
    try {
      const { order: o } = await get(`/orders/${id}`);
      sheet.innerHTML = `<div class="sheet-handle"></div><div class="sheet-header"><h2 class="h2">#${o.id}</h2><button class="btn btn-icon btn-ghost" data-sheet-close aria-label="${t('cancel')}">${icon('close')}</button></div>
        <div class="stack">
          <div class="list">
            <div class="list-item">${icon('user')}<span class="grow"><span class="h3 cn"></span><span class="small text-2">${o.customer_phone || ''}</span></span>${o.customer_phone ? `<a class="btn btn-secondary small" href="tel:${o.customer_phone}">${icon('phone', { className: 'icon-sm' })}${t('call')}</a>` : ''}</div>
            ${o.type === 'delivery' ? `<div class="list-item">${icon('pin')}<span class="grow small addr"></span></div>` : ''}
            ${o.comment ? `<div class="list-item">${icon('edit')}<span class="grow small cm"></span></div>` : ''}
          </div>
          <h3 class="label">${t('history')}</h3>
          <ul class="list history">${o.events.map((ev) => `<li class="list-item small"><span class="text-2">${time(ev.created_at)}</span><span class="grow">${ev.to_status ? t(`status_${ev.to_status}`) : ev.type}${ev.data?.reason ? ` — ${ev.data.reason}` : ''}</span><span class="xs text-2">${ev.actor_role || ''}</span></li>`).join('')}</ul>
        </div>`;
      sheet.querySelector('.cn').textContent = o.customer_name || '';
      if (sheet.querySelector('.addr')) {
        const d = o.address_details || {};
        sheet.querySelector('.addr').textContent = [o.address_text, d.entrance && `${t('f_entrance')} ${d.entrance}`, d.floor && `${t('f_floor')} ${d.floor}`, d.apartment && `${t('f_apartment')} ${d.apartment}`, d.comment].filter(Boolean).join(', ');
      }
      if (sheet.querySelector('.cm')) sheet.querySelector('.cm').textContent = o.comment;
      openSheet(sheet);
    } catch (e) { toast(errText(e), { type: 'error' }); }
  }

  async function load() {
    clearTimeout(timer);
    try {
      const [board, cs] = await Promise.all([get(`/panel/restaurants/${rid}/board?group=${group}`), get(`/panel/restaurants/${rid}/couriers`)]);
      couriers = cs.couriers;
      // Yangi buyurtma signali
      if (group === 'new') {
        const ids = new Set(board.orders.map((o) => o.id));
        if (known && [...ids].some((id) => !known.has(id))) {
          toast(t('new_order_toast'), { type: 'success' });
          if (localStorage.getItem(SOUND_KEY) === '1') beep();
        }
        known = ids;
      }
      el.querySelector('#groups').innerHTML = GROUPS.map((g) => `<button class="tab" role="tab" data-g="${g}" aria-selected="${g === group}">${t(`g_${g}`)}${board.counts[g] ? ` <span class="count-badge">${board.counts[g]}</span>` : ''}</button>`).join('');
      el.querySelectorAll('[data-g]').forEach((b) => b.addEventListener('click', () => go(`panel/${rid}/orders?g=${b.dataset.g}`, { replace: true })));
      const list = el.querySelector('#list');
      list.innerHTML = '';
      if (!board.orders.length) list.append(stateBlock({ iconName: 'receipt', title: t('empty_group') }));
      for (const o of board.orders) {
        const card = document.createElement('article');
        card.className = 'card order-card';
        const payBadge = o.payment_status === 'paid' ? 'badge-success' : o.payment_status === 'claimed' ? 'badge-warning' : '';
        card.innerHTML = `<div class="card-body stack" style="gap:var(--sp-2)">
          <div class="row" style="justify-content:space-between;align-items:flex-start">
            <span class="h3">#${o.id} · ${time(o.created_at)}</span>
            <span class="row" style="gap:4px;flex-wrap:wrap;justify-content:flex-end"><span class="badge">${t(`type_label_${o.type}`)}</span><span class="badge ${payBadge}">${t(`pay_${o.payment_method}`)} · ${t(`ps_${o.payment_status}`)}</span></span>
          </div>
          <p class="small items"></p>
          <div class="row" style="justify-content:space-between"><span class="small text-2 cust"></span><span class="price">${formatSum(o.total)}</span></div>
          ${o.prep_minutes && o.status === 'accepted' ? `<p class="xs text-2">${t('prep_time', { n: o.prep_minutes })}</p>` : ''}
          ${o.courier_name ? `<p class="xs">${icon('scooter', { className: 'icon-inline' })} ${o.courier_name}</p>` : ''}
          ${o.status === 'cancelled' && o.cancel_reason ? '<p class="xs danger-text reason"></p>' : ''}
          ${o.comment ? '<p class="xs warn-text cm"></p>' : ''}
          <div class="order-actions row"></div>
          <button class="btn btn-ghost small details" type="button">${t('details')}</button>
        </div>`;
        card.querySelector('.items').textContent = o.items.map((i) => `${i.name} × ${i.qty}`).join(', ');
        card.querySelector('.cust').textContent = o.customer_name || '';
        if (card.querySelector('.reason')) card.querySelector('.reason').textContent = o.cancel_reason;
        if (card.querySelector('.cm')) card.querySelector('.cm').textContent = `${t('comment_label')}: ${o.comment}`;
        card.querySelector('.details').addEventListener('click', () => details(o.id));
        if (group !== 'done') actions(o, card);
        list.append(card);
      }
    } catch (e) {
      el.querySelector('#list').innerHTML = '';
      el.querySelector('#list').append(stateBlock({ iconName: 'wifiOff', error: true, title: errText(e) }));
    }
    timer = setTimeout(load, 15000);
  }
  await load();
  return () => clearTimeout(timer);
}
