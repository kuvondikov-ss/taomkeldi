// Buyurtma sahifasi: holat bosqichlari, to'lov holati, taomlar, summalar, bekor qilish yoki restoran bilan bog'lanish.
// Jonli kuzatuv (xarita, kuryer joylashuvi) — 15-bosqich. Hozircha holat har 15 soniyada yangilanadi.
import { get, post, ApiError } from '../api.js';
import { t, formatSum } from '../i18n.js';
import { icon } from '../../ui/icons.js';
import { confirmDialog, toast } from '../../ui/components.js';
import { stateBlock } from './cards.js';

const STEPS = {
  delivery: ['new', 'accepted', 'ready', 'on_way', 'delivered'],
  pickup: ['new', 'accepted', 'ready', 'delivered'],
};
const stepLabel = (s, type) => {
  if (s === 'ready') return t(type === 'pickup' ? 'step_ready_pickup' : 'step_ready_delivery');
  if (s === 'delivered' && type === 'pickup') return t('step_delivered_pickup');
  return t(`step_${s}`);
};
const time = (ms) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export async function renderOrder(el, _p, m, { go }) {
  const id = Number(m[1]);
  let timer;

  async function load() {
    try {
      const { order } = await get(`/orders/${id}`);
      draw(order);
      clearTimeout(timer);
      if (!['delivered', 'cancelled'].includes(order.status)) timer = setTimeout(load, 15000);
    } catch (err) {
      el.innerHTML = '<main class="page"></main>';
      el.firstChild.append(stateBlock({ iconName: 'receipt', error: true, title: err instanceof ApiError && err.message ? err.message : t('offline'), action: { label: t('retry'), onClick: load } }));
    }
  }

  function draw(o) {
    const reached = new Map(o.events.filter((e) => e.to_status).map((e) => [e.to_status, e.created_at]));
    const steps = [...(o.status === 'pending_payment' || reached.has('pending_payment') ? ['pending_payment'] : []), ...STEPS[o.type]];
    const curIdx = steps.indexOf(o.status);
    const cancelled = o.status === 'cancelled';
    const canCancel = o.viewer_role === 'customer' && o.actions.includes('cancelled');
    const cancelEvent = o.events.find((e) => e.to_status === 'cancelled');

    el.innerHTML = `
      <main class="page stack order">
        <div class="row" style="justify-content:space-between;align-items:flex-start">
          <div><h1 class="h2">${t('order_title', { id: o.id })}</h1><p class="small text-2 rname"></p></div>
          <span class="badge ${cancelled ? 'badge-danger' : o.status === 'delivered' ? 'badge-success' : 'badge-warning'}">${stepLabel(o.status, o.type)}</span>
        </div>
        <div id="payment" class="stack"></div>
        ${cancelled ? `<div class="alert alert-danger">${icon('info')}<span class="creason"></span></div>` : `
        <ol class="steps">${steps.map((s, i) => `<li class="step ${i < curIdx ? 'done' : i === curIdx ? 'current' : ''}">
          <span class="step-dot">${i < curIdx ? icon('check', { className: 'icon-sm' }) : ''}</span>
          <span class="grow">${stepLabel(s, o.type)}</span><span class="xs text-2">${reached.has(s) ? time(reached.get(s)) : ''}</span></li>`).join('')}</ol>`}
        ${o.prep_minutes && o.status === 'accepted' ? `<p class="small text-2">${t('prep_time', { n: o.prep_minutes })}</p>` : ''}
        ${o.payment_status === 'refund_requested' ? `<div class="alert alert-warning">${icon('alert')}<span>${t('refund_note')}</span></div>` : ''}
        <div class="list">
          ${o.type === 'delivery' ? `<div class="list-item">${icon('pin')}<span class="grow small addr"></span></div>` : `<div class="list-item">${icon('store')}<span class="grow small paddr"></span></div>`}
          <div class="list-item">${icon('receipt')}<span class="grow small">${t('payment_status')}: ${t(`pay_${o.payment_method}`)} · ${t(`ps_${o.payment_status}`)}</span></div>
        </div>
        <section class="stack"><h2 class="label">${t('items_title')}</h2>
          <div class="list">${o.items.map((it) => `<div class="list-item"><span class="grow"><span class="iname"></span> <span class="text-2">× ${it.qty}</span></span><span class="price">${formatSum(it.line_total)}</span></div>`).join('')}</div>
        </section>
        <div class="card"><div class="card-body">
          <div class="row sum-row"><span>${t('items_title')}</span><span>${formatSum(o.items_total)}</span></div>
          ${o.type === 'delivery' ? `<div class="row sum-row"><span>${t('delivery_fee', { sum: '' }).trim()}</span><span>${o.delivery_fee ? formatSum(o.delivery_fee) : t('delivery_free')}</span></div>` : ''}
          <div class="row sum-row total-row"><span>${t('total')}</span><span class="price">${formatSum(o.total)}</span></div>
        </div></div>
        <div id="actions" class="stack"></div>
        ${cancelled || o.status === 'delivered' ? '' : `<p class="xs text-2" style="text-align:center">${t('refreshing')}</p>`}
      </main>`;
    el.querySelector('.rname').textContent = o.restaurant.name;
    el.querySelectorAll('.iname').forEach((n, i) => { n.textContent = o.items[i].name; });
    if (el.querySelector('.addr')) el.querySelector('.addr').textContent = o.address_text || '';
    if (el.querySelector('.paddr')) el.querySelector('.paddr').textContent = `${t('pickup_from')}: ${o.restaurant.address_text || o.restaurant.name}`;
    if (cancelled) el.querySelector('.creason').textContent = `${t('step_cancelled')}${cancelEvent?.data?.reason ? `. ${t('cancel_reason', { reason: cancelEvent.data.reason })}` : ''}`;

    drawPayment(o);

    const actions = el.querySelector('#actions');
    if (canCancel) {
      const b = Object.assign(document.createElement('button'), { className: 'btn btn-danger btn-block', type: 'button', textContent: t('cancel_order') });
      b.addEventListener('click', async () => {
        if (!(await confirmDialog({ title: t('cancel_confirm'), confirm: t('cancel_order'), cancel: t('cancel'), danger: true }))) return;
        try {
          const { order } = await post(`/orders/${o.id}/cancel`, {});
          toast(t('cancelled_ok'), { type: 'success' });
          draw(order);
        } catch (err) {
          toast(err instanceof ApiError && err.message ? err.message : t('offline'), { type: 'error' });
          load(); // holat o'zgargan bo'lishi mumkin
        }
      });
      actions.append(b);
    } else if (!cancelled && o.status !== 'delivered') {
      const hint = Object.assign(document.createElement('p'), { className: 'small text-2', textContent: t('cancel_later_hint') });
      actions.append(hint);
      if (o.restaurant.phone) {
        const a = Object.assign(document.createElement('a'), { className: 'btn btn-secondary btn-block', href: `tel:${o.restaurant.phone}` });
        a.innerHTML = `${icon('phone', { className: 'icon-sm' })}<span></span>`;
        a.querySelector('span').textContent = t('contact_restaurant');
        actions.append(a);
      }
    }
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
    const cancelEvent = o.events.find((e) => e.to_status === 'cancelled');
    if (o.status === 'cancelled') {
      if (cancelEvent?.data?.reason === 'payment_timeout') box.append(alertBox('warning', 'clock', t('expired_note')));
      else if (o.payment_method === 'card_transfer' && o.events.some((e) => e.type === 'status' && e.to_status === 'cancelled') && o.payment_claimed_at) box.append(alertBox('warning', 'alert', t('rejected_note')));
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
          const { order } = await post(`/orders/${o.id}/payment-claim`, {});
          draw(order);
        } catch (err) {
          toast(err instanceof ApiError && err.message ? err.message : t('offline'), { type: 'error' });
          load();
        }
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
          toast(err instanceof ApiError && err.message ? err.message : t('offline'), { type: 'error' });
        }
      });
      box.append(b);
    }
  }

  el.innerHTML = '<main class="page stack"><div class="card"><div class="card-body"><div class="skeleton skeleton-title"></div><div class="skeleton skeleton-text"></div></div></div></main>';
  await load();
  return () => clearTimeout(timer);
}
