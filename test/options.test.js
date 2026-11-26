// "Standart / Maxsus": masalliqlar, server narxlashi, savat qatorlari, buyurtma snapshot'i, xabarlar.
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setup, seed, call } from './helpers.js';
import { normalize, changes, lineKey, unitPrice, label, validateIngredient } from '../public/js/shared/options-core.js';
import * as cartCore from '../public/js/shared/cart-core.js';

const ING = [
  { id: 1, name_uz: 'Go‘sht', unit: 'g', std_qty: 250, min_qty: 150, max_qty: 400, step: 50, step_price: 6000 },
  { id: 2, name_uz: 'Dumba', unit: 'g', std_qty: 30, min_qty: 0, max_qty: 90, step: 10, step_price: 1000 },
];

describe('options-core (umumiy qoida)', () => {
  test('narx: ko\'paytirsa qo\'shiladi, kamaytirsa ayriladi, 100 so\'mga yaxlit, yarmidan past emas', () => {
    assert.equal(unitPrice(30000, ING, normalize(ING, [])), 30000);
    assert.equal(unitPrice(30000, ING, normalize(ING, [{ id: 1, qty: 350 }])), 42000);
    assert.equal(unitPrice(30000, ING, normalize(ING, [{ id: 1, qty: 150 }, { id: 2, qty: 0 }])), 15000, '30000 − 12000 − 3000 = 15000 (yarmi)');
    const cheap = [{ id: 9, name_uz: 'X', unit: 'dona', std_qty: 5, min_qty: 0, max_qty: 5, step: 1, step_price: 5000 }];
    assert.equal(unitPrice(10000, cheap, normalize(cheap, [{ id: 9, qty: 0 }])), 5000, 'pastki chegara — asosiy narxning yarmi');
  });

  test('chegaradan tashqari, noto\'g\'ri qadam, begona masalliq — xato', () => {
    assert.throws(() => normalize(ING, [{ id: 1, qty: 500 }]), { reason: 'out_of_range' });
    assert.throws(() => normalize(ING, [{ id: 1, qty: 175 }]), { reason: 'bad_step' });
    assert.throws(() => normalize(ING, [{ id: 3, qty: 1 }]), { reason: 'unknown_ingredient' });
  });

  test('kalit va yozuv: standart — product id; o\'zgargan — tartiblangan imzo', () => {
    const n = normalize(ING, [{ id: 2, qty: 0 }, { id: 1, qty: 300 }]);
    const ch = changes(ING, n);
    assert.equal(lineKey(7, ch), '7~1:300,2:0');
    assert.equal(lineKey(7, changes(ING, normalize(ING, [{ id: 1, qty: 250 }]))), '7');
    assert.equal(label(ING, n, 'uz'), 'Go‘sht 300 g, Dumba: yo‘q');
    assert.equal(validateIngredient({ std_qty: 5, min_qty: 6, max_qty: 9, step: 1, step_price: 0 }), 'std_qty');
  });

  test('savat: bir taomning turli sozlamalari alohida qator', () => {
    const R = { id: 1, name: 'R' };
    const P = { id: 7, name: 'Shashlik', price: 30000, is_available: true };
    let c = cartCore.emptyCart();
    c = cartCore.setQty(c, R, P, 2).cart;
    c = cartCore.setQty(c, R, { ...P, price: 42000 }, 1, { key: '7~1:350', options: [{ id: 1, qty: 350 }], optionsLabel: 'Go‘sht 350 g' }).cart;
    assert.equal(cartCore.count(c), 3);
    assert.equal(cartCore.qtyOf(c, 7), 2);
    assert.equal(cartCore.qtyAll(c, 7), 3);
    assert.equal(cartCore.itemsTotal(c), 102000);
    const items = cartCore.payloadItems(c);
    assert.deepEqual(items.map((i) => [i.key, i.product_id, i.qty, i.options]), [['7', 7, 2, []], ['7~1:350', 7, 1, [{ id: 1, qty: 350 }]]]);
  });
});

describe('Server: masalliqlar, quote va buyurtma', () => {
  let e; let ids; let addr; let pid;
  beforeEach(async () => {
    e = await setup();
    ids = seed(e.services);
    e.db.prepare(`UPDATE restaurants SET lat = 40.12, lon = 67.84, delivery_radius_m = 8000, delivery_base = 8000 WHERE id = ?`).run(ids.r1);
    addr = (await call(e.base, 301, 'POST', '/api/addresses', { text: 'Uy', lat: 40.1158, lon: 67.8422 })).body.address.id;
    const r = await call(e.base, 101, 'POST', `/api/panel/restaurants/${ids.r1}/products`, {
      name_uz: 'Mol go‘shti shashlik', price: 30000, cook_style: 'grill', prep_seconds: 30,
      ingredients: [
        { name_uz: 'Go‘sht', unit: 'g', std_qty: 250, min_qty: 150, max_qty: 400, step: 50, step_price: 6000 },
        { name_uz: 'Dumba', unit: 'g', std_qty: 30, min_qty: 0, max_qty: 90, step: 10, step_price: 1000 },
      ],
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    pid = r.body.id;
  });
  afterEach(() => e.close());
  const ingIds = async () => (await call(e.base, 301, 'GET', `/api/restaurants/${ids.r1}?address_id=${addr}`)).body.restaurant.products.find((p) => p.id === pid).ingredients;
  const quote = (items) => call(e.base, 301, 'POST', '/api/checkout/quote', { restaurant_id: ids.r1, type: 'delivery', address_id: addr, items });

  test('restoran sahifasida masalliqlar, animatsiya turi va vaqti', async () => {
    const p = (await call(e.base, 301, 'GET', `/api/restaurants/${ids.r1}?address_id=${addr}`)).body.restaurant.products.find((x) => x.id === pid);
    assert.equal(p.cook_style, 'grill');
    assert.equal(p.prep_seconds, 30);
    assert.deepEqual(p.ingredients.map((i) => [i.name_uz, i.std_qty, i.step_price]), [['Go‘sht', 250, 6000], ['Dumba', 30, 1000]]);
  });

  test('quote: narx serverda hisoblanadi (klient narxi e\'tiborsiz), sozlamalar alohida qator, bir xillari birlashadi', async () => {
    const [g, d] = await ingIds();
    const q = (await quote([
      { product_id: pid, qty: 2 },
      { product_id: pid, qty: 1, price: 1, options: [{ id: g.id, qty: 350 }, { id: d.id, qty: 0 }] },
      { product_id: pid, qty: 1, options: [{ id: d.id, qty: 0 }, { id: g.id, qty: 350 }] },
    ])).body.quote;
    assert.equal(q.lines.length, 2);
    const std = q.lines.find((l) => l.key === String(pid));
    const custom = q.lines.find((l) => l.key !== String(pid));
    assert.equal(std.price, 30000);
    assert.equal(std.qty, 2);
    assert.equal(custom.qty, 2, 'bir xil sozlama birlashdi');
    assert.equal(custom.price, 30000 + 2 * 6000 - 3 * 1000);
    assert.match(custom.options_label, /Go‘sht 350 g/);
    assert.equal(q.items_total, 2 * 30000 + 2 * 39000);
    assert.equal(q.can_order, true);
  });

  test('chegaradan tashqari yoki o\'chirilgan masalliq — "options_changed", buyurtma berilmaydi', async () => {
    const [g] = await ingIds();
    let q = (await quote([{ product_id: pid, qty: 1, options: [{ id: g.id, qty: 999 }] }])).body.quote;
    assert.equal(q.lines[0].status, 'options_changed');
    assert.ok(q.problems.includes('options_changed'));
    assert.equal(q.can_order, false);
    // Panelda masalliq o'chirildi — eski savat qatori yaroqsiz.
    await call(e.base, 101, 'PUT', `/api/panel/restaurants/${ids.r1}/products/${pid}`, { name_uz: 'Mol go‘shti shashlik', price: 30000, ingredients: [] });
    q = (await quote([{ product_id: pid, qty: 1, options: [{ id: g.id, qty: 300 }] }])).body.quote;
    assert.equal(q.lines[0].status, 'options_changed');
  });

  test('masalliqni tahrirlash id ni saqlaydi; noto\'g\'ri ta\'rif — 400', async () => {
    const [g, d] = await ingIds();
    let r = await call(e.base, 101, 'PUT', `/api/panel/restaurants/${ids.r1}/products/${pid}`, {
      name_uz: 'Mol go‘shti shashlik', price: 30000, ingredients: [{ ...g, step_price: 7000 }, d],
    });
    assert.equal(r.status, 200);
    const after = await ingIds();
    assert.equal(after[0].id, g.id);
    assert.equal(after[0].step_price, 7000);
    r = await call(e.base, 101, 'PUT', `/api/panel/restaurants/${ids.r1}/products/${pid}`, { name_uz: 'X', price: 30000, ingredients: [{ name_uz: 'Y', unit: 'g', std_qty: 10, min_qty: 20, max_qty: 30, step: 5, step_price: 0 }] });
    assert.equal(r.status, 400);
    assert.equal((await call(e.base, 102, 'PUT', `/api/panel/restaurants/${ids.r1}/products/${pid}`, { name_uz: 'X', price: 30000, ingredients: [] })).status, 200, 'menejer ham tahrirlaydi');
    assert.equal((await call(e.base, 301, 'PUT', `/api/panel/restaurants/${ids.r1}/products/${pid}`, { name_uz: 'X', price: 1, ingredients: [] })).status, 403);
  });

  test('buyurtma: tanlov snapshot\'i saqlanadi, restoran xabarida "Maxsus", buyurtma sahifasida rasm va animatsiya turi', async () => {
    const [g, d] = await ingIds();
    const items = [{ product_id: pid, qty: 3, options: [{ id: g.id, qty: 300 }, { id: d.id, qty: 0 }] }];
    const q = (await quote(items)).body.quote;
    const r = await call(e.base, 301, 'POST', '/api/orders', {
      restaurant_id: ids.r1, type: 'delivery', address_id: addr, payment_method: 'cash', items, expected_total: q.total,
      customer_name: 'Ali Valiyev', customer_phone: '+998 90 123 45 67', idempotency_key: 'opt-order-123456',
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const o = (await call(e.base, 301, 'GET', `/api/orders/${r.body.order.id}`)).body.order;
    const it = o.items[0];
    assert.equal(it.qty, 3);
    assert.equal(it.price, 30000 + 6000 - 3000);
    assert.deepEqual(it.options.map((x) => [x.name_uz, x.qty, x.std]), [['Go‘sht', 300, 250], ['Dumba', 0, 30]]);
    assert.equal(it.cook_style, 'grill');
    assert.equal(it.prep_seconds, 30);
    const R = e.db.prepare('SELECT * FROM restaurants WHERE id = ?').get(ids.r1);
    const staff = e.services.templates.staffOrder(e.db.prepare('SELECT * FROM orders WHERE id = ?').get(o.id), R, 'uz').text;
    assert.match(staff, /Maxsus: Go‘sht 300 g, Dumba yo‘q/);
    // Panelda masalliq keyin o'zgarsa ham buyurtma snapshot'i o'zgarmaydi.
    await call(e.base, 101, 'PUT', `/api/panel/restaurants/${ids.r1}/products/${pid}`, { name_uz: 'Mol go‘shti shashlik', price: 30000, ingredients: [] });
    const o2 = (await call(e.base, 301, 'GET', `/api/orders/${o.id}`)).body.order;
    assert.equal(o2.items[0].options.length, 2);
  });
});
