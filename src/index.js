// Kirish nuqtasi: config → DB (migratsiyalar) → services → HTTP + bot.
import { loadConfig } from './config.js';
import { openDb } from './db/index.js';
import { createServices } from './services/index.js';
import { createApp } from './http/app.js';
import { createBot } from './bot/index.js';

const config = loadConfig();
for (const w of config.warnings) console.warn(`Ogohlantirish: ${w}`);

const db = openDb(config.dbPath);
const services = createServices(db, config);
const app = createApp({ config, services });

const server = app.listen(config.port, () => {
  console.log(`HTTP: ${config.port}-portda. Baza: ${config.dbPath}${config.devAuth ? ' (DEV_AUTH yoqilgan)' : ''}`);
});

let bot = null;
if (!config.botToken) {
  console.warn('BOT_TOKEN yo\'q: bot ishga tushirilmadi (faqat HTTP).');
} else if (!config.botEnabled) {
  console.warn('BOT_ENABLED=0: bot ishga tushirilmadi (faqat HTTP).');
} else {
  bot = createBot({ config, services });
  services.setBotApi(bot.bot.api); // xabarlar va onlayn to'lov havolasi uchun
  await bot.start();
}
if (config.payments.providerToken && !bot) console.warn('PAYMENT_PROVIDER_TOKEN bor, lekin bot ishlamayapti: onlayn to\'lov ko\'rsatilmaydi.');

// Muddati o'tgan to'lovlarni bekor qilish (har daqiqada).
const expiryTimer = setInterval(() => {
  try {
    const n = services.payments.expirePending();
    if (n) console.log(`To'lov muddati o'tgan ${n} ta buyurtma bekor qilindi.`);
  } catch (e) {
    console.error('To\'lov muddatini tekshirishda xato:', e);
  }
}, 60_000);
expiryTimer.unref();

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  try {
    await bot?.stop();
  } catch { /* bot allaqachon to'xtagan */ }
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
