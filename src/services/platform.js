// Platforma boshqaruvi. Restoranni FAQAT platforma admini qo'shadi (restaurants.create) → egasiga bir martalik
// taklif havolasi (services/invites.js). Foydalanuvchi arizasi yopilgan (2026-11-26); bazada qolgan eski
// arizalar (status 'pending') admin tomonidan tasdiqlanadi yoki rad etiladi — qaror egasiga bot orqali yuboriladi.
// Moliya hisoboti (finance) — barcha restoranlar bo'yicha, faqat platforma admini uchun.
import { now, tx } from '../db/index.js';
import { AppError } from '../lib/errors.js';
import * as v from '../lib/validate.js';

const DAY_MS = 86400000;
const TZ_MS = 5 * 3600000; // Asia/Tashkent (UTC+5, yozgi vaqt yo'q)
const dayStartUtc = (ms) => Math.floor((ms + TZ_MS) / DAY_MS) * DAY_MS - TZ_MS;
const FINANCE_PERIODS = { today: 1, week: 7, month: 30 };

export function createPlatformService(db, { access, restaurants, geo, catalog, notify, users, outbox }) {
  const getR = (id) => db.prepare('SELECT * FROM restaurants WHERE id = ?').get(id);
  const logEvent = (rid, actorId, type, from, to, reason) => db.prepare(`
    INSERT INTO restaurant_events (restaurant_id, actor_id, type, from_status, to_status, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(rid, actorId, type, from, to, reason ?? null, now());

  // --- Qarorlar ---
  function changeStatus(actor, restaurantId, { from, to, type, reason, requireReason }) {
    access.requirePlatformAdmin(actor);
    const r = getR(v.id(restaurantId));
    if (!r) throw new AppError('NOT_FOUND');
    if (!from.includes(r.status)) throw new AppError('INVALID_TRANSITION', { details: { status: r.status } });
    const why = requireReason ? v.str(reason, 'reason', { min: 3, max: 300 }) : v.str(reason, 'reason', { optional: true, max: 300 });
    tx(db, () => {
      const res = db.prepare('UPDATE restaurants SET status = ?, status_reason = ?, updated_at = ? WHERE id = ? AND status = ?').run(to, why, now(), r.id, r.status);
      if (res.changes !== 1) throw new AppError('INVALID_TRANSITION');
      logEvent(r.id, actor.id, type, r.status, to, why);
    });
    return { before: r, after: getR(r.id), reason: why };
  }

  async function approve(actor, restaurantId) {
    const { after } = changeStatus(actor, restaurantId, { from: ['pending'], to: 'active', type: 'approved' });
    // Ariza beruvchi — egasi (egasi va menejer rollari aralashmaydi).
    if (after.applicant_id) restaurants.addStaff(after.id, after.applicant_id, 'owner', actor.id);
    if (after.applicant_id) await notify.send(after.applicant_id, 'app_approved', { name: after.name });
    return after;
  }

  async function reject(actor, restaurantId, reason) {
    const { after, reason: why } = changeStatus(actor, restaurantId, { from: ['pending'], to: 'rejected', type: 'rejected', reason, requireReason: true });
    if (after.applicant_id) await notify.send(after.applicant_id, 'app_rejected', { name: after.name, reason: why });
    return after;
  }

  const ownerIds = (rid) => db.prepare("SELECT user_id FROM staff WHERE restaurant_id = ? AND role = 'owner' AND status = 'active'").all(rid).map((x) => x.user_id);

  // Bloklangan restoran mijozlarga ko'rinmaydi va yangi buyurtma olmaydi (katalog/checkout faqat 'active').
  async function block(actor, restaurantId, reason) {
    const { after, reason: why } = changeStatus(actor, restaurantId, { from: ['active'], to: 'blocked', type: 'blocked', reason, requireReason: true });
    for (const uid of ownerIds(after.id)) await notify.send(uid, 'restaurant_blocked', { name: after.name, reason: why });
    return after;
  }

  async function unblock(actor, restaurantId) {
    const { after } = changeStatus(actor, restaurantId, { from: ['blocked'], to: 'active', type: 'unblocked' });
    for (const uid of ownerIds(after.id)) await notify.send(uid, 'restaurant_unblocked', { name: after.name });
    return after;
  }

  // --- Ro'yxat va ko'rsatkichlar ---
  function list(actor, { status } = {}) {
    access.requirePlatformAdmin(actor);
    if (status) v.oneOf(status, 'status', ['pending', 'active', 'blocked', 'rejected']);
    const rows = db.prepare(`
      SELECT r.id, r.name, r.phone, r.description, r.address_text, r.lat, r.lon, r.status, r.status_reason, r.is_open, r.is_demo,
             r.applicant_id, r.created_at, r.updated_at,
             u.first_name AS applicant_name, u.username AS applicant_username,
             (SELECT COUNT(*) FROM staff s WHERE s.restaurant_id = r.id AND s.role = 'owner' AND s.status = 'active') AS owners,
             (SELECT COUNT(*) FROM orders o WHERE o.restaurant_id = r.id) AS orders_count
      FROM restaurants r LEFT JOIN users u ON u.id = r.applicant_id
      ${status ? 'WHERE r.status = ?' : ''} ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END, r.id DESC LIMIT 500
    `).all(...(status ? [status] : []));
    const cuisines = db.prepare('SELECT c.name_uz FROM restaurant_cuisines rc JOIN cuisines c ON c.id = rc.cuisine_id WHERE rc.restaurant_id = ? ORDER BY c.sort');
    return rows.map((r) => ({ ...r, cuisines: cuisines.all(r.id).map((c) => c.name_uz) }));
  }

  function overview(actor, at = now()) {
    access.requirePlatformAdmin(actor);
    const counts = restaurants.statusCounts(actor);
    const today = db.prepare(`
      SELECT COUNT(*) AS orders,
             SUM(CASE WHEN status = 'delivered' THEN total ELSE 0 END) AS delivered_total,
             SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled,
             SUM(CASE WHEN status NOT IN ('delivered','cancelled') THEN 1 ELSE 0 END) AS in_progress
      FROM orders WHERE created_at >= ?
    `).get(dayStartUtc(at)); // Toshkent vaqti bo'yicha "bugun" (server UTC'da ishlaydi)
    return {
      restaurants: counts,
      today: { orders: today.orders, delivered_total: today.delivered_total || 0, cancelled: today.cancelled || 0, in_progress: today.in_progress || 0 },
      users: db.prepare('SELECT COUNT(*) AS n FROM users').get().n,
      couriers_online: db.prepare("SELECT COUNT(*) AS n FROM couriers WHERE status = 'active' AND is_online = 1").get().n,
      // Bot xabarlari navbati: kutilayotgan va yuborilmay qolgan xabarlar (Telegram ishlamasa ham buyurtmalar panelda).
      notifications: outbox ? outbox.stats() : null,
    };
  }

  // --- Moliya: barcha restoranlar bo'yicha pul harakati (faqat platforma admini) ---
  // Davr: bugun / 7 kun / 30 kun (Toshkent kuni bo'yicha, buyurtma yaratilgan vaqt). Tushum — yetkazilgan
  // buyurtmalar jami (yalpi, xarajatlarsiz): taomlar + yetkazish; naqd va oldindan to'langan (karta/onlayn) alohida.
  // "Tasdiq kutilmoqda" — mijoz "To'ladim" degan, restoran hali tasdiqlamagan o'tkazmalar; "Qaytarilgan" — refund.
  function finance(actor, { period = 'week' } = {}, at = now()) {
    access.requirePlatformAdmin(actor);
    const days = FINANCE_PERIODS[period];
    if (!days) throw new AppError('VALIDATION', { details: { field: 'period' } });
    const to = dayStartUtc(at) + DAY_MS;
    const from = to - days * DAY_MS;
    const rows = db.prepare(`
      SELECT r.id, r.name, r.status, r.is_demo,
        COUNT(o.id) AS orders,
        SUM(CASE WHEN o.status = 'delivered' THEN 1 ELSE 0 END) AS delivered,
        SUM(CASE WHEN o.status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled,
        SUM(CASE WHEN o.status NOT IN ('delivered','cancelled') THEN 1 ELSE 0 END) AS in_progress,
        COALESCE(SUM(CASE WHEN o.status = 'delivered' THEN o.total END), 0) AS revenue,
        COALESCE(SUM(CASE WHEN o.status = 'delivered' THEN o.items_total END), 0) AS items,
        COALESCE(SUM(CASE WHEN o.status = 'delivered' THEN o.delivery_fee END), 0) AS delivery_fees,
        COALESCE(SUM(CASE WHEN o.status = 'delivered' AND o.payment_method = 'cash' THEN o.total END), 0) AS cash,
        COALESCE(SUM(CASE WHEN o.status = 'delivered' AND o.payment_method <> 'cash' THEN o.total END), 0) AS prepaid,
        COALESCE(SUM(CASE WHEN o.payment_status = 'claimed' THEN o.total END), 0) AS awaiting_confirm,
        COALESCE(SUM(CASE WHEN o.payment_status = 'refunded' THEN o.total END), 0) AS refunded
      FROM restaurants r
      LEFT JOIN orders o ON o.restaurant_id = r.id AND o.created_at >= ? AND o.created_at < ?
      WHERE r.status IN ('active', 'blocked')
      GROUP BY r.id
      ORDER BY revenue DESC, orders DESC, r.id
    `).all(from, to).map((r) => ({
      ...r, is_demo: r.is_demo === 1, delivered: r.delivered || 0, cancelled: r.cancelled || 0, in_progress: r.in_progress || 0,
      average: r.delivered ? Math.round(r.revenue / r.delivered) : 0,
    }));
    const SUM = ['orders', 'delivered', 'cancelled', 'in_progress', 'revenue', 'items', 'delivery_fees', 'cash', 'prepaid', 'awaiting_confirm', 'refunded'];
    const totals = Object.fromEntries(SUM.map((k) => [k, rows.reduce((s, r) => s + (r[k] || 0), 0)]));
    totals.average = totals.delivered ? Math.round(totals.revenue / totals.delivered) : 0;
    const perDay = db.prepare(`
      SELECT COUNT(*) AS orders, COALESCE(SUM(CASE WHEN status = 'delivered' THEN total END), 0) AS revenue
      FROM orders WHERE created_at >= ? AND created_at < ?`);
    const series = [];
    for (let d = from; d < to; d += DAY_MS) {
      const x = perDay.get(d, d + DAY_MS);
      series.push({ date: new Date(d + TZ_MS).toISOString().slice(0, 10), orders: x.orders, revenue: x.revenue });
    }
    return { period, from, to, totals, restaurants: rows, days: series, revenue_note: 'gross_without_costs' };
  }

  // --- Tayyorlik ro'yxati (restoran egasining birinchi paneli) ---
  function readiness(actor, restaurantId) {
    const role = access.requireRestaurantStaff(actor, restaurantId);
    const r = getR(restaurantId);
    if (!r) throw new AppError('NOT_FOUND');
    const has = (sql, ...a) => !!db.prepare(sql).get(...a);
    const items = [
      { key: 'info', done: !!(r.name && r.phone && r.address_text) },
      { key: 'menu', done: has('SELECT 1 FROM products WHERE restaurant_id = ? AND is_deleted = 0 AND is_available = 1', r.id) },
      { key: 'work_hours', done: !!r.work_hours },
      { key: 'delivery', done: r.lat != null && r.lon != null && r.delivery_radius_m > 0 },
      { key: 'payment', done: !!(r.pay_cash || (r.pay_card_transfer && r.card_number && r.card_holder)) },
      { key: 'couriers', done: has("SELECT 1 FROM couriers WHERE restaurant_id = ? AND status = 'active' AND user_id IS NOT NULL", r.id) },
      { key: 'group', done: r.group_chat_id != null && (r.group_status || 'active') === 'active' },
    ];
    return {
      restaurant: { id: r.id, name: r.name, status: r.status, status_reason: r.status_reason, is_open: r.is_open === 1 },
      viewer_role: role,
      items,
      missing: items.filter((i) => !i.done).map((i) => i.key),
      ready: items.every((i) => i.done),
    };
  }

  // --- Demo ma'lumotni o'chirish: faqat is_demo = 1 restoranlar va ularga bog'liq yozuvlar ---
  function deleteDemo(actor, confirm) {
    access.requirePlatformAdmin(actor);
    if (confirm !== 'DEMO') throw new AppError('VALIDATION', { details: { field: 'confirm', reason: 'type_DEMO' } });
    return tx(db, () => {
      const ids = db.prepare('SELECT id FROM restaurants WHERE is_demo = 1').all().map((x) => x.id);
      if (!ids.length) return { restaurants: 0, orders: 0 };
      const inList = `(${ids.map(() => '?').join(',')})`;
      const orderIds = db.prepare(`SELECT id FROM orders WHERE restaurant_id IN ${inList}`).all(...ids).map((x) => x.id);
      if (orderIds.length) {
        const oList = `(${orderIds.map(() => '?').join(',')})`;
        for (const table of ['order_items', 'order_events', 'order_messages', 'payments']) db.prepare(`DELETE FROM ${table} WHERE order_id IN ${oList}`).run(...orderIds);
        db.prepare(`DELETE FROM orders WHERE id IN ${oList}`).run(...orderIds);
      }
      for (const table of ['products', 'menu_categories', 'restaurant_cuisines', 'favorites', 'invites', 'couriers', 'staff', 'restaurant_events']) {
        db.prepare(`DELETE FROM ${table} WHERE restaurant_id IN ${inList}`).run(...ids);
      }
      db.prepare(`DELETE FROM restaurants WHERE id IN ${inList}`).run(...ids);
      return { restaurants: ids.length, orders: orderIds.length };
    });
  }

  return { approve, reject, block, unblock, list, overview, finance, readiness, deleteDemo };
}
