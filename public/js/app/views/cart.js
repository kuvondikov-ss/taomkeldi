// Savat: miqdorlar, server hisobi (checkout bilan bir xil quote), minimal summa, bepul yetkazishgacha qoldiq.
import { currentAddress } from '../state.js';
import { post, ApiError } from '../api.js';
import { t, formatSum } from '../i18n.js';
import { icon } from '../../ui/icons.js';
import { confirmDialog, toast } from '../../ui/components.js';
import { stateBlock } from './cards.js';
import * as cart from '../cart.js';

export function renderCart(el, _p, _m, { go }) {
  let seq = 0;

  function draw() {
    const c = cart.getCart();
    document.body.classList.remove('has-cart-bar');
    el.innerHTML = `<main class="page stack"><h1 class="h2">${t('cart')}</h1><div id="body" class="stack"></div></main>`;
    const body = el.querySelector('#body');
    if (!cart.count()) {
      body.append(stateBlock({ iconName: 'bag', title: t('cart_empty'), text: t('cart_empty_hint'), action: { label: t('to_restaurants'), onClick: () => go('') } }));
      return;
    }
    document.body.classList.add('has-cart-bar');
    body.innerHTML = `
      <button class="list-item card" id="to-rest" type="button">${icon('store')}<span class="grow h3 rest-name"></span>${icon('chevron')}</button>
      <div class="list" id="items"></div>
      <div id="warnings" class="stack"></div>
      <div class="card"><div class="card-body" id="totals"><div class="skeleton skeleton-text"></div></div></div>
      <button class="btn btn-ghost" id="clear">${icon('trash', { className: 'icon-sm' })}${t('clear_cart')}</button>`;
    el.insertAdjacentHTML('beforeend', `<div class="cta-bar"><button class="btn btn-primary btn-lg btn-block" id="to-checkout" disabled>${t('checkout')}</button></div>`);
    body.querySelector('.rest-name').textContent = c.restaurantName;
    body.querySelector('#to-rest').addEventListener('click', () => go(`r/${c.restaurantId}`));
    el.querySelector('#to-checkout').addEventListener('click', () => go('checkout'));
    body.querySelector('#clear').addEventListener('click', async () => {
      if (!(await confirmDialog({ title: t('clear_cart'), confirm: t('clear_cart'), cancel: t('cancel'), danger: true }))) return;
      cart.clearCart();
      toast(t('cart_cleared'));
      draw();
    });

    const items = body.querySelector('#items');
    for (const [key, it] of Object.entries(c.items)) {
      const row = document.createElement('div');
      row.className = 'list-item cart-row';
      row.dataset.key = key;
      row.innerHTML = `<span class="grow"><span class="h3 title-2l name"></span>${it.options_label ? '<span class="xs opt-label"></span>' : ''}<span class="small text-2 unit"></span><span class="xs line-note"></span></span>
        <span class="qty" role="group"><button class="btn" data-d="-1" aria-label="${t('qty_dec')}">${icon(it.qty === 1 ? 'trash' : 'minus', { className: 'icon-sm' })}</button><span class="qty-value">${it.qty}</span><button class="btn" data-d="1" aria-label="${t('qty_inc')}">${icon('plus', { className: 'icon-sm' })}</button></span>`;
      row.querySelector('.name').textContent = it.name;
      if (it.options_label) row.querySelector('.opt-label').textContent = `${t('mode_custom')}: ${it.options_label}`;
      row.querySelector('.unit').textContent = formatSum(it.price);
      row.querySelectorAll('[data-d]').forEach((b) => b.addEventListener('click', () => {
        const cur = cart.getCart();
        const product = { id: it.product_id ?? Number(String(key).split('~')[0]), name: it.name, price: it.price, portion: it.portion, image_path: it.image, is_available: true };
        cart.setQty({ id: cur.restaurantId, name: cur.restaurantName }, product, it.qty + Number(b.dataset.d), { key, options: it.options, optionsLabel: it.options_label });
        draw();
      }));
      items.append(row);
    }
    check();
  }

  async function check() {
    const mySeq = ++seq;
    const before = cart.getCart();
    try {
      const { quote: q } = await post('/checkout/quote', { ...cart.cartPayload(), type: 'delivery', address_id: currentAddress().id });
      if (mySeq !== seq) return;
      const warnings = el.querySelector('#warnings');
      warnings.innerHTML = '';
      for (const line of q.lines) {
        const lk = line.key ?? String(line.product_id);
        const row = [...el.querySelectorAll('.cart-row')].find((x) => x.dataset.key === lk);
        if (!row) continue;
        const note = row.querySelector('.line-note');
        const oldPrice = before.items[lk]?.price;
        if (line.status === 'removed') { note.textContent = t('removed_item'); note.className = 'xs danger-text line-note'; continue; }
        if (line.status === 'options_changed') { note.textContent = t('options_changed_item'); note.className = 'xs danger-text line-note'; continue; }
        row.querySelector('.unit').textContent = formatSum(line.price);
        if (line.status === 'unavailable') { note.textContent = t('out_of_stock'); note.className = 'xs danger-text line-note'; }
        else if (oldPrice != null && oldPrice !== line.price) { note.textContent = t('price_changed', { old: formatSum(oldPrice), new: formatSum(line.price) }); note.className = 'xs line-note warn-text'; }
      }
      cart.applyCheck(q); // savatdagi narxlarni yangilaymiz, o'chirilganlarni olib tashlaymiz
      const bad = q.lines.filter((l) => l.status !== 'ok').length;
      if (bad) {
        const w = document.createElement('div');
        w.className = 'alert alert-danger';
        w.innerHTML = `${icon('alert')}<span></span><button class="btn btn-ghost" type="button">${t('remove_unavailable')}</button>`;
        w.querySelector('span').textContent = t('unavailable_in_cart', { n: bad });
        w.querySelector('button').addEventListener('click', () => { cart.applyCheck(q, { removeUnavailable: true }); draw(); });
        warnings.append(w);
      }
      for (const p of q.problems.filter((x) => !['product_unavailable', 'product_removed'].includes(x))) {
        const w = document.createElement('div');
        w.className = `alert ${p === 'below_min_order' ? 'alert-warning' : 'alert-danger'}`;
        w.innerHTML = `${icon('alert')}<span></span>`;
        w.querySelector('span').textContent = p === 'below_min_order'
          ? t('below_min', { sum: formatSum(q.restaurant.min_order), left: formatSum(q.restaurant.min_order - q.items_total) })
          : t(`problem_${p}`);
        warnings.append(w);
      }
      // Yetkazib bo'lmasa narx noma'lum ("—"), hech qachon "0 so'm" emas. Bepul — faqat server now_free desa.
      const fd = q.free_delivery;
      const fee = q.delivery_fee == null ? '—' : fd.now_free ? `<span class="free-text">${t('fee_zero_free')}</span>` : formatSum(q.delivery_fee);
      el.querySelector('#totals').innerHTML = `
        <div class="row sum-row"><span>${t('items_title')}</span><span>${formatSum(q.items_total)}</span></div>
        <div class="row sum-row"><span>${t('delivery_fee', { sum: '' }).trim()}</span><span>${fee}</span></div>
        ${fd.kind === 'threshold' ? `<p class="xs free-text">${fd.applied ? t('free_applied') : t('free_left', { sum: formatSum(fd.left) })}</p>` : ''}
        <div class="row sum-row total-row"><span>${t('total')}</span><span class="price">${q.total == null ? '—' : formatSum(q.total)}</span></div>`;
      // Rasmiylashtirishga o'tish: taomlar va restoran holati joyida bo'lsa (olib ketishda radius muhim emas).
      const blocking = q.problems.filter((p) => !(p === 'not_deliverable' && q.restaurant.pickup_enabled));
      el.querySelector('#to-checkout').disabled = blocking.length > 0;
    } catch (err) {
      if (mySeq !== seq) return;
      el.querySelector('#totals').textContent = err instanceof ApiError && err.message ? err.message : t('offline');
    }
  }

  draw();
  return () => document.body.classList.remove('has-cart-bar');
}
