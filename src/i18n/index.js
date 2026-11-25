// Markaziy tarjimalar. t(lang, key, vars) — {name} o'rniga vars.name qo'yiladi.
// Bot xabarlari HTML: o'zgaruvchilar avtomatik escape qilinadi.
import uz from './uz.js';
import ru from './ru.js';

export const LOCALES = { uz, ru };
export const LANGS = ['uz', 'ru'];

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function t(lang, key, vars = {}) {
  const dict = LOCALES[lang] || uz;
  const template = dict[key] ?? uz[key];
  if (template === undefined) throw new Error(`Tarjima kaliti yo'q: ${key}`);
  return template.replace(/\{(\w+)\}/g, (_, k) => esc(vars[k]));
}

// Tugma matni qaysi kalitga tegishli (ikkala tilda ham taniydi).
export function keyOfLabel(text) {
  for (const lang of LANGS) {
    for (const [k, v] of Object.entries(LOCALES[lang])) {
      if (k.startsWith('btn_') && v === text) return k;
    }
  }
  return null;
}

export function formatSum(n, lang = 'uz') {
  const s = Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return lang === 'ru' ? `${s} сум` : `${s} so‘m`;
}
