// 11-bosqich: restoran paneli — buyurtmalar, kuryer biriktirish, menyu, kuryerlar, xodimlar, sozlamalar, ish vaqti, hisobot.
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setup, seed, call } from './helpers.js';
import { withinHours } from '../public/js/shared/hours.js';

let e; let ids; let addr; let k = 0;
async function env() {
  e = await setup();
  ids = seed(e.services);
  e.db.prepare('UPDATE restaurants SET lat = 40.12, lon = 67.84, delivery_radius_m = 8000, delivery_base = 8000, delivery_base_m = 2000, delivery_per_km = 2000, pickup_enabled = 1 WHERE id = ?').run(ids.r1);
  addr = (await call(e.base, 301, 'POST', '/api/addresses', { text: 'Uy', lat: 40.1158, lon: 67.8422 })).body.address.id;
}
const R = () => `/api/panel/restaurants/${ids.r1}`;
const place = async (extra = {}) => (await call(e.base, 301, 'POST', '/api/orders', {
  restaurant_id: ids.r1, type: 'delivery', address_id: addr, payment_method: 'cash', items: [{ product_id: ids.p1, qty: 1 }],
  customer_name: 'Ali', customer_phone: '901234567', expected_total: 43000, idempotency_key: `m-key-${++k}-x`, ...extra,
})).body.order;
const st = (id, to, user = 102, extra = {}) => call(e.base, user, 'POST', `/api/panel/orders/${id}/status`, { to, ...extra });

describe('Buyurtmalar paneli', () => {
  beforeEach(env);
  afterEach(() => e.close());

  test('guruhlar: yangi → tayyorlanmoqda → tayyor → yo\'lda → yakunlangan; sonlar', async () => {
    const a = await place();
    const b = await place();
    await st(b.id, 'accepted', 102, { prep_minutes: 20 });
    const board = (g) => call(e.base, 102, 'GET', `${R()}/board?group=${g}`);
    const n = (await board('new')).body;
    assert.ok(n.orders.some((o) => o.id === a.id));
    assert.deepEqual(n.orders.find((o) => o.id === a.id).items, [{ name: 'Osh', qty: 1 }]);
    assert.equal(n.counts.preparing, 1);
    assert.deepEqual((await board('preparing')).body.orders.map((o) => o.id), [b.id]);
    assert.equal((await call(e.base, 202, 'GET', `${R()}/board?group=new`)).status, 403, 'begona restoran');
  });

  test('eski holatdagi tugma: yangi holat qaytadi (INVALID_TRANSITION)', async () => {
    const o = await place();
    await st(o.id, 'accepted');
    const again = await st(o.id, 'accepted', 101);
    assert.equal(again.body.error.code, 'INVALID_TRANSITION');
    assert.equal(again.body.error.details.status, 'accepted');
  });

  test('kuryer biriktirish: faqat shu restoranning ulangan kuryeri; olib ketishga emas; voqea yoziladi', async () => {
    const o = await place();
    assert.equal((await call(e.base, 102, 'POST', `/api/panel/orders/${o.id}/courier`, { courier_id: ids.c2 })).body.error.details.field, 'courier_id', 'begona kuryer');
    const unlinked = e.services.restaurants.addCourier(ids.r1, { name: 'Ulanmagan' });
    assert.equal((await call(e.base, 102, 'POST', `/api/panel/orders/${o.id}/courier`, { courier_id: unlinked })).status, 400);
    const ok = await call(e.base, 102, 'POST', `/api/panel/orders/${o.id}/courier`, { courier_id: ids.c1 });
    assert.equal(ok.body.order.courier_id, ids.c1);
    assert.ok(ok.body.order.events.some((x) => x.type === 'courier_assigned'));
    const p = await place({ type: 'pickup', address_id: undefined, expected_total: 35000 });
    assert.equal((await call(e.base, 102, 'POST', `/api/panel/orders/${p.id}/courier`, { courier_id: ids.c1 })).body.error.details.reason, 'pickup_has_no_courier');
  });
});

describe('Menyu', () => {
  beforeEach(env);
  afterEach(() => e.close());

  test('kategoriya va taom: yaratish, tahrir, tartib, stop-list, o\'chirish', async () => {
    const c1 = (await call(e.base, 102, 'POST', `${R()}/categories`, { name_uz: 'Osh' })).body.id;
    const c2 = (await call(e.base, 102, 'POST', `${R()}/categories`, { name_uz: 'Salat', name_ru: 'Салаты' })).body.id;
    await call(e.base, 102, 'PUT', `${R()}/categories-order`, { ids: [c2, c1] });
    const p = (await call(e.base, 102, 'POST', `${R()}/products`, { name_uz: 'Achchiq-chuchuk', price: 12000, old_price: 15000, portion: '250 g', category_id: c2, is_popular: true })).body.id;
    await call(e.base, 102, 'PUT', `${R()}/products/${p}/availability`, { available: false });
    let m = (await call(e.base, 102, 'GET', `${R()}/menu`)).body;
    assert.deepEqual(m.categories.map((c) => c.name_uz).slice(0, 2), ['Salat', 'Osh']);
    const prod = m.products.find((x) => x.id === p);
    assert.deepEqual([prod.price, prod.old_price, prod.is_available, prod.is_popular], [12000, 15000, 0, 1]);
    // Kategoriya o'chirilsa, taom "Boshqa"ga o'tadi.
    await call(e.base, 102, 'DELETE', `${R()}/categories/${c2}`);
    m = (await call(e.base, 102, 'GET', `${R()}/menu`)).body;
    assert.equal(m.products.find((x) => x.id === p).category_id, null);
    await call(e.base, 102, 'DELETE', `${R()}/products/${p}`);
    assert.ok(!(await call(e.base, 102, 'GET', `${R()}/menu`)).body.products.some((x) => x.id === p));
  });

  test('xato narx va fayl yo\'li tushunarli xato beradi', async () => {
    const bad = (body) => call(e.base, 102, 'POST', `${R()}/products`, { name_uz: 'X', ...body });
    assert.equal((await bad({ price: 0 })).body.error.details.reason, 'zero');
    assert.equal((await bad({ price: 12.5 })).body.error.details.field, 'price');
    assert.equal((await bad({ price: 10000, old_price: 9000 })).body.error.details.reason, 'not_greater');
    assert.equal((await bad({ price: 10000, image_path: '/etc/passwd' })).body.error.details.field, 'image_path');
    assert.equal((await bad({ price: 10000, image_path: `/uploads/restaurants/${ids.r2}/00000000-0000-0000-0000-000000000000.png` })).body.error.details.field, 'image_path', 'begona restoran rasmi');
    assert.equal((await bad({ price: 10000, category_id: 99999 })).body.error.details.field, 'category_id');
  });

  test('begona restoran menyusi — 403; kuryer menyuni o\'zgartira olmaydi', async () => {
    assert.equal((await call(e.base, 202, 'POST', `${R()}/products`, { name_uz: 'X', price: 1000 })).status, 403);
    assert.equal((await call(e.base, 103, 'GET', `${R()}/menu`)).status, 403);
  });
});

describe('Kuryerlar va xodimlar', () => {
  beforeEach(env);
  afterEach(() => e.close());

  test('kuryer: qo\'shish, bugungi yetkazish va naqd yig\'im', async () => {
    const id = (await call(e.base, 102, 'POST', `${R()}/couriers`, { name: 'Yangi kuryer', phone: '901112233', transport: 'moto' })).body.id;
    const o = await place();
    await call(e.base, 102, 'POST', `/api/panel/orders/${o.id}/courier`, { courier_id: ids.c1 });
    for (const to of ['accepted', 'ready', 'on_way', 'delivered']) await st(o.id, to);
    const list = (await call(e.base, 102, 'GET', `${R()}/couriers`)).body.couriers;
    const c1 = list.find((c) => c.id === ids.c1);
    assert.deepEqual([c1.delivered_today, c1.cash_today, c1.linked], [1, 43000, true]);
    const nw = list.find((c) => c.id === id);
    assert.deepEqual([nw.linked, nw.transport, nw.phone], [false, 'moto', '+998901112233']);
  });

  test('faol buyurtmasi bor kuryerni uzib bo\'lmaydi; buyurtma yakunlangach — mumkin', async () => {
    const o = await place();
    await call(e.base, 102, 'POST', `/api/panel/orders/${o.id}/courier`, { courier_id: ids.c1 });
    const blocked = await call(e.base, 102, 'DELETE', `${R()}/couriers/${ids.c1}`);
    assert.equal(blocked.body.error.details.reason, 'courier_has_active_orders');
    assert.equal(blocked.body.error.details.count, 2, 'seed buyurtmasi ham shu kuryerda');
    await st(o.id, 'cancelled', 102, { reason: 'Test' });
    await st(ids.o1, 'cancelled', 102, { reason: 'Test' });
    assert.equal((await call(e.base, 102, 'DELETE', `${R()}/couriers/${ids.c1}`)).status, 200);
    assert.equal((await call(e.base, 103, 'GET', '/api/me')).body.roles.courier.length, 0, 'kuryer roli olib tashlandi');
  });

  test('xodimlar: faqat ega olib tashlaydi; o\'zini va oxirgi egani olib tashlab bo\'lmaydi', async () => {
    const list = (await call(e.base, 101, 'GET', `${R()}/staff`)).body.staff;
    const mgr = list.find((s) => s.role === 'manager');
    const owner = list.find((s) => s.role === 'owner');
    assert.equal((await call(e.base, 102, 'DELETE', `${R()}/staff/${owner.id}`)).body.error.code, 'OWNER_ONLY');
    assert.equal((await call(e.base, 101, 'DELETE', `${R()}/staff/${owner.id}`)).body.error.details.reason, 'cannot_remove_self');
    assert.equal((await call(e.base, 900, 'DELETE', `${R()}/staff/${owner.id}`)).body.error.details.reason, 'last_owner');
    assert.equal((await call(e.base, 101, 'DELETE', `${R()}/staff/${mgr.id}`)).status, 200);
    assert.equal((await call(e.base, 102, 'GET', `${R()}/menu`)).status, 403, 'menejer kirishi bekor');
  });
});

describe('Sozlamalar va ish vaqti', () => {
  beforeEach(env);
  afterEach(() => e.close());

  test('menejer: pauza va ish vaqti — mumkin; narx/hudud/ma\'lumot — faqat ega', async () => {
    assert.equal((await call(e.base, 102, 'PUT', `${R()}/operations`, { is_open: false })).body.restaurant.is_open, 0);
    assert.equal((await call(e.base, 102, 'PUT', `${R()}/profile`, { min_order: 50000 })).body.error.code, 'OWNER_ONLY');
    const ok = await call(e.base, 101, 'PUT', `${R()}/profile`, { min_order: 50000, free_delivery_from: 150000, delivery_radius_m: 6000, pickup_enabled: true, phone: '90 111 22 33' });
    assert.deepEqual([ok.body.restaurant.min_order, ok.body.restaurant.free_delivery_from, ok.body.restaurant.delivery_radius_m, ok.body.restaurant.pickup_enabled, ok.body.restaurant.phone], [50000, 150000, 6000, 1, '+998901112233']);
    assert.equal((await call(e.base, 101, 'PUT', `${R()}/profile`, { lat: 41.29, lon: 69.24 })).body.error.code, 'OUT_OF_AREA');
  });

  test('ish vaqti: noto\'g\'ri format — 400; vaqtdan tashqarida restoran yopiq, buyurtma olinmaydi', async () => {
    assert.equal((await call(e.base, 102, 'PUT', `${R()}/operations`, { work_hours: { open: '25:00', close: '10:00' } })).status, 400);
    // Hozirgi Toshkent vaqtidan 1 soat oldin yopiladigan qilib qo'yamiz.
    const local = new Date(Date.now() + 5 * 3600000);
    const hh = (h) => String((h + 24) % 24).padStart(2, '0');
    const closeAt = `${hh(local.getUTCHours() - 1)}:00`;
    const openAt = `${hh(local.getUTCHours() - 3)}:00`;
    await call(e.base, 102, 'PUT', `${R()}/operations`, { work_hours: { open: openAt, close: closeAt, days_off: [] } });
    const q = (await call(e.base, 301, 'POST', '/api/checkout/quote', { restaurant_id: ids.r1, address_id: addr, items: [{ product_id: ids.p1, qty: 1 }] })).body.quote;
    assert.ok(q.problems.includes('restaurant_closed'));
    await call(e.base, 102, 'PUT', `${R()}/operations`, { work_hours: null });
    const q2 = (await call(e.base, 301, 'POST', '/api/checkout/quote', { restaurant_id: ids.r1, address_id: addr, items: [{ product_id: ids.p1, qty: 1 }] })).body.quote;
    assert.ok(!q2.problems.includes('restaurant_closed'));
  });

  test('withinHours: oddiy, yarim tundan o\'tadigan, dam olish kuni (Toshkent vaqti)', () => {
    const at = (iso) => Date.parse(iso); // UTC; Toshkent = UTC+5
    const h = JSON.stringify({ open: '09:00', close: '23:00', days_off: [0] });
    assert.equal(withinHours(h, at('2026-11-25T05:00:00Z')), true);  // chorshanba 10:00
    assert.equal(withinHours(h, at('2026-11-25T03:30:00Z')), false); // 08:30
    assert.equal(withinHours(h, at('2026-11-29T07:00:00Z')), false); // yakshanba — dam olish
    const night = JSON.stringify({ open: '18:00', close: '02:00' });
    assert.equal(withinHours(night, at('2026-11-25T20:00:00Z')), true);  // 01:00 keyingi kun
    assert.equal(withinHours(night, at('2026-11-25T22:00:00Z')), false); // 03:00
    assert.equal(withinHours(null), true);
  });
});

describe('Hisobot', () => {
  beforeEach(env);
  afterEach(() => e.close());

  test('bugungi tushum, naqd/oldindan to\'langan ajratilgan, 7 kun, ommabop; "sof foyda" emas', async () => {
    const a = await place();
    for (const to of ['accepted', 'ready', 'on_way', 'delivered']) await st(a.id, to);
    const b = await place();
    await st(b.id, 'cancelled', 102, { reason: 'x' });
    e.db.prepare('UPDATE restaurants SET pay_card_transfer = 1, card_holder = ? WHERE id = ?').run('X', ids.r1);
    const c = await place({ payment_method: 'card_transfer' });
    await call(e.base, 301, 'POST', `/api/orders/${c.id}/payment-claim`);
    await call(e.base, 102, 'POST', `/api/panel/orders/${c.id}/payment`, { action: 'confirm' });
    for (const to of ['accepted', 'ready', 'on_way', 'delivered']) await st(c.id, to);

    const r = (await call(e.base, 102, 'GET', `${R()}/report`)).body.report;
    assert.equal(r.today.delivered, 2);
    assert.equal(r.today.cancelled, 1);
    assert.equal(r.today.revenue, 86000);
    assert.deepEqual([r.today.cash, r.today.prepaid], [43000, 43000]);
    assert.equal(r.today.average, 43000);
    assert.equal(r.days.length, 7);
    assert.equal(r.popular[0].name, 'Osh');
    assert.equal(r.revenue_note, 'gross_without_costs');
    assert.equal((await call(e.base, 202, 'GET', `${R()}/report`)).status, 403);
  });
});
