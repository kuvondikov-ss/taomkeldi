// Restoran menyusini production'ga qo'llash (admin CLI orqali, idempotent — nom bo'yicha tekshiradi, takror yaratmaydi).
//   node scripts/apply-menu.mjs scripts/menus/taomkeldi.json            — restoran + kategoriyalar (+ narxi berilgan taomlar)
//   node scripts/apply-menu.mjs scripts/menus/taomkeldi.json --dry-run  — faqat nima qilinishini ko'rsatadi
// Taom faqat "price" (> 0) berilganda yaratiladi yoki narxi yangilanadi; narxsiz taom — ro'yxatda "narx kutilmoqda".
import fs from 'node:fs';
import { adminClient } from './prod-admin.mjs';

const file = process.argv[2];
const dry = process.argv.includes('--dry-run');
if (!file) { console.error('Ishlatish: node scripts/apply-menu.mjs <menu.json> [--dry-run]'); process.exit(1); }
const menu = JSON.parse(fs.readFileSync(file, 'utf8'));
const call = adminClient();
const log = (...a) => console.log(...a);

// 1) Restoran (nom bo'yicha). Yangi restoran "pending" — mijozlarga ko'rinmaydi, tayyor bo'lgach faollashtiriladi.
const all = (await call('GET', '/api/admin/restaurants/list')).restaurants || [];
let r = all.find((x) => x.name === menu.restaurant.name);
if (!r) {
  if (dry) { log(`[dry] restoran yaratiladi: ${menu.restaurant.name}`); process.exit(0); }
  r = (await call('POST', '/api/admin/restaurants', { name: menu.restaurant.name, description: menu.restaurant.description })).restaurant;
  log(`✓ restoran yaratildi: #${r.id} ${r.name} (holati: ${r.status})`);
} else log(`= restoran bor: #${r.id} ${r.name} (holati: ${r.status})`);
const rid = r.id;

// 2) Oshxona turlari.
if (menu.restaurant.cuisines?.length) {
  const cs = (await call('GET', '/api/cuisines')).cuisines;
  const ids = menu.restaurant.cuisines.map((n) => cs.find((c) => c.name_uz === n)?.id).filter(Boolean);
  if (!dry && ids.length) await call('PUT', `/api/panel/restaurants/${rid}/cuisines`, { cuisine_ids: ids });
  log(`${dry ? '[dry] ' : '✓ '}oshxona turlari: ${menu.restaurant.cuisines.join(', ')}`);
}

// 3) Kategoriyalar va taomlar.
let m = await call('GET', `/api/panel/restaurants/${rid}/menu`);
const waiting = [];
for (const c of menu.categories) {
  let cat = m.categories.find((x) => x.name_uz === c.name_uz);
  if (!cat) {
    if (dry) { log(`[dry] kategoriya: ${c.name_uz}`); cat = { id: null }; } else {
      const { id } = await call('POST', `/api/panel/restaurants/${rid}/categories`, { name_uz: c.name_uz, name_ru: c.name_ru });
      cat = { id };
      log(`✓ kategoriya: ${c.name_uz}`);
    }
  }
  for (const it of c.items) {
    const ex = (m.products || []).find((p) => p.name_uz === it.name_uz);
    if (!it.price) { if (!ex) waiting.push(`${c.name_uz} → ${it.name_uz} (${it.portion})`); continue; }
    const body = { category_id: cat.id, name_uz: it.name_uz, name_ru: it.name_ru, portion: it.portion, price: it.price, description_uz: it.description_uz, description_ru: it.description_ru };
    if (dry) { log(`[dry] ${ex ? 'narx yangilanadi' : 'taom'}: ${it.name_uz} — ${it.price}`); continue; }
    if (ex) {
      if (ex.price !== it.price || ex.portion !== it.portion) {
        await call('PUT', `/api/panel/restaurants/${rid}/products/${ex.id}`, { ...body, is_available: ex.is_available !== 0 });
        log(`✓ yangilandi: ${it.name_uz} — ${it.price} so'm`);
      }
    } else {
      await call('POST', `/api/panel/restaurants/${rid}/products`, body);
      log(`✓ taom: ${it.name_uz} — ${it.price} so'm`);
    }
  }
}
m = await call('GET', `/api/panel/restaurants/${rid}/menu`);
log(`\nMenyu: ${m.categories.length} kategoriya, ${(m.products || []).length} taom.`);
if (waiting.length) log(`Narx kutilmoqda (${waiting.length}):\n  ${waiting.join('\n  ')}`);
