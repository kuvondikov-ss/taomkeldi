// Mijoz katalogi: bosh sahifa ro'yxati (oshxona turi, aksiya, saralash), qidiruv, sevimlilar, menyu.
// Barcha ro'yxatlar faqat tanlangan nuqtaga YETKAZADIGAN faol restoranlardan tuziladi.
import { now } from '../db/index.js';
import { AppError } from '../lib/errors.js';
import * as v from '../lib/validate.js';

export const SORTS = ['recommended', 'rating', 'fast', 'cheap_delivery'];

// Qidiruv uchun matnni bir xillashtirish: kichik harf, o'zbekcha apostrof turlari bitta.
export function normalize(s) {
  return String(s ?? '').normalize('NFC').toLowerCase().replace(/[ʻʼ‘’`´]/g, "'").replace(/\s+/g, ' ').trim();
}

const rating = (r) => (r.rating_count > 0 ? { value: Math.round((r.rating_sum / r.rating_count) * 10) / 10, count: r.rating_count } : null);

export function createCatalogService(db, geo, access) {
  const cuisinesOf = db.prepare(`
    SELECT c.id, c.slug, c.name_uz, c.name_ru FROM restaurant_cuisines rc JOIN cuisines c ON c.id = rc.cuisine_id
    WHERE rc.restaurant_id = ? ORDER BY c.sort
  `);
  const promoStmt = db.prepare(`
    SELECT 1 FROM products WHERE restaurant_id = ? AND is_deleted = 0 AND is_available = 1
      AND old_price IS NOT NULL AND old_price > price LIMIT 1
  `);
  const favStmt = db.prepare('SELECT 1 FROM favorites WHERE user_id = ? AND restaurant_id = ?');

  function card(r, delivery, actor) {
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      cover_path: r.cover_path,
      logo_path: r.logo_path,
      is_open: r.is_open === 1,
      min_order: r.min_order,
      free_delivery_from: r.free_delivery_from,
      cuisines: cuisinesOf.all(r.id).map((c) => ({ ...c })),
      rating: rating(r),
      has_promo: !!promoStmt.get(r.id),
      is_favorite: actor ? !!favStmt.get(actor.id, r.id) : false,
      delivery,
    };
  }

  // Nuqtaga yetkazadigan faol restoranlar (filtrsiz) — kartochka ko'rinishida.
  function deliverableCards(actor, point) {
    const rows = db.prepare("SELECT * FROM restaurants WHERE status = 'active' AND lat IS NOT NULL AND lon IS NOT NULL").all();
    return rows
      .map((r) => ({ r, d: geo.deliveryFor(r, point) }))
      .filter(({ d }) => d.deliverable)
      .map(({ r, d }) => card(r, d, actor));
  }

  const SORTERS = {
    // Tavsiya: ochiqlari oldin; keyin reytingi borlari (baho × ishonch), keyin yaqinroq.
    recommended: (a, b) => (b.is_open - a.is_open)
      || ((b.rating ? b.rating.value * Math.min(1, b.rating.count / 10) : 0) - (a.rating ? a.rating.value * Math.min(1, a.rating.count / 10) : 0))
      || (a.delivery.distance_m - b.delivery.distance_m),
    // Reyting: baholanganlar yuqori bahodan; baholanmaganlar oxirida.
    rating: (a, b) => (b.is_open - a.is_open)
      || ((b.rating ? 1 : 0) - (a.rating ? 1 : 0))
      || ((b.rating?.value ?? 0) - (a.rating?.value ?? 0))
      || ((b.rating?.count ?? 0) - (a.rating?.count ?? 0)),
    // Tez yetkazish: taxminiy vaqt bo'yicha.
    fast: (a, b) => (b.is_open - a.is_open) || (a.delivery.eta_min.from - b.delivery.eta_min.from) || (a.delivery.distance_m - b.delivery.distance_m),
    // Arzon yetkazish: yetkazish NARXI bo'yicha (bu "bepul yetkazish" bo'limi emas — 16-bosqich).
    cheap_delivery: (a, b) => (b.is_open - a.is_open) || (a.delivery.delivery_fee - b.delivery.delivery_fee) || (a.delivery.distance_m - b.delivery.distance_m),
  };

  // Bosh sahifa ro'yxati. cuisines — shu nuqtadagi restoranlarda MAVJUD oshxona turlari (filtrdan oldin).
  function home(actor, point, { cuisine, promo, sort = 'recommended' } = {}) {
    v.oneOf(sort, 'sort', SORTS);
    const all = deliverableCards(actor, point);
    const facet = new Map();
    for (const r of all) for (const c of r.cuisines) facet.set(c.id, c);
    const cuisines = [...facet.values()].sort((a, b) => a.id - b.id);
    let list = all;
    if (cuisine) {
      const cid = v.id(cuisine, 'cuisine');
      list = list.filter((r) => r.cuisines.some((c) => c.id === cid));
    }
    if (promo === true || promo === '1' || promo === 'true') list = list.filter((r) => r.has_promo);
    list.sort(SORTERS[sort]);
    return { restaurants: list, cuisines, total_in_area: all.length };
  }

  // Qidiruv: restoran nomi va taom nomi (uz/ru). Faqat shu nuqtaga yetkazadigan restoranlar.
  function search(actor, point, q) {
    const query = normalize(v.str(q, 'q', { min: 2, max: 80 }));
    const cards = deliverableCards(actor, point);
    const byId = new Map(cards.map((c) => [c.id, c]));
    const restaurants = cards.filter((c) => normalize(c.name).includes(query)
      || c.cuisines.some((cu) => normalize(cu.name_uz).includes(query) || normalize(cu.name_ru).includes(query)));
    let products = [];
    if (byId.size) {
      const ids = [...byId.keys()];
      const rows = db.prepare(`
        SELECT p.id, p.restaurant_id, p.category_id, p.name_uz, p.name_ru, p.price, p.old_price, p.portion, p.image_path, p.is_available
        FROM products p WHERE p.is_deleted = 0 AND p.restaurant_id IN (${ids.map(() => '?').join(',')})
      `).all(...ids);
      products = rows
        .filter((p) => normalize(p.name_uz).includes(query) || normalize(p.name_ru).includes(query))
        .sort((a, b) => (b.is_available - a.is_available) || (byId.get(b.restaurant_id).is_open - byId.get(a.restaurant_id).is_open))
        .slice(0, 30)
        .map((p) => ({ ...p, is_available: p.is_available === 1, restaurant_name: byId.get(p.restaurant_id).name, restaurant_is_open: byId.get(p.restaurant_id).is_open }));
    }
    return { restaurants: restaurants.sort(SORTERS.recommended).slice(0, 20), products };
  }

  // Bitta restoran sahifasi + menyu (7-bosqichda kengayadi). Faol bo'lmasa — topilmadi.
  function restaurant(actor, restaurantId, point) {
    const r = db.prepare('SELECT * FROM restaurants WHERE id = ?').get(restaurantId);
    if (!r || r.status !== 'active') throw new AppError('NOT_FOUND');
    const categories = db.prepare(`
      SELECT id, name_uz, name_ru, sort FROM menu_categories WHERE restaurant_id = ? AND is_active = 1 ORDER BY sort, id
    `).all(r.id).map((c) => ({ ...c }));
    const products = db.prepare(`
      SELECT id, category_id, name_uz, name_ru, description_uz, description_ru, portion, price, old_price, image_path, is_available, is_popular
      FROM products WHERE restaurant_id = ? AND is_deleted = 0 ORDER BY sort, id
    `).all(r.id).map((p) => ({ ...p, is_available: p.is_available === 1, is_popular: p.is_popular === 1 }));
    return { ...card(r, geo.deliveryFor(r, point), actor), address_text: r.address_text, work_hours: r.work_hours, categories, products };
  }

  // --- Sevimlilar ---
  function favorites(actor, point) {
    const ids = db.prepare('SELECT restaurant_id FROM favorites WHERE user_id = ? ORDER BY created_at DESC').all(actor.id).map((x) => x.restaurant_id);
    const out = [];
    for (const id of ids) {
      const r = db.prepare("SELECT * FROM restaurants WHERE id = ? AND status = 'active'").get(id);
      if (r) out.push(card(r, geo.deliveryFor(r, point), actor)); // yetkazmasa ham ko'rinadi, deliverable=false bilan
    }
    return out;
  }

  function setFavorite(actor, restaurantId, on) {
    const r = db.prepare("SELECT id FROM restaurants WHERE id = ? AND status = 'active'").get(v.id(restaurantId));
    if (!r) throw new AppError('NOT_FOUND');
    if (on) db.prepare('INSERT OR IGNORE INTO favorites (user_id, restaurant_id, created_at) VALUES (?, ?, ?)').run(actor.id, r.id, now());
    else db.prepare('DELETE FROM favorites WHERE user_id = ? AND restaurant_id = ?').run(actor.id, r.id);
    return { restaurant_id: r.id, is_favorite: on };
  }

  // --- Oshxona turlari ---
  function allCuisines() {
    return db.prepare('SELECT id, slug, name_uz, name_ru FROM cuisines ORDER BY sort, id').all().map((c) => ({ ...c }));
  }

  function setRestaurantCuisines(actor, restaurantId, cuisineIds) {
    access.requireRestaurantStaff(actor, restaurantId);
    if (!db.prepare('SELECT 1 FROM restaurants WHERE id = ?').get(restaurantId)) throw new AppError('NOT_FOUND');
    if (!Array.isArray(cuisineIds) || cuisineIds.length > 5) throw new AppError('VALIDATION', { details: { field: 'cuisine_ids' } });
    const ids = [...new Set(cuisineIds.map((x) => v.id(x, 'cuisine_ids')))];
    const known = db.prepare(`SELECT COUNT(*) AS n FROM cuisines WHERE id IN (${ids.map(() => '?').join(',') || 'NULL'})`).get(...ids).n;
    if (known !== ids.length) throw new AppError('VALIDATION', { details: { field: 'cuisine_ids' } });
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('DELETE FROM restaurant_cuisines WHERE restaurant_id = ?').run(restaurantId);
      const ins = db.prepare('INSERT INTO restaurant_cuisines (restaurant_id, cuisine_id) VALUES (?, ?)');
      for (const id of ids) ins.run(restaurantId, id);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    return cuisinesOf.all(restaurantId).map((c) => ({ ...c }));
  }

  return { home, search, restaurant, favorites, setFavorite, allCuisines, setRestaurantCuisines };
}
