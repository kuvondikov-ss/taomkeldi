// 2-bosqich sinovlari: initData, rollar va kirish huquqlari, xatolar, upload, pul, saqlanish.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setup, seed, call, makeInitData, tgUser, TEST_TOKEN } from './helpers.js';
import { validateInitData } from '../src/http/initData.js';
import { loadConfig } from '../src/config.js';
import { openDb } from '../src/db/index.js';
import { latestMigrationId } from '../src/db/migrations.js';
import { createServices } from '../src/services/index.js';

describe('initData tekshiruvi', () => {
  const opts = { maxAgeSec: 3600 };

  test('to\'g\'ri imzo qabul qilinadi', () => {
    const r = validateInitData(makeInitData(tgUser(5)), TEST_TOKEN, opts);
    assert.equal(r.user.id, 5);
  });

  test('o\'zgartirilgan user rad etiladi', () => {
    const p = new URLSearchParams(makeInitData(tgUser(5)));
    p.set('user', JSON.stringify(tgUser(6)));
    assert.throws(() => validateInitData(p.toString(), TEST_TOKEN, opts), { code: 'AUTH_INVALID' });
  });

  test('boshqa bot tokeni bilan imzolangan rad etiladi', () => {
    const data = makeInitData(tgUser(5), { token: '999:other' });
    assert.throws(() => validateInitData(data, TEST_TOKEN, opts), { code: 'AUTH_INVALID' });
  });

  test('eskirgan auth_date rad etiladi', () => {
    const data = makeInitData(tgUser(5), { authDate: Math.floor(Date.now() / 1000) - 7200 });
    assert.throws(() => validateInitData(data, TEST_TOKEN, opts), { code: 'AUTH_EXPIRED' });
  });

  test('kelajakdagi auth_date rad etiladi', () => {
    const data = makeInitData(tgUser(5), { authDate: Math.floor(Date.now() / 1000) + 3600 });
    assert.throws(() => validateInitData(data, TEST_TOKEN, opts), { code: 'AUTH_INVALID' });
  });

  test('hash yo\'q yoki bo\'sh initData rad etiladi', () => {
    const p = new URLSearchParams(makeInitData(tgUser(5)));
    p.delete('hash');
    assert.throws(() => validateInitData(p.toString(), TEST_TOKEN, opts), { code: 'AUTH_INVALID' });
    assert.throws(() => validateInitData('', TEST_TOKEN, opts), { code: 'AUTH_INVALID' });
  });

  test('signature maydoni bo\'lsa ham hash bo\'yicha tekshiriladi', () => {
    const data = makeInitData(tgUser(5), { extra: { signature: 'abc' } });
    assert.equal(validateInitData(data, TEST_TOKEN, opts).user.id, 5);
  });
});

describe('Konfiguratsiya xavfsizligi', () => {
  test('production\'da DEV_AUTH va AUTO_ADMIN o\'chiq', () => {
    const c = loadConfig({ NODE_ENV: 'production', DEV_AUTH: '1', AUTO_ADMIN: '1', PLATFORM_ADMIN_IDS: '1' });
    assert.equal(c.devAuth, false);
    assert.equal(c.autoAdmin, false);
    assert.ok(c.warnings.some((w) => w.startsWith('DEV_AUTH')));
    assert.ok(c.warnings.some((w) => w.startsWith('AUTO_ADMIN')));
  });

  test('Railway production muhiti ham production deb aniqlanadi', () => {
    const c = loadConfig({ RAILWAY_ENVIRONMENT_NAME: 'production', DEV_AUTH: '1' });
    assert.equal(c.isProduction, true);
    assert.equal(c.devAuth, false);
  });
});

describe('API: autentifikatsiya va rollar', () => {
  let env; let ids;
  before(async () => {
    env = await setup();
    ids = seed(env.services);
  });
  after(() => env.close());

  test('initData\'siz so\'rov 401 AUTH_REQUIRED', async () => {
    const r = await call(env.base, null, 'GET', '/api/me');
    assert.equal(r.status, 401);
    assert.equal(r.body.error.code, 'AUTH_REQUIRED');
    assert.ok(r.body.error.message.length > 0);
  });

  test('soxta initData 401 AUTH_INVALID', async () => {
    const r = await call(env.base, null, 'GET', '/api/me', undefined, { headers: { Authorization: 'tma user=%7B%22id%22%3A900%7D&hash=' + 'a'.repeat(64) } });
    assert.equal(r.status, 401);
    assert.equal(r.body.error.code, 'AUTH_INVALID');
  });

  test('DEV_AUTH sarlavhasi yoqilmagan muhitda ishlamaydi', async () => {
    const r = await call(env.base, null, 'GET', '/api/me', undefined, { headers: { 'X-Dev-User': '900' } });
    assert.equal(r.status, 401);
  });

  test('/api/me rollarni to\'g\'ri qaytaradi', async () => {
    const owner = await call(env.base, 101, 'GET', '/api/me');
    assert.equal(owner.status, 200);
    assert.deepEqual(owner.body.roles.staff.map((s) => [s.restaurantId, s.role]), [[ids.r1, 'owner']]);
    assert.equal(owner.body.roles.platformAdmin, false);

    const courier = await call(env.base, 103, 'GET', '/api/me');
    assert.deepEqual(courier.body.roles.courier.map((c) => c.restaurantId), [ids.r1]);

    const admin = await call(env.base, 900, 'GET', '/api/me');
    assert.equal(admin.body.roles.platformAdmin, true);
  });

  test('mijoz boshqa mijoz buyurtmasini ko\'ra olmaydi', async () => {
    const own = await call(env.base, 301, 'GET', `/api/orders/${ids.o1}`);
    assert.equal(own.status, 200);
    assert.equal(own.body.order.viewer_role, 'customer');

    const other = await call(env.base, 302, 'GET', `/api/orders/${ids.o1}`);
    assert.equal(other.status, 404);
    assert.equal(other.body.error.code, 'NOT_FOUND');

    const list = await call(env.base, 302, 'GET', '/api/orders');
    assert.deepEqual(list.body.orders.map((o) => o.id), [ids.o2]);
  });

  test('menejer boshqa restoran panelini ko\'ra olmaydi', async () => {
    const own = await call(env.base, 102, 'GET', `/api/panel/restaurants/${ids.r1}`);
    assert.equal(own.status, 200);

    const other = await call(env.base, 102, 'GET', `/api/panel/restaurants/${ids.r2}`);
    assert.equal(other.status, 403);
    assert.equal(other.body.error.code, 'FORBIDDEN');

    const otherOrders = await call(env.base, 102, 'GET', `/api/panel/restaurants/${ids.r2}/orders`);
    assert.equal(otherOrders.status, 403);

    const foreignOrder = await call(env.base, 102, 'GET', `/api/orders/${ids.o2}`);
    assert.equal(foreignOrder.status, 404);
  });

  test('mavjud bo\'lmagan restoran ID\'si oddiy foydalanuvchiga 403 (mavjudlik oshkor qilinmaydi)', async () => {
    const r = await call(env.base, 102, 'GET', '/api/panel/restaurants/99999');
    assert.equal(r.status, 403);
  });

  test('kuryer begona restoran buyurtmasini ko\'ra olmaydi', async () => {
    const own = await call(env.base, 103, 'GET', `/api/orders/${ids.o1}`);
    assert.equal(own.status, 200);
    assert.equal(own.body.order.viewer_role, 'courier');

    const foreign = await call(env.base, 103, 'GET', `/api/orders/${ids.o2}`);
    assert.equal(foreign.status, 404);

    const list = await call(env.base, 103, 'GET', '/api/courier/orders');
    assert.deepEqual(list.body.orders.map((o) => o.id), [ids.o1]);
  });

  test('kuryer bo\'lmagan odamga kuryer API yopiq', async () => {
    const r = await call(env.base, 301, 'GET', '/api/courier/orders');
    assert.equal(r.status, 403);
  });

  test('kuryer restoran paneliga kira olmaydi', async () => {
    const r = await call(env.base, 103, 'GET', `/api/panel/restaurants/${ids.r1}`);
    assert.equal(r.status, 403);
  });

  test('karta raqami: egasiga to\'liq, menejerga va adminga maskalangan', async () => {
    const owner = await call(env.base, 101, 'GET', `/api/panel/restaurants/${ids.r1}`);
    assert.equal(owner.body.restaurant.card_number, '8600123456789012');
    const manager = await call(env.base, 102, 'GET', `/api/panel/restaurants/${ids.r1}`);
    assert.equal(manager.body.restaurant.card_number, '8600 **** **** 9012');
    const admin = await call(env.base, 900, 'GET', `/api/panel/restaurants/${ids.r1}`);
    assert.equal(admin.body.restaurant.card_number, '8600 **** **** 9012');
  });

  test('karta rekvizitini faqat egasi o\'zgartiradi', async () => {
    const body = { card_number: '9860 0000 1111 2222', card_holder: 'X' };
    const manager = await call(env.base, 102, 'PUT', `/api/panel/restaurants/${ids.r1}/payment`, body);
    assert.equal(manager.status, 403);
    assert.equal(manager.body.error.code, 'OWNER_ONLY');
    const otherOwner = await call(env.base, 201, 'PUT', `/api/panel/restaurants/${ids.r1}/payment`, body);
    assert.equal(otherOwner.status, 403);
    assert.equal(otherOwner.body.error.code, 'FORBIDDEN');
    const admin = await call(env.base, 900, 'PUT', `/api/panel/restaurants/${ids.r1}/payment`, body);
    assert.equal(admin.status, 403);
    const owner = await call(env.base, 101, 'PUT', `/api/panel/restaurants/${ids.r1}/payment`, body);
    assert.equal(owner.status, 200);
    assert.equal(owner.body.restaurant.card_number, '9860000011112222');
  });

  test('noto\'g\'ri karta raqami 400 VALIDATION', async () => {
    const r = await call(env.base, 101, 'PUT', `/api/panel/restaurants/${ids.r1}/payment`, { card_number: '123', card_holder: 'X' });
    assert.equal(r.status, 400);
    assert.equal(r.body.error.code, 'VALIDATION');
    assert.equal(r.body.error.details.field, 'card_number');
  });

  test('platforma API faqat adminga', async () => {
    const user = await call(env.base, 301, 'GET', '/api/admin/restaurants');
    assert.equal(user.status, 403);
    const owner = await call(env.base, 101, 'POST', '/api/admin/restaurants', { name: 'X' });
    assert.equal(owner.status, 403);
    const admin = await call(env.base, 900, 'GET', '/api/admin/restaurants');
    assert.equal(admin.status, 200);
    assert.equal(admin.body.restaurants.length, 2);
  });

  test('manzillar: faqat o\'ziniki, begonasini o\'chira olmaydi', async () => {
    const created = await call(env.base, 301, 'POST', '/api/addresses', { text: 'Jizzax, Sh. Rashidov 1', lat: 40.12, lon: 67.84 });
    assert.equal(created.status, 201);
    assert.equal(created.body.address.is_default, 1);
    const addrId = created.body.address.id;

    const foreign = await call(env.base, 302, 'DELETE', `/api/addresses/${addrId}`);
    assert.equal(foreign.status, 404);
    const otherList = await call(env.base, 302, 'GET', '/api/addresses');
    assert.equal(otherList.body.addresses.length, 0);

    const bad = await call(env.base, 301, 'POST', '/api/addresses', { text: 'x', lat: 200, lon: 67 });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.error.details.field, 'lat');

    const del = await call(env.base, 301, 'DELETE', `/api/addresses/${addrId}`);
    assert.equal(del.status, 200);
  });

  test('ruscha tanlangan foydalanuvchiga xato matni ruscha', async () => {
    await call(env.base, 302, 'PUT', '/api/me/lang', { lang: 'ru' });
    const r = await call(env.base, 302, 'GET', `/api/orders/${ids.o1}`);
    assert.equal(r.body.error.code, 'NOT_FOUND');
    assert.equal(r.body.error.message, 'Не найдено.');
  });

  test('noto\'g\'ri JSON va noma\'lum yo\'l barqaror kod bilan', async () => {
    const res = await fetch(`${env.base}/api/addresses`, {
      method: 'POST',
      headers: { Authorization: `tma ${makeInitData(tgUser(301))}`, 'Content-Type': 'application/json' },
      body: '{bad',
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.code, 'VALIDATION');
    const unknown = await call(env.base, 301, 'GET', '/api/nope');
    assert.equal(unknown.status, 404);
    assert.equal(unknown.body.error.code, 'NOT_FOUND');
  });
});

describe('Upload tekshiruvi', () => {
  let env; let ids;
  const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
  before(async () => {
    env = await setup({ UPLOAD_MAX_BYTES: '1024' });
    ids = seed(env.services);
  });
  after(() => env.close());

  test('to\'g\'ri PNG yuklanadi va ochiladi', async () => {
    const r = await call(env.base, 102, 'POST', `/api/panel/restaurants/${ids.r1}/uploads`, PNG, { headers: { 'Content-Type': 'image/png' } });
    assert.equal(r.status, 201);
    assert.equal(r.body.file.mime, 'image/png');
    const file = await fetch(env.base + r.body.file.path);
    assert.equal(file.status, 200);
  });

  test('rasm emas (imzo mos emas) — 415, Content-Type yolg\'on bo\'lsa ham', async () => {
    const r = await call(env.base, 101, 'POST', `/api/panel/restaurants/${ids.r1}/uploads`, Buffer.from('<script>alert(1)</script>'), { headers: { 'Content-Type': 'image/png' } });
    assert.equal(r.status, 415);
    assert.equal(r.body.error.code, 'UPLOAD_TYPE');
  });

  test('hajmi katta — 413', async () => {
    const big = Buffer.concat([PNG, Buffer.alloc(4096)]);
    const r = await call(env.base, 101, 'POST', `/api/panel/restaurants/${ids.r1}/uploads`, big, { headers: { 'Content-Type': 'image/png' } });
    assert.equal(r.status, 413);
    assert.equal(r.body.error.code, 'UPLOAD_TOO_LARGE');
  });

  test('begona restoranga yuklash — 403', async () => {
    const r = await call(env.base, 102, 'POST', `/api/panel/restaurants/${ids.r2}/uploads`, PNG, { headers: { 'Content-Type': 'image/png' } });
    assert.equal(r.status, 403);
  });
});

describe('Buyurtma asosi: pul, snapshot, idempotency', () => {
  let env; let ids;
  before(async () => {
    env = await setup();
    ids = seed(env.services);
  });
  after(() => env.close());

  test('summalar serverda butun so\'mda hisoblanadi', () => {
    const o = env.services.orders.getForActor(env.services.users.get(301), ids.o1);
    assert.equal(o.items_total, 70000);
    assert.equal(o.delivery_fee, 5000);
    assert.equal(o.total, 75000);
    assert.ok(Number.isInteger(o.total));
  });

  test('mahsulot narxi o\'zgarsa, eski buyurtma o\'zgarmaydi (snapshot)', () => {
    env.services.restaurants.setProductPrice(ids.r1, ids.p1, 40000);
    const o = env.services.orders.getForActor(env.services.users.get(301), ids.o1);
    assert.equal(o.items[0].price, 35000);
    assert.equal(o.items[0].name, 'Osh');
    assert.equal(o.total, 75000);
  });

  test('kasr yoki manfiy narx qabul qilinmaydi', () => {
    assert.throws(() => env.services.restaurants.addProduct(ids.r1, { name: 'X', price: 100.5 }), { code: 'VALIDATION' });
    assert.throws(() => env.services.restaurants.addProduct(ids.r1, { name: 'X', price: -1 }), { code: 'VALIDATION' });
  });

  test('boshqa restoran mahsuloti bilan buyurtma yaratilmaydi', () => {
    assert.throws(
      () => env.services.orders.createRecord(env.services.users.get(301), { restaurantId: ids.r1, items: [{ productId: ids.p2, qty: 1 }] }),
      { code: 'VALIDATION' },
    );
  });

  test('bir xil idempotency kaliti bilan takror chaqiruv dublikat yaratmaydi', () => {
    const actor = env.services.users.get(301);
    const input = { restaurantId: ids.r1, items: [{ productId: ids.p1, qty: 1 }], idempotencyKey: 'k-1' };
    const a = env.services.orders.createRecord(actor, input);
    const b = env.services.orders.createRecord(actor, input);
    assert.equal(a.id, b.id);
    const count = env.db.prepare('SELECT COUNT(*) AS n FROM orders WHERE idempotency_key = ?').get('k-1').n;
    assert.equal(count, 1);
  });

  test('karta o\'tkazmasi pending_payment holatida boshlanadi, voqea yoziladi', () => {
    const o = env.services.orders.createRecord(env.services.users.get(302), {
      restaurantId: ids.r2, items: [{ productId: ids.p2, qty: 1 }], paymentMethod: 'card_transfer',
    });
    assert.equal(o.status, 'pending_payment');
    const ev = env.db.prepare('SELECT type, to_status, actor_id FROM order_events WHERE order_id = ?').all(o.id);
    assert.deepEqual(ev.map((e) => ({ ...e })), [{ type: 'created', to_status: 'pending_payment', actor_id: 302 }]);
  });
});

describe('AUTO_ADMIN va saqlanish', () => {
  test('production\'da birinchi /start bosgan admin bo\'lmaydi', async () => {
    const env = await setup({ NODE_ENV: 'production', AUTO_ADMIN: '1', PLATFORM_ADMIN_IDS: '' });
    const u = env.services.users.upsertFromTelegram(tgUser(555));
    assert.equal(env.services.users.bootstrapAutoAdmin(u.id), false);
    assert.equal(env.services.access.isPlatformAdmin(env.services.users.get(555)), false);
    await env.close();
  });

  test('test muhitida AUTO_ADMIN faqat admin yo\'q bo\'lsa, faqat bir marta', async () => {
    const env = await setup({ AUTO_ADMIN: '1', PLATFORM_ADMIN_IDS: '' });
    env.services.users.upsertFromTelegram(tgUser(1));
    env.services.users.upsertFromTelegram(tgUser(2));
    assert.equal(env.services.users.bootstrapAutoAdmin(1), true);
    assert.equal(env.services.users.bootstrapAutoAdmin(2), false);
    assert.equal(env.services.access.isPlatformAdmin(env.services.users.get(1)), true);
    assert.equal(env.services.access.isPlatformAdmin(env.services.users.get(2)), false);
    await env.close();
  });

  test('baza qayta ochilganda ma\'lumot saqlanadi, migratsiya takrorlanmaydi', async () => {
    const env = await setup();
    const ids = seed(env.services);
    const dbPath = env.config.dbPath;
    env.db.close();

    const db2 = openDb(dbPath);
    const services2 = createServices(db2, env.config);
    const o = services2.orders.getForActor(services2.users.get(301), ids.o1);
    assert.equal(o.total, 75000);
    const migs = db2.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get().n;
    assert.equal(migs, latestMigrationId);
    db2.close();

    const db3 = openDb(dbPath); // uchinchi marta ochish ham xatosiz
    assert.equal(db3.prepare('SELECT COUNT(*) AS n FROM restaurants').get().n, 2);
    db3.close();
    await env.close();
  });

  test('14 ta asosiy jadval mavjud', async () => {
    const env = await setup();
    const names = env.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
    for (const t of ['users', 'restaurants', 'staff', 'couriers', 'cuisines', 'restaurant_cuisines', 'menu_categories',
      'products', 'addresses', 'favorites', 'orders', 'order_items', 'order_events', 'order_messages']) {
      assert.ok(names.includes(t), `${t} jadvali yo'q`);
    }
    await env.close();
  });
});
