# Taomkeldi — ishga tushirish va texnik xizmat

## Railway (mavjud loyiha)
- Loyiha: **delivo-bot** (`4a5dd424-…`), muhit: production, servis: **Taomkeldi**. Ikkinchi nusxa yaratilmaydi, boshqa Railway loyihalariga tegilmaydi.
- Qurish: Railpack (`railway.json`), ishga tushirish: `npm start`, healthcheck: `GET /health` (baza o'qilmasa 503), qayta ishga tushirish: xatoda, 10 marta.
- Bot long polling bilan ishlaydi → **bir vaqtda faqat bitta nusxa** (replicas = 1). Ikkinchi nusxa paydo bo'lsa Telegram 409 qaytaradi, jarayon to'xtaydi va Railway qayta ishga tushiradi. SIGTERM'da bot to'xtatiladi va HTTP yopiladi.

### 2026-11-25 dagi holat (faqat o'qib tekshirildi)
| Narsa | Holat |
|---|---|
| Servis | `Taomkeldi`, 1 replika, region iad, oxirgi deploy SUCCESS (eski oddiy bot) |
| Volume | **yo'q** — hozirgi holatda har deployda ma'lumot o'chadi |
| Domen | **yo'q** — Mini App uchun HTTPS manzil yo'q |
| O'zgaruvchilar (faqat nomlar) | `ADMIN_CHAT_ID`, `taomkeldi_bot` (token; kod `BOT_TOKEN` yoki shu nomni o'qiydi) |

### "deploy qil" buyrug'idan keyin bajariladigan reja
1. `Taomkeldi` servisiga volume qo'shish, mount: `/data`.
2. O'zgaruvchilar: `DATA_DIR=/data` (baza `/data/taomkeldi.db`, rasmlar `/data/uploads`).
3. Servisga Railway domeni → `WEBAPP_URL=https://<domen>` (BotFather'dagi Mini App/menyu tugmasi shu manzil; bot ishga tushganda menyu tugmasini o'zi o'rnatadi).
4. Ixtiyoriy: `PLATFORM_ADMIN_IDS` (`ADMIN_CHAT_ID` ham o'qiladi), `PAYMENT_PROVIDER_TOKEN` (onlayn to'lov).
5. Aynan tekshirilgan commit'ni deploy qilish (GitHub `main` dagi oxirgi commit).
6. Tekshiruv: deployment holati, `/health` (`db: ok`, `migration: 10`, `bot: running`), loglarda xato yo'qligi, `/start` javobi, Mini App ochilishi, qayta deploydan keyin ma'lumot saqlanishi.

## Muhit o'zgaruvchilari (faqat nomlari)
Majburiy: `BOT_TOKEN` (yoki `taomkeldi_bot`), `PLATFORM_ADMIN_IDS` (yoki `ADMIN_CHAT_ID`), `DATA_DIR` (volume), `WEBAPP_URL` (HTTPS).
Ixtiyoriy: `DB_PATH`, `UPLOADS_DIR`, `PORT` (Railway beradi), `BOT_USERNAME`, `PAYMENT_PROVIDER_TOKEN`, `PAYMENT_CURRENCY`, `PAYMENT_TIMEOUT_MIN`, `INITDATA_MAX_AGE_SEC`, `UPLOAD_MAX_BYTES`, `MAP_TILE_URL`, `MAP_ATTRIBUTION`, `GEOCODER_ENABLED`, `GEOCODER_URL`, `GEOCODER_USER_AGENT`.
Production'da avtomatik o'chiq: `DEV_AUTH`, `AUTO_ADMIN` (Railway `RAILWAY_ENVIRONMENT_NAME=production` ni o'zi beradi).
Tafsilot: [.env.example](../.env.example).

## Runtime
Node.js `>=22.13 <25` (`node:sqlite`), lokal sinov — v24. `package-lock.json` bilan `npm ci` mos (bog'liqliklar: express 5, grammy, dotenv, leaflet, montserrat; dev — sharp, resvg).

## Migratsiyalar
- `src/db/migrations.js` — ketma-ket, faqat qo'shuvchi (additive). Ishga tushishda avtomatik qo'llanadi, `schema_migrations` jadvalida yoziladi, har biri tranzaksiyada.
- Hozirgi versiya: **10** (`/health` da `migration`). Yangi migratsiya qo'shishdan oldin zaxira oling.

## Zaxira va tiklash
Zaxira (ishlab turgan tizimda, to'xtatmasdan; `VACUUM INTO` — izchil nusxa, `integrity_check` bilan):
```bash
node scripts/backup.mjs                       # DATA_DIR/backups/taomkeldi-YYYYMMDD-HHMMSS.db
node scripts/backup.mjs /data/taomkeldi.db /data/backups/qo'lda.db
```
Railway'da: servis shell'ida (`railway ssh` yoki dashboard → Shell) shu buyruq. Nusxani volume'dan tashqariga ham ko'chiring.

Tiklash:
1. Servisni to'xtating (yoki replikani 0 qiling) — bot va HTTP bazaga yozmasin.
2. `/data/taomkeldi.db` ni nusxa bilan almashtiring; yonidagi `taomkeldi.db-wal` va `taomkeldi.db-shm` fayllarini o'chiring.
3. Servisni yoqing; `/health` da `db: ok` va kutilgan `migration` versiyasi.
Rasmlar (`/data/uploads`) alohida papka — kerak bo'lsa u ham nusxalanadi.

## Orqaga qaytish (rollback)
Railway → Deployments → oldingi muvaffaqiyatli deploy → Rollback. Baza migratsiyalari qo'shuvchi bo'lgani uchun eski kod yangi ustunlar bilan ishlay oladi; jiddiy o'zgarishdan oldin zaxira oling.

## Xabarlar navbati
Yuborilmagan bot xabarlari `notifications` jadvalida qoladi va har 15 soniyada qayta uriniladi (restartdan keyin ham). Platforma ko'rsatkichlarida: "Bot xabarlari navbatda" / "Yuborilmagan xabarlar". `/health` ham navbat holatini ko'rsatadi.
