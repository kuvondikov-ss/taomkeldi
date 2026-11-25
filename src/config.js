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
    // Platforma adminlari faqat shu aniq ID'lardan (ADMIN_CHAT_ID — eski nom, moslik uchun).
    platformAdminIds: parseIds(env.PLATFORM_ADMIN_IDS || env.ADMIN_CHAT_ID),
    // initData eskirish chegarasi (soniya). Standart: 24 soat.
    initDataMaxAgeSec: intEnv(env, 'INITDATA_MAX_AGE_SEC', 24 * 60 * 60),
    // Faqat lokal test: X-Dev-User sarlavhasi bilan kirish. Production'da hech qachon yoqilmaydi.
    devAuth: devAuthRequested && !isProduction,
    // Faqat test/bootstrap: admin hali yo'q bo'lsa birinchi /start bosgan admin bo'ladi. Production'da o'chiq.
    autoAdmin: autoAdminRequested && !isProduction,
    uploadMaxBytes: intEnv(env, 'UPLOAD_MAX_BYTES', 5 * 1024 * 1024),
    warnings: [],
  };

  if (devAuthRequested && isProduction) config.warnings.push('DEV_AUTH production muhitida e\'tiborsiz qoldirildi.');
  if (autoAdminRequested && isProduction) config.warnings.push('AUTO_ADMIN production muhitida e\'tiborsiz qoldirildi.');
  if (isProduction && config.platformAdminIds.length === 0) {
    config.warnings.push('PLATFORM_ADMIN_IDS berilmagan: platforma administratori yo\'q.');
  }
  return config;
}
