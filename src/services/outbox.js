// Ishonchli bot xabarlari (outbox). Har xabar avval bazaga yoziladi, keyin yuboriladi:
// - Telegram ishlamasa yoki tarmoq uzilsa — orqaga surilgan qayta urinish (MAX_ATTEMPTS gacha);
// - 429 bo'lsa — Telegram aytgan retry_after kutiladi (butun navbat to'xtaydi);
// - foydalanuvchi botni bloklagan bo'lsa — qayta urinilmaydi, keyingi xabarlar "skipped";
// - dedupe_key bir hodisa uchun bitta xabar kafolatlaydi (takroriy tugma, qayta ishga tushish).
// kind = 'sync' — tayyor xabar emas, "shu buyurtmaning jonli xabarini yangila" topshirig'i (guruh, kuryer).
import { now } from '../db/index.js';
import { classifyTelegramError } from './telegram-errors.js';

export const MAX_ATTEMPTS = 8;
const BACKOFF_MS = (n) => Math.min(30 * 60_000, 10_000 * 2 ** Math.max(0, n - 1)); // 10s, 20s, 40s … 30 daq

export function createOutbox(db, { logger = console } = {}) {
  let api = null;
  let pausedUntil = 0;
  let running = null;
  const syncHandlers = new Map(); // target -> async (payload) => { ok } | { retry, retryAfter, error }

  const get = (id) => db.prepare('SELECT * FROM notifications WHERE id = ?').get(id);

  function insert({ kind, chatId = null, userId = null, payload, dedupeKey = null, status = 'pending' }) {
    const t = now();
    const res = db.prepare(`INSERT OR IGNORE INTO notifications (kind, chat_id, user_id, payload, dedupe_key, status, next_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(kind, chatId, userId, JSON.stringify(payload), dedupeKey, status, t, t, t);
    return res.changes ? get(Number(res.lastInsertRowid)) : null;
  }

  // Tayyor matnli xabar. userId berilsa va u botni bloklagan bo'lsa — yozib qo'yiladi, yuborilmaydi.
  function enqueueMessage({ chatId, userId = null, text, extra = {}, dedupeKey = null }) {
    const blocked = userId && db.prepare('SELECT bot_blocked_at FROM users WHERE id = ?').get(userId)?.bot_blocked_at;
    const row = insert({ kind: 'message', chatId, userId, payload: { text, extra }, dedupeKey, status: blocked ? 'skipped' : 'pending' });
    return row ? { job: row, duplicate: false } : { job: dedupeKey ? db.prepare('SELECT * FROM notifications WHERE dedupe_key = ?').get(dedupeKey) : null, duplicate: true };
  }

  // Jonli xabarni yangilash topshirig'i. Bir buyurtma+nishon uchun bitta yozuv; bajarilgan bo'lsa qayta "pending" bo'ladi.
  function enqueueSync(target, orderId, { delayMs = 0 } = {}) {
    const key = `sync:${target}:${orderId}`;
    const t = now();
    db.prepare(`INSERT INTO notifications (kind, payload, dedupe_key, status, next_at, created_at, updated_at) VALUES ('sync', ?, ?, 'pending', ?, ?, ?)
      ON CONFLICT(dedupe_key) DO UPDATE SET status = 'pending', attempts = CASE WHEN notifications.status = 'pending' THEN notifications.attempts ELSE 0 END,
        next_at = excluded.next_at, updated_at = excluded.updated_at`)
      .run(JSON.stringify({ target, orderId }), key, t + delayMs, t, t);
    return db.prepare('SELECT * FROM notifications WHERE dedupe_key = ?').get(key);
  }

  function finish(job, fields) {
    const sets = Object.keys(fields).map((k) => `${k} = ?`).join(', ');
    db.prepare(`UPDATE notifications SET ${sets}, updated_at = ? WHERE id = ?`).run(...Object.values(fields), now(), job.id);
  }

  function retryLater(job, error, retryAfterMs) {
    const attempts = job.attempts + 1;
    if (attempts >= MAX_ATTEMPTS) {
      finish(job, { status: 'failed', attempts, last_error: String(error).slice(0, 300) });
      logger.error(`Xabar #${job.id} ${attempts} urinishdan keyin yuborilmadi: ${error}`);
      return 'failed';
    }
    finish(job, { attempts, next_at: now() + (retryAfterMs ?? BACKOFF_MS(attempts)), last_error: String(error).slice(0, 300) });
    return 'retry';
  }

  async function runMessage(job) {
    const { text, extra } = JSON.parse(job.payload);
    try {
      const m = await api.sendMessage(job.chat_id, text, extra);
      finish(job, { status: 'sent', attempts: job.attempts + 1, sent_at: now(), message_id: m?.message_id ?? null, last_error: null });
      return 'sent';
    } catch (e) {
      const kind = classifyTelegramError(e);
      const desc = e.description || e.message;
      if (kind === 'rate_limited') {
        const wait = (e.parameters?.retry_after ?? 5) * 1000;
        pausedUntil = now() + wait;
        return retryLater(job, desc, wait);
      }
      if (kind === 'blocked' || (kind === 'removed' && job.user_id)) {
        finish(job, { status: 'blocked', attempts: job.attempts + 1, last_error: desc });
        if (job.user_id) db.prepare('UPDATE users SET bot_blocked_at = ? WHERE id = ?').run(now(), job.user_id);
        return 'blocked';
      }
      if (kind === 'network' || kind === 'other' || kind === 'server') return retryLater(job, desc);
      // Qayta urinish foyda bermaydigan xato (chat yo'q, noto'g'ri so'rov) — to'xtatamiz, lekin iz qoladi.
      finish(job, { status: 'failed', attempts: job.attempts + 1, last_error: desc });
      logger.error(`Xabar #${job.id} yuborilmadi (${kind}): ${desc}`);
      return 'failed';
    }
  }

  async function runSync(job) {
    const p = JSON.parse(job.payload);
    const h = syncHandlers.get(p.target);
    if (!h) return retryLater(job, `no handler: ${p.target}`);
    try {
      const r = await h(p);
      if (r?.retry) {
        if (r.retryAfter) pausedUntil = now() + r.retryAfter;
        return retryLater(job, r.error || 'retry', r.retryAfter);
      }
      finish(job, { status: 'sent', attempts: job.attempts + 1, sent_at: now(), last_error: null });
      return 'sent';
    } catch (e) {
      return retryLater(job, e.message);
    }
  }

  // Bitta topshiriqni hozir bajarish (navbatni kutmasdan) — chaqiruvchi natijani darhol bilishi uchun.
  async function runNow(job) {
    if (!api || !job || job.status !== 'pending') return job?.status || 'none';
    if (now() < pausedUntil) return 'paused';
    return job.kind === 'sync' ? runSync(job) : runMessage(job);
  }

  // Muddati kelgan topshiriqlar. Bir vaqtda bitta ishlov beruvchi.
  async function processDue({ limit = 25 } = {}) {
    if (running) return running;
    const work = async () => {
      let done = 0;
      while (api && done < limit && now() >= pausedUntil) {
        const job = db.prepare("SELECT * FROM notifications WHERE status = 'pending' AND next_at <= ? ORDER BY next_at, id LIMIT 1").get(now());
        if (!job) break;
        await runNow(job);
        done += 1;
      }
      return done;
    };
    // Bayroq ish tugagach tozalanadi (ish bo'lmasa ham — sinxron tugagan holatda ham).
    running = work().finally(() => { running = null; });
    return running;
  }

  function stats() {
    const rows = db.prepare('SELECT status, COUNT(*) AS n FROM notifications GROUP BY status').all();
    const out = { pending: 0, sent: 0, failed: 0, blocked: 0, skipped: 0 };
    for (const r of rows) out[r.status] = r.n;
    return out;
  }

  return {
    setBotApi(a) { api = a; },
    hasApi: () => !!api,
    onSync(target, fn) { syncHandlers.set(target, fn); },
    enqueueMessage, enqueueSync, runNow, processDue, stats,
    // Testlar uchun: pauza va vaqtni boshqarish.
    _resetPause() { pausedUntil = 0; },
  };
}
