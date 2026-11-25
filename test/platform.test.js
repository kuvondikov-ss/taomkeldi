// 10-bosqich: restoran arizasi → admin qarori → egasi; takliflar; bloklash; ko'rsatkichlar; tayyorlik; demo tozalash.
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setup, seed, call } from './helpers.js';
import { createBot } from '../src/bot/index.js';

const silent = { log() {}, warn() {}, error() {} };
const BOT_INFO = { id: 999000, is_bot: true, first_name: 'Taomkeldi', username: 'taomkeldi_test_bot', can_join_groups: true, can_read_all_group_messages: false, supports_inline_queries: false, can_connect_to_business: false, has_main_web_app: false };

let e; let ids; let sent; let bot;
async function env() {
  e = await setup({ BOT_USERNAME: 'taomkeldi_test_bot' });
  ids = seed(e.services);
  // Bot xabarlarini ushlab olamiz (Telegram'ga hech narsa ketmaydi).
  ({ bot } = createBot({ config: e.config, services: e.services, logger: silent, botInfo: BOT_INFO }));
  sent = [];
  bot.api.config.use(async (_p, method, payload) => {
    if (method === 'sendMessage') sent.push(payload);
    return { ok: true, result: method === 'sendMessage' ? { message_id: 1, date: 0, chat: { id: payload.chat_id, type: 'private' } } : true };
  });
  e.services.setBotApi(bot.api);
}
const APP = { name: 'Yangi Choyxona', phone: '+998 90 555 44 33', description: 'Milliy taomlar', lat: 40.13, lon: 67.83, address_text: 'Jizzax, Bunyodkor 3', cuisine_ids: [1, 2] };
const apply = (user = 401, body = APP) => call(e.base, user, 'POST', '/api/applications', body);
const admin = (path, body) => call(e.base, 900, 'POST', `/api/admin/restaurants/${path}`, body);
const tick = () => new Promise((r) => setTimeout(r, 30));

describe('Ariza → qaror → egasi', () => {
  beforeEach(env);
  afterEach(() => e.close());

  test('ariza: pending, oshxona turlari, adminga xabar; ikkinchi ariza mumkin emas', async () => {
    const r = await apply();
    assert.equal(r.status, 201);
    assert.equal(r.body.restaurant.status, 'pending');
    await tick();
    assert.ok(sent.some((m) => m.chat_id === 900 && m.text.includes('Yangi Choyxona')));
    assert.equal((await apply()).body.error.details.reason, 'application_exists');
    const mine = (await call(e.base, 401, 'GET', '/api/applications/mine')).body.applications;
    assert.deepEqual(mine.map((a) => a.status), ['pending']);
  });

  test('ariza nuqtasi Jizzax viloyatidan tashqarida — 422; telefon noto\'g\'ri — 400', async () => {
    assert.equal((await apply(402, { ...APP, lat: 41.2995, lon: 69.2401 })).body.error.code, 'OUT_OF_AREA');
    assert.equal((await apply(402, { ...APP, phone: '123' })).body.error.details.field, 'phone');
  });

  test('tasdiq: ariza beruvchi EGA bo\'ladi (menejer emas), xabar oladi, panelga kiradi', async () => {
    const id = (await apply()).body.restaurant.id;
    assert.equal((await call(e.base, 401, 'GET', `/api/panel/restaurants/${id}/readiness`)).status, 403, 'tasdiqgacha panel yo\'q');
    const ok = await admin(`${id}/approve`);
    assert.equal(ok.body.restaurant.status, 'active');
    const roles = (await call(e.base, 401, 'GET', '/api/me')).body.roles;
    assert.deepEqual(roles.staff.map((s) => [s.restaurantId, s.role]), [[id, 'owner']]);
    assert.ok(sent.some((m) => m.chat_id === 401 && m.text.includes('tasdiqlandi')));
    const ready = (await call(e.base, 401, 'GET', `/api/panel/restaurants/${id}/readiness`)).body;
    assert.equal(ready.viewer_role, 'owner');
    assert.deepEqual(ready.missing, ['menu', 'work_hours', 'couriers', 'group']);
    assert.equal((await admin(`${id}/approve`)).body.error.code, 'INVALID_TRANSITION', 'qayta tasdiqlab bo\'lmaydi');
  });

  test('rad: sabab majburiy, egasiga sabab bilan xabar, rol berilmaydi; keyin yangi ariza mumkin', async () => {
    const id = (await apply()).body.restaurant.id;
    assert.equal((await admin(`${id}/reject`, {})).status, 400);
    const r = await admin(`${id}/reject`, { reason: 'Telefon javob bermadi' });
    assert.equal(r.body.restaurant.status, 'rejected');
    assert.ok(sent.some((m) => m.chat_id === 401 && m.text.includes('Telefon javob bermadi')));
    assert.equal((await call(e.base, 401, 'GET', '/api/me')).body.roles.staff.length, 0);
    assert.equal((await apply()).status, 201, 'rad etilgandan keyin qayta ariza');
  });
});

describe('B yo\'l: admin yaratadi → egasiga havola', () => {
  beforeEach(env);
  afterEach(() => e.close());

  test('havola egasini bog\'laydi; ishlatilgan havola boshqaga ishlamaydi; yangi havola eskisini bekor qiladi', async () => {
    const rid = (await call(e.base, 900, 'POST', '/api/admin/restaurants', { name: 'Admin Kafe', status: 'active' })).body.restaurant.id;
    const a = (await call(e.base, 900, 'POST', `/api/panel/restaurants/${rid}/invites`, { kind: 'owner' })).body.invite;
    const b = (await call(e.base, 900, 'POST', `/api/panel/restaurants/${rid}/invites`, { kind: 'owner' })).body.invite;
    assert.match(b.link, /^https:\/\/t\.me\/taomkeldi_test_bot\?start=inv_/);
    assert.equal(e.services.invites.accept(e.services.users.upsertFromTelegram({ id: 501, first_name: 'A' }), a.start_payload).status, 'invalid', 'eski havola bekor');
    assert.equal(e.services.invites.accept(e.services.users.get(501), b.start_payload).status, 'ok');
    assert.equal(e.services.access.staffRole(e.services.users.get(501), rid), 'owner');
    assert.equal(e.services.invites.accept(e.services.users.upsertFromTelegram({ id: 502, first_name: 'B' }), b.start_payload).status, 'invalid');
    assert.equal(e.services.access.staffRole(e.services.users.get(502), rid), null);
  });
});

describe('Bloklash', () => {
  beforeEach(env);
  afterEach(() => e.close());

  test('bloklangan restoran yangi buyurtma olmaydi, katalogda yo\'q; egasiga xabar; faollashtirgach qaytadi', async () => {
    e.db.prepare('UPDATE restaurants SET lat = 40.12, lon = 67.84, delivery_radius_m = 8000 WHERE id = ?').run(ids.r1);
    const addr = (await call(e.base, 301, 'POST', '/api/addresses', { text: 'Uy', lat: 40.1158, lon: 67.8422 })).body.address.id;
    const orderBody = (k) => ({ restaurant_id: ids.r1, type: 'delivery', address_id: addr, payment_method: 'cash', items: [{ product_id: ids.p1, qty: 1 }], customer_name: 'Ali', customer_phone: '901234567', expected_total: 35000, idempotency_key: `blk-${k}-12345` });

    assert.equal((await admin(`${ids.r1}/block`, {})).status, 400, 'sabab majburiy');
    await admin(`${ids.r1}/block`, { reason: 'Shikoyatlar' });
    assert.ok(sent.some((m) => m.chat_id === 101 && m.text.includes('Shikoyatlar')), 'egasiga xabar');
    assert.equal((await call(e.base, 301, 'POST', '/api/orders', orderBody(1))).status, 404);
    assert.equal((await call(e.base, 301, 'GET', `/api/restaurants?address_id=${addr}`)).body.restaurants.length, 0);
    // Egasi panelda holat va sababni ko'radi.
    const ready = (await call(e.base, 101, 'GET', `/api/panel/restaurants/${ids.r1}/readiness`)).body;
    assert.deepEqual([ready.restaurant.status, ready.restaurant.status_reason], ['blocked', 'Shikoyatlar']);

    await admin(`${ids.r1}/unblock`);
    assert.equal((await call(e.base, 301, 'GET', `/api/restaurants?address_id=${addr}`)).body.restaurants.length, 1);
    const ev = e.db.prepare('SELECT type FROM restaurant_events WHERE restaurant_id = ? ORDER BY id').all(ids.r1).map((x) => x.type);
    assert.deepEqual(ev, ['blocked', 'unblocked']);
  });
});

describe('Platforma API himoyasi va ko\'rsatkichlar', () => {
  beforeEach(env);
  afterEach(() => e.close());

  test('oddiy foydalanuvchi, ega va menejer platforma API\'siga kira olmaydi', async () => {
    for (const user of [301, 101, 102]) {
      assert.equal((await call(e.base, user, 'GET', '/api/admin/overview')).status, 403);
      assert.equal((await call(e.base, user, 'GET', '/api/admin/restaurants/list')).status, 403);
      assert.equal((await call(e.base, user, 'POST', `/api/admin/restaurants/${ids.r2}/block`, { reason: 'xxx' })).status, 403);
      assert.equal((await call(e.base, user, 'POST', '/api/admin/demo/delete', { confirm: 'DEMO' })).status, 403);
    }
  });

  test('ko\'rsatkichlar va ro\'yxat (arizalar birinchi)', async () => {
    await apply();
    const o = (await call(e.base, 900, 'GET', '/api/admin/overview')).body.overview;
    assert.equal(o.restaurants.active, 2);
    assert.equal(o.restaurants.pending, 1);
    assert.equal(o.today.orders, 2);
    const list = (await call(e.base, 900, 'GET', '/api/admin/restaurants/list')).body.restaurants;
    assert.equal(list[0].status, 'pending');
    assert.deepEqual(list[0].cuisines, ['Milliy taomlar', 'Shashlik']);
    assert.equal((await call(e.base, 900, 'GET', '/api/admin/restaurants/list?status=pending')).body.restaurants.length, 1);
  });

  test('tayyorlik: begona restoran — 403; to\'ldirilgani belgilanadi', async () => {
    assert.equal((await call(e.base, 201, 'GET', `/api/panel/restaurants/${ids.r1}/readiness`)).status, 403);
    e.db.prepare(`UPDATE restaurants SET phone = '+998900000000', address_text = 'X', work_hours = '{"text":"9-22"}', lat = 40.12, lon = 67.84, group_chat_id = -100 WHERE id = ?`).run(ids.r1);
    const r = (await call(e.base, 102, 'GET', `/api/panel/restaurants/${ids.r1}/readiness`)).body;
    assert.equal(r.ready, true, JSON.stringify(r.missing));
    assert.equal(r.viewer_role, 'manager');
  });

  test('demo tozalash: tasdiqsiz ishlamaydi; faqat DEMO restoranlar va ularning buyurtmalari o\'chadi', async () => {
    e.db.prepare('UPDATE restaurants SET is_demo = 1 WHERE id = ?').run(ids.r2);
    assert.equal((await call(e.base, 900, 'POST', '/api/admin/demo/delete', { confirm: 'ha' })).status, 400);
    const r = await call(e.base, 900, 'POST', '/api/admin/demo/delete', { confirm: 'DEMO' });
    assert.deepEqual(r.body.deleted, { restaurants: 1, orders: 1 });
    assert.equal(e.db.prepare('SELECT COUNT(*) AS n FROM restaurants WHERE id = ?').get(ids.r2).n, 0);
    assert.equal(e.db.prepare('SELECT COUNT(*) AS n FROM restaurants WHERE id = ?').get(ids.r1).n, 1, 'haqiqiy restoran qoladi');
    assert.equal(e.db.prepare('SELECT COUNT(*) AS n FROM orders WHERE restaurant_id = ?').get(ids.r1).n, 1, 'haqiqiy buyurtma qoladi');
  });
});
