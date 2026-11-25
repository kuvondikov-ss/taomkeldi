// Checkout: turi → manzil → qabul qiluvchi → to'lov → izoh → summalar → bitta tasdiqlash tugmasi.
// Summalarni server hisoblaydi (POST /checkout/quote); buyurtma shu hisob bilan yaratiladi (POST /orders).
import { state, currentAddress } from '../state.js';
import { post, ApiError } from '../api.js';
import { t, formatSum } from '../i18n.js';
import { icon } from '../../ui/icons.js';
import { toast, setLoading } from '../../ui/components.js';
import { stateBlock } from './cards.js';
import * as cart from '../cart.js';

const PHONE_RE = /^(?:\+?998)?\d{9}$/;
const normPhone = (s) => String(s || '').replace(/[\s()-]/g, '');

// Takror bosish / tarmoq qayta urinishi dublikat yaratmasligi uchun: savat tarkibiga bog'langan kalit.
function idempotencyKey(snapshot) {
  const saved = JSON.parse(sessionStorage.getItem('checkoutKey') || 'null');
  if (saved && saved.snapshot === snapshot) return saved.key;
  const key = crypto.randomUUID();
  sessionStorage.setItem('checkoutKey', JSON.stringify({ key, snapshot }));
  return key;
}

export function renderCheckout(el, _p, _m, { go }) {
  if (!cart.count()) return go('cart', { replace: true });
  const user = state.me.user;
  const ui = {
    type: sessionStorage.getItem('checkoutType') || 'delivery',
    payment: null,
    editContact: !(user.contact_name && user.phone),
    quote: null,
  };

  el.innerHTML = `
    <main class="page stack checkout">
      <h1 class="h2">${t('checkout_title')}</h1>
      <div class="row type-switch" id="type" role="radiogroup"></div>
      <section class="stack" id="where"></section>
      <section class="stack">
        <h2 class="label">${t('recipient')}</h2>
        <div id="contact"></div>
      </section>
      <section class="stack">
        <h2 class="label">${t('payment')}</h2>
        <div class="list" id="payments" role="radiogroup"></div>
      </section>
      <details class="comment-box"><summary class="list-item">${icon('edit')}<span class="grow">${t('add_comment')}</span>${icon('chevron')}</summary>
        <textarea class="textarea" id="comment" maxlength="500" placeholder="${t('comment_ph')}"></textarea>
      </details>
      <div id="problems" class="stack"></div>
      <div class="card"><div class="card-body" id="summary"><div class="skeleton skeleton-text"></div></div></div>
    </main>
    <div class="cta-bar"><button class="btn btn-primary btn-lg btn-block" id="submit" disabled>${t('loading')}</button></div>`;
  document.body.classList.add('has-cart-bar');
  const $ = (s) => el.querySelector(s);

  function drawContact() {
    const box = $('#contact');
    if (!ui.editContact) {
      box.innerHTML = `<div class="list"><div class="list-item">${icon('user')}<span class="grow"><span class="h3 cname"></span><span class="small text-2 cphone"></span></span>
        <button class="btn btn-ghost small" type="button" id="edit-contact">${t('change')}</button></div></div>`;
      box.querySelector('.cname').textContent = user.contact_name;
      box.querySelector('.cphone').textContent = user.phone;
      box.querySelector('#edit-contact').addEventListener('click', () => { ui.editContact = true; drawContact(); });
      return;
    }
    box.innerHTML = `
      <div class="stack" style="gap:var(--sp-2)">
        <div class="field"><label class="label" for="c-name">${t('f_name')}</label>
          <input class="input" id="c-name" autocomplete="name" maxlength="60"><span class="error-text" id="c-name-err" hidden>${t('name_invalid')}</span></div>
        <div class="field"><label class="label" for="c-phone">${t('f_phone')}</label>
          <input class="input" id="c-phone" type="tel" inputmode="tel" autocomplete="tel" maxlength="20" placeholder="${t('f_phone_ph')}"><span class="error-text" id="c-phone-err" hidden>${t('phone_invalid')}</span></div>
      </div>`;
    box.querySelector('#c-name').value = user.contact_name || [user.first_name, user.last_name].filter(Boolean).join(' ');
    box.querySelector('#c-phone').value = user.phone || '';
  }

  function drawWhere(q) {
    const where = $('#where');
    const types = $('#type');
    const pickup = q?.restaurant.pickup_enabled;
    types.hidden = !pickup;
    types.innerHTML = ['delivery', 'pickup'].map((k) => `<button class="chip grow" role="radio" type="button" data-type="${k}" aria-checked="${ui.type === k}" aria-pressed="${ui.type === k}">${t(`type_${k}`)}</button>`).join('');
    if (ui.type === 'delivery') {
      const a = currentAddress();
      where.innerHTML = `<h2 class="label">${t('deliver_to')}</h2><div class="list"><button class="list-item" type="button" id="change-addr">${icon('pin')}<span class="grow"><span class="h3 alabel"></span><span class="small text-2 atext"></span></span><span class="small" style="color:var(--primary)">${t('change')}</span></button></div>`;
      where.querySelector('.alabel').textContent = a.label || t('deliver_to');
      where.querySelector('.atext').textContent = [a.text, a.entrance && `${t('f_entrance')} ${a.entrance}`, a.floor && `${t('f_floor')} ${a.floor}`, a.apartment && `${t('f_apartment')} ${a.apartment}`].filter(Boolean).join(', ');
      where.querySelector('#change-addr').addEventListener('click', () => go('addresses?choose=1&back=checkout'));
    } else {
      where.innerHTML = `<h2 class="label">${t('pickup_from')}</h2><div class="list"><div class="list-item">${icon('store')}<span class="grow"><span class="h3 rname"></span><span class="small text-2 raddr"></span></span></div></div>`;
      where.querySelector('.rname').textContent = q.restaurant.name;
      where.querySelector('.raddr').textContent = q.restaurant.address_text || '';
    }
  }

  function drawPayments(q) {
    const box = $('#payments');
    if (!ui.payment || !q.payment_methods.includes(ui.payment)) ui.payment = q.payment_methods[0] || null;
    box.innerHTML = q.payment_methods.map((m) => `
      <label class="list-item pay-option">
        <input type="radio" name="pay" value="${m}" ${ui.payment === m ? 'checked' : ''}>
        <span class="grow"><span class="h3">${t(`pay_${m}`)}</span><span class="small text-2">${{
          cash: t(ui.type === 'pickup' ? 'pay_cash_hint_pickup' : 'pay_cash_hint_delivery'),
          card_transfer: t('pay_card_hint'),
          online: t('pay_online_hint'),
        }[m]}</span></span>
      </label>`).join('');
    box.querySelectorAll('input[name="pay"]').forEach((r) => r.addEventListener('change', () => { ui.payment = r.value; }));
  }

  function drawSummary(q) {
    const n = q.lines.reduce((s, l) => s + (l.status === 'ok' ? l.qty : 0), 0);
    const fd = q.free_delivery;
    const fee = q.type === 'pickup' ? null : q.delivery_fee == null ? '—' : (fd.now_free ? `<span class="free-text">${t('fee_zero_free')}</span>` : formatSum(q.delivery_fee));
    $('#summary').innerHTML = `
      <div class="row sum-row"><span>${t('items_title')} · ${t('cart_items', { n })}</span><span>${formatSum(q.items_total)}</span></div>
      ${fee ? `<div class="row sum-row"><span>${t('delivery_fee', { sum: '' }).trim()}</span><span>${fee}</span></div>` : ''}
      ${fd.kind === 'threshold' && !fd.applied ? `<p class="xs free-text">${t('free_left', { sum: formatSum(fd.left) })}</p>` : ''}
      <div class="row sum-row total-row"><span>${t('total')}</span><span class="price">${q.total == null ? '—' : formatSum(q.total)}</span></div>`;
    const problems = $('#problems');
    problems.innerHTML = '';
    for (const p of q.problems) {
      const a = document.createElement('div');
      a.className = 'alert alert-danger';
      a.innerHTML = `${icon('alert')}<span></span>`;
      a.querySelector('span').textContent = t(`problem_${p}`);
      problems.append(a);
    }
    if (q.problems.length) {
      const b = Object.assign(document.createElement('button'), { className: 'btn btn-secondary', type: 'button', textContent: t('back_to_cart') });
      b.addEventListener('click', () => go('cart'));
      problems.append(b);
    }
    const submit = $('#submit');
    submit.disabled = !q.can_order;
    submit.textContent = t('place_order', { sum: formatSum(q.total) });
  }

  async function loadQuote() {
    const submit = $('#submit');
    submit.disabled = true;
    try {
      const { quote } = await post('/checkout/quote', { ...cart.cartPayload(), type: ui.type, address_id: currentAddress()?.id });
      ui.quote = quote;
      drawWhere(quote);
      drawPayments(quote);
      drawSummary(quote);
    } catch (err) {
      $('#summary').innerHTML = '';
      $('#summary').append(stateBlock({ iconName: 'wifiOff', error: true, title: err instanceof ApiError && err.message ? err.message : t('offline'), action: { label: t('retry'), onClick: loadQuote } }));
    }
  }

  $('#type').addEventListener('click', (e) => {
    const b = e.target.closest('[data-type]');
    if (!b || b.dataset.type === ui.type) return;
    ui.type = b.dataset.type;
    sessionStorage.setItem('checkoutType', ui.type);
    loadQuote();
  });

  $('#submit').addEventListener('click', async () => {
    const q = ui.quote;
    if (!q?.can_order) return;
    // Kontakt: saqlangan yoki formadan.
    let name = user.contact_name;
    let phone = user.phone;
    if (ui.editContact) {
      name = $('#c-name').value.trim();
      phone = normPhone($('#c-phone').value);
      $('#c-name-err').hidden = name.length >= 2;
      $('#c-phone-err').hidden = PHONE_RE.test(phone);
      $('#c-name').setAttribute('aria-invalid', String(name.length < 2));
      $('#c-phone').setAttribute('aria-invalid', String(!PHONE_RE.test(phone)));
      if (name.length < 2) return $('#c-name').focus();
      if (!PHONE_RE.test(phone)) return $('#c-phone').focus();
    }
    const payload = cart.cartPayload();
    const snapshot = JSON.stringify([payload, ui.type, currentAddress()?.id]);
    const btn = $('#submit');
    setLoading(btn, true);
    try {
      const { order } = await post('/orders', {
        ...payload,
        type: ui.type,
        address_id: ui.type === 'delivery' ? currentAddress().id : undefined,
        payment_method: ui.payment,
        customer_name: name,
        customer_phone: phone,
        comment: $('#comment').value.trim() || undefined,
        expected_total: q.total,
        idempotency_key: idempotencyKey(snapshot),
      });
      sessionStorage.removeItem('checkoutKey');
      Object.assign(user, { contact_name: name, phone: order.customer_phone });
      cart.clearCart();
      toast(t('order_placed'), { type: 'success' });
      go(`order/${order.id}`, { replace: true });
    } catch (err) {
      setLoading(btn, false);
      if (err instanceof ApiError && err.code === 'PRICE_CHANGED') {
        toast(t('price_changed_confirm'), { type: 'error', timeout: 5000 });
        await loadQuote();
        return;
      }
      if (err instanceof ApiError && err.code === 'CANNOT_ORDER') return loadQuote();
      toast(err instanceof ApiError && err.message ? err.message : t('offline'), { type: 'error' });
    }
  });

  drawContact();
  loadQuote();
  return () => document.body.classList.remove('has-cart-bar');
}
