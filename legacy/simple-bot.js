import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { Bot, Keyboard, InlineKeyboard, GrammyError, HttpError } from 'grammy';

// ---------- Sozlamalar ----------
// Railway'da o'zgaruvchi "taomkeldi_bot" nomi bilan qo'shilgan bo'lsa ham ishlaydi
const TOKEN = process.env.BOT_TOKEN || process.env.taomkeldi_bot;
if (!TOKEN) {
  console.error('BOT_TOKEN topilmadi. .env yoki Railway Variables ga qo\'shing.');
  process.exit(1);
}
const ADMIN_IDS = (process.env.ADMIN_CHAT_ID || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const DATA_DIR = process.env.DATA_DIR || './data';
const DB_FILE = path.join(DATA_DIR, 'orders.json');

// ---------- Oddiy JSON baza ----------
function loadDb() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch {
    return { lastId: 0, orders: {} };
  }
}
const db = loadDb();
function saveDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

const STATUS = {
  new: '🆕 Yangi',
  accepted: '✅ Qabul qilindi',
  on_way: '🚚 Yo\'lda',
  delivered: '📬 Yetkazildi',
  cancelled: '❌ Bekor qilindi',
};

// ---------- Matnlar va tugmalar ----------
const BTN = {
  order: '🛵 Buyurtma berish',
  myOrders: '📦 Buyurtmalarim',
  about: 'ℹ️ Biz haqimizda',
  contact: '📞 Aloqa',
  cancel: '❌ Bekor qilish',
  sendPhone: '📱 Raqamni yuborish',
  sendLocation: '📍 Lokatsiyani yuborish',
};

const mainMenu = new Keyboard()
  .text(BTN.order).row()
  .text(BTN.myOrders).text(BTN.about).row()
  .text(BTN.contact)
  .resized();

const cancelKb = new Keyboard().text(BTN.cancel).resized();
const locationKb = new Keyboard()
  .requestLocation(BTN.sendLocation).row()
  .text(BTN.cancel)
  .resized();
const phoneKb = new Keyboard()
  .requestContact(BTN.sendPhone).row()
  .text(BTN.cancel)
  .resized();

const esc = (s = '') =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function placeText(p) {
  if (!p) return '—';
  if (p.lat !== undefined) {
    return `<a href="https://maps.google.com/?q=${p.lat},${p.lon}">📍 Xaritada ko'rish</a>`;
  }
  return esc(p.text);
}

function orderText(o, forAdmin = false) {
  const lines = [
    `<b>Buyurtma #${o.id}</b>  ${STATUS[o.status]}`,
    '',
    `📦 <b>Nima:</b> ${esc(o.what)}`,
    `🏠 <b>Qayerdan:</b> ${placeText(o.from)}`,
    `🎯 <b>Qayerga:</b> ${placeText(o.to)}`,
    `📱 <b>Telefon:</b> ${esc(o.phone)}`,
  ];
  if (forAdmin) {
    const who = o.username ? `@${esc(o.username)}` : esc(o.name);
    lines.push(`👤 <b>Mijoz:</b> ${who} (<code>${o.userId}</code>)`);
  }
  lines.push(`🕒 ${new Date(o.createdAt).toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent' })}`);
  return lines.join('\n');
}

function adminKb(id) {
  return new InlineKeyboard()
    .text(STATUS.accepted, `st:${id}:accepted`)
    .text(STATUS.on_way, `st:${id}:on_way`).row()
    .text(STATUS.delivered, `st:${id}:delivered`)
    .text(STATUS.cancelled, `st:${id}:cancelled`);
}

// ---------- Foydalanuvchi holati (buyurtma bosqichlari) ----------
// step: what -> from -> to -> phone -> confirm
const sessions = new Map();

const bot = new Bot(TOKEN);

bot.command('start', async (ctx) => {
  sessions.delete(ctx.from.id);
  await ctx.reply(
    `Assalomu alaykum, <b>${esc(ctx.from.first_name)}</b>! 👋\n\n` +
      '<b>Taomkeldi</b> — tez va ishonchli yetkazib berish xizmati.\n' +
      'Buyurtma berish uchun pastdagi tugmani bosing.',
    { parse_mode: 'HTML', reply_markup: mainMenu },
  );
});

bot.command('myid', (ctx) =>
  ctx.reply(`Chat ID: <code>${ctx.chat.id}</code>`, { parse_mode: 'HTML' }),
);

bot.hears(BTN.cancel, async (ctx) => {
  sessions.delete(ctx.from.id);
  await ctx.reply('Bekor qilindi.', { reply_markup: mainMenu });
});

bot.hears(BTN.about, (ctx) =>
  ctx.reply(
    '<b>Taomkeldi</b> 🛵\nShahar bo\'ylab hujjat, posilka, oziq-ovqat va boshqa yuklarni tez yetkazib beramiz.',
    { parse_mode: 'HTML', reply_markup: mainMenu },
  ),
);

bot.hears(BTN.contact, (ctx) =>
  ctx.reply('Savollar bo\'yicha: @delivo_uz', { reply_markup: mainMenu }),
);

bot.hears(BTN.myOrders, async (ctx) => {
  const mine = Object.values(db.orders)
    .filter((o) => o.userId === ctx.from.id)
    .sort((a, b) => b.id - a.id)
    .slice(0, 5);
  if (!mine.length) {
    return ctx.reply('Sizda hali buyurtma yo\'q.', { reply_markup: mainMenu });
  }
  await ctx.reply(mine.map((o) => orderText(o)).join('\n\n———\n\n'), {
    parse_mode: 'HTML',
    reply_markup: mainMenu,
    link_preview_options: { is_disabled: true },
  });
});

bot.hears(BTN.order, async (ctx) => {
  sessions.set(ctx.from.id, { step: 'what' });
  await ctx.reply('📦 Nimani yetkazib berish kerak? (masalan: hujjat, posilka, ovqat)', {
    reply_markup: cancelKb,
  });
});

// Buyurtma bosqichlari
bot.on(['message:text', 'message:location', 'message:contact'], async (ctx, next) => {
  const s = sessions.get(ctx.from.id);
  if (!s || ctx.chat.type !== 'private') return next();
  const msg = ctx.message;

  const readPlace = () => {
    if (msg.location) return { lat: msg.location.latitude, lon: msg.location.longitude };
    if (msg.text) return { text: msg.text };
    return null;
  };

  switch (s.step) {
    case 'what':
      if (!msg.text) return ctx.reply('Iltimos, matn bilan yozing.');
      s.what = msg.text;
      s.step = 'from';
      return ctx.reply('🏠 Qayerdan olib ketamiz? Manzilni yozing yoki lokatsiya yuboring.', {
        reply_markup: locationKb,
      });

    case 'from':
      s.from = readPlace();
      if (!s.from) return ctx.reply('Manzilni yozing yoki lokatsiya yuboring.');
      s.step = 'to';
      return ctx.reply('🎯 Qayerga yetkazamiz? Manzilni yozing yoki lokatsiya yuboring.', {
        reply_markup: locationKb,
      });

    case 'to':
      s.to = readPlace();
      if (!s.to) return ctx.reply('Manzilni yozing yoki lokatsiya yuboring.');
      s.step = 'phone';
      return ctx.reply('📱 Telefon raqamingizni yuboring (tugma orqali yoki yozib).', {
        reply_markup: phoneKb,
      });

    case 'phone': {
      const phone = msg.contact?.phone_number || msg.text;
      if (!phone || !/[\d+]{7,}/.test(phone.replace(/[\s()-]/g, ''))) {
        return ctx.reply('Raqam noto\'g\'ri. Masalan: +998901234567');
      }
      s.phone = phone;
      s.step = 'confirm';
      const preview = orderText({
        id: '—', status: 'new', createdAt: Date.now(), ...s,
      });
      return ctx.reply(`${preview}\n\nHammasi to'g'rimi?`, {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
        reply_markup: new InlineKeyboard()
          .text('✅ Tasdiqlash', 'order:confirm')
          .text('❌ Bekor qilish', 'order:cancel'),
      });
    }

    case 'confirm':
      return ctx.reply('Yuqoridagi tugmalardan birini bosing.');
  }
});

bot.callbackQuery('order:cancel', async (ctx) => {
  sessions.delete(ctx.from.id);
  await ctx.answerCallbackQuery();
  await ctx.editMessageReplyMarkup();
  await ctx.reply('Buyurtma bekor qilindi.', { reply_markup: mainMenu });
});

bot.callbackQuery('order:confirm', async (ctx) => {
  const s = sessions.get(ctx.from.id);
  await ctx.answerCallbackQuery();
  if (!s || s.step !== 'confirm') return;
  sessions.delete(ctx.from.id);

  const id = ++db.lastId;
  const order = {
    id,
    userId: ctx.from.id,
    name: [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' '),
    username: ctx.from.username,
    what: s.what,
    from: s.from,
    to: s.to,
    phone: s.phone,
    status: 'new',
    createdAt: Date.now(),
  };
  db.orders[id] = order;
  saveDb();

  await ctx.editMessageReplyMarkup();
  await ctx.reply(
    `✅ Buyurtmangiz qabul qilindi! Raqami: <b>#${id}</b>\nTez orada operator siz bilan bog'lanadi.`,
    { parse_mode: 'HTML', reply_markup: mainMenu },
  );

  if (!ADMIN_IDS.length) {
    console.warn(`Buyurtma #${id} keldi, lekin ADMIN_CHAT_ID sozlanmagan.`);
  }
  for (const adminId of ADMIN_IDS) {
    try {
      await bot.api.sendMessage(adminId, orderText(order, true), {
        parse_mode: 'HTML',
        reply_markup: adminKb(id),
        link_preview_options: { is_disabled: true },
      });
    } catch (e) {
      console.error(`Adminga (${adminId}) yuborib bo'lmadi:`, e.description || e.message);
    }
  }
});

// Admin buyurtma holatini o'zgartiradi
bot.callbackQuery(/^st:(\d+):(\w+)$/, async (ctx) => {
  const isAdmin =
    ADMIN_IDS.includes(String(ctx.from.id)) ||
    ADMIN_IDS.includes(String(ctx.callbackQuery.message?.chat.id));
  if (!isAdmin) return ctx.answerCallbackQuery({ text: 'Ruxsat yo\'q', show_alert: true });

  const [, id, status] = ctx.match;
  const order = db.orders[id];
  if (!order || !STATUS[status]) return ctx.answerCallbackQuery({ text: 'Topilmadi' });
  if (order.status === status) return ctx.answerCallbackQuery({ text: 'Holat o\'zgarmadi' });

  order.status = status;
  saveDb();
  await ctx.answerCallbackQuery({ text: STATUS[status] });
  await ctx.editMessageText(orderText(order, true), {
    parse_mode: 'HTML',
    reply_markup: adminKb(id),
    link_preview_options: { is_disabled: true },
  });
  try {
    await bot.api.sendMessage(
      order.userId,
      `Buyurtma <b>#${id}</b> holati: ${STATUS[status]}`,
      { parse_mode: 'HTML' },
    );
  } catch (e) {
    console.error('Mijozga xabar yuborilmadi:', e.description || e.message);
  }
});

bot.on('message', (ctx) => {
  if (ctx.chat.type !== 'private') return;
  return ctx.reply('Menyudan tanlang 👇', { reply_markup: mainMenu });
});

bot.catch((err) => {
  const e = err.error;
  if (e instanceof GrammyError) console.error('Telegram xatosi:', e.description);
  else if (e instanceof HttpError) console.error('Tarmoq xatosi:', e);
  else console.error('Xato:', e);
});

// ---------- Ishga tushirish ----------
await bot.api.setMyCommands([
  { command: 'start', description: 'Boshlash' },
  { command: 'myid', description: 'Chat ID ni bilish' },
]);

const stop = () => bot.stop();
process.once('SIGINT', stop);
process.once('SIGTERM', stop);

bot
  .start({
    drop_pending_updates: false,
    onStart: (me) => console.log(`@${me.username} ishga tushdi. Adminlar: ${ADMIN_IDS.join(', ') || 'yo\'q'}`),
  })
  .catch((e) => {
    console.error('Bot to\'xtadi:', e.description || e.message);
    process.exit(1);
  });
