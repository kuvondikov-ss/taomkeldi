# Taomkeldi

Jizzax viloyatidagi kafe va restoranlardan taom buyurtma qilish va yetkazib berish platformasi.
Bot: [@taomkeldi_bot](https://t.me/taomkeldi_bot). DasturXona'ning yangi loyihasi.

Holat: 4-bosqich (bot kirishi, menyu, tillar) bajarildi. Batafsil — [docs/PROGRESS.md](docs/PROGRESS.md), qarorlar — [docs/PROJECT_CONTEXT.md](docs/PROJECT_CONTEXT.md).

## Texnologiyalar
Node.js 22.13+ · Express 5 · grammY · `node:sqlite` · oddiy HTML/CSS/JS (Mini App).

## Ishga tushirish (lokal)
```bash
npm install
cp .env.example .env     # BOT_TOKEN va PLATFORM_ADMIN_IDS ni to'ldiring
npm start
```
Railway'dagi bot ishlab turgan paytda lokal botni yoqmang (bir token — bitta nusxa): `.env` ga `BOT_ENABLED=0` yozing, faqat HTTP ishlaydi.
Lokal API sinovi uchun `DEV_AUTH=1` va `X-Dev-User: <telegram id>` sarlavhasi.

## Dizayn tizimi
[docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md). Lokal serverda namuna: `http://localhost:3000/ui-kit.html`.
Logo variantlari: `node scripts/brand-variants.mjs`. Rang kontrasti: `node scripts/contrast.mjs`.

## Testlar
```bash
npm test
```
Har test alohida vaqtinchalik bazada ishlaydi; Telegram'ga hech narsa yuborilmaydi.

## Tuzilma
```
src/index.js        kirish nuqtasi
src/config.js       muhit o'zgaruvchilari
src/db/             SQLite ulanishi va migratsiyalar
src/services/       biznes qoidalari (API ham, bot ham shu yerni chaqiradi)
src/http/           Express: initData autentifikatsiyasi, API, xatolar
src/bot/            grammY bot
public/             Mini App statik fayllari
test/               node:test sinovlari
docs/               loyiha hujjatlari
legacy/             1-bosqichgacha ishlagan oddiy bot (faqat ma'lumot uchun, ishga tushirilmaydi)
```

## API (2-bosqich)
Barcha `/api/*` so'rovlari `Authorization: tma <Telegram.WebApp.initData>` talab qiladi.
Xato javobi: `{ "ok": false, "error": { "code": "FORBIDDEN", "message": "..." } }`.

| Metod | Yo'l | Kim |
|---|---|---|
| GET | `/health` | hamma |
| GET | `/api/me` | foydalanuvchi va rollari |
| PUT | `/api/me/lang` | til (`uz`/`ru`) |
| GET/POST | `/api/addresses` | o'z manzillari |
| DELETE | `/api/addresses/:id` | o'z manzili |
| GET | `/api/orders`, `/api/orders/:id` | mijoz (o'ziniki), xodim (o'z restorani), kuryer (o'ziga biriktirilgan), admin |
| GET | `/api/courier/orders` | kuryer |
| GET | `/api/panel/restaurants/:rid` | ega, menejer (karta maskalangan), admin |
| GET | `/api/panel/restaurants/:rid/orders` | ega, menejer, admin |
| PUT | `/api/panel/restaurants/:rid/payment` | faqat ega |
| POST | `/api/panel/restaurants/:rid/uploads` | ega, menejer, admin (JPG/PNG/WEBP, 5 MB) |
| GET/POST | `/api/panel/restaurants/:rid/invites` | taklif havolalari: ega (`kind=owner`) — admin, menejer — ega, kuryer — ega/menejer |
| DELETE | `/api/panel/restaurants/:rid/invites/:id` | taklifni bekor qilish |
| GET/POST | `/api/admin/restaurants` | platforma admini |

## Bot buyruqlari
Shaxsiy chat: `/start`, `/menu`, `/orders`, `/admin` (`/panel`), `/courier`, `/help`, `/id`. Guruh: `/bogla`, `/help`.
Matnlar: `src/i18n/uz.js`, `src/i18n/ru.js` (kalitlar bir xil bo'lishi shart).
