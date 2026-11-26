// Taomni "Standart" / "Maxsus" tanlash: masalliqlar, miqdor chegaralari va narx — server va Mini App uchun BITTA qoida.
//
// Masalliq (product_ingredients): { id, name_uz, name_ru, unit, std_qty, min_qty, max_qty, step, step_price }
//   std_qty   — standart (o'rtacha) miqdor; "Standart" tanlanganda aynan shu;
//   step      — bir bosishda o'zgarish (masalan, 10 g yoki 1 dona);
//   step_price — har bir qadam uchun narx farqi (so'm). Ko'paytirsa qo'shiladi, kamaytirsa ayriladi.
// Tanlov (selection): [{ id, qty }] — faqat o'zgargan masalliqlar; bo'sh — standart.
// Narx: asosiy narx + Σ ((qty − std) / step) × step_price; 100 so'mga yaxlitlanadi; asosiy narxning yarmidan past tushmaydi.

export const PRICE_ROUND = 100;
export const MIN_PRICE_SHARE = 0.5;

export class OptionsError extends Error {
  constructor(reason, ingredientId) { super(reason); this.reason = reason; this.ingredientId = ingredientId; }
}

// Tanlovni tekshirish va to'liq xaritaga aylantirish: id → qty (standart qiymatlar bilan).
export function normalize(ingredients, selection = []) {
  const byId = new Map(ingredients.map((i) => [Number(i.id), i]));
  const out = new Map(ingredients.map((i) => [Number(i.id), i.std_qty]));
  if (!Array.isArray(selection)) throw new OptionsError('bad_selection');
  for (const s of selection) {
    const id = Number(s?.id);
    const qty = Number(s?.qty);
    const ing = byId.get(id);
    if (!ing) throw new OptionsError('unknown_ingredient', id);
    if (!Number.isInteger(qty) || qty < ing.min_qty || qty > ing.max_qty) throw new OptionsError('out_of_range', id);
    if ((qty - ing.min_qty) % ing.step !== 0 && qty !== ing.std_qty) throw new OptionsError('bad_step', id);
    out.set(id, qty);
  }
  return out;
}

// Faqat standartdan farq qiladiganlar (tartiblangan) — savat qatori va buyurtma snapshot'i uchun.
export function changes(ingredients, normalized) {
  return ingredients
    .filter((i) => normalized.get(Number(i.id)) !== i.std_qty)
    .map((i) => ({ id: Number(i.id), qty: normalized.get(Number(i.id)) }))
    .sort((a, b) => a.id - b.id);
}

// Bir xil sozlama — bitta savat qatori. '' — standart.
export const signature = (changed) => changed.map((c) => `${c.id}:${c.qty}`).join(',');
export const lineKey = (productId, changed) => (changed.length ? `${productId}~${signature(changed)}` : String(productId));

export function unitPrice(basePrice, ingredients, normalized) {
  let delta = 0;
  for (const i of ingredients) {
    const qty = normalized.get(Number(i.id));
    delta += ((qty - i.std_qty) / i.step) * i.step_price;
  }
  const raw = basePrice + delta;
  const floor = Math.ceil((basePrice * MIN_PRICE_SHARE) / PRICE_ROUND) * PRICE_ROUND;
  return Math.max(floor, Math.round(raw / PRICE_ROUND) * PRICE_ROUND);
}

const nameOf = (i, lang) => (lang === 'ru' && i.name_ru) || i.name_uz;
const qtyText = (qty, unit) => `${qty} ${unit}`;

// "go'sht 300 g, dumba 0 g" — faqat o'zgarganlar; standart bo'lsa ''.
export function label(ingredients, normalized, lang = 'uz') {
  return ingredients
    .filter((i) => normalized.get(Number(i.id)) !== i.std_qty)
    .map((i) => {
      const q = normalized.get(Number(i.id));
      return q === 0 ? `${nameOf(i, lang)}: ${lang === 'ru' ? 'без' : 'yo‘q'}` : `${nameOf(i, lang)} ${qtyText(q, i.unit)}`;
    })
    .join(', ');
}

// Masalliq ta'rifini tekshirish (panel / admin kiritganda).
export function validateIngredient(i) {
  const ints = ['std_qty', 'min_qty', 'max_qty', 'step', 'step_price'];
  for (const k of ints) if (!Number.isInteger(i[k]) || i[k] < 0) return `${k}`;
  if (i.step < 1) return 'step';
  if (i.min_qty > i.std_qty || i.std_qty > i.max_qty) return 'std_qty';
  if ((i.max_qty - i.min_qty) % i.step !== 0) return 'max_qty';
  return null;
}
