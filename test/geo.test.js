// 5-bosqich: Jizzax viloyati chegarasi, manzillar, radius, restoranlar ro'yxati, geokoder.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { setup, seed, call } from './helpers.js';
import { pointInGeometry, distanceMeters, deliveryFee } from '../public/js/shared/geo-core.js';

const REGION = JSON.parse(fs.readFileSync('public/geo/jizzax.json', 'utf8'));
const inside = (lat, lon) => pointInGeometry(REGION.geometry, lat, lon);

// Nuqtalar: viloyat ichida (shahar ham, tumanlar ham) va tashqarisida (qo'shni viloyatlar).
const IN = { 'Jizzax shahri': [40.1158, 67.8422], Zomin: [39.9606, 68.3958], Gallaorol: [40.0247, 67.5983], Paxtakor: [40.3153, 67.9544], Forish: [40.5167, 66.9333] };
const OUT = { Toshkent: [41.2995, 69.2401], Samarqand: [39.6542, 66.9597], Guliston: [40.4897, 68.7842], Xovos: [40.2183, 68.8361] };
const CITY = { lat: 40.1158, lon: 67.8422 };

describe('Chegara (viloyat, shahar emas)', () => {
  test('fayl OSM viloyat chegarasi va attribution bilan', () => {
    assert.equal(REGION.properties.osm, 'relation/196254');
    assert.match(REGION.properties.attribution, /OpenStreetMap/);
  });
  for (const [name, [lat, lon]] of Object.entries(IN)) test(`ichida: ${name}`, () => assert.equal(inside(lat, lon), true));
  for (const [name, [lat, lon]] of Object.entries(OUT)) test(`tashqarida: ${name}`, () => assert.equal(inside(lat, lon), false));
  test('noto\'g\'ri koordinata — tashqarida', () => assert.equal(inside(NaN, 67), false));
});

describe('Masofa va yetkazish narxi (bitta funksiya)', () => {
  test('to\'g\'ri chiziq masofasi', () => {
    const d = distanceMeters(40.1158, 67.8422, 40.1248, 67.8422); // ~1 km shimolga
    assert.ok(d > 990 && d < 1010, String(d));
  });
  test('narx: baza masofagacha baza narx, keyin har boshlangan km', () => {
    const r = { delivery_base: 8000, delivery_base_m: 2000, delivery_per_km: 2000 };
    assert.equal(deliveryFee(r, 0), 8000);
    assert.equal(deliveryFee(r, 2000), 8000);
    assert.equal(deliveryFee(r, 2001), 10000);
    assert.equal(deliveryFee(r, 4500), 14000);
  });
});

describe('API: manzillar va hudud', () => {
  let env;
  before(async () => { env = await setup(); seed(env.services); });
  after(() => env.close());

  test('hududdan tashqaridagi manzil saqlanmaydi (422 OUT_OF_AREA)', async () => {
    const r = await call(env.base, 301, 'POST', '/api/addresses', { text: 'Toshkent', lat: OUT.Toshkent[0], lon: OUT.Toshkent[1] });
    assert.equal(r.status, 422);
    assert.equal(r.body.error.code, 'OUT_OF_AREA');
  });

  test('ichidagi manzil: saqlash, tahrirlash, asosiy qilish, o\'chirish', async () => {
    const a = await call(env.base, 301, 'POST', '/api/addresses', { text: 'Uy', lat: CITY.lat, lon: CITY.lon, entrance: '2', floor: '3', apartment: '15' });
    assert.equal(a.status, 201);
    assert.equal(a.body.address.in_service_area, true);
    const b = await call(env.base, 301, 'POST', '/api/addresses', { text: 'Zomin dacha', lat: IN.Zomin[0], lon: IN.Zomin[1] });
    assert.equal(b.body.address.is_default, 0);

    const moved = await call(env.base, 301, 'PUT', `/api/addresses/${a.body.address.id}`, { text: 'Uy', lat: OUT.Guliston[0], lon: OUT.Guliston[1] });
    assert.equal(moved.status, 422, 'tahrirda ham hudud tekshiriladi');

    const def = await call(env.base, 301, 'POST', `/api/addresses/${b.body.address.id}/default`);
    assert.equal(def.body.address.is_default, 1);
    const list = (await call(env.base, 301, 'GET', '/api/addresses')).body.addresses;
    assert.deepEqual(list.map((x) => x.is_default), [1, 0]);

    await call(env.base, 301, 'DELETE', `/api/addresses/${b.body.address.id}`);
    const after = (await call(env.base, 301, 'GET', '/api/addresses')).body.addresses;
    assert.equal(after.length, 1);
    assert.equal(after[0].is_default, 1, 'asosiy o\'chirilsa, qolgani asosiy bo\'ladi');
  });

  test('begona manzilni tahrirlab/asosiy qilib bo\'lmaydi', async () => {
    const mine = (await call(env.base, 301, 'GET', '/api/addresses')).body.addresses[0];
    assert.equal((await call(env.base, 302, 'PUT', `/api/addresses/${mine.id}`, { text: 'x', lat: CITY.lat, lon: CITY.lon })).status, 404);
    assert.equal((await call(env.base, 302, 'POST', `/api/addresses/${mine.id}/default`)).status, 404);
  });

  test('saqlangan manzil yaroqsiz bo\'lib qolsa: belgilanadi, ishlatilmaydi', async () => {
    const a = await call(env.base, 302, 'POST', '/api/addresses', { text: 'Eski', lat: CITY.lat, lon: CITY.lon });
    env.db.prepare('UPDATE addresses SET lat = ?, lon = ? WHERE id = ?').run(OUT.Samarqand[0], OUT.Samarqand[1], a.body.address.id);
    const list = (await call(env.base, 302, 'GET', '/api/addresses')).body.addresses;
    assert.equal(list[0].in_service_area, false);
    assert.equal((await call(env.base, 302, 'GET', `/api/restaurants?address_id=${a.body.address.id}`)).body.error.code, 'OUT_OF_AREA');
    assert.equal((await call(env.base, 302, 'POST', `/api/addresses/${a.body.address.id}/default`)).status, 422);
  });

  test('/api/geo/check va /api/config bir xil chegara faylini beradi', async () => {
    assert.equal((await call(env.base, 301, 'GET', `/api/geo/check?lat=${IN.Zomin[0]}&lon=${IN.Zomin[1]}`)).body.inside, true);
    assert.equal((await call(env.base, 301, 'GET', `/api/geo/check?lat=${OUT.Xovos[0]}&lon=${OUT.Xovos[1]}`)).body.inside, false);
    const cfg = (await call(env.base, 301, 'GET', '/api/config')).body;
    assert.equal(cfg.distance_method, 'straight_line');
    const served = await (await fetch(env.base + cfg.region.geojson_url)).json();
    assert.deepEqual(served, env.services.geo.region, 'Mini App va server bir xil fayl');
  });
});

describe('API: manzilga yetkazadigan restoranlar', () => {
  let env; let ids; let addrId;
  before(async () => {
    env = await setup();
    ids = seed(env.services);
    const set = env.db.prepare('UPDATE restaurants SET lat = ?, lon = ?, delivery_radius_m = ?, delivery_base = 8000, delivery_base_m = 2000, delivery_per_km = 2000, is_open = ? WHERE id = ?');
    set.run(40.1210, 67.8400, 5000, 1, ids.r1);            // shaharda, radius ichida
    set.run(IN.Zomin[0], IN.Zomin[1], 5000, 1, ids.r2);    // Zomin — shahar manziliga radiusdan tashqarida
    const admin = env.services.users.get(900);
    const closed = env.services.restaurants.create(admin, { name: 'Yopiq', status: 'active' });
    set.run(40.1100, 67.8500, 5000, 0, closed.id);
    const pending = env.services.restaurants.create(admin, { name: 'Kutilmoqda' });
    set.run(40.1150, 67.8420, 5000, 1, pending.id);
    env.services.restaurants.create(admin, { name: 'Joylashuvsiz', status: 'active' });
    addrId = (await call(env.base, 301, 'POST', '/api/addresses', { text: 'Uy', lat: CITY.lat, lon: CITY.lon })).body.address.id;
  });
  after(() => env.close());

  test('faqat radius ichidagi FAOL restoranlar; yopiq ham ko\'rinadi, holati bilan', async () => {
    const r = await call(env.base, 301, 'GET', `/api/restaurants?address_id=${addrId}`);
    assert.equal(r.status, 200);
    const names = r.body.restaurants.map((x) => x.name);
    assert.deepEqual(names, ['Restoran Bir', 'Yopiq'], 'ochiqlar oldin; Zomin, kutilayotgan va joylashuvsiz yo\'q');
    const [open, closed] = r.body.restaurants;
    assert.equal(open.is_open, true);
    assert.equal(closed.is_open, false);
    assert.equal(open.delivery.distance_method, 'straight_line');
    assert.equal(open.delivery.delivery_fee, 8000);
    assert.equal(open.card_number, undefined, 'to\'lov rekvizitlari mijozga chiqmaydi');
  });

  test('Zomindagi nuqta uchun — Zomin restorani', async () => {
    const r = await call(env.base, 301, 'GET', `/api/restaurants?lat=${IN.Zomin[0] + 0.01}&lon=${IN.Zomin[1]}`);
    assert.deepEqual(r.body.restaurants.map((x) => x.name), ['Restoran Ikki']);
  });

  test('hududdan tashqaridagi nuqta — 422', async () => {
    const r = await call(env.base, 301, 'GET', `/api/restaurants?lat=${OUT.Toshkent[0]}&lon=${OUT.Toshkent[1]}`);
    assert.equal(r.status, 422);
  });

  test('restoran sahifasi: yetkazmasa deliverable=false; faol emas — 404', async () => {
    const far = await call(env.base, 301, 'GET', `/api/restaurants/${ids.r2}?address_id=${addrId}`);
    assert.equal(far.body.restaurant.delivery.deliverable, false);
    assert.equal(far.body.restaurant.delivery.reason, 'out_of_radius');
    const pendingId = env.db.prepare("SELECT id FROM restaurants WHERE name = 'Kutilmoqda'").get().id;
    assert.equal((await call(env.base, 301, 'GET', `/api/restaurants/${pendingId}?address_id=${addrId}`)).status, 404);
  });

  test('checkout tekshiruvi (8-bosqich uchun): yopiq va radiusdan tashqari rad etiladi', () => {
    const closedId = env.db.prepare("SELECT id FROM restaurants WHERE name = 'Yopiq'").get().id;
    assert.throws(() => env.services.restaurants.assertCanDeliver(closedId, CITY), { code: 'CONFLICT' });
    assert.throws(() => env.services.restaurants.assertCanDeliver(ids.r2, CITY), { code: 'NOT_DELIVERABLE' });
    assert.equal(env.services.restaurants.assertCanDeliver(ids.r1, CITY).delivery.deliverable, true);
  });

  test('restoran joylashuvi: o\'z xodimi o\'zgartiradi, hudud tekshiriladi, begona — 403', async () => {
    const ok = await call(env.base, 102, 'PUT', `/api/panel/restaurants/${ids.r1}/location`, { lat: 40.12, lon: 67.84, delivery_radius_m: 7000 });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.restaurant.delivery_radius_m, 7000);
    const out = await call(env.base, 102, 'PUT', `/api/panel/restaurants/${ids.r1}/location`, { lat: OUT.Toshkent[0], lon: OUT.Toshkent[1] });
    assert.equal(out.body.error.code, 'OUT_OF_AREA');
    const foreign = await call(env.base, 202, 'PUT', `/api/panel/restaurants/${ids.r1}/location`, { lat: 40.12, lon: 67.84 });
    assert.equal(foreign.status, 403);
  });
});

describe('Geokoder (server proksi)', () => {
  let env; let calls;
  before(async () => {
    calls = [];
    const fakeFetch = async (url) => {
      calls.push(String(url));
      if (String(url).includes('/search')) {
        return { ok: true, json: async () => [
          { display_name: 'Sharof Rashidov ko\'chasi, Jizzax', lat: '40.12', lon: '67.84' },
          { display_name: 'Toshkent (tashqarida)', lat: '41.29', lon: '69.24' },
        ] };
      }
      if (String(url).includes('lat=40.11111')) return { ok: false, status: 500 };
      return { ok: true, json: async () => ({ display_name: 'Jizzax, Uy 5' }) };
    };
    env = await setup({ GEOCODER_ENABLED: '1' }, { fetchImpl: fakeFetch });
    seed(env.services);
  });
  after(() => env.close());

  test('qidiruv natijalari faqat viloyat ichidagilar; bir xil so\'rov keshdan', async () => {
    const r = await call(env.base, 301, 'GET', '/api/geo/search?q=Rashidov');
    assert.deepEqual(r.body.results.map((x) => x.text), ['Sharof Rashidov ko\'chasi, Jizzax']);
    assert.ok(calls[0].includes('bounded=1') && calls[0].includes('countrycodes=uz'));
    await call(env.base, 301, 'GET', '/api/geo/search?q=Rashidov');
    assert.equal(calls.filter((c) => c.includes('/search')).length, 1);
  });

  test('qisqa so\'rov — 400; tashqaridagi teskari so\'rov — 422 (tashqi xizmatga bormaydi)', async () => {
    assert.equal((await call(env.base, 301, 'GET', '/api/geo/search?q=ab')).status, 400);
    const before = calls.length;
    assert.equal((await call(env.base, 301, 'GET', `/api/geo/reverse?lat=${OUT.Toshkent[0]}&lon=${OUT.Toshkent[1]}`)).status, 422);
    assert.equal(calls.length, before);
  });

  test('koordinatadan manzil; xizmat xatosi — 503 GEOCODER_UNAVAILABLE', async () => {
    const ok = await call(env.base, 301, 'GET', '/api/geo/reverse?lat=40.12&lon=67.84');
    assert.equal(ok.body.place.text, 'Jizzax, Uy 5');
    const bad = await call(env.base, 301, 'GET', '/api/geo/reverse?lat=40.11111&lon=67.84');
    assert.equal(bad.status, 503);
    assert.equal(bad.body.error.code, 'GEOCODER_UNAVAILABLE');
  });

  test('geokoder o\'chirilgan bo\'lsa — 503, tashqi so\'rov yo\'q', async () => {
    const off = await setup();
    const r = await call(off.base, 301, 'GET', '/api/geo/search?q=Rashidov');
    assert.equal(r.status, 503);
    await off.close();
  });
});
