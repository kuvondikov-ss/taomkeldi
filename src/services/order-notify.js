// Buyurtma o'zgarganda: mijozga — faqat muhim bosqichlarda (har bosqich bir marta, dedupe),
// kuryerga — bitta jonli xabar (holatga qarab tahrirlanadi; kuryer almashsa eskisiga "boshqa kuryerga berildi").
import { now } from '../db/index.js';
import { classifyTelegramError } from './telegram-errors.js';

const TRANSIENT = ['rate_limited', 'network', 'server', 'other'];

export function createOrderNotifier(db, { users, templates, notify, logger = console }) {
  let api = null;
  const locks = new Map();
  const getO = (id) => db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  const getR = (id) => db.prepare('SELECT * FROM restaurants WHERE id = ?').get(id);
  const langOf = (uid) => { const u = users.get(uid); return u ? users.langOf(u) : 'uz'; };
  const opts = (msg) => ({ parse_mode: 'HTML', reply_markup: msg.reply_markup, link_preview_options: { is_disabled: true } });

  // ---------- Mijoz ----------
  async function customer(orderId) {
    const o = getO(orderId);
    const m = templates.customerMilestone(o);
    if (!m) return null;
    if (m === 'cancelled') {
      // Mijozning o'zi bekor qilgan bo'lsa — xabar shart emas (ilovada ko'rib turibdi).
      const ev = db.prepare("SELECT actor_role FROM order_events WHERE order_id = ? AND to_status = 'cancelled' ORDER BY id DESC LIMIT 1").get(o.id);
      if (ev?.actor_role === 'customer') return null;
    }
    const msg = templates.customerOrder(o, getR(o.restaurant_id), m, langOf(o.customer_id));
    if (!msg) return null;
    await notify.sendText(o.customer_id, msg.text, { dedupeKey: `cust:${o.id}:${m}`, reply_markup: msg.reply_markup });
    return m;
  }

  // ---------- Kuryer ----------
  async function editOrSend(row, chatId, msg, orderId) {
    if (row) {
      try {
        await api.editMessageText(chatId, row.message_id, msg.text, opts(msg));
        db.prepare('UPDATE order_messages SET updated_at = ? WHERE id = ?').run(now(), row.id);
        return;
      } catch (e) {
        const kind = classifyTelegramError(e);
        if (kind === 'not_modified') return;
        if (kind !== 'message_gone') throw e;
      }
    }
    const m = await api.sendMessage(chatId, msg.text, opts(msg));
    db.prepare(`INSERT INTO order_messages (order_id, kind, chat_id, message_id, created_at, updated_at) VALUES (?, 'courier_main', ?, ?, ?, ?)
      ON CONFLICT(order_id, kind, chat_id) DO UPDATE SET message_id = excluded.message_id, updated_at = excluded.updated_at`)
      .run(orderId, chatId, m.message_id, now(), now());
  }

  async function courier(orderId) {
    if (!api) return { sent: false, reason: 'no_bot' };
    const o = getO(orderId);
    if (!o || o.type !== 'delivery' || o.status === 'pending_payment') return { sent: false, reason: 'not_visible' };
    const r = getR(o.restaurant_id);
    const current = o.courier_id ? db.prepare('SELECT user_id FROM couriers WHERE id = ?').get(o.courier_id)?.user_id : null;
    const rows = db.prepare("SELECT * FROM order_messages WHERE order_id = ? AND kind = 'courier_main'").all(o.id);
    try {
      // Kuryer almashtirilgan yoki olib tashlangan: eski xabardagi tugmalar o'chiriladi.
      for (const row of rows.filter((x) => x.chat_id !== current)) {
        try {
          const msg = templates.courierOrder(o, r, langOf(row.chat_id), { active: false });
          await api.editMessageText(row.chat_id, row.message_id, msg.text, opts(msg));
        } catch (e) {
          if (TRANSIENT.includes(classifyTelegramError(e))) throw e;
        }
        db.prepare('DELETE FROM order_messages WHERE id = ?').run(row.id);
      }
      if (!current) return { sent: false, reason: 'no_courier' };
      const msg = templates.courierOrder(o, r, langOf(current));
      await editOrSend(rows.find((x) => x.chat_id === current), current, msg, o.id);
      return { sent: true };
    } catch (e) {
      const kind = classifyTelegramError(e);
      logger.error(`Kuryerga buyurtma #${o.id} xabari yuborilmadi (${kind}):`, e.description || e.message);
      if (kind === 'blocked') db.prepare('UPDATE users SET bot_blocked_at = ? WHERE id = ?').run(now(), current);
      if (TRANSIENT.includes(kind)) return { sent: false, reason: kind, retry: true, retryAfter: e.parameters?.retry_after ? e.parameters.retry_after * 1000 : undefined, error: e.description };
      return { sent: false, reason: kind };
    }
  }

  // Bir buyurtma bo'yicha ketma-ket: avval kuryer, keyin mijoz.
  function handle(orderId) {
    const prev = locks.get(orderId) || Promise.resolve();
    const next = prev.then(async () => {
      const c = await courier(orderId);
      await customer(orderId);
      return c;
    }).catch((e) => { logger.error('Buyurtma xabarlari xatosi:', e); return { sent: false, reason: 'error' }; });
    locks.set(orderId, next);
    next.finally(() => { if (locks.get(orderId) === next) locks.delete(orderId); });
    return next;
  }
  async function idle() { while (locks.size) await Promise.all([...locks.values()]); }

  return { setBotApi(a) { api = a; }, customer, courier, handle, idle };
}
