// Buyurtmalar: o'qish huquqlari va yaratish asosi.
// To'liq checkout, narx/yetkazish hisobi va holat o'tishlari — 8-bosqich.
import { now, tx } from '../db/index.js';
import { AppError } from '../lib/errors.js';
import * as v from '../lib/validate.js';

export const ORDER_STATUSES = ['pending_payment', 'new', 'accepted', 'ready', 'on_way', 'delivered', 'cancelled'];
export const PAYMENT_STATUSES = ['unpaid', 'claimed', 'paid', 'refund_requested', 'refunded'];

export function createOrderService(db, access) {
  const getStmt = db.prepare('SELECT * FROM orders WHERE id = ?');
  const itemsStmt = db.prepare('SELECT id, product_id, name, price, qty, line_total FROM order_items WHERE order_id = ? ORDER BY id');

  function withItems(order) {
    return { ...order, items: itemsStmt.all(order.id) };
  }

  // Huquqi bo'lmasa NOT_FOUND: begona buyurtma mavjudligini oshkor qilmaymiz.
  function getForActor(actor, orderId) {
    const order = getStmt.get(orderId);
    const role = access.orderViewRole(actor, order);
    if (!role) throw new AppError('NOT_FOUND');
    const view = withItems(order);
    view.viewer_role = role;
    return view;
  }

  function listForCustomer(actor, { limit = 20 } = {}) {
    return db.prepare(`
      SELECT o.id, o.restaurant_id, r.name AS restaurant_name, o.status, o.payment_status, o.total, o.created_at
      FROM orders o JOIN restaurants r ON r.id = o.restaurant_id
      WHERE o.customer_id = ? ORDER BY o.created_at DESC, o.id DESC LIMIT ?
    `).all(actor.id, limit);
  }

  function listForRestaurant(actor, restaurantId, { status } = {}) {
    access.requireRestaurantStaff(actor, restaurantId);
    if (status) v.oneOf(status, 'status', ORDER_STATUSES);
    return db.prepare(`
      SELECT id, status, payment_method, payment_status, type, total, courier_id, created_at
      FROM orders WHERE restaurant_id = ? ${status ? 'AND status = ?' : ''}
      ORDER BY created_at DESC, id DESC LIMIT 200
    `).all(...(status ? [restaurantId, status] : [restaurantId]));
  }

  // Kuryer faqat o'ziga biriktirilgan va o'z restoranidagi buyurtmalarni ko'radi.
  function listForCourier(actor) {
    const rows = access.courierRows(actor);
    if (!rows.length) throw new AppError('FORBIDDEN');
    return db.prepare(`
      SELECT o.id, o.restaurant_id, o.status, o.total, o.payment_status, o.address_text, o.created_at
      FROM orders o JOIN couriers c ON c.id = o.courier_id AND c.restaurant_id = o.restaurant_id
      WHERE c.user_id = ? AND c.status = 'active'
      ORDER BY o.created_at DESC, o.id DESC LIMIT 100
    `).all(actor.id);
  }

  // Ichki asos: buyurtma yozuvini yaratish. Narxlar FAQAT bazadagi mahsulotlardan olinadi
  // (klient yuborgan narx/jamiga ishonilmaydi), nom va narx order_items'da snapshot bo'ladi.
  // deliveryFee chaqiruvchi server kodi tomonidan hisoblanadi (5/8-bosqich).
  // Bir xil idempotencyKey bilan takror chaqiruv yangi buyurtma yaratmaydi.
  function createRecord(actor, input) {
    const restaurantId = v.id(input.restaurantId, 'restaurant_id');
    const type = v.oneOf(input.type || 'delivery', 'type', ['delivery', 'pickup']);
    const paymentMethod = v.oneOf(input.paymentMethod || 'cash', 'payment_method', ['cash', 'card_transfer', 'online']);
    const deliveryFee = type === 'pickup' ? 0 : v.money(input.deliveryFee ?? 0, 'delivery_fee');
    const key = input.idempotencyKey ? v.str(input.idempotencyKey, 'idempotency_key', { max: 64 }) : null;
    if (!Array.isArray(input.items) || input.items.length === 0 || input.items.length > 100) {
      throw new AppError('VALIDATION', { details: { field: 'items' } });
    }

    return tx(db, () => {
      if (key) {
        const existing = db.prepare('SELECT id FROM orders WHERE customer_id = ? AND idempotency_key = ?').get(actor.id, key);
        if (existing) return withItems(getStmt.get(existing.id));
      }
      const restaurant = db.prepare('SELECT id, status FROM restaurants WHERE id = ?').get(restaurantId);
      if (!restaurant) throw new AppError('NOT_FOUND');

      const productStmt = db.prepare(`
        SELECT id, name_uz, price, is_available FROM products
        WHERE id = ? AND restaurant_id = ? AND is_deleted = 0
      `);
      const lines = [];
      const seen = new Map();
      for (const it of input.items) {
        const pid = v.id(it.productId, 'product_id');
        const qty = v.int(it.qty, 'qty', { min: 1, max: 99 });
        seen.set(pid, (seen.get(pid) || 0) + qty);
      }
      for (const [pid, qty] of seen) {
        const p = productStmt.get(pid, restaurantId);
        if (!p) throw new AppError('VALIDATION', { details: { field: 'items', reason: 'product_not_in_restaurant', productId: pid } });
        if (!p.is_available) throw new AppError('CONFLICT', { details: { reason: 'product_unavailable', productId: pid } });
        lines.push({ productId: p.id, name: p.name_uz, price: p.price, qty, lineTotal: p.price * qty });
      }
      const itemsTotal = lines.reduce((s, l) => s + l.lineTotal, 0);
      const total = itemsTotal + deliveryFee;
      if (!Number.isSafeInteger(total)) throw new AppError('VALIDATION', { details: { field: 'total' } });

      const status = paymentMethod === 'card_transfer' ? 'pending_payment' : 'new';
      const t = now();
      const res = db.prepare(`
        INSERT INTO orders (restaurant_id, customer_id, type, status, payment_method, payment_status,
          items_total, delivery_fee, total, customer_name, customer_phone, address_text, address_lat, address_lon,
          comment, idempotency_key, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'unpaid', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        restaurantId, actor.id, type, status, paymentMethod, itemsTotal, deliveryFee, total,
        input.customerName ?? null, input.customerPhone ?? null, input.addressText ?? null,
        input.addressLat ?? null, input.addressLon ?? null, input.comment ?? null, key, t, t,
      );
      const orderId = Number(res.lastInsertRowid);
      const itemStmt = db.prepare(
        'INSERT INTO order_items (order_id, product_id, name, price, qty, line_total) VALUES (?, ?, ?, ?, ?, ?)',
      );
      for (const l of lines) itemStmt.run(orderId, l.productId, l.name, l.price, l.qty, l.lineTotal);
      db.prepare(`
        INSERT INTO order_events (order_id, actor_id, actor_role, type, to_status, created_at)
        VALUES (?, ?, 'customer', 'created', ?, ?)
      `).run(orderId, actor.id, status, t);
      return withItems(getStmt.get(orderId));
    });
  }

  // Ichki: kuryer biriktirish (14-bosqichda dispetcher bilan to'ldiriladi).
  function assignCourierRaw(orderId, courierId) {
    db.prepare('UPDATE orders SET courier_id = ?, updated_at = ? WHERE id = ?').run(courierId, now(), orderId);
  }

  return { getForActor, listForCustomer, listForRestaurant, listForCourier, createRecord, assignCourierRaw };
}
