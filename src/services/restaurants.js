import { now, tx } from '../db/index.js';
import { AppError } from '../lib/errors.js';
import * as v from '../lib/validate.js';
import { withinHours } from '../../public/js/shared/hours.js';

const openNow = (r) => r.is_open === 1 && withinHours(r.work_hours);

export function createRestaurantService(db, access, geo) {
  const getStmt = db.prepare('SELECT * FROM restaurants WHERE id = ?');

  // Mijozga ko'rinadigan maydonlar (to'lov rekvizitlari, guruh va h.k. yo'q).
  const PUBLIC_FIELDS = ['id', 'name', 'description', 'address_text', 'lat', 'lon', 'is_open', 'min_order',
    'free_delivery_from', 'pickup_enabled', 'logo_path', 'cover_path', 'delivery_radius_m'];
  const toPublic = (r, delivery) => ({
    ...Object.fromEntries(PUBLIC_FIELDS.map((k) => [k, r[k]])),
    is_open: openNow(r),
    delivery,
  });

  // Nuqtani qamrab oladigan FAOL restoranlar. Yopiqlari ham qaytadi (is_open=false) — buyurtma olinmaydi.
  // Yetkazish masofasi — to'g'ri chiziq (distance_method), yo'l masofasi emas.
  function listForPoint(point) {
    const rows = db.prepare("SELECT * FROM restaurants WHERE status = 'active' AND lat IS NOT NULL AND lon IS NOT NULL").all();
    return rows
      .map((r) => ({ r, d: geo.deliveryFor(r, point) }))
      .filter(({ d }) => d.deliverable)
      .sort((a, b) => (b.r.is_open - a.r.is_open) || (a.d.distance_m - b.d.distance_m))
      .map(({ r, d }) => toPublic(r, d));
  }

  // Bitta restoran (mijoz uchun). Faol bo'lmasa — topilmadi. Yetkazib bermasa ham ko'rsatiladi, delivery.deliverable=false.
  function getPublic(restaurantId, point) {
    const r = getRaw(restaurantId);
    if (!r || r.status !== 'active') throw new AppError('NOT_FOUND');
    return toPublic(r, point ? geo.deliveryFor(r, point) : null);
  }

  // Checkout (8-bosqich) shu funksiyani chaqiradi: faol, ochiq va manzilga yetkazadigan bo'lishi shart.
  function assertCanDeliver(restaurantId, point) {
    const r = getRaw(restaurantId);
    if (!r || r.status !== 'active') throw new AppError('NOT_FOUND');
    if (!openNow(r)) throw new AppError('CONFLICT', { details: { reason: 'restaurant_closed' } });
    const d = geo.deliveryFor(r, point);
    if (!d.deliverable) throw new AppError('NOT_DELIVERABLE', { details: { reason: d.reason } });
    return { restaurant: r, delivery: d };
  }

  // Restoran joylashuvi va yetkazish radiusi (ega/menejer). Nuqta Jizzax viloyati ichida bo'lishi shart.
  function updateLocation(actor, restaurantId, data) {
    if (!getRaw(restaurantId)) {
      if (!access.isPlatformAdmin(actor)) throw new AppError('FORBIDDEN');
      throw new AppError('NOT_FOUND');
    }
    access.requireRestaurantStaff(actor, restaurantId);
    const { lat, lon } = geo.requireServiceArea(data.lat, data.lon);
    const radius = v.int(data.delivery_radius_m ?? getRaw(restaurantId).delivery_radius_m, 'delivery_radius_m', { min: 500, max: 60000 });
    db.prepare('UPDATE restaurants SET lat = ?, lon = ?, address_text = COALESCE(?, address_text), delivery_radius_m = ?, updated_at = ? WHERE id = ?')
      .run(lat, lon, v.str(data.address_text, 'address_text', { optional: true, max: 300 }), radius, now(), restaurantId);
    return getForPanel(actor, restaurantId);
  }

  function getRaw(id) {
    return getStmt.get(id) || null;
  }

  // Panel uchun ko'rinish: karta raqami faqat egasiga to'liq, boshqalarga maskalangan.
  function toPanelView(r, role) {
    const { card_number, ...rest } = r;
    return {
      ...rest,
      card_number: role === 'owner' ? card_number : v.maskCard(card_number),
      card_number_masked: role !== 'owner',
      viewer_role: role,
    };
  }

  function getForPanel(actor, restaurantId) {
    const r = getRaw(restaurantId);
    if (!r) {
      // Mavjud bo'lmagan restoran uchun ham avval huquq tekshiriladi (ID'larni oshkor qilmaslik).
      if (!access.isPlatformAdmin(actor)) throw new AppError('FORBIDDEN');
      throw new AppError('NOT_FOUND');
    }
    const role = access.requireRestaurantStaff(actor, restaurantId);
    return toPanelView(r, role);
  }

  // Platforma admini restoran yaratadi (10-bosqichda egasiga taklif bilan to'ldiriladi).
  function create(actor, data) {
    access.requirePlatformAdmin(actor);
    const name = v.str(data.name, 'name', { max: 120 });
    const t = now();
    const res = db.prepare(`
      INSERT INTO restaurants (name, description, phone, address_text, lat, lon, status, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      name,
      v.str(data.description, 'description', { optional: true, max: 1000 }),
      v.str(data.phone, 'phone', { optional: true, max: 32 }),
      v.str(data.address_text, 'address_text', { optional: true, max: 300 }),
      data.lat == null ? null : v.coord(data.lat, 'lat', 'lat'),
      data.lon == null ? null : v.coord(data.lon, 'lon', 'lon'),
      data.status === 'active' ? 'active' : 'pending',
      actor.id, t, t,
    );
    return getRaw(Number(res.lastInsertRowid));
  }

  // Bot orqali restoran arizasi. Bitta foydalanuvchida bir vaqtda bitta ko'rib chiqilayotgan ariza.
  // Natija: { restaurant, created: boolean }. Tasdiqlash va egalik — 10-bosqich.
  function statusCounts(actor) {
    access.requirePlatformAdmin(actor);
    const counts = { pending: 0, active: 0, blocked: 0, rejected: 0 };
    for (const r of db.prepare('SELECT status, COUNT(*) AS n FROM restaurants GROUP BY status').all()) counts[r.status] = r.n;
    return counts;
  }

  function listAll(actor) {
    access.requirePlatformAdmin(actor);
    return db.prepare('SELECT id, name, status, is_open, created_at FROM restaurants ORDER BY id').all();
  }

  // To'lov rekvizitlari — faqat restoran egasi.
  function updatePayment(actor, restaurantId, data) {
    if (!getRaw(restaurantId)) throw new AppError('NOT_FOUND');
    access.requireRestaurantStaff(actor, restaurantId, { ownerOnly: true });
    const card = v.cardNumber(data.card_number);
    const holder = v.str(data.card_holder, 'card_holder', { max: 80 });
    db.prepare('UPDATE restaurants SET card_number = ?, card_holder = ?, updated_at = ? WHERE id = ?')
      .run(card, holder, now(), restaurantId);
    return toPanelView(getRaw(restaurantId), 'owner');
  }

  // To'lov usullari — faqat restoran egasi. Karta o'tkazmasini yoqish uchun karta rekvizitlari kerak.
  function updatePaymentMethods(actor, restaurantId, data) {
    const r = getRaw(restaurantId);
    if (!r) throw new AppError('NOT_FOUND');
    access.requireRestaurantStaff(actor, restaurantId, { ownerOnly: true });
    const flag = (x, field) => {
      if (typeof x !== 'boolean') throw new AppError('VALIDATION', { details: { field } });
      return x ? 1 : 0;
    };
    const cash = flag(data.cash, 'cash');
    const card = flag(data.card_transfer, 'card_transfer');
    const online = flag(data.online, 'online');
    if (card && !(r.card_number && r.card_holder)) throw new AppError('VALIDATION', { details: { field: 'card_transfer', reason: 'card_missing' } });
    if (!cash && !card && !online) throw new AppError('VALIDATION', { details: { field: 'methods', reason: 'none' } });
    db.prepare('UPDATE restaurants SET pay_cash = ?, pay_card_transfer = ?, pay_online = ?, updated_at = ? WHERE id = ?')
      .run(cash, card, online, now(), restaurantId);
    return toPanelView(getRaw(restaurantId), 'owner');
  }

  // Ichki: xodim qo'shish. Takliflar orqali chaqiriladi (4-bosqich); takror chaqiruv dublikat yaratmaydi.
  function addStaff(restaurantId, userId, role, invitedBy = null) {
    v.oneOf(role, 'role', ['owner', 'manager']);
    const t = now();
    db.prepare(`
      INSERT INTO staff (restaurant_id, user_id, role, status, invited_by, created_at, updated_at)
      VALUES (?, ?, ?, 'active', ?, ?, ?)
      ON CONFLICT(restaurant_id, user_id) DO UPDATE SET
        role = excluded.role, status = 'active', updated_at = excluded.updated_at
    `).run(restaurantId, userId, role, invitedBy, t, t);
  }

  // Ichki: kuryer yozuvi (userId taklif qabul qilingach bog'lanadi).
  function addCourier(restaurantId, { userId = null, name, phone = null, transport = null }) {
    const t = now();
    const res = db.prepare(`
      INSERT INTO couriers (restaurant_id, user_id, name, phone, transport, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(restaurantId, userId, v.str(name, 'name', { max: 80 }), phone, transport, t, t);
    return Number(res.lastInsertRowid);
  }

  // Ichki: menyu (11-bosqichda panel orqali boshqariladi).
  function addCategory(restaurantId, nameUz, sort = 0) {
    const t = now();
    return Number(db.prepare(`
      INSERT INTO menu_categories (restaurant_id, name_uz, sort, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
    `).run(restaurantId, v.str(nameUz, 'name_uz', { max: 80 }), sort, t, t).lastInsertRowid);
  }

  function addProduct(restaurantId, { categoryId = null, name, price, oldPrice = null, portion = null }) {
    const t = now();
    return Number(db.prepare(`
      INSERT INTO products (restaurant_id, category_id, name_uz, price, old_price, portion, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      restaurantId, categoryId, v.str(name, 'name', { max: 120 }),
      v.money(price, 'price'), v.money(oldPrice, 'old_price', { optional: true }), portion, t, t,
    ).lastInsertRowid);
  }

  function setProductPrice(restaurantId, productId, price) {
    db.prepare('UPDATE products SET price = ?, updated_at = ? WHERE id = ? AND restaurant_id = ?')
      .run(v.money(price, 'price'), now(), productId, restaurantId);
  }

  return {
    getRaw, getForPanel, create, listAll, updatePayment, updatePaymentMethods,
    statusCounts,
    listForPoint, getPublic, assertCanDeliver, updateLocation,
    addStaff, addCourier, addCategory, addProduct, setProductPrice,
    tx: (fn) => tx(db, fn),
  };
}
