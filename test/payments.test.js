// 9-bosqich: naqd, kartaga o'tkazma ("To'ladim" → tekshiruv → tasdiq/rad, muddat), onlayn (Telegram Payments), qaytarish.
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setup, seed, call } from './helpers.js';
import { createBot } from '../src/bot/index.js';

const silent = { log() {}, warn() {}, error() {} };
const BOT_INFO = { id: 999000, is_bot: true, first_name: 'Taomkeldi', username: 'taomkeldi_test_bot', can_join_groups: true, can_read_all_group_messages: false, supports_inline_queries: false, can_connect_to_business: false, has_main_web_app: false };

let e; let ids; let addr; let keyN = 0;
async function env(extraEnv = {}) {
  e = await setup(extraEnv);
  ids = seed(e.services);
  e.db.prepare(`UPDATE restaurants SET lat = 40.12, lon = 67.84, delivery_radius_m = 8000, delivery_base = 8000, delivery_base_m = 2000,
    delivery_per_km = 2000, min_order = 0, pay_cash = 1, pay_card_transfer = 1, pay_online = 1, card_holder = 'TEST OWNER' WHERE id = ?`).run(ids.r1);
  addr = (await call(e.base, 301, 'POST', '/api/addresses', { text: 'Uy', lat: 40.1158, lon: 67.8422 })).body.address.id;
}
const place = async (payment_method, user = 301) => {
  const r = await call(e.base, user, 'POST', '/api/orders', {
    restaurant_id: ids.r1, type: 'delivery', address_id: addr, payment_method, items: [{ product_id: ids.p1, qty: 1 }],
    customer_name: 'Ali', customer_phone: '901234567', expected_total: 43000, idempotency_key: `pay-key-${++keyN}`,
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.order;
};
const claim = (id, user = 301) => call(e.base, user, 'POST', `/api/orders/${id}/payment-claim`);
const pay = (id, action, user, reason) => call(e.base, user, 'POST', `/api/panel/orders/${id}/payment`, { action, reason });
const status = (id, to, user, extra = {}) => call(e.base, user, 'POST', `/api/panel/orders/${id}/status`, { to, ...extra });

describe('Mavjud to\'lov usullari', () => {
  beforeEach(() => env());
  afterEach(() => e.close());

  test('token yo\'q — onlayn ko\'rsatilmaydi; karta faqat rekvizit bo\'lsa', async () => {
    const q = (await call(e.base, 301, 'POST', '/api/checkout/quote', { restaurant_id: ids.r1, address_id: addr, items: [{ product_id: ids.p1, qty: 1 }] })).body.quote;
    assert.deepEqual(q.payment_methods, ['cash', 'card_transfer']);
    e.db.prepare('UPDATE restaurants SET card_holder = NULL WHERE id = ?').run(ids.r1);
    const q2 = (await call(e.base, 301, 'POST', '/api/checkout/quote', { restaurant_id: ids.r1, address_id: addr, items: [{ product_id: ids.p1, qty: 1 }] })).body.quote;
    assert.deepEqual(q2.payment_methods, ['cash']);
  });

  test('to\'lov usullarini faqat egasi o\'zgartiradi; kartasiz karta o\'tkazmasi yoqilmaydi', async () => {
    const body = { cash: true, card_transfer: true, online: false };
    assert.equal((await call(e.base, 102, 'PUT', `/api/panel/restaurants/${ids.r1}/payment-methods`, body)).body.error.code, 'OWNER_ONLY');
    assert.equal((await call(e.base, 101, 'PUT', `/api/panel/restaurants/${ids.r1}/payment-methods`, body)).status, 200);
    e.db.prepare('UPDATE restaurants SET card_number = NULL WHERE id = ?').run(ids.r1);
    assert.equal((await call(e.base, 101, 'PUT', `/api/panel/restaurants/${ids.r1}/payment-methods`, body)).body.error.details.reason, 'card_missing');
  });
});

describe('Naqd', () => {
  beforeEach(() => env());
  afterEach(() => e.close());

  test('restoranga darhol new; kuryer qancha olishini ko\'radi; yetkazilganda to\'landi', async () => {
    const o = await place('cash');
    assert.equal(o.status, 'new');
    assert.equal(o.collect_amount, 43000);
    assert.equal(o.payment_details, undefined);
    for (const to of ['accepted', 'ready', 'on_way', 'delivered']) await status(o.id, to, 102);
    const done = (await call(e.base, 102, 'GET', `/api/orders/${o.id}`)).body.order;
    assert.equal(done.payment_status, 'paid');
    assert.equal(done.collect_amount, 0);
  });
});

describe('Kartaga o\'tkazma', () => {
  beforeEach(() => env());
  afterEach(() => e.close());

  test('pending_payment: karta, egasi, aniq summa faqat shu mijozga; restoranga hali bormagan', async () => {
    const o = await place('card_transfer');
    assert.equal(o.status, 'pending_payment');
    assert.deepEqual([o.payment_details.card_number, o.payment_details.card_holder, o.payment_details.amount], ['8600123456789012', 'TEST OWNER', 43000]);
    assert.equal((await call(e.base, 302, 'GET', `/api/orders/${o.id}`)).status, 404, 'begona mijoz ko\'rmaydi');
    const staffView = (await call(e.base, 102, 'GET', `/api/orders/${o.id}`)).body.order;
    assert.equal(staffView.payment_details, undefined);
    assert.equal(staffView.collect_amount, null, 'to\'lanmagan oldindan to\'lov — kuryer pul olmaydi');
  });

  test('"To\'ladim": claimed + new; takror bosish xato emas, holat o\'zgarmaydi', async () => {
    const o = await place('card_transfer');
    const a = await claim(o.id);
    assert.equal(a.body.order.status, 'new');
    assert.equal(a.body.order.payment_status, 'claimed');
    const b = await claim(o.id);
    assert.equal(b.status, 200);
    assert.equal(b.body.already, true);
    const ev = (await call(e.base, 301, 'GET', `/api/orders/${o.id}`)).body.order.events.filter((x) => x.type === 'payment_claimed');
    assert.equal(ev.length, 1);
  });

  test('soxta chaqiruvlar: begona mijoz, naqd buyurtma, xodim "To\'ladim" bosa olmaydi', async () => {
    const o = await place('card_transfer');
    assert.equal((await claim(o.id, 302)).status, 404);
    assert.equal((await claim(o.id, 102)).status, 403);
    const cash = await place('cash');
    assert.equal((await claim(cash.id)).body.error.details.reason, 'not_card_transfer');
  });

  test('tasdiqlanmagan o\'tkazma tayyorlashga qabul qilinmaydi; "To\'lov keldi" dan keyin — mumkin', async () => {
    const o = await place('card_transfer');
    await claim(o.id);
    assert.equal((await status(o.id, 'accepted', 102)).body.error.details.reason, 'payment_not_confirmed');
    assert.equal((await pay(o.id, 'confirm', 301)).status, 403, 'mijoz o\'zi tasdiqlay olmaydi');
    const ok = await pay(o.id, 'confirm', 102);
    assert.equal(ok.body.order.payment_status, 'paid');
    assert.equal(ok.body.order.collect_amount, 0, 'oldindan to\'langan — kuryer 0 so\'m oladi');
    assert.equal((await status(o.id, 'accepted', 102)).body.order.status, 'accepted');
  });

  test('pul kelmadi — sabab bilan rad; buyurtma bekor, to\'lov "to\'lanmagan"', async () => {
    const o = await place('card_transfer');
    await claim(o.id);
    assert.equal((await pay(o.id, 'reject', 102)).status, 400, 'sabab majburiy');
    const r = await pay(o.id, 'reject', 102, 'Tushum topilmadi');
    assert.equal(r.body.order.status, 'cancelled');
    assert.equal(r.body.order.payment_status, 'unpaid');
    assert.equal(r.body.order.cancel_reason, 'Tushum topilmadi');
  });

  test('30 daqiqa: "To\'ladim" bosilmaganlar bekor, bosilganlar qoladi; kech "To\'ladim" ishlamaydi', async () => {
    const a = await place('card_transfer');
    const b = await place('card_transfer');
    await claim(b.id);
    e.db.prepare('UPDATE orders SET created_at = created_at - 31 * 60000').run();
    assert.equal(e.services.payments.expirePending(), 1);
    const av = (await call(e.base, 301, 'GET', `/api/orders/${a.id}`)).body.order;
    assert.equal(av.status, 'cancelled');
    assert.equal(av.cancel_reason, 'payment_timeout');
    assert.equal((await call(e.base, 301, 'GET', `/api/orders/${b.id}`)).body.order.status, 'new');
    assert.equal((await claim(a.id)).body.error.details.reason, 'expired_or_cancelled');
  });

  test('qaytarish: bekor qilingan to\'langan buyurtma — so\'raldi; "qaytarildi"ni faqat ega/admin belgilaydi', async () => {
    const o = await place('card_transfer');
    await claim(o.id);
    await pay(o.id, 'confirm', 102);
    const c = await status(o.id, 'cancelled', 102, { reason: 'Yopildik' });
    assert.equal(c.body.order.payment_status, 'refund_requested');
    assert.equal((await pay(o.id, 'refunded', 102)).body.error.code, 'OWNER_ONLY');
    assert.equal((await pay(o.id, 'refunded', 101)).body.order.payment_status, 'refunded');
    assert.equal((await pay(o.id, 'refunded', 101)).body.error.code, 'INVALID_TRANSITION');
  });

  test('menejerga karta maskalangan, o\'zgartira olmaydi', async () => {
    const r = (await call(e.base, 102, 'GET', `/api/panel/restaurants/${ids.r1}`)).body.restaurant;
    assert.equal(r.card_number, '8600 **** **** 9012');
    assert.equal((await call(e.base, 102, 'PUT', `/api/panel/restaurants/${ids.r1}/payment`, { card_number: '8600000000000000', card_holder: 'X' })).status, 403);
  });
});

describe('Onlayn to\'lov (Telegram Payments)', () => {
  let bot; let calls; let upd = 1;
  const invoiceArgs = () => calls.find((c) => c.method === 'createInvoiceLink').payload;
  async function botEnv() {
    await env({ PAYMENT_PROVIDER_TOKEN: 'TEST:provider' });
    ({ bot } = createBot({ config: e.config, services: e.services, logger: silent, botInfo: BOT_INFO }));
    calls = [];
    bot.api.config.use(async (_p, method, payload) => {
      calls.push({ method, payload });
      if (method === 'createInvoiceLink') return { ok: true, result: 'https://t.me/$invoice-test' };
      if (method === 'sendMessage') return { ok: true, result: { message_id: 1, date: 0, chat: { id: payload.chat_id, type: 'private' }, text: payload.text } };
      return { ok: true, result: true };
    });
    e.services.setBotApi(bot.api);
  }
  const preCheckout = async (from, payload, amount, currency = 'UZS') => {
    calls.length = 0;
    await bot.handleUpdate({ update_id: upd++, pre_checkout_query: { id: 'pc1', from: { id: from, is_bot: false, first_name: 'X' }, currency, total_amount: amount, invoice_payload: payload } });
    return calls.find((c) => c.method === 'answerPreCheckoutQuery').payload;
  };
  const success = async (from, payload, amount, charge, currency = 'UZS') => {
    calls.length = 0;
    await bot.handleUpdate({ update_id: upd++, message: { message_id: upd, date: 0, chat: { id: from, type: 'private', first_name: 'X' }, from: { id: from, is_bot: false, first_name: 'X' },
      successful_payment: { currency, total_amount: amount, invoice_payload: payload, telegram_payment_charge_id: charge, provider_payment_charge_id: `p-${charge}` } } });
    return calls.filter((c) => c.method === 'sendMessage').map((c) => c.payload);
  };
  beforeEach(botEnv);
  afterEach(() => e.close());

  test('token va bot bo\'lsa onlayn usul paydo bo\'ladi; invoice summasi tiyinda', async () => {
    const o = await place('online');
    assert.equal(o.status, 'pending_payment');
    const inv = await call(e.base, 301, 'POST', `/api/orders/${o.id}/invoice`);
    assert.equal(inv.body.link, 'https://t.me/$invoice-test');
    const a = invoiceArgs();
    assert.equal(a.currency, 'UZS');
    assert.equal(a.provider_token, 'TEST:provider');
    assert.deepEqual(a.prices, [{ label: `Buyurtma #${o.id}`, amount: 4300000 }]);
    assert.match(a.payload, new RegExp(`^o:${o.id}:`));
    assert.equal((await call(e.base, 302, 'POST', `/api/orders/${o.id}/invoice`)).status, 404);
  });

  test('pre_checkout: summa, valyuta, egasi va holat tekshiriladi', async () => {
    const o = await place('online');
    await call(e.base, 301, 'POST', `/api/orders/${o.id}/invoice`);
    const payload = invoiceArgs().payload;
    assert.equal((await preCheckout(301, payload, 4300000)).ok, true);
    assert.equal((await preCheckout(301, payload, 100)).ok, false, 'summa mos emas');
    assert.equal((await preCheckout(301, payload, 4300000, 'USD')).ok, false, 'valyuta mos emas');
    assert.equal((await preCheckout(302, payload, 4300000)).ok, false, 'boshqa odam');
    assert.equal((await preCheckout(301, `o:${o.id}:wrongnonce1`, 4300000)).ok, false, 'soxta payload');
  });

  test('successful_payment: paid + new; takror xabar ikki marta hisoblanmaydi; API orqali "paid" qilib bo\'lmaydi', async () => {
    const o = await place('online');
    assert.equal((await pay(o.id, 'confirm', 102)).body.error.details.reason, 'not_card_transfer', 'xodim onlaynni qo\'lda "to\'landi" qila olmaydi');
    await call(e.base, 301, 'POST', `/api/orders/${o.id}/invoice`);
    const payload = invoiceArgs().payload;
    const msgs = await success(301, payload, 4300000, 'charge-1');
    assert.ok(msgs[0].text.includes('To‘lov qabul qilindi'));
    let v = (await call(e.base, 301, 'GET', `/api/orders/${o.id}`)).body.order;
    assert.deepEqual([v.status, v.payment_status], ['new', 'paid']);
    await success(301, payload, 4300000, 'charge-1');
    assert.equal(e.db.prepare('SELECT COUNT(*) AS n FROM payments WHERE order_id = ?').get(o.id).n, 1);
    v = (await call(e.base, 301, 'GET', `/api/orders/${o.id}`)).body.order;
    assert.equal(v.events.filter((x) => x.type === 'payment_online').length, 1);
  });

  test('summasi mos kelmagan to\'lov buyurtmani "paid" qilmaydi, adminga xabar', async () => {
    const o = await place('online');
    await call(e.base, 301, 'POST', `/api/orders/${o.id}/invoice`);
    const msgs = await success(301, invoiceArgs().payload, 100, 'charge-x');
    assert.ok(msgs.some((m) => m.chat_id === 900 && m.text.includes('mismatch')));
    const v = (await call(e.base, 301, 'GET', `/api/orders/${o.id}`)).body.order;
    assert.deepEqual([v.status, v.payment_status], ['pending_payment', 'unpaid']);
  });

  test('bekor qilingan buyurtmaga kech to\'lov — qaytarish so\'raladi, mijoz va adminga xabar', async () => {
    const o = await place('online');
    await call(e.base, 301, 'POST', `/api/orders/${o.id}/invoice`);
    const payload = invoiceArgs().payload;
    e.db.prepare('UPDATE orders SET created_at = created_at - 31 * 60000 WHERE id = ?').run(o.id);
    e.services.payments.expirePending();
    const msgs = await success(301, payload, 4300000, 'charge-late');
    assert.ok(msgs.some((m) => m.chat_id === 301 && m.text.includes('bekor qilingan')));
    assert.ok(msgs.some((m) => m.chat_id === 900));
    const v = (await call(e.base, 301, 'GET', `/api/orders/${o.id}`)).body.order;
    assert.deepEqual([v.status, v.payment_status], ['cancelled', 'refund_requested']);
  });
});
