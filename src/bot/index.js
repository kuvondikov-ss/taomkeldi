// Telegram bot (grammY). Biznes qoidalari yo'q — faqat services chaqiriladi.
// Matnlar markaziy tarjima fayllarida: src/i18n/{uz,ru}.js
import { Bot, InlineKeyboard, Keyboard, GrammyError, HttpError } from 'grammy';
import { t, keyOfLabel, formatSum, LANGS } from '../i18n/index.js';
import { INVITE_PREFIX } from '../services/invites.js';
import { registerGroupHandlers } from './group.js';
import { registerCourierHandlers } from './courier.js';


export function createBot({ config, services, logger = console, botInfo }) {
  const bot = new Bot(config.botToken, botInfo ? { botInfo } : undefined);
  const { users, access, orders, restaurants, invites } = services;

  // --- Har update: foydalanuvchini bazaga yozish, tilni aniqlash ---
  bot.use(async (ctx, next) => {
    // Guruhlarda oddiy xabar yozganlarni bazaga yozmaymiz — faqat buyruq va tugma bosganlarni.
    const relevant = ctx.chat?.type === 'private' || ctx.callbackQuery || ctx.message?.text?.startsWith('/');
    if (ctx.from && !ctx.from.is_bot && relevant) {
      ctx.user = users.upsertFromTelegram(ctx.from);
      if (ctx.user.is_blocked) return;
      // Botni bloklagan foydalanuvchi qayta yozdi — unga xabarlar yana yuboriladi.
      if (ctx.chat?.type === 'private' && ctx.user.bot_blocked_at) users.setBotBlocked(ctx.user.id, false);
      ctx.lang = users.langOf(ctx.user);
    } else {
      ctx.lang = 'uz';
    }
    ctx.t = (key, vars) => t(ctx.lang, key, vars);
    return next();
  });

  const isPrivate = (ctx) => ctx.chat?.type === 'private';
  const html = { parse_mode: 'HTML', link_preview_options: { is_disabled: true } };

  // --- Tugmalar ---
  function mainKeyboard(ctx) {
    const roles = access.rolesOf(ctx.user);
    const kb = new Keyboard()
      .text(ctx.t('btn_order')).row()
      .text(ctx.t('btn_orders')).text(ctx.t('btn_help')).row();
    const roleRow = [];
    if (roles.staff.length) roleRow.push(ctx.t('btn_panel'));
    if (roles.courier.length) roleRow.push(ctx.t('btn_courier'));
    if (roles.platformAdmin) roleRow.push(ctx.t('btn_admin'));
    if (roleRow.length) {
      roleRow.forEach((label) => kb.text(label));
      kb.row();
    }
    // "Restoran ulash" tugmasi yo'q: restoranlarni faqat platforma admini qo'shadi.
    return kb.resized().persistent();
  }

  // Mini App tugmasi — faqat to'g'ri HTTPS manzil bo'lsa va faqat shaxsiy chatda.
  function appKeyboard(ctx, route = '') {
    if (!config.webapp.ok || !isPrivate(ctx)) return undefined;
    return new InlineKeyboard().webApp(ctx.t('btn_open_app'), `${config.webapp.url}/${route ? `#/${route}` : ''}`);
  }

  async function replyWithApp(ctx, text, route) {
    const kb = appKeyboard(ctx, route);
    if (!kb) return ctx.reply(`${text}\n\n${ctx.t('app_not_ready')}`, html);
    return ctx.reply(text, { ...html, reply_markup: kb });
  }

  // --- /start ---
  async function handleInvite(ctx, payload) {
    const r = invites.accept(ctx.user, payload);
    if (r.status === 'ok' && r.kind === 'courier') {
      // Kuryerga yo'riqnoma va darhol "Ishga chiqdim" tugmasi.
      await ctx.reply(ctx.t('invite_courier', { restaurant: r.restaurant }), html);
      return courierBot.showCourier(ctx);
    }
    if (r.status === 'ok') return ctx.reply(ctx.t(`invite_${r.kind}`, { restaurant: r.restaurant }), html);
    if (r.status === 'already') return ctx.reply(ctx.t('invite_already', { restaurant: r.restaurant }), html);
    if (r.status === 'inactive') return ctx.reply(ctx.t('invite_blocked'), html);
    return ctx.reply(ctx.t('invite_invalid'), html);
  }

  bot.command('start', async (ctx) => {
    if (!isPrivate(ctx)) return ctx.reply(ctx.t('group_start'));
    if (users.bootstrapAutoAdmin(ctx.user.id)) {
      logger.warn(`AUTO_ADMIN: ${ctx.user.id} platforma administratori qilindi (faqat test muhiti).`);
      ctx.user = users.get(ctx.user.id);
    }
    const payload = ctx.match?.trim();
    // Guruhdagi "Panelda ochish" havolasi: faqat restoran xodimiga buyurtma paneli ochiladi.
    if (groupBot.isPanelLink(payload)) return groupBot.openOrderFromLink(ctx, payload, replyWithApp);
    if (payload?.startsWith(INVITE_PREFIX)) await handleInvite(ctx, payload);
    // Boshqa payload'lar (masalan, ommaviy r_<id> reklama havolasi) hech qanday rol bermaydi.
    await ctx.reply(ctx.t('start'), { ...html, reply_markup: mainKeyboard(ctx) });
  });

  // --- Buyurtma berish / ilova ---
  const openOrder = (ctx) => replyWithApp(ctx, ctx.t('order_open'));

  // --- Buyurtmalarim ---
  async function showOrders(ctx) {
    const list = orders.listForCustomer(ctx.user, { limit: 5 });
    if (!list.length) return replyWithApp(ctx, ctx.t('orders_empty'));
    const lines = list.map((o) => ctx.t('order_line', {
      id: o.id, restaurant: o.restaurant_name, total: formatSum(o.total, ctx.lang), status: ctx.t(`status_${o.status}`),
    }));
    return replyWithApp(ctx, `${ctx.t('orders_title')}\n\n${lines.join('\n')}`, 'orders');
  }

  // --- Yordam va til ---
  function langKeyboard() {
    return new InlineKeyboard().text('O‘zbekcha', 'lang:uz').text('Русский', 'lang:ru');
  }
  const showHelp = (ctx) => ctx.reply(ctx.t('help'), { ...html, reply_markup: isPrivate(ctx) ? langKeyboard() : undefined });

  bot.callbackQuery(/^lang:(uz|ru)$/, async (ctx) => {
    const lang = ctx.match[1];
    ctx.user = users.setLang(ctx.user.id, lang);
    ctx.lang = lang;
    await ctx.answerCallbackQuery();
    await ctx.reply(ctx.t('lang_set'), { reply_markup: mainKeyboard(ctx) });
  });

  // --- Restoran paneli / platforma / kuryer ---
  async function showPanel(ctx) {
    const roles = access.rolesOf(ctx.user);
    if (!roles.staff.length) return ctx.reply(ctx.t('no_access'));
    const lines = roles.staff.map((s) => ctx.t('panel_line', {
      name: s.restaurantName, role: ctx.t(`role_${s.role}`), status: ctx.t(`rstatus_${s.restaurantStatus}`),
    }));
    return replyWithApp(ctx, `${ctx.t('panel_title')}\n\n${lines.join('\n')}\n\n${ctx.t('panel_in_app')}`, 'panel');
  }

  async function showPlatform(ctx) {
    if (!access.isPlatformAdmin(ctx.user)) return ctx.reply(ctx.t('no_access'));
    const c = restaurants.statusCounts(ctx.user);
    const diag = config.webapp.ok ? ctx.t('webapp_ok') : ctx.t('webapp_bad', { reason: config.webapp.reason });
    return replyWithApp(ctx, `${ctx.t('admin_title', c)}\n\n${diag}`, 'admin');
  }

  // /admin: platforma admini — platforma; restoran xodimi — restoran paneli; boshqalar — ruxsat yo'q.
  async function adminCommand(ctx) {
    const roles = access.rolesOf(ctx.user);
    if (!roles.platformAdmin && !roles.staff.length) return ctx.reply(ctx.t('no_access'));
    if (roles.platformAdmin) await showPlatform(ctx);
    if (roles.staff.length) await showPanel(ctx);
  }

  // Kuryer paneli: smena tugmalari + Mini App (src/bot/courier.js).
  const showCourier = (ctx) => courierBot.showCourier(ctx);

  const showId = (ctx) => ctx.reply(ctx.t('id', { user: ctx.from.id, chat: ctx.chat.id }), html);

  // --- Restoran guruhi: /bogla, buyurtma tugmalari, bot holati, migratsiya ---
  const groupBot = registerGroupHandlers(bot, { services, logger });

  // --- Shaxsiy chat: foydalanuvchi botni bloklasa/blokdan chiqarsa ---
  bot.on('my_chat_member', async (ctx) => {
    if (!isPrivate(ctx)) return;
    const st = ctx.myChatMember.new_chat_member.status;
    users.setBotBlocked(ctx.myChatMember.from.id, st === 'kicked');
  });

  // --- Kuryer: smena, dispetcher takliflari, buyurtma tugmalari, joylashuv ---
  const courierBot = registerCourierHandlers(bot, { services, logger, replyWithApp });

  // --- Shaxsiy chat buyruqlari ---
  const privateOnly = (fn) => (ctx) => (isPrivate(ctx) ? fn(ctx) : undefined);
  bot.command('menu', privateOnly(openOrder));
  bot.command('orders', privateOnly(showOrders));
  bot.command(['admin', 'panel'], privateOnly(adminCommand));
  bot.command('courier', privateOnly(showCourier));
  bot.command('help', showHelp);
  bot.command(['id', 'myid'], showId);

  // --- Matnli tugmalar ---
  bot.on(['message:text', 'message:contact'], async (ctx, next) => {
    if (!isPrivate(ctx)) return next();
    const key = ctx.message.text ? keyOfLabel(ctx.message.text) : null;

    switch (key) {
      case 'btn_cancel': return ctx.reply(ctx.t('cancelled'), { reply_markup: mainKeyboard(ctx) });
      // Eski klaviaturadagi "Restoran ulash" — endi faqat admin qo'shadi; yangi klaviatura yuboriladi.
      case 'btn_connect': return ctx.reply(ctx.t('connect_admin_only'), { ...html, reply_markup: mainKeyboard(ctx) });
      case 'btn_order': return openOrder(ctx);
      case 'btn_orders': return showOrders(ctx);
      case 'btn_help': return showHelp(ctx);
      case 'btn_panel': return showPanel(ctx);
      case 'btn_courier': return showCourier(ctx);
      case 'btn_admin': return showPlatform(ctx);
      default: return ctx.reply(ctx.t('menu_hint'), { reply_markup: mainKeyboard(ctx) });
    }
  });

  // --- Onlayn to'lov (Telegram Payments) ---
  // Oxirgi tekshiruv: buyurtma, summa, valyuta, holat. 10 soniya ichida javob berish shart.
  bot.on('pre_checkout_query', async (ctx) => {
    const r = services.payments.validatePreCheckout(ctx.preCheckoutQuery);
    if (r.ok) await ctx.answerPreCheckoutQuery(true);
    else await ctx.answerPreCheckoutQuery(false, { error_message: r.error });
  });
  // "To'landi" faqat shu xabardan: summa/valyuta/payload tekshiriladi, takror to'lov hisoblanmaydi.
  bot.on('message:successful_payment', async (ctx) => {
    const sp = ctx.message.successful_payment;
    const r = services.payments.applySuccessfulPayment(sp, ctx.from.id);
    // Mijoz xabari outbox orqali (dedupe): hodisa tinglovchisi ham shu kalit bilan yuborsa — takrorlanmaydi.
    if (r.outcome === 'applied') await services.orderNotify.customer(r.orderId);
    else if (r.outcome === 'late_refund_requested') await services.notify.send(ctx.from.id, 'payment_late', { id: r.orderId }, { dedupeKey: `cust:${r.orderId}:late` });
    if (r.outcome === 'mismatch' || r.outcome === 'late_refund_requested') {
      logger.warn(`To'lov e'tibor talab qiladi: ${r.outcome}, buyurtma ${r.orderId}, charge ${sp.telegram_payment_charge_id}`);
      for (const adminId of access.platformAdminIds()) {
        try {
          await bot.api.sendMessage(adminId, `To'lov e'tibor talab qiladi: ${r.outcome}\nBuyurtma: #${r.orderId ?? '—'}\nSumma: ${sp.total_amount} ${sp.currency}\nCharge: ${sp.telegram_payment_charge_id}`);
        } catch (e) {
          logger.error('Adminga to\'lov xabari yuborilmadi:', e.description || e.message);
        }
      }
    }
  });

  // Har callback javob olsin: eski yoki noma'lum tugma (masalan, oldingi bot versiyasidan) — qisqa izoh.
  bot.on('callback_query:data', (ctx) => ctx.answerCallbackQuery({ text: ctx.t('btn_stale') }));

  bot.catch((err) => {
    const e = err.error;
    if (e instanceof GrammyError) logger.error('Telegram xatosi:', e.description);
    else if (e instanceof HttpError) logger.error('Tarmoq xatosi:', e.message);
    else logger.error('Bot xatosi:', e);
  });

  // --- Buyruqlar ro'yxati va menyu tugmasi ---
  async function setupCommands() {
    for (const lang of LANGS) {
      const language_code = lang === 'uz' ? undefined : lang;
      const d = (uz, ru) => (lang === 'ru' ? ru : uz);
      await bot.api.setMyCommands([
        { command: 'start', description: d('Boshlash', 'Начать') },
        { command: 'menu', description: d('Ilovani ochish', 'Открыть приложение') },
        { command: 'orders', description: d('Buyurtmalarim', 'Мои заказы') },
        { command: 'admin', description: d('Restoran / platforma paneli', 'Панель ресторана / платформы') },
        { command: 'courier', description: d('Kuryer paneli', 'Панель курьера') },
        { command: 'help', description: d('Yordam va til', 'Помощь и язык') },
        { command: 'id', description: d('Telegram ID', 'Telegram ID') },
      ], { scope: { type: 'all_private_chats' }, language_code });
      await bot.api.setMyCommands([
        { command: 'bogla', description: d('Guruhni restoranga ulash', 'Подключить группу к ресторану') },
        { command: 'help', description: d('Yordam', 'Помощь') },
      ], { scope: { type: 'all_group_chats' }, language_code });
    }
    await bot.api.setChatMenuButton({
      menu_button: config.webapp.ok
        ? { type: 'web_app', text: 'Taomkeldi', web_app: { url: `${config.webapp.url}/` } }
        : { type: 'commands' },
    });
  }

  async function start() {
    await bot.init();
    config.botUsername = bot.botInfo.username;
    if (!config.webapp.ok) logger.warn(`Mini App tugmasi o'chiq: ${config.webapp.reason}`);
    await setupCommands();
    // Long polling. Faqat bitta nusxa ishlashi kerak: 409 Conflict'da jarayon to'xtaydi va Railway qayta yoqadi.
    bot.start({ onStart: (me) => logger.log(`@${me.username} ishga tushdi`) }).catch((e) => {
      logger.error('Bot to\'xtadi:', e.description || e.message);
      process.exit(1);
    });
  }

  return { bot, start, stop: () => bot.stop(), setupCommands };
}
