// Buyurtmadan keyin "taom tayyorlanmoqda" animatsiyasi (har taom uchun alohida sahna, standart 30 soniya).
// Bu — ko'rgazmali taxminiy jarayon: buyurtma holatini restoran o'zi o'zgartiradi (qabul → tayyor), animatsiya emas.
// Vaqt buyurtma restoranga tushgan paytdan (status 'new') hisoblanadi — sahifa yangilansa ham davom etadi.
// "Harakatni kamaytirish" yoqilgan bo'lsa — faqat progress chizig'i.
import { t, getLang } from '../app/i18n.js';

export const DEFAULT_PREP_SECONDS = 30;
const STYLES = ['grill', 'griddle', 'oven', 'fryer', 'wrap', 'pot', 'sushi', 'pan'];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Taom nomidan taxmin (cook_style berilmagan eski taomlar uchun).
export function guessStyle(name = '') {
  const n = name.toLowerCase();
  if (/shashlik|kabob|kebab|six|шашлык|кебаб/.test(n)) return 'grill';
  if (/burger|hot ?dog|хот|бургер/.test(n)) return 'griddle';
  if (/pitsa|pizza|пицц/.test(n)) return 'oven';
  if (/fri|kartoshka|tovuq.*qarsil|qarsildoq|nagget|картоф|крыл/.test(n)) return 'fryer';
  if (/shaurma|lavash|donar|шаурм|лаваш/.test(n)) return 'wrap';
  if (/osh|plov|sho.?rva|lag.?mon|mastava|плов|шурп|лагман/.test(n)) return 'pot';
  if (/sushi|roll|суши|ролл/.test(n)) return 'sushi';
  return 'pan';
}

function sceneHtml(style, img, qty) {
  const photo = img ? `<img class="ck-photo" alt="" src="${esc(img)}">` : '<span class="ck-photo ck-photo-ph"></span>';
  switch (style) {
    case 'grill': {
      const n = Math.min(3, Math.max(1, qty));
      const skewers = Array.from({ length: n }, (_, i) => `<span class="ck-skewer" style="--i:${i}">${photo}</span>`).join('');
      return `<div class="ck-scene ck-grill"><div class="ck-smoke"><i></i><i></i><i></i></div><div class="ck-skewers">${skewers}</div>
        <div class="ck-mangal"><div class="ck-coals"><i></i><i></i><i></i><i></i><i></i><i></i></div></div></div>`;
    }
    case 'griddle':
      return `<div class="ck-scene ck-griddle"><div class="ck-steam"><i></i><i></i><i></i></div><div class="ck-item">${photo}</div><div class="ck-plate"></div><div class="ck-flames"><i></i><i></i><i></i><i></i></div></div>`;
    case 'oven':
      return `<div class="ck-scene ck-oven"><div class="ck-oven-box"><div class="ck-oven-window"><div class="ck-item">${photo}</div><div class="ck-glow"></div></div><div class="ck-knobs"><i></i><i></i></div></div></div>`;
    case 'fryer':
      return `<div class="ck-scene ck-fryer"><div class="ck-basket"><div class="ck-item">${photo}</div></div><div class="ck-oil"><i></i><i></i><i></i><i></i><i></i></div></div>`;
    case 'wrap':
      return `<div class="ck-scene ck-wrap"><div class="ck-doner"><span></span></div><div class="ck-item">${photo}</div></div>`;
    case 'pot':
      return `<div class="ck-scene ck-pot"><div class="ck-steam"><i></i><i></i><i></i></div><div class="ck-qozon"><div class="ck-item">${photo}</div></div><div class="ck-fire"><i></i><i></i><i></i></div></div>`;
    case 'sushi':
      return `<div class="ck-scene ck-sushi"><div class="ck-board"></div><div class="ck-item">${photo}</div><div class="ck-knife"></div></div>`;
    default:
      return `<div class="ck-scene ck-pan"><div class="ck-steam"><i></i><i></i><i></i></div><div class="ck-item">${photo}</div><div class="ck-pan-body"></div></div>`;
  }
}

const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.max(0, Math.ceil(s % 60))).padStart(2, '0')}`;

// items: [{ name, image, qty, cook_style, prep_seconds, options: [{name_uz,name_ru,qty,unit}] }]; startedAt — ms.
export function mountCooking(box, { items, startedAt }) {
  const lang = getLang();
  const list = items.slice(0, 4).map((i) => ({
    ...i,
    style: STYLES.includes(i.cook_style) ? i.cook_style : guessStyle(i.name),
    total: (i.prep_seconds || DEFAULT_PREP_SECONDS) * 1000,
  }));
  box.innerHTML = `<div class="card cooking"><div class="card-body stack" style="gap:var(--sp-3)">
    <div class="row" style="justify-content:space-between"><h2 class="h3">${t('cook_title')}</h2><span class="badge badge-warning" id="ck-badge"></span></div>
    <div class="ck-grid">${list.map((i, idx) => `<div class="ck-tile" data-i="${idx}">
      ${sceneHtml(i.style, i.image, i.qty)}
      <div class="ck-caption"><span class="small ck-name"></span><span class="xs text-2 ck-opts"></span></div>
      <div class="ck-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100"><span></span></div>
      <span class="xs ck-left"></span>
    </div>`).join('')}</div>
    <p class="xs text-2">${t('cook_note')}</p>
  </div></div>`;
  box.querySelectorAll('.ck-tile').forEach((tile, idx) => {
    const i = list[idx];
    tile.querySelector('.ck-name').textContent = `${i.name}${i.qty > 1 ? ` × ${i.qty}` : ''}`;
    const opts = (i.options || []).map((o) => `${(lang === 'ru' && o.name_ru) || o.name_uz} ${o.qty ? `${o.qty} ${o.unit}` : t('opt_none')}`).join(' · ');
    tile.querySelector('.ck-opts').textContent = opts;
  });

  let raf = 0;
  let timer = 0;
  function tick() {
    const now = Date.now();
    let allDone = true;
    box.querySelectorAll('.ck-tile').forEach((tile, idx) => {
      const i = list[idx];
      const p = Math.min(1, Math.max(0, (now - startedAt) / i.total));
      const done = p >= 1;
      if (!done) allDone = false;
      tile.classList.toggle('is-done', done);
      tile.style.setProperty('--doneness', p.toFixed(3));
      const bar = tile.querySelector('.ck-progress');
      bar.setAttribute('aria-valuenow', String(Math.round(p * 100)));
      bar.querySelector('span').style.width = `${(p * 100).toFixed(1)}%`;
      tile.querySelector('.ck-left').textContent = done ? `✓ ${t('cook_done')}` : t('cook_left', { time: mmss((i.total - (now - startedAt)) / 1000) });
    });
    const badge = box.querySelector('#ck-badge');
    badge.textContent = allDone ? t('cook_all_done') : t('cook_in_progress');
    badge.className = `badge ${allDone ? 'badge-success' : 'badge-warning'}`;
    box.querySelector('.cooking').classList.toggle('is-done', allDone);
    if (!allDone) timer = setTimeout(() => { raf = requestAnimationFrame(tick); }, 250);
  }
  tick();
  return () => { clearTimeout(timer); cancelAnimationFrame(raf); };
}
