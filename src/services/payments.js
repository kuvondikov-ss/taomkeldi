// To'lovlar: naqd, kartaga o'tkazma, onlayn (Telegram Payments).
//
// Kartaga o'tkazma:
//   pending_payment (karta va summa ko'rsatiladi) → mijoz "To'ladim" → payment_status=claimed, status=new (restoranga boradi)
//   → vakolatli xodim haqiqiy tushumni ko'rib "To'lov keldi" → paid → shundan keyingina "qabul qilish" mumkin.
//   Pul kelmagan bo'lsa — sabab bilan rad etiladi (bekor). 30 daqiqada "To'ladim" bosilmasa — tizim bekor qiladi.
// Onlayn: faqat PAYMENT_PROVIDER_TOKEN bo'lsa. "paid" faqat Telegram'ning successful_payment xabaridan,
//   summa/valyuta/payload tekshirilib; bir xil to'lov (charge id) ikki marta hisoblanmaydi.
// Qaytarish: "refund_requested" (so'raldi) va "refunded" (haqiqatan qaytarildi) — alohida holatlar.
import crypto from 'node:crypto';
import { now, tx } from '../db/index.js';
import { AppError } from '../lib/errors.js';
import * as v from '../lib/validate.js';
import { openNow } from './catalog.js';

// Telegram valyuta jadvalida UZS uchun exp = 2 (summa tiyinda yuboriladi).
const MINOR = { UZS: 100 };

export function createPaymentService(db, config, { access, orders }) {
  let botApi = null;
  const getOrder = (id) => db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  const event = (orderId, actorId, role, type, data) => db.prepare(`
    INSERT INTO order_events (order_id, actor_id, actor_role, type, data, created_at) VALUES (?, ?, ?, ?, ?, ?)
  `).run(orderId, actorId, role, type, data ? JSON.stringify(data) : null, now());

  function setBotApi(api) { botApi = api; }
  const onlineAvailable = () => !!config.payments.providerToken && !!botApi;
  const minor = (sum) => sum * (MINOR[config.payments.currency] ?? 100);

  // --- Kartaga o'tkazma ---

  // Mijoz: "To'ladim". Takror bosish xato emas — holat o'zgarmaydi.
  function claimTransfer(actor, orderId) {
    return tx(db, () => {
      const o = getOrder(v.id(orderId));
      const role = access.orderViewRole(actor, o);
      if (!role) throw new AppError('NOT_FOUND');
      if (role !== 'customer') throw new AppError('FORBIDDEN');
      if (o.payment_method !== 'card_transfer') throw new AppError('CONFLICT', { details: { reason: 'not_card_transfer' } });
      if (o.payment_status === 'claimed' || o.payment_status === 'paid') return { already: true };
      if (o.status !== 'pending_payment' || o.payment_status !== 'unpaid') {
        throw new AppError('INVALID_TRANSITION', { details: { status: o.status, reason: o.status === 'cancelled' ? 'expired_or_cancelled' : undefined } });
      }
      const t = now();
      const res = db.prepare(`UPDATE orders SET status = 'new', payment_status = 'claimed', payment_claimed_at = ?, updated_at = ?
        WHERE id = ? AND status = 'pending_payment' AND payment_status = 'unpaid'`).run(t, t, o.id);
      if (res.changes !== 1) throw new AppError('INVALID_TRANSITION');
      db.prepare(`INSERT INTO order_events (order_id, actor_id, actor_role, type, from_status, to_status, data, created_at)
        VALUES (?, ?, 'customer', 'status', 'pending_payment', 'new', ?, ?)`).run(o.id, actor.id, JSON.stringify({ payment_status: 'claimed' }), t);
      event(o.id, actor.id, 'customer', 'payment_claimed', { amount: o.total });
      return { already: false };
    });
  }

  function requireStaffForOrder(actor, o, { ownerOrAdminOnly = false } = {}) {
    const role = access.orderViewRole(actor, o);
    if (!role) throw new AppError('NOT_FOUND');
    if (ownerOrAdminOnly) {
      if (role !== 'owner' && role !== 'admin') throw new AppError(role === 'manager' ? 'OWNER_ONLY' : 'FORBIDDEN');
    } else if (!['owner', 'manager', 'admin'].includes(role)) {
      throw new AppError('FORBIDDEN');
    }
    return role;
  }

  // Xodim: haqiqiy tushum tekshirildi — "To'lov keldi".
  function confirmTransfer(actor, orderId) {
    return tx(db, () => {
      const o = getOrder(v.id(orderId));
      const role = requireStaffForOrder(actor, o);
      if (o.payment_method !== 'card_transfer') throw new AppError('CONFLICT', { details: { reason: 'not_card_transfer' } });
      if (o.payment_status === 'paid') return { already: true };
      if (!['claimed', 'unpaid'].includes(o.payment_status) || !['pending_payment', 'new'].includes(o.status)) {
        throw new AppError('INVALID_TRANSITION', { details: { status: o.status, payment_status: o.payment_status } });
      }
      const t = now();
      const res = db.prepare(`UPDATE orders SET payment_status = 'paid', paid_at = ?, status = 'new', updated_at = ?
        WHERE id = ? AND payment_status = ? AND status = ?`).run(t, t, o.id, o.payment_status, o.status);
      if (res.changes !== 1) throw new AppError('INVALID_TRANSITION');
      event(o.id, actor.id, role === 'admin' ? 'admin' : 'staff', 'payment_confirmed', { amount: o.total });
      return { already: false };
    });
  }

  // Xodim: pul kelmadi — sabab bilan rad etish (buyurtma bekor, to'lov "to'lanmagan").
  function rejectTransfer(actor, orderId, reason) {
    const o = getOrder(v.id(orderId));
    requireStaffForOrder(actor, o);
    if (o.payment_method !== 'card_transfer' || o.payment_status === 'paid') throw new AppError('CONFLICT', { details: { reason: 'cannot_reject' } });
    const r = v.str(reason, 'reason', { max: 300 });
    orders.transition(actor, o.id, 'cancelled', { reason: r, paymentStatus: 'unpaid' });
  }

  // Ega yoki platforma admini: pul haqiqatan qaytarildi.
  function markRefunded(actor, orderId) {
    const o = getOrder(v.id(orderId));
    const role = requireStaffForOrder(actor, o, { ownerOrAdminOnly: true });
    if (o.payment_status !== 'refund_requested') throw new AppError('INVALID_TRANSITION', { details: { payment_status: o.payment_status } });
    const t = now();
    db.prepare("UPDATE orders SET payment_status = 'refunded', refunded_at = ?, updated_at = ? WHERE id = ? AND payment_status = 'refund_requested'").run(t, t, o.id);
    event(o.id, actor.id, role === 'admin' ? 'admin' : 'staff', 'refunded', { amount: o.total });
  }

  // Muddati o'tgan to'lovlar: "To'ladim" bosilmagan karta o'tkazmasi va to'lanmagan onlayn buyurtmalar bekor qilinadi.
  function expirePending(at = now()) {
    const limit = at - config.payments.pendingTimeoutMin * 60000;
    const rows = db.prepare(`SELECT id FROM orders WHERE status = 'pending_payment' AND payment_status = 'unpaid' AND created_at < ?`).all(limit);
    let n = 0;
    for (const { id } of rows) {
      try {
        orders.transition('system', id, 'cancelled', { reason: 'payment_timeout' });
        n++;
      } catch { /* boshqa jarayon allaqachon o'zgartirgan */ }
    }
    return n;
  }

  // --- Onlayn to'lov (Telegram Payments) ---

  async function createInvoice(actor, orderId) {
    const o = getOrder(v.id(orderId));
    const role = access.orderViewRole(actor, o);
    if (!role) throw new AppError('NOT_FOUND');
    if (role !== 'customer') throw new AppError('FORBIDDEN');
    if (o.payment_method !== 'online') throw new AppError('CONFLICT', { details: { reason: 'not_online' } });
    if (o.status !== 'pending_payment' || o.payment_status !== 'unpaid') throw new AppError('INVALID_TRANSITION', { details: { status: o.status } });
    if (!onlineAvailable()) throw new AppError('PAYMENT_UNAVAILABLE');
    const nonce = crypto.randomBytes(9).toString('base64url');
    db.prepare('UPDATE orders SET invoice_nonce = ?, updated_at = ? WHERE id = ?').run(nonce, now(), o.id);
    const r = db.prepare('SELECT name FROM restaurants WHERE id = ?').get(o.restaurant_id);
    let link;
    try {
      link = await botApi.createInvoiceLink(
        `Taomkeldi #${o.id}`,
        `${r.name}`.slice(0, 255),
        `o:${o.id}:${nonce}`,
        config.payments.providerToken,
        config.payments.currency,
        [{ label: `Buyurtma #${o.id}`, amount: minor(o.total) }],
      );
    } catch {
      throw new AppError('PAYMENT_UNAVAILABLE');
    }
    return { link };
  }

  function parsePayload(payload) {
    const m = /^o:(\d+):([A-Za-z0-9_-]{8,32})$/.exec(String(payload || ''));
    return m ? { orderId: Number(m[1]), nonce: m[2] } : null;
  }

  // pre_checkout_query: to'lovdan oldin oxirgi tekshiruv. { ok, error } qaytaradi.
  function validatePreCheckout(q) {
    const p = parsePayload(q.invoice_payload);
    const o = p && getOrder(p.orderId);
    if (!o || o.invoice_nonce !== p.nonce || o.customer_id !== q.from?.id) return { ok: false, error: 'Buyurtma topilmadi.' };
    if (o.status !== 'pending_payment' || o.payment_status !== 'unpaid') return { ok: false, error: 'Buyurtma holati o‘zgargan. Ilovani yangilang.' };
    if (q.currency !== config.payments.currency || q.total_amount !== minor(o.total)) return { ok: false, error: 'Summa mos kelmadi. Ilovani yangilang.' };
    const r = db.prepare('SELECT is_open, status, work_hours FROM restaurants WHERE id = ?').get(o.restaurant_id);
    if (!r || r.status !== 'active' || !openNow(r)) return { ok: false, error: 'Restoran hozir buyurtma qabul qilmayapti.' };
    return { ok: true };
  }

  // successful_payment: yagona ishonchli "to'landi" manbai.
  // Natija: applied | duplicate | late_refund_requested | mismatch
  function applySuccessfulPayment(sp, fromUserId) {
    return tx(db, () => {
      const p = parsePayload(sp.invoice_payload);
      const o = p && getOrder(p.orderId);
      const t = now();
      let outcome;
      if (!o || o.invoice_nonce !== p.nonce || o.customer_id !== fromUserId
        || sp.currency !== config.payments.currency || sp.total_amount !== minor(o.total)) {
        outcome = 'mismatch';
      } else if (o.status === 'pending_payment' && o.payment_status === 'unpaid') {
        outcome = 'applied';
      } else {
        outcome = 'late_refund_requested'; // masalan, muddat o'tib bekor qilingan buyurtmaga kech to'lov
      }
      // Buyurtmasi topilmagan to'lov bazaga bog'lanmaydi — faqat adminlarga xabar (bot handlerida).
      if (!o) return { outcome, orderId: null };
      const ins = db.prepare(`INSERT OR IGNORE INTO payments (order_id, provider, telegram_payment_charge_id, provider_payment_charge_id, amount, currency, outcome, created_at)
        VALUES (?, 'telegram', ?, ?, ?, ?, ?, ?)`).run(o.id, sp.telegram_payment_charge_id, sp.provider_payment_charge_id ?? null, sp.total_amount, sp.currency, outcome, t);
      if (ins.changes === 0) return { outcome: 'duplicate', orderId: o.id };
      if (outcome === 'mismatch') {
        // Summa/valyuta/egasi mos emas — buyurtma holatiga tegmaymiz, faqat qayd qilamiz.
        event(o.id, null, 'system', 'payment_mismatch', { amount: sp.total_amount, currency: sp.currency, charge: sp.telegram_payment_charge_id });
        return { outcome, orderId: o.id };
      }
      if (outcome === 'applied') {
        db.prepare(`UPDATE orders SET status = 'new', payment_status = 'paid', paid_at = ?, updated_at = ? WHERE id = ?`).run(t, t, o.id);
        db.prepare(`INSERT INTO order_events (order_id, actor_role, type, from_status, to_status, data, created_at)
          VALUES (?, 'system', 'status', 'pending_payment', 'new', ?, ?)`).run(o.id, JSON.stringify({ payment_status: 'paid' }), t);
        event(o.id, null, 'system', 'payment_online', { amount: o.total, charge: sp.telegram_payment_charge_id });
      } else {
        // Pul keldi, lekin buyurtma uni qabul qila olmaydi — qaytarish so'raladi (avtomatik qaytarilmaydi).
        db.prepare(`UPDATE orders SET payment_status = 'refund_requested', paid_at = ?, updated_at = ? WHERE id = ?`).run(t, t, o.id);
        event(o.id, null, 'system', `payment_${outcome}`, { amount: sp.total_amount, charge: sp.telegram_payment_charge_id });
      }
      return { outcome, orderId: o.id };
    });
  }

  return {
    setBotApi, onlineAvailable, claimTransfer, confirmTransfer, rejectTransfer, markRefunded, expirePending,
    createInvoice, validatePreCheckout, applySuccessfulPayment, parsePayload, minor,
  };
}
