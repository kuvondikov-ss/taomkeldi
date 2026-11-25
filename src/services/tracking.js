// Mijoz kuzatuvi, kuryer joylashuvi, baholash, qayta buyurtma.
// Maxfiylik: kuryer koordinatasi faqat o'sha FAOL buyurtmaning mijoziga (faqat "yo'lda" bosqichida) va vakolatli xodimga
// (restoran xodimi, platforma admini, o'sha buyurtma kuryeri). Yetkazilgan/bekor qilingan buyurtmada joylashuv qaytmaydi.
import { now, tx } from '../db/index.js';
import { AppError } from '../lib/errors.js';
import * as v from '../lib/validate.js';
import { distanceMeters } from '../../public/js/shared/geo-core.js';
import { locationState, travelEta, LIVE_MAX_AGE_MS, HIDE_AFTER_MS, PING_ACTIVE_MS, PING_IDLE_MS } from '../../public/js/shared/tracking.js';

const ACTIVE = ['new', 'accepted', 'ready', 'on_way'];
const COURIER_ACTIVE = ['accepted', 'ready', 'on_way']; // joylashuv yozish uchun "faol buyurtma"

export function createTrackingService(db, { access, catalog }) {
  const getO = (id) => db.prepare('SELECT * FROM orders WHERE id = ?').get(id);

  // ---------- Kuryer joylashuvi ----------
  // Telegram (oddiy/jonli) yoki kuryer ekranidan. Ishda bo'lgan YOKI faol buyurtmasi bor kuryer yozuvlariga yoziladi:
  // faol buyurtmali kuryer "Ishni tugatdim"ni bossa ham kuzatuv uzilmaydi.
  function saveCourierLocation(userId, loc, at = now()) {
    const lat = Number(loc?.latitude ?? loc?.lat);
    const lon = Number(loc?.longitude ?? loc?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) return 0;
    return db.prepare(`UPDATE couriers SET last_lat = ?, last_lon = ?, last_location_at = ?
      WHERE user_id = ? AND status = 'active'
        AND (is_online = 1 OR id IN (SELECT courier_id FROM orders WHERE courier_id IS NOT NULL AND status IN ('accepted','ready','on_way')))`)
      .run(lat, lon, at, userId).changes;
  }

  function courierPing(actor, body) {
    if (!actor || !access.courierRows(actor).length) throw new AppError('FORBIDDEN');
    const n = saveCourierLocation(actor.id, { lat: body?.lat, lon: body?.lon });
    if (!n) return { saved: false };
    return { saved: true, next_ms: db.prepare(`SELECT 1 FROM orders o JOIN couriers c ON c.id = o.courier_id
      WHERE c.user_id = ? AND o.status = 'on_way' LIMIT 1`).get(actor.id) ? PING_ACTIVE_MS : PING_IDLE_MS };
  }

  // ---------- Kuzatuv ----------
  function track(actor, orderId, at = now()) {
    const o = getO(v.id(orderId));
    const role = access.orderViewRole(actor, o);
    if (!role) throw new AppError('NOT_FOUND');
    const r = db.prepare('SELECT name, lat, lon, address_text, phone FROM restaurants WHERE id = ?').get(o.restaurant_id);
    const out = {
      order_id: o.id, status: o.status, type: o.type, viewer_role: role,
      restaurant: { name: r.name, lat: r.lat, lon: r.lon },
      destination: o.type === 'delivery' && o.address_lat != null ? { lat: o.address_lat, lon: o.address_lon } : null,
      courier: null, location: null, location_reason: null, distance_m: null, eta: null,
      distance_method: 'straight_line',
      thresholds: { live_ms: LIVE_MAX_AGE_MS, hide_ms: HIDE_AFTER_MS },
    };
    const active = ACTIVE.includes(o.status);
    const staffView = role !== 'customer';

    // Tayyorlash vaqti: restoran qabul qilgan vaqt + tayyorlash daqiqalari (faqat ma'lumot bo'lsa).
    if (o.status === 'accepted' && o.prep_minutes) {
      const acc = db.prepare("SELECT created_at FROM order_events WHERE order_id = ? AND to_status = 'accepted' ORDER BY id DESC LIMIT 1").get(o.id);
      if (acc) {
        const left = Math.ceil((acc.created_at + o.prep_minutes * 60_000 - at) / 60_000);
        out.eta = { kind: 'prep', from: Math.max(0, left), to: Math.max(5, left + 5) };
      }
    }

    if (!o.courier_id || o.type !== 'delivery' || !active) {
      out.location_reason = o.type !== 'delivery' ? 'pickup' : !active ? 'finished' : 'no_courier';
      return out;
    }
    const c = db.prepare('SELECT id, name, phone, transport, last_lat, last_lon, last_location_at FROM couriers WHERE id = ?').get(o.courier_id);
    out.courier = { name: c.name, phone: c.phone, transport: c.transport };

    // Mijozga joylashuv faqat "yo'lda" bosqichida; xodimga — kuryer biriktirilgan har faol bosqichda.
    if (!staffView && o.status !== 'on_way') { out.location_reason = 'not_on_way'; return out; }
    if (c.last_location_at == null || c.last_lat == null) { out.location_reason = 'no_location'; return out; }
    const age = at - c.last_location_at;
    const state = locationState(age);
    if (state === 'hidden') { out.location_reason = 'too_old'; return out; }
    out.location = { lat: c.last_lat, lon: c.last_lon, at: c.last_location_at, age_ms: Math.max(0, age), state };
    if (out.destination) {
      out.distance_m = Math.round(distanceMeters(c.last_lat, c.last_lon, out.destination.lat, out.destination.lon));
      if (o.status === 'on_way' && state === 'live') out.eta = { kind: 'travel', ...travelEta(out.distance_m) };
    }
    return out;
  }

  // ---------- Baholash ----------
  // Faqat o'z, yetkazilgan buyurtmasi. Qayta baholash — o'zgartirish (reyting soni oshmaydi).
  function rate(actor, orderId, body = {}) {
    const o = getO(v.id(orderId));
    if (!o || !actor || o.customer_id !== actor.id) throw new AppError('NOT_FOUND');
    if (o.status !== 'delivered') throw new AppError('CONFLICT', { details: { reason: 'not_delivered' } });
    const stars = v.int(body.stars, 'stars', { min: 1, max: 5 });
    const comment = v.str(body.comment, 'comment', { optional: true, max: 500 }) || null;
    return tx(db, () => {
      const prev = db.prepare('SELECT stars FROM order_ratings WHERE order_id = ?').get(o.id);
      const t = now();
      if (prev) {
        db.prepare('UPDATE order_ratings SET stars = ?, comment = ?, updated_at = ? WHERE order_id = ?').run(stars, comment, t, o.id);
        db.prepare('UPDATE restaurants SET rating_sum = rating_sum + ? WHERE id = ?').run(stars - prev.stars, o.restaurant_id);
      } else {
        db.prepare('INSERT INTO order_ratings (order_id, restaurant_id, customer_id, stars, comment, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(o.id, o.restaurant_id, actor.id, stars, comment, t, t);
        db.prepare('UPDATE restaurants SET rating_sum = rating_sum + ?, rating_count = rating_count + 1 WHERE id = ?').run(stars, o.restaurant_id);
      }
      return { stars, comment, updated: !!prev };
    });
  }
  const ratingOf = (orderId) => db.prepare('SELECT stars, comment, created_at FROM order_ratings WHERE order_id = ?').get(orderId) || null;

  // ---------- Qayta buyurtma ----------
  // Joriy narx, mavjudlik va restoran holati QAYTA tekshiriladi (eski narx ishlatilmaydi).
  function reorder(actor, orderId, point) {
    const o = getO(v.id(orderId));
    if (!o || !actor || o.customer_id !== actor.id) throw new AppError('NOT_FOUND');
    const items = db.prepare('SELECT product_id, qty FROM order_items WHERE order_id = ? AND product_id IS NOT NULL ORDER BY id').all(o.id);
    const merged = new Map();
    for (const i of items) merged.set(i.product_id, Math.min(99, (merged.get(i.product_id) || 0) + i.qty));
    if (!merged.size) throw new AppError('CONFLICT', { details: { reason: 'nothing_to_reorder' } });
    let check;
    try {
      check = catalog.checkCart(actor, point, { restaurant_id: o.restaurant_id, items: [...merged].map(([product_id, qty]) => ({ product_id, qty })) });
    } catch (e) {
      if (e instanceof AppError && e.code === 'NOT_FOUND') throw new AppError('CONFLICT', { details: { reason: 'restaurant_unavailable' } });
      throw e;
    }
    const products = db.prepare(`SELECT id, name_uz, name_ru, price, portion, image_path, is_available FROM products
      WHERE restaurant_id = ? AND is_deleted = 0 AND id IN (${[...merged.keys()].map(() => '?').join(',')})`).all(o.restaurant_id, ...merged.keys())
      .map((p) => ({ ...p }));
    const prev = new Map(db.prepare('SELECT product_id, price FROM order_items WHERE order_id = ?').all(o.id).map((x) => [x.product_id, x.price]));
    return {
      restaurant: check.restaurant,
      delivery: check.delivery,
      products,
      lines: check.lines.map((l) => ({ ...l, previous_price: prev.get(l.product_id) ?? null, price_changed: l.price != null && prev.get(l.product_id) !== l.price })),
      items_total: check.items_total,
      can_order: check.can_order,
    };
  }

  return { saveCourierLocation, courierPing, track, rate, ratingOf, reorder };
}
