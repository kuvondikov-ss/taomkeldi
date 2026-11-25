import { now, tx } from '../db/index.js';
import { AppError } from '../lib/errors.js';
import * as v from '../lib/validate.js';

export function createRestaurantService(db, access) {
  const getStmt = db.prepare('SELECT * FROM restaurants WHERE id = ?');

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
  function createApplication(user, data) {
    const name = v.str(data.name, 'name', { min: 2, max: 120 });
    const phone = v.str(data.phone, 'phone', { max: 32 });
    if (!/^\+?\d{9,15}$/.test(phone.replace(/[\s()-]/g, ''))) throw new AppError('VALIDATION', { details: { field: 'phone' } });
    return tx(db, () => {
      const pending = db.prepare("SELECT * FROM restaurants WHERE applicant_id = ? AND status = 'pending' ORDER BY id DESC LIMIT 1").get(user.id);
      if (pending) return { restaurant: pending, created: false };
      const t = now();
      const res = db.prepare(`
        INSERT INTO restaurants (name, phone, status, applicant_id, created_by, created_at, updated_at)
        VALUES (?, ?, 'pending', ?, ?, ?, ?)
      `).run(name, phone, user.id, user.id, t, t);
      return { restaurant: getRaw(Number(res.lastInsertRowid)), created: true };
    });
  }

  function pendingApplicationOf(user) {
    return db.prepare("SELECT * FROM restaurants WHERE applicant_id = ? AND status = 'pending' ORDER BY id DESC LIMIT 1").get(user.id) || null;
  }

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
    getRaw, getForPanel, create, listAll, updatePayment,
    createApplication, pendingApplicationOf, statusCounts,
    addStaff, addCourier, addCategory, addProduct, setProductPrice,
    tx: (fn) => tx(db, fn),
  };
}
