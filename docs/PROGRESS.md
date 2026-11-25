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
| 11 | Restoran panelining bo'limlari | ⏭ navbatda |
| 12 | Botni restoran guruhiga ulash | — |
| 13 | Bot xabarlari va tugmalar | — |
| 14 | Restoran kuryerlari va dispetcher | — |
| 15 | Jonli kuzatuv, tarix, profil | — |
| 16 | "Bepul yetkazib berish" bo'limi | — |
| 17 | Barcha ekranlarning yakuniy dizayni | — |
| 18 | Yakuniy sinov, Railway, topshirish | — |

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
| `/bogla` (guruh) | 4/12 | qisman | Vakolat tekshiriladi; guruhni ulashning o'zi 12-bosqichda |
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
| Restoran paneli | 11 | qisman | Panel ma'lumoti, buyurtmalar ro'yxati, to'lov rekvizitlari, rasm yuklash API |
| Restoran guruhi | 12 | yo'q | `group_chat_id`, `order_messages` jadvallari bor |
| Xabar shablonlari, outbox | 13 | yo'q | — |
| Kuryerlar, dispetcher | 14 | qisman | Kuryer o'z buyurtmalari API; dispetcher yo'q |
| Kuzatuv, profil, sevimlilar | 15 | qisman | `/api/orders` tarixi; `favorites` jadvali |
| Bepul yetkazish | 16 | yo'q | `free_delivery_from` ustuni bor |

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

## Ochiq savollar
- Bot avatari tayyor: `public/brand/taomkeldi-avatar-512.png` — @BotFather → /setuserpic orqali foydalanuvchi o'zi qo'yadi.
- "Aloqa" ma'lumoti (oddiy botdagi `@delivo_uz`) — Taomkeldi uchun to'g'ri aloqa manzili.
