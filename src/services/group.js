// Restoran xodimlari Telegram guruhi: ulash, asosiy buyurtma xabari (yuborish → tahrirlash → o'chirilgan bo'lsa qayta),
// bot chiqarilsa/huquqi bo'lmasa — holatni belgilash va xodimlarga shaxsiy xabar (zaxira yo'l).
// Vakolat: guruh a'zoligi yoki adminligi rol BERMAYDI — har amal uchun foydalanuvchi restoran xodimi (yoki platforma admini) bo'lishi shart.
import { now, tx } from '../db/index.js';
import { AppError } from '../lib/errors.js';
import * as v from '../lib/validate.js';
import { t, formatSum } from '../i18n/index.js';

const LANG = 'uz'; // guruh xabarlari tili
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const hhmm = (ms) => new Date(ms + 5 * 3600000).toISOString().slice(11, 16); // Toshkent vaqti (UTC+5)
const MAX_ITEMS = 25;
export const PANEL_PREFIX = 'o_';

// Telegram xatosini tasniflash.
export function classifyTelegramError(e) {
  const d = String(e?.description || e?.message || '').toLowerCase();
  const code = e?.error_code;
  if (e?.parameters?.migrate_to_chat_id) return 'migrated';
  if (d.includes('message is not modified')) return 'not_modified';
  if (d.includes('message to edit not found') || d.includes('message_id_invalid') || d.includes("message can't be edited")) return 'message_gone';
  if (d.includes('message thread not found') || d.includes('topic_deleted') || d.includes('topic_closed')) return 'thread_gone';
  if (d.includes('not enough rights') || d.includes('have no rights') || d.includes('need administrator rights') || d.includes('chat_write_forbidden')) return 'no_rights';
  if (code === 403 || d.includes('bot was kicked') || d.includes('bot is not a member') || d.includes('chat not found')) return 'removed';
  if (code === 429) return 'rate_limited';
  return 'other';
}

export function createGroupService(db, { access, notify, config, logger = console }) {
  let api = null;
  const locks = new Map(); // buyurtma bo'yicha navbat: ikki hodisa bir vaqtda kelsa ikkita xabar yuborilmaydi
  const getO = (id) => db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  const getR = (id) => db.prepare('SELECT * FROM restaurants WHERE id = ?').get(id);
  const staffIds = (rid) => db.prepare("SELECT user_id FROM staff WHERE restaurant_id = ? AND status = 'active' ORDER BY id").all(rid).map((x) => x.user_id);
  const botId = () => Number(String(config.botToken || '').split(':')[0]) || null;
  const visible = (o) => !!o && o.status !== 'pending_payment'; // to'lov kutilayotgan buyurtma restoranga hali ko'rinmaydi

  // ---------- Xabar matni va tugmalari ----------
  function render(o, r) {
    const items = db.prepare('SELECT name, qty, line_total FROM order_items WHERE order_id = ? ORDER BY id').all(o.id);
    const lines = items.slice(0, MAX_ITEMS).map((i) => `• ${esc(i.name)} × ${i.qty} — ${formatSum(i.line_total, LANG)}`);
    if (items.length > MAX_ITEMS) lines.push(`… +${items.length - MAX_ITEMS}`);
    const head = o.status === 'new' ? t(LANG, 'g_head_new', { id: o.id }) : t(LANG, 'g_head', { id: o.id, status: t(LANG, `status_${o.status}`) });
    let addr;
    if (o.type === 'pickup') addr = esc(t(LANG, 'g_pickup'));
    else {
      let d = {};
      try { d = JSON.parse(o.address_details || '{}') || {}; } catch { d = {}; }
      addr = [o.address_text, d.entrance && `${t(LANG, 'g_entrance')} ${d.entrance}`, d.floor && `${t(LANG, 'g_floor')} ${d.floor}`,
        d.apartment && `${t(LANG, 'g_apartment')} ${d.apartment}`, d.comment].filter(Boolean).map(esc).join(', ');
    }
    const courier = o.courier_id ? db.prepare('SELECT name FROM couriers WHERE id = ?').get(o.courier_id)?.name : null;
    const map = o.type === 'delivery' && o.address_lat != null ? ` <a href="https://maps.google.com/?q=${o.address_lat},${o.address_lon}">🗺</a>` : '';
    const text = [
      head,
      `${esc(r.name)} · ${hhmm(o.created_at)}`,
      '',
      ...lines,
      '',
      `${t(LANG, 'g_items')}: ${formatSum(o.items_total, LANG)}`,
      o.type === 'delivery' ? `${t(LANG, 'g_delivery')}: ${o.delivery_fee ? formatSum(o.delivery_fee, LANG) : t(LANG, 'g_free')}` : null,
      `${t(LANG, 'g_total')}: <b>${formatSum(o.total, LANG)}</b>`,
      `${t(LANG, 'g_payment')}: ${t(LANG, `pm_${o.payment_method}`)} · ${t(LANG, `ps_${o.payment_status}`)}`,
      '',
      `${t(LANG, 'g_customer')}: ${esc(o.customer_name || '—')}`,
      `${t(LANG, 'g_phone')}: ${esc(o.customer_phone || '—')}`,
      `${t(LANG, 'g_address')}: ${addr || '—'}${map}`,
      o.comment ? `${t(LANG, 'g_comment')}: ${esc(o.comment)}` : null,
      o.prep_minutes && o.status === 'accepted' ? t(LANG, 'g_prep', { n: o.prep_minutes }) : null,
      courier ? `🛵 ${esc(courier)}` : null,
      o.status === 'cancelled' && o.cancel_reason ? `${t(LANG, 'g_reason')}: ${esc(o.cancel_reason)}` : null,
    ].filter((x) => x !== null).join('\n');
    return { text: text.slice(0, 4000), reply_markup: keyboard(o) };
  }

  // Mini App'ni guruhda web_app tugmasi bilan ochib bo'lmaydi — shaxsiy chatga deep link.
  const panelUrl = (o) => (config.botUsername ? `https://t.me/${config.botUsername}?start=${PANEL_PREFIX}${o.id}` : null);

  function keyboard(o, mode = 'main') {
    const rows = [];
    const cb = (text, act) => ({ text, callback_data: `o:${o.id}:${act}` });
    const url = panelUrl(o);
    const panelBtn = url ? [{ text: t(LANG, 'g_btn_panel'), url }] : [];
    if (mode === 'reject') {
      rows.push([cb(t(LANG, 'g_rr1'), 'rr1')], [cb(t(LANG, 'g_rr2'), 'rr2')], [cb(t(LANG, 'g_rr3'), 'rr3')], [cb(t(LANG, 'g_btn_back'), 'bk')]);
      return { inline_keyboard: rows };
    }
    const awaitingTransfer = o.payment_method === 'card_transfer' && o.payment_status !== 'paid';
    if (o.status === 'new' && awaitingTransfer) {
      rows.push([cb(t(LANG, 'g_btn_pay_ok'), 'po')], [cb(t(LANG, 'g_btn_pay_no'), 'pn'), ...panelBtn]);
    } else if (o.status === 'new') {
      rows.push([15, 30, 45].map((n) => cb(t(LANG, 'g_btn_min', { n }), `a${n}`)));
      rows.push([cb(t(LANG, 'g_btn_reject'), 'rj'), ...panelBtn]);
    } else if (o.status === 'accepted') {
      rows.push([cb(t(LANG, 'g_btn_ready'), 'rd')], panelBtn);
    } else if (o.status === 'ready') {
      rows.push([o.type === 'pickup' ? cb(t(LANG, 'g_btn_handed'), 'dl') : cb(t(LANG, 'g_btn_on_way'), 'ow')], panelBtn);
    } else if (o.status === 'on_way') {
      rows.push([cb(t(LANG, 'g_btn_delivered'), 'dl')], panelBtn);
    } else {
      rows.push(panelBtn); // yakunlangan: amal tugmalari olib tashlanadi
    }
    return { inline_keyboard: rows.filter((x) => x.length) };
  }

  // ---------- Holat va zaxira yo'l ----------
  function setError(rid, error) {
    db.prepare('UPDATE restaurants SET group_error = ?, updated_at = ? WHERE id = ?').run(error ? String(error).slice(0, 200) : null, now(), rid);
  }

  // Guruh ishlamay qoldi: holat + xodimlarga bir martalik shaxsiy xabar.
  async function markGroup(r, status, error) {
    if (r.group_status === status) { setError(r.id, error); return; }
    db.prepare('UPDATE restaurants SET group_status = ?, group_error = ?, updated_at = ? WHERE id = ?').run(status, error ? String(error).slice(0, 200) : null, now(), r.id);
    if (status === 'removed' || status === 'no_rights') {
      for (const uid of staffIds(r.id)) await notify.send(uid, `group_${status}`, { name: r.name });
    }
  }

  const sendOpts = (msg) => ({ parse_mode: 'HTML', reply_markup: msg.reply_markup, link_preview_options: { is_disabled: true } });

  // Guruh ishlamasa — yangi buyurtma haqida xodimlarga shaxsiy xabar (har xodimga bir marta).
  async function staffFallback(o, r) {
    if (o.status !== 'new') return;
    const msg = render(o, r);
    for (const uid of staffIds(r.id)) {
      if (db.prepare("SELECT 1 FROM order_messages WHERE order_id = ? AND kind = 'staff_dm' AND chat_id = ?").get(o.id, uid)) continue;
      try {
        const m = await api.sendMessage(uid, msg.text, sendOpts(msg));
        db.prepare(`INSERT OR IGNORE INTO order_messages (order_id, kind, chat_id, message_id, created_at, updated_at) VALUES (?, 'staff_dm', ?, ?, ?, ?)`)
          .run(o.id, uid, m.message_id, now(), now());
      } catch (e) {
        logger.error(`Xodimga (${uid}) buyurtma #${o.id} xabari yuborilmadi:`, e.description || e.message);
      }
    }
  }

  // Ilgari zaxira yo'l bilan yuborilgan shaxsiy xabarlar ham joriy holatga keltiriladi.
  async function refreshStaffDms(o, r) {
    const rows = db.prepare("SELECT * FROM order_messages WHERE order_id = ? AND kind = 'staff_dm'").all(o.id);
    if (!rows.length) return;
    const msg = render(o, r);
    for (const row of rows) {
      try {
        await api.editMessageText(row.chat_id, row.message_id, msg.text, sendOpts(msg));
      } catch (e) {
        if (classifyTelegramError(e) !== 'not_modified') logger.error(`Shaxsiy xabar #${o.id} yangilanmadi:`, e.description || e.message);
      }
    }
  }

  // Guruh supergroup'ga aylanganda chat id o'zgaradi.
  function migrate(oldId, newId) {
    if (!oldId || !newId || oldId === newId) return 0;
    return tx(db, () => {
      const n = db.prepare('UPDATE restaurants SET group_chat_id = ?, updated_at = ? WHERE group_chat_id = ?').run(newId, now(), oldId).changes;
      db.prepare('UPDATE order_messages SET chat_id = ? WHERE chat_id = ?').run(newId, oldId);
      return n;
    });
  }

  // ---------- Asosiy xabarni sinxronlash ----------
  async function sendToGroup(o, r, msg, { attempt = 0 } = {}) {
    const row = db.prepare("SELECT * FROM order_messages WHERE order_id = ? AND kind = 'group_main' AND chat_id = ?").get(o.id, r.group_chat_id);
    const sendNew = async () => {
      const m = await api.sendMessage(r.group_chat_id, msg.text, { ...sendOpts(msg), ...(r.group_thread_id ? { message_thread_id: r.group_thread_id } : {}) });
      const t0 = now();
      db.prepare(`INSERT INTO order_messages (order_id, kind, chat_id, thread_id, message_id, created_at, updated_at) VALUES (?, 'group_main', ?, ?, ?, ?, ?)
        ON CONFLICT(order_id, kind, chat_id) DO UPDATE SET message_id = excluded.message_id, thread_id = excluded.thread_id, updated_at = excluded.updated_at`)
        .run(o.id, r.group_chat_id, r.group_thread_id, m.message_id, t0, t0);
      return { sent: true, created: true, message_id: m.message_id };
    };
    try {
      if (!row) return await sendNew();
      try {
        await api.editMessageText(r.group_chat_id, row.message_id, msg.text, sendOpts(msg));
        db.prepare('UPDATE order_messages SET updated_at = ? WHERE id = ?').run(now(), row.id);
        return { sent: true, edited: true, message_id: row.message_id };
      } catch (e) {
        const kind = classifyTelegramError(e);
        if (kind === 'not_modified') return { sent: true, edited: false, message_id: row.message_id };
        if (kind === 'message_gone') return await sendNew(); // o'chirilgan bo'lsa — nazoratli yangi nusxa (eski id almashtiriladi)
        throw e;
      }
    } catch (e) {
      const kind = classifyTelegramError(e);
      if (kind === 'migrated' && attempt < 2) {
        migrate(r.group_chat_id, e.parameters.migrate_to_chat_id);
        return sendToGroup(o, getR(r.id), msg, { attempt: attempt + 1 });
      }
      if (kind === 'thread_gone' && r.group_thread_id && attempt < 2) {
        // Mavzu o'chirilgan — umumiy chatga yuboramiz va panelda ko'rsatamiz.
        db.prepare('UPDATE restaurants SET group_thread_id = NULL WHERE id = ?').run(r.id);
        const res = await sendToGroup(o, getR(r.id), msg, { attempt: attempt + 1 });
        setError(r.id, 'topic_deleted');
        return res;
      }
      throw e;
    }
  }

  async function doSync(orderId) {
    if (!api) return { sent: false, reason: 'no_bot' };
    const o = getO(orderId);
    if (!visible(o)) return { sent: false, reason: 'not_visible' };
    let r = getR(o.restaurant_id);
    await refreshStaffDms(o, r);
    if (!r.group_chat_id || r.group_status !== 'active') {
      await staffFallback(o, r);
      return { sent: false, reason: 'no_group' };
    }
    try {
      const res = await sendToGroup(o, r, render(o, r));
      r = getR(r.id);
      if (r.group_error && r.group_error !== 'topic_deleted') setError(r.id, null);
      return res;
    } catch (e) {
      const kind = classifyTelegramError(e);
      logger.error(`Guruhga buyurtma #${o.id} xabari yuborilmadi (${kind}):`, e.description || e.message);
      r = getR(r.id);
      if (kind === 'removed' || kind === 'no_rights') await markGroup(r, kind, e.description || e.message);
      else setError(r.id, e.description || e.message);
      // Guruhga yetmagan yangi buyurtma yo'qolmasin.
      await staffFallback(o, getR(r.id));
      return { sent: false, reason: kind };
    }
  }

  function syncOrder(orderId) {
    const prev = locks.get(orderId) || Promise.resolve();
    const next = prev.then(() => doSync(orderId)).catch((e) => { logger.error('Guruh sinxronlash xatosi:', e); return { sent: false, reason: 'error' }; });
    locks.set(orderId, next);
    next.finally(() => { if (locks.get(orderId) === next) locks.delete(orderId); });
    return next;
  }

  // Testlar va to'xtatish uchun: navbatdagi barcha yuborishlar tugashini kutish.
  async function idle() {
    await new Promise((res) => setImmediate(res)); // hodisa (setImmediate) navbatga tushib ulgursin
    while (locks.size) await Promise.all([...locks.values()]);
  }

  // ---------- Ulash ----------
  function canManage(user, rid) {
    if (!user) return false;
    return !!access.staffRole(user, rid) || access.isPlatformAdmin(user);
  }

  // Guruh tugmasi / deep link: buyurtma faqat shu restoran xodimiga (yoki platforma adminiga) qaytadi.
  function orderForStaff(user, orderId) {
    const o = getO(orderId);
    if (!o || !visible(o) || !canManage(user, o.restaurant_id)) return null;
    return o;
  }

  // /bogla menyusi: foydalanuvchi ega yoki menejer bo'lgan, rad etilmagan restoranlar.
  function linkableRestaurants(user) {
    if (!user) return [];
    return access.rolesOf(user).staff
      .filter((s) => s.restaurantStatus !== 'rejected')
      .map((s) => ({ id: s.restaurantId, name: s.restaurantName, role: s.role }));
  }

  function link(user, rid, chat, threadId) {
    const id = v.id(rid);
    if (!canManage(user, id)) throw new AppError('FORBIDDEN');
    const r = getR(id);
    if (!r) throw new AppError('NOT_FOUND');
    if (!['group', 'supergroup'].includes(chat?.type)) throw new AppError('VALIDATION', { details: { field: 'chat' } });
    const old = r.group_chat_id && r.group_chat_id !== chat.id ? { id: r.group_chat_id, title: r.group_title, status: r.group_status } : null;
    const t0 = now();
    tx(db, () => {
      db.prepare(`UPDATE restaurants SET group_chat_id = ?, group_thread_id = ?, group_title = ?, group_status = 'active', group_error = NULL,
        group_linked_at = ?, group_linked_by = ?, updated_at = ? WHERE id = ?`).run(chat.id, threadId || null, chat.title || null, t0, user.id, t0, id);
      db.prepare(`INSERT INTO restaurant_events (restaurant_id, actor_id, type, reason, created_at) VALUES (?, ?, 'group_linked', ?, ?)`)
        .run(id, user.id, String(chat.id), t0);
    });
    return { restaurant: getR(id), old };
  }

  // Eski guruhga "bu restoran boshqa guruhga ko'chdi" xabari (yuborilmasa — muhim emas).
  async function noticeOldGroup(old, name) {
    if (!old || !api || old.status !== 'active') return;
    try { await api.sendMessage(old.id, t(LANG, 'group_moved_away', { name })); } catch { /* eski guruhda bot bo'lmasligi mumkin */ }
  }

  function status(user, rid) {
    const id = v.id(rid);
    access.requireRestaurantStaff(user, id);
    const r = getR(id);
    return {
      linked: !!r.group_chat_id, chat_id: r.group_chat_id, thread_id: r.group_thread_id, title: r.group_title,
      status: r.group_chat_id ? (r.group_status || 'active') : null, error: r.group_error, linked_at: r.group_linked_at,
      bot_username: config.botUsername || null,
    };
  }

  function unlink(user, rid) {
    const id = v.id(rid);
    access.requireRestaurantStaff(user, id);
    db.prepare(`UPDATE restaurants SET group_chat_id = NULL, group_thread_id = NULL, group_title = NULL, group_status = NULL, group_error = NULL,
      group_linked_at = NULL, group_linked_by = NULL, updated_at = ? WHERE id = ?`).run(now(), id);
    db.prepare(`INSERT INTO restaurant_events (restaurant_id, actor_id, type, created_at) VALUES (?, ?, 'group_unlinked', ?)`).run(id, user.id, now());
    return status(user, id);
  }

  // Panel: "Tekshirish" — bot guruhdami va yoza oladimi (guruhga xabar yubormaydi).
  async function check(user, rid, { attempt = 0 } = {}) {
    const id = v.id(rid);
    access.requireRestaurantStaff(user, id);
    const r = getR(id);
    if (!r.group_chat_id) throw new AppError('CONFLICT', { details: { reason: 'no_group' } });
    if (!api) throw new AppError('CONFLICT', { details: { reason: 'no_bot' } });
    try {
      const chat = await api.getChat(r.group_chat_id);
      const me = await api.getChatMember(r.group_chat_id, botId());
      const canSend = ['administrator', 'creator', 'member'].includes(me.status) || (me.status === 'restricted' && me.can_send_messages !== false);
      const next = ['left', 'kicked'].includes(me.status) ? 'removed' : canSend ? 'active' : 'no_rights';
      if (next === 'active') {
        db.prepare("UPDATE restaurants SET group_title = ?, group_status = 'active', group_error = NULL, updated_at = ? WHERE id = ?").run(chat.title || r.group_title, now(), id);
      } else {
        db.prepare('UPDATE restaurants SET group_title = ? WHERE id = ?').run(chat.title || r.group_title, id);
        await markGroup(getR(id), next, `bot ${me.status}`);
      }
    } catch (e) {
      const kind = classifyTelegramError(e);
      if (kind === 'migrated' && attempt < 2) {
        migrate(r.group_chat_id, e.parameters.migrate_to_chat_id);
        return check(user, id, { attempt: attempt + 1 });
      }
      if (kind === 'removed' || kind === 'no_rights') await markGroup(r, kind, e.description || e.message);
      else setError(id, e.description || e.message);
    }
    return status(user, id);
  }

  // Panel: "Sinov xabari" — faqat aniq bosilganda yuboriladi.
  async function sendTest(user, rid) {
    const id = v.id(rid);
    access.requireRestaurantStaff(user, id);
    const r = getR(id);
    if (!r.group_chat_id) throw new AppError('CONFLICT', { details: { reason: 'no_group' } });
    if (!api) throw new AppError('CONFLICT', { details: { reason: 'no_bot' } });
    const send = (row) => api.sendMessage(row.group_chat_id, t(LANG, 'group_test', { name: row.name }), row.group_thread_id ? { message_thread_id: row.group_thread_id } : {});
    try {
      try {
        await send(r);
      } catch (e) {
        if (classifyTelegramError(e) !== 'migrated') throw e;
        migrate(r.group_chat_id, e.parameters.migrate_to_chat_id);
        await send(getR(id));
      }
      db.prepare("UPDATE restaurants SET group_status = 'active', group_error = NULL, updated_at = ? WHERE id = ?").run(now(), id);
    } catch (e) {
      const kind = classifyTelegramError(e);
      if (kind === 'removed' || kind === 'no_rights') await markGroup(getR(id), kind, e.description || e.message);
      else setError(id, e.description || e.message);
      throw new AppError('CONFLICT', { details: { reason: `group_${kind}`, group: status(user, id) } });
    }
    return status(user, id);
  }

  // Botning guruhdagi holati o'zgarganda (my_chat_member).
  async function botMembershipChanged(chatId, member) {
    const rows = db.prepare('SELECT * FROM restaurants WHERE group_chat_id = ?').all(chatId);
    const st = member?.status;
    for (const r of rows) {
      if (st === 'left' || st === 'kicked') await markGroup(r, 'removed', `bot ${st}`);
      else if (st === 'restricted' && member.can_send_messages === false) await markGroup(r, 'no_rights', 'restricted');
      else if (['member', 'administrator', 'restricted'].includes(st) && r.group_status !== 'active') {
        db.prepare("UPDATE restaurants SET group_status = 'active', group_error = NULL, updated_at = ? WHERE id = ?").run(now(), r.id);
      }
    }
    return rows.length;
  }

  return {
    setBotApi(a) { api = a; },
    render, keyboard, syncOrder, idle, canManage, orderForStaff, linkableRestaurants, link, noticeOldGroup, unlink, status, check, sendTest,
    botMembershipChanged, migrate, isVisible: (id) => visible(getO(id)),
  };
}
