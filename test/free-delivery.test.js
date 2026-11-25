// 16-bosqich: "Bepul yetkazib berish" bo'limi. Bitta server hisobi: ro'yxat, restoran, savat, quote, buyurtma, guruh/kuryer xabari, hisobot.
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setup, seed, call } from './helpers.js';
import { freeDeliveryInfo } from '../public/js/shared/geo-core.js';
import { formatSum } from '../src/i18n/index.js';

const CITY = { lat: 40.1158, lon: 67.8422 };
const N = 100000; // chegara
let e; let ids; let addr; let far; let p;

async function env() {
  e = await setup();
  ids = seed(e.services);
  e.db.prepare(`UPDATE restaurants SET lat = 40.12, lon = 67.84, delivery_radius_m = 8000, delivery_base = 8000, delivery_base_m = 2000,
    delivery_per_km = 2000, min_order = 30000, free_delivery_from = ?, pickup_enabled = 1 WHERE id = ?`).run(N, ids.r1);
  // R2: yetkazish narxi haqiqatan 0 (doimiy bepul), chegara yo'q.
  e.db.prepare(`UPDATE restaurants SET lat = 40.118, lon = 67.845, delivery_radius_m = 8000, delivery_base = 0, delivery_base_m = 0,
    delivery_per_km = 0, min_order = 20000, free_delivery_from = NULL WHERE id = ?`).run(ids.r2);
  p = { osh: ids.p1, choy: e.services.restaurants.addProduct(ids.r1, { name: 'Choy', price: 1000 }) };
  addr = (await call(e.base, 301, 'POST', '/api/addresses', { text: 'Uy', lat: CITY.lat, lon: CITY.lon })).body.address.id;
  // Jizzax viloyati ichida, lekin restoran radiusidan tashqarida (~35 km).
  far = (await call(e.base, 301, 'POST', '/api/addresses', { text: 'Uzoq', lat: 40.08, lon: 68.25 })).body.address;
}
const items = (...xs) => xs.map(([product_id, qty]) => ({ product_id, qty }));
const quote = (body) => call(e.base, 301, 'POST', '/api/checkout/quote', { restaurant_id: ids.r1, type: 'delivery', address_id: addr, ...body });
// Taomlar summasi aniq S bo'lishi uchun: osh 35 000 × k + choy 1 000 × m.
const basket = (sum) => { const k = Math.floor(sum / 35000); return items([p.osh, k], [p.choy, (sum - k * 35000) / 1000]).filter((x) => x.qty > 0); };

describe('Shared qoida (geo-core.freeDeliveryInfo)', () => {
  test('manzil yaroqsiz — "unavailable", hech qachon bepul emas; savatsiz chegara — hozir bepul emas', () => {
    const r = { free_delivery_from: N };
    assert.equal(freeDeliveryInfo(r, { deliverable: false, delivery_fee: null }).kind, 'unavailable');
    assert.equal(freeDeliveryInfo(r, null, 500000).now_free, false);
    const noCart = freeDeliveryInfo(r, { deliverable: true, delivery_fee: 8000 });
    assert.deepEqual(noCart, { kind: 'threshold', threshold: N, applied: false, left: null, now_free: false });
    assert.equal(freeDeliveryInfo({ free_delivery_from: 0 }, { deliverable: true, delivery_fee: 8000 }, 500000).kind, 'none', '0 — "hamma uchun bepul" emas');
    assert.equal(freeDeliveryInfo({ free_delivery_from: null }, { deliverable: true, delivery_fee: 0 }).kind, 'always');
  });
});

describe('Quote va buyurtma', () => {
  beforeEach(env);
  afterEach(() => e.close());

  test('chegara N: N−1 — pullik va qoldiq 1; N va N+1 — 0 so\'m', async () => {
    const below = (await quote({ items: basket(N - 1000) })).body.quote;
    assert.equal(below.items_total, N - 1000);
    assert.equal(below.delivery_fee, 8000);
    assert.equal(below.free_delivery.left, 1000);
    assert.equal(below.free_delivery.now_free, false);
    for (const s of [N, N + 1000]) {
      const q = (await quote({ items: basket(s) })).body.quote;
      assert.equal(q.items_total, s);
      assert.equal(q.delivery_fee, 0);
      assert.equal(q.total, s);
      assert.equal(q.free_delivery.applied, true);
      assert.equal(q.free_delivery.now_free, true);
    }
  });

  test('mahsulot olib tashlansa (stop-list) — chegara qayta hisoblanadi', async () => {
    const extra = e.services.restaurants.addProduct(ids.r1, { name: 'Salat', price: 10000 });
    const body = { items: [...basket(N - 10000), { product_id: extra, qty: 1 }] };
    assert.equal((await quote(body)).body.quote.delivery_fee, 0);
    e.db.prepare('UPDATE products SET is_available = 0 WHERE id = ?').run(extra);
    const q = (await quote(body)).body.quote;
    assert.equal(q.items_total, N - 10000);
    assert.equal(q.delivery_fee, 8000);
    assert.equal(q.can_order, false, 'mavjud bo\'lmagan taom bilan buyurtma berilmaydi');
  });

  test('manzil o\'zgarsa / radiusdan tashqari — narx noma\'lum (null), "0 so\'m" emas', async () => {
    const q = (await quote({ address_id: far.id, items: basket(N + 5000) })).body.quote;
    assert.equal(far.in_service_area, true);
    assert.equal(q.free_delivery.kind, 'unavailable');
    assert.equal(q.free_delivery.now_free, false);
    assert.equal(q.delivery_fee, null);
    assert.equal(q.total, null);
    assert.ok(q.problems.includes('not_deliverable'));
  });

  test('yopiq restoran va minimal buyurtma baribir tekshiriladi', async () => {
    e.db.prepare('UPDATE restaurants SET min_order = 200000 WHERE id = ?').run(ids.r1);
    let q = (await quote({ items: basket(N) })).body.quote;
    assert.equal(q.delivery_fee, 0);
    assert.ok(q.problems.includes('below_min_order'));
    assert.equal(q.can_order, false);
    e.db.prepare('UPDATE restaurants SET min_order = 0, is_open = 0 WHERE id = ?').run(ids.r1);
    q = (await quote({ items: basket(N) })).body.quote;
    assert.ok(q.problems.includes('restaurant_closed'));
  });

  test('olib ketishdagi 0 so\'m — aksiya emas', async () => {
    const q = (await quote({ type: 'pickup', address_id: undefined, items: basket(N) })).body.quote;
    assert.equal(q.delivery_fee, 0);
    assert.equal(q.free_delivery.kind, 'pickup');
    assert.equal(q.free_delivery.now_free, false);
  });

  test('umumiy yetkazish narxi haqiqatan 0 — "always", savatsiz ham hozir bepul', async () => {
    const q = (await call(e.base, 301, 'POST', '/api/checkout/quote', { restaurant_id: ids.r2, type: 'delivery', address_id: addr, items: items([ids.p2, 3]) })).body.quote;
    assert.equal(q.delivery_fee, 0);
    assert.equal(q.free_delivery.kind, 'always');
    assert.equal(q.free_delivery.now_free, true);
  });

  test('buyurtma snapshot, guruh va mijoz xabaridagi jami bir xil; hisobotda bepul yetkazish', async () => {
    const it = basket(N);
    const q = (await quote({ items: it })).body.quote;
    const r = await call(e.base, 301, 'POST', '/api/orders', {
      restaurant_id: ids.r1, type: 'delivery', address_id: addr, payment_method: 'cash', items: it, expected_total: q.total,
      customer_name: 'Ali Valiyev', customer_phone: '+998 90 123 45 67', idempotency_key: 'free-order-key-1',
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const o = e.db.prepare('SELECT * FROM orders WHERE id = ?').get(r.body.order.id);
    assert.equal(o.delivery_fee, 0);
    assert.equal(o.total, q.total);
    const R = e.db.prepare('SELECT * FROM restaurants WHERE id = ?').get(ids.r1);
    const staff = e.services.templates.staffOrder(o, R, 'uz').text;
    assert.match(staff, /Yetkazish: 0 so‘m — bepul/);
    assert.ok(staff.includes(`Jami: <b>${formatSum(q.total, 'uz')}</b>`));
    const cust = e.services.templates.customerOrder(o, R, 'created', 'uz').text;
    assert.match(cust, /Yetkazish: bepul \(0 so‘m\)/);
    assert.ok(cust.includes(`Jami: ${formatSum(q.total, 'uz')}`));
    // Narx keyin o'zgarsa ham yaratilgan buyurtma snapshot'i o'zgarmaydi.
    e.db.prepare('UPDATE restaurants SET free_delivery_from = NULL WHERE id = ?').run(ids.r1);
    assert.equal(e.db.prepare('SELECT delivery_fee FROM orders WHERE id = ?').get(o.id).delivery_fee, 0);
    // Yetkazilgach hisobotda.
    for (const to of ['accepted', 'ready', 'on_way', 'delivered']) e.services.orders.transition(e.services.users.get(101), o.id, to, to === 'accepted' ? { prepMinutes: 15 } : {});
    const rep = (await call(e.base, 101, 'GET', `/api/panel/restaurants/${ids.r1}/report`)).body.report;
    assert.equal(rep.today.free_deliveries, 1);
  });
});

describe('Ro\'yxat va "Bepul yetkazish" bo\'limi', () => {
  beforeEach(env);
  afterEach(() => e.close());

  test('kartada tasnif; bo\'lim filtri; "Arzon yetkazish" saralashi o\'zgarmaydi', async () => {
    let r = (await call(e.base, 301, 'GET', `/api/restaurants?address_id=${addr}`)).body;
    const r1 = r.restaurants.find((x) => x.id === ids.r1);
    const r2 = r.restaurants.find((x) => x.id === ids.r2);
    assert.deepEqual(r1.free_delivery, { kind: 'threshold', threshold: N, applied: false, left: null, now_free: false });
    assert.equal(r2.free_delivery.kind, 'always');
    assert.deepEqual(r.free_delivery_count, { now: 1, threshold: 1 });
    e.db.prepare('UPDATE restaurants SET free_delivery_from = NULL WHERE id = ?').run(ids.r1);
    r = (await call(e.base, 301, 'GET', `/api/restaurants?address_id=${addr}&free=1`)).body;
    assert.deepEqual(r.restaurants.map((x) => x.id), [ids.r2]);
    r = (await call(e.base, 301, 'GET', `/api/restaurants?address_id=${addr}&sort=cheap_delivery`)).body;
    assert.equal(r.restaurants.length, 2, 'saralash filtr emas');
  });

  test('radiusdan tashqari manzil — restoran ro\'yxatda yo\'q, bo\'limda ham yo\'q', async () => {
    const r = (await call(e.base, 301, 'GET', `/api/restaurants?address_id=${far.id}&free=1`)).body;
    assert.equal(r.restaurants.length, 0);
    assert.deepEqual(r.free_delivery_count, { now: 0, threshold: 0 });
  });

  test('restoran sahifasi va savat tekshiruvi ham shu tasnifni qaytaradi', async () => {
    const page = (await call(e.base, 301, 'GET', `/api/restaurants/${ids.r1}?address_id=${addr}`)).body.restaurant;
    assert.equal(page.free_delivery.kind, 'threshold');
    const check = (await call(e.base, 301, 'POST', '/api/cart/check', { restaurant_id: ids.r1, address_id: addr, items: basket(N) })).body;
    assert.equal(check.free_delivery.now_free, true);
  });
});
