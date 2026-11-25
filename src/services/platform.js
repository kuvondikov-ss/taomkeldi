// Platforma boshqaruvi va restoranlarni ulash.
//  A) Restoran egasi ariza yuboradi (nom, telefon, tavsif, Jizzaxdagi nuqta, oshxona turlari) → admin ko'rib chiqadi.
//  B) Admin restoran yaratadi → egasiga bir martalik taklif havolasi (services/invites.js).
// Qaror va sabab egasiga bot orqali yuboriladi.
import { now, tx } from '../db/index.js';
import { AppError } from '../lib/errors.js';
import * as v from '../lib/validate.js';

export function createPlatformService(db, { access, restaurants, geo, catalog, notify, users }) {
  const getR = (id) => db.prepare('SELECT * FROM restaurants WHERE id = ?').get(id);
  const logEvent = (rid, actorId, type, from, to, reason) => db.prepare(`
    INSERT INTO restaurant_events (restaurant_id, actor_id, type, from_status, to_status, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(rid, actorId, type, from, to, reason ?? null, now());

  // --- A) Ariza (Mini App to'liq shakli) ---
  function apply(actor, data) {
    const name = v.str(data.name, 'name', { min: 2, max: 120 });
    const phone = v.phoneUz(data.phone, 'phone');
    const description = v.str(data.description, 'description', { optional: true, max: 1000 });
    const addressText = v.str(data.address_text, 'address_text', { optional: true, max: 300 });
    const { lat, lon } = geo.requireServiceArea(data.lat, data.lon); // nuqta Jizzax viloyati ichida
    const cuisineIds = Array.isArray(data.cuisine_ids) ? [...new Set(data.cuisine_ids.map((x) => v.id(x, 'cuisine_ids')))] : [];
    if (cuisineIds.length > 5) throw new AppError('VALIDATION', { details: { field: 'cuisine_ids' } });
    if (cuisineIds.length) {
      const known = db.prepare(`SELECT COUNT(*) AS n FROM cuisines WHERE id IN (${cuisineIds.map(() => '?').join(',')})`).get(...cuisineIds).n;
      if (known !== cuisineIds.length) throw new AppError('VALIDATION', { details: { field: 'cuisine_ids' } });
    }
    return tx(db, () => {
      const pending = db.prepare("SELECT id FROM restaurants WHERE applicant_id = ? AND status = 'pending'").get(actor.id);
      if (pending) throw new AppError('CONFLICT', { details: { reason: 'application_exists', restaurant_id: pending.id } });
      const t = now();
      const res = db.prepare(`
        INSERT INTO restaurants (name, phone, description, address_text, lat, lon, status, applicant_id, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)
      `).run(name, phone, description, addressText, lat, lon, actor.id, actor.id, t, t);
      const id = Number(res.lastInsertRowid);
      const ins = db.prepare('INSERT INTO restaurant_cuisines (restaurant_id, cuisine_id) VALUES (?, ?)');
      for (const c of cuisineIds) ins.run(id, c);
      logEvent(id, actor.id, 'applied', null, 'pending');
      return getR(id);
    });
  }

  function myApplications(actor) {
    return db.prepare(`SELECT id, name, status, status_reason, created_at, updated_at FROM restaurants WHERE applicant_id = ? ORDER BY id DESC`).all(actor.id);
  }

  // Admin uchun bildirishnoma: ariza (bot yoki Mini App orqali) kelganda.
  async function notifyAdminsAboutApplication(r) {
    for (const id of access.platformAdminIds()) await notify.send(id, 'apply_admin', { id: r.id, name: r.name, phone: r.phone, user: r.applicant_id });
  }

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
    const dayStart = new Date(at);
    dayStart.setHours(0, 0, 0, 0);
    const today = db.prepare(`
      SELECT COUNT(*) AS orders,
             SUM(CASE WHEN status = 'delivered' THEN total ELSE 0 END) AS delivered_total,
             SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled,
             SUM(CASE WHEN status NOT IN ('delivered','cancelled') THEN 1 ELSE 0 END) AS in_progress
      FROM orders WHERE created_at >= ?
    `).get(dayStart.getTime());
    return {
      restaurants: counts,
      today: { orders: today.orders, delivered_total: today.delivered_total || 0, cancelled: today.cancelled || 0, in_progress: today.in_progress || 0 },
      users: db.prepare('SELECT COUNT(*) AS n FROM users').get().n,
      couriers_online: db.prepare("SELECT COUNT(*) AS n FROM couriers WHERE status = 'active' AND is_online = 1").get().n,
    };
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

  return { apply, myApplications, notifyAdminsAboutApplication, approve, reject, block, unblock, list, overview, readiness, deleteDemo };
}
