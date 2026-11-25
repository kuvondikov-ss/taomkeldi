// Kuryer: smena ("Ishga chiqdim" / "Ishni tugatdim"), dispetcher takliflari, buyurtma amallari, joylashuv.
// Har tugmada vakolat serverda: services.dispatch / services.orders (faqat shu restoranning, o'ziga biriktirilgan buyurtmasi).
import { AppError } from '../lib/errors.js';

export function registerCourierHandlers(bot, { services, logger = console, replyWithApp }) {
  const { dispatch, orderNotify } = services;
  const html = { parse_mode: 'HTML', link_preview_options: { is_disabled: true } };

  // Smena tugmalari: har restoran uchun alohida.
  function shiftKeyboard(ctx, rows) {
    return {
      inline_keyboard: rows.map((c) => [{
        text: ctx.t(c.is_online ? 'k_shift_off_btn' : 'k_shift_on_btn', { restaurant: c.restaurant_name }),
        callback_data: `cs:${c.id}:${c.is_online ? 0 : 1}`,
      }]),
    };
  }

  async function showCourier(ctx) {
    const rows = dispatch.myRows(ctx.user);
    if (!rows.length) return ctx.reply(ctx.t('no_access'));
    const lines = rows.map((c) => ctx.t('courier_line', { name: c.restaurant_name, online: ctx.t(c.is_online ? 'courier_online' : 'courier_offline') }));
    await ctx.reply(`${ctx.t('courier_title')}\n\n${lines.join('\n')}`, { ...html, reply_markup: shiftKeyboard(ctx, rows) });
    return replyWithApp(ctx, ctx.t('courier_app_hint'), 'courier');
  }

  // --- Smena ---
  bot.callbackQuery(/^cs:(\d+):([01])$/, async (ctx) => {
    const online = ctx.match[2] === '1';
    try {
      const r = await dispatch.setOnline(ctx.user, Number(ctx.match[1]), online);
      const row = dispatch.myRows(ctx.user).find((c) => c.id === r.courier_id);
      await ctx.answerCallbackQuery();
      await ctx.editMessageReplyMarkup({ reply_markup: shiftKeyboard(ctx, dispatch.myRows(ctx.user)) }).catch(() => {});
      return ctx.reply(ctx.t(online ? 'k_shift_on' : 'k_shift_off', { restaurant: row?.restaurant_name || '' }), html);
    } catch (e) {
      if (e instanceof AppError && e.code === 'CONFLICT') return ctx.answerCallbackQuery({ text: ctx.t('invite_blocked'), show_alert: true });
      if (e instanceof AppError) return ctx.answerCallbackQuery({ text: ctx.t('no_access'), show_alert: true });
      throw e;
    }
  });

  // --- Dispetcher taklifi: d:<id>:ok | no ---
  bot.callbackQuery(/^d:(\d+):(ok|no)$/, async (ctx) => {
    const id = Number(ctx.match[1]);
    try {
      if (ctx.match[2] === 'no') {
        await dispatch.decline(ctx.user, id);
        return ctx.answerCallbackQuery();
      }
      await dispatch.accept(ctx.user, id);
      return ctx.answerCallbackQuery({ text: ctx.t('k_accept_ok') });
    } catch (e) {
      if (!(e instanceof AppError)) throw e;
      const reason = e.details?.reason;
      const key = reason === 'taken' ? 'k_taken_alert' : reason === 'offline' ? 'k_offline_alert' : e.code === 'NOT_FOUND' ? 'k_not_yours' : 'k_offer_closed_alert';
      return ctx.answerCallbackQuery({ text: ctx.t(key), show_alert: true });
    }
  });

  // --- Biriktirilgan buyurtma: c:<id>:pk (olib ketdim) | dl (yetkazdim) | rl (voz kechish) | pb (muammo) ---
  bot.callbackQuery(/^c:(\d+):(pk|dl|rl|pb)$/, async (ctx) => {
    const id = Number(ctx.match[1]);
    const act = ctx.match[2];
    try {
      if (act === 'pk') dispatch.pickup(ctx.user, id);
      else if (act === 'dl') dispatch.deliver(ctx.user, id);
      else if (act === 'rl') {
        await dispatch.release(ctx.user, id);
        return await ctx.answerCallbackQuery({ text: ctx.t('k_released_ok'), show_alert: true });
      } else {
        await dispatch.reportProblem(ctx.user, id);
        return await ctx.answerCallbackQuery({ text: ctx.t('k_problem_ok'), show_alert: true });
      }
      return await ctx.answerCallbackQuery({ text: ctx.t('g_ok') });
    } catch (e) {
      if (e instanceof AppError && e.details?.reason === 'picked_up') return ctx.answerCallbackQuery({ text: ctx.t('k_picked_alert'), show_alert: true });
      if (e instanceof AppError && ['INVALID_TRANSITION', 'CONFLICT'].includes(e.code)) {
        await ctx.answerCallbackQuery({ text: ctx.t('g_stale'), show_alert: true });
        await orderNotify.courier(id);
        return undefined;
      }
      if (e instanceof AppError && ['FORBIDDEN', 'NOT_FOUND'].includes(e.code)) return ctx.answerCallbackQuery({ text: ctx.t('k_not_yours'), show_alert: true });
      logger.error(`Kuryer tugmasi xatosi (#${id}, ${act}):`, e.message);
      return ctx.answerCallbackQuery({ text: ctx.t('g_error'), show_alert: true });
    }
  });

  // --- Joylashuv (oddiy yoki jonli): ishdagi yoki faol buyurtmasi bor kuryer yozuvlariga (services/tracking.js) ---
  async function onLocation(ctx, msg, { live }) {
    if (ctx.chat?.type !== 'private' || !msg?.location) return;
    const n = services.tracking.saveCourierLocation(ctx.from.id, msg.location);
    if (n && !live) await ctx.reply(ctx.t('k_location_ok'));
  }
  bot.on('message:location', (ctx) => onLocation(ctx, ctx.message, { live: !!ctx.message.location.live_period }));
  bot.on('edited_message:location', (ctx) => onLocation(ctx, ctx.editedMessage, { live: true }));

  return { showCourier, shiftKeyboard };
}
