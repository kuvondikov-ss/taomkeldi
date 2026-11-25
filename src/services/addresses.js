// Mijoz manzillari: har kim faqat o'z manzillarini ko'radi va o'zgartiradi.
// Har bir manzil Jizzax viloyati ichida bo'lishi shart (serverda tekshiriladi).
import { now, tx } from '../db/index.js';
import { AppError } from '../lib/errors.js';
import * as v from '../lib/validate.js';

const COLUMNS = 'id, label, text, lat, lon, entrance, floor, apartment, comment, is_default, created_at, updated_at';

export function createAddressService(db, geo) {
  // Saqlangan manzil keyinchalik yaroqsiz bo'lib qolishi mumkin (masalan, chegara yangilansa) — belgilab qaytaramiz.
  const withArea = (row) => (row ? { ...row, in_service_area: geo.isInServiceArea(row.lat, row.lon) } : row);

  function list(actor) {
    return db.prepare(`SELECT ${COLUMNS} FROM addresses WHERE user_id = ? AND is_deleted = 0 ORDER BY is_default DESC, id DESC`)
      .all(actor.id).map(withArea);
  }

  function getOwn(actor, addressId) {
    const row = db.prepare(`SELECT ${COLUMNS} FROM addresses WHERE id = ? AND user_id = ? AND is_deleted = 0`)
      .get(v.id(addressId), actor.id);
    if (!row) throw new AppError('NOT_FOUND');
    return withArea(row);
  }

  function readFields(data) {
    const { lat, lon } = geo.requireServiceArea(data.lat, data.lon);
    return {
      label: v.str(data.label, 'label', { optional: true, max: 40 }),
      text: v.str(data.text, 'text', { max: 300 }),
      lat,
      lon,
      entrance: v.str(data.entrance, 'entrance', { optional: true, max: 20 }),
      floor: v.str(data.floor, 'floor', { optional: true, max: 20 }),
      apartment: v.str(data.apartment, 'apartment', { optional: true, max: 20 }),
      comment: v.str(data.comment, 'comment', { optional: true, max: 300 }),
    };
  }

  function create(actor, data) {
    const rec = readFields(data);
    return tx(db, () => {
      const isFirst = !db.prepare('SELECT 1 FROM addresses WHERE user_id = ? AND is_deleted = 0').get(actor.id);
      const makeDefault = isFirst || data.is_default === true;
      if (makeDefault) db.prepare('UPDATE addresses SET is_default = 0 WHERE user_id = ?').run(actor.id);
      const t = now();
      const res = db.prepare(`
        INSERT INTO addresses (user_id, label, text, lat, lon, entrance, floor, apartment, comment, is_default, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(actor.id, rec.label, rec.text, rec.lat, rec.lon, rec.entrance, rec.floor, rec.apartment, rec.comment,
        makeDefault ? 1 : 0, t, t);
      return getOwn(actor, Number(res.lastInsertRowid));
    });
  }

  function update(actor, addressId, data) {
    const row = getOwn(actor, addressId);
    const rec = readFields(data);
    db.prepare(`
      UPDATE addresses SET label = ?, text = ?, lat = ?, lon = ?, entrance = ?, floor = ?, apartment = ?, comment = ?, updated_at = ?
      WHERE id = ?
    `).run(rec.label, rec.text, rec.lat, rec.lon, rec.entrance, rec.floor, rec.apartment, rec.comment, now(), row.id);
    return getOwn(actor, row.id);
  }

  function setDefault(actor, addressId) {
    const row = getOwn(actor, addressId);
    if (!row.in_service_area) throw new AppError('OUT_OF_AREA');
    tx(db, () => {
      db.prepare('UPDATE addresses SET is_default = 0 WHERE user_id = ?').run(actor.id);
      db.prepare('UPDATE addresses SET is_default = 1, updated_at = ? WHERE id = ?').run(now(), row.id);
    });
    return getOwn(actor, row.id);
  }

  function remove(actor, addressId) {
    const row = getOwn(actor, addressId); // begona manzil — NOT_FOUND
    tx(db, () => {
      db.prepare('UPDATE addresses SET is_deleted = 1, is_default = 0, updated_at = ? WHERE id = ?').run(now(), row.id);
      if (row.is_default) {
        // Asosiy manzil o'chirilsa, eng yangisi asosiy bo'ladi.
        const next = db.prepare('SELECT id FROM addresses WHERE user_id = ? AND is_deleted = 0 ORDER BY id DESC LIMIT 1').get(actor.id);
        if (next) db.prepare('UPDATE addresses SET is_default = 1 WHERE id = ?').run(next.id);
      }
    });
  }

  // Yetkazish nuqtasi: saqlangan manzil (address_id) yoki koordinata. Har doim hudud tekshiriladi.
  function resolvePoint(actor, { address_id, lat, lon }) {
    if (address_id != null && address_id !== '') {
      const a = getOwn(actor, address_id);
      if (!a.in_service_area) throw new AppError('OUT_OF_AREA');
      return { lat: a.lat, lon: a.lon, address_id: a.id };
    }
    return geo.requireServiceArea(lat, lon);
  }

  return { list, getOwn, create, update, setDefault, remove, resolvePoint };
}
