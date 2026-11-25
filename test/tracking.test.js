// 15-bosqich: jonli kuzatuv, kuryer joylashuvi, baholash, qayta buyurtma, tarix, til.
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setup, seed, call } from './helpers.js';
import { locationState, travelEta, LIVE_MAX_AGE_MS, HIDE_AFTER_MS } from '../public/js/shared/tracking.js';

const MIN = 60_000;

async function env() {
  const e = await setup();
  const ids = seed(e.services);
  const S = e.services;
  S.users.upsertFromTelegram({ id: 104, first_name: 'K3' });
  ids.c3 = S.restaurants.addCourier(ids.r1, { userId: 104, name: 'Kuryer Uch' });
  e.db.prepare('UPDATE restaurants SET lat = 40.120, lon = 67.840 WHERE id = ?').run(ids.r1);
  e.db.prepare('UPDATE orders SET address_lat = 40.130, address_lon = 67.850 WHERE id = ?').run(ids.o1);
  // Mijoz manzili (qayta buyurtma uchun) — Jizzax shahri ichida.
  const addr = (await call(e.base, 301, 'POST', '/api/addresses', { text: 'Uy', lat: 40.1158, lon: 67.8422 })).body.address;
  const u = (id) => S.users.get(id);
  const go = async (status) => { S.orders.transition(u(101), ids.o1, status, status === 'accepted' ? { prepMinutes: 20 } : {}); await S.idle(); };
  const setLoc = (cid, lat, lon, ageMs) => e.db.prepare('UPDATE couriers SET last_lat = ?, last_lon = ?, last_location_at = ? WHERE id = ?').run(lat, lon, Date.now() - ageMs, cid);
  const track = async (userId) => call(e.base, userId, 'GET', `/api/orders/${ids.o1}/tracking`);
  return { ...e, ids, S, u, go, setLoc, track, addr };
}

describe('Joylashuv chegaralari (bitta joyda)', () => {
  test('3 daqiqagacha jonli, 20 daqiqagacha "oxirgi", keyin yashiriladi', () => {
    assert.equal(LIVE_MAX_AGE_MS, 3 * MIN);
    assert.equal(HIDE_AFTER_MS, 20 * MIN);
    assert.equal(locationState(0), 'live');
    assert.equal(locationState(3 * MIN), 'live');
    assert.equal(locationState(3 * MIN + 1), 'stale');
    assert.equal(locationState(20 * MIN), 'stale');
    assert.equal(locationState(20 * MIN + 1), 'hidden');
    assert.equal(locationState(NaN), 'hidden');
    assert.equal(locationState(-5000), 'live', 'kichik soat farqi');
    assert.deepEqual(travelEta(1000), { from: 4, to: 9 });
  });
});

describe('Kuzatuv API: kim, qachon, nimani ko\'radi', () => {
  let e;
  beforeEach(async () => { e = await env(); });
  afterEach(() => e.close());

  test('kuryer tayinlanmagan — tushunarli bo\'sh holat', async () => {
    e.db.prepare('UPDATE orders SET courier_id = NULL WHERE id = ?').run(e.ids.o1);
    await e.go('accepted');
    const t = (await e.track(301)).body.tracking;
    assert.equal(t.courier, null);
    assert.equal(t.location, null);
    assert.equal(t.location_reason, 'no_courier');
    assert.equal(t.eta.kind, 'prep');
    assert.ok(t.eta.from >= 19 && t.eta.from <= 20);
  });

  test('mijoz: "yo\'lda"gacha joylashuv yo\'q, xodim esa ko\'radi', async () => {
    await e.go('accepted');
    e.setLoc(e.ids.c1, 40.125, 67.845, 30_000);
    let t = (await e.track(301)).body.tracking;
    assert.equal(t.courier.name, 'Kuryer Bir');
    assert.equal(t.location, null);
    assert.equal(t.location_reason, 'not_on_way');
    t = (await e.track(101)).body.tracking;
    assert.equal(t.location.state, 'live');
  });

  test('yangi joylashuv — jonli, masofa va taxminiy vaqt; eski — "oxirgi", vaqt yo\'q; juda eski — yashirin', async () => {
    await e.go('accepted'); await e.go('ready'); await e.go('on_way');
    e.setLoc(e.ids.c1, 40.125, 67.845, 30_000);
    let t = (await e.track(301)).body.tracking;
    assert.equal(t.location.state, 'live');
    assert.ok(t.distance_m > 500 && t.distance_m < 1000, String(t.distance_m));
    assert.equal(t.distance_method, 'straight_line');
    assert.equal(t.eta.kind, 'travel');
    e.setLoc(e.ids.c1, 40.125, 67.845, 7 * MIN);
    t = (await e.track(301)).body.tracking;
    assert.equal(t.location.state, 'stale');
    assert.equal(t.eta, null, 'eski nuqtadan aniq vaqt hisoblanmaydi');
    e.setLoc(e.ids.c1, 40.125, 67.845, 25 * MIN); // GPS uzildi
    t = (await e.track(301)).body.tracking;
    assert.equal(t.location, null);
    assert.equal(t.location_reason, 'too_old');
  });

  test('kuryer almashdi — yangi kuryerning joylashuvi', async () => {
    await e.go('accepted');
    e.setLoc(e.ids.c1, 40.125, 67.845, 10_000);
    e.setLoc(e.ids.c3, 40.111, 67.833, 10_000);
    e.S.manage.assignCourier(e.u(101), e.ids.o1, e.ids.c3);
    await e.go('ready'); await e.go('on_way');
    const t = (await e.track(301)).body.tracking;
    assert.equal(t.courier.name, 'Kuryer Uch');
    assert.equal(t.location.lat, 40.111);
  });

  test('yetkazilgandan keyin mijoz API\'si jonli joylashuv qaytarmaydi', async () => {
    await e.go('accepted'); await e.go('ready'); await e.go('on_way');
    e.setLoc(e.ids.c1, 40.125, 67.845, 10_000);
    await e.go('delivered');
    const t = (await e.track(301)).body.tracking;
    assert.equal(t.location, null);
    assert.equal(t.courier, null);
    assert.equal(t.location_reason, 'finished');
    const o = (await call(e.base, 301, 'GET', `/api/orders/${e.ids.o1}`)).body.order;
    assert.equal(JSON.stringify(o).includes('last_lat'), false);
  });

  test('begona buyurtma: boshqa mijoz va boshqa restoran xodimi — 404', async () => {
    await e.go('accepted'); await e.go('ready'); await e.go('on_way');
    e.setLoc(e.ids.c1, 40.125, 67.845, 10_000);
    for (const uid of [302, 201, 203]) assert.equal((await e.track(uid)).status, 404, String(uid));
    assert.equal((await e.track(103)).status, 200, 'o\'z kuryeri');
  });
});

describe('Kuryer joylashuvini yozish', () => {
  let e;
  beforeEach(async () => { e = await env(); });
  afterEach(() => e.close());
  const loc = (id) => e.db.prepare('SELECT last_lat, last_location_at FROM couriers WHERE id = ?').get(id);

  test('ishda emas va faol buyurtmasi yo\'q — yozilmaydi', async () => {
    e.db.prepare('UPDATE orders SET courier_id = NULL WHERE id = ?').run(e.ids.o1);
    const r = await call(e.base, 103, 'POST', '/api/courier/location', { lat: 40.1, lon: 67.8 });
    assert.equal(r.body.saved, false);
    assert.equal(loc(e.ids.c1).last_lat, null);
  });

  test('faol buyurtmali kuryer "Ishni tugatdim" bossa ham kuzatuv uzilmaydi', async () => {
    await e.go('accepted'); await e.go('ready'); await e.go('on_way');
    await e.S.dispatch.setOnline(e.u(103), e.ids.c1, true);
    await e.S.dispatch.setOnline(e.u(103), e.ids.c1, false);
    const r = await call(e.base, 103, 'POST', '/api/courier/location', { lat: 40.126, lon: 67.846 });
    assert.equal(r.body.saved, true);
    assert.equal(r.body.next_ms, 15_000, 'yo\'lda — ~15 s');
    assert.equal(loc(e.ids.c1).last_lat, 40.126);
    assert.equal((await e.track(301)).body.tracking.location.state, 'live');
  });

  test('ishda, yo\'ldagi buyurtma yo\'q — ~60 s; noto\'g\'ri koordinata va kuryer emas', async () => {
    e.db.prepare('UPDATE orders SET courier_id = NULL WHERE id = ?').run(e.ids.o1);
    await e.S.dispatch.setOnline(e.u(103), e.ids.c1, true);
    assert.equal((await call(e.base, 103, 'POST', '/api/courier/location', { lat: 40.1, lon: 67.8 })).body.next_ms, 60_000);
    assert.equal((await call(e.base, 103, 'POST', '/api/courier/location', { lat: 999, lon: 67.8 })).body.saved, false);
    assert.equal((await call(e.base, 301, 'POST', '/api/courier/location', { lat: 40.1, lon: 67.8 })).status, 403);
  });
});

describe('Baholash, qayta buyurtma, tarix, til', () => {
  let e;
  beforeEach(async () => { e = await env(); });
  afterEach(() => e.close());
  const rating = () => e.db.prepare('SELECT rating_sum, rating_count FROM restaurants WHERE id = ?').get(e.ids.r1);

  test('baholash faqat yetkazilgan o\'z buyurtmasi; qayta baholash sonni oshirmaydi', async () => {
    const rate = (uid, body) => call(e.base, uid, 'POST', `/api/orders/${e.ids.o1}/rating`, body);
    assert.equal((await rate(301, { stars: 5 })).status, 409, 'hali yetkazilmagan');
    await e.go('accepted'); await e.go('ready'); await e.go('on_way'); await e.go('delivered');
    assert.equal((await rate(302, { stars: 1 })).status, 404, 'begona');
    assert.equal((await rate(301, { stars: 6 })).status, 400);
    let r = await rate(301, { stars: 4, comment: 'Yaxshi' });
    assert.equal(r.body.rating.updated, false);
    assert.deepEqual({ ...rating() }, { rating_sum: 4, rating_count: 1 });
    r = await rate(301, { stars: 2 });
    assert.equal(r.body.rating.updated, true);
    assert.deepEqual({ ...rating() }, { rating_sum: 2, rating_count: 1 });
    const o = (await call(e.base, 301, 'GET', `/api/orders/${e.ids.o1}`)).body.order;
    assert.equal(o.rating.stars, 2);
    const list = (await call(e.base, 301, 'GET', '/api/orders')).body.orders;
    assert.equal(list.find((x) => x.id === e.ids.o1).rating, 2);
  });

  test('tarixdan qayta buyurtma: joriy narx va mavjudlik qayta tekshiriladi', async () => {
    await e.go('accepted'); await e.go('ready'); await e.go('on_way'); await e.go('delivered');
    e.db.prepare('UPDATE products SET price = 40000 WHERE id = ?').run(e.ids.p1);
    let r = await call(e.base, 301, 'POST', `/api/orders/${e.ids.o1}/reorder`, { address_id: e.addr.id });
    assert.equal(r.status, 200);
    const line = r.body.lines.find((l) => l.product_id === e.ids.p1);
    assert.equal(line.price, 40000);
    assert.equal(line.previous_price, 35000);
    assert.equal(line.price_changed, true);
    assert.equal(line.qty, 2);
    assert.equal(r.body.items_total, 80000);
    e.db.prepare('UPDATE products SET is_available = 0 WHERE id = ?').run(e.ids.p1);
    r = await call(e.base, 301, 'POST', `/api/orders/${e.ids.o1}/reorder`, { address_id: e.addr.id });
    assert.equal(r.body.lines[0].status, 'unavailable');
    assert.equal(r.body.can_order, false);
    e.db.prepare('UPDATE products SET is_deleted = 1 WHERE id = ?').run(e.ids.p1);
    r = await call(e.base, 301, 'POST', `/api/orders/${e.ids.o1}/reorder`, { address_id: e.addr.id });
    assert.equal(r.body.lines[0].status, 'removed');
    assert.equal((await call(e.base, 302, 'POST', `/api/orders/${e.ids.o1}/reorder`, { address_id: e.addr.id })).status, 404);
    e.db.prepare("UPDATE restaurants SET status = 'blocked' WHERE id = ?").run(e.ids.r1);
    r = await call(e.base, 301, 'POST', `/api/orders/${e.ids.o1}/reorder`, { address_id: e.addr.id });
    assert.equal(r.status, 409);
    assert.equal(r.body.error.details.reason, 'restaurant_unavailable');
  });

  test('tarix: raqam, restoran, sana, jami, holat, taomlar soni', async () => {
    const [o] = (await call(e.base, 301, 'GET', '/api/orders')).body.orders;
    assert.equal(o.id, e.ids.o1);
    assert.equal(o.restaurant_name, 'Restoran Bir');
    assert.ok(o.created_at);
    assert.equal(o.total, 75000);
    assert.equal(o.status, 'new');
    assert.equal(o.items_count, 2);
  });

  test('til almashishi: profil va bot xabarlari yangi tilda', async () => {
    assert.equal((await call(e.base, 301, 'PUT', '/api/me/lang', { lang: 'ru' })).status, 200);
    assert.equal((await call(e.base, 301, 'GET', '/api/me')).body.user.lang, 'ru');
    const err = await call(e.base, 302, 'GET', `/api/orders/${e.ids.o1}/tracking`, undefined, { headers: { 'Accept-Language': 'ru' } });
    assert.equal(err.status, 404);
    const msg = e.S.templates.customerOrder(e.db.prepare('SELECT * FROM orders WHERE id = ?').get(e.ids.o1), { name: 'R' }, 'accepted', e.S.users.langOf(e.u(301)));
    assert.match(msg.text, /принят/);
  });
});
