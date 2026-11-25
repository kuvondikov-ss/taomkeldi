// SQLite zaxira nusxasi: ishlab turgan bazadan izchil nusxa (VACUUM INTO). Bot va HTTP to'xtatilmaydi.
// Ishlatish: node scripts/backup.mjs [manba.db] [nusxa.db]
//   standart manba: $DB_PATH yoki $DATA_DIR/taomkeldi.db; standart nusxa: <DATA_DIR>/backups/taomkeldi-YYYYMMDD-HHMMSS.db
// Tiklash: docs/OPERATIONS.md → "Zaxira va tiklash".
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const dataDir = process.env.DATA_DIR || './data';
const src = process.argv[2] || process.env.DB_PATH || path.join(dataDir, 'taomkeldi.db');
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
const dst = process.argv[3] || path.join(path.dirname(src), 'backups', `taomkeldi-${stamp}.db`);
if (!fs.existsSync(src)) { console.error(`Baza topilmadi: ${src}`); process.exit(1); }
if (fs.existsSync(dst)) { console.error(`Nusxa fayli allaqachon bor: ${dst}`); process.exit(1); }
fs.mkdirSync(path.dirname(dst), { recursive: true });
const db = new DatabaseSync(src, { readOnly: true });
db.prepare('VACUUM INTO ?').run(dst);
db.close();
// Tekshiruv: nusxa ochiladi va yaxlit.
const check = new DatabaseSync(dst, { readOnly: true });
const ok = check.prepare('PRAGMA integrity_check').get();
const v = check.prepare('SELECT MAX(id) AS v FROM schema_migrations').get().v;
const orders = check.prepare('SELECT COUNT(*) AS n FROM orders').get().n;
check.close();
console.log(`Zaxira: ${dst} (${fs.statSync(dst).size} bayt), integrity: ${Object.values(ok)[0]}, migratsiya: ${v}, buyurtmalar: ${orders}`);
