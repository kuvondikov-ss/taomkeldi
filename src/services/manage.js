// Restoran paneli (ega va menejer): buyurtmalar, menyu, kuryerlar, xodimlar, sozlamalar, hisobot.
// Vakolatlar (serverda):
//   ega + menejer: buyurtmalar, kuryer biriktirish, menyu, kuryerlar, ochiq/pauza, ish vaqti, avtomatik dispetcher, hisobot
//   faqat ega:     restoran ma'lumoti/logo/cover, yetkazish narxi va hudud, minimal summa, bepul yetkazish, olib ketish,
//                  to'lov usullari va karta, xodimlar (menejerni taklif/olib tashlash)
import { now, tx } from '../db/index.js';
import { AppError } from '../lib/errors.js';
import * as v from '../lib/validate.js';
import { locationState } from '../../public/js/shared/tracking.js';
import { validHoursInput } from '../../public/js/shared/hours.js';

const TZ_MS = 5 * 3600000; // Asia/Tashkent
const dayStartUtc = (ms) => Math.floor((ms + TZ_MS) / 86400000) * 86400000 - TZ_MS;

export const ORDER_GROUPS = {
  new: ['pending_payment', 'new'],
  preparing: ['accepted'],
  ready: ['ready'],
  on_way: ['on_way'],
  done: ['delivered', 'cancelled'],
};

import { COOK_STYLES } from './options.js';

export function createManageService(db, { access, geo, options }) {
  const getR = (id) => db.prepare('SELECT * FROM restaurants WHERE id = ?').get(id);
  const staff = (actor, rid, opts) => {
    if (!getR(rid)) { if (!access.isPlatformAdmin(actor)) throw new AppError('FORBIDDEN'); throw new AppError('NOT_FOUND'); }
    return access.requireRestaurantStaff(actor, rid, opts);
  };
  const ownerOrAdmin = (actor, rid) => {
    const role = staff(actor, rid);
    if (role === 'manager') throw new AppError('OWNER_ONLY');
    return role;
  };

  // ---------------- Buyurtmalar ----------------
  function orders(actor, rid, group = 'new') {
    staff(actor, rid);
    const statuses = ORDER_GROUPS[v.oneOf(group, 'group', Object.keys(ORDER_GROUPS))];
    const limit = group === 'done' ? 100 : 300;
    const rows = db.prepare(`
      SELECT o.id, o.status, o.type, o.payment_method, o.payment_status, o.items_total, o.delivery_fee, o.total,
             o.customer_name, o.customer_phone, o.address_text, o.comment, o.prep_minutes, o.courier_id, o.cancel_reason,
             o.created_at, o.updated_at, o.dispatch_status, c.name AS courier_name
      FROM orders o LEFT JOIN couriers c ON c.id = o.courier_id
      WHERE o.restaurant_id = ? AND o.status IN (${statuses.map(() => '?').join(',')})
      ORDER BY ${group === 'done' ? 'o.updated_at DESC' : 'o.created_at ASC'} LIMIT ${limit}
    `).all(rid, ...statuses);
    const items = db.prepare('SELECT name, qty FROM order_items WHERE order_id = ? ORDER BY id');
    const counts = {};
    for (const [g, st] of Object.entries(ORDER_GROUPS)) {
      counts[g] = g === 'done' ? null : db.prepare(`SELECT COUNT(*) AS n FROM orders WHERE restaurant_id = ? AND status IN (${st.map(() => '?').join(',')})`).get(rid, ...st).n;
    }
    // Dispetcher holati: ishdagi kuryerlar va kuryersiz qolgan yetkazish buyurtmalari (panel ogohlantirishi).
    const dispatch = {
      couriers_online: db.prepare("SELECT COUNT(*) AS n FROM couriers WHERE restaurant_id = ? AND status = 'active' AND user_id IS NOT NULL AND is_online = 1").get(rid).n,
      couriers_linked: db.prepare("SELECT COUNT(*) AS n FROM couriers WHERE restaurant_id = ? AND status = 'active' AND user_id IS NOT NULL").get(rid).n,
      unassigned: db.prepare("SELECT COUNT(*) AS n FROM orders WHERE restaurant_id = ? AND type = 'delivery' AND courier_id IS NULL AND status IN ('new','accepted','ready')").get(rid).n,
    };
    return { orders: rows.map((o) => ({ ...o, items: items.all(o.id).map((i) => ({ ...i })) })), counts, dispatch };
  }

  // O'z kuryerini biriktirish/almashtirish (yetkazish, yo'lga chiqmagan buyurtma).
  function assignCourier(actor, orderId, courierId) {
    return tx(db, () => {
      const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(v.id(orderId));
      if (!o) throw new AppError('NOT_FOUND');
      const role = access.orderViewRole(actor, o);
      if (!['owner', 'manager', 'admin'].includes(role)) throw new AppError(role ? 'FORBIDDEN' : 'NOT_FOUND');
      if (o.type !== 'delivery') throw new AppError('CONFLICT', { details: { reason: 'pickup_has_no_courier' } });
      if (!['new', 'accepted', 'ready'].includes(o.status)) throw new AppError('INVALID_TRANSITION', { details: { status: o.status } });
      let cid = null;
      if (courierId != null) {
        cid = v.id(courierId, 'courier_id');
        const c = db.prepare("SELECT id FROM couriers WHERE id = ? AND restaurant_id = ? AND status = 'active' AND user_id IS NOT NULL").get(cid, o.restaurant_id);
        if (!c) throw new AppError('VALIDATION', { details: { field: 'courier_id', reason: 'not_this_restaurant_or_not_linked' } });
      }
      const t = now();
      // Qo'lda biriktirish dispetcher takliflarini yopadi; olib tashlash (null) — dispetcher qayta taklif qiladi.
      const res = db.prepare('UPDATE orders SET courier_id = ?, dispatch_status = ?, updated_at = ? WHERE id = ? AND status = ?').run(cid, cid ? 'assigned' : null, t, o.id, o.status);
      if (res.changes !== 1) throw new AppError('INVALID_TRANSITION');
      db.prepare(`INSERT INTO order_events (order_id, actor_id, actor_role, type, data, created_at) VALUES (?, ?, 'staff', 'courier_assigned', ?, ?)`)
        .run(o.id, actor.id, JSON.stringify({ from: o.courier_id, to: cid }), t);
    });
  }

  // ---------------- Menyu ----------------
  const imagePath = (rid, p) => {
    if (p == null || p === '') return null;
    if (typeof p !== 'string' || !new RegExp(`^/uploads/restaurants/${rid}/[0-9a-f-]{36}\\.(jpg|png|webp)$`).test(p)) {
      throw new AppError('VALIDATION', { details: { field: 'image_path' } });
    }
    return p;
  };

  function menu(actor, rid) {
    staff(actor, rid);
    return {
      categories: db.prepare('SELECT id, name_uz, name_ru, sort, is_active FROM menu_categories WHERE restaurant_id = ? ORDER BY sort, id').all(rid).map((c) => ({ ...c })),
      products: db.prepare(`SELECT id, category_id, name_uz, name_ru, description_uz, description_ru, portion, price, old_price, image_path, is_available, is_popular, sort,
          cook_style, prep_seconds
        FROM products WHERE restaurant_id = ? AND is_deleted = 0 ORDER BY sort, id`).all(rid).map((p) => ({ ...p, ingredients: options.ingredientsOf(p.id).map(({ product_id, sort, ...i }) => i) })),
    };
  }

  function saveCategory(actor, rid, data, categoryId = null) {
    staff(actor, rid);
    const nameUz = v.str(data.name_uz, 'name_uz', { max: 60 });
    const nameRu = v.str(data.name_ru, 'name_ru', { optional: true, max: 60 });
    const active = data.is_active === undefined ? 1 : (data.is_active ? 1 : 0);
    const t = now();
    if (categoryId) {
      const res = db.prepare('UPDATE menu_categories SET name_uz = ?, name_ru = ?, is_active = ?, updated_at = ? WHERE id = ? AND restaurant_id = ?')
        .run(nameUz, nameRu, active, t, v.id(categoryId), rid);
      if (res.changes !== 1) throw new AppError('NOT_FOUND');
      return v.id(categoryId);
    }
    const sort = (db.prepare('SELECT MAX(sort) AS m FROM menu_categories WHERE restaurant_id = ?').get(rid).m ?? 0) + 10;
    return Number(db.prepare('INSERT INTO menu_categories (restaurant_id, name_uz, name_ru, sort, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(rid, nameUz, nameRu, sort, active, t, t).lastInsertRowid);
  }

  // Kategoriya o'chirilsa, taomlar o'chmaydi — "Boshqa" bo'limiga o'tadi.
  function deleteCategory(actor, rid, categoryId) {
    staff(actor, rid);
    tx(db, () => {
      const cid = v.id(categoryId);
      if (!db.prepare('SELECT 1 FROM menu_categories WHERE id = ? AND restaurant_id = ?').get(cid, rid)) throw new AppError('NOT_FOUND');
      db.prepare('UPDATE products SET category_id = NULL, updated_at = ? WHERE category_id = ? AND restaurant_id = ?').run(now(), cid, rid);
      db.prepare('DELETE FROM menu_categories WHERE id = ? AND restaurant_id = ?').run(cid, rid);
    });
  }

  function reorderCategories(actor, rid, ids) {
    staff(actor, rid);
    if (!Array.isArray(ids)) throw new AppError('VALIDATION', { details: { field: 'ids' } });
    tx(db, () => {
      const upd = db.prepare('UPDATE menu_categories SET sort = ? WHERE id = ? AND restaurant_id = ?');
      ids.forEach((id, i) => upd.run((i + 1) * 10, v.id(id), rid));
    });
  }

  function saveProduct(actor, rid, data, productId = null) {
    staff(actor, rid);
    const price = v.money(data.price, 'price');
    if (price === 0) throw new AppError('VALIDATION', { details: { field: 'price', reason: 'zero' } });
    const old = v.money(data.old_price, 'old_price', { optional: true });
    if (old != null && old <= price) throw new AppError('VALIDATION', { details: { field: 'old_price', reason: 'not_greater' } });
    let categoryId = null;
    if (data.category_id != null && data.category_id !== '') {
      categoryId = v.id(data.category_id, 'category_id');
      if (!db.prepare('SELECT 1 FROM menu_categories WHERE id = ? AND restaurant_id = ?').get(categoryId, rid)) throw new AppError('VALIDATION', { details: { field: 'category_id' } });
    }
    const rec = [
      categoryId,
      v.str(data.name_uz, 'name_uz', { max: 120 }),
      v.str(data.name_ru, 'name_ru', { optional: true, max: 120 }),
      v.str(data.description_uz, 'description_uz', { optional: true, max: 1000 }),
      v.str(data.description_ru, 'description_ru', { optional: true, max: 1000 }),
      v.str(data.portion, 'portion', { optional: true, max: 40 }),
      price, old, imagePath(rid, data.image_path),
      data.is_available === false ? 0 : 1,
      data.is_popular ? 1 : 0,
    ];
    // Tayyorlanish animatsiyasi turi va vaqti (soniya). Bo'sh — standart (30 s, umumiy animatsiya).
    const cookStyle = data.cook_style ? v.oneOf(data.cook_style, 'cook_style', COOK_STYLES) : null;
    const prepSeconds = data.prep_seconds == null || data.prep_seconds === '' ? null : v.int(data.prep_seconds, 'prep_seconds', { min: 5, max: 3600 });
    const t = now();
    return tx(db, () => {
      let id;
      if (productId) {
        const res = db.prepare(`UPDATE products SET category_id = ?, name_uz = ?, name_ru = ?, description_uz = ?, description_ru = ?, portion = ?,
          price = ?, old_price = ?, image_path = ?, is_available = ?, is_popular = ?, updated_at = ? WHERE id = ? AND restaurant_id = ? AND is_deleted = 0`)
          .run(...rec, t, v.id(productId), rid);
        if (res.changes !== 1) throw new AppError('NOT_FOUND');
        id = v.id(productId);
      } else {
        id = Number(db.prepare(`INSERT INTO products (category_id, name_uz, name_ru, description_uz, description_ru, portion, price, old_price, image_path,
          is_available, is_popular, restaurant_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(...rec, rid, t, t).lastInsertRowid);
      }
      if (data.cook_style !== undefined || data.prep_seconds !== undefined || !productId) {
        db.prepare('UPDATE products SET cook_style = ?, prep_seconds = ? WHERE id = ?').run(cookStyle, prepSeconds, id);
      }
      // "Maxsus" masalliqlari: berilsa — ro'yxat to'liq almashtiriladi (bo'sh massiv — faqat standart).
      if (data.ingredients !== undefined) options.saveIngredients(id, data.ingredients);
      return id;
    });
  }

  function setAvailability(actor, rid, productId, available) {
    staff(actor, rid);
    const res = db.prepare('UPDATE products SET is_available = ?, updated_at = ? WHERE id = ? AND restaurant_id = ? AND is_deleted = 0')
      .run(available ? 1 : 0, now(), v.id(productId), rid);
    if (res.changes !== 1) throw new AppError('NOT_FOUND');
  }

  // Taom "o'chiriladi" (is_deleted) — eski buyurtmalardagi snapshot saqlanadi.
  function deleteProduct(actor, rid, productId) {
    staff(actor, rid);
    const res = db.prepare('UPDATE products SET is_deleted = 1, updated_at = ? WHERE id = ? AND restaurant_id = ? AND is_deleted = 0').run(now(), v.id(productId), rid);
    if (res.changes !== 1) throw new AppError('NOT_FOUND');
  }

  // ---------------- Kuryerlar ----------------
  const ACTIVE_COURIER_STATUSES = ['new', 'accepted', 'ready', 'on_way'];

  function couriers(actor, rid, at = now()) {
    staff(actor, rid);
    const from = dayStartUtc(at);
    return db.prepare(`
      SELECT c.id, c.name, c.phone, c.transport, c.status, c.is_online, c.user_id, c.last_location_at, c.last_lat, c.last_lon, u.username,
        (SELECT COUNT(*) FROM orders o WHERE o.courier_id = c.id AND o.status = 'delivered' AND o.updated_at >= ?) AS delivered_today,
        (SELECT COALESCE(SUM(o.total), 0) FROM orders o WHERE o.courier_id = c.id AND o.status = 'delivered' AND o.payment_method = 'cash' AND o.updated_at >= ?) AS cash_today,
        (SELECT COUNT(*) FROM orders o WHERE o.courier_id = c.id AND o.status IN ('new','accepted','ready','on_way')) AS active_orders
      FROM couriers c LEFT JOIN users u ON u.id = c.user_id
      WHERE c.restaurant_id = ? AND c.status = 'active' ORDER BY c.is_online DESC, c.name
    `).all(from, from, rid).map(({ last_lat, last_lon, ...c }) => {
      const state = c.is_online && c.last_location_at != null ? locationState(at - c.last_location_at) : 'hidden';
      return { ...c, linked: c.user_id != null, location: state !== 'hidden' && last_lat != null && last_lon != null ? { lat: last_lat, lon: last_lon, at: c.last_location_at, state } : null };
    });
  }

  function saveCourier(actor, rid, data, courierId = null) {
    staff(actor, rid);
    const name = v.str(data.name, 'name', { max: 80 });
    const phone = data.phone ? v.phoneUz(data.phone) : null;
    const transport = data.transport ? v.oneOf(data.transport, 'transport', ['foot', 'bike', 'moto', 'car']) : null;
    const t = now();
    if (courierId) {
      const res = db.prepare("UPDATE couriers SET name = ?, phone = ?, transport = ?, updated_at = ? WHERE id = ? AND restaurant_id = ? AND status = 'active'")
        .run(name, phone, transport, t, v.id(courierId), rid);
      if (res.changes !== 1) throw new AppError('NOT_FOUND');
      return v.id(courierId);
    }
    return Number(db.prepare('INSERT INTO couriers (restaurant_id, name, phone, transport, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(rid, name, phone, transport, t, t).lastInsertRowid);
  }

  // Faol buyurtmasi bor kuryerni uzib bo'lmaydi — avval buyurtmalarni boshqa kuryerga o'tkazish yoki yakunlash kerak.
  function removeCourier(actor, rid, courierId) {
    staff(actor, rid);
    tx(db, () => {
      const cid = v.id(courierId);
      if (!db.prepare("SELECT 1 FROM couriers WHERE id = ? AND restaurant_id = ? AND status = 'active'").get(cid, rid)) throw new AppError('NOT_FOUND');
      const active = db.prepare(`SELECT COUNT(*) AS n FROM orders WHERE courier_id = ? AND status IN (${ACTIVE_COURIER_STATUSES.map(() => '?').join(',')})`).get(cid, ...ACTIVE_COURIER_STATUSES).n;
      if (active) throw new AppError('CONFLICT', { details: { reason: 'courier_has_active_orders', count: active } });
      db.prepare("UPDATE couriers SET status = 'revoked', is_online = 0, updated_at = ? WHERE id = ?").run(now(), cid);
      db.prepare("UPDATE invites SET revoked_at = ? WHERE courier_id = ? AND used_at IS NULL AND revoked_at IS NULL").run(now(), cid);
    });
  }

  // ---------------- Xodimlar ----------------
  function staffList(actor, rid) {
    staff(actor, rid);
    return db.prepare(`SELECT s.id, s.user_id, s.role, s.created_at, u.first_name, u.last_name, u.username
      FROM staff s JOIN users u ON u.id = s.user_id WHERE s.restaurant_id = ? AND s.status = 'active' ORDER BY s.role DESC, s.id`).all(rid)
      .map((s) => ({ ...s, is_me: s.user_id === actor.id }));
  }

  // Faqat ega. O'zini va oxirgi egani olib tashlab bo'lmaydi (tasodifan restoransiz qolmaslik uchun).
  function revokeStaff(actor, rid, staffId) {
    ownerOrAdmin(actor, rid);
    tx(db, () => {
      const s = db.prepare("SELECT * FROM staff WHERE id = ? AND restaurant_id = ? AND status = 'active'").get(v.id(staffId), rid);
      if (!s) throw new AppError('NOT_FOUND');
      if (s.user_id === actor.id) throw new AppError('CONFLICT', { details: { reason: 'cannot_remove_self' } });
      if (s.role === 'owner') {
        const owners = db.prepare("SELECT COUNT(*) AS n FROM staff WHERE restaurant_id = ? AND role = 'owner' AND status = 'active'").get(rid).n;
        if (owners <= 1) throw new AppError('CONFLICT', { details: { reason: 'last_owner' } });
        if (!access.isPlatformAdmin(actor)) throw new AppError('FORBIDDEN'); // boshqa egani faqat platforma admini olib tashlaydi
      }
      db.prepare("UPDATE staff SET status = 'revoked', updated_at = ? WHERE id = ?").run(now(), s.id);
    });
  }

  // ---------------- Sozlamalar ----------------
  // Operatsion (ega + menejer): ochiq/pauza, ish vaqti, tayyorlash vaqti, avtomatik dispetcher.
  function updateOperations(actor, rid, data) {
    staff(actor, rid);
    const sets = [];
    const vals = [];
    if (data.is_open !== undefined) { sets.push('is_open = ?'); vals.push(data.is_open ? 1 : 0); }
    if (data.auto_dispatch !== undefined) { sets.push('auto_dispatch = ?'); vals.push(data.auto_dispatch ? 1 : 0); }
    if (data.prep_minutes !== undefined) { sets.push('prep_minutes = ?'); vals.push(v.int(data.prep_minutes, 'prep_minutes', { min: 5, max: 180 })); }
    if (data.work_hours !== undefined) {
      if (data.work_hours === null) { sets.push('work_hours = NULL'); } else {
        if (!validHoursInput(data.work_hours)) throw new AppError('VALIDATION', { details: { field: 'work_hours' } });
        sets.push('work_hours = ?');
        vals.push(JSON.stringify({ open: data.work_hours.open, close: data.work_hours.close, days_off: data.work_hours.days_off || [] }));
      }
    }
    if (!sets.length) throw new AppError('VALIDATION', { details: { field: 'settings' } });
    db.prepare(`UPDATE restaurants SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`).run(...vals, now(), rid);
  }

  // Faqat ega: ma'lumot, rasm, yetkazish narxi va hududi, minimal summa, bepul yetkazish, olib ketish.
  function updateProfile(actor, rid, data) {
    ownerOrAdmin(actor, rid);
    const r = getR(rid);
    const pick = (k, fn) => (data[k] === undefined ? r[k] : fn(data[k]));
    const rec = {
      name: pick('name', (x) => v.str(x, 'name', { min: 2, max: 120 })),
      description: pick('description', (x) => v.str(x, 'description', { optional: true, max: 1000 })),
      phone: pick('phone', (x) => (x ? v.phoneUz(x) : null)),
      address_text: pick('address_text', (x) => v.str(x, 'address_text', { optional: true, max: 300 })),
      logo_path: pick('logo_path', (x) => imagePath(rid, x)),
      cover_path: pick('cover_path', (x) => imagePath(rid, x)),
      delivery_base: pick('delivery_base', (x) => v.money(x, 'delivery_base', { max: 1_000_000 })),
      delivery_base_m: pick('delivery_base_m', (x) => v.int(x, 'delivery_base_m', { min: 0, max: 60000 })),
      delivery_per_km: pick('delivery_per_km', (x) => v.money(x, 'delivery_per_km', { max: 1_000_000 })),
      delivery_radius_m: pick('delivery_radius_m', (x) => v.int(x, 'delivery_radius_m', { min: 500, max: 60000 })),
      min_order: pick('min_order', (x) => v.money(x, 'min_order', { max: 100_000_000 })),
      free_delivery_from: pick('free_delivery_from', (x) => v.money(x, 'free_delivery_from', { optional: true, max: 100_000_000 })),
      pickup_enabled: pick('pickup_enabled', (x) => (x ? 1 : 0)),
    };
    let lat = r.lat;
    let lon = r.lon;
    if (data.lat !== undefined || data.lon !== undefined) ({ lat, lon } = geo.requireServiceArea(data.lat, data.lon));
    db.prepare(`UPDATE restaurants SET name = ?, description = ?, phone = ?, address_text = ?, logo_path = ?, cover_path = ?, delivery_base = ?,
      delivery_base_m = ?, delivery_per_km = ?, delivery_radius_m = ?, min_order = ?, free_delivery_from = ?, pickup_enabled = ?, lat = ?, lon = ?, updated_at = ?
      WHERE id = ?`).run(rec.name, rec.description, rec.phone, rec.address_text, rec.logo_path, rec.cover_path, rec.delivery_base, rec.delivery_base_m,
      rec.delivery_per_km, rec.delivery_radius_m, rec.min_order, rec.free_delivery_from, rec.pickup_enabled, lat, lon, now(), rid);
  }

  // ---------------- Hisobot ----------------
  // "Tushum" — yetkazilgan/topshirilgan buyurtmalar summasi (xarajatlar hisoblanmagan; bu sof foyda EMAS).
  function report(actor, rid, at = now()) {
    staff(actor, rid);
    const today = dayStartUtc(at);
    const from7 = today - 6 * 86400000;
    const agg = (fromMs, toMs) => db.prepare(`
      SELECT COUNT(*) AS orders,
        SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) AS delivered,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled,
        COALESCE(SUM(CASE WHEN status = 'delivered' THEN total END), 0) AS revenue,
        COALESCE(SUM(CASE WHEN status = 'delivered' THEN items_total END), 0) AS food_revenue,
        COALESCE(SUM(CASE WHEN status = 'delivered' THEN delivery_fee END), 0) AS delivery_revenue,
        COALESCE(SUM(CASE WHEN status = 'delivered' AND payment_method = 'cash' THEN total END), 0) AS cash,
        COALESCE(SUM(CASE WHEN status = 'delivered' AND payment_method <> 'cash' THEN total END), 0) AS prepaid,
        SUM(CASE WHEN status = 'delivered' AND type = 'delivery' AND delivery_fee = 0 THEN 1 ELSE 0 END) AS free_deliveries
      FROM orders WHERE restaurant_id = ? AND created_at >= ? AND created_at < ?`).get(rid, fromMs, toMs);
    const shape = (a) => ({
      orders: a.orders, delivered: a.delivered || 0, cancelled: a.cancelled || 0,
      revenue: a.revenue, food_revenue: a.food_revenue, delivery_revenue: a.delivery_revenue, cash: a.cash, prepaid: a.prepaid, free_deliveries: a.free_deliveries || 0,
      average: a.delivered ? Math.round(a.revenue / a.delivered) : 0,
    });
    const days = [];
    for (let d = from7; d <= today; d += 86400000) {
      const x = agg(d, d + 86400000);
      days.push({ date: new Date(d + TZ_MS).toISOString().slice(0, 10), orders: x.orders, revenue: x.revenue });
    }
    const popular = db.prepare(`
      SELECT oi.name, SUM(oi.qty) AS qty, SUM(oi.line_total) AS total
      FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE o.restaurant_id = ? AND o.status = 'delivered' AND o.created_at >= ?
      GROUP BY oi.name ORDER BY qty DESC, total DESC LIMIT 5`).all(rid, from7).map((p) => ({ ...p }));
    const counts = db.prepare('SELECT COUNT(*) AS products, COALESCE(SUM(is_available), 0) AS available FROM products WHERE restaurant_id = ? AND is_deleted = 0').get(rid);
    return { counts, today: shape(agg(today, today + 86400000)), week: shape(agg(from7, today + 86400000)), days, popular, revenue_note: 'gross_without_costs' };
  }

  return {
    orders, assignCourier, menu, saveCategory, deleteCategory, reorderCategories, saveProduct, setAvailability, deleteProduct,
    couriers, saveCourier, removeCourier, staffList, revokeStaff, updateOperations, updateProfile, report,
  };
}
