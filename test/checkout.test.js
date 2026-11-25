// 8-bosqich: quote va buyurtma (bitta hisob), idempotency, holat o'tishlari, bekor qilish.
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setup, seed, call } from './helpers.js';

const CITY = { lat: 40.1158, lon: 67.8422 };
let e; let ids; let addr; let p;

async function env() {
  e = await setup();
  ids = seed(e.services);
  const { db, services } = e;
  db.prepare(`UPDATE restaurants SET lat = 40.12, lon = 67.84, delivery_radius_m = 8000, delivery_base = 8000, delivery_base_m = 2000,
    delivery_per_km = 2000, min_order = 30000, free_delivery_from = 100000, pickup_enabled = 1, phone = '+998901112233' WHERE id = ?`).run(ids.r1);
  p = {
    osh: ids.p1, // 35 000
    choy: services.restaurants.addProduct(ids.r1, { name: 'Choy', price: 5000 }),
  };
  addr = (await call(e.base, 301, 'POST', '/api/addresses', { text: 'Uy', lat: CITY.lat, lon: CITY.lon, entrance: '2' })).body.address.id;
}
const items = (...xs) => xs.map(([product_id, qty]) => ({ product_id, qty }));
const quote = (body, user = 301) => call(e.base, user, 'POST', '/api/checkout/quote', { restaurant_id: ids.r1, type: 'delivery', address_id: addr, ...body });
let keyN = 0;
const order = (body, user = 301) => call(e.base, user, 'POST', '/api/orders', {
  restaurant_id: ids.r1, type: 'delivery', address_id: addr, payment_method: 'cash',
  customer_name: 'Ali Valiyev', customer_phone: '+998 90 123 45 67', idempotency_key: `key-${++keyN}-abcdef`, ...body,
});
const status = (id, to, user, extra = {}) => call(e.base, user, 'POST', `/api/panel/orders/${id}/status`, { to, ...extra });

describe('Quote: yagona hisob', () => {
  beforeEach(env);
  afterEach(() => e.close());

  test('narx, yetkazish, jami; klient narxi hisobga olinmaydi', async () => {
    const r = await quote({ items: [{ product_id: p.osh, qty: 2, price: 1 }] });
    const q = r.body.quote;
    assert.equal(q.items_total, 70000);
    assert.equal(q.delivery_fee, 8000);
    assert.equal(q.total, 78000);
    assert.deepEqual(q.payment_methods, ['cash']);
    assert.equal(q.can_order, true);
    assert.deepEqual(q.free_delivery, { kind: 'threshold', threshold: 100000, applied: false, left: 30000, now_free: false });
  });

  test('bepul yetkazish: taomlar summasi chegaraga yetganda; yetkazish summasi chegarani to\'ldirmaydi', async () => {
    const at = (await quote({ items: items([p.osh, 2], [p.choy, 6]) })).body.quote; // 100 000
    assert.equal(at.free_delivery.applied, true);
    assert.equal(at.delivery_fee, 0);
    const below = (await quote({ items: items([p.osh, 2], [p.choy, 5]) })).body.quote; // 95 000 + 8 000 > 100 000, lekin bepul emas
    assert.equal(below.free_delivery.applied, false);
    assert.equal(below.delivery_fee, 8000);
  });

  test('olib ketish: yetkazish 0, manzil kerak emas; o\'chirilgan bo\'lsa — 400', async () => {
    const q = (await quote({ type: 'pickup', address_id: undefined, items: items([p.osh, 1]) })).body.quote;
    assert.equal(q.delivery_fee, 0);
    assert.equal(q.total, 35000);
    assert.equal(q.address, null);
    e.db.prepare('UPDATE restaurants SET pickup_enabled = 0 WHERE id = ?').run(ids.r1);
    assert.equal((await quote({ type: 'pickup', items: items([p.osh, 1]) })).status, 400);
  });

  test('muammolar: minimal summa, yopiq restoran, tugagan va o\'chirilgan taom', async () => {
    assert.deepEqual((await quote({ items: items([p.choy, 1]) })).body.quote.problems, ['below_min_order']);
    e.db.prepare('UPDATE restaurants SET is_open = 0 WHERE id = ?').run(ids.r1);
    assert.ok((await quote({ items: items([p.osh, 1]) })).body.quote.problems.includes('restaurant_closed'));
    e.db.prepare('UPDATE restaurants SET is_open = 1 WHERE id = ?').run(ids.r1);
    e.db.prepare('UPDATE products SET is_available = 0 WHERE id = ?').run(p.choy);
    assert.ok((await quote({ items: items([p.osh, 1], [p.choy, 1]) })).body.quote.problems.includes('product_unavailable'));
    e.db.prepare('UPDATE products SET is_deleted = 1 WHERE id = ?').run(p.choy);
    assert.ok((await quote({ items: items([p.osh, 1], [p.choy, 1]) })).body.quote.problems.includes('product_removed'));
  });

  test('begona manzil bilan hisoblab bo\'lmaydi', async () => {
    assert.equal((await quote({ items: items([p.osh, 1]) }, 302)).status, 404);
  });
});

describe('Buyurtma yaratish', () => {
  beforeEach(env);
  afterEach(() => e.close());

  test('naqd buyurtma: holat new, summa serverdan, snapshot, voqea, kontakt saqlanadi', async () => {
    const r = await order({ items: items([p.osh, 2]), expected_total: 78000, comment: 'Domofon ishlamaydi' });
    assert.equal(r.status, 201);
    const o = r.body.order;
    assert.equal(o.status, 'new');
    assert.equal(o.payment_status, 'unpaid');
    assert.equal(o.total, 78000);
    assert.equal(o.customer_phone, '+998901234567');
    assert.equal(o.address_details.entrance, '2');
    assert.deepEqual(o.items.map((i) => [i.name, i.price, i.qty]), [['Osh', 35000, 2]]);
    assert.deepEqual(o.events.map((x) => x.type), ['created']);
    assert.deepEqual(o.actions, ['cancelled'], 'mijoz yangi buyurtmani bekor qila oladi');
    const me = (await call(e.base, 301, 'GET', '/api/me')).body.user;
    assert.deepEqual([me.contact_name, me.phone], ['Ali Valiyev', '+998901234567']);
  });

  test('takroriy bosish / qayta urinish: bir xil kalit — bitta buyurtma', async () => {
    const body = { items: items([p.osh, 1]), expected_total: 43000, idempotency_key: 'same-key-123456' };
    const [a, b] = await Promise.all([order(body), order(body)]);
    assert.equal(a.body.order.id, b.body.order.id);
    assert.equal(e.db.prepare('SELECT COUNT(*) AS n FROM orders WHERE customer_id = 301 AND idempotency_key = ?').get('same-key-123456').n, 1);
    assert.deepEqual([a.status, b.status].sort(), [200, 201]);
  });

  test('narx o\'zgarsa — 409 PRICE_CHANGED yangi summa bilan, buyurtma yaratilmaydi', async () => {
    const count = () => e.db.prepare('SELECT COUNT(*) AS n FROM orders WHERE customer_id = 301').get().n;
    const before = count(); // seed'da bitta buyurtma bor
    e.services.restaurants.setProductPrice(ids.r1, p.osh, 40000);
    const r = await order({ items: items([p.osh, 1]), expected_total: 43000 });
    assert.equal(r.status, 409);
    assert.equal(r.body.error.code, 'PRICE_CHANGED');
    assert.equal(r.body.error.details.quote.total, 48000);
    assert.equal(count(), before);
    const ok = await order({ items: items([p.osh, 1]), expected_total: 48000 });
    assert.equal(ok.status, 201);
  });

  test('yopiq restoran, o\'chirilgan mahsulot, minimal summa — 409 CANNOT_ORDER', async () => {
    e.db.prepare('UPDATE restaurants SET is_open = 0 WHERE id = ?').run(ids.r1);
    const closed = await order({ items: items([p.osh, 1]), expected_total: 43000 });
    assert.equal(closed.body.error.code, 'CANNOT_ORDER');
    assert.deepEqual(closed.body.error.details.problems, ['restaurant_closed']);
    e.db.prepare('UPDATE restaurants SET is_open = 1 WHERE id = ?').run(ids.r1);
    e.db.prepare('UPDATE products SET is_deleted = 1 WHERE id = ?').run(p.choy);
    assert.equal((await order({ items: items([p.osh, 1], [p.choy, 1]), expected_total: 43000 })).body.error.code, 'CANNOT_ORDER');
    assert.equal((await order({ items: items([p.osh, 0]), expected_total: 0 })).status, 400);
  });

  test('noto\'g\'ri telefon va yoqilmagan to\'lov usuli — 400', async () => {
    const phone = await order({ items: items([p.osh, 1]), expected_total: 43000, customer_phone: '12345' });
    assert.equal(phone.body.error.details.field, 'customer_phone');
    const pay = await order({ items: items([p.osh, 1]), expected_total: 43000, payment_method: 'card_transfer' });
    assert.equal(pay.body.error.details.field, 'payment_method');
  });

  test('olib ketish buyurtmasi', async () => {
    const r = await order({ type: 'pickup', address_id: undefined, items: items([p.osh, 1]), expected_total: 35000 });
    assert.equal(r.status, 201);
    assert.equal(r.body.order.type, 'pickup');
    assert.equal(r.body.order.delivery_fee, 0);
    assert.equal(r.body.order.address_text, null);
  });
});

describe('Holat o\'tishlari', () => {
  beforeEach(env);
  afterEach(() => e.close());
  const place = async (extra = {}) => (await order({ items: items([p.osh, 1]), expected_total: 43000, ...extra })).body.order.id;

  test('yetkazish: new → accepted → ready → on_way → delivered; naqd to\'landi; voqealar', async () => {
    const id = await place();
    assert.equal((await status(id, 'accepted', 102, { prep_minutes: 25 })).body.order.prep_minutes, 25);
    assert.equal((await status(id, 'delivered', 102)).body.error.code, 'INVALID_TRANSITION', 'bosqichni sakrab bo\'lmaydi');
    await status(id, 'ready', 102);
    assert.equal((await status(id, 'delivered', 102)).body.error.details.reason, 'must_be_on_way');
    await status(id, 'on_way', 101);
    const done = await status(id, 'delivered', 101);
    assert.equal(done.body.order.status, 'delivered');
    assert.equal(done.body.order.payment_status, 'paid');
    assert.deepEqual(done.body.order.events.map((x) => x.to_status), ['new', 'accepted', 'ready', 'on_way', 'delivered']);
    assert.deepEqual(done.body.order.events.slice(1).map((x) => x.actor_role), ['staff', 'staff', 'staff', 'staff']);
  });

  test('olib ketish: on_way yo\'q, ready → delivered', async () => {
    const id = (await order({ type: 'pickup', address_id: undefined, items: items([p.osh, 1]), expected_total: 35000 })).body.order.id;
    await status(id, 'accepted', 102);
    await status(id, 'ready', 102);
    assert.equal((await status(id, 'on_way', 102)).body.error.details.reason, 'pickup_has_no_courier');
    assert.equal((await status(id, 'delivered', 102)).body.order.status, 'delivered');
  });

  test('yakunlangan buyurtma eski tugmadan qayta ishlamaydi', async () => {
    const id = await place();
    await call(e.base, 301, 'POST', `/api/orders/${id}/cancel`);
    for (const to of ['accepted', 'new', 'cancelled']) {
      assert.equal((await status(id, to, 102, { reason: 'x' })).body.error.code, 'INVALID_TRANSITION');
    }
  });

  test('mijoz: faqat new bosqichida bekor qiladi; qabul qilingandan keyin — yo\'q', async () => {
    const a = await place();
    const c = await call(e.base, 301, 'POST', `/api/orders/${a}/cancel`, { reason: 'Fikrim o\'zgardi' });
    assert.equal(c.body.order.status, 'cancelled');
    const b = await place();
    await status(b, 'accepted', 102);
    const late = await call(e.base, 301, 'POST', `/api/orders/${b}/cancel`);
    assert.equal(late.status, 403);
    const view = (await call(e.base, 301, 'GET', `/api/orders/${b}`)).body.order;
    assert.deepEqual(view.actions, []);
    assert.equal(view.restaurant.phone, '+998901112233', 'restoran bilan bog\'lanish yo\'li');
  });

  test('xodim bekor qilishi sabab talab qiladi; begona mijoz/xodim o\'zgartira olmaydi', async () => {
    const id = await place();
    assert.equal((await status(id, 'cancelled', 102)).body.error.details.reason, 'reason_required');
    assert.equal((await status(id, 'accepted', 202)).status, 404, 'begona restoran xodimi');
    assert.equal((await status(id, 'accepted', 301)).status, 403, 'mijoz qabul qila olmaydi');
    assert.equal((await call(e.base, 302, 'POST', `/api/orders/${id}/cancel`)).status, 404, 'begona mijoz');
    const ok = await status(id, 'cancelled', 102, { reason: 'Mahsulot tugadi' });
    assert.equal(ok.body.order.cancel_reason, 'Mahsulot tugadi');
  });

  test('to\'langan buyurtma bekor qilinsa — qaytarish SO\'RALADI, qaytarildi deb belgilanmaydi', async () => {
    const id = await place();
    e.db.prepare("UPDATE orders SET payment_status = 'paid' WHERE id = ?").run(id);
    const r = await status(id, 'cancelled', 102, { reason: 'Yopildik' });
    assert.equal(r.body.order.payment_status, 'refund_requested');
  });

  test('oldindan to\'lov tasdiqlanmasa tayyorlashga qabul qilinmaydi', async () => {
    const id = await place();
    e.db.prepare("UPDATE orders SET payment_method = 'card_transfer', payment_status = 'claimed' WHERE id = ?").run(id);
    assert.equal((await status(id, 'accepted', 102)).body.error.details.reason, 'payment_not_confirmed');
    e.db.prepare("UPDATE orders SET payment_status = 'paid' WHERE id = ?").run(id);
    assert.equal((await status(id, 'accepted', 102)).body.order.status, 'accepted');
  });

  test('bir vaqtda ikki xodim: faqat bittasi o\'tkazadi', async () => {
    const id = await place();
    const [a, b] = await Promise.all([status(id, 'accepted', 101), status(id, 'accepted', 102)]);
    assert.deepEqual([a.status, b.status].sort(), [200, 409]);
  });
});
