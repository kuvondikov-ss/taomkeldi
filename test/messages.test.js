// 13-bosqich: xabar shablonlari, mijoz va kuryer xabarlari, ishonchli yuborish (outbox).
// Telegram'ga hech narsa yuborilmaydi — API chaqiruvlari ushlab olinadi.
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { setup, seed } from './helpers.js';
import { createBot } from '../src/bot/index.js';
import { LOCALES } from '../src/i18n/index.js';
import { MAX_ATTEMPTS } from '../src/services/outbox.js';

const BOT_INFO = {
  id: 123456, is_bot: true, first_name: 'Taomkeldi', username: 'taomkeldi_test_bot',
  can_join_groups: true, can_read_all_group_messages: false, supports_inline_queries: false,
  can_connect_to_business: false, has_main_web_app: false,
};
const silent = { log() {}, warn() {}, error() {} };
const tgError = (error_code, description, parameters) => Object.assign(new Error(description), { error_code, description, parameters });

async function env() {
  const e = await setup({ BOT_USERNAME: 'taomkeldi_test_bot', WEBAPP_URL: 'https://taomkeldi.example.uz' });
  const ids = seed(e.services);
  const { bot } = createBot({ config: e.config, services: e.services, logger: silent, botInfo: BOT_INFO });
  const calls = [];
  const handlers = {};
  let nextMsg = 700;
  bot.api.config.use(async (_prev, method, payload) => {
    calls.push({ method, payload });
    const out = handlers[method] ? await handlers[method](payload) : undefined;
    if (out?.error) return { ok: false, ...out.error };
    if (out !== undefined) return { ok: true, result: out };
    if (method === 'sendMessage') return { ok: true, result: { message_id: nextMsg++, date: 0, chat: { id: payload.chat_id, type: 'private' }, text: payload.text } };
    return { ok: true, result: true };
  });
  e.services.setBotApi(bot.api);
  let uid = 1;
  const S = e.services;
  const u = (id) => S.users.get(id);
  const of = (method) => calls.filter((c) => c.method === method).map((c) => c.payload);
  const sentTo = (chat) => of('sendMessage').filter((m) => m.chat_id === chat);
  const editsTo = (chat) => of('editMessageText').filter((m) => m.chat_id === chat);
  const clear = () => { calls.length = 0; };
  const order = (id) => e.db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  const jobs = () => e.db.prepare('SELECT * FROM notifications ORDER BY id').all();
  async function press(userId, data) {
    await bot.handleUpdate({
      update_id: uid++,
      callback_query: { id: String(uid), from: { id: userId, is_bot: false, first_name: 'x' }, chat_instance: '1', data,
        message: { message_id: 1, date: 0, chat: { id: userId, type: 'private', first_name: 'x' }, text: 'x' } },
    });
    await S.idle();
  }
  async function update(upd) { await bot.handleUpdate({ update_id: uid++, ...upd }); await S.idle(); }
  const act = async (fn) => { fn(); await S.idle(); };
  return { ...e, ids, bot, calls, handlers, S, u, of, sentTo, editsTo, clear, order, jobs, press, update, act };
}

const btns = (p) => (p?.reply_markup?.inline_keyboard || []).flat();

describe('Mijoz xabarlari: faqat muhim bosqichlar, har biri bir marta', () => {
  let e;
  beforeEach(async () => { e = await env(); });
  afterEach(() => e.close());

  test('yangi naqd buyurtma: "yuborildi", "qabul qilindi" deyilmaydi, kuzatish tugmasi (web_app)', () => {
    const o = e.order(e.ids.o1);
    const msg = e.S.templates.customerOrder(o, e.db.prepare('SELECT * FROM restaurants WHERE id = ?').get(o.restaurant_id), 'created', 'uz');
    assert.match(msg.text, new RegExp(`Buyurtma #${o.id} yuborildi`));
    assert.match(msg.text, /ko‘rib chiqmoqda/);
    assert.match(msg.text, /Jami: 75\s000/);
    assert.match(msg.text, /To‘lov: naqd/);
    assert.doesNotMatch(msg.text, /qabul qilindi/i);
    const [b] = btns(msg);
    assert.equal(b.text, 'Buyurtmani kuzatish');
    assert.equal(b.web_app.url, `https://taomkeldi.example.uz/#/order/${o.id}`);
    assert.equal(e.S.templates.customerMilestone(o), 'created');
  });

  test('bepul yetkazish — 0 so\'m aniq yoziladi', () => {
    e.db.prepare('UPDATE orders SET delivery_fee = 0 WHERE id = ?').run(e.ids.o1);
    const o = e.order(e.ids.o1);
    const msg = e.S.templates.customerOrder(o, { name: 'R' }, 'created', 'uz');
    assert.match(msg.text, /Yetkazish: bepul \(0 so‘m\)/);
    assert.match(e.S.templates.customerOrder(o, { name: 'R' }, 'created', 'ru').text, /0 сум/);
  });

  test('to\'liq oqim: qabul (vaqt bilan), yo\'lda (kuryer), yetkazildi; "tayyor" (yetkazishda) va takror — yuborilmaydi', async () => {
    const owner = e.u(101);
    await e.act(() => e.S.orders.transition(owner, e.ids.o1, 'accepted', { prepMinutes: 25 }));
    await e.act(() => e.S.orders.transition(owner, e.ids.o1, 'ready'));
    await e.act(() => e.S.orders.transition(owner, e.ids.o1, 'on_way'));
    await e.act(() => e.S.orders.transition(owner, e.ids.o1, 'delivered'));
    await e.act(() => e.S.orderNotify.customer(e.ids.o1)); // bevosita qayta chaqiruv ham dublikat bermaydi
    const msgs = e.sentTo(301).map((m) => m.text);
    assert.equal(msgs.length, 3, msgs.join('\n---\n'));
    assert.match(msgs[0], /qabul qilindi/);
    assert.match(msgs[0], /25 daqiqa/);
    assert.match(msgs[1], /yo‘lda/);
    assert.match(msgs[1], /Kuryer Bir/);
    assert.match(msgs[2], /yetkazildi/);
    assert.equal(btns(e.sentTo(301)[2])[0].text, 'Buyurtmani ochish');
  });

  test('mijoz tilida (rus)', async () => {
    e.S.users.setLang(301, 'ru');
    await e.act(() => e.S.orders.transition(e.u(101), e.ids.o1, 'accepted', { prepMinutes: 15 }));
    assert.match(e.sentTo(301)[0].text, /Заказ #\d+ принят/);
  });

  test('restoran bekor qilsa — sabab; mijozning o\'zi bekor qilsa — xabar yo\'q', async () => {
    await e.act(() => e.S.orders.transition(e.u(101), e.ids.o1, 'cancelled', { reason: 'Taom <tugagan>' }));
    const [m] = e.sentTo(301);
    assert.match(m.text, /bekor qilindi/);
    assert.match(m.text, /Sabab: Taom &lt;tugagan&gt;/, 'foydalanuvchi matni escape qilinadi');
    await e.act(() => e.S.orders.transition(e.u(302), e.ids.o2, 'cancelled'));
    assert.equal(e.sentTo(302).length, 0);
  });

  test('to\'langan buyurtma bekor bo\'lsa — pul qaytarish bo\'yicha keyingi qadam; qaytarilgach — alohida xabar', async () => {
    e.db.prepare("UPDATE orders SET payment_method = 'online', payment_status = 'paid' WHERE id = ?").run(e.ids.o1);
    await e.act(() => e.S.orders.transition(e.u(101), e.ids.o1, 'cancelled', { reason: 'Restoran band' }));
    assert.equal(e.order(e.ids.o1).payment_status, 'refund_requested');
    assert.match(e.sentTo(301)[0].text, /pul qaytariladi/);
    await e.act(() => e.S.payments.markRefunded(e.u(101), e.ids.o1));
    assert.match(e.sentTo(301)[1].text, /pul qaytarildi/);
  });

  test('karta o\'tkazmasi: kutilmoqda → tekshirilmoqda → to\'lov qabul qilindi', async () => {
    e.db.prepare("UPDATE orders SET status = 'pending_payment', payment_method = 'card_transfer' WHERE id = ?").run(e.ids.o2);
    await e.act(() => e.S.orderNotify.customer(e.ids.o2));
    await e.act(() => e.S.payments.claimTransfer(e.u(302), e.ids.o2));
    await e.act(() => e.S.payments.confirmTransfer(e.u(201), e.ids.o2));
    const msgs = e.sentTo(302).map((m) => m.text);
    assert.equal(msgs.length, 3);
    assert.match(msgs[0], /to‘lov kutilmoqda/);
    assert.equal(btns(e.sentTo(302)[0])[0].text, 'To‘lov sahifasi');
    assert.match(msgs[1], /tekshirilmoqda/);
    assert.match(msgs[2], /To‘lov qabul qilindi/);
  });

  test('to\'lov muddati o\'tib bekor bo\'lsa — tushunarli sabab', async () => {
    e.db.prepare("UPDATE orders SET status = 'pending_payment', payment_method = 'card_transfer', created_at = 0 WHERE id = ?").run(e.ids.o2);
    await e.act(() => e.S.payments.expirePending());
    assert.match(e.sentTo(302)[0].text, /to‘lov 30 daqiqa ichida kelmadi/);
  });
});

describe('Kuryer xabari: bitta jonli xabar', () => {
  let e;
  beforeEach(async () => {
    e = await env();
    e.db.prepare('UPDATE restaurants SET lat = 40.12, lon = 67.84, address_text = ? WHERE id = ?').run('Sharof Rashidov 1', e.ids.r1);
    e.db.prepare('UPDATE orders SET address_text = ?, address_lat = 40.13, address_lon = 67.85 WHERE id = ?').run('Mustaqillik 5', e.ids.o1);
  });
  afterEach(() => e.close());

  test('biriktirilganda: olish/yetkazish joyi, naqd summa, yo\'nalish; tayyor → "Olib ketdim" → "Yetkazdim"; yakunda tugmasiz', async () => {
    await e.act(() => e.S.manage.assignCourier(e.u(101), e.ids.o1, e.ids.c1));
    const [m] = e.sentTo(103);
    assert.match(m.text, /Olish joyi: Restoran Bir, Sharof Rashidov 1/);
    assert.match(m.text, /Yetkazish joyi: Mustaqillik 5/);
    assert.match(m.text, /Mijozdan olinadi: <b>75\s000/);
    assert.deepEqual(btns(m).map((b) => b.text), ['📍 Restoranga yo‘nalish', 'Voz kechish']);
    assert.match(btns(m)[0].url, /destination=40\.12,67\.84/);

    await e.act(() => e.S.orders.transition(e.u(101), e.ids.o1, 'accepted', { prepMinutes: 15 }));
    await e.act(() => e.S.orders.transition(e.u(101), e.ids.o1, 'ready'));
    const ready = e.editsTo(103).at(-1);
    assert.equal(ready.message_id, m.message_id ?? ready.message_id);
    assert.ok(btns(ready).some((b) => b.callback_data === `c:${e.ids.o1}:pk`));
    assert.equal(e.sentTo(103).length, 1, 'kuryerga yangi xabar emas — tahrir');

    await e.press(203, `c:${e.ids.o1}:pk`); // boshqa restoran kuryeri
    assert.equal(e.order(e.ids.o1).status, 'ready');
    assert.equal(e.of('answerCallbackQuery').at(-1).show_alert, true);

    await e.press(103, `c:${e.ids.o1}:pk`);
    assert.equal(e.order(e.ids.o1).status, 'on_way');
    const way = e.editsTo(103).at(-1);
    assert.deepEqual(btns(way).map((b) => b.text), ['📍 Mijozga yo‘nalish', '✅ Yetkazdim', '⚠️ Muammo (restoranga xabar)']);
    await e.press(103, `c:${e.ids.o1}:pk`); // takror bosish — dublikat holat yo'q
    assert.match(e.of('answerCallbackQuery').at(-1).text, /Holat o‘zgargan/);
    await e.press(103, `c:${e.ids.o1}:dl`);
    assert.equal(e.order(e.ids.o1).status, 'delivered');
    assert.deepEqual(btns(e.editsTo(103).at(-1)), []);
  });

  test('to\'langan buyurtma: kuryer mijozdan pul olmaydi', () => {
    e.db.prepare("UPDATE orders SET payment_method = 'online', payment_status = 'paid' WHERE id = ?").run(e.ids.o1);
    const o = e.order(e.ids.o1);
    const msg = e.S.templates.courierOrder(o, { name: 'R' }, 'uz');
    assert.match(msg.text, /Mijozdan olinadi: <b>0 so‘m — oldindan to‘langan/);
  });

  test('kuryer almashtirildi: eskisiga "boshqa kuryerga berildi" (tugmasiz), yangisiga xabar', async () => {
    e.S.users.upsertFromTelegram({ id: 104, first_name: 'K2' });
    const c3 = e.S.restaurants.addCourier(e.ids.r1, { userId: 104, name: 'Kuryer Uch' });
    await e.act(() => e.S.manage.assignCourier(e.u(101), e.ids.o1, e.ids.c1));
    await e.act(() => e.S.manage.assignCourier(e.u(101), e.ids.o1, c3));
    const old = e.editsTo(103).at(-1);
    assert.match(old.text, /boshqa kuryerga berildi/);
    assert.deepEqual(btns(old), []);
    assert.equal(e.sentTo(104).length, 1);
  });
});

describe('Restoran xabari: shablon qoidalari', () => {
  let e;
  beforeEach(async () => { e = await env(); });
  afterEach(() => e.close());

  test('foydalanuvchi matni escape qilinadi; izoh bo\'lmasa "—"; uzun ro\'yxat qisqartiriladi', () => {
    e.db.prepare("UPDATE orders SET customer_name = '<script>x</script>', comment = NULL WHERE id = ?").run(e.ids.o1);
    const ins = e.db.prepare('INSERT INTO order_items (order_id, name, price, qty, line_total) VALUES (?, ?, 1000, 1, 1000)');
    for (let i = 0; i < 30; i += 1) ins.run(e.ids.o1, `Taom ${i} ${'x'.repeat(90)}`);
    const o = e.order(e.ids.o1);
    const msg = e.S.templates.staffOrder(o, { name: 'R & Co' }, 'uz');
    assert.match(msg.text, /Mijoz: &lt;script&gt;x&lt;\/script&gt;/);
    assert.match(msg.text, /R &amp; Co/);
    assert.match(msg.text, /Izoh: —/);
    assert.match(msg.text, /yana 6 ta taom/);
    assert.ok(msg.text.length <= 4096);
    for (const b of btns(msg)) if (b.callback_data) assert.ok(Buffer.byteLength(b.callback_data) <= 64);
  });

  test('tasdiqlanmagan karta o\'tkazmasi: faqat "To\'lov keldi" (qabul tugmalari yo\'q)', () => {
    e.db.prepare("UPDATE orders SET payment_method = 'card_transfer', payment_status = 'unpaid' WHERE id = ?").run(e.ids.o1);
    const data = btns(e.S.templates.staffOrder(e.order(e.ids.o1), { name: 'R' })).map((b) => b.callback_data).filter(Boolean);
    assert.ok(data.includes(`o:${e.ids.o1}:po`));
    assert.ok(!data.some((d) => /:a\d+$/.test(d)));
  });
});

describe('Ishonchli yuborish (outbox)', () => {
  let e;
  let api;
  let behave;
  beforeEach(async () => {
    e = await env();
    behave = () => ({ message_id: 1 });
    api = { sendMessage: async (...a) => { const r = behave(...a); if (r instanceof Error) throw r; return r; } };
    e.S.outbox.setBotApi(api);
  });
  afterEach(() => e.close());
  const due = () => e.db.prepare('UPDATE notifications SET next_at = 0').run();

  test('dedupe: bir hodisa — bitta xabar', async () => {
    assert.equal(await e.S.notify.send(301, 'cancelled', {}, { dedupeKey: 'k1' }), true);
    assert.equal(await e.S.notify.send(301, 'cancelled', {}, { dedupeKey: 'k1' }), false);
    assert.equal(e.jobs().length, 1);
    assert.equal(e.jobs()[0].status, 'sent');
  });

  test('tarmoq/5xx xatosi: yo\'qolmaydi, keyin yuboriladi; cheklangan urinishdan so\'ng "failed"', async () => {
    behave = () => tgError(502, 'Bad Gateway');
    assert.equal(await e.S.notify.send(301, 'cancelled'), false);
    let j = e.jobs()[0];
    assert.equal(j.status, 'pending');
    assert.equal(j.attempts, 1);
    assert.ok(j.next_at > Date.now());
    behave = () => ({ message_id: 5 });
    due();
    await e.S.outbox.processDue();
    j = e.jobs()[0];
    assert.equal(j.status, 'sent');
    assert.equal(j.message_id, 5);
    // Doimiy xato — MAX_ATTEMPTS dan keyin to'xtaydi.
    behave = () => tgError(500, 'Internal Server Error');
    await e.S.notify.send(302, 'cancelled');
    for (let i = 0; i < MAX_ATTEMPTS + 2; i += 1) { due(); await e.S.outbox.processDue(); }
    const last = e.jobs().at(-1);
    assert.equal(last.status, 'failed');
    assert.equal(last.attempts, MAX_ATTEMPTS);
  });

  test('429: retry_after ga rioya — navbat to\'xtaydi, muddatidan oldin qayta urinilmaydi', async () => {
    behave = () => tgError(429, 'Too Many Requests: retry after 7', { retry_after: 7 });
    await e.S.notify.send(301, 'cancelled');
    const j = e.jobs()[0];
    assert.equal(j.status, 'pending');
    assert.ok(j.next_at - Date.now() > 6000 && j.next_at - Date.now() <= 7000);
    let tried = 0;
    behave = () => { tried += 1; return { message_id: 2 }; };
    await e.S.notify.send(302, 'cancelled'); // pauza: darhol yuborilmaydi
    await e.S.outbox.processDue();
    assert.equal(tried, 0);
    e.S.outbox._resetPause();
    due();
    await e.S.outbox.processDue();
    assert.equal(tried, 2);
    assert.deepEqual(e.jobs().map((x) => x.status), ['sent', 'sent']);
  });

  test('botni bloklagan foydalanuvchi: qayta urinilmaydi, keyingilari "skipped"; botga yozsa — tiklanadi', async () => {
    behave = () => tgError(403, 'Forbidden: bot was blocked by the user');
    await e.S.notify.send(301, 'cancelled');
    assert.equal(e.jobs()[0].status, 'blocked');
    assert.ok(e.u(301).bot_blocked_at);
    let tried = 0;
    behave = () => { tried += 1; return { message_id: 3 }; };
    await e.S.notify.send(301, 'menu_hint');
    assert.equal(e.jobs()[1].status, 'skipped');
    due();
    await e.S.outbox.processDue();
    assert.equal(tried, 0);
    // Foydalanuvchi botga yozdi.
    e.S.setBotApi(e.bot.api);
    await e.update({ message: { message_id: 1, date: 0, chat: { id: 301, type: 'private', first_name: 'x' }, from: { id: 301, is_bot: false, first_name: 'x' }, text: 'salom' } });
    assert.equal(e.u(301).bot_blocked_at, null);
  });

  test('my_chat_member (shaxsiy chat): blokladi / blokdan chiqardi', async () => {
    const upd = (status) => ({ my_chat_member: { chat: { id: 302, type: 'private', first_name: 'x' }, from: { id: 302, is_bot: false, first_name: 'x' }, date: 0,
      old_chat_member: { status: 'member', user: { id: BOT_INFO.id, is_bot: true, first_name: 'T' } }, new_chat_member: { status, user: { id: BOT_INFO.id, is_bot: true, first_name: 'T' } } } });
    await e.update(upd('kicked'));
    assert.ok(e.u(302).bot_blocked_at);
    await e.update(upd('member'));
    assert.equal(e.u(302).bot_blocked_at, null);
  });

  test('guruh xabari vaqtinchalik xatoda outbox orqali qayta yangilanadi; buyurtma panelda saqlanib qoladi', async () => {
    e.S.setBotApi(e.bot.api);
    e.db.prepare("UPDATE restaurants SET group_chat_id = -100777, group_status = 'active' WHERE id = ?").run(e.ids.r1);
    e.handlers.sendMessage = (p) => (p.chat_id === -100777 ? { error: { error_code: 502, description: 'Bad Gateway' } } : undefined);
    await e.act(() => e.S.orders.transition(e.u(101), e.ids.o1, 'accepted', { prepMinutes: 15 }));
    const job = e.jobs().find((j) => j.kind === 'sync');
    assert.equal(job.status, 'pending');
    assert.equal(JSON.parse(job.payload).target, 'group');
    assert.equal(e.order(e.ids.o1).status, 'accepted', 'Telegram ishlamasa ham buyurtma bazada');
    delete e.handlers.sendMessage;
    due();
    e.clear();
    await e.S.outbox.processDue();
    assert.equal(e.jobs().find((j) => j.kind === 'sync').status, 'sent');
    assert.ok(e.sentTo(-100777).length === 1);
  });

  test('admin ko\'rsatkichlarida navbat holati', async () => {
    behave = () => tgError(500, 'x');
    await e.S.notify.send(301, 'cancelled');
    const ov = e.S.platform.overview(e.u(900));
    assert.equal(ov.notifications.pending, 1);
  });
});

describe('Callback va katalog', () => {
  let e;
  beforeEach(async () => { e = await env(); });
  afterEach(() => e.close());

  test('har callback javob oladi (eski/noma\'lum tugma ham)', async () => {
    await e.press(301, 'eski_bot:status:1');
    const [a] = e.of('answerCallbackQuery');
    assert.match(a.text, /eskirgan/);
  });

  test('docs/message-catalog.md barcha mijoz/kuryer/guruh shablon kalitlarini qamraydi', () => {
    const doc = fs.readFileSync(new URL('../docs/message-catalog.md', import.meta.url), 'utf8');
    const keys = Object.keys(LOCALES.uz).filter((k) => /^(c_|k_|g_head|g_dispatch|group_|bogla_|payment_|app_|restaurant_|invite_|courier_|start$|help$)/.test(k));
    const missing = keys.filter((k) => !doc.includes(`\`${k}\``));
    assert.deepEqual(missing, []);
  });
});
