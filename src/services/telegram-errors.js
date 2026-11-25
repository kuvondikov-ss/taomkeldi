// Telegram Bot API xatolarini tasniflash (guruh xabari, outbox va boshqalar uchun bitta joy).
export function classifyTelegramError(e) {
  const d = String(e?.description || e?.message || '').toLowerCase();
  const code = e?.error_code;
  if (e?.parameters?.migrate_to_chat_id) return 'migrated';
  if (code === 429 || e?.parameters?.retry_after) return 'rate_limited';
  if (d.includes('message is not modified')) return 'not_modified';
  if (d.includes('message to edit not found') || d.includes('message_id_invalid') || d.includes("message can't be edited")) return 'message_gone';
  if (d.includes('message thread not found') || d.includes('topic_deleted') || d.includes('topic_closed')) return 'thread_gone';
  // Shaxsiy chat: foydalanuvchi botni bloklagan, akkaunt o'chgan yoki botni hech ochmagan.
  if (d.includes('bot was blocked by the user') || d.includes('user is deactivated') || d.includes("bot can't initiate conversation")) return 'blocked';
  if (d.includes('not enough rights') || d.includes('have no rights') || d.includes('need administrator rights') || d.includes('chat_write_forbidden')) return 'no_rights';
  if (code === 403 || d.includes('bot was kicked') || d.includes('bot is not a member') || d.includes('chat not found')) return 'removed';
  if (code >= 500) return 'server';
  if (code == null) return 'network'; // HttpError: Telegram'ga yetib bo'lmadi
  return 'other';
}
