// Foydalanuvchiga bot orqali xabar (foydalanuvchi tilida). Xabar yuborilmasa asosiy amal buzilmaydi — faqat log.
// Ishonchli yetkazish (outbox, qayta urinish) — 13-bosqich.
import { t } from '../i18n/index.js';

export function createNotifyService(users, logger = console) {
  let api = null;
  return {
    setBotApi(a) { api = a; },
    async send(userId, key, vars = {}) {
      if (!api || !userId) return false;
      const u = users.get(userId);
      try {
        await api.sendMessage(userId, t(u ? users.langOf(u) : 'uz', key, vars), { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
        return true;
      } catch (e) {
        logger.error(`Xabar yuborilmadi (${userId}, ${key}):`, e.description || e.message);
        return false;
      }
    },
  };
}
