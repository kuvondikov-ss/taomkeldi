# Taomkeldi — bosqichlar holati

Oxirgi yangilanish: 2026-11-25. Doimiy qarorlar — [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md).

## Bosqichlar

| # | Bosqich | Holat |
|---|---|---|
| 1 | Loyiha pasporti va ish qoidalari | ✅ bajarildi (2026-11-25) |
| 2 | Texnik asos, ma'lumotlar va rollar | ✅ bajarildi lokal, 40/40 test (2026-11-25); deploy qilinmagan |
| 3 | Brend, logo va dizayn tizimi | ✅ bajarildi, 43/43 test (2026-11-25) — [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) |
| 4 | Bot kirishi, menyusi va tillari | ✅ bajarildi lokal, 75/75 test (2026-11-25); Telegram'da jonli sinalmagan |
| 5 | Jizzax hududi va manzil | ✅ bajarildi lokal, 103/103 test (2026-11-25); Telegram ichida sinalmagan |
| 6 | Bosh sahifa, qidiruv, saralash | ✅ bajarildi lokal, 122/122 test (2026-11-25); banner fotosi qo'yildi |
| 7 | Restoran menyusi va taom oynasi | ✅ bajarildi lokal, 131/131 test (2026-11-25) |
| 8 | Savat, checkout, buyurtma holatlari | ✅ bajarildi lokal, 150/150 test (2026-11-25); restoranga xabar — 12/13-bosqichda |
| 9 | Naqd, karta o'tkazmasi, onlayn to'lov | ✅ bajarildi lokal, 166/166 test (2026-11-25); onlayn to'lov haqiqiy provayder bilan sinalmagan |
| 10 | Platforma paneli va restoran ulash | ✅ bajarildi lokal, 176/176 test (2026-11-25) |
| 11 | Restoran panelining bo'limlari | ✅ bajarildi lokal, 190/190 test (2026-11-25) |
| 12 | Botni restoran guruhiga ulash | ✅ bajarildi lokal, 219/219 test (2026-11-25) |
| 13 | Bot xabarlari va tugmalar | ✅ bajarildi lokal, 241/241 test (2026-11-25) |
| 14 | Restoran kuryerlari va dispetcher | ✅ bajarildi lokal, 259/259 test (2026-11-25) |
| 15 | Jonli kuzatuv, tarix, profil | ✅ bajarildi lokal, 273/273 test (2026-11-25) |
| 16 | "Bepul yetkazib berish" bo'limi | ✅ bajarildi lokal, 284/284 test (2026-11-25) |
| 17 | Barcha ekranlarning yakuniy dizayni | ✅ bajarildi lokal, 284/284 test (2026-11-25) — [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md#17-bosqich-yakuniy-korinish-tekshiruvi-2026-11-25) |
| 18 | Yakuniy sinov, Railway, topshirish | ✅ 290/290 test; **production deploy 2026-11-25** (`bd39cd3`, https://taomkeldi-production.up.railway.app) — [OPERATIONS.md](OPERATIONS.md) |

## Production holati
Railway'da hali **1-bosqichgacha bo'lgan oddiy bot** ishlaydi (kodi endi `legacy/simple-bot.js`). 2-bosqich kodi deploy qilinmagan. Deploydan oldin: Railway volume, Node 22.13+ ekanini tekshirish va `PLATFORM_ADMIN_IDS` (yoki mavjud `ADMIN_CHAT_ID`). Yangi kod deploy qilinsa, oddiy botdagi "matn bilan buyurtma" oqimi yo'qoladi: buyurtma Mini App orqali 8-bosqichda qaytadi.

## Imkoniyatlar jadvali

| Imkoniyat | Bosqich | Holat | Dalil |
|---|---|---|---|
| Express + bot + Mini App statik fayllari bitta jarayonda | 2 | mavjud | `src/index.js`, `src/http/app.js`, `public/index.html`; lokal smoke: `/health`, `/api/me`, `/` → 200 |
| Services qatlami (API va bot shu yerni chaqiradi) | 2 | mavjud | `src/services/*` |
| SQLite + migratsiyalar (faqat qo'shiluvchi) | 2 | mavjud | `src/db/migrations.js`; test "baza qayta ochilganda…" |
| 14 jadval: users … order_messages | 2 | mavjud | test "14 ta asosiy jadval mavjud" |
| Pul — butun so'm INTEGER, CHECK ≥ 0 | 2 | mavjud | `src/lib/validate.js` `money()`; test "kasr yoki manfiy narx…" |
| order_items snapshot (nom, narx, miqdor) | 2 | mavjud | `orders.createRecord`; test "snapshot" |
| initData server tekshiruvi (imzo, auth_date, kelajak, eskirish) | 2 | mavjud | `src/http/initData.js`; 7 ta test |
| DEV_AUTH faqat lokal | 2 | mavjud | `src/config.js`; test "production'da DEV_AUTH…" |
| AUTO_ADMIN faqat test/bootstrap; production adminlari ID ro'yxatidan | 2 | mavjud | `users.bootstrapAutoAdmin`, `access.isPlatformAdmin`; 2 ta test |
| Rollar restoran doirasida (mijoz/ega/menejer/kuryer/admin) | 2 | mavjud | `src/services/access.js`; API testlari |
| Egasiga xos amal (to'lov rekvizitlari), menejerga karta maskalangan | 2 | mavjud | `restaurants.updatePayment`, `toPanelView`; 2 ta test |
| Barqaror xato kodlari, uz/ru matn, mos HTTP status | 2 | mavjud | `src/lib/errors.js`; testlar |
| Upload turi (fayl imzosi) va hajmi | 2 | mavjud | `src/services/uploads.js`; 4 ta test |
| Idempotency (dublikat buyurtma himoyasi) | 2/8 | qisman | `createRecord` `idempotencyKey`; checkout API 8-bosqichda |
| order_events (kim, qachon, nima) | 2/8 | qisman | `created` hodisasi yoziladi; holat o'tishlari 8-bosqichda |
| Dizayn tizimi, logo | 3 | mavjud | `public/css/tokens.css`, `components.css`, `js/ui/*`, `brand/*`; `test/design.test.js` |
| `/start` aynan matn, asosiy tugmalar, rolga qarab tugmalar | 4 | mavjud | `src/bot/index.js` `mainKeyboard`; testlar "Bot: /start va rolga qarab menyu" |
| `/menu /orders /admin /panel /courier /help /id` | 4 | mavjud | `src/bot/index.js`; testlar |
| `/bogla` (guruh) | 12 | mavjud | `src/bot/group.js`: xodim + guruh admini + bot yoza oladi; anonim admin rad; mavzu (topic); boshqa guruhga ko'chirish; testlar "Guruh: /bogla va huquqlar" |
| Guruhda bitta asosiy buyurtma xabari (yuborish → tahrir → o'chirilsa nazoratli yangi nusxa) | 12 | mavjud | `services/group.js` `syncOrder`, `order_messages`; buyurtma bo'yicha navbat (dublikat yo'q) |
| Guruh tugmalari (qabul 15/30/45, rad sabablari, to'lov keldi/kelmadi, tayyor, kuryerga, yetkazildi), vakolat serverda | 12 | mavjud | `o:<id>:<amal>` → `orders.transition` / `payments`; begona va boshqa restoran xodimi — rad; eskirgan tugma — ogohlantirish + yangilash |
| Mini App guruhdan — deep link `start=o_<id>` (guruhda web_app yo'q) | 12 | mavjud | shaxsiy chatda faqat xodimga panel tugmasi |
| Bot chiqarildi / huquq yo'q / supergroup migratsiyasi / o'chirilgan mavzu | 12 | mavjud | `my_chat_member`, `migrate_to_chat_id`, xato tasnifi; xodimlarga shaxsiy xabar va buyurtmalar shaxsiy xabarda (zaxira) |
| Yagona xabar shablonlari (restoran, mijoz, kuryer), escape, ixcham callback, 4096 chegarasi | 13 | mavjud | `services/templates.js`, katalog — [message-catalog.md](message-catalog.md) |
| Mijozga faqat muhim bosqichlar, har biri bir marta (dedupe) | 13 | mavjud | `services/order-notify.js`; "qabul qilindi" faqat restoran qabul qilgach |
| Kuryerga bitta jonli xabar: yo'nalish, naqd summa, "Olib ketdim"/"Yetkazdim"; almashsa eskisi tugmasiz | 13 | mavjud | `c:<id>:pk`, `c:<id>:dl`; "Voz kechish" — 14-bosqich |
| Ishonchli yuborish: outbox, qayta urinish, retry_after, dedupe, bloklaganlarga to'xtash | 13 | mavjud | `services/outbox.js`, `notifications` jadvali (migratsiya 8); admin ko'rsatkichida navbat |
| Har callback javob oladi (eski/noma'lum tugma ham) | 13 | mavjud | `bot/index.js` oxirgi `callback_query:data` |
| Panel: guruh holati, tekshirish, sinov xabari (faqat aniq bosilganda), uzish | 12 | mavjud | `/api/panel/restaurants/:rid/group[/check|/test]`, `views/panel-settings.js` |
| Mini App tugmasi va menyu tugmasi (HTTPS) | 4 | mavjud | `config.checkWebappUrl`, `setChatMenuButton`; noto'g'ri manzil — /admin'da diagnostika |
| Taklif havolalari (ega/menejer/kuryer), bir martalik, xesh, muddat | 4 | mavjud | `src/services/invites.js`, `invites` jadvali; 9 ta test |
| Restoran ulash yo'li (bot orqali ariza) | 4/10 | qisman | Ariza → `pending` restoran + adminga xabar; tasdiqlash 10-bosqichda |
| UZ/RU markaziy tarjima fayllari | 4 | mavjud | `src/i18n/{uz,ru}.js`; kalitlar tengligi testi |
| Til: Telegram'dan taxmin, tanlov ustun; bot va Mini App bir xil | 4 | mavjud | `users.langOf`, `lang:` tugmalari, `/api/me`; test "Tillar" |
| Guruhda shaxsiy menyu/web_app tugmasi chiqmaydi | 4 | mavjud | testlar "Bot: guruh" |
| Jizzax VILOYATI chegarasi (frontend va backend bir xil fayl/kod) | 5 | mavjud | `public/geo/jizzax.json` (OSM relation/196254), `public/js/shared/geo-core.js`; 10 ta chegara testi |
| Manzil tanlash: GPS/Telegram joylashuvi, xarita pini, qidiruv, saqlangan | 5 | mavjud | `public/js/app/views/picker.js`; brauzerda tekshirildi (GPS rad/xato/muvaffaqiyat, qidiruv topilmadi) |
| Manzil tanlanmaguncha restoranlar/qidiruv yopiq | 5 | mavjud | `main.js` `needsAddress` |
| Hududdan tashqari nuqta: xabar + "Manzilni o'zgartirish" | 5 | mavjud | picker; server `OUT_OF_AREA` 422 |
| Saqlangan manzillar: qo'shish, tahrirlash, o'chirish, asosiy | 5 | mavjud | `/api/addresses`, `views/addresses.js`; testlar |
| Restoran koordinatasi + radius, faqat qamrab oladiganlar | 5 | mavjud | `restaurants.listForPoint`, `PUT /api/panel/restaurants/:rid/location`; testlar |
| Yopiq restoran holati, buyurtma olinmasligi | 5/8 | qisman | Ro'yxatda `is_open`; `assertCanDeliver` tayyor, checkout 8-bosqichda |
| Yetkazish hisobi bitta funksiyada, "to'g'ri chiziq" deb yoziladi | 5 | mavjud | `geo-core.deliveryFee`, `distance_method: straight_line` |
| Bosh sahifa tartibi: header → manzil → qidiruv → banner → oshxona turlari → restoranlar | 6 | mavjud | `views/home.js`; 320/390 px, yorug'/to'q mavzuda ko'rildi |
| Banner (taom fotosi, sarlavha, "Tanlash" → restoranlar ro'yxati) | 6 | mavjud | `public/brand/banner-food.webp` (foydalanuvchi bergan tasvirdan, logosiz qism); 320/430 px, yorug'/to'q |
| Restoran kartasi: cover, nom, turlar, haqiqiy reyting, ETA, yetkazish narxi, ochiq/yopiq, sevimli | 6 | mavjud | `views/cards.js`; reyting faqat `rating_count > 0` bo'lsa |
| Oshxona turlari — manzildagi restoranlardan | 6 | mavjud | `catalog.home` `cuisines`; test |
| Saralash: tavsiya, reyting, tez, arzon yetkazish; aksiya — alohida filtr | 6 | mavjud | `catalog.SORTERS`; 8 ta test. Ochiq restoranlar har doim yopiqlardan oldin |
| Qidiruv: restoran va taom, so'nggi so'rovlar, natija turlari ajratilgan, taom → restoran sahifasida belgilanadi | 6 | mavjud | `/api/search`, `views/search.js`; 6 ta test |
| Sevimlilar | 6 | mavjud | `/api/favorites`, `views/favorites.js`, bosh sahifadagi yurakcha |
| Yuklanish / filtr bo'yicha bo'sh / hududda restoran yo'q — alohida holatlar | 6 | mavjud | `home.js` (`total_in_area`) |
| Restoran sahifasi: cover, nom, tur, ETA, narx, minimal summa, bepul yetkazish sharti, sevimli, "Batafsil" | 7 | mavjud | `views/restaurant.js`; ish vaqti — bo'lsa ko'rsatiladi (sozlash 11-bosqichda) |
| Yopishqoq kategoriya tablari (bosish → bo'lim, aylantirish → faol tab) | 7 | mavjud | `IntersectionObserver`; ←/→ klaviatura |
| 2 ustunli taom kartalari 4:3, chegirma, tugagan, tor ekranda miqdor to'liq kenglikda | 7 | mavjud | brauzerda 360 px |
| Taom oynasi (rasm, nom, tavsif, porsiya, narx, miqdor, "Savatga qo'shish · summa") | 7 | mavjud | tarkib/allergen o'ylab topilmaydi |
| Bitta taom bir nechta bo'limda — miqdor bitta holatdan | 7 | mavjud | "Ommabop" + kategoriya; brauzerda tekshirildi |
| Boshqa restoran taomi — tasdiqsiz savat o'chirilmaydi | 7 | mavjud | `cart-core.setQty` `conflict`; test + brauzer |
| Savat paneli (soni, summasi, "yetkazish alohida") | 7 | mavjud | `.cart-bar` |
| Savatdagi taom stop-listga tushsa — ogohlantirish va olib tashlash | 7/8 | mavjud | restoran sahifasi + `/api/cart/check`; checkout 8-bosqichda qayta tekshiradi |
| Orqaga qaytganda aylantirish va kategoriya holati | 7 | mavjud | `main.js` `scrollMemory` |
| Savat: miqdor, narx, olib tashlash, minimal summa, bepul yetkazishgacha qoldiq | 8 | mavjud | `views/cart.js` — checkout bilan bir xil quote |
| Checkout: turi → manzil → qabul qiluvchi → to'lov → izoh → summalar → bitta tugma | 8 | mavjud | `views/checkout.js`; saqlangan kontakt ixcham + "O'zgartirish" |
| Quote va buyurtma bitta hisob funksiyasidan; klient summasiga ishonilmaydi | 8 | mavjud | `services/checkout.js` `computeQuote`; testlar |
| Narx o'zgarsa — yangi summa ko'rsatilib, qayta tasdiq | 8 | mavjud | 409 `PRICE_CHANGED` + yangi quote |
| Idempotency (takror bosish, tarmoq qayta urinishi) | 8 | mavjud | `idempotency_key` + `BEGIN IMMEDIATE`; parallel so'rov testi |
| Holatlar va o'tishlar rol/turga qarab; yakunlangan buyurtma qayta ishlamaydi | 8 | mavjud | `orders.transition` (shartli UPDATE); 8 ta test |
| order_events (kim, qachon, nima) | 8 | mavjud | `created` + har bir `status` hodisasi |
| Mijoz bekor qilishi (new/pending_payment); keyin — restoran bilan bog'lanish | 8 | mavjud | `POST /api/orders/:id/cancel`, `views/order.js` |
| To'langan buyurtma bekor qilinsa — `refund_requested` (qaytarildi emas) | 8/9 | mavjud | test |
| Restoranga yangi buyurtma xabari | 12/13 | yo'q | Hozir buyurtma faqat API/panelda ko'rinadi |
| Naqd: mijoz to'lov summasini, kuryer olinadigan summani ko'radi; yetkazilganda `paid` | 9 | mavjud | `collect_amount`; olib ketishda "restoranda to'laysiz" |
| Karta o'tkazmasi: karta/egasi/summa, nusxalash, "To'ladim" → claimed+new → "To'lov keldi" → paid | 9 | mavjud | `services/payments.js`; brauzerda butun yo'l |
| Tasdiqlanmagan o'tkazma qabul qilinmaydi; pul kelmasa sabab bilan rad | 9 | mavjud | testlar |
| 30 daqiqalik muddat, kech to'lovda yordam matni | 9 | mavjud | `expirePending` (har daqiqa), `PAYMENT_TIMEOUT_MIN` |
| Karta rekvizitini faqat ega o'zgartiradi, menejerga maskalangan; CVV va h.k. so'ralmaydi | 9 | mavjud | 2-bosqichdan + to'lov usullari API'si faqat egaga |
| Onlayn (Telegram Payments): faqat token bo'lsa; pre_checkout tekshiruvi; `paid` faqat successful_payment'dan; takror to'lov hisoblanmaydi | 9 | qisman | Kod va testlar (Telegram API soxtalashtirilgan); haqiqiy provayder (Click/Payme) tokeni bilan sinalmagan |
| Qaytarish: so'raldi (`refund_requested`) va qaytarildi (`refunded`) alohida | 9 | mavjud | "qaytarildi"ni faqat ega/admin belgilaydi |
| Savat, checkout, holat o'tishlari | 8 | yo'q | Asos: `createRecord` |
| To'lovlar | 9 | yo'q | `payment_status` ustuni bor |
| A yo'l: ariza (nom, telefon, tavsif, Jizzaxdagi nuqta, oshxona turlari) | 10 | mavjud | `views/apply.js`, `POST /api/applications`; bot "Restoran ulash" Mini App formasiga yo'naltiradi (ilova bo'lmasa — botda qisqa ariza) |
| Admin qarori: tasdiq (ariza beruvchi — ega), rad (sabab), bloklash/faollashtirish (sabab); egaga xabar | 10 | mavjud | `services/platform.js`, `restaurant_events`; testlar |
| B yo'l: admin yaratadi → egasiga bir martalik havola (qayta chiqarish eskisini bekor qiladi) | 10 | mavjud | `views/admin.js` "Egasiga havola"; test |
| Platforma paneli: ko'rsatkichlar, arizalar, restoranlar, panelga kirish | 10 | mavjud | `views/admin.js`; brauzerda 390 px |
| Bloklangan restoran yangi buyurtma olmaydi | 10 | mavjud | test |
| Demo ma'lumotni o'chirish (faqat `is_demo`, "DEMO" deb yozib tasdiqlash) | 10 | mavjud | test: haqiqiy restoran va buyurtma qoladi |
| Egasining birinchi paneli — tayyorlik ro'yxati (7 band) | 10 | mavjud | `views/panel.js`, `/readiness` |
| Panel — buyurtmalar: 5 guruh, keyingi amal (15/30/45 daq, rad sabab bilan, tayyor, yo'lga, yetkazildi/topshirildi), to'lov tasdig'i, kuryer biriktirish, tafsilot (telefon, manzil, tarix), ovozli signal (yoqiladi/o'chiriladi) | 11 | mavjud | `views/panel-orders.js`, `/board`, `/panel/orders/:id/courier`; brauzerda |
| Panel — menyu: kategoriyalar (qo'shish, nom, tartib, o'chirish), taom formasi (uz/ru, porsiya, narx, eski narx, rasm, ommabop), stop-list | 11 | mavjud | `views/panel-menu.js`; xato narx/fayl — maydon nomi bilan |
| Panel — kuryerlar: qo'shish, taklif havolasi, holat, transport, bugungi yetkazish va naqd; faol buyurtmali kuryer uzilmaydi | 11 | mavjud | `views/panel-team.js`; test |
| Panel — xodimlar: menejer taklifi, rol, kirishni bekor qilish; o'zini va oxirgi egani olib tashlab bo'lmaydi | 11 | mavjud | test |
| Panel — sozlamalar: ochiq/pauza, ish vaqti (Toshkent vaqti, dam olish kunlari, yarim tundan o'tish), narx/radius/minimal/bepul, olib ketish, to'lov, guruh holati | 11 | mavjud | `views/panel-settings.js`, `shared/hours.js`; ish vaqtidan tashqarida buyurtma olinmaydi (test) |
| Panel — hisobot: bugun/7 kun, kunlar bo'yicha, o'rtacha, ommabop, naqd va oldindan to'langan; "tushum" (sof foyda emas) | 11 | mavjud | test |
| Ega va menejer farqi frontend va serverda | 11 | mavjud | `services/manage.js` boshidagi jadval |
| Restoran guruhi | 12 | mavjud | yuqoridagi 12-bosqich qatorlari |
| Xabar shablonlari, outbox | 13 | mavjud | yuqoridagi 13-bosqich qatorlari |
| Kuryerlar, dispetcher | 14 | mavjud | quyidagi 14-bosqich natijasi |
| Kuzatuv, profil, sevimlilar | 15 | mavjud | quyidagi 15-bosqich natijasi |
| Bepul yetkazish | 16 | mavjud | quyidagi 16-bosqich natijasi |

## 2-bosqich natijasi
- Yangi: `src/index.js`, `src/config.js`, `src/db/{index,migrations}.js`, `src/lib/{errors,validate}.js`, `src/services/{index,users,access,restaurants,orders,addresses,uploads}.js`, `src/http/{app,initData}.js`, `src/bot/index.js`, `public/index.html`, `test/{helpers,foundation.test}.js`, `README.md`.
- O'zgardi: `package.json` (Express, `start` → `src/index.js`, `test`, Node ≥ 22.13), `.env.example`.
- Ko'chirildi: `src/bot.js` → `legacy/simple-bot.js` (ishga tushirilmaydi).
- Sinov: `npm test` — 40/40 o'tdi. Lokal ishga tushirish (`BOT_ENABLED=0`, `DEV_AUTH=1`): `/health`, `/api/me`, `/` 200 qaytardi, baza fayli yaratildi.
- Sinalmagan: bot Telegram bilan jonli (Railway'dagi bot bilan to'qnashmaslik uchun lokal bot yoqilmadi); Mini App haqiqiy Telegram ichida (HTTPS manzil yo'q).

## Keyingi bosqichlar uchun bog'liqliklar
- Mini App uchun HTTPS manzil (`WEBAPP_URL`) — deployda Railway domeni; usiz bot ilova tugmasini ko'rsatmaydi va buni ochiq aytadi.
- Deploy (alohida topshiriq bilan): Railway volume → `DATA_DIR`, Node versiyasi, `PLATFORM_ADMIN_IDS`.
- Kod: https://github.com/kuvondikov-ss/taomkeldi (ochiq).

## 4-bosqich natijasi
- Yangi: `src/i18n/{index,uz,ru}.js`, `src/services/invites.js`, migratsiya 2 (`invites` jadvali, `restaurants.applicant_id`), `test/bot.test.js`.
- O'zgardi: `src/bot/index.js` (to'liq qayta yozildi), `src/config.js` (`checkWebappUrl`, `BOT_USERNAME`), `src/services/{restaurants,access,index}.js`, `src/http/app.js` (taklif API), `public/index.html` (til).
- Taklif havolasi: `t.me/<bot>?start=inv_<token>`; token bazada faqat SHA-256 xeshi; 7 kun; bir martalik; yangi egasi/kuryer havolasi avvalgisini bekor qiladi. Ommaviy havolalar (`r_<id>`) rol bermaydi.
- Sinov: 75/75 (botga 32 ta yangi test — Telegram API ushlab olinib, oflayn).
- Sinalmagan: haqiqiy Telegram'da (Railway'dagi eski bot shu tokenda ishlayapti — bir vaqtda ikkita nusxa bo'lmaydi); Mini App tugmasi (HTTPS manzil yo'q).

## 3-bosqich natijasi
- Palitra logodan (yashil), Montserrat (o'z serverimizdan), tokenlar, light/dark, reduced-motion.
- Komponentlar: tugma, maydon, karta, chip, tablar, sheet, dialog, toast, skeleton, holatlar, pastki navigatsiya, CTA; yagona SVG ikonkalar.
- Logo variantlari, bot avatari PNG (512), favikon, placeholder.
- Sinov: 43/43; kontrast skripti — barcha juftliklar AA; 320 va 430 px, yorug'/to'q mavzuda brauzerda ko'rildi.
- Tekshirilmagan: Telegram ichida (HTTPS yo'q), 360/390 px alohida.

## 5-bosqich natijasi
- Chegara: `scripts/fetch-jizzax-boundary.mjs` bilan OSM Nominatim'dan olindi (viloyat, ~1000 nuqta, ~50 m soddalashtirish). © OpenStreetMap contributors, ODbL.
- Server: `services/geo.js` (hudud, yetkazish), `services/geocoder.js` (Nominatim proksi: 1 so'rov/s, kesh, natijalar viloyat bilan cheklangan), `addresses` (hudud tekshiruvi, tahrir, asosiy), `restaurants` (`listForPoint`, `getPublic`, `assertCanDeliver`, `updateLocation`).
- Mini App: ilova qobig'i (marshrutlar, pastki navigatsiya, Telegram BackButton), xarita tanlovi (Leaflet), manzil shakli, manzillar, bosh sahifa (manzilga mos restoranlar), profil (til), buyurtmalar.
- Lokal ko'rish: `node --env-file=.env.preview scripts/seed-demo.mjs`, keyin `http://localhost:3917/?dev=301` (faqat `DEV_AUTH=1`).
- Sinov: 103/103; brauzerda 390 px: xarita, hududdan tashqari ogohlantirish, GPS (rad etildi / vaqt tugadi / muvaffaqiyat — brauzer API almashtirilib), qidiruv (qisqa / topilmadi), saqlash → bosh sahifa.
- Sinalmagan: Telegram ichida (LocationManager, haqiqiy GPS ruxsati), iOS/Android klaviaturasi, 320 px'da xarita ekrani.
- Cheklovlar: OSM plitka serveri faqat kichik yuklama uchun — ko'p foydalanuvchida `MAP_TILE_URL` bilan provayder kerak. Masofa to'g'ri chiziq bo'yicha.

## 6-bosqich natijasi
- Migratsiya 3: `rating_sum/rating_count`, `prep_minutes`, 11 ta oshxona turi.
- Server: `services/catalog.js` (ro'yxat + filtr + saralash, qidiruv, sevimlilar, restoran sahifasi, oshxona turlari), `geo-core.deliveryEta`.
- Mini App: bosh sahifa, qidiruv, sevimlilar, restoran sahifasi (menyu ro'yxati); filtrlar URL'da saqlanadi.
- Sinov: 122/122; brauzerda aksiya, oshxona turi, saralash, qidiruv (taom → restoran sahifasida belgilash), sevimlilar qo'shish/olib tashlash; 320 px to'q mavzu.
- Banner fotosi foydalanuvchi bergan tasvirdan qo'yildi (`docs/DESIGN_SYSTEM.md` → Marketing tasvirlari). Ochiq: restoran cover rasmlari (restoran paneli — 11-bosqich).

## 7-bosqich natijasi
- Yangi: `public/js/shared/cart-core.js` (savat qoidalari, Node'da test qilinadi), `public/js/app/cart.js`, `views/cart.js`, `POST /api/cart/check`.
- Qayta yozildi: `views/restaurant.js` (tablar, kartalar, taom oynasi, savat paneli).
- Tuzatildi: tasdiqlash dialogi natijani tugma bosilganda qaytaradi (fon rejimida `close` hodisasi kechikkan); `.alert` ichida tugma bo'lsa matn torayib qolmaydi.
- Sinov: 131/131; brauzerda 360 px: ikki bo'limdagi bir xil miqdor, tugagan taom, uzun nom, restoran almashtirish (bekor/tasdiq), taom oynasi, savat tekshiruvi (stop-list, narx o'zgarishi), orqaga qaytganda aylantirish joyi.
- Savat qurilmada saqlanadi (`localStorage`, foydalanuvchi bo'yicha); narx va mavjudlik har doim serverda qayta tekshiriladi.

## 8-bosqich natijasi
- Migratsiya 4: `users.contact_name`, `idx_orders_status`.
- Server: `services/checkout.js` (`computeQuote`, `placeOrder`, `saveContact`), `orders.transition`/`actionsFor`, `geo-core.freeDelivery`; API: `/checkout/quote`, `POST /orders`, `/orders/:id/cancel`, `/panel/orders/:id/status`, `/me/contact`.
- Mini App: savat (quote), checkout, buyurtma sahifasi (bosqichlar, to'lov holati, bekor qilish, restoranga qo'ng'iroq), buyurtmalar ro'yxatidan o'tish.
- To'lov: hozircha faqat naqd (`ENABLED_PAYMENTS`); karta o'tkazmasi va onlayn — 9-bosqich.
- Sinov: 150/150; brauzerda 360 px: savat → checkout (noto'g'ri telefon, olib ketish, ikki marta bosish = bitta buyurtma) → buyurtma sahifasi → restoran qabul qilgandan keyin bekor qilish tugmasi o'rniga qo'ng'iroq.
- Cheklov: restoran yangi buyurtma haqida hali xabar olmaydi (12/13-bosqich); holat sahifasi 15 soniyada yangilanadi (jonli kuzatuv — 15-bosqich).

## 9-bosqich natijasi
- Migratsiya 5: `payments` jadvali (charge id UNIQUE), `orders.payment_claimed_at/paid_at/refunded_at/invoice_nonce`.
- Server: `services/payments.js`; bot: `pre_checkout_query`, `successful_payment`; API: `/orders/:id/payment-claim`, `/orders/:id/invoice`, `/panel/orders/:id/payment` (confirm/reject/refunded), `/panel/restaurants/:rid/payment-methods`.
- Mini App: checkout'da usul izohlari; buyurtma sahifasida karta bloki (nusxalash, muddat, "To'ladim"), tekshirilmoqda/tasdiqlandi, onlayn "To'lash" (`openInvoice`), muddat o'tgani/rad etilgani haqida yordam.
- Sinov: 166/166 (16 ta yangi: takror "To'ladim", soxta chaqiruv, begona mijoz, tasdiqlanmagan o'tkazmani qabul qilish, kech to'lov, takror to'lov hodisasi, summa mos emas, muddat).
- Onlayn to'lov uchun kerak: @BotFather → Payments → provayder (masalan Click yoki Payme) → `PAYMENT_PROVIDER_TOKEN`; restoran sozlamasida onlayn yoqilgan bo'lishi.

## 10-bosqich natijasi
- Migratsiya 6: `restaurants.is_demo`, `restaurant_events`.
- Server: `services/platform.js`, `services/notify.js` (bot orqali xabar, xato bo'lsa amal buzilmaydi); `services.setBotApi`.
- Mini App: `#/apply`, `#/admin`, `#/panel`, `#/panel/:id`; xaritada nuqta tanlash ariza uchun ham ishlaydi; `promptDialog` (sabab yozish).
- Sinov: 176/176; brauzerda: admin paneli (ko'rsatkichlar, ariza tasdiqlash, restoranlar), egasining tayyorlik ro'yxati, ariza formasi (nuqta majburiy).
- Cheklov: xabarlar hozircha bir martalik yuboriladi (qayta urinish — 13-bosqich).

## 11-bosqich natijasi
- Server: `services/manage.js` (buyurtmalar paneli, kuryer biriktirish, menyu, kuryerlar, xodimlar, sozlamalar, hisobot), `public/js/shared/hours.js` (ish vaqti — server va Mini App bir xil); "ochiq" = tugma VA ish vaqti (katalog, checkout, to'lov).
- Mini App: `#/panel/:id/{orders,menu,couriers,staff,settings,report}`, rasm yuklash (`api.upload`), `ApiError.details` (qaysi maydon xato).
- Vakolatlar: ega+menejer — buyurtmalar, menyu, kuryerlar, ish holati/vaqti, hisobot; faqat ega — ma'lumot, yetkazish narxi/hududi, minimal/bepul, olib ketish, to'lov, xodimlar.
- Sinov: 190/190 (13 ta yangi panel testi + tarjima kalitlari testi); brauzerda ega sifatida: buyurtmani qabul qilish → kuryer biriktirish → tayyor → yo'lga, menyu, sozlamalarni saqlash, hisobot.
- Tuzatildi: Mini App tarjimasida takroriy kalit (`profile_title`) — endi test ushlaydi.

## 12-bosqich natijasi
- Server: `services/group.js` (xabar matni va tugmalari, sinxronlash, zaxira yo'l, ulash/uzish, tekshirish, sinov), migratsiya 7 (`group_title`, `group_status`, `group_linked_at/by`, `group_error`); buyurtma o'zgarishi hodisasi (`services.events`) — tranzaksiyadan keyin guruh xabarini yangilaydi.
- Bot: `src/bot/group.js` — `/bogla` (tanlash → tasdiqlash, har bosqichda huquq qayta tekshiriladi), buyurtma tugmalari, `my_chat_member`, migratsiya, `/start o_<id>`.
- Mini App: sozlamalarda guruh kartasi (holat, mavzu, oxirgi xato, Tekshirish / Sinov xabari / Uzish); tayyorlik ro'yxatida guruh faqat faol holatda "bajarilgan".
- Sinov: 219/219 (29 ta yangi guruh testi: oddiy a'zo, boshqa restoran xodimi, eskirgan tugma, o'chirilgan xabar, guruh almashtirish, bot chiqarildi, migratsiya, mavzu); brauzerda — guruh kartasi holatlari, tekshirish (bot yo'q — tushunarli xabar), uzish.
- Telegram'da jonli sinov hali qilinmadi: Railway'da eski bot ishlaydi (deploy foydalanuvchi buyrug'i bilan).
- Cheklov: guruh xabarlari o'zbekcha; yuborish xatosi qayta urinilmaydi (outbox — 13-bosqich).

## 13-bosqich natijasi
- Server: `services/templates.js` (barcha buyurtma xabarlari bitta joyda), `services/order-notify.js` (mijoz bosqichlari, kuryer jonli xabari), `services/outbox.js` + `telegram-errors.js`; `notify` endi outbox orqali (darhol urinadi, bo'lmasa keyin). Migratsiya 8: `notifications`, `users.bot_blocked_at`.
- Bot: kuryer tugmalari, eski tugmalarga javob, bloklash/blokdan chiqish (`my_chat_member`), onlayn to'lov xabari dedupe bilan.
- Hujjat: [docs/message-catalog.md](message-catalog.md) — har xabar: hodisa, auditoriya, matn, tugmalar, shart, yangilanish usuli (test barcha kalitlar yozilganini tekshiradi).
- Mini App: platforma ko'rsatkichlarida "Bot xabarlari navbatda" / "Yuborilmagan xabarlar".
- Sinov: 241/241 (22 ta yangi: mijoz bosqichlari va dublikat yo'qligi, rus tili, bekor/qaytarish, karta oqimi, to'lov muddati, kuryer oqimi va almashtirish, escape va qisqartirish, outbox: dedupe, 5xx, 429, bloklash, guruh qayta yangilanishi). Brauzerda — admin ko'rsatkichlari.
- Topilgan va tuzatilgan: navbat ishlov beruvchisi ish bo'lmaganda "band" bayrog'ini tozalamas edi (test ushladi).
- Telegram'da jonli sinov hali yo'q (deploy foydalanuvchi buyrug'i bilan). Kuryer taklifi/dispetcher, jonli joylashuv, baholash — 14–15-bosqichlar.

## 14-bosqich natijasi
- Server: `services/dispatch.js` — smena ("Ishga chiqdim"/"Ishni tugatdim", serverda), avtomatik dispetcher (restoran qabul qilgan yetkazish buyurtmasi → faqat shu restoranning faol, ulangan, ishdagi kuryerlari), "birinchi bosgan oladi" (`orders.courier_id IS NULL` shartli UPDATE), o'tkazib yuborish, olib ketishdan oldin voz kechish (shu kuryerga qayta taklif qilinmaydi), olib ketilgandan keyin "Muammo" (restoran xodimlari va guruhga kuryer telefoni bilan), joylashuv saqlash. Migratsiya 9: `courier_offers`, `orders.dispatch_status`, `couriers.online_changed_at`.
- Qo'lda biriktirish va boshqa kuryerga o'tkazish (panel) ochiq takliflarni yopadi; olib tashlash — dispetcher qayta taklif qiladi.
- Ogohlantirish: kuryer topilmasa (onlayn yo'q yoki hamma o'tkazib yubordi) guruhdagi asosiy xabarda "⚠️ Kuryer topilmadi", panelda buyurtma kartasida va (onlayn kuryer umuman yo'q bo'lsa) ro'yxat tepasida banner.
- Bot: `src/bot/courier.js` — `/courier` va taklif havolasi orqali ulanganda smena tugmalari, `d:<id>:ok|no` takliflar, `c:<id>:pk|dl|rl|pb`, oddiy/jonli joylashuv.
- Mini App: `#/courier` — smena → joriy buyurtma (hozirgi vazifa, olish/yetkazish, yo'nalish va qo'ng'iroq, mijozdan olinadigan summa, bitta asosiy amal) → takliflar → statistika va tarix (yig'ilgan bo'lim). API: `/api/courier/dashboard`, `/shift`, `/offers/:id/accept|decline`, `/orders/:id/pickup|deliver|release|problem`.
- Oldindan to'langan buyurtma: "Mijozdan olinadi: 0 so'm — oldindan to'langan"; naqdda aniq jami. Bepul yetkazish faqat mijozning `delivery_fee` si; kuryer haqi tizimda hisoblanmaydi (avtomatik nol qilinmaydi).
- Sinov: 259/259 (18 ta yangi: ikki kuryer bir vaqtda, oflayn kuryer, boshqa restoran kuryeri, qayta biriktirish, voz kechish oldin/keyin, bekor qilish, biriktirilmagan odam "Yetkazdim", hech kim olmadi, kuryer ishga chiqqanda taklif, dashboard API, taklif havolasi → smena, joylashuv). Brauzerda: kuryer ekrani (qorong'i mavzu), taklifni qabul qilish, voz kechish (tasdiq bilan), panel ogohlantirishi.
- Telegram'da jonli sinov hali yo'q (deploy foydalanuvchi buyrug'i bilan).

## 15-bosqich natijasi
- Kuzatuv: `GET /api/orders/:id/tracking` (`services/tracking.js`). Buyurtma sahifasi tartibi: raqam va haqiqiy holat (+ ma'lumot bo'lsa taxminiy vaqt) → to'lov → xarita (restoran, manzil, kuryer), joylashuv yangilangan vaqt, kuryerga qo'ng'iroq → baholash/qayta buyurtma → yig'iladigan "Holat tarixi" va "Buyurtma tafsilotlari". Katta dekorativ belgi yo'q.
- Chegaralar bitta faylda — `public/js/shared/tracking.js` (server va Mini App): 3 daqiqagacha jonli, 20 daqiqagacha "Oxirgi joylashuv" (xira nuqta, taxminiy vaqt hisoblanmaydi), undan eski — yashiriladi; kuryer ekrani ~15 s (yo'lda) / ~60 s. Masofa va vaqt — to'g'ri chiziq bo'yicha, animatsiya va countdown yo'q.
- Maxfiylik: kuryer koordinatasi mijozga faqat o'z buyurtmasi "yo'lda" bo'lganda, xodimga — kuryer biriktirilgan faol buyurtmada; yetkazilgan/bekor qilingan buyurtmada qaytmaydi; begona buyurtma — 404.
- Joylashuv manbalari: Telegram (oddiy/jonli) va kuryer ekrani (`POST /api/courier/location`, brauzer GPS faqat ilova ochiq bo'lganda — ekranda shunday yozilgan). Faol buyurtmali kuryer "Ishni tugatdim" bossa ham joylashuv yoziladi.
- Baholash (`order_ratings`, migratsiya 10): faqat yetkazilgan o'z buyurtmasi; qayta baholash o'zgartiradi, restoran reyting sonini oshirmaydi.
- Qayta buyurtma: `POST /api/orders/:id/reorder` — joriy narx, mavjudlik, restoran holati va yetkazish qayta tekshiriladi; o'zgarishlar tasdiq oynasida.
- Tarix: sana, taomlar soni, jami, holat, baho; faol buyurtmalar "kuzatish". Profil: ism va telefon (tahrirlanadi), manzillar, sevimlilar, buyurtmalar, til, yordam, loyiha haqida ("DasturXona'ning yangi loyihasi"), ish rollari "Ish bo'limlari"da.
- Sinov: 273/273 (14 ta yangi: chegaralar, yangi/eski/juda eski joylashuv, kuryer almashishi, GPS uzilishi, yetkazilgandan keyin, begona buyurtma, offline kuryer, baholash, qayta buyurtma, tarix, til). Brauzerda: xarita va kuryer (jonli va "oxirgi"), baholash, qayta buyurtma → savat, profil kontakti, rus tili.

## 16-bosqich natijasi
- Bitta qoida: `public/js/shared/geo-core.js` `freeDeliveryInfo` → `free_delivery = { kind, threshold, applied, left, now_free }`: `always` (shu manzilga narx haqiqatan 0), `threshold` ("[summa] so'mdan bepul"; savat bo'lsa applied/left), `none`, `unavailable` (manzil yaroqsiz/radiusdan tashqari — hech qachon 0 so'm emas), `pickup` (olib ketish — aksiya emas). Savatsiz shartli taklif hech qachon `now_free` emas.
- Server javoblari: ro'yxat va restoran kartasi (`free_delivery`), `/api/restaurants?free=1` (bo'lim filtri) va `free_delivery_count`, `/cart/check`, `/checkout/quote` (yetkazib bo'lmasa `delivery_fee` va `total` — `null`), buyurtma snapshot, guruh va mijoz xabari ("Yetkazish: 0 so'm — bepul"), hisobot (`free_deliveries`).
- Chegara taomlar summasiga (chegirmadan keyin, yetkazishsiz) taqqoslanadi; `free_delivery_from = 0` — "hamma uchun bepul" emas; minimal buyurtma, ochiqlik va mavjudlik baribir tekshiriladi; "Arzon yetkazish" saralashi alohida.
- Mini App: bosh sahifada "Bepul yetkazish" chipi (soni bilan) → "Hozir bepul" va "Summadan bepul" guruhlari; kartada "Yetkazish bepul" belgisi yoki "[summa] so'mdan bepul"; savat/checkout — qoldiq va "0 so'm — bepul"; restoran sozlamasida "Mijoz qanday ko'radi" ko'rinishi (xarajat restoran hisobidan, platforma subsidiyasi yo'q).
- Sinov: 284/284 (11 ta yangi: N−1/N/N+1, mahsulot olib tashlash, manzil/radius, yopiq, minimal, olib ketish, doimiy 0, buyurtma va xabarlarda jami tengligi, hisobot, bo'lim filtri). Brauzerda: bo'lim, chip, sozlama ko'rinishi.

## 18-bosqich natijasi (deploysiz)
- End-to-end ssenariylar va test hisoboti: [TEST_REPORT.md](TEST_REPORT.md) — 290/290; beqaror test topilib tuzatildi.
- Railway holati o'qib tekshirildi (o'zgartirilmadi): servis bor, **volume va domen yo'q**, o'zgaruvchilar `ADMIN_CHAT_ID`, `taomkeldi_bot`. Deploy rejasi: [OPERATIONS.md](OPERATIONS.md).
- Qo'shildi: `railway.json`, haqiqiy `/health`, `scripts/backup.mjs`, zaxira/tiklash/migratsiya/rollback yo'riqnomasi, Node `>=22.13 <25`.

## Ochiq savollar
- Bot avatari tayyor: `public/brand/taomkeldi-avatar-512.png` — @BotFather → /setuserpic orqali foydalanuvchi o'zi qo'yadi.
- "Aloqa" ma'lumoti (oddiy botdagi `@delivo_uz`) — Taomkeldi uchun to'g'ri aloqa manzili.
