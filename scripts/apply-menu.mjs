// Restoran va menyusini production'ga qo'llash (admin CLI orqali). Idempotent: nom bo'yicha topadi, takror yaratmaydi.
//   node scripts/apply-menu.mjs scripts/menus/<restoran>.json            — qo'llash
//   node scripts/apply-menu.mjs scripts/menus/<restoran>.json --dry-run  — faqat nima qilinishini ko'rsatadi
//
// JSON:
//   restaurant: { name, description, status: "active"|"pending", cuisines: [nom_uz...], cover: "<lokal rasm>",
//                 profile: { address_text, phone, lat, lon, delivery_base, delivery_base_m, delivery_per_km, delivery_radius_m, min_order, ... } }
//   categories: [{ name_uz, name_ru, items: [{ name_uz, name_ru, portion, price, description_uz, image: "<lokal rasm>" }] }]
// Taom faqat "price" (> 0) berilganda yaratiladi yoki narxi yangilanadi; narxsiz taom — "narx kutilmoqda" ro'yxatida.
// Rasm faqat bir marta yuklanadi: restoranda muqova yoki taomda rasm allaqachon bo'lsa — qayta yuklanmaydi.
import fs from 'node:fs';
import { adminClient } from './prod-admin.mjs';

const file = process.argv[2];
const dry = process.argv.includes('--dry-run');
if (!file) { console.error('Ishlatish: node scripts/apply-menu.mjs <menu.json> [--dry-run]'); process.exit(1); }
const menu = JSON.parse(fs.readFileSync(file, 'utf8'));
const call = adminClient();
const log = (...a) => console.log(...a);
const R = menu.restaurant;
const upload = async (rid, localPath) => (await call('POST', `/api/panel/restaurants/${rid}/uploads`, fs.readFileSync(localPath))).file.path;

// 1) Restoran (nom bo'yicha).
const all = (await call('GET', '/api/admin/restaurants/list')).restaurants || [];
let r = all.find((x) => x.name === R.name);
if (!r) {
  if (dry) { log(`[dry] restoran yaratiladi: ${R.name} (${R.status || 'pending'})`); process.exit(0); }
  r = (await call('POST', '/api/admin/restaurants', { name: R.name, description: R.description, status: R.status })).restaurant;
  log(`✓ restoran yaratildi: #${r.id} ${r.name} (holati: ${r.status})`);
} else log(`= restoran bor: #${r.id} ${r.name} (holati: ${r.status})`);
const rid = r.id;

// 2) Profil (manzil, yetkazish) va muqova.
const panel = (await call('GET', `/api/panel/restaurants/${rid}`)).restaurant;
const profile = { ...(R.profile || {}) };
if (R.description) profile.description = R.description;
if (R.cover && !panel.cover_path) profile.cover_path = dry ? '(yuklanadi)' : await upload(rid, R.cover);
if (Object.keys(profile).length) {
  if (!dry) await call('PUT', `/api/panel/restaurants/${rid}/profile`, profile);
  log(`${dry ? '[dry] ' : '✓ '}profil: ${Object.keys(profile).join(', ')}`);
}

// 3) Oshxona turlari.
if (R.cuisines?.length) {
  const cs = (await call('GET', '/api/cuisines')).cuisines;
  const ids = R.cuisines.map((n) => cs.find((c) => c.name_uz === n)?.id).filter(Boolean);
  if (!dry && ids.length) await call('PUT', `/api/panel/restaurants/${rid}/cuisines`, { cuisine_ids: ids });
  log(`${dry ? '[dry] ' : '✓ '}oshxona turlari: ${R.cuisines.join(', ')}`);
}

// 4) Kategoriyalar va taomlar.
let m = await call('GET', `/api/panel/restaurants/${rid}/menu`);
const waiting = [];
for (const c of menu.categories || []) {
  let cat = m.categories.find((x) => x.name_uz === c.name_uz);
  if (!cat) {
    if (dry) { log(`[dry] kategoriya: ${c.name_uz}`); cat = { id: null }; } else {
      const { id } = await call('POST', `/api/panel/restaurants/${rid}/categories`, { name_uz: c.name_uz, name_ru: c.name_ru });
      cat = { id };
      log(`✓ kategoriya: ${c.name_uz}`);
    }
  }
  for (const it of c.items || []) {
    const ex = (m.products || []).find((p) => p.name_uz === it.name_uz);
    if (!it.price) { if (!ex) waiting.push(`${c.name_uz} → ${it.name_uz}${it.portion ? ` (${it.portion})` : ''}${it.image ? ' 📷' : ''}`); continue; }
    if (dry) { log(`[dry] ${ex ? 'yangilanadi' : 'taom'}: ${it.name_uz} — ${it.price}`); continue; }
    const image_path = ex?.image_path || (it.image ? await upload(rid, it.image) : undefined);
    // "Maxsus" masalliqlari: mavjudlari nom bo'yicha id bilan yuboriladi (savatdagi tanlovlar yaroqli qoladi).
    const F = ['name_uz', 'name_ru', 'unit', 'std_qty', 'min_qty', 'max_qty', 'step', 'step_price'];
    const pick = (g) => Object.fromEntries(F.map((k) => [k, g[k] ?? null]));
    const ingredients = it.ingredients ? it.ingredients.map((g) => {
      const old = (ex?.ingredients || []).find((x) => x.name_uz === g.name_uz);
      return { ...(old ? { id: old.id } : {}), ...g };
    }) : undefined;
    const ingChanged = ingredients !== undefined && JSON.stringify((ex?.ingredients || []).map(pick)) !== JSON.stringify(ingredients.map(pick));
    const body = { category_id: cat.id, name_uz: it.name_uz, name_ru: it.name_ru, portion: it.portion, price: it.price,
      description_uz: it.description_uz, description_ru: it.description_ru, image_path,
      ...(it.cook_style !== undefined ? { cook_style: it.cook_style } : {}), ...(it.prep_seconds !== undefined ? { prep_seconds: it.prep_seconds } : {}),
      ...(ingredients !== undefined ? { ingredients } : {}) };
    if (ex) {
      if (ex.price !== it.price || ex.portion !== it.portion || (image_path && ex.image_path !== image_path) || ingChanged
        || (it.cook_style !== undefined && ex.cook_style !== it.cook_style)) {
        await call('PUT', `/api/panel/restaurants/${rid}/products/${ex.id}`, { ...body, is_available: ex.is_available !== 0 });
        log(`✓ yangilandi: ${it.name_uz} — ${it.price} so'm`);
      }
    } else {
      await call('POST', `/api/panel/restaurants/${rid}/products`, body);
      log(`✓ taom: ${it.name_uz} — ${it.price} so'm${image_path ? ' (rasm bilan)' : ''}`);
    }
  }
}
m = await call('GET', `/api/panel/restaurants/${rid}/menu`);
log(`\n#${rid} ${R.name}: ${m.categories.length} kategoriya, ${(m.products || []).length} taom.`);
if (waiting.length) log(`Narx kutilmoqda (${waiting.length}):\n  ${waiting.join('\n  ')}`);
