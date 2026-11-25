# Taomkeldi

Jizzax viloyatidagi kafe va restoranlardan taom buyurtma qilish va yetkazib berish platformasi.
Bot: [@taomkeldi_bot](https://t.me/taomkeldi_bot). DasturXona'ning yangi loyihasi.

Holat: 14-bosqich (restoran kuryerlari va dispetcher) bajarildi. Batafsil — [docs/PROGRESS.md](docs/PROGRESS.md), qarorlar — [docs/PROJECT_CONTEXT.md](docs/PROJECT_CONTEXT.md).

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
| GET | `/api/courier/dashboard` | kuryer ekrani: smenalar, joriy buyurtmalar, takliflar, bugungi statistika, tarix |
| POST | `/api/courier/shift` `{courier_id, online}` | Ishga chiqdim / Ishni tugatdim |
| POST | `/api/courier/offers/:id/accept\|decline` | taklif: birinchi qabul qilgan oladi (409 `taken`) |
| POST | `/api/courier/orders/:id/pickup\|deliver\|release\|problem` | olib ketdim, yetkazdim, voz kechish (faqat olib ketishdan oldin), muammo |
| GET | `/api/panel/restaurants/:rid` | ega, menejer (karta maskalangan), admin |
| GET | `/api/panel/restaurants/:rid/orders` | ega, menejer, admin |
| PUT | `/api/panel/restaurants/:rid/payment` | faqat ega |
| POST | `/api/panel/restaurants/:rid/uploads` | ega, menejer, admin (JPG/PNG/WEBP, 5 MB) |
| GET | `/api/config` | xarita, hudud (`/geo/jizzax.json`) |
| GET | `/api/geo/check`, `/api/geo/search?q=`, `/api/geo/reverse` | hudud tekshiruvi, manzil qidiruvi (faqat Jizzax viloyati) |
| PUT | `/api/addresses/:id`; POST `/api/addresses/:id/default` | o'z manzilini tahrirlash / asosiy qilish |
| GET | `/api/restaurants?address_id=` (yoki `lat,lon`) `&cuisine=&promo=1&sort=recommended\|rating\|fast\|cheap_delivery` | manzilga yetkazadigan faol restoranlar + mavjud oshxona turlari |
| GET | `/api/restaurants/:id?address_id=` | restoran sahifasi va menyu |
| GET | `/api/search?q=&address_id=` | restoran va taom qidiruvi |
| POST | `/api/cart/check` | savatni tekshirish: joriy narx, stop-list, restoran holati, minimal summa |
| POST | `/api/checkout/quote` | yakuniy hisob (taomlar, yetkazish, bepul yetkazish, jami, to'lov usullari, muammolar) |
| POST | `/api/orders` | buyurtma yaratish (`idempotency_key`, `expected_total`); 409 `PRICE_CHANGED` / `CANNOT_ORDER` |
| POST | `/api/orders/:id/cancel` | mijoz bekor qilishi (faqat ruxsat etilgan bosqichda) |
| POST | `/api/panel/orders/:id/status` | xodim/kuryer/admin: holatni o'zgartirish (`to`, `reason`, `prep_minutes`) |
| PUT | `/api/me/contact` | qabul qiluvchi ismi va telefoni |
| POST | `/api/orders/:id/payment-claim` | mijoz: "To'ladim" (karta o'tkazmasi) |
| POST | `/api/orders/:id/invoice` | mijoz: onlayn to'lov havolasi (Telegram Payments) |
| POST | `/api/panel/orders/:id/payment` | xodim: `confirm` / `reject` (sabab bilan) / `refunded` (ega, admin) |
| PUT | `/api/panel/restaurants/:rid/payment-methods` | ega: naqd / karta o'tkazmasi / onlayn |
| GET/PUT/DELETE | `/api/favorites`, `/api/favorites/:rid` | sevimlilar |
| GET | `/api/cuisines`; PUT `/api/panel/restaurants/:rid/cuisines` | oshxona turlari |
| PUT | `/api/panel/restaurants/:rid/location` | restoran nuqtasi va radiusi (ega, menejer) |
| GET/POST | `/api/panel/restaurants/:rid/invites` | taklif havolalari: ega (`kind=owner`) — admin, menejer — ega, kuryer — ega/menejer |
| DELETE | `/api/panel/restaurants/:rid/invites/:id` | taklifni bekor qilish |
| GET/POST | `/api/admin/restaurants` | platforma admini |
| POST | `/api/applications`; GET `/api/applications/mine` | restoran arizasi (nom, telefon, tavsif, nuqta, oshxona turlari) |
| GET | `/api/admin/overview`, `/api/admin/restaurants/list?status=` | platforma ko'rsatkichlari va restoranlar |
| POST | `/api/admin/restaurants/:id/approve\|reject\|block\|unblock` | qarorlar (rad va bloklash — sabab bilan) |
| POST | `/api/admin/demo/delete` `{confirm:"DEMO"}` | faqat demo restoranlarni o'chirish |
| GET | `/api/panel/restaurants/:rid/readiness` | egasining tayyorlik ro'yxati |
| GET | `/api/panel/restaurants/:rid/board?group=new\|preparing\|ready\|on_way\|done` | panel buyurtmalari |
| POST | `/api/panel/orders/:id/courier` | o'z kuryerini biriktirish/almashtirish |
| GET/POST/PUT/DELETE | `/api/panel/restaurants/:rid/menu`, `/categories[/:cid]`, `/categories-order`, `/products[/:pid]`, `/products/:pid/availability` | menyu |
| GET/POST/PUT/DELETE | `/api/panel/restaurants/:rid/couriers[/:cid]` | kuryerlar |
| GET/DELETE | `/api/panel/restaurants/:rid/staff[/:sid]` | xodimlar (olib tashlash — faqat ega) |
| PUT | `/api/panel/restaurants/:rid/operations` | ochiq/pauza, ish vaqti, tayyorlash vaqti, dispetcher (ega, menejer) |
| PUT | `/api/panel/restaurants/:rid/profile` | ma'lumot, rasm, yetkazish narxi/hududi, minimal, bepul, olib ketish (faqat ega) |
| GET | `/api/panel/restaurants/:rid/report` | hisobot (tushum — xarajatsiz) |
| GET/DELETE | `/api/panel/restaurants/:rid/group` | guruh holati / uzish (ega, menejer) |
| POST | `/api/panel/restaurants/:rid/group/check`, `/group/test` | botni tekshirish / sinov xabari (faqat aniq bosilganda) |

## Bot buyruqlari
Shaxsiy chat: `/start`, `/menu`, `/orders`, `/admin` (`/panel`), `/courier`, `/help`, `/id`. Guruh: `/bogla`, `/help`.
Guruhni ulash: botni xodimlar guruhiga qo'shing → guruh admini bo'lgan ega yoki menejer `/bogla` yuboradi (kerak bo'lsa, mavzu ichida) → restoranni tasdiqlaydi. Holat va sinov xabari — panel → Sozlamalar.
Matnlar: `src/i18n/uz.js`, `src/i18n/ru.js` (kalitlar bir xil bo'lishi shart). Barcha xabarlar katalogi — [docs/message-catalog.md](docs/message-catalog.md); buyurtma shablonlari — `src/services/templates.js`.
Xabarlar `notifications` navbati orqali yuboriladi: yuborilmagani har 15 soniyada qayta uriniladi (platforma ko'rsatkichlarida ko'rinadi).

## Ma'lumot manbalari va litsenziyalar
- Viloyat chegarasi, xarita plitkalari, manzil qidiruvi: © OpenStreetMap contributors (ODbL 1.0).
- Leaflet (BSD-2), Montserrat (SIL OFL 1.1) — litsenziya fayllari public/vendor/leaflet/, public/fonts/ da.
