// Telegram bot (grammY). Biznes qoidalari yo'q — faqat services chaqiriladi.
// Matnlar markaziy tarjima fayllarida: src/i18n/{uz,ru}.js
import { Bot, InlineKeyboard, Keyboard, GrammyError, HttpError } from 'grammy';
import { t, keyOfLabel, formatSum, LANGS } from '../i18n/index.js';
import { INVITE_PREFIX } from '../services/invites.js';
import { AppError } from '../lib/errors.js';

const CONVO_TTL_MS = 15 * 60 * 1000;

export function createBot({ config, services, logger = console, botInfo }) {
  const bot = new Bot(config.botToken, botInfo ? { botInfo } : undefined);
  const { users, access, orders, restaurants, invites } = services;
  const convos = new Map(); // userId -> { step, name, at }  (restoran arizasi suhbati)

  // --- Har update: foydalanuvchini bazaga yozish, tilni aniqlash ---
  bot.use(async (ctx, next) => {
    // Guruhlarda oddiy xabar yozganlarni bazaga yozmaymiz — faqat buyruq va tugma bosganlarni.
    const relevant = ctx.chat?.type === 'private' || ctx.callbackQuery || ctx.message?.text?.startsWith('/');
    if (ctx.from && !ctx.from.is_bot && relevant) {
      ctx.user = users.upsertFromTelegram(ctx.from);
      if (ctx.user.is_blocked) return;
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
    if (!roles.staff.length) kb.text(ctx.t('btn_connect'));
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
    if (r.status === 'ok') return ctx.reply(ctx.t(`invite_${r.kind}`, { restaurant: r.restaurant }), html);
    if (r.status === 'already') return ctx.reply(ctx.t('invite_already', { restaurant: r.restaurant }), html);
    if (r.status === 'inactive') return ctx.reply(ctx.t('invite_blocked'), html);
    return ctx.reply(ctx.t('invite_invalid'), html);
  }

  bot.command('start', async (ctx) => {
    if (!isPrivate(ctx)) return ctx.reply(ctx.t('group_start'));
    convos.delete(ctx.user.id);
    if (users.bootstrapAutoAdmin(ctx.user.id)) {
      logger.warn(`AUTO_ADMIN: ${ctx.user.id} platforma administratori qilindi (faqat test muhiti).`);
      ctx.user = users.get(ctx.user.id);
    }
    const payload = ctx.match?.trim();
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

  async function showCourier(ctx) {
    const roles = access.rolesOf(ctx.user);
    if (!roles.courier.length) return ctx.reply(ctx.t('no_access'));
    const lines = roles.courier.map((c) => ctx.t('courier_line', {
      name: c.restaurantName, online: ctx.t(c.isOnline ? 'courier_online' : 'courier_offline'),
    }));
    return replyWithApp(ctx, `${ctx.t('courier_title')}\n\n${lines.join('\n')}`, 'courier');
  }

  const showId = (ctx) => ctx.reply(ctx.t('id', { user: ctx.from.id, chat: ctx.chat.id }), html);

  // --- Restoran ulash (ariza) ---
  async function startApplication(ctx) {
    const pending = restaurants.pendingApplicationOf(ctx.user);
    if (pending) return ctx.reply(ctx.t('apply_exists', { name: pending.name }), { ...html, reply_markup: mainKeyboard(ctx) });
    convos.set(ctx.user.id, { step: 'name', at: Date.now() });
    return ctx.reply(ctx.t('apply_name'), { reply_markup: new Keyboard().text(ctx.t('btn_cancel')).resized() });
  }

  async function notifyAdmins(restaurant, ctx) {
    const who = ctx.from.username ? `@${ctx.from.username}` : `${ctx.from.first_name} (${ctx.from.id})`;
    for (const adminId of access.platformAdminIds()) {
      const admin = users.get(adminId);
      const lang = admin ? users.langOf(admin) : 'uz';
      try {
        await bot.api.sendMessage(adminId, t(lang, 'apply_admin', {
          id: restaurant.id, name: restaurant.name, phone: restaurant.phone, user: who,
        }), html);
      } catch (e) {
        logger.error(`Adminga (${adminId}) ariza xabari yuborilmadi:`, e.description || e.message);
      }
    }
  }

  async function continueApplication(ctx, convo) {
    const msg = ctx.message;
    if (convo.step === 'name') {
      const name = msg.text?.trim();
      if (!name || name.length < 2 || name.length > 120) return ctx.reply(ctx.t('apply_name'));
      convos.set(ctx.user.id, { step: 'phone', name, at: Date.now() });
      return ctx.reply(ctx.t('apply_phone'), {
        reply_markup: new Keyboard().requestContact(ctx.t('btn_send_phone')).row().text(ctx.t('btn_cancel')).resized(),
      });
    }
    // step === 'phone'
    const phone = msg.contact?.user_id === ctx.from.id ? msg.contact.phone_number : msg.text?.trim();
    try {
      const { restaurant, created } = restaurants.createApplication(ctx.user, { name: convo.name, phone });
      convos.delete(ctx.user.id);
      if (!created) return ctx.reply(ctx.t('apply_exists', { name: restaurant.name }), { ...html, reply_markup: mainKeyboard(ctx) });
      await ctx.reply(ctx.t('apply_done', { name: restaurant.name }), { ...html, reply_markup: mainKeyboard(ctx) });
      await notifyAdmins(restaurant, ctx);
    } catch (e) {
      if (e instanceof AppError && e.code === 'VALIDATION') return ctx.reply(ctx.t('apply_phone_invalid'));
      throw e;
    }
  }

  // --- Guruh: /bogla (to'liq ulash — 12-bosqich) ---
  bot.command('bogla', async (ctx) => {
    if (isPrivate(ctx)) return ctx.reply(ctx.t('bogla_private'));
    const roles = access.rolesOf(ctx.user);
    if (!roles.staff.length) return ctx.reply(ctx.t('bogla_not_staff'));
    return ctx.reply(ctx.t('bogla_soon'));
  });

  // --- Shaxsiy chat buyruqlari ---
  const privateOnly = (fn) => (ctx) => (isPrivate(ctx) ? fn(ctx) : undefined);
  bot.command('menu', privateOnly(openOrder));
  bot.command('orders', privateOnly(showOrders));
  bot.command(['admin', 'panel'], privateOnly(adminCommand));
  bot.command('courier', privateOnly(showCourier));
  bot.command('help', showHelp);
  bot.command(['id', 'myid'], showId);

  // --- Matnli tugmalar va suhbat ---
  bot.on(['message:text', 'message:contact'], async (ctx, next) => {
    if (!isPrivate(ctx)) return next();
    const key = ctx.message.text ? keyOfLabel(ctx.message.text) : null;

    if (key === 'btn_cancel') {
      convos.delete(ctx.user.id);
      return ctx.reply(ctx.t('cancelled'), { reply_markup: mainKeyboard(ctx) });
    }
    const convo = convos.get(ctx.user.id);
    if (convo && Date.now() - convo.at < CONVO_TTL_MS && !key) return continueApplication(ctx, convo);
    if (convo) convos.delete(ctx.user.id);

    switch (key) {
      case 'btn_order': return openOrder(ctx);
      case 'btn_orders': return showOrders(ctx);
      case 'btn_help': return showHelp(ctx);
      case 'btn_panel': return showPanel(ctx);
      case 'btn_courier': return showCourier(ctx);
      case 'btn_admin': return showPlatform(ctx);
      case 'btn_connect': return startApplication(ctx);
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
    if (r.outcome === 'applied') await ctx.reply(ctx.t('payment_ok', { id: r.orderId }), html);
    else if (r.outcome === 'late_refund_requested') await ctx.reply(ctx.t('payment_late', { id: r.orderId }), html);
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
