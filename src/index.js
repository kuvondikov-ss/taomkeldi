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
  await bot.start();
}

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
