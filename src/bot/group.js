// Restoran guruhi: /bogla, buyurtma tugmalari, botning guruhdagi holati, supergroup migratsiyasi.
// Har tugma bosilganda vakolat SERVERDA qayta tekshiriladi: guruh a'zosi bo'lish hech qanday huquq bermaydi.
import { AppError } from '../lib/errors.js';
import { t } from '../i18n/index.js';
import { PANEL_PREFIX } from '../services/group.js';

const ANON_ADMIN_BOT = 1087968824; // @GroupAnonymousBot — anonim admin nomidan yozilgan xabar
const ORDER_ACTS = { a15: ['accepted', 15], a30: ['accepted', 30], a45: ['accepted', 45], rd: ['ready'], ow: ['on_way'], dl: ['delivered'] };

export function registerGroupHandlers(bot, { services, logger = console }) {
  const { group, orders, payments, restaurants } = services;
  const html = { parse_mode: 'HTML', link_preview_options: { is_disabled: true } };
  const isGroup = (ctx) => ['group', 'supergroup'].includes(ctx.chat?.type);
  const threadOf = (msg) => (msg?.is_topic_message ? msg.message_thread_id : null);

  async function memberStatus(ctx, userId) {
    try { return await ctx.api.getChatMember(ctx.chat.id, userId); } catch { return null; }
  }
  const isChatAdmin = (m) => m && (m.status === 'creator' || m.status === 'administrator');
  const botCanSend = (m) => !!m && (['creator', 'administrator', 'member'].includes(m.status) || (m.status === 'restricted' && m.can_send_messages !== false));
  const quietReply = async (ctx, text, extra) => {
    try { return await ctx.reply(text, extra); } catch (e) { logger.error('Guruhga javob yuborilmadi:', e.description || e.message); return null; }
  };

  // --- /bogla ---
  function confirmView(ctx, rid) {
    const r = restaurants.getRaw(rid);
    const topic = threadOf(ctx.msg) ? ctx.t('bogla_topic') : '';
    const moving = r.group_chat_id && r.group_chat_id !== ctx.chat.id && r.group_status === 'active';
    const text = moving
      ? ctx.t('bogla_confirm_move', { name: r.name, old: r.group_title || String(r.group_chat_id), topic })
      : ctx.t('bogla_confirm', { name: r.name, topic });
    // {topic} matnida HTML yo'q, lekin t() uni escape qiladi — ko'rinishi o'zgarmaydi.
    return { text, reply_markup: { inline_keyboard: [[{ text: ctx.t('btn_bogla_yes'), callback_data: `bgc:${r.id}` }, { text: ctx.t('btn_bogla_no'), callback_data: 'bgx' }]] } };
  }

  bot.command('bogla', async (ctx) => {
    if (ctx.chat?.type === 'private') return ctx.reply(ctx.t('bogla_private'));
    if (!isGroup(ctx)) return undefined;
    if (ctx.from?.id === ANON_ADMIN_BOT || ctx.message?.sender_chat) return quietReply(ctx, ctx.t('bogla_anonymous'));
    if (!ctx.user) return undefined;
    const list = group.linkableRestaurants(ctx.user);
    if (!list.length) return quietReply(ctx, ctx.t('bogla_not_staff'));
    if (!isChatAdmin(await memberStatus(ctx, ctx.from.id))) return quietReply(ctx, ctx.t('bogla_not_admin'));
    if (!botCanSend(await memberStatus(ctx, ctx.me.id))) return quietReply(ctx, ctx.t('bogla_bot_cant_send'));
    if (list.length === 1) {
      const v = confirmView(ctx, list[0].id);
      return quietReply(ctx, v.text, { ...html, reply_markup: v.reply_markup });
    }
    const rows = list.map((r) => [{ text: r.name, callback_data: `bg:${r.id}` }]);
    rows.push([{ text: ctx.t('btn_bogla_no'), callback_data: 'bgx' }]);
    return quietReply(ctx, ctx.t('bogla_choose'), { reply_markup: { inline_keyboard: rows } });
  });

  // Har bosqichda qayta tekshiruv: restoran xodimi (yoki platforma admini) va guruh administratori.
  async function allowedToLink(ctx, rid) {
    if (!ctx.user || !isGroup(ctx)) return false;
    if (!group.canManage(ctx.user, rid)) return false;
    return isChatAdmin(await memberStatus(ctx, ctx.from.id));
  }

  bot.callbackQuery(/^bg:(\d+)$/, async (ctx) => {
    const rid = Number(ctx.match[1]);
    if (!(await allowedToLink(ctx, rid))) return ctx.answerCallbackQuery({ text: ctx.t('bogla_not_admin'), show_alert: true });
    const v = confirmView(ctx, rid);
    await ctx.answerCallbackQuery();
    return ctx.editMessageText(v.text, { ...html, reply_markup: v.reply_markup });
  });

  bot.callbackQuery(/^bgc:(\d+)$/, async (ctx) => {
    const rid = Number(ctx.match[1]);
    if (!(await allowedToLink(ctx, rid))) return ctx.answerCallbackQuery({ text: ctx.t('bogla_not_admin'), show_alert: true });
    const { restaurant, old } = group.link(ctx.user, rid, ctx.chat, threadOf(ctx.msg));
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(ctx.t('bogla_done', { name: restaurant.name }), html);
    await group.noticeOldGroup(old, restaurant.name);
    logger.log(`Guruh ulandi: restoran ${rid} → chat ${ctx.chat.id}${restaurant.group_thread_id ? ` (mavzu ${restaurant.group_thread_id})` : ''}, ${ctx.user.id} tomonidan`);
    return undefined;
  });

  bot.callbackQuery('bgx', async (ctx) => {
    if (!ctx.user || !group.linkableRestaurants(ctx.user).length) return ctx.answerCallbackQuery({ text: ctx.t('bogla_not_staff'), show_alert: true });
    await ctx.answerCallbackQuery();
    return ctx.editMessageText(ctx.t('bogla_cancelled'));
  });

  // --- Buyurtma tugmalari: o:<id>:<amal> ---
  bot.callbackQuery(/^o:(\d+):(a15|a30|a45|rj|bk|rr[123]|po|pn|rd|ow|dl)$/, async (ctx) => {
    const id = Number(ctx.match[1]);
    const act = ctx.match[2];
    const o = group.orderForStaff(ctx.user, id);
    if (!o) return ctx.answerCallbackQuery({ text: ctx.t('g_not_staff'), show_alert: true });
    try {
      if (act === 'rj' || act === 'bk') {
        if (o.status !== 'new') throw new AppError('INVALID_TRANSITION');
        await ctx.answerCallbackQuery();
        return await ctx.editMessageReplyMarkup({ reply_markup: group.keyboard(o, act === 'rj' ? 'reject' : 'main') });
      }
      if (act.startsWith('rr')) orders.transition(ctx.user, id, 'cancelled', { reason: t('uz', `g_${act}`) });
      else if (act === 'po') payments.confirmTransfer(ctx.user, id);
      else if (act === 'pn') payments.rejectTransfer(ctx.user, id, t('uz', 'g_pay_not_received'));
      else {
        const [to, prepMinutes] = ORDER_ACTS[act];
        orders.transition(ctx.user, id, to, prepMinutes ? { prepMinutes } : {});
      }
      // Xabarning o'zi 'order' hodisasi orqali yangilanadi (guruh va zaxira shaxsiy xabarlar).
      return await ctx.answerCallbackQuery({ text: ctx.t('g_ok') });
    } catch (e) {
      if (e instanceof AppError && ['INVALID_TRANSITION', 'CONFLICT'].includes(e.code)) {
        await ctx.answerCallbackQuery({ text: ctx.t('g_stale'), show_alert: true });
        await group.syncOrder(id); // eskirgan tugmalarni joriy holat bilan almashtirish
        return undefined;
      }
      if (e instanceof AppError && ['FORBIDDEN', 'OWNER_ONLY', 'NOT_FOUND'].includes(e.code)) {
        return ctx.answerCallbackQuery({ text: ctx.t('g_not_staff'), show_alert: true });
      }
      logger.error(`Guruh tugmasi xatosi (#${id}, ${act}):`, e.description || e.message);
      return ctx.answerCallbackQuery({ text: ctx.t('g_error'), show_alert: true });
    }
  });

  // --- Botning guruhdagi holati ---
  bot.on('my_chat_member', async (ctx) => {
    if (!isGroup(ctx)) return;
    const { old_chat_member: before, new_chat_member: after } = ctx.myChatMember;
    await group.botMembershipChanged(ctx.chat.id, after);
    const wasOut = ['left', 'kicked'].includes(before.status);
    const isIn = ['member', 'administrator'].includes(after.status) || (after.status === 'restricted' && after.is_member && after.can_send_messages !== false);
    if (wasOut && isIn) await quietReply(ctx, ctx.t('group_start'));
  });

  // --- Guruh supergroup'ga aylandi: chat id o'zgaradi ---
  bot.on('message:migrate_to_chat_id', (ctx) => { group.migrate(ctx.chat.id, ctx.message.migrate_to_chat_id); });
  bot.on('message:migrate_from_chat_id', (ctx) => { group.migrate(ctx.message.migrate_from_chat_id, ctx.chat.id); });

  // --- Shaxsiy chat: /start o_<id> → buyurtma panelda ---
  async function openOrderFromLink(ctx, payload, replyWithApp) {
    const id = Number(payload.slice(PANEL_PREFIX.length));
    const o = Number.isInteger(id) && id > 0 ? group.orderForStaff(ctx.user, id) : null;
    if (!o) return ctx.reply(ctx.t('no_access'));
    const r = restaurants.getRaw(o.restaurant_id);
    return replyWithApp(ctx, ctx.t('order_panel_open', { id: o.id, restaurant: r.name }), `panel/${o.restaurant_id}/orders`);
  }

  return { openOrderFromLink, isPanelLink: (p) => typeof p === 'string' && p.startsWith(PANEL_PREFIX) };
}
