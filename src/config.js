// Muhit o'zgaruvchilarini bir joyda o'qish va tekshirish.
import 'dotenv/config';
import path from 'node:path';

function parseIds(value) {
  return String(value || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^-?\d+$/.test(s))
    .map(Number);
}

function intEnv(env, name, fallback) {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) throw new Error(`${name} butun musbat son bo'lishi kerak`);
  return n;
}

// Mini App manzilini tekshirish: Telegram faqat ommaviy HTTPS manzilni ochadi.
export function checkWebappUrl(value) {
  if (!value) return { ok: false, reason: 'WEBAPP_URL berilmagan' };
  let u;
  try {
    u = new URL(value);
  } catch {
    return { ok: false, reason: 'WEBAPP_URL noto\'g\'ri manzil' };
  }
  if (u.protocol !== 'https:') return { ok: false, reason: 'WEBAPP_URL https:// bilan boshlanishi kerak' };
  if (['localhost', '127.0.0.1', '[::1]'].includes(u.hostname) || u.hostname.endsWith('.local')) {
    return { ok: false, reason: 'WEBAPP_URL lokal manzil — Telegram uni ocha olmaydi' };
  }
  return { ok: true, reason: null, url: u.toString().replace(/\/$/, '') };
}

export function loadConfig(env = process.env) {
  const isProduction =
    env.NODE_ENV === 'production' || env.RAILWAY_ENVIRONMENT_NAME === 'production';

  const dataDir = env.DATA_DIR || './data';
  const devAuthRequested = env.DEV_AUTH === '1';
  const autoAdminRequested = env.AUTO_ADMIN === '1';

  const config = {
    isProduction,
    // Token: BOT_TOKEN; vaqtincha Railway'dagi "taomkeldi_bot" nomi ham qabul qilinadi.
    botToken: env.BOT_TOKEN || env.taomkeldi_bot || '',
    botEnabled: env.BOT_ENABLED !== '0',
    port: intEnv(env, 'PORT', 3000),
    dbPath: env.DB_PATH || path.join(dataDir, 'taomkeldi.db'),
    uploadsDir: env.UPLOADS_DIR || path.join(dataDir, 'uploads'),
    webappUrl: env.WEBAPP_URL || '',
    webapp: checkWebappUrl(env.WEBAPP_URL),
    // Taklif havolalari uchun. Bot ishga tushganda getMe orqali to'ldiriladi.
    botUsername: env.BOT_USERNAME || '',
    // Platforma adminlari faqat shu aniq ID'lardan (ADMIN_CHAT_ID — eski nom, moslik uchun).
    platformAdminIds: parseIds(env.PLATFORM_ADMIN_IDS || env.ADMIN_CHAT_ID),
    // initData eskirish chegarasi (soniya). Standart: 24 soat.
    initDataMaxAgeSec: intEnv(env, 'INITDATA_MAX_AGE_SEC', 24 * 60 * 60),
    // Faqat lokal test: X-Dev-User sarlavhasi bilan kirish. Production'da hech qachon yoqilmaydi.
    devAuth: devAuthRequested && !isProduction,
    // Faqat test/bootstrap: admin hali yo'q bo'lsa birinchi /start bosgan admin bo'ladi. Production'da o'chiq.
    autoAdmin: autoAdminRequested && !isProduction,
    uploadMaxBytes: intEnv(env, 'UPLOAD_MAX_BYTES', 5 * 1024 * 1024),
    // Onlayn to'lov (Telegram Payments). Token bo'lmasa onlayn to'lov umuman ko'rsatilmaydi.
    payments: {
      providerToken: env.PAYMENT_PROVIDER_TOKEN || '',
      currency: env.PAYMENT_CURRENCY || 'UZS',
      // Karta o'tkazmasi / onlayn to'lov kutish muddati (daqiqa).
      pendingTimeoutMin: intEnv(env, 'PAYMENT_TIMEOUT_MIN', 30),
    },
    // Xarita plitkalari (Mini App). OSM standart serveri faqat kichik yuklama uchun; ko'p foydalanuvchida
    // provayderni MAP_TILE_URL orqali almashtiring va attribution'ni saqlang.
    map: {
      tileUrl: env.MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: env.MAP_ATTRIBUTION || '© OpenStreetMap contributors',
    },
    // Manzil qidiruvi (server proksi). Nominatim qoidasi: 1 so'rov/soniya, aniq User-Agent.
    geocoder: {
      enabled: env.GEOCODER_ENABLED !== '0',
      url: (env.GEOCODER_URL || 'https://nominatim.openstreetmap.org').replace(/\/$/, ''),
      userAgent: env.GEOCODER_USER_AGENT || 'Taomkeldi/0.5 (Telegram food delivery app, Jizzakh)',
    },
    warnings: [],
  };

  if (devAuthRequested && isProduction) config.warnings.push('DEV_AUTH production muhitida e\'tiborsiz qoldirildi.');
  if (autoAdminRequested && isProduction) config.warnings.push('AUTO_ADMIN production muhitida e\'tiborsiz qoldirildi.');
  if (!config.webapp.ok) config.warnings.push(`Mini App: ${config.webapp.reason}. Bot "Ilovani ochish" tugmasini ko'rsatmaydi.`);
  if (isProduction && config.platformAdminIds.length === 0) {
    config.warnings.push('PLATFORM_ADMIN_IDS berilmagan: platforma administratori yo\'q.');
  }
  return config;
}
