// Mijoz manzillari: har kim faqat o'z manzillarini ko'radi va o'zgartiradi.
// Jizzax chegarasi va restoran radiusi tekshiruvi — 5-bosqich.
import { now, tx } from '../db/index.js';
import { AppError } from '../lib/errors.js';
import * as v from '../lib/validate.js';

const COLUMNS = 'id, label, text, lat, lon, entrance, floor, apartment, comment, is_default, created_at';

export function createAddressService(db) {
  function list(actor) {
    return db.prepare(`SELECT ${COLUMNS} FROM addresses WHERE user_id = ? AND is_deleted = 0 ORDER BY is_default DESC, id DESC`)
      .all(actor.id);
  }

  function getOwn(actor, addressId) {
    const row = db.prepare(`SELECT ${COLUMNS} FROM addresses WHERE id = ? AND user_id = ? AND is_deleted = 0`)
      .get(v.id(addressId), actor.id);
    if (!row) throw new AppError('NOT_FOUND');
    return row;
  }

  function create(actor, data) {
    const rec = {
      label: v.str(data.label, 'label', { optional: true, max: 40 }),
      text: v.str(data.text, 'text', { max: 300 }),
      lat: v.coord(data.lat, 'lat', 'lat'),
      lon: v.coord(data.lon, 'lon', 'lon'),
      entrance: v.str(data.entrance, 'entrance', { optional: true, max: 20 }),
      floor: v.str(data.floor, 'floor', { optional: true, max: 20 }),
      apartment: v.str(data.apartment, 'apartment', { optional: true, max: 20 }),
      comment: v.str(data.comment, 'comment', { optional: true, max: 300 }),
    };
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

  function remove(actor, addressId) {
    const row = getOwn(actor, addressId); // begona manzil — NOT_FOUND
    db.prepare('UPDATE addresses SET is_deleted = 1, is_default = 0, updated_at = ? WHERE id = ?').run(now(), row.id);
  }

  return { list, getOwn, create, remove };
}
