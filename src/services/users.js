import { now } from '../db/index.js';
import { AppError } from '../lib/errors.js';
import { oneOf } from '../lib/validate.js';

export function createUserService(db, config) {
  const getStmt = db.prepare('SELECT * FROM users WHERE id = ?');

  function get(id) {
    return getStmt.get(id) || null;
  }

  // Telegram'dan kelgan (tekshirilgan!) foydalanuvchi ma'lumoti bilan yaratish/yangilash.
  function upsertFromTelegram(tg) {
    if (!tg || !Number.isSafeInteger(tg.id) || tg.id <= 0) throw new AppError('VALIDATION', { details: { field: 'user' } });
    const t = now();
    db.prepare(`
      INSERT INTO users (id, first_name, last_name, username, tg_lang, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        first_name = excluded.first_name,
        last_name  = excluded.last_name,
        username   = excluded.username,
        tg_lang    = excluded.tg_lang,
        updated_at = excluded.updated_at
    `).run(tg.id, tg.first_name || '', tg.last_name || null, tg.username || null, tg.language_code || null, t, t);
    return get(tg.id);
  }

  function setLang(userId, lang) {
    oneOf(lang, 'lang', ['uz', 'ru']);
    db.prepare('UPDATE users SET lang = ?, updated_at = ? WHERE id = ?').run(lang, now(), userId);
    return get(userId);
  }

  // Til: avval foydalanuvchi tanlovi, keyin Telegram tili, standart — o'zbekcha.
  function langOf(user) {
    if (user?.lang) return user.lang;
    if (user?.tg_lang?.startsWith('ru')) return 'ru';
    return 'uz';
  }

  function hasAnyPlatformAdmin() {
    if (config.platformAdminIds.length) return true;
    return !!db.prepare('SELECT 1 FROM users WHERE is_platform_admin = 1 LIMIT 1').get();
  }

  // AUTO_ADMIN (faqat test/bootstrap): admin umuman yo'q bo'lsa, shu foydalanuvchi admin bo'ladi.
  // Production'da config.autoAdmin har doim false.
  function bootstrapAutoAdmin(userId) {
    if (!config.autoAdmin || hasAnyPlatformAdmin()) return false;
    db.prepare('UPDATE users SET is_platform_admin = 1, updated_at = ? WHERE id = ?').run(now(), userId);
    return true;
  }

  return { get, upsertFromTelegram, setLang, langOf, bootstrapAutoAdmin };
}
