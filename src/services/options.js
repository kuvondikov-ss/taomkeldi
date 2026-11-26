// Taom masalliqlari ("Maxsus" tanlov) — saqlash va narxlash. Qoidalar: public/js/shared/options-core.js (Mini App bilan bir xil).
import { now } from '../db/index.js';
import { AppError } from '../lib/errors.js';
import * as v from '../lib/validate.js';
import { normalize, changes, lineKey, unitPrice, label, validateIngredient, OptionsError } from '../../public/js/shared/options-core.js';

export const COOK_STYLES = ['grill', 'griddle', 'oven', 'fryer', 'wrap', 'pot', 'sushi', 'pan'];
export const DEFAULT_PREP_SECONDS = 30;
const UNITS = ['g', 'ml', 'dona', 'bo‘lak', 'halqa', 'sih'];

export function createOptionsService(db) {
  const listStmt = db.prepare(`SELECT id, product_id, name_uz, name_ru, unit, std_qty, min_qty, max_qty, step, step_price, sort
    FROM product_ingredients WHERE product_id = ? ORDER BY sort, id`);

  const ingredientsOf = (productId) => listStmt.all(productId).map((i) => ({ ...i }));

  function ingredientsFor(productIds) {
    const map = new Map();
    if (!productIds.length) return map;
    const rows = db.prepare(`SELECT id, product_id, name_uz, name_ru, unit, std_qty, min_qty, max_qty, step, step_price, sort
      FROM product_ingredients WHERE product_id IN (${productIds.map(() => '?').join(',')}) ORDER BY sort, id`).all(...productIds);
    for (const r of rows) {
      if (!map.has(r.product_id)) map.set(r.product_id, []);
      map.get(r.product_id).push({ ...r });
    }
    return map;
  }

  // Panel: taom masalliqlarini to'liq ro'yxat bilan almashtirish (id berilsa — yangilanadi, yo'q bo'lsa — yaratiladi, qolganlari o'chadi).
  function saveIngredients(productId, list) {
    if (!Array.isArray(list)) throw new AppError('VALIDATION', { details: { field: 'ingredients' } });
    if (list.length > 20) throw new AppError('VALIDATION', { details: { field: 'ingredients', reason: 'too_many' } });
    const existing = new Map(ingredientsOf(productId).map((i) => [i.id, i]));
    const keep = new Set();
    const t = now();
    list.forEach((raw, idx) => {
      const rec = {
        name_uz: v.str(raw.name_uz, 'ingredients.name_uz', { max: 60 }),
        name_ru: v.str(raw.name_ru, 'ingredients.name_ru', { optional: true, max: 60 }),
        unit: v.oneOf(raw.unit || 'g', 'ingredients.unit', UNITS),
        std_qty: Number(raw.std_qty), min_qty: Number(raw.min_qty ?? 0), max_qty: Number(raw.max_qty),
        step: Number(raw.step ?? 1), step_price: Number(raw.step_price ?? 0),
      };
      const bad = validateIngredient(rec);
      if (bad) throw new AppError('VALIDATION', { details: { field: `ingredients.${bad}`, index: idx } });
      const id = raw.id != null && existing.has(Number(raw.id)) ? Number(raw.id) : null;
      if (id) {
        db.prepare(`UPDATE product_ingredients SET name_uz = ?, name_ru = ?, unit = ?, std_qty = ?, min_qty = ?, max_qty = ?, step = ?, step_price = ?, sort = ?, updated_at = ?
          WHERE id = ?`).run(rec.name_uz, rec.name_ru, rec.unit, rec.std_qty, rec.min_qty, rec.max_qty, rec.step, rec.step_price, idx, t, id);
        keep.add(id);
      } else {
        const res = db.prepare(`INSERT INTO product_ingredients (product_id, name_uz, name_ru, unit, std_qty, min_qty, max_qty, step, step_price, sort, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(productId, rec.name_uz, rec.name_ru, rec.unit, rec.std_qty, rec.min_qty, rec.max_qty, rec.step, rec.step_price, idx, t, t);
        keep.add(Number(res.lastInsertRowid));
      }
    });
    for (const id of existing.keys()) if (!keep.has(id)) db.prepare('DELETE FROM product_ingredients WHERE id = ?').run(id);
  }

  // Savat/checkout qatori: tanlovni tekshirish va narxlash. Xato bo'lsa — qator holati 'options_changed'.
  function priceLine(product, ingredients, selection) {
    try {
      const norm = normalize(ingredients, selection || []);
      const changed = changes(ingredients, norm);
      return {
        ok: true,
        key: lineKey(product.id, changed),
        unit_price: changed.length ? unitPrice(product.price, ingredients, norm) : product.price,
        options: changed,
        options_label: label(ingredients, norm, 'uz'),
        // Buyurtma snapshot'i: masalliq nomi, birligi, standart va tanlangan miqdor (keyin o'zgarsa ham saqlanadi).
        snapshot: ingredients.filter((i) => norm.get(i.id) !== i.std_qty)
          .map((i) => ({ name_uz: i.name_uz, name_ru: i.name_ru, unit: i.unit, std: i.std_qty, qty: norm.get(i.id) })),
      };
    } catch (e) {
      if (e instanceof OptionsError) return { ok: false, reason: e.reason, key: lineKey(product.id, Array.isArray(selection) ? selection : []) };
      throw e;
    }
  }

  return { ingredientsOf, ingredientsFor, saveIngredients, priceLine };
}
