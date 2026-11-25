// 6-bosqich: bosh sahifa ro'yxati (oshxona turlari, aksiya, saralash), qidiruv, sevimlilar, restoran sahifasi.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setup, seed, call } from './helpers.js';
import { normalize } from '../src/services/catalog.js';
import { deliveryEta } from '../public/js/shared/geo-core.js';

const CITY = { lat: 40.1158, lon: 67.8422 };

// Shaharda 4 ta restoran, Zominda 1 ta (shahar manziliga yetkazmaydi).
async function catalogEnv() {
  const env = await setup();
  const ids = seed(env.services);
  const { db, services } = env;
  const admin = services.users.get(900);
  const cuisine = (slug) => db.prepare('SELECT id FROM cuisines WHERE slug = ?').get(slug).id;
  const place = db.prepare(`UPDATE restaurants SET lat = ?, lon = ?, delivery_radius_m = 8000, delivery_base = ?, delivery_base_m = 2000,
    delivery_per_km = 2000, prep_minutes = ?, rating_sum = ?, rating_count = ?, is_open = ? WHERE id = ?`);
  const make = (name) => services.restaurants.create(admin, { name, status: 'active' }).id;

  const r = {
    choyxona: ids.r1, // R1 — "Restoran Bir": osh 35 000 (seed)
    burger: make('Burger Uy'),
    pitsa: make('Pitsa Markaz'),
    yopiq: make('Yopiq Kafe'),
    zomin: ids.r2,
  };
  place.run(40.1200, 67.8400, 9000, 20, 46, 10, 1, r.choyxona);   // reyting 4.6 (10), ~0.5 km
  place.run(40.1300, 67.8600, 5000, 5, 0, 0, 1, r.burger);        // reytingsiz, arzon, ~2 km, tez tayyorlaydi
  place.run(40.1500, 67.8700, 7000, 40, 27, 6, 1, r.pitsa);       // 4.5 (6), uzoqroq, sekin
  place.run(40.1160, 67.8430, 4000, 10, 50, 10, 0, r.yopiq);      // eng yaxshi reyting, lekin yopiq
  place.run(39.9606, 68.3958, 6000, 20, 0, 0, 1, r.zomin);

  services.catalog.setRestaurantCuisines(admin, r.choyxona, [cuisine('milliy'), cuisine('shashlik')]);
  services.catalog.setRestaurantCuisines(admin, r.burger, [cuisine('fastfood')]);
  services.catalog.setRestaurantCuisines(admin, r.pitsa, [cuisine('pitsa'), cuisine('fastfood')]);
  services.catalog.setRestaurantCuisines(admin, r.yopiq, [cuisine('kofe')]);
  services.catalog.setRestaurantCuisines(admin, r.zomin, [cuisine('somsa')]);

  const cat = services.restaurants.addCategory(r.burger, 'Burgerlar');
  const p = {
    burger: services.restaurants.addProduct(r.burger, { categoryId: cat, name: 'Chizburger', price: 30000, oldPrice: 36000 }), // aksiya
    lavash: services.restaurants.addProduct(r.burger, { categoryId: cat, name: 'Lavash O‘zbekcha', price: 25000 }),
    pitsa: services.restaurants.addProduct(r.pitsa, { name: 'Pitsa Margarita', price: 60000, oldPrice: 50000 }), // eski narx past — aksiya EMAS
    stop: services.restaurants.addProduct(r.pitsa, { name: 'Pitsa Peperoni', price: 70000, oldPrice: 80000 }),
  };
  db.prepare('UPDATE products SET is_available = 0 WHERE id = ?').run(p.stop); // stop-listdagi aksiya hisoblanmaydi
  db.prepare("UPDATE products SET name_ru = 'Лаваш' WHERE id = ?").run(p.lavash);
  const deleted = services.restaurants.addProduct(r.burger, { name: 'O‘chirilgan burger', price: 1000 });
  db.prepare('UPDATE products SET is_deleted = 1 WHERE id = ?').run(deleted);
  services.restaurants.addProduct(r.zomin, { name: 'Zomin burger', price: 20000 });

  const addr = (await call(env.base, 301, 'POST', '/api/addresses', { text: 'Uy', lat: CITY.lat, lon: CITY.lon })).body.address.id;
  return { ...env, r, p, cuisine, addr };
}

describe('Bosh sahifa ro\'yxati', () => {
  let e;
  const list = async (q = '') => (await call(e.base, 301, 'GET', `/api/restaurants?address_id=${e.addr}${q}`)).body;
  const names = (b) => b.restaurants.map((x) => x.name);
  before(async () => { e = await catalogEnv(); });
  after(() => e.close());

  test('faqat yetkazadiganlar; oshxona turlari — shu manzildagilardan', async () => {
    const b = await list();
    assert.equal(b.total_in_area, 4);
    assert.ok(!names(b).includes('Restoran Ikki'), 'Zomin restorani yo\'q');
    const slugs = b.cuisines.map((c) => c.slug).sort();
    assert.deepEqual(slugs, ['fastfood', 'kofe', 'milliy', 'pitsa', 'shashlik']);
    assert.ok(!slugs.includes('somsa'), 'yetkazmaydigan restoranning turi chiqmaydi');
  });

  test('tavsiya: ochiqlar oldin, reyting × ishonch, keyin yaqinlik; yopiq oxirida', async () => {
    assert.deepEqual(names(await list()), ['Restoran Bir', 'Pitsa Markaz', 'Burger Uy', 'Yopiq Kafe']);
  });

  test('reyting: baholanganlar yuqoridan, baholanmagan oxirida (yopiq baribir pastda)', async () => {
    assert.deepEqual(names(await list('&sort=rating')), ['Restoran Bir', 'Pitsa Markaz', 'Burger Uy', 'Yopiq Kafe']);
  });

  test('tez yetkazish: taxminiy vaqt bo\'yicha', async () => {
    const b = await list('&sort=fast');
    const etas = b.restaurants.filter((x) => x.is_open).map((x) => x.delivery.eta_min.from);
    assert.deepEqual([...etas].sort((a, z) => a - z), etas);
    assert.equal(names(b)[0], 'Burger Uy');
  });

  test('arzon yetkazish — narx bo\'yicha saralash (bepul bo\'lim emas)', async () => {
    const b = await list('&sort=cheap_delivery');
    const fees = b.restaurants.filter((x) => x.is_open).map((x) => x.delivery.delivery_fee);
    assert.deepEqual([...fees].sort((a, z) => a - z), fees);
    assert.ok(fees.every((f) => f > 0), 'hech kim "bepul" deb ko\'rsatilmaydi');
  });

  test('oshxona turi filtri', async () => {
    assert.deepEqual(names(await list(`&cuisine=${e.cuisine('fastfood')}`)).sort(), ['Burger Uy', 'Pitsa Markaz']);
    const none = await list(`&cuisine=${e.cuisine('sushi')}`);
    assert.equal(none.restaurants.length, 0);
    assert.equal(none.total_in_area, 4, 'filtrlangan bo\'sh — hududda restoran yo\'q holatidan farq qiladi');
  });

  test('aksiya filtri: faqat haqiqiy chegirma (eski narx > narx, mavjud mahsulot)', async () => {
    assert.deepEqual(names(await list('&promo=1')), ['Burger Uy']);
  });

  test('reyting va baho o\'ylab topilmaydi; noto\'g\'ri saralash — 400', async () => {
    const b = await list();
    assert.equal(b.restaurants.find((x) => x.name === 'Burger Uy').rating, null);
    assert.deepEqual(b.restaurants.find((x) => x.name === 'Restoran Bir').rating, { value: 4.6, count: 10 });
    assert.equal((await call(e.base, 301, 'GET', `/api/restaurants?address_id=${e.addr}&sort=free`)).status, 400);
  });

  test('taxminiy yetkazish vaqti oralig\'i', () => {
    assert.deepEqual(deliveryEta({ prep_minutes: 20 }, 1000), { from: 30, to: 40 });
  });
});

describe('Qidiruv', () => {
  let e;
  const search = async (q) => (await call(e.base, 301, 'GET', `/api/search?address_id=${e.addr}&q=${encodeURIComponent(q)}`)).body;
  before(async () => { e = await catalogEnv(); });
  after(() => e.close());

  test('restoran nomi bo\'yicha (katta-kichik harf farqsiz)', async () => {
    const b = await search('BURGER');
    assert.deepEqual(b.restaurants.map((x) => x.name), ['Burger Uy']);
  });

  test('taom nomi bo\'yicha; natija turi ajratilgan; yetkazmaydigan va o\'chirilgan yo\'q', async () => {
    const b = await search('burger');
    assert.deepEqual(b.products.map((x) => x.name_uz), ['Chizburger']);
    assert.equal(b.products[0].restaurant_name, 'Burger Uy');
  });

  test('o\'zbekcha apostrof turlari bir xil; ruscha nom ham topiladi', async () => {
    assert.equal((await search("o'zbekcha")).products[0]?.name_uz, 'Lavash O‘zbekcha');
    assert.equal((await search('ЛАВАШ')).products[0]?.name_uz, 'Lavash O‘zbekcha');
  });

  test('stop-listdagi taom ko\'rinadi, lekin "tugagan" belgisi bilan va oxirida', async () => {
    const b = await search('pitsa');
    assert.deepEqual(b.products.map((x) => [x.name_uz, x.is_available]), [['Pitsa Margarita', true], ['Pitsa Peperoni', false]]);
  });

  test('oshxona turi nomi bo\'yicha restoran topiladi; qisqa so\'rov — 400', async () => {
    assert.deepEqual((await search('fast food')).restaurants.map((x) => x.name).sort(), ['Burger Uy', 'Pitsa Markaz']);
    assert.equal((await call(e.base, 301, 'GET', `/api/search?address_id=${e.addr}&q=a`)).status, 400);
  });

  test('normalize', () => assert.equal(normalize('  O‘zbek  ʻOsh` '), "o'zbek 'osh'"));
});

describe('Sevimlilar va restoran sahifasi', () => {
  let e;
  before(async () => { e = await catalogEnv(); });
  after(() => e.close());

  test('qo\'shish, ro\'yxat (yetkazmasa ham), olib tashlash; kartada belgisi', async () => {
    await call(e.base, 301, 'PUT', `/api/favorites/${e.r.burger}`);
    await call(e.base, 301, 'PUT', `/api/favorites/${e.r.zomin}`);
    await call(e.base, 301, 'PUT', `/api/favorites/${e.r.burger}`); // takror — dublikat yo'q
    const favs = (await call(e.base, 301, 'GET', `/api/favorites?address_id=${e.addr}`)).body.restaurants;
    assert.deepEqual(favs.map((x) => [x.name, x.delivery.deliverable]).sort(), [['Burger Uy', true], ['Restoran Ikki', false]]);
    const home = (await call(e.base, 301, 'GET', `/api/restaurants?address_id=${e.addr}`)).body.restaurants;
    assert.equal(home.find((x) => x.name === 'Burger Uy').is_favorite, true);
    assert.equal((await call(e.base, 302, 'GET', `/api/restaurants?lat=${CITY.lat}&lon=${CITY.lon}`)).body.restaurants.find((x) => x.name === 'Burger Uy').is_favorite, false, 'boshqa foydalanuvchiga ta\'sir qilmaydi');
    await call(e.base, 301, 'DELETE', `/api/favorites/${e.r.burger}`);
    assert.equal((await call(e.base, 301, 'GET', `/api/favorites?address_id=${e.addr}`)).body.restaurants.length, 1);
  });

  test('faol bo\'lmagan restoranni sevimliga qo\'shib bo\'lmaydi', async () => {
    const pending = e.services.restaurants.create(e.services.users.get(900), { name: 'Kutilmoqda' }).id;
    assert.equal((await call(e.base, 301, 'PUT', `/api/favorites/${pending}`)).status, 404);
  });

  test('restoran sahifasi: kategoriyalar va menyu, o\'chirilgan mahsulotsiz', async () => {
    const r = (await call(e.base, 301, 'GET', `/api/restaurants/${e.r.burger}?address_id=${e.addr}`)).body.restaurant;
    assert.deepEqual(r.categories.map((c) => c.name_uz), ['Burgerlar']);
    assert.deepEqual(r.products.map((p) => p.name_uz).sort(), ['Chizburger', 'Lavash O‘zbekcha']);
    assert.equal(r.card_number, undefined);
  });

  test('oshxona turlarini faqat o\'z xodimi o\'zgartiradi; noma\'lum tur — 400', async () => {
    assert.equal((await call(e.base, 202, 'PUT', `/api/panel/restaurants/${e.r.choyxona}/cuisines`, { cuisine_ids: [e.cuisine('pitsa')] })).status, 403);
    assert.equal((await call(e.base, 102, 'PUT', `/api/panel/restaurants/${e.r.choyxona}/cuisines`, { cuisine_ids: [99999] })).status, 400);
    const ok = await call(e.base, 102, 'PUT', `/api/panel/restaurants/${e.r.choyxona}/cuisines`, { cuisine_ids: [e.cuisine('milliy')] });
    assert.deepEqual(ok.body.cuisines.map((c) => c.slug), ['milliy']);
    assert.equal((await call(e.base, 301, 'GET', '/api/cuisines')).body.cuisines.length, 11);
  });
});
