// 7-bosqich: savat qoidalari (bitta restoran, tasdiqsiz o'chirmaslik, stop-list) va server tekshiruvi.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setup, seed, call } from './helpers.js';
import * as core from '../public/js/shared/cart-core.js';

const A = { id: 1, name: 'Choyxona' };
const B = { id: 2, name: 'Burger Uy' };
const osh = { id: 10, name: 'Osh', price: 35000, is_available: true };
const somsa = { id: 11, name: 'Somsa', price: 8000, is_available: true };
const burger = { id: 20, name: 'Burger', price: 30000, is_available: true };

describe('Savat qoidalari (cart-core)', () => {
  test('qo\'shish, miqdor, jami, olib tashlash', () => {
    let c = core.emptyCart();
    c = core.setQty(c, A, osh, 2).cart;
    c = core.setQty(c, A, somsa, 3).cart;
    assert.equal(core.count(c), 5);
    assert.equal(core.itemsTotal(c), 2 * 35000 + 3 * 8000);
    c = core.setQty(c, A, osh, 0).cart;
    assert.equal(core.qtyOf(c, osh.id), 0);
    c = core.setQty(c, A, somsa, 0).cart;
    assert.deepEqual(c, core.emptyCart(), 'oxirgi taom olinsa restoran ham tozalanadi');
  });

  test('boshqa restoran taomi: savat yashirincha o\'chirilmaydi, tasdiq bilan almashadi', () => {
    let c = core.setQty(core.emptyCart(), A, osh, 2).cart;
    const r = core.setQty(c, B, burger, 1);
    assert.equal(r.conflict, true);
    assert.equal(r.cart, c, 'savat o\'zgarmagan');
    c = core.setQty(c, B, burger, 1, { force: true }).cart;
    assert.equal(c.restaurantId, B.id);
    assert.deepEqual(Object.keys(c.items), ['20']);
  });

  test('stop-listdagi taom qo\'shilmaydi; miqdor 0..99 oralig\'ida', () => {
    const r = core.setQty(core.emptyCart(), A, { ...osh, is_available: false }, 1);
    assert.equal(r.error, 'unavailable');
    assert.equal(core.qtyOf(core.setQty(core.emptyCart(), A, osh, 500).cart, osh.id), 99);
    assert.equal(core.qtyOf(core.setQty(core.emptyCart(), A, osh, 2.7).cart, osh.id), 2);
  });

  test('server tekshiruvini qo\'llash: o\'chirilgan olib tashlanadi, narx yangilanadi, mavjud emas — so\'rov bilan', () => {
    let c = core.setQty(core.emptyCart(), A, osh, 1).cart;
    c = core.setQty(c, A, somsa, 2).cart;
    c = core.setQty(c, A, { id: 12, name: 'Choy', price: 5000, is_available: true }, 1).cart;
    const check = { lines: [
      { product_id: 10, status: 'ok', price: 38000, name: 'Osh' },
      { product_id: 11, status: 'unavailable', price: 8000 },
      { product_id: 12, status: 'removed', price: null },
    ] };
    const soft = core.applyCheck(c, check);
    assert.deepEqual(Object.keys(soft.items).sort(), ['10', '11']);
    assert.equal(soft.items[10].price, 38000);
    const hard = core.applyCheck(c, check, { removeUnavailable: true });
    assert.deepEqual(Object.keys(hard.items), ['10']);
  });
});

describe('API: /api/cart/check', () => {
  let env; let ids; let addr; let p;
  before(async () => {
    env = await setup();
    ids = seed(env.services);
    const { db, services } = env;
    db.prepare('UPDATE restaurants SET lat = 40.12, lon = 67.84, delivery_radius_m = 8000, delivery_base = 8000, min_order = 50000 WHERE id = ?').run(ids.r1);
    p = {
      osh: ids.p1, // 35 000
      choy: services.restaurants.addProduct(ids.r1, { name: 'Choy', price: 5000 }),
      stop: services.restaurants.addProduct(ids.r1, { name: 'Jigar', price: 14000 }),
      gone: services.restaurants.addProduct(ids.r1, { name: 'Eski', price: 1000 }),
    };
    db.prepare('UPDATE products SET is_available = 0 WHERE id = ?').run(p.stop);
    db.prepare('UPDATE products SET is_deleted = 1 WHERE id = ?').run(p.gone);
    addr = (await call(env.base, 301, 'POST', '/api/addresses', { text: 'Uy', lat: 40.1158, lon: 67.8422 })).body.address.id;
  });
  after(() => env.close());

  const check = (items, extra = {}) => call(env.base, 301, 'POST', '/api/cart/check', { restaurant_id: ids.r1, items, address_id: addr, ...extra });

  test('narx bazadan; klient narxi farq qilsa "price_changed"', async () => {
    const r = await check([{ product_id: p.osh, qty: 2, price: 30000 }]);
    assert.equal(r.status, 200);
    const [line] = r.body.lines;
    assert.equal(line.price, 35000);
    assert.equal(line.price_changed, true);
    assert.equal(r.body.items_total, 70000, 'klient yuborgan 30 000 ishlatilmaydi');
    assert.equal(r.body.can_order, true);
  });

  test('stop-list va o\'chirilgan taom belgilanadi, jamiga kirmaydi, buyurtma mumkin emas', async () => {
    const r = await check([{ product_id: p.osh, qty: 2 }, { product_id: p.stop, qty: 1 }, { product_id: p.gone, qty: 1 }]);
    assert.deepEqual(r.body.lines.map((l) => l.status), ['ok', 'unavailable', 'removed']);
    assert.equal(r.body.items_total, 70000);
    assert.equal(r.body.can_order, false);
  });

  test('minimal summa', async () => {
    const r = await check([{ product_id: p.choy, qty: 2 }]);
    assert.equal(r.body.below_min_order, true);
    assert.equal(r.body.can_order, false);
  });

  test('boshqa restoran mahsuloti "removed" bo\'ladi; yopiq restoranda buyurtma mumkin emas', async () => {
    const foreign = await check([{ product_id: ids.p2, qty: 1 }]);
    assert.equal(foreign.body.lines[0].status, 'removed');
    env.db.prepare('UPDATE restaurants SET is_open = 0 WHERE id = ?').run(ids.r1);
    const closed = await check([{ product_id: p.osh, qty: 2 }]);
    assert.equal(closed.body.restaurant.is_open, false);
    assert.equal(closed.body.can_order, false);
    env.db.prepare('UPDATE restaurants SET is_open = 1 WHERE id = ?').run(ids.r1);
  });

  test('noto\'g\'ri so\'rovlar: bo\'sh savat, miqdor 0, hududdan tashqari manzil', async () => {
    assert.equal((await check([])).status, 400);
    assert.equal((await check([{ product_id: p.osh, qty: 0 }])).status, 400);
    const out = await call(env.base, 301, 'POST', '/api/cart/check', { restaurant_id: ids.r1, items: [{ product_id: p.osh, qty: 1 }], lat: 41.2995, lon: 69.2401 });
    assert.equal(out.status, 422);
  });
});
