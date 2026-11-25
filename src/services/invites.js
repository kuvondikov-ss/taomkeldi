// Bir martalik taklif havolalari: ega, menejer, kuryer.
// - Token tasodifiy (24 bayt, base64url), bazada faqat SHA-256 xeshi saqlanadi.
// - Havola faqat bir marta ishlaydi; ishlatilgan, bekor qilingan yoki muddati o'tgani rol bermaydi.
// - Qayta /start (o'sha odam, o'sha havola) dublikat yaratmaydi.
// - Deep-link: t.me/<bot>?start=inv_<token>. Ommaviy reklama havolalari boshqa prefiksda (r_<id>) va rol bermaydi.
import crypto from 'node:crypto';
import { now, tx } from '../db/index.js';
import { AppError } from '../lib/errors.js';
import * as v from '../lib/validate.js';

export const INVITE_PREFIX = 'inv_';
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const hash = (token) => crypto.createHash('sha256').update(token).digest('hex');

export function createInviteService(db, access, restaurants) {
  // Kim qanday taklif yarata oladi:
  //   owner   — faqat platforma admini
  //   manager — restoran egasi (yoki platforma admini)
  //   courier — ega yoki menejer (yoki platforma admini)
  function requireCanInvite(actor, restaurantId, kind) {
    if (kind === 'owner') return access.requirePlatformAdmin(actor);
    const role = access.requireRestaurantStaff(actor, restaurantId);
    if (kind === 'manager' && role === 'manager') throw new AppError('OWNER_ONLY');
  }

  function create(actor, restaurantId, { kind, courierId = null } = {}) {
    v.oneOf(kind, 'kind', ['owner', 'manager', 'courier']);
    const r = restaurants.getRaw(restaurantId);
    if (!r) {
      if (!access.isPlatformAdmin(actor)) throw new AppError('FORBIDDEN');
      throw new AppError('NOT_FOUND');
    }
    requireCanInvite(actor, restaurantId, kind);
    if (r.status === 'blocked' || r.status === 'rejected') throw new AppError('CONFLICT', { details: { reason: 'restaurant_inactive' } });

    let cid = null;
    if (kind === 'courier') {
      cid = v.id(courierId, 'courier_id');
      const c = db.prepare('SELECT id, user_id, status FROM couriers WHERE id = ? AND restaurant_id = ?').get(cid, restaurantId);
      if (!c) throw new AppError('NOT_FOUND');
      if (c.user_id) throw new AppError('CONFLICT', { details: { reason: 'courier_already_linked' } });
      if (c.status !== 'active') throw new AppError('CONFLICT', { details: { reason: 'courier_revoked' } });
    }

    const token = crypto.randomBytes(24).toString('base64url');
    const t = now();
    return tx(db, () => {
      // Egasi va aniq kuryer uchun yangi havola avvalgi ishlatilmagan havolani bekor qiladi.
      if (kind === 'owner') {
        db.prepare(`UPDATE invites SET revoked_at = ? WHERE restaurant_id = ? AND kind = 'owner' AND used_at IS NULL AND revoked_at IS NULL`).run(t, restaurantId);
      } else if (kind === 'courier') {
        db.prepare(`UPDATE invites SET revoked_at = ? WHERE courier_id = ? AND used_at IS NULL AND revoked_at IS NULL`).run(t, cid);
      }
      const res = db.prepare(`
        INSERT INTO invites (token_hash, kind, restaurant_id, courier_id, created_by, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(hash(token), kind, restaurantId, cid, actor.id, t, t + TTL_MS);
      return { id: Number(res.lastInsertRowid), kind, restaurantId, courierId: cid, token, payload: INVITE_PREFIX + token, expiresAt: t + TTL_MS };
    });
  }

  function list(actor, restaurantId) {
    access.requireRestaurantStaff(actor, restaurantId);
    return db.prepare(`
      SELECT id, kind, courier_id, created_at, expires_at, used_by, used_at, revoked_at
      FROM invites WHERE restaurant_id = ? ORDER BY id DESC LIMIT 100
    `).all(restaurantId);
  }

  function revoke(actor, restaurantId, inviteId) {
    const inv = db.prepare('SELECT * FROM invites WHERE id = ? AND restaurant_id = ?').get(v.id(inviteId), restaurantId);
    if (!inv) {
      access.requireRestaurantStaff(actor, restaurantId);
      throw new AppError('NOT_FOUND');
    }
    requireCanInvite(actor, restaurantId, inv.kind);
    if (inv.used_at) throw new AppError('CONFLICT', { details: { reason: 'already_used' } });
    db.prepare('UPDATE invites SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ?').run(now(), inv.id);
  }

  // Havolani qabul qilish. Natija: { status: 'ok'|'already'|'invalid'|'inactive', kind?, restaurant? }
  // Xato tashlamaydi — bot foydalanuvchiga tushunarli javob beradi.
  function accept(user, payload) {
    if (typeof payload !== 'string' || !payload.startsWith(INVITE_PREFIX)) return { status: 'invalid' };
    const token = payload.slice(INVITE_PREFIX.length);
    if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return { status: 'invalid' };

    return tx(db, () => {
      const inv = db.prepare('SELECT * FROM invites WHERE token_hash = ?').get(hash(token));
      if (!inv) return { status: 'invalid' };
      const r = restaurants.getRaw(inv.restaurant_id);
      const base = { kind: inv.kind, restaurant: r?.name };

      // O'sha odam o'sha havolani qayta ochdi — dublikatsiz "allaqachon".
      if (inv.used_at) return inv.used_by === user.id ? { status: 'already', ...base } : { status: 'invalid' };
      if (inv.revoked_at || inv.expires_at < now()) return { status: 'invalid' };
      if (!r || r.status === 'blocked' || r.status === 'rejected') return { status: 'inactive', ...base };

      const t = now();
      if (inv.kind === 'courier') {
        const c = db.prepare('SELECT id, user_id, status FROM couriers WHERE id = ?').get(inv.courier_id);
        if (!c || c.status !== 'active' || (c.user_id && c.user_id !== user.id)) return { status: 'invalid' };
        const other = db.prepare("SELECT id FROM couriers WHERE restaurant_id = ? AND user_id = ? AND id <> ? AND status = 'active'").get(inv.restaurant_id, user.id, c.id);
        if (other) {
          // Bu odam shu restoranda boshqa kuryer yozuvi bilan allaqachon ulangan.
          db.prepare('UPDATE invites SET used_by = ?, used_at = ? WHERE id = ?').run(user.id, t, inv.id);
          return { status: 'already', ...base };
        }
        db.prepare('UPDATE couriers SET user_id = ?, updated_at = ? WHERE id = ?').run(user.id, t, c.id);
      } else {
        const existing = access.staffRole(user, inv.restaurant_id);
        if (existing === 'owner' || existing === inv.kind) {
          db.prepare('UPDATE invites SET used_by = ?, used_at = ? WHERE id = ?').run(user.id, t, inv.id);
          return { status: 'already', ...base };
        }
        restaurants.addStaff(inv.restaurant_id, user.id, inv.kind, inv.created_by);
      }
      db.prepare('UPDATE invites SET used_by = ?, used_at = ? WHERE id = ?').run(user.id, t, inv.id);
      return { status: 'ok', ...base };
    });
  }

  return { create, list, revoke, accept };
}
