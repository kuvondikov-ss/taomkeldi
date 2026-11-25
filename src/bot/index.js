// Telegram bot (grammY). Biznes mantiq yo'q — faqat services chaqiriladi.
// To'liq /start, menyu, tillar va takliflar — 4-bosqich.
import { Bot, InlineKeyboard, GrammyError, HttpError } from 'grammy';

const TEXT = {
  uz: {
    start: '<b>Taomkeldi’ga xush kelibsiz!</b>\nJizzaxdagi kafe va restoranlardan taom buyurtma qiling.\n\n<i>DasturXona\'ning yangi loyihasi.</i>',
    soon: 'Buyurtma berish tez orada ishga tushadi.',
    open: 'Ilovani ochish',
    id: 'Sizning ID: <code>{user}</code>\nChat ID: <code>{chat}</code>',
    help: 'Buyruqlar:\n/start — boshlash\n/id — ID raqamingiz',
    group: 'Bu guruhni restoranga ulash funksiyasi tez orada qo\'shiladi.',
  },
  ru: {
    start: '<b>Добро пожаловать в Taomkeldi!</b>\nЗаказывайте еду из кафе и ресторанов Джизака.\n\n<i>DasturXona\'ning yangi loyihasi.</i>',
    soon: 'Оформление заказов скоро заработает.',
    open: 'Открыть приложение',
    id: 'Ваш ID: <code>{user}</code>\nChat ID: <code>{chat}</code>',
    help: 'Команды:\n/start — начать\n/id — ваш ID',
    group: 'Подключение этой группы к ресторану скоро будет добавлено.',
  },
};

export function createBot({ config, services, logger = console }) {
  const bot = new Bot(config.botToken);
  const t = (user, key, vars = {}) =>
    TEXT[services.users.langOf(user)][key].replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));

  // Har bir update: Telegram yuborgan foydalanuvchini bazaga yozamiz (bot token orqali kelgan — ishonchli).
  bot.use(async (ctx, next) => {
    if (ctx.from && !ctx.from.is_bot) {
      ctx.state = { user: services.users.upsertFromTelegram(ctx.from) };
      if (ctx.state.user.is_blocked) return;
    }
    return next();
  });

  bot.command('start', async (ctx) => {
    const user = ctx.state.user;
    if (ctx.chat.type !== 'private') return ctx.reply(t(user, 'group'));
    if (services.users.bootstrapAutoAdmin(user.id)) {
      logger.warn(`AUTO_ADMIN: ${user.id} platforma administratori qilindi (faqat test muhiti).`);
    }
    const kb = config.webappUrl.startsWith('https://')
      ? new InlineKeyboard().webApp(t(user, 'open'), config.webappUrl)
      : undefined;
    await ctx.reply(`${t(user, 'start')}\n\n${t(user, 'soon')}`, { parse_mode: 'HTML', reply_markup: kb });
  });

  const showId = (ctx) => ctx.reply(t(ctx.state.user, 'id', { user: ctx.from.id, chat: ctx.chat.id }), { parse_mode: 'HTML' });
  bot.command('id', showId);
  bot.command('myid', showId); // eski nom, moslik uchun

  bot.command('help', (ctx) => ctx.reply(t(ctx.state.user, 'help')));

  bot.catch((err) => {
    const e = err.error;
    if (e instanceof GrammyError) logger.error('Telegram xatosi:', e.description);
    else if (e instanceof HttpError) logger.error('Tarmoq xatosi:', e.message);
    else logger.error('Bot xatosi:', e);
  });

  async function start() {
    await bot.api.setMyCommands([
      { command: 'start', description: 'Boshlash' },
      { command: 'id', description: 'ID raqamingiz' },
      { command: 'help', description: 'Yordam' },
    ]);
    // Long polling. Faqat bitta nusxa ishlashi kerak: 409 Conflict'da jarayon to'xtaydi va Railway qayta yoqadi.
    bot.start({ onStart: (me) => logger.log(`@${me.username} ishga tushdi`) }).catch((e) => {
      logger.error('Bot to\'xtadi:', e.description || e.message);
      process.exit(1);
    });
  }

  return { bot, start, stop: () => bot.stop() };
}
