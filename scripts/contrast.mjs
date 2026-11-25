// tokens.css dagi rang juftliklarining WCAG kontrastini hisoblaydi (yorug' va to'q mavzu).
//   node scripts/contrast.mjs        — jadval; AA'dan o'tmasa exit 1
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../public/css/tokens.css', import.meta.url), 'utf8');

function block(selectorRe) {
  const m = css.match(selectorRe);
  if (!m) throw new Error(`Blok topilmadi: ${selectorRe}`);
  const vars = {};
  for (const [, k, v] of m[1].matchAll(/(--[\w-]+):\s*([^;]+);/g)) vars[k] = v.trim();
  return vars;
}

const root = block(/:root\s*\{([\s\S]*?)\n\}/);
const dark = { ...root, ...block(/:root\[data-theme="dark"\]\s*\{([\s\S]*?)\n\}/) };

function resolve(vars, v, depth = 0) {
  const m = v.match(/^var\((--[\w-]+)\)$/);
  if (m && depth < 10) return resolve(vars, vars[m[1]], depth + 1);
  return v;
}
function lum(hex) {
  const n = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a, b) {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

// [old fon, matn, minimal talab, izoh]. 4.5 — oddiy matn (AA), 3 — katta/qalin matn va ikonkalar.
const PAIRS = [
  ['--bg', '--text', 4.5, 'asosiy matn'],
  ['--bg', '--text-2', 4.5, 'yordamchi matn'],
  ['--surface', '--text', 4.5, 'karta matni'],
  ['--surface', '--text-2', 4.5, 'karta yordamchi matni'],
  ['--surface-2', '--text-2', 4.5, 'qidiruv placeholder / chip'],
  ['--primary', '--on-primary', 4.5, 'asosiy tugma'],
  ['--secondary', '--on-secondary', 4.5, 'ikkinchi tugma'],
  ['--danger-bg', '--danger', 4.5, 'rad etish / xato'],
  ['--surface', '--success', 4.5, 'bepul yetkazish matni kartada (.free-text)'],
  ['--surface', '--warning', 4.5, 'ogohlantirish matni kartada (.warn-text)'],
  ['--surface', '--danger', 4.5, 'xato matni kartada (.danger-text)'],
  ['--surface-2', '--success', 4.5, 'bepul yetkazish matni kulrang blokda'],
  ['--surface-2', '--text', 4.5, 'kulrang blok matni (summa, kuryer vazifasi)'],
  ['--success-bg', '--success', 4.5, 'muvaffaqiyat'],
  ['--warning-bg', '--warning', 4.5, 'ogohlantirish'],
  ['--surface', '--primary', 4.5, 'faol navigatsiya yozuvi'],
  ['--surface', '--brand', 3, 'faol tab chizig\'i (bezak, matn emas)'],
  ['--bg', '--focus', 3, 'fokus halqasi'],
  ['--surface', '--border', 1.2, 'chegara (bezak)'],
  ['--banner-bg', '--on-banner', 4.5, 'banner sarlavhasi'],
  ['--banner-cta', '--on-banner-cta', 4.5, 'banner tugmasi'],
];

let failed = 0;
for (const [name, vars] of [['Yorug\'', root], ['To\'q', dark]]) {
  console.log(`\n${name} mavzu`);
  for (const [bgK, fgK, min, note] of PAIRS) {
    const bg = resolve(vars, vars[bgK]);
    const fg = resolve(vars, vars[fgK]);
    const r = ratio(bg, fg);
    const ok = r >= min;
    if (!ok) failed++;
    console.log(`${ok ? 'OK  ' : 'XATO'} ${r.toFixed(2).padStart(5)} (≥${min})  ${fgK} / ${bgK}  ${fg} on ${bg}  — ${note}`);
  }
}
if (failed) {
  console.log(`\n${failed} ta juftlik talabdan past.`);
  process.exit(1);
}
console.log('\nBarcha juftliklar talabga mos.');
