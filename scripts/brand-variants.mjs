// Original Taomkeldi logosidan variantlar yasaydi. Shakl (path geometriyasi) o'zgartirilmaydi:
// faqat viewBox (kesish) va ayrim rang qiymatlari almashtiriladi.
//   node scripts/brand-variants.mjs
import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve('public/brand');
const src = fs.readFileSync(path.join(dir, 'taomkeldi-original.svg'), 'utf8');

// Har bir rangli qismning chegaralari (tekshirish uchun).
const parts = [...src.matchAll(/<path fill="(#[0-9A-Fa-f]+)"[^>]*d="([^"]+)"[^>]*\/>/g)].map((m) => {
  const n = [...m[2].matchAll(/-?\d+(?:\.\d+)?/g)].map((x) => Number(x[0]));
  const xs = n.filter((_, i) => i % 2 === 0);
  const ys = n.filter((_, i) => i % 2 === 1);
  return { fill: m[1], tag: m[0], minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
});
for (const p of parts) console.log(p.fill, `x ${p.minX}..${p.maxX}`, `y ${p.minY}..${p.maxY}`);

const svgOpen = (viewBox) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">`;
const fullBody = src.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');

// 1) To'liq logo, yorug' fon uchun — original.
fs.writeFileSync(path.join(dir, 'taomkeldi-full-light.svg'), src);

// 2) To'liq logo, to'q fon uchun — faqat qora yozuv rangi krem rangga almashtiriladi.
fs.writeFileSync(path.join(dir, 'taomkeldi-full-dark.svg'), src.replace('fill="#232323"', 'fill="#F3F1EA"'));

// 3) Belgi (mark) — faqat yashil ramz, kvadrat maydon markazida.
const mark = parts.find((p) => p.fill.toUpperCase() === '#679C76');
const pad = 12;
const w = mark.maxX - mark.minX + pad * 2;
const h = mark.maxY - mark.minY + pad * 2;
const side = Math.max(w, h);
const cx = (mark.minX + mark.maxX) / 2;
const cy = (mark.minY + mark.maxY) / 2;
const squareVB = `${cx - side / 2} ${cy - side / 2} ${side} ${side}`;
fs.writeFileSync(path.join(dir, 'taomkeldi-mark.svg'), `${svgOpen(squareVB)}${mark.tag}</svg>\n`);

// 4) Favikon / avatar: belgi krem fonda, aylana.
const r = side / 2;
fs.writeFileSync(
  path.join(dir, 'taomkeldi-favicon.svg'),
  `${svgOpen(squareVB)}<circle cx="${cx}" cy="${cy}" r="${r}" fill="#F3F1EA"/>` +
    `<g transform="translate(${cx} ${cy}) scale(0.86) translate(${-cx} ${-cy})">${mark.tag}</g></svg>\n`,
);

// 5) Header uchun ixcham variant: ramz + yozuv (pastki shior tasmasisiz).
const text = parts.find((p) => p.fill === '#232323');
const minY = mark.minY - pad;
const maxY = text.maxY + pad;
const minX = Math.min(mark.minX, text.minX) - pad;
const maxX = Math.max(mark.maxX, text.maxX) + pad;
const compactVB = `${minX} ${minY} ${maxX - minX} ${maxY - minY}`;
const compact = `${svgOpen(compactVB)}${mark.tag}${text.tag}</svg>\n`;
fs.writeFileSync(path.join(dir, 'taomkeldi-compact-light.svg'), compact);
fs.writeFileSync(path.join(dir, 'taomkeldi-compact-dark.svg'), compact.replace('fill="#232323"', 'fill="#F3F1EA"'));

// 6) Bot avatari va apple-touch ikonka (PNG). Telegram avatarni aylana qilib kesadi,
//    shuning uchun belgi markazda, chetlarida bo'sh joy bilan.
const { Resvg } = await import('@resvg/resvg-js');
const avatarSvg = (bg, scale) =>
  `${svgOpen(squareVB)}<rect x="${cx - side / 2}" y="${cy - side / 2}" width="${side}" height="${side}" fill="${bg}"/>` +
  `<g transform="translate(${cx} ${cy}) scale(${scale}) translate(${-cx} ${-cy})">${mark.tag}</g></svg>`;
const png = (svg, size) => new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
fs.writeFileSync(path.join(dir, 'taomkeldi-avatar-512.png'), png(avatarSvg('#EFF5EC', 0.84), 512));
fs.writeFileSync(path.join(dir, 'apple-touch-icon.png'), png(avatarSvg('#EFF5EC', 0.8), 180));

// 7) Rasm yo'q bo'lganda: neytral taom belgisi (4:3), fon shaffof — fonni konteyner (--surface-2) beradi.
fs.writeFileSync(
  path.join(dir, 'placeholder.svg'),
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">' +
    '<g transform="translate(164 114) scale(3)" fill="none" stroke="#9C978A" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M3 17h18M5 17a7 7 0 0 1 14 0"/><path d="M12 8V6.5M10.5 6.5h3"/></g></svg>\n',
);

console.log('Tayyor:', fs.readdirSync(dir).join(', '));
void fullBody;
