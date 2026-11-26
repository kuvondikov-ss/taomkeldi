// 18-bosqich: asosiy end-to-end ssenariylar. Haqiqiy API (HTTP + imzolangan initData) va bot (offline harness).
// Telegram'ga hech narsa yuborilmaydi; test bazasi vaqtinchalik papkada (production'dan ajratilgan).
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setup, seed, call } from './helpers.js';
import { createBot } from '../src/bot/index.js';
import { openDb } from '../src/db/index.js';
import { createServices } from '../src/services/index.js';
import { formatSum } from '../src/i18n/index.js';

const BOT_INFO = {
  id: 123456, is_bot: true, first_name: 'Taomkeldi', username: 'taomkeldi_test_bot',
  can_join_groups: true, can_read_all_group_messages: false, supports_inline_queries: false,
  can_connect_to_business: false, has_main_web_app: false,
};
const silent = { log() {}, warn() {}, error() {} };
const G = -100777;

async function env() {
  const e = await setup({ BOT_USERNAME: 'taomkeldi_test_bot', WEBAPP_URL: 'https://taomkeldi.example.uz' });
  const ids = seed(e.services);
  const S = e.services;
  e.db.prepare(`UPDATE restaurants SET lat = 40.12, lon = 67.84, delivery_radius_m = 8000, delivery_base = 8000, delivery_base_m = 2000,
    delivery_per_km = 2000, min_order = 30000, free_delivery_from = 100000, pickup_enabled = 1, pay_card_transfer = 1, phone = '+998901112233' WHERE id = ?`).run(ids.r1);
  e.db.prepare('UPDATE orders SET courier_id = NULL WHERE id IN (?, ?)').run(ids.o1, ids.o2);
  const { bot } = createBot({ config: e.config, services: S, logger: silent, botInfo: BOT_INFO });
  const calls = [];
  const handlers = {};
  let nextMsg = 1000;
  bot.api.config.use(async (_prev, method, payload) => {
    calls.push({ method, payload });
    const out = handlers[method] ? await handlers[method](payload) : undefined;
    if (out?.error) return { ok: false, ...out.error };
    if (method === 'sendMessage') return { ok: true, result: { message_id: nextMsg++, date: 0, chat: { id: payload.chat_id, type: payload.chat_id < 0 ? 'supergroup' : 'private' }, text: payload.text } };
    if (method === 'getChatMember') return { ok: true, result: { status: 'administrator', user: { id: payload.user_id, is_bot: false, first_name: 'x' } } };
    return { ok: true, result: true };
  });
  S.setBotApi(bot.api);
  let uid = 1;
  const u = (id) => S.users.get(id);
  const of = (m) => calls.filter((c) => c.method === m).map((c) => c.payload);
  const to = (chat) => [...of('sendMessage'), ...of('editMessageText')].filter((x) => x.chat_id === chat);
  const order = (id) => e.db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  async function press(userId, data, chatId = userId) {
    const chat = chatId < 0 ? { id: chatId, type: 'supergroup', title: 'Oshxona' } : { id: userId, type: 'private', first_name: 'x' };
    await bot.handleUpdate({ update_id: uid++, callback_query: { id: String(uid), from: { id: userId, is_bot: false, first_name: 'x' }, chat_instance: '1', data, message: { message_id: 1, date: 0, chat, text: 'x' } } });
    await S.idle();
    return of('answerCallbackQuery').at(-1);
  }
  async function cmd(userId, text, chatId = userId) {
    const chat = chatId < 0 ? { id: chatId, type: 'supergroup', title: 'Oshxona' } : { id: userId, type: 'private', first_name: 'x' };
    await bot.handleUpdate({ update_id: uid++, message: { message_id: uid, date: 0, chat, from: { id: userId, is_bot: false, first_name: 'x' }, text, entities: [{ type: 'bot_command', offset: 0, length: text.split(' ')[0].length }] } });
    await S.idle();
  }
  const addr = (await call(e.base, 301, 'POST', '/api/addresses', { text: 'Uy', lat: 40.1158, lon: 67.8422, entrance: '2' })).body.address.id;
  let key = 0;
  async function place(body) {
    const items = body.items || [{ product_id: ids.p1, qty: 2 }];
    const q = (await call(e.base, 301, 'POST', '/api/checkout/quote', { restaurant_id: ids.r1, type: 'delivery', address_id: addr, items, ...body })).body.quote;
    const r = await call(e.base, 301, 'POST', '/api/orders', {
      restaurant_id: ids.r1, type: 'delivery', address_id: addr, payment_method: 'cash', items, expected_total: q.total,
      customer_name: 'Ali Valiyev', customer_phone: '+998 90 123 45 67', idempotency_key: `e2e-key-${++key}-abcdef`, ...body,
    });
    await S.idle();
    return { q, r };
  }
  return { ...e, ids, S, bot, calls, handlers, u, of, to, order, press, cmd, addr, place };
}

describe('E2E', () => {
  let e;
  beforeEach(async () => { e = await env(); });
  afterEach(() => e.close());

  test('1. naqd: buyurtma → guruh → qabul → kuryer (dispetcher) → olib ketish → kuzatuv → yetkazish → baho; jami hamma joyda bir xil', async () => {
    e.S.group.link(e.u(101), e.ids.r1, { id: G, type: 'supergroup', title: 'Oshxona' }, null);
    await e.S.dispatch.setOnline(e.u(103), e.ids.c1, true);
    const { q, r } = await e.place({});
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const id = r.body.order.id;
    const total = formatSum(q.total, 'uz');
    assert.ok(e.to(G).some((m) => m.text.includes(`YANGI BUYURTMA #${id}`) && m.text.includes(total)), 'guruhda yangi buyurtma');
    assert.ok(e.to(301).some((m) => m.text.includes(`Buyurtma #${id} yuborildi`) && m.text.includes(total)), 'mijozga "yuborildi"');
    assert.equal((await e.press(301, `o:${id}:a30`, G)).show_alert, true, 'mijoz guruh tugmasini bosa olmaydi');
    await e.press(102, `o:${id}:a30`, G);
    assert.equal(e.order(id).status, 'accepted');
    assert.ok(e.to(103).some((m) => m.text.includes(`Yangi buyurtma #${id}`)), 'kuryerga taklif');
    await e.press(103, `d:${id}:ok`);
    assert.equal(e.order(id).courier_id, e.ids.c1);
    await e.press(101, `o:${id}:rd`, G);
    await e.press(103, `c:${id}:pk`);
    assert.equal(e.order(id).status, 'on_way');
    await call(e.base, 103, 'POST', '/api/courier/location', { lat: 40.118, lon: 67.841 });
    const tr = (await call(e.base, 301, 'GET', `/api/orders/${id}/tracking`)).body.tracking;
    assert.equal(tr.location.state, 'live');
    assert.equal(tr.courier.name, 'Kuryer Bir');
    await e.press(103, `c:${id}:dl`);
    const o = e.order(id);
    assert.equal(o.status, 'delivered');
    assert.equal(o.payment_status, 'paid');
    assert.equal(o.total, q.total);
    assert.equal((await call(e.base, 301, 'GET', `/api/orders/${id}/tracking`)).body.tracking.location, null);
    assert.equal((await call(e.base, 301, 'POST', `/api/orders/${id}/rating`, { stars: 5 })).status, 200);
    const custTexts = e.to(301).map((m) => m.text).join('\n---\n');
    for (const s of ['yuborildi', 'qabul qilindi', 'yo‘lda', 'yetkazildi']) assert.ok(custTexts.includes(s), s);
    assert.ok(e.to(G).some((m) => m.text.includes('Yetkazildi') && m.text.includes(total)), 'guruh xabari yakuniy holatda');
  });

  test('2. karta o\'tkazmasi: "To\'ladim" → guruh tekshiradi → rad (sabab bilan) va boshqasi tasdiq', async () => {
    e.S.group.link(e.u(101), e.ids.r1, { id: G, type: 'supergroup', title: 'Oshxona' }, null);
    const a = (await e.place({ payment_method: 'card_transfer' })).r.body.order.id;
    assert.equal(e.order(a).status, 'pending_payment');
    assert.equal(e.to(G).length, 0, 'to\'lanmagan buyurtma guruhga tushmaydi');
    assert.ok(e.to(301).some((m) => m.text.includes('to‘lov kutilmoqda')));
    assert.equal((await call(e.base, 301, 'POST', `/api/orders/${a}/payment-claim`)).status, 200);
    await e.S.idle();
    const gm = e.to(G).find((m) => m.text.includes(`#${a}`));
    assert.ok(gm.reply_markup.inline_keyboard.flat().some((b) => b.callback_data === `o:${a}:po`));
    await e.press(101, `o:${a}:pn`, G);
    assert.equal(e.order(a).status, 'cancelled');
    assert.ok(e.to(301).some((m) => m.text.includes('bekor qilindi') && m.text.includes('Karta o‘tkazmasi kelmadi')));
    const b = (await e.place({ payment_method: 'card_transfer' })).r.body.order.id;
    await call(e.base, 301, 'POST', `/api/orders/${b}/payment-claim`);
    await e.S.idle();
    await e.press(102, `o:${b}:po`, G);
    assert.equal(e.order(b).payment_status, 'paid');
    assert.ok(e.to(301).some((m) => m.text.includes('To‘lov qabul qilindi')));
  });

  test('3. olib ketish: tayyor → mijozga topshirildi, kuryersiz va dispetchersiz', async () => {
    await e.S.dispatch.setOnline(e.u(103), e.ids.c1, true);
    const { r } = await e.place({ type: 'pickup', address_id: undefined });
    const id = r.body.order.id;
    for (const [to, extra] of [['accepted', { prep_minutes: 15 }], ['ready', {}], ['delivered', {}]]) {
      const res = await call(e.base, 101, 'POST', `/api/panel/orders/${id}/status`, { to, ...extra });
      assert.equal(res.status, 200, `${to}: ${JSON.stringify(res.body)}`);
      await e.S.idle();
    }
    assert.equal(e.order(id).courier_id, null);
    assert.equal(e.db.prepare('SELECT COUNT(*) AS n FROM courier_offers WHERE order_id = ?').get(id).n, 0);
    assert.ok(e.to(301).some((m) => m.text.includes('tayyor') && m.text.includes('olib keting')));
    assert.ok(e.to(301).some((m) => m.text.includes('topshirildi')));
  });

  test('4. admin restoran yaratadi → egasiga havola → menejer va kuryer takliflari → guruhga ulash', async () => {
    // Foydalanuvchi arizasi yopilgan: restoranni faqat platforma admini qo'shadi.
    assert.equal((await call(e.base, 401, 'POST', '/api/applications', { name: 'Yangi Choyxona', phone: '+998 90 555 44 33', lat: 40.13, lon: 67.83 })).status, 403);
    assert.equal((await call(e.base, 401, 'POST', '/api/admin/restaurants', { name: 'Yangi Choyxona', status: 'active' })).status, 403);
    const created = await call(e.base, 900, 'POST', '/api/admin/restaurants', { name: 'Yangi Choyxona', phone: '+998905554433', address_text: 'Jizzax', status: 'active' });
    assert.equal(created.status, 201);
    const rid = created.body.restaurant.id;
    const own = (await call(e.base, 900, 'POST', `/api/panel/restaurants/${rid}/invites`, { kind: 'owner' })).body.invite;
    await e.cmd(401, `/start ${own.start_payload}`);
    assert.equal(e.S.access.staffRole(e.u(401), rid), 'owner');
    const mgr = (await call(e.base, 401, 'POST', `/api/panel/restaurants/${rid}/invites`, { kind: 'manager' })).body.invite;
    await e.cmd(402, `/start ${mgr.start_payload}`);
    assert.equal(e.S.access.staffRole(e.u(402), rid), 'manager');
    const cid = e.S.manage.saveCourier(e.u(401), rid, { name: 'Yangi kuryer' });
    const cur = (await call(e.base, 402, 'POST', `/api/panel/restaurants/${rid}/invites`, { kind: 'courier', courier_id: cid })).body.invite;
    await e.cmd(403, `/start ${cur.start_payload}`);
    assert.equal(e.db.prepare('SELECT user_id FROM couriers WHERE id = ?').get(cid).user_id, 403);
    await e.cmd(401, '/bogla', -100999);
    await e.press(401, `bgc:${rid}`, -100999);
    assert.equal(e.db.prepare('SELECT group_chat_id FROM restaurants WHERE id = ?').get(rid).group_chat_id, -100999);
  });

  test('7. takror checkout, takror callback, noto\'g\'ri rol, begona restoran, bekor qilingan buyurtma', async () => {
    const items = [{ product_id: e.ids.p1, qty: 2 }];
    const q = (await call(e.base, 301, 'POST', '/api/checkout/quote', { restaurant_id: e.ids.r1, type: 'delivery', address_id: e.addr, items })).body.quote;
    const body = { restaurant_id: e.ids.r1, type: 'delivery', address_id: e.addr, payment_method: 'cash', items, expected_total: q.total, customer_name: 'Ali Valiyev', customer_phone: '+998 90 123 45 67', idempotency_key: 'same-key-12345678' };
    const a = await call(e.base, 301, 'POST', '/api/orders', body);
    const b = await call(e.base, 301, 'POST', '/api/orders', body);
    assert.equal(a.body.order.id, b.body.order.id, 'dublikat buyurtma yo\'q');
    const id = a.body.order.id;
    await e.S.idle();
    await e.press(101, `o:${id}:a15`, G);
    await e.press(102, `o:${id}:a45`, G);
    assert.equal(e.order(id).prep_minutes, 15, 'ikkinchi bosish holatni o\'zgartirmaydi');
    assert.equal((await call(e.base, 201, 'POST', `/api/panel/orders/${id}/status`, { to: 'ready' })).status, 404, 'begona restoran');
    assert.equal((await call(e.base, 103, 'POST', `/api/panel/orders/${id}/status`, { to: 'cancelled', reason: 'x' })).status, 404, 'biriktirilmagan kuryer');
    await call(e.base, 101, 'POST', `/api/panel/orders/${id}/status`, { to: 'cancelled', reason: 'Restoran band' });
    await e.S.idle();
    assert.match((await e.press(101, `o:${id}:rd`, G)).text, /Holat o‘zgargan/);
    assert.equal((await call(e.base, 301, 'POST', `/api/orders/${id}/cancel`)).status, 409);
  });

  test('8. Telegram ishlamasa: buyurtma saqlanadi, xabar navbatda qoladi va "qayta ishga tushirish"dan keyin yuboriladi', async () => {
    e.handlers.sendMessage = () => ({ error: { error_code: 502, description: 'Bad Gateway' } });
    const { r } = await e.place({});
    assert.equal(r.status, 201);
    const id = r.body.order.id;
    assert.equal(e.order(id).status, 'new', 'buyurtma bazada');
    const pending = e.db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE status = 'pending'").get().n;
    assert.ok(pending >= 1);
    // "Restart": xuddi shu baza fayli bilan yangi jarayon (yangi ulanish va servislar), Telegram endi ishlaydi.
    const db2 = openDb(e.config.dbPath);
    const S2 = createServices(db2, e.config, { logger: silent });
    const sent = [];
    S2.setBotApi({ sendMessage: async (chatId, text) => { sent.push({ chatId, text }); return { message_id: 1 }; } });
    db2.prepare('UPDATE notifications SET next_at = 0').run();
    await S2.outbox.processDue();
    assert.ok(sent.some((m) => m.chatId === 301 && m.text.includes(`Buyurtma #${id} yuborildi`)));
    assert.equal(db2.prepare("SELECT COUNT(*) AS n FROM notifications WHERE status = 'pending' AND kind = 'message'").get().n, 0);
    db2.close();
  });
});
