// Savat sahifasi: miqdorlar, server tekshiruvi (narx, mavjudlik, restoran holati), jami.
// Buyurtmani rasmiylashtirish — 8-bosqich.
import { currentAddress } from '../state.js';
import { post, ApiError } from '../api.js';
import { t, formatSum } from '../i18n.js';
import { icon } from '../../ui/icons.js';
import { confirmDialog, toast } from '../../ui/components.js';
import { stateBlock } from './cards.js';
import * as cart from '../cart.js';

export function renderCart(el, _p, _m, { go }) {
  let checkSeq = 0;

  async function draw() {
    const c = cart.getCart();
    el.innerHTML = `<main class="page stack"><h1 class="h2">${t('cart')}</h1><div id="body" class="stack"></div></main>`;
    const body = el.querySelector('#body');
    if (!cart.count()) {
      body.append(stateBlock({ iconName: 'bag', title: t('cart_empty'), text: t('cart_empty_hint'), action: { label: t('to_restaurants'), onClick: () => go('') } }));
      return;
    }
    body.innerHTML = `
      <button class="list-item card" id="to-rest" type="button">${icon('store')}<span class="grow h3 rest-name"></span>${icon('chevron')}</button>
      <div class="list" id="items"></div>
      <div id="warnings" class="stack"></div>
      <div class="card"><div class="card-body" id="totals"><div class="skeleton skeleton-text"></div></div></div>
      <div class="alert">${icon('info')}<span>${t('checkout_soon')}</span></div>
      <button class="btn btn-ghost" id="clear">${icon('trash', { className: 'icon-sm' })}${t('clear_cart')}</button>`;
    body.querySelector('.rest-name').textContent = c.restaurantName;
    body.querySelector('#to-rest').addEventListener('click', () => go(`r/${c.restaurantId}`));
    body.querySelector('#clear').addEventListener('click', async () => {
      if (!(await confirmDialog({ title: t('clear_cart'), confirm: t('clear_cart'), cancel: t('cancel'), danger: true }))) return;
      cart.clearCart();
      toast(t('cart_cleared'));
      draw();
    });

    const items = body.querySelector('#items');
    for (const [pid, it] of Object.entries(c.items)) {
      const row = document.createElement('div');
      row.className = 'list-item cart-row';
      row.dataset.pid = pid;
      row.innerHTML = `<span class="grow"><span class="h3 title-2l name"></span><span class="small text-2">${formatSum(it.price)}</span><span class="xs line-note"></span></span>
        <span class="qty" role="group"><button class="btn" data-d="-1" aria-label="${t('qty_dec')}">${icon('minus', { className: 'icon-sm' })}</button><span class="qty-value">${it.qty}</span><button class="btn" data-d="1" aria-label="${t('qty_inc')}">${icon('plus', { className: 'icon-sm' })}</button></span>`;
      row.querySelector('.name').textContent = it.name;
      row.querySelectorAll('[data-d]').forEach((b) => b.addEventListener('click', () => {
        const cur = cart.getCart();
        cart.setQty({ id: cur.restaurantId, name: cur.restaurantName }, { id: Number(pid), name: it.name, price: it.price, portion: it.portion, is_available: true }, it.qty + Number(b.dataset.d));
        draw();
      }));
      items.append(row);
    }
    check();
  }

  // Server tekshiruvi: narx o'zgarishi, stop-list, o'chirilgan taom, restoran yopiq, manzilga yetkazmaydi, minimal summa.
  async function check() {
    const seq = ++checkSeq;
    const totals = el.querySelector('#totals');
    const warnings = el.querySelector('#warnings');
    try {
      const res = await post('/cart/check', { ...cart.cartPayload(), address_id: currentAddress().id });
      if (seq !== checkSeq) return;
      warnings.innerHTML = '';
      const warn = (text, kind = 'warning', action) => {
        const w = document.createElement('div');
        w.className = `alert alert-${kind}`;
        w.innerHTML = `${icon('alert')}<span></span>`;
        w.querySelector('span').textContent = text;
        if (action) {
          const b = Object.assign(document.createElement('button'), { className: 'btn btn-ghost', type: 'button', textContent: action.label });
          b.addEventListener('click', action.onClick);
          w.append(b);
        }
        warnings.append(w);
      };
      for (const line of res.lines) {
        const note = el.querySelector(`.cart-row[data-pid="${line.product_id}"] .line-note`);
        if (!note) continue;
        if (line.status === 'removed') { note.textContent = t('removed_item'); note.className = 'xs danger-text line-note'; }
        else if (line.status === 'unavailable') { note.textContent = t('out_of_stock'); note.className = 'xs danger-text line-note'; }
        if (line.status === 'ok' && line.price != null) note.parentElement.querySelector('.small').textContent = formatSum(line.price); // joriy narx
        if (line.price_changed && line.status === 'ok') { note.textContent = t('price_changed', { old: formatSum(line.old_price), new: formatSum(line.price) }); note.className = 'xs line-note'; note.style.color = 'var(--warning)'; }
      }
      const bad = res.lines.filter((l) => l.status !== 'ok').length;
      if (bad) warn(t('unavailable_in_cart', { n: bad }), 'danger', { label: t('remove_unavailable'), onClick: () => { cart.applyCheck(res, { removeUnavailable: true }); draw(); } });
      if (res.lines.some((l) => l.price_changed)) cart.applyCheck(res); // savatdagi narxlarni yangilaymiz
      if (!res.restaurant.is_open) warn(t('cannot_order_closed'), 'danger');
      if (!res.delivery.deliverable) warn(t('not_deliverable'));
      if (res.below_min_order) warn(t('below_min', { sum: formatSum(res.restaurant.min_order), left: formatSum(res.restaurant.min_order - res.items_total) }));
      totals.innerHTML = `
        <div class="row" style="justify-content:space-between"><span>${t('items_sum', { sum: '' }).replace(/:\s*$/, '')}</span><span class="price">${formatSum(res.items_total)}</span></div>
        ${res.delivery.deliverable ? `<div class="row small text-2" style="justify-content:space-between"><span>${t('delivery_fee', { sum: '' }).trim()}</span><span>${formatSum(res.delivery.delivery_fee)}</span></div>` : ''}`;
    } catch (err) {
      if (seq !== checkSeq) return;
      totals.textContent = err instanceof ApiError && err.message ? err.message : t('offline');
    }
  }

  draw();
}
