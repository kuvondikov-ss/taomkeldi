// Checkout: narxni hisoblash (quote) va buyurtma yaratish BITTA funksiyadan foydalanadi.
// Klient yuborgan narx, jami yoki yetkazish summasiga ishonilmaydi — hammasi bazadan qayta hisoblanadi.
import { now, tx } from '../db/index.js';
import { AppError } from '../lib/errors.js';
import * as v from '../lib/validate.js';
import { freeDeliveryInfo } from '../../public/js/shared/geo-core.js';
import { openNow } from './catalog.js';

export function createCheckoutService(db, { geo, addresses, users, payments }) {
  // Mavjud to'lov usullari: restoran yoqqan va ishlashga tayyor bo'lganlari.
  //  - karta o'tkazmasi: karta raqami va egasi kiritilgan bo'lsa;
  //  - onlayn: PAYMENT_PROVIDER_TOKEN va bot ulangan bo'lsa (aks holda umuman ko'rsatilmaydi).
  function paymentMethods(r) {
    const m = [];
    if (r.pay_cash) m.push('cash');
    if (r.pay_card_transfer && r.card_number && r.card_holder) m.push('card_transfer');
    if (r.pay_online && payments?.onlineAvailable()) m.push('online');
    return m;
  }

  // Yagona hisob. Natijada muammolar ro'yxati (problems) — bo'sh bo'lsa buyurtma berish mumkin.
  function computeQuote(actor, input = {}) {
    const restaurantId = v.id(input.restaurant_id, 'restaurant_id');
    const type = v.oneOf(input.type || 'delivery', 'type', ['delivery', 'pickup']);
    const items = Array.isArray(input.items) ? input.items : null;
    if (!items || items.length === 0 || items.length > 100) throw new AppError('VALIDATION', { details: { field: 'items' } });

    const r = db.prepare('SELECT * FROM restaurants WHERE id = ?').get(restaurantId);
    if (!r || r.status !== 'active') throw new AppError('NOT_FOUND');
    if (type === 'pickup' && !r.pickup_enabled) throw new AppError('VALIDATION', { details: { field: 'type', reason: 'pickup_disabled' } });

    const problems = [];
    // Yetkazish manzili: faqat o'z manzili va Jizzax viloyati ichida (resolvePoint tekshiradi).
    let address = null;
    if (type === 'delivery') {
      const a = addresses.getOwn(actor, input.address_id);
      if (!a.in_service_area) throw new AppError('OUT_OF_AREA');
      address = { id: a.id, text: a.text, lat: a.lat, lon: a.lon, entrance: a.entrance, floor: a.floor, apartment: a.apartment, comment: a.comment, label: a.label };
    }

    const get = db.prepare('SELECT id, name_uz, price, is_available, is_deleted FROM products WHERE id = ? AND restaurant_id = ?');
    const merged = new Map();
    for (const it of items) {
      const pid = v.id(it.product_id, 'product_id');
      const qty = v.int(it.qty, 'qty', { min: 1, max: 99 });
      merged.set(pid, Math.min(99, (merged.get(pid) || 0) + qty));
    }
    const lines = [];
    let itemsTotal = 0;
    for (const [pid, qty] of merged) {
      const p = get.get(pid, restaurantId);
      if (!p || p.is_deleted) { lines.push({ product_id: pid, qty, status: 'removed', name: null, price: null, line_total: 0 }); continue; }
      if (!p.is_available) { lines.push({ product_id: pid, qty, status: 'unavailable', name: p.name_uz, price: p.price, line_total: 0 }); continue; }
      lines.push({ product_id: pid, qty, status: 'ok', name: p.name_uz, price: p.price, line_total: p.price * qty });
      itemsTotal += p.price * qty;
    }
    if (lines.some((l) => l.status === 'removed')) problems.push('product_removed');
    if (lines.some((l) => l.status === 'unavailable')) problems.push('product_unavailable');
    if (!openNow(r)) problems.push('restaurant_closed');
    if (itemsTotal === 0) problems.push('empty');
    if (itemsTotal < r.min_order) problems.push('below_min_order');

    // Yetkazish narxi va bepul yetkazish — bitta server hisobi (geo-core.freeDeliveryInfo). Yetkazib bo'lmasa narx NOMA'LUM (null),
    // hech qachon "0 so'm" emas. Olib ketishda 0 so'm — aksiya emas (kind: 'pickup').
    let deliveryFee = 0;
    let delivery = null;
    let free = { kind: 'pickup', threshold: null, applied: false, left: null, now_free: false };
    if (type === 'delivery') {
      delivery = geo.deliveryFor(r, address);
      free = freeDeliveryInfo(r, delivery, itemsTotal);
      if (!delivery.deliverable) { problems.push('not_deliverable'); deliveryFee = null; }
      else deliveryFee = free.now_free ? 0 : delivery.delivery_fee;
    }
    const methods = paymentMethods(r);
    if (!methods.length) problems.push('no_payment_method');

    return {
      restaurant: { id: r.id, name: r.name, is_open: openNow(r), min_order: r.min_order, pickup_enabled: r.pickup_enabled === 1, address_text: r.address_text, phone: r.phone },
      type,
      address,
      lines,
      items_total: itemsTotal,
      delivery_fee: deliveryFee,
      total: deliveryFee == null ? null : itemsTotal + deliveryFee,
      delivery,
      free_delivery: free,
      payment_methods: methods,
      problems,
      can_order: problems.length === 0,
    };
  }

  // Buyurtma yaratish. Bir xil idempotency_key bilan qayta yuborilsa — o'sha buyurtma qaytadi (dublikat yo'q).
  // expected_total — mijoz ekranda ko'rgan jami; farq qilsa PRICE_CHANGED (yangi quote bilan).
  function placeOrder(actor, input = {}) {
    const key = v.str(input.idempotency_key, 'idempotency_key', { min: 8, max: 64 });
    return tx(db, () => {
      const existing = db.prepare('SELECT id FROM orders WHERE customer_id = ? AND idempotency_key = ?').get(actor.id, key);
      if (existing) return { orderId: existing.id, duplicate: true };

      const q = computeQuote(actor, input);
      if (!q.can_order) throw new AppError('CANNOT_ORDER', { details: { problems: q.problems, quote: q } });
      const method = v.oneOf(input.payment_method, 'payment_method', q.payment_methods);
      const expected = v.int(input.expected_total, 'expected_total', { min: 0 });
      if (expected !== q.total) throw new AppError('PRICE_CHANGED', { details: { quote: q } });

      const name = v.str(input.customer_name, 'customer_name', { min: 2, max: 60 });
      const phone = v.phoneUz(input.customer_phone, 'customer_phone');
      const comment = v.str(input.comment, 'comment', { optional: true, max: 500 });

      const status = method === 'cash' ? 'new' : 'pending_payment';
      const t = now();
      const a = q.address;
      const res = db.prepare(`
        INSERT INTO orders (restaurant_id, customer_id, type, status, payment_method, payment_status,
          items_total, delivery_fee, total, customer_name, customer_phone, address_text, address_lat, address_lon,
          address_details, comment, idempotency_key, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'unpaid', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        q.restaurant.id, actor.id, q.type, status, method, q.items_total, q.delivery_fee, q.total, name, phone,
        a?.text ?? null, a?.lat ?? null, a?.lon ?? null,
        a ? JSON.stringify({ label: a.label, entrance: a.entrance, floor: a.floor, apartment: a.apartment, comment: a.comment }) : null,
        comment, key, t, t,
      );
      const orderId = Number(res.lastInsertRowid);
      const ins = db.prepare('INSERT INTO order_items (order_id, product_id, name, price, qty, line_total) VALUES (?, ?, ?, ?, ?, ?)');
      for (const l of q.lines) ins.run(orderId, l.product_id, l.name, l.price, l.qty, l.line_total);
      db.prepare(`INSERT INTO order_events (order_id, actor_id, actor_role, type, to_status, data, created_at)
        VALUES (?, ?, 'customer', 'created', ?, ?, ?)`).run(orderId, actor.id, status, JSON.stringify({ total: q.total, payment_method: method }), t);
      // Kontaktni keyingi safar uchun saqlaymiz.
      db.prepare('UPDATE users SET contact_name = ?, phone = ?, updated_at = ? WHERE id = ?').run(name, phone, t, actor.id);
      return { orderId, duplicate: false };
    });
  }

  function saveContact(actor, data) {
    const name = v.str(data.name, 'name', { min: 2, max: 60 });
    const phone = v.phoneUz(data.phone, 'phone');
    db.prepare('UPDATE users SET contact_name = ?, phone = ?, updated_at = ? WHERE id = ?').run(name, phone, now(), actor.id);
    return users.get(actor.id);
  }

  return { computeQuote, placeOrder, saveContact, paymentMethods };
}
