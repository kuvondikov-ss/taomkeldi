// 4-bosqich: bot kirishi, menyular, rollar, takliflar, guruh va tillar.
// Bot Telegram'ga ulanmaydi: barcha API chaqiruvlari ushlab olinadi va tekshiriladi.
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setup, seed, call, tgUser } from './helpers.js';
import { createBot } from '../src/bot/index.js';
import { checkWebappUrl } from '../src/config.js';
import { LOCALES } from '../src/i18n/index.js';

const BOT_INFO = {
  id: 999000, is_bot: true, first_name: 'Taomkeldi', username: 'taomkeldi_test_bot',
  can_join_groups: true, can_read_all_group_messages: false, supports_inline_queries: false,
  can_connect_to_business: false, has_main_web_app: false,
};
const silent = { log() {}, warn() {}, error() {} };

async function botEnv(envOverrides = {}) {
  const env = await setup({ BOT_USERNAME: 'taomkeldi_test_bot', ...envOverrides });
  const ids = seed(env.services);
  const { bot } = createBot({ config: env.config, services: env.services, logger: silent, botInfo: BOT_INFO });
  const calls = [];
  bot.api.config.use(async (_prev, method, payload) => {
    calls.push({ method, payload });
    const result = method === 'sendMessage'
      ? { message_id: calls.length, date: 0, chat: { id: payload.chat_id, type: 'private' }, text: payload.text }
      : true;
    return { ok: true, result };
  });
  let updateId = 1;
  const from = (id, lang = 'uz') => ({ id, is_bot: false, first_name: `User ${id}`, language_code: lang });

  async function send(userId, text, { chat = 'private', chatId, lang } = {}) {
    calls.length = 0;
    const chatObj = chat === 'private' ? { id: userId, type: 'private', first_name: `User ${userId}` } : { id: chatId ?? -100123, type: 'supergroup', title: 'Restoran xodimlari' };
    const message = { message_id: updateId, date: Math.floor(Date.now() / 1000), chat: chatObj, from: from(userId, lang), text };
    if (text.startsWith('/')) message.entities = [{ type: 'bot_command', offset: 0, length: text.split(' ')[0].length }];
    await bot.handleUpdate({ update_id: updateId++, message });
    return calls.filter((c) => c.method === 'sendMessage').map((c) => c.payload);
  }
  async function sendContact(userId, phone) {
    calls.length = 0;
    const message = { message_id: updateId, date: 0, chat: { id: userId, type: 'private', first_name: 'x' }, from: from(userId), contact: { phone_number: phone, first_name: 'x', user_id: userId } };
    await bot.handleUpdate({ update_id: updateId++, message });
    return calls.filter((c) => c.method === 'sendMessage').map((c) => c.payload);
  }
  async function press(userId, data) {
    calls.length = 0;
    await bot.handleUpdate({
      update_id: updateId++,
      callback_query: { id: String(updateId), from: from(userId), chat_instance: '1', data, message: { message_id: 1, date: 0, chat: { id: userId, type: 'private', first_name: 'x' }, text: 'x' } },
    });
    return calls.filter((c) => c.method === 'sendMessage').map((c) => c.payload);
  }
  return { ...env, ids, bot, calls, send, sendContact, press };
}

// Reply keyboard tugmalari matni (tekis ro'yxat).
const buttons = (msg) => (msg.reply_markup?.keyboard || []).flat().map((b) => (typeof b === 'string' ? b : b.text));
const inlineButtons = (msg) => (msg.reply_markup?.inline_keyboard || []).flat();

describe('Bot: /start va rolga qarab menyu', () => {
  let e;
  before(async () => { e = await botEnv(); });
  after(() => e.close());

  test('oddiy mijoz: aynan /start matni va mijoz tugmalari', async () => {
    const [msg] = await e.send(301, '/start');
    assert.ok(msg.text.includes('Taomkeldi’ga xush kelibsiz!'));
    assert.ok(msg.text.includes('Jizzaxdagi kafe va restoranlardan taom buyurtma qiling.'));
    assert.ok(msg.text.includes('DasturXona\'ning yangi loyihasi.'));
    assert.deepEqual(buttons(msg), ['Buyurtma berish', 'Buyurtmalarim', 'Yordam', 'Restoran ulash']);
  });

  test('egasi: restoran paneli bor, admin amallari yo\'q', async () => {
    const [msg] = await e.send(101, '/start');
    const b = buttons(msg);
    assert.ok(b.includes('Restoran paneli'));
    assert.ok(!b.includes('Platforma boshqaruvi'));
    assert.ok(!b.includes('Restoran ulash'));
  });

  test('menejer: restoran paneli; kuryer: kuryer paneli', async () => {
    assert.ok(buttons((await e.send(102, '/start'))[0]).includes('Restoran paneli'));
    const courier = buttons((await e.send(103, '/start'))[0]);
    assert.ok(courier.includes('Kuryer paneli'));
    assert.ok(!courier.includes('Restoran paneli'));
  });

  test('platforma admini: platforma boshqaruvi', async () => {
    assert.ok(buttons((await e.send(900, '/start'))[0]).includes('Platforma boshqaruvi'));
  });

  test('ko\'p rolli foydalanuvchi: hamma tegishli tugmalar', async () => {
    // 101 — R1 egasi; R2 da kuryer qilamiz.
    e.services.restaurants.addCourier(e.ids.r2, { userId: 101, name: 'Egasi-kuryer' });
    const b = buttons((await e.send(101, '/start'))[0]);
    assert.ok(b.includes('Restoran paneli') && b.includes('Kuryer paneli'));
  });

  test('/admin: mijozga ruxsat yo\'q, egasiga o\'z restorani, adminga platforma', async () => {
    assert.equal((await e.send(301, '/admin'))[0].text, 'Bu bo‘lim siz uchun emas.');
    const owner = await e.send(101, '/admin');
    assert.ok(owner[0].text.includes('Restoran Bir — egasi, faol'));
    assert.ok(!owner[0].text.includes('Restoran Ikki'));
    const admin = await e.send(900, '/admin');
    assert.ok(admin[0].text.includes('Faol restoranlar: 2'));
    assert.ok(admin[0].text.includes('WEBAPP_URL berilmagan'), 'noto\'g\'ri sozlangan WEBAPP_URL diagnostikasi');
  });

  test('/panel — /admin aliasi', async () => {
    assert.ok((await e.send(102, '/panel'))[0].text.includes('Restoran Bir — menejer'));
  });

  test('/courier: kuryer bo\'lmaganga ruxsat yo\'q', async () => {
    assert.equal((await e.send(301, '/courier'))[0].text, 'Bu bo‘lim siz uchun emas.');
    assert.ok((await e.send(103, '/courier'))[0].text.includes('Restoran Bir — ishda emas'));
  });

  test('WEBAPP_URL yo\'q: ilova tugmasi o\'rniga tushuntirish', async () => {
    const [msg] = await e.send(301, '/menu');
    assert.ok(msg.text.includes('Ilova hali ulanmagan'));
    assert.equal(inlineButtons(msg).length, 0);
  });

  test('/id va eski /myid', async () => {
    assert.ok((await e.send(301, '/id'))[0].text.includes('<code>301</code>'));
    assert.ok((await e.send(301, '/myid'))[0].text.includes('<code>301</code>'));
  });

  test('/orders mijozning o\'z buyurtmalarini ko\'rsatadi', async () => {
    const [msg] = await e.send(301, '/orders');
    assert.ok(msg.text.includes(`#${e.ids.o1}`));
    assert.ok(msg.text.includes('75 000 so‘m'));
    assert.ok(!msg.text.includes(`#${e.ids.o2}`));
  });
});

describe('Bot: Mini App tugmasi', () => {
  test('to\'g\'ri HTTPS manzil: shaxsiy chatda web_app tugmasi', async () => {
    const e = await botEnv({ WEBAPP_URL: 'https://taomkeldi.example.com' });
    const [msg] = await e.send(301, '/menu');
    const [btn] = inlineButtons(msg);
    assert.equal(btn.web_app.url, 'https://taomkeldi.example.com/');
    const [panel] = await e.send(101, '/admin');
    assert.equal(inlineButtons(panel)[0].web_app.url, 'https://taomkeldi.example.com/#/panel');
    await e.close();
  });

  test('manzil tekshiruvi', () => {
    assert.equal(checkWebappUrl('').ok, false);
    assert.match(checkWebappUrl('http://x.uz').reason, /https/);
    assert.match(checkWebappUrl('https://localhost:3000').reason, /lokal/);
    assert.match(checkWebappUrl('nonsense').reason, /noto'g'ri/);
    assert.equal(checkWebappUrl('https://app.taomkeldi.uz/').url, 'https://app.taomkeldi.uz');
  });
});

describe('Bot: guruh', () => {
  let e;
  before(async () => { e = await botEnv({ WEBAPP_URL: 'https://taomkeldi.example.com' }); });
  after(() => e.close());

  test('guruhda /start: shaxsiy menyu va web_app tugmasi yo\'q', async () => {
    const [msg] = await e.send(301, '/start', { chat: 'group' });
    assert.ok(msg.text.includes('/bogla'));
    assert.equal(msg.reply_markup, undefined);
  });

  test('guruhda /menu va /orders javob bermaydi (shaxsiy ma\'lumot chiqmaydi)', async () => {
    assert.equal((await e.send(301, '/orders', { chat: 'group' })).length, 0);
    assert.equal((await e.send(301, '/menu', { chat: 'group' })).length, 0);
  });

  test('/bogla: xodim emas — rad; xodim — keyingi bosqich; shaxsiy chatda — ko\'rsatma', async () => {
    assert.ok((await e.send(301, '/bogla', { chat: 'group' }))[0].text.includes('faqat restoran egasi yoki menejeri'));
    assert.ok((await e.send(101, '/bogla', { chat: 'group' }))[0].text.includes('keyingi bosqich'));
    assert.ok((await e.send(101, '/bogla'))[0].text.includes('guruhida yuboring'));
  });

  test('guruhdagi oddiy xabar yozuvchini bazaga yozmaydi', async () => {
    await e.send(777, 'salom hammaga', { chat: 'group' });
    assert.equal(e.services.users.get(777), null);
  });
});

describe('Taklif havolalari', () => {
  let e; let admin; let owner; let manager;
  beforeEach(async () => {
    e = await botEnv();
    admin = e.services.users.get(900);
    owner = e.services.users.get(101);
    manager = e.services.users.get(102);
  });
  const done = () => e.close();

  test('egasi taklifi: to\'g\'ri odam ega bo\'ladi, qayta /start dublikat yaratmaydi', async () => {
    const inv = e.services.invites.create(admin, e.ids.r2, { kind: 'owner' });
    const first = await e.send(401, `/start ${inv.payload}`);
    assert.ok(first[0].text.includes('<b>egasi</b>'));
    assert.ok(buttons(first[1]).includes('Restoran paneli'));
    const again = await e.send(401, `/start ${inv.payload}`);
    assert.ok(again[0].text.includes('allaqachon'));
    const n = e.db.prepare('SELECT COUNT(*) AS n FROM staff WHERE user_id = 401').get().n;
    assert.equal(n, 1);
    await done();
  });

  test('ishlatilgan havola boshqa odamga rol bermaydi', async () => {
    const inv = e.services.invites.create(owner, e.ids.r1, { kind: 'manager' });
    await e.send(402, `/start ${inv.payload}`);
    const other = await e.send(403, `/start ${inv.payload}`);
    assert.ok(other[0].text.includes('yaroqsiz'));
    assert.equal(e.services.access.staffRole(e.services.users.get(403), e.ids.r1), null);
    await done();
  });

  test('bekor qilingan va muddati o\'tgan havola ishlamaydi', async () => {
    const a = e.services.invites.create(owner, e.ids.r1, { kind: 'manager' });
    e.services.invites.revoke(owner, e.ids.r1, a.id);
    assert.ok((await e.send(404, `/start ${a.payload}`))[0].text.includes('yaroqsiz'));
    const b = e.services.invites.create(owner, e.ids.r1, { kind: 'manager' });
    e.db.prepare('UPDATE invites SET expires_at = 1 WHERE id = ?').run(b.id);
    assert.ok((await e.send(404, `/start ${b.payload}`))[0].text.includes('yaroqsiz'));
    assert.equal(e.services.access.staffRole(e.services.users.get(404), e.ids.r1), null);
    await done();
  });

  test('yangi egasi taklifi avvalgisini bekor qiladi', async () => {
    const a = e.services.invites.create(admin, e.ids.r2, { kind: 'owner' });
    e.services.invites.create(admin, e.ids.r2, { kind: 'owner' });
    assert.ok((await e.send(405, `/start ${a.payload}`))[0].text.includes('yaroqsiz'));
    await done();
  });

  test('noto\'g\'ri, soxta va ommaviy havolalar rol bermaydi', async () => {
    for (const p of ['inv_abc', 'inv_' + 'A'.repeat(32), 'r_1', 'garbage']) {
      const msgs = await e.send(406, `/start ${p}`);
      assert.ok(msgs.at(-1).text.includes('xush kelibsiz'));
    }
    const roles = e.services.access.rolesOf(e.services.users.get(406));
    assert.equal(roles.staff.length + roles.courier.length, 0);
    await done();
  });

  test('vakolatlar: menejer menejer taklif qila olmaydi, egasi taklifini faqat admin', async () => {
    assert.throws(() => e.services.invites.create(manager, e.ids.r1, { kind: 'manager' }), { code: 'OWNER_ONLY' });
    assert.throws(() => e.services.invites.create(owner, e.ids.r1, { kind: 'owner' }), { code: 'FORBIDDEN' });
    assert.throws(() => e.services.invites.create(owner, e.ids.r2, { kind: 'manager' }), { code: 'FORBIDDEN' });
    await done();
  });

  test('kuryer taklifi aniq kuryer yozuviga bog\'lanadi va yo\'riqnoma yuboriladi', async () => {
    const courierId = e.services.restaurants.addCourier(e.ids.r1, { name: 'Yangi kuryer' });
    const inv = e.services.invites.create(manager, e.ids.r1, { kind: 'courier', courierId });
    const msgs = await e.send(407, `/start ${inv.payload}`);
    assert.ok(msgs[0].text.includes('<b>kuryeri</b>'));
    assert.ok(msgs[0].text.includes('Ishga chiqdim'));
    assert.equal(e.db.prepare('SELECT user_id FROM couriers WHERE id = ?').get(courierId).user_id, 407);
    // Ulangan kuryerga yana taklif berib bo'lmaydi.
    assert.throws(() => e.services.invites.create(manager, e.ids.r1, { kind: 'courier', courierId }), { code: 'CONFLICT' });
    await done();
  });

  test('bloklangan restoran taklifi ishlamaydi', async () => {
    const inv = e.services.invites.create(owner, e.ids.r1, { kind: 'manager' });
    e.db.prepare("UPDATE restaurants SET status = 'blocked' WHERE id = ?").run(e.ids.r1);
    assert.ok((await e.send(408, `/start ${inv.payload}`))[0].text.includes('faol emas'));
    await done();
  });

  test('API: egasi menejer taklifini oladi (havola bilan), menejer ololmaydi', async () => {
    const m = await call(e.base, 102, 'POST', `/api/panel/restaurants/${e.ids.r1}/invites`, { kind: 'manager' });
    assert.equal(m.status, 403);
    assert.equal(m.body.error.code, 'OWNER_ONLY');
    const o = await call(e.base, 101, 'POST', `/api/panel/restaurants/${e.ids.r1}/invites`, { kind: 'manager' });
    assert.equal(o.status, 201);
    assert.match(o.body.invite.link, /^https:\/\/t\.me\/taomkeldi_test_bot\?start=inv_[A-Za-z0-9_-]{32}$/);
    const list = await call(e.base, 101, 'GET', `/api/panel/restaurants/${e.ids.r1}/invites`);
    assert.equal(list.body.invites.length, 1);
    assert.equal(list.body.invites[0].token_hash, undefined, 'xesh ham qaytmasligi kerak');
    await done();
  });
});

describe('Restoran ulash (ariza)', () => {
  test('ariza: nom → telefon → pending restoran, adminga xabar, takror ariza yo\'q', async () => {
    const e = await botEnv();
    await e.send(501, '/start');
    assert.ok((await e.send(501, 'Restoran ulash'))[0].text.includes('nomini'));
    assert.ok((await e.send(501, 'Yangi Choyxona'))[0].text.includes('telefon'));
    assert.ok((await e.send(501, '12'))[0].text.includes('noto‘g‘ri'));
    const done = await e.sendContact(501, '+998901234567');
    assert.ok(done.some((m) => m.chat_id === 501 && m.text.includes('Arizangiz qabul qilindi')));
    assert.ok(done.some((m) => m.chat_id === 900 && m.text.includes('Yangi Choyxona')), 'adminga xabar');
    const r = e.db.prepare('SELECT status, applicant_id, phone FROM restaurants WHERE name = ?').get('Yangi Choyxona');
    assert.deepEqual({ ...r }, { status: 'pending', applicant_id: 501, phone: '+998901234567' });
    assert.ok((await e.send(501, 'Restoran ulash'))[0].text.includes('ko‘rib chiqilmoqda'));
    // Ariza beruvchi hali ega emas (tasdiq — 10-bosqich).
    assert.equal(e.services.access.rolesOf(e.services.users.get(501)).staff.length, 0);
    await e.close();
  });

  test('bekor qilish suhbatni to\'xtatadi', async () => {
    const e = await botEnv();
    await e.send(502, 'Restoran ulash');
    assert.equal((await e.send(502, 'Bekor qilish'))[0].text, 'Bekor qilindi.');
    assert.ok((await e.send(502, 'Bir narsa'))[0].text.includes('Menyudan'));
    await e.close();
  });
});

describe('Tillar', () => {
  test('uz va ru kalitlari bir xil', () => {
    assert.deepEqual(Object.keys(LOCALES.uz).sort(), Object.keys(LOCALES.ru).sort());
  });

  test('Telegram tili ruscha bo\'lsa — ruscha; tanlov keyin ustun', async () => {
    const e = await botEnv();
    const [ru] = await e.send(601, '/start', { lang: 'ru' });
    assert.ok(ru.text.includes('Добро пожаловать в Taomkeldi!'));
    assert.ok(ru.text.includes('DasturXona\'ning yangi loyihasi.'));
    assert.deepEqual(buttons(ru).slice(0, 3), ['Сделать заказ', 'Мои заказы', 'Помощь']);

    const [set] = await e.press(601, 'lang:uz');
    assert.equal(set.text, 'Til: o‘zbekcha.');
    const [uz] = await e.send(601, '/start', { lang: 'ru' }); // Telegram hali ruscha, lekin tanlov o'zbekcha
    assert.ok(uz.text.includes('xush kelibsiz'));

    // Mini App API ham o'sha tilni qaytaradi.
    const me = await call(e.base, 601, 'GET', '/api/me');
    assert.equal(me.body.user.lang, 'uz');
    await e.close();
  });

  test('ruscha tugma matnlari ham taniladi', async () => {
    const e = await botEnv();
    await e.send(602, '/start', { lang: 'ru' });
    const [msg] = await e.send(602, 'Помощь', { lang: 'ru' });
    assert.ok(msg.text.includes('Помощь'));
    assert.deepEqual(inlineButtons(msg).map((b) => b.callback_data), ['lang:uz', 'lang:ru']);
    await e.close();
  });
});

describe('Bot buyruqlari ro\'yxati', () => {
  test('shaxsiy va guruh buyruqlari ikkala tilda o\'rnatiladi', async () => {
    const env = await setup();
    const b = createBot({ config: env.config, services: env.services, logger: silent, botInfo: BOT_INFO });
    const calls = [];
    b.bot.api.config.use(async (_p, method, payload) => { calls.push({ method, payload }); return { ok: true, result: true }; });
    await b.setupCommands();
    const cmds = calls.filter((c) => c.method === 'setMyCommands');
    assert.equal(cmds.length, 4);
    const priv = cmds.find((c) => c.payload.scope.type === 'all_private_chats' && !c.payload.language_code);
    assert.deepEqual(priv.payload.commands.map((c) => c.command), ['start', 'menu', 'orders', 'admin', 'courier', 'help', 'id']);
    const group = cmds.find((c) => c.payload.scope.type === 'all_group_chats');
    assert.deepEqual(group.payload.commands.map((c) => c.command), ['bogla', 'help']);
    const menu = calls.find((c) => c.method === 'setChatMenuButton');
    assert.equal(menu.payload.menu_button.type, 'commands', 'WEBAPP_URL yo\'q — web_app menyusi o\'rnatilmaydi');
    await env.close();
  });
});
