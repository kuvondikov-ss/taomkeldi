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
console.log('Tayyor. Brauzerda: http://localhost:3917/?dev=301');
db.close();
