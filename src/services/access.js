// Rollar va kirish huquqlari. Barcha tekshiruvlar serverda, restoran doirasida.
//
// actor — users jadvalidagi yozuv (initData yoki bot update orqali aniqlangan).
import { AppError } from '../lib/errors.js';

export function createAccessService(db, config) {
  const staffStmt = db.prepare(`
    SELECT role FROM staff WHERE user_id = ? AND restaurant_id = ? AND status = 'active'
  `);
  const courierRowsStmt = db.prepare(`
    SELECT id, restaurant_id FROM couriers WHERE user_id = ? AND status = 'active'
  `);

  // Production'da faqat aniq berilgan ID'lar. DB'dagi bayroq faqat test/bootstrap muhitida hisoblanadi.
  function isPlatformAdmin(actor) {
    if (!actor) return false;
    if (config.platformAdminIds.includes(actor.id)) return true;
    return !config.isProduction && actor.is_platform_admin === 1;
  }

  function staffRole(actor, restaurantId) {
    if (!actor) return null;
    return staffStmt.get(actor.id, restaurantId)?.role || null;
  }

  function courierRows(actor) {
    return actor ? courierRowsStmt.all(actor.id) : [];
  }

  function rolesOf(actor) {
    const staff = db.prepare(`
      SELECT s.restaurant_id AS restaurantId, s.role, r.name AS restaurantName, r.status AS restaurantStatus
      FROM staff s JOIN restaurants r ON r.id = s.restaurant_id
      WHERE s.user_id = ? AND s.status = 'active' ORDER BY r.name
    `).all(actor.id);
    const courier = db.prepare(`
      SELECT c.id AS courierId, c.restaurant_id AS restaurantId, r.name AS restaurantName, c.is_online AS isOnline
      FROM couriers c JOIN restaurants r ON r.id = c.restaurant_id
      WHERE c.user_id = ? AND c.status = 'active' ORDER BY r.name
    `).all(actor.id);
    return { platformAdmin: isPlatformAdmin(actor), staff, courier };
  }

  // Restoran paneli: ega yoki menejer (yoki platforma admini). ownerOnly — faqat ega.
  // Qaytaradi: 'owner' | 'manager' | 'admin'.
  function requireRestaurantStaff(actor, restaurantId, { ownerOnly = false, allowAdmin = true } = {}) {
    if (!actor) throw new AppError('AUTH_REQUIRED');
    const role = staffRole(actor, restaurantId);
    if (ownerOnly) {
      if (role === 'owner') return role;
      if (role === 'manager') throw new AppError('OWNER_ONLY');
      throw new AppError('FORBIDDEN');
    }
    if (role) return role;
    if (allowAdmin && isPlatformAdmin(actor)) return 'admin';
    throw new AppError('FORBIDDEN');
  }

  function requirePlatformAdmin(actor) {
    if (!actor) throw new AppError('AUTH_REQUIRED');
    if (!isPlatformAdmin(actor)) throw new AppError('FORBIDDEN');
  }

  // Buyurtmani kim ko'ra oladi va qaysi rolda.
  // null — ko'ra olmaydi (API buni 404 qilib qaytaradi, mavjudligini oshkor qilmaslik uchun).
  function orderViewRole(actor, order) {
    if (!actor || !order) return null;
    if (order.customer_id === actor.id) return 'customer';
    const sRole = staffRole(actor, order.restaurant_id);
    if (sRole) return sRole;
    if (order.courier_id) {
      const mine = courierRows(actor).some(
        (c) => c.id === order.courier_id && c.restaurant_id === order.restaurant_id,
      );
      if (mine) return 'courier';
    }
    if (isPlatformAdmin(actor)) return 'admin';
    return null;
  }

  return {
    isPlatformAdmin, staffRole, courierRows, rolesOf,
    requireRestaurantStaff, requirePlatformAdmin, orderViewRole,
  };
}
