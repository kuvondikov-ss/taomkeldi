// Restoran menyusi uchun rasmlarni tayyorlash (foydalanuvchi bergan manba rasmlardan).
// Natija: assets/menus/<restoran>/*.webp — muqova 16:9 (1280×720), taom 4:3 (1024×768), shaffof fon saqlanadi.
//   node scripts/menu-images.mjs <manba_papka>
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const src = process.argv[2];
if (!src) { console.error('Ishlatish: node scripts/menu-images.mjs <manba_papka>'); process.exit(1); }
const out = (r, n) => { const d = path.join('assets', 'menus', r); fs.mkdirSync(d, { recursive: true }); return path.join(d, n); };
const T = { r: 0, g: 0, b: 0, alpha: 0 };
const webp = (img) => img.webp({ quality: 82, alphaQuality: 90 });

// Muqova: kesib to'ldirish (16:9).
const cover = (file, r, n, position = 'centre') => webp(sharp(path.join(src, file)).resize(1280, 720, { fit: 'cover', position })).toFile(out(r, n));
// Taom: butunlay sig'dirish (4:3), shaffof chet.
const dish = (img, r, n) => webp(img.resize(1024, 768, { fit: 'contain', background: T })).toFile(out(r, n));

await cover('6.webp', 'yaponamama', 'cover.webp');
await dish(sharp(path.join(src, '6.webp')), 'yaponamama', 'kema-seti.webp');

await cover('11.webp', 'eshonbobo', 'cover.webp');
await dish(sharp(path.join(src, '11.webp')), 'eshonbobo', 'osh.webp');

// Shashliklar: 10.webp dagi 7 ta sixni ajratish (shaffof fon bo'yicha topilgan ustunlar), diagonal qo'yib 4:3 ga sig'dirish.
const skewers = [
  ['mol-shashlik', 22, 221], ['tovuq-shashlik', 248, 431], ['qoy-qovurga', 451, 672, 0], ['sabzavotli-mol', 692, 886, 0],
  ['qiyma-kabob', 909, 1072], ['qoziqorin', 1114, 1274], ['sabzavotli', 1296, 1514],
];
for (const [name, x0, x1, pad = 6] of skewers) {
  const piece = await sharp(path.join(src, '10.webp')).extract({ left: Math.max(0, x0 - pad), top: 0, width: x1 - x0 + 2 * pad, height: 1024 }).png().toBuffer();
  const rotated = await sharp(piece).rotate(-52, { background: T }).png().toBuffer();
  const trimmed = await sharp(rotated).trim({ threshold: 1 }).png().toBuffer();
  await dish(sharp(trimmed), 'eshonbobo', `${name}.webp`);
}
for (const r of ['yaponamama', 'eshonbobo']) console.log(r, fs.readdirSync(path.join('assets', 'menus', r)).join(', '));
