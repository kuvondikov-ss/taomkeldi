// FAQAT LOKAL: ko'rib chiqish uchun demo restoranlar. Production bazasida ishlatmang.
//   node --env-file=.env.preview scripts/seed-demo.mjs
import { loadConfig } from '../src/config.js';
import { openDb } from '../src/db/index.js';
import { createServices } from '../src/services/index.js';

const config = loadConfig();
if (config.isProduction) throw new Error('seed-demo production muhitida ishlamaydi');
const db = openDb(config.dbPath);
const s = createServices(db, config);

const ADMIN = 900;
s.users.upsertFromTelegram({ id: ADMIN, first_name: 'Demo admin' });
db.prepare('UPDATE users SET is_platform_admin = 1 WHERE id = ?').run(ADMIN);
const admin = s.users.get(ADMIN);

const demo = [
  { name: '[DEMO] Markaz Choyxonasi', lat: 40.1210, lon: 67.8400, radius: 6000, base: 8000, perKm: 2000, open: 1 },
  { name: '[DEMO] Yopiq Kafe', lat: 40.1100, lon: 67.8500, radius: 5000, base: 7000, perKm: 1500, open: 0 },
  { name: '[DEMO] Zomin Oshxonasi', lat: 39.9606, lon: 68.3958, radius: 5000, base: 6000, perKm: 2000, open: 1 },
];
for (const d of demo) {
  if (db.prepare('SELECT 1 FROM restaurants WHERE name = ?').get(d.name)) continue;
  const r = s.restaurants.create(admin, { name: d.name, status: 'active' });
  db.prepare('UPDATE restaurants SET lat = ?, lon = ?, delivery_radius_m = ?, delivery_base = ?, delivery_base_m = 2000, delivery_per_km = ?, is_open = ? WHERE id = ?')
    .run(d.lat, d.lon, d.radius, d.base, d.perKm, d.open, r.id);
  console.log('+', d.name);
}
// Oshxona turlari, menyu, aksiya va namunaviy (DEMO) baholar.
const byName = (n) => db.prepare('SELECT id FROM restaurants WHERE name = ?').get(n)?.id;
const cuisine = (slug) => db.prepare('SELECT id FROM cuisines WHERE slug = ?').get(slug).id;
const menus = {
  '[DEMO] Markaz Choyxonasi': { cuisines: ['milliy', 'shashlik'], rating: [46, 10], items: [['Osh', [['Choyxona oshi', 35000, 42000, '350 g'], ['To‘y oshi', 38000, null, '350 g']]], ['Shashlik', [['Qo‘y go‘shti shashlik', 18000, null, '1 six'], ['Jigar shashlik', 14000, null, '1 six']]], ['Ichimliklar', [['Ko‘k choy', 5000, null, '1 choynak']]]] },
  '[DEMO] Yopiq Kafe': { cuisines: ['fastfood', 'pitsa'], rating: null, items: [['Fast food', [['Burger', 32000, null, '1 dona'], ['Lavash', 28000, null, '1 dona']]]] },
  '[DEMO] Zomin Oshxonasi': { cuisines: ['milliy', 'somsa'], rating: [9, 2], items: [['Somsa', [['Tandir somsa', 8000, null, '1 dona']]]] },
};
for (const [name, m] of Object.entries(menus)) {
  const rid = byName(name);
  if (!rid || db.prepare('SELECT 1 FROM products WHERE restaurant_id = ?').get(rid)) continue;
  s.catalog.setRestaurantCuisines(admin, rid, m.cuisines.map(cuisine));
  if (m.rating) db.prepare('UPDATE restaurants SET rating_sum = ?, rating_count = ? WHERE id = ?').run(m.rating[0], m.rating[1], rid);
  for (const [cat, items] of m.items) {
    const cid = s.restaurants.addCategory(rid, cat);
    for (const [pn, price, old, portion] of items) s.restaurants.addProduct(rid, { categoryId: cid, name: pn, price, oldPrice: old, portion });
  }
}
// 7-bosqich ko'rinishlari uchun: ommabop, tugagan, uzun nom, tavsif, kategoriyasiz taom.
const markaz = byName('[DEMO] Markaz Choyxonasi');
if (markaz && !db.prepare("SELECT 1 FROM products WHERE restaurant_id = ? AND name_uz LIKE 'Maxsus%'").get(markaz)) {
  db.prepare("UPDATE products SET is_popular = 1, description_uz = 'Devzira guruch, qo‘y go‘shti, sabzi va no‘xat. Qozonda, o‘tinda pishiriladi.' WHERE restaurant_id = ? AND name_uz = 'Choyxona oshi'").run(markaz);
  db.prepare("UPDATE products SET is_available = 0 WHERE restaurant_id = ? AND name_uz = 'Jigar shashlik'").run(markaz);
  s.restaurants.addProduct(markaz, { name: 'Maxsus to‘y oshi bedana tuxumi va qazi bilan, katta oila uchun porsiya', price: 120000, portion: '1.5 kg' });
}
// 8-bosqich: olib ketish, telefon, manzil, minimal summa, bepul yetkazish sharti.
if (markaz) {
  db.prepare(`UPDATE restaurants SET pickup_enabled = 1, phone = '+998901112233', address_text = 'Jizzax sh., Sh. Rashidov ko‘chasi 5 (DEMO)',
    min_order = 30000, free_delivery_from = 100000 WHERE id = ?`).run(markaz);
}
// 9-bosqich: karta o'tkazmasi (DEMO karta).
if (markaz) db.prepare("UPDATE restaurants SET pay_card_transfer = 1, card_number = '8600000000000000', card_holder = 'DEMO KARTA' WHERE id = ?").run(markaz);
// 10-bosqich: demo belgisi. (Foydalanuvchi arizasi yopilgan — restoranlarni faqat admin qo'shadi.)
db.prepare("UPDATE restaurants SET is_demo = 1 WHERE name LIKE '[DEMO]%'").run();
// 11-bosqich: Markaz uchun demo ega (101) va ulangan kuryer (103).
if (markaz && !db.prepare('SELECT 1 FROM staff WHERE restaurant_id = ? AND user_id = 101').get(markaz)) {
  s.users.upsertFromTelegram({ id: 101, first_name: 'Demo ega' });
  s.users.upsertFromTelegram({ id: 103, first_name: 'Demo kuryer' });
  s.restaurants.addStaff(markaz, 101, 'owner', ADMIN);
  const cid = s.restaurants.addCourier(markaz, { userId: 103, name: 'Demo kuryer', phone: '+998901110000', transport: 'moto' });
  db.prepare('UPDATE couriers SET is_online = 1 WHERE id = ?').run(cid);
}
console.log('Tayyor. Brauzerda: http://localhost:3917/?dev=301 (ega: ?dev=101, admin: ?dev=900)');
db.close();
