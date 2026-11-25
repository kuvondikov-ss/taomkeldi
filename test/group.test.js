// 12-bosqich: restoran Telegram guruhi. Bot Telegram'ga ulanmaydi — API chaqiruvlari ushlab olinadi,
// kerak bo'lsa Telegram xatolari (xabar o'chirilgan, bot chiqarilgan, supergroup migratsiyasi) taqlid qilinadi.
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setup, seed, call } from './helpers.js';
import { createBot } from '../src/bot/index.js';
import { classifyTelegramError } from '../src/services/group.js';

const BOT_INFO = {
  id: 123456, is_bot: true, first_name: 'Taomkeldi', username: 'taomkeldi_test_bot',
  can_join_groups: true, can_read_all_group_messages: false, supports_inline_queries: false,
  can_connect_to_business: false, has_main_web_app: false,
};
const silent = { log() {}, warn() {}, error() {} };
const G1 = -100777;
const G2 = -100888;

async function groupEnv() {
  const env = await setup({ BOT_USERNAME: 'taomkeldi_test_bot' });
  const ids = seed(env.services);
  const { bot } = createBot({ config: env.config, services: env.services, logger: silent, botInfo: BOT_INFO });
  const calls = [];
  const admins = new Set([101, 102, 201]); // guruh administratorlari (Telegram tomonida)
  const handlers = {}; // method -> (payload) => natija yoki { error }
  let nextMsg = 500;
  bot.api.config.use(async (_prev, method, payload) => {
    calls.push({ method, payload });
    const h = handlers[method];
    const out = h ? await h(payload) : undefined;
    if (out?.error) return { ok: false, ...out.error };
    if (out !== undefined) return { ok: true, result: out };
    if (method === 'sendMessage') return { ok: true, result: { message_id: nextMsg++, date: 0, chat: { id: payload.chat_id, type: 'supergroup' }, text: payload.text } };
    if (method === 'getChatMember') {
      const status = payload.user_id === BOT_INFO.id ? 'administrator' : admins.has(payload.user_id) ? 'administrator' : 'member';
      return { ok: true, result: { status, user: { id: payload.user_id, is_bot: false, first_name: 'x' } } };
    }
    if (method === 'getChat') return { ok: true, result: { id: payload.chat_id, type: 'supergroup', title: 'Oshxona xodimlari' } };
    return { ok: true, result: true };
  });
  env.services.setBotApi(bot.api);
  const G = env.services.group;

  let uid = 1;
  const from = (id) => ({ id, is_bot: false, first_name: `User ${id}`, language_code: 'uz' });
  const chatOf = (chatId, type = 'supergroup') => ({ id: chatId, type, title: chatId === G1 ? 'Oshxona xodimlari' : 'Yangi guruh' });
  const topic = (thread) => (thread ? { is_topic_message: true, message_thread_id: thread } : {});
  const clear = () => { calls.length = 0; };
  const of = (method) => calls.filter((c) => c.method === method).map((c) => c.payload);

  async function groupCmd(userId, text, { chatId = G1, thread, fromOverride, extra = {} } = {}) {
    const message = { message_id: uid, date: 0, chat: chatOf(chatId), from: fromOverride || from(userId), text, ...topic(thread), ...extra };
    message.entities = [{ type: 'bot_command', offset: 0, length: text.split(' ')[0].length }];
    await bot.handleUpdate({ update_id: uid++, message });
  }
  async function press(userId, data, { chatId = G1, messageId = 1, thread, privateChat = false } = {}) {
    const chat = privateChat ? { id: userId, type: 'private', first_name: 'x' } : chatOf(chatId);
    await bot.handleUpdate({
      update_id: uid++,
      callback_query: { id: String(uid), from: from(userId), chat_instance: '1', data, message: { message_id: messageId, date: 0, chat, text: 'x', ...topic(thread) } },
    });
    await G.idle();
  }
  async function privateCmd(userId, text) {
    const message = { message_id: uid, date: 0, chat: { id: userId, type: 'private', first_name: 'x' }, from: from(userId), text,
      entities: [{ type: 'bot_command', offset: 0, length: text.split(' ')[0].length }] };
    await bot.handleUpdate({ update_id: uid++, message });
  }
  async function update(u) { await bot.handleUpdate({ update_id: uid++, ...u }); await G.idle(); }
  const answers = () => of('answerCallbackQuery');
  const restaurant = (id) => env.db.prepare('SELECT * FROM restaurants WHERE id = ?').get(id);
  const order = (id) => env.db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  const mainMsg = (oid) => env.db.prepare("SELECT * FROM order_messages WHERE order_id = ? AND kind = 'group_main'").all(oid);

  // /bogla → tasdiqlash (egasi, guruh admini).
  async function link(userId = 101, { chatId = G1, thread, rid = ids.r1 } = {}) {
    await groupCmd(userId, '/bogla', { chatId, thread });
    await press(userId, `bgc:${rid}`, { chatId, thread });
  }
  return { ...env, ids, bot, calls, admins, handlers, G, clear, of, groupCmd, press, privateCmd, update, answers, restaurant, order, mainMsg, link };
}

const btns = (p) => (p.reply_markup?.inline_keyboard || []).flat();
const cbData = (p) => btns(p).map((b) => b.callback_data).filter(Boolean);

describe('Guruh: /bogla va huquqlar', () => {
  let e;
  beforeEach(async () => { e = await groupEnv(); });
  afterEach(() => e.close());

  test('oddiy guruh a\'zosi (xodim emas) ulay olmaydi', async () => {
    e.clear();
    await e.groupCmd(301, '/bogla');
    assert.match(e.of('sendMessage')[0].text, /faqat restoran egasi yoki menejeri/);
    assert.equal(e.restaurant(e.ids.r1).group_chat_id, null);
  });

  test('xodim, lekin guruh admini emas — rad', async () => {
    e.admins.delete(101);
    e.clear();
    await e.groupCmd(101, '/bogla');
    assert.match(e.of('sendMessage')[0].text, /guruh administratori/);
  });

  test('anonim admin — o\'z nomidan yuborish so\'raladi', async () => {
    e.clear();
    await e.groupCmd(0, '/bogla', { fromOverride: { id: 1087968824, is_bot: true, first_name: 'Group', username: 'GroupAnonymousBot' }, extra: { sender_chat: { id: G1, type: 'supergroup', title: 'x' } } });
    assert.match(e.of('sendMessage')[0].text, /Anonim/);
  });

  test('botda yozish huquqi yo\'q — ogohlantiriladi, ulanmaydi', async () => {
    e.handlers.getChatMember = (p) => (p.user_id === BOT_INFO.id ? { status: 'restricted', can_send_messages: false, is_member: true, user: { id: p.user_id } } : undefined);
    e.clear();
    await e.groupCmd(101, '/bogla');
    assert.match(e.of('sendMessage')[0].text, /yozish huquqi yo‘q/);
    assert.equal(e.restaurant(e.ids.r1).group_chat_id, null);
  });

  test('egasi ulaydi: tasdiqlash, saqlanadi, sinov xabari avtomatik yuborilmaydi', async () => {
    e.clear();
    await e.groupCmd(101, '/bogla');
    const ask = e.of('sendMessage')[0];
    assert.match(ask.text, /Restoran Bir/);
    assert.deepEqual(cbData(ask), [`bgc:${e.ids.r1}`, 'bgx']);
    e.clear();
    await e.press(101, `bgc:${e.ids.r1}`);
    const r = e.restaurant(e.ids.r1);
    assert.equal(r.group_chat_id, G1);
    assert.equal(r.group_status, 'active');
    assert.equal(r.group_title, 'Oshxona xodimlari');
    assert.equal(r.group_linked_by, 101);
    assert.equal(r.group_thread_id, null);
    assert.match(e.of('editMessageText')[0].text, /ulandi/);
    assert.equal(e.of('sendMessage').length, 0, 'ulashda guruhga hech qanday sinov xabari yuborilmaydi');
  });

  test('tasdiqlash tugmasini begona odam yoki boshqa restoran xodimi bosa olmaydi', async () => {
    await e.groupCmd(101, '/bogla');
    e.clear();
    await e.press(301, `bgc:${e.ids.r1}`);
    assert.equal(e.answers()[0].show_alert, true);
    await e.press(201, `bgc:${e.ids.r1}`); // R2 egasi, guruh admini — lekin R1 xodimi emas
    assert.equal(e.restaurant(e.ids.r1).group_chat_id, null);
    await e.press(101, `bgc:${e.ids.r2}`); // R1 egasi R2 ni ulay olmaydi
    assert.equal(e.restaurant(e.ids.r2).group_chat_id, null);
  });

  test('bir nechta restoran — tanlash menyusi; bekor qilish', async () => {
    e.services.restaurants.addStaff(e.ids.r2, 101, 'manager', 201);
    e.clear();
    await e.groupCmd(101, '/bogla');
    const menu = e.of('sendMessage')[0];
    assert.deepEqual(cbData(menu), [`bg:${e.ids.r1}`, `bg:${e.ids.r2}`, 'bgx']);
    e.clear();
    await e.press(101, `bg:${e.ids.r2}`);
    assert.deepEqual(cbData(e.of('editMessageText')[0]), [`bgc:${e.ids.r2}`, 'bgx']);
    await e.press(101, 'bgx');
    assert.equal(e.restaurant(e.ids.r2).group_chat_id, null);
  });

  test('mavzu (topic): thread_id saqlanadi va buyurtma o\'sha mavzuga yuboriladi', async () => {
    await e.link(101, { thread: 55 });
    assert.equal(e.restaurant(e.ids.r1).group_thread_id, 55);
    e.clear();
    await e.G.syncOrder(e.ids.o1);
    const sent = e.of('sendMessage')[0];
    assert.equal(sent.chat_id, G1);
    assert.equal(sent.message_thread_id, 55);
  });

  test('guruhni almashtirish: yangi guruhga ko\'chadi, eski guruhga xabar', async () => {
    await e.link(101);
    await e.G.syncOrder(e.ids.o1);
    e.clear();
    await e.groupCmd(101, '/bogla', { chatId: G2 });
    assert.match(e.of('sendMessage')[0].text, /ko‘chiramizmi/);
    await e.press(101, `bgc:${e.ids.r1}`, { chatId: G2 });
    assert.equal(e.restaurant(e.ids.r1).group_chat_id, G2);
    assert.ok(e.of('sendMessage').some((m) => m.chat_id === G1 && /boshqa guruhga/.test(m.text)));
    e.clear();
    e.services.orders.transition(e.services.users.get(101), e.ids.o1, 'accepted', { prepMinutes: 20 });
    await e.G.idle();
    assert.equal(e.of('sendMessage')[0].chat_id, G2, 'yangi guruhda yangi asosiy xabar');
  });
});

describe('Guruh: asosiy buyurtma xabari va tugmalar', () => {
  let e;
  beforeEach(async () => { e = await groupEnv(); await e.link(101); e.clear(); });
  afterEach(() => e.close());

  test('yangi buyurtma: bitta xabar, tarkib, amallar va "Panelda ochish" deep link (web_app emas)', async () => {
    await e.G.syncOrder(e.ids.o1);
    const [m] = e.of('sendMessage');
    assert.equal(m.chat_id, G1);
    assert.match(m.text, new RegExp(`YANGI BUYURTMA #${e.ids.o1}`));
    assert.match(m.text, /Osh × 2/);
    assert.match(m.text, /Jami: <b>75\s000/);
    assert.match(m.text, /naqd/);
    assert.deepEqual(cbData(m), [`o:${e.ids.o1}:a15`, `o:${e.ids.o1}:a30`, `o:${e.ids.o1}:a45`, `o:${e.ids.o1}:rj`]);
    const url = btns(m).find((b) => b.url);
    assert.equal(url.url, `https://t.me/taomkeldi_test_bot?start=o_${e.ids.o1}`);
    assert.ok(!btns(m).some((b) => b.web_app));
    assert.equal(e.mainMsg(e.ids.o1).length, 1);
    // Qayta sinxronlash — yangi xabar emas, tahrir.
    e.clear();
    await e.G.syncOrder(e.ids.o1);
    assert.equal(e.of('sendMessage').length, 0);
    assert.equal(e.of('editMessageText')[0].message_id, m.message_id ?? e.mainMsg(e.ids.o1)[0].message_id);
  });

  test('guruh a\'zosi (xodim emas) va boshqa restoran xodimi tugmani bosa olmaydi', async () => {
    await e.G.syncOrder(e.ids.o1);
    e.clear();
    await e.press(301, `o:${e.ids.o1}:a30`);
    assert.equal(e.answers()[0].show_alert, true);
    assert.match(e.answers()[0].text, /faqat restoran egasi va menejerlari/);
    await e.press(201, `o:${e.ids.o1}:a30`);
    await e.press(203, `o:${e.ids.o1}:rr1`); // boshqa restoran kuryeri
    assert.equal(e.order(e.ids.o1).status, 'new');
  });

  test('menejer qabul qiladi → xabar tahrirlanadi (yangi xabar yo\'q), keyingi tugma "Tayyor"', async () => {
    await e.G.syncOrder(e.ids.o1);
    const mid = e.mainMsg(e.ids.o1)[0].message_id;
    e.clear();
    await e.press(102, `o:${e.ids.o1}:a30`, { messageId: mid });
    const o = e.order(e.ids.o1);
    assert.equal(o.status, 'accepted');
    assert.equal(o.prep_minutes, 30);
    assert.equal(e.of('sendMessage').length, 0);
    const [ed] = e.of('editMessageText');
    assert.equal(ed.message_id, mid);
    assert.match(ed.text, /Tayyorlanmoqda/);
    assert.deepEqual(cbData(ed), [`o:${e.ids.o1}:rd`]);
  });

  test('eskirgan tugma: holat o\'zgargan — ogohlantirish va xabar yangilanadi', async () => {
    await e.G.syncOrder(e.ids.o1);
    e.services.orders.transition(e.services.users.get(101), e.ids.o1, 'accepted', { prepMinutes: 15 });
    await e.G.idle();
    e.clear();
    await e.press(102, `o:${e.ids.o1}:a45`);
    assert.match(e.answers()[0].text, /Holat o‘zgargan/);
    assert.equal(e.order(e.ids.o1).prep_minutes, 15);
    assert.equal(e.of('editMessageText').length, 1);
  });

  test('rad etish: sabablar menyusi, orqaga, sabab bilan bekor', async () => {
    await e.G.syncOrder(e.ids.o1);
    e.clear();
    await e.press(101, `o:${e.ids.o1}:rj`);
    assert.deepEqual(cbData(e.of('editMessageReplyMarkup')[0]), [`o:${e.ids.o1}:rr1`, `o:${e.ids.o1}:rr2`, `o:${e.ids.o1}:rr3`, `o:${e.ids.o1}:bk`]);
    await e.press(101, `o:${e.ids.o1}:bk`);
    assert.equal(e.order(e.ids.o1).status, 'new');
    await e.press(101, `o:${e.ids.o1}:rr2`);
    const o = e.order(e.ids.o1);
    assert.equal(o.status, 'cancelled');
    assert.equal(o.cancel_reason, 'Restoran band');
    const last = e.of('editMessageText').at(-1);
    assert.match(last.text, /Bekor qilindi/);
    assert.deepEqual(cbData(last), [], 'yakunlangan buyurtmada amal tugmalari yo\'q');
  });

  test('to\'liq oqim: tayyor → kuryerga → yetkazildi', async () => {
    await e.G.syncOrder(e.ids.o1);
    for (const act of ['a15', 'rd', 'ow', 'dl']) await e.press(101, `o:${e.ids.o1}:${act}`);
    assert.equal(e.order(e.ids.o1).status, 'delivered');
    assert.equal(e.mainMsg(e.ids.o1).length, 1);
    assert.equal(e.of('sendMessage').length, 1, 'butun oqimda faqat bitta guruh xabari');
  });

  test('karta o\'tkazmasi: "To\'lov keldi" tugmasi, tasdiqlangach qabul tugmalari', async () => {
    e.db.prepare("UPDATE orders SET payment_method = 'card_transfer', payment_status = 'claimed' WHERE id = ?").run(e.ids.o1);
    await e.G.syncOrder(e.ids.o1);
    const [m] = e.of('sendMessage');
    assert.deepEqual(cbData(m), [`o:${e.ids.o1}:po`, `o:${e.ids.o1}:pn`]);
    assert.match(m.text, /tekshiring/);
    e.clear();
    await e.press(102, `o:${e.ids.o1}:po`);
    assert.equal(e.order(e.ids.o1).payment_status, 'paid');
    assert.ok(cbData(e.of('editMessageText')[0]).includes(`o:${e.ids.o1}:a15`));
  });

  test('to\'lov kutilayotgan (pending_payment) buyurtma guruhga yuborilmaydi', async () => {
    e.db.prepare("UPDATE orders SET status = 'pending_payment', payment_method = 'card_transfer' WHERE id = ?").run(e.ids.o1);
    const r = await e.G.syncOrder(e.ids.o1);
    assert.equal(r.reason, 'not_visible');
    assert.equal(e.of('sendMessage').length, 0);
  });

  test('xabar o\'chirilgan: nazoratli yangi nusxa, eski id almashtiriladi', async () => {
    await e.G.syncOrder(e.ids.o1);
    const oldId = e.mainMsg(e.ids.o1)[0].message_id;
    e.handlers.editMessageText = () => ({ error: { error_code: 400, description: 'Bad Request: message to edit not found' } });
    e.clear();
    await e.press(101, `o:${e.ids.o1}:a15`);
    assert.equal(e.of('sendMessage').length, 1);
    const rows = e.mainMsg(e.ids.o1);
    assert.equal(rows.length, 1);
    assert.notEqual(rows[0].message_id, oldId);
    // "o'zgarmadi" xatosi — jim o'tadi, yangi xabar yo'q.
    e.handlers.editMessageText = () => ({ error: { error_code: 400, description: 'Bad Request: message is not modified' } });
    e.clear();
    await e.G.syncOrder(e.ids.o1);
    assert.equal(e.of('sendMessage').length, 0);
  });

  test('o\'chirilgan mavzu: umumiy chatga yuboriladi, panelda ko\'rinadi', async () => {
    e.db.prepare('UPDATE restaurants SET group_thread_id = 77 WHERE id = ?').run(e.ids.r1);
    e.handlers.sendMessage = (p) => (p.message_thread_id ? { error: { error_code: 400, description: 'Bad Request: message thread not found' } } : undefined);
    const res = await e.G.syncOrder(e.ids.o1);
    assert.equal(res.sent, true);
    const r = e.restaurant(e.ids.r1);
    assert.equal(r.group_thread_id, null);
    assert.equal(r.group_error, 'topic_deleted');
  });
});

describe('Guruh: bot chiqarildi, huquq yo\'q, migratsiya, zaxira yo\'l', () => {
  let e;
  beforeEach(async () => { e = await groupEnv(); await e.link(101); e.clear(); });
  afterEach(() => e.close());

  const memberUpdate = (oldStatus, newStatus, extra = {}) => ({
    my_chat_member: {
      chat: { id: G1, type: 'supergroup', title: 'Oshxona xodimlari' }, from: { id: 101, is_bot: false, first_name: 'x' }, date: 0,
      old_chat_member: { status: oldStatus, user: { id: BOT_INFO.id, is_bot: true, first_name: 'T' } },
      new_chat_member: { status: newStatus, user: { id: BOT_INFO.id, is_bot: true, first_name: 'T' }, ...extra },
    },
  });

  test('bot guruhdan chiqarildi: holat "removed", ega va menejerga shaxsiy xabar, buyurtma shaxsiy xabarda', async () => {
    await e.update(memberUpdate('administrator', 'kicked'));
    assert.equal(e.restaurant(e.ids.r1).group_status, 'removed');
    const dms = e.of('sendMessage');
    assert.deepEqual(dms.map((m) => m.chat_id).sort(), [101, 102]);
    assert.match(dms[0].text, /chiqarildi/);
    e.clear();
    const res = await e.G.syncOrder(e.ids.o1);
    assert.equal(res.reason, 'no_group');
    const sent = e.of('sendMessage');
    assert.deepEqual(sent.map((m) => m.chat_id).sort(), [101, 102]);
    assert.ok(!sent.some((m) => m.chat_id === G1));
    assert.match(sent[0].text, /YANGI BUYURTMA/);
    // Shaxsiy xabar tugmasi ham ishlaydi va o'sha xabar yangilanadi.
    e.clear();
    await e.press(101, `o:${e.ids.o1}:a30`, { privateChat: true });
    assert.equal(e.order(e.ids.o1).status, 'accepted');
    assert.equal(e.of('editMessageText').length, 2);
    assert.equal(e.of('sendMessage').length, 0, 'zaxira xabar qayta yuborilmaydi');
  });

  test('yuborishda 403: guruh "removed", yangi buyurtma xodimlarga shaxsiy xabarda', async () => {
    e.handlers.sendMessage = (p) => (p.chat_id === G1 ? { error: { error_code: 403, description: 'Forbidden: bot was kicked from the supergroup chat' } } : undefined);
    const res = await e.G.syncOrder(e.ids.o1);
    assert.equal(res.reason, 'removed');
    assert.equal(e.restaurant(e.ids.r1).group_status, 'removed');
    const staffMsgs = e.of('sendMessage').filter((m) => m.chat_id !== G1);
    assert.ok(staffMsgs.some((m) => m.chat_id === 101 && /YANGI BUYURTMA/.test(m.text)));
    assert.ok(staffMsgs.some((m) => m.chat_id === 101 && /chiqarildi/.test(m.text)));
  });

  test('yozish huquqi olindi: "no_rights"; bot qaytib huquq olsa — yana faol', async () => {
    await e.update(memberUpdate('administrator', 'restricted', { is_member: true, can_send_messages: false }));
    assert.equal(e.restaurant(e.ids.r1).group_status, 'no_rights');
    await e.update(memberUpdate('restricted', 'administrator'));
    assert.equal(e.restaurant(e.ids.r1).group_status, 'active');
  });

  test('bot guruhga qo\'shilganda faqat qisqa yo\'riqnoma (sinov xabari emas)', async () => {
    await e.update({ ...memberUpdate('left', 'member'), my_chat_member: { ...memberUpdate('left', 'member').my_chat_member, chat: { id: -100555, type: 'supergroup', title: 'Yangi' } } });
    const [m] = e.of('sendMessage');
    assert.match(m.text, /\/bogla/);
    assert.equal(e.of('sendMessage').length, 1);
  });

  test('supergroup migratsiyasi: xizmat xabari chat id ni yangilaydi', async () => {
    await e.G.syncOrder(e.ids.o1);
    await e.update({ message: { message_id: 9, date: 0, chat: { id: G1, type: 'group', title: 'x' }, from: { id: 101, is_bot: false, first_name: 'x' }, migrate_to_chat_id: -100999 } });
    assert.equal(e.restaurant(e.ids.r1).group_chat_id, -100999);
    assert.equal(e.mainMsg(e.ids.o1)[0].chat_id, -100999);
  });

  test('supergroup migratsiyasi: yuborishdagi xato bo\'yicha yangi id ga qayta yuboriladi', async () => {
    e.handlers.sendMessage = (p) => (p.chat_id === G1 ? { error: { error_code: 400, description: 'Bad Request: group chat was upgraded to a supergroup chat', parameters: { migrate_to_chat_id: -100999 } } } : undefined);
    const res = await e.G.syncOrder(e.ids.o1);
    assert.equal(res.sent, true);
    assert.equal(e.restaurant(e.ids.r1).group_chat_id, -100999);
    assert.equal(e.of('sendMessage').at(-1).chat_id, -100999);
  });

  test('Telegram xatolari tasnifi', () => {
    assert.equal(classifyTelegramError({ error_code: 400, description: 'Bad Request: message is not modified: x' }), 'not_modified');
    assert.equal(classifyTelegramError({ error_code: 400, description: 'Bad Request: message to edit not found' }), 'message_gone');
    assert.equal(classifyTelegramError({ error_code: 403, description: 'Forbidden: bot is not a member of the supergroup chat' }), 'removed');
    assert.equal(classifyTelegramError({ error_code: 400, description: 'Bad Request: chat not found' }), 'removed');
    assert.equal(classifyTelegramError({ error_code: 400, description: 'Bad Request: not enough rights to send text messages to the chat' }), 'no_rights');
    assert.equal(classifyTelegramError({ error_code: 400, parameters: { migrate_to_chat_id: -1 } }), 'migrated');
    assert.equal(classifyTelegramError({ error_code: 429, description: 'Too Many Requests' }), 'rate_limited');
  });
});

describe('Guruh: deep link va panel API', () => {
  let e;
  beforeEach(async () => { e = await groupEnv(); });
  afterEach(() => e.close());

  test('/start o_<id>: xodimga buyurtma paneli, begonaga ruxsat yo\'q', async () => {
    e.clear();
    await e.privateCmd(102, `/start o_${e.ids.o1}`);
    assert.match(e.of('sendMessage')[0].text, new RegExp(`Buyurtma #${e.ids.o1}`));
    e.clear();
    await e.privateCmd(301, `/start o_${e.ids.o1}`); // buyurtma egasi-mijoz — lekin restoran paneli emas
    assert.match(e.of('sendMessage')[0].text, /siz uchun emas/);
    e.clear();
    await e.privateCmd(201, `/start o_${e.ids.o1}`);
    assert.match(e.of('sendMessage')[0].text, /siz uchun emas/);
  });

  test('panel: holat, tekshirish, sinov xabari (faqat aniq bosilganda), uzish; begonaga 403', async () => {
    let r = await call(e.base, 101, 'GET', `/api/panel/restaurants/${e.ids.r1}/group`);
    assert.equal(r.body.group.linked, false);
    r = await call(e.base, 101, 'POST', `/api/panel/restaurants/${e.ids.r1}/group/test`);
    assert.equal(r.status, 409);
    assert.equal(r.body.error.details.reason, 'no_group');

    await e.link(101);
    e.clear();
    r = await call(e.base, 102, 'GET', `/api/panel/restaurants/${e.ids.r1}/group`);
    assert.equal(r.body.group.status, 'active');
    assert.equal(r.body.group.title, 'Oshxona xodimlari');
    assert.equal(e.of('sendMessage').length, 0);

    r = await call(e.base, 102, 'POST', `/api/panel/restaurants/${e.ids.r1}/group/test`);
    assert.equal(r.status, 200);
    const test1 = e.of('sendMessage');
    assert.equal(test1.length, 1);
    assert.equal(test1[0].chat_id, G1);
    assert.match(test1[0].text, /Sinov xabari/);

    // Tekshirish: bot chiqarilgan bo'lsa — holat yangilanadi, guruhga xabar yuborilmaydi.
    e.handlers.getChatMember = (p) => (p.user_id === BOT_INFO.id ? { status: 'left', user: { id: p.user_id } } : undefined);
    e.clear();
    r = await call(e.base, 101, 'POST', `/api/panel/restaurants/${e.ids.r1}/group/check`);
    assert.equal(r.body.group.status, 'removed');
    assert.ok(!e.of('sendMessage').some((m) => m.chat_id === G1));
    delete e.handlers.getChatMember;
    r = await call(e.base, 101, 'POST', `/api/panel/restaurants/${e.ids.r1}/group/check`);
    assert.equal(r.body.group.status, 'active');

    for (const u of [301, 201, 103]) {
      assert.equal((await call(e.base, u, 'POST', `/api/panel/restaurants/${e.ids.r1}/group/test`)).status, 403);
      assert.equal((await call(e.base, u, 'DELETE', `/api/panel/restaurants/${e.ids.r1}/group`)).status, 403);
    }
    r = await call(e.base, 102, 'DELETE', `/api/panel/restaurants/${e.ids.r1}/group`);
    assert.equal(r.body.group.linked, false);
    assert.equal(e.restaurant(e.ids.r1).group_chat_id, null);
  });

  test('tayyorlik ro\'yxati: guruh faqat faol holatda "bajarilgan"', async () => {
    const done = async () => (await call(e.base, 101, 'GET', `/api/panel/restaurants/${e.ids.r1}/readiness`)).body.items.find((i) => i.key === 'group').done;
    assert.equal(await done(), false);
    await e.link(101);
    assert.equal(await done(), true);
    e.db.prepare("UPDATE restaurants SET group_status = 'removed' WHERE id = ?").run(e.ids.r1);
    assert.equal(await done(), false);
  });
});
