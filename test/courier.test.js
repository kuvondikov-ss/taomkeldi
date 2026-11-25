// 14-bosqich: restoran kuryerlari va dispetcher. Telegram'ga hech narsa yuborilmaydi.
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setup, seed, call } from './helpers.js';
import { createBot } from '../src/bot/index.js';

const BOT_INFO = {
  id: 123456, is_bot: true, first_name: 'Taomkeldi', username: 'taomkeldi_test_bot',
  can_join_groups: true, can_read_all_group_messages: false, supports_inline_queries: false,
  can_connect_to_business: false, has_main_web_app: false,
};
const silent = { log() {}, warn() {}, error() {} };

async function env() {
  const e = await setup({ BOT_USERNAME: 'taomkeldi_test_bot', WEBAPP_URL: 'https://taomkeldi.example.uz' });
  const ids = seed(e.services);
  const S = e.services;
  // R1: kuryerlar 103 (c1) va 104 (c3); R2: 203 (c2). o1 — R1, naqd, yetkazish; seed'dagi biriktirishni olib tashlaymiz.
  S.users.upsertFromTelegram({ id: 104, first_name: 'K3' });
  ids.c3 = S.restaurants.addCourier(ids.r1, { userId: 104, name: 'Kuryer Uch' });
  e.db.prepare('UPDATE orders SET courier_id = NULL WHERE id = ?').run(ids.o1);
  e.db.prepare("UPDATE restaurants SET lat = 40.12, lon = 67.84, address_text = 'Rashidov 1', phone = '+998901112233' WHERE id = ?").run(ids.r1);
  const { bot } = createBot({ config: e.config, services: S, logger: silent, botInfo: BOT_INFO });
  const calls = [];
  let nextMsg = 900;
  bot.api.config.use(async (_prev, method, payload) => {
    calls.push({ method, payload });
    if (method === 'sendMessage') return { ok: true, result: { message_id: nextMsg++, date: 0, chat: { id: payload.chat_id, type: 'private' }, text: payload.text } };
    return { ok: true, result: true };
  });
  S.setBotApi(bot.api);
  let uid = 1;
  const u = (id) => S.users.get(id);
  const of = (method) => calls.filter((c) => c.method === method).map((c) => c.payload);
  const sentTo = (chat) => of('sendMessage').filter((m) => m.chat_id === chat);
  const editsTo = (chat) => of('editMessageText').filter((m) => m.chat_id === chat);
  const order = (id) => e.db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  const offers = (oid) => e.db.prepare('SELECT * FROM courier_offers WHERE order_id = ? ORDER BY courier_id').all(oid);
  const act = async (fn) => { const r = await fn(); await S.idle(); return r; };
  const online = (userId, cid, on = true) => act(() => S.dispatch.setOnline(u(userId), cid, on));
  const accept = (o) => act(() => S.orders.transition(u(101), o, 'accepted', { prepMinutes: 20 }));
  async function press(userId, data) {
    await bot.handleUpdate({ update_id: uid++, callback_query: { id: String(uid), from: { id: userId, is_bot: false, first_name: 'x' }, chat_instance: '1', data,
      message: { message_id: 1, date: 0, chat: { id: userId, type: 'private', first_name: 'x' }, text: 'x' } } });
    await S.idle();
    return of('answerCallbackQuery').at(-1);
  }
  async function msg(userId, extra) {
    await bot.handleUpdate({ update_id: uid++, message: { message_id: uid, date: 0, chat: { id: userId, type: 'private', first_name: 'x' }, from: { id: userId, is_bot: false, first_name: 'x' }, ...extra } });
    await S.idle();
  }
  const clear = () => { calls.length = 0; };
  return { ...e, ids, S, bot, calls, u, of, sentTo, editsTo, order, offers, act, online, accept, press, msg, clear };
}

const btns = (p) => (p?.reply_markup?.inline_keyboard || []).flat();

describe('Smena va avtomatik dispetcher', () => {
  let e;
  beforeEach(async () => { e = await env(); });
  afterEach(() => e.close());

  test('smena serverda; taklif faqat shu restoranning onlayn, ulangan kuryerlariga', async () => {
    await e.online(103, e.ids.c1);
    await e.online(203, e.ids.c2); // boshqa restoran kuryeri — onlayn bo'lsa ham taklif olmaydi
    assert.equal(e.db.prepare('SELECT is_online FROM couriers WHERE id = ?').get(e.ids.c1).is_online, 1);
    e.clear();
    await e.accept(e.ids.o1);
    assert.deepEqual(e.offers(e.ids.o1).map((x) => x.courier_id), [e.ids.c1], 'c3 oflayn, c2 boshqa restoran');
    const offer = e.sentTo(103).find((m) => /Yangi buyurtma/.test(m.text));
    assert.ok(offer);
    assert.deepEqual(btns(offer).map((b) => b.callback_data), [`d:${e.ids.o1}:ok`, `d:${e.ids.o1}:no`]);
    assert.match(offer.text, /Mijozdan olinadi: <b>75\s000/);
    assert.equal(e.sentTo(203).length, 0);
    assert.equal(e.sentTo(104).length, 0);
    assert.equal(e.order(e.ids.o1).dispatch_status, 'offering');
  });

  test('boshqa foydalanuvchining kuryer yozuvi bilan smena — rad', async () => {
    await assert.rejects(() => e.S.dispatch.setOnline(e.u(203), e.ids.c1, true), { code: 'NOT_FOUND' });
    await assert.rejects(() => e.S.dispatch.setOnline(e.u(301), e.ids.c1, true), { code: 'NOT_FOUND' });
  });

  test('ikki kuryer bir paytda "Qabul qilaman": faqat bittasi oladi, ikkinchisiga "boshqa kuryer oldi", tugmalar yopiladi', async () => {
    await e.online(103, e.ids.c1);
    await e.online(104, e.ids.c3);
    await e.accept(e.ids.o1);
    assert.equal(e.offers(e.ids.o1).length, 2);
    e.clear();
    const results = await Promise.allSettled([e.S.dispatch.accept(e.u(103), e.ids.o1), e.S.dispatch.accept(e.u(104), e.ids.o1)]);
    await e.S.idle();
    const ok = results.filter((r) => r.status === 'fulfilled');
    const lost = results.filter((r) => r.status === 'rejected');
    assert.equal(ok.length, 1);
    assert.equal(lost.length, 1);
    assert.equal(lost[0].reason.details.reason, 'taken');
    const o = e.order(e.ids.o1);
    assert.equal(o.courier_id, e.ids.c1);
    assert.equal(o.dispatch_status, 'assigned');
    assert.deepEqual(e.offers(e.ids.o1).map((x) => x.status), ['accepted', 'lost']);
    const closed = e.editsTo(104).find((m) => /boshqa kuryer oldi/.test(m.text));
    assert.ok(closed);
    assert.deepEqual(btns(closed), []);
    assert.ok(e.sentTo(103).some((m) => /Olish joyi/.test(m.text)), 'g\'olibga jonli buyurtma xabari');
  });

  test('bot orqali: kechikkan kuryerga alert, oflayn kuryer qabul qila olmaydi', async () => {
    await e.online(103, e.ids.c1);
    await e.online(104, e.ids.c3);
    await e.accept(e.ids.o1);
    await e.online(104, e.ids.c3, false); // ishni tugatdi — taklifi yopiladi
    assert.ok(e.editsTo(104).some((m) => /ishni tugatdingiz/.test(m.text)));
    const a1 = await e.press(104, `d:${e.ids.o1}:ok`);
    assert.equal(a1.show_alert, true);
    assert.equal(e.order(e.ids.o1).courier_id, null);
    const a2 = await e.press(103, `d:${e.ids.o1}:ok`);
    assert.match(a2.text, /sizniki/);
    assert.equal(e.order(e.ids.o1).courier_id, e.ids.c1);
    const a3 = await e.press(103, `d:${e.ids.o1}:ok`); // takror bosish
    assert.ok(!a3.show_alert);
  });

  test('noto\'g\'ri restoran kuryeri taklifni qabul qila olmaydi', async () => {
    await e.online(103, e.ids.c1);
    await e.accept(e.ids.o1);
    await assert.rejects(() => e.S.dispatch.accept(e.u(203), e.ids.o1), { code: 'NOT_FOUND' });
    await assert.rejects(() => e.S.dispatch.accept(e.u(301), e.ids.o1), { code: 'NOT_FOUND' });
  });

  test('onlayn kuryer yo\'q — "no_courier", guruh xabari va panelda ogohlantirish; kuryer ishga chiqsa taklif oladi', async () => {
    e.db.prepare("UPDATE restaurants SET group_chat_id = -100777, group_status = 'active' WHERE id = ?").run(e.ids.r1);
    await e.accept(e.ids.o1);
    assert.equal(e.order(e.ids.o1).dispatch_status, 'no_courier');
    const groupMsgs = [...e.sentTo(-100777), ...e.editsTo(-100777)];
    assert.ok(groupMsgs.some((m) => /Kuryer topilmadi/.test(m.text)));
    const board = await call(e.base, 101, 'GET', `/api/panel/restaurants/${e.ids.r1}/board?group=preparing`);
    assert.equal(board.body.dispatch.couriers_online, 0);
    assert.equal(board.body.dispatch.unassigned, 1);
    assert.equal(board.body.orders[0].dispatch_status, 'no_courier');
    e.clear();
    await e.online(104, e.ids.c3);
    assert.ok(e.sentTo(104).some((m) => /Yangi buyurtma/.test(m.text)));
    assert.equal(e.order(e.ids.o1).dispatch_status, 'offering');
  });

  test('hamma o\'tkazib yuborsa — "no_courier"', async () => {
    await e.online(103, e.ids.c1);
    await e.accept(e.ids.o1);
    await e.press(103, `d:${e.ids.o1}:no`);
    assert.equal(e.order(e.ids.o1).dispatch_status, 'no_courier');
    assert.ok(e.editsTo(103).some((m) => /o‘tkazib yuborildi/.test(m.text)));
  });

  test('avtomatik dispetcher o\'chirilgan — taklif yo\'q', async () => {
    e.db.prepare('UPDATE restaurants SET auto_dispatch = 0 WHERE id = ?').run(e.ids.r1);
    await e.online(103, e.ids.c1);
    await e.accept(e.ids.o1);
    assert.equal(e.offers(e.ids.o1).length, 0);
  });

  test('olib ketish buyurtmasi kuryerga taklif qilinmaydi', async () => {
    e.db.prepare("UPDATE orders SET type = 'pickup', delivery_fee = 0 WHERE id = ?").run(e.ids.o1);
    await e.online(103, e.ids.c1);
    await e.accept(e.ids.o1);
    assert.equal(e.offers(e.ids.o1).length, 0);
  });
});

describe('Qo\'lda biriktirish, qayta biriktirish, voz kechish, bekor qilish', () => {
  let e;
  beforeEach(async () => { e = await env(); await e.online(103, e.ids.c1); await e.online(104, e.ids.c3); });
  afterEach(() => e.close());

  test('qo\'lda biriktirish takliflarni yopadi; boshqa kuryerga o\'tkazish', async () => {
    await e.accept(e.ids.o1);
    e.clear();
    await e.act(() => e.S.manage.assignCourier(e.u(101), e.ids.o1, e.ids.c3));
    assert.equal(e.order(e.ids.o1).courier_id, e.ids.c3);
    assert.deepEqual(e.offers(e.ids.o1).map((x) => x.status), ['lost', 'lost']);
    assert.ok(e.editsTo(103).some((m) => /boshqa kuryer oldi/.test(m.text)));
    await e.act(() => e.S.manage.assignCourier(e.u(101), e.ids.o1, e.ids.c1)); // qayta biriktirish
    assert.equal(e.order(e.ids.o1).courier_id, e.ids.c1);
    assert.ok(e.editsTo(104).some((m) => /boshqa kuryerga berildi/.test(m.text)));
    // Boshqa restoran kuryerini biriktirib bo'lmaydi.
    assert.throws(() => e.S.manage.assignCourier(e.u(101), e.ids.o1, e.ids.c2), { code: 'VALIDATION' });
  });

  test('olib ketishdan oldin voz kechish: qayta taklif (o\'ziga emas), restoranga xabar', async () => {
    await e.accept(e.ids.o1);
    await e.act(() => e.S.dispatch.accept(e.u(103), e.ids.o1));
    e.clear();
    const a = await e.press(103, `c:${e.ids.o1}:rl`);
    assert.match(a.text, /Voz kechdingiz/);
    const o = e.order(e.ids.o1);
    assert.equal(o.courier_id, null);
    assert.ok(e.sentTo(101).some((m) => /voz kechdi/.test(m.text)));
    // c3 avval "lost" bo'lgan — qayta taklif faqat yangi onlayn kuryerlarga; hech kim qolmadi → no_courier.
    assert.equal(e.order(e.ids.o1).dispatch_status, 'no_courier');
    assert.equal(e.sentTo(103).filter((m) => /Yangi buyurtma/.test(m.text)).length, 0, 'voz kechganga qayta taklif yo\'q');
  });

  test('olib ketilgandan keyin voz kechib bo\'lmaydi — "Muammo" restoranga xabar beradi', async () => {
    await e.act(() => e.S.manage.assignCourier(e.u(101), e.ids.o1, e.ids.c1));
    await e.accept(e.ids.o1);
    await e.act(() => e.S.orders.transition(e.u(101), e.ids.o1, 'ready'));
    await e.press(103, `c:${e.ids.o1}:pk`);
    assert.equal(e.order(e.ids.o1).status, 'on_way');
    const a = await e.press(103, `c:${e.ids.o1}:rl`);
    assert.equal(a.show_alert, true);
    assert.match(a.text, /voz kechib bo‘lmaydi/);
    assert.equal(e.order(e.ids.o1).courier_id, e.ids.c1);
    e.clear();
    await e.press(103, `c:${e.ids.o1}:pb`);
    assert.ok(e.sentTo(101).some((m) => /muammo bildirdi/.test(m.text)));
    assert.ok(e.sentTo(102).some((m) => /muammo bildirdi/.test(m.text)));
  });

  test('"Olib ketdim" faqat biriktirilgan kuryer va "tayyor" holatda; "Yetkazdim" faqat yo\'ldagi o\'z buyurtmasiga', async () => {
    await e.act(() => e.S.manage.assignCourier(e.u(101), e.ids.o1, e.ids.c1));
    await e.accept(e.ids.o1);
    assert.equal((await e.press(103, `c:${e.ids.o1}:pk`)).show_alert, true, 'hali tayyor emas');
    await e.act(() => e.S.orders.transition(e.u(101), e.ids.o1, 'ready'));
    await e.press(104, `c:${e.ids.o1}:pk`); // biriktirilmagan kuryer
    await e.press(301, `c:${e.ids.o1}:dl`); // mijoz
    assert.equal(e.order(e.ids.o1).status, 'ready');
    assert.equal((await e.press(103, `c:${e.ids.o1}:dl`)).show_alert, true, 'yo\'lda emas — yetkazib bo\'lmaydi');
    await e.press(103, `c:${e.ids.o1}:pk`);
    await e.press(104, `c:${e.ids.o1}:dl`);
    assert.equal(e.order(e.ids.o1).status, 'on_way');
    await e.press(103, `c:${e.ids.o1}:dl`);
    assert.equal(e.order(e.ids.o1).status, 'delivered');
  });

  test('bekor qilingan buyurtma takliflari yopiladi', async () => {
    await e.accept(e.ids.o1);
    await e.act(() => e.S.orders.transition(e.u(101), e.ids.o1, 'cancelled', { reason: 'Restoran band' }));
    assert.deepEqual(e.offers(e.ids.o1).map((x) => x.status), ['cancelled', 'cancelled']);
    assert.ok(e.editsTo(103).some((m) => /bekor qilindi/.test(m.text)));
    await assert.rejects(() => e.S.dispatch.accept(e.u(103), e.ids.o1), { code: 'CONFLICT' });
  });
});

describe('Kuryer ekrani (API), taklif havolasi, joylashuv', () => {
  let e;
  beforeEach(async () => { e = await env(); });
  afterEach(() => e.close());

  test('dashboard: smena, taklif, joriy buyurtma, mijozdan olinadigan summa; API amallari', async () => {
    let r = await call(e.base, 103, 'GET', '/api/courier/dashboard');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.shifts.map((s) => [s.courier_id, s.is_online]), [[e.ids.c1, false]]);
    assert.equal((await call(e.base, 301, 'GET', '/api/courier/dashboard')).status, 403);
    r = await call(e.base, 103, 'POST', '/api/courier/shift', { courier_id: e.ids.c1, online: true });
    assert.equal(r.body.shift.is_online, true);
    assert.equal((await call(e.base, 103, 'POST', '/api/courier/shift', { courier_id: e.ids.c2, online: true })).status, 404);
    await e.accept(e.ids.o1);
    r = await call(e.base, 103, 'GET', '/api/courier/dashboard');
    assert.equal(r.body.offers.length, 1);
    assert.equal(r.body.offers[0].collect_amount, 75000);
    assert.equal((await call(e.base, 103, 'POST', `/api/courier/offers/${e.ids.o1}/accept`)).status, 200);
    await e.S.idle();
    r = await call(e.base, 103, 'GET', '/api/courier/dashboard');
    assert.equal(r.body.active[0].id, e.ids.o1);
    assert.equal(r.body.active[0].restaurant_phone, '+998901112233');
    assert.equal((await call(e.base, 103, 'POST', `/api/courier/orders/${e.ids.o1}/pickup`)).status, 409, 'hali tayyor emas');
    await e.act(() => e.S.orders.transition(e.u(101), e.ids.o1, 'ready'));
    assert.equal((await call(e.base, 104, 'POST', `/api/courier/orders/${e.ids.o1}/pickup`)).status, 404, 'biriktirilmagan kuryerga buyurtma ko\'rinmaydi');
    assert.equal((await call(e.base, 103, 'POST', `/api/courier/orders/${e.ids.o1}/pickup`)).status, 200);
    const rel = await call(e.base, 103, 'POST', `/api/courier/orders/${e.ids.o1}/release`);
    assert.equal(rel.status, 409);
    assert.equal(rel.body.error.details.reason, 'picked_up');
    assert.equal((await call(e.base, 103, 'POST', `/api/courier/orders/${e.ids.o1}/deliver`)).status, 200);
    await e.S.idle();
    r = await call(e.base, 103, 'GET', '/api/courier/dashboard');
    assert.equal(r.body.today.delivered, 1);
    assert.equal(r.body.today.cash, 75000);
    assert.equal(r.body.history[0].id, e.ids.o1);
  });

  test('oldindan to\'langan buyurtma: mijozdan 0 so\'m', async () => {
    e.db.prepare("UPDATE orders SET payment_method = 'online', payment_status = 'paid', courier_id = ? WHERE id = ?").run(e.ids.c1, e.ids.o1);
    const r = await call(e.base, 103, 'GET', '/api/courier/dashboard');
    assert.equal(r.body.active[0].collect_amount, 0);
  });

  test('taklif havolasi orqali ulanganda — yo\'riqnoma va "Ishga chiqdim" tugmasi; /courier', async () => {
    const owner = e.u(101);
    const cid = e.S.manage.saveCourier(owner, e.ids.r1, { name: 'Yangi Kuryer' });
    const inv = e.S.invites.create(owner, e.ids.r1, { kind: 'courier', courierId: cid });
    e.clear();
    await e.msg(105, { text: `/start ${inv.payload}`, entities: [{ type: 'bot_command', offset: 0, length: 6 }] });
    const texts = e.sentTo(105);
    assert.ok(texts.some((m) => /kuryeri/.test(m.text) && /jonli joylashuv/.test(m.text)));
    const shift = texts.find((m) => btns(m).some((b) => b.callback_data === `cs:${cid}:1`));
    assert.ok(shift, 'smena tugmasi');
    await e.press(105, `cs:${cid}:1`);
    assert.equal(e.db.prepare('SELECT is_online FROM couriers WHERE id = ?').get(cid).is_online, 1);
    assert.ok(e.sentTo(105).some((m) => /ishdasiz/.test(m.text)));
    await e.press(301, `cs:${cid}:0`); // begona
    assert.equal(e.db.prepare('SELECT is_online FROM couriers WHERE id = ?').get(cid).is_online, 1);
  });

  test('jonli joylashuv faqat ishdagi kuryer yozuviga saqlanadi', async () => {
    await e.msg(103, { location: { latitude: 40.1, longitude: 67.8 } });
    assert.equal(e.db.prepare('SELECT last_lat FROM couriers WHERE id = ?').get(e.ids.c1).last_lat, null, 'ishda emas');
    await e.online(103, e.ids.c1);
    await e.msg(103, { location: { latitude: 40.1, longitude: 67.8, live_period: 900 } });
    const c = e.db.prepare('SELECT last_lat, last_lon, last_location_at FROM couriers WHERE id = ?').get(e.ids.c1);
    assert.equal(c.last_lat, 40.1);
    assert.ok(c.last_location_at);
    await e.msg(301, { location: { latitude: 41, longitude: 69 } }); // mijoz — hech narsa
  });
});
