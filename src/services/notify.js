// Foydalanuvchiga bot orqali xabar (foydalanuvchi tilida). Har xabar avval outbox'ga yoziladi va darhol yuborishga urinadi;
// muvaffaqiyatsiz bo'lsa outbox keyin qayta urinadi. Xabar yuborilmasa asosiy amal buzilmaydi.
import { t } from '../i18n/index.js';

const BASE = { parse_mode: 'HTML', link_preview_options: { is_disabled: true } };

export function createNotifyService(users, outbox) {
  // Tayyor HTML matn. dedupeKey — bir hodisa uchun bitta xabar. Qaytaradi: hozir yuborildimi.
  async function sendText(chatId, text, { dedupeKey = null, reply_markup, userId = chatId > 0 ? chatId : null } = {}) {
    if (!chatId) return false;
    const extra = reply_markup ? { ...BASE, reply_markup } : BASE;
    const { job, duplicate } = outbox.enqueueMessage({ chatId, userId, text, extra, dedupeKey });
    if (duplicate) return false;
    return (await outbox.runNow(job)) === 'sent';
  }

  return {
    setBotApi() { /* API outbox orqali beriladi */ },
    langFor(userId) {
      const u = users.get(userId);
      return u ? users.langOf(u) : 'uz';
    },
    sendText,
    // Tarjima kaliti bo'yicha (src/i18n/{uz,ru}.js).
    async send(userId, key, vars = {}, opts = {}) {
      if (!userId) return false;
      return sendText(userId, t(this.langFor(userId), key, vars), opts);
    },
  };
}
