# Taomkeldi — loyiha konteksti

Oxirgi yangilanish: 2026-11-25 (1-bosqich).
Bu hujjat loyihaning doimiy qarorlari va tuzilmasi. Bosqichlar bo'yicha holat — [PROGRESS.md](PROGRESS.md). Bosqich promptlari — [Taomkeldi_18_bosqichli_promptlar.md](Taomkeldi_18_bosqichli_promptlar.md).

## 1. Loyiha pasporti

| Band | Qiymat |
|---|---|
| Brend | Taomkeldi |
| Bot | [@taomkeldi_bot](https://t.me/taomkeldi_bot) |
| Ota brend yozuvi (aynan) | DasturXona'ning yangi loyihasi |
| Xizmat | Kafe va restoranlardan taom buyurtma qilish va yetkazib berish platformasi |
| Hudud | Faqat Jizzax viloyati (shahar emas, butun viloyat) |
| Kuryerlar | Har restoran o'z kuryerlari bilan ishlaydi. Umumiy kuryerlar birjasi yo'q |
| Savat | Bir savatda faqat bitta restoran mahsulotlari |
| Tillar | O'zbekcha (standart) va ruscha; tanlov saqlanadi |
| Mijoz kanali | Telegram Mini App (buyurtma), bot (xabarlar) |
| Restoran kanali | Restoran paneli (Mini App) + restoran Telegram guruhi |
| Kuryer kanali | Bot + Mini App kuryer paneli |

### Boshqa loyihalardan ajratish (qat'iy qoida)
Taomkeldi mustaqil loyiha. Boshqa botlar bilan quyidagilar umumiy bo'lmaydi va aralashtirilmaydi: kod papkasi, baza, bot tokeni, Telegram guruhlari, Railway loyihasi. Faqat Taomkeldi'ning Railway loyihasi (pastda, 3-bo'lim) bilan ishlanadi; boshqa Railway loyihalariga hech qanday o'zgartirish kiritilmaydi. Boshqa brendlarning logosi va maketlari ishlatilmaydi.

## 2. Texnologiyalar

| Qatlam | Hozir | Maqsad (2-bosqichdan) |
|---|---|---|
| Runtime | Node.js (lokal v24.21; `engines: >=20`) | Node.js 22.13+ (`node:sqlite` bayroqsiz ishlashi uchun) |
| Bot | grammY 1.x, long polling | grammY, long polling, bitta nusxa |
| HTTP server | yo'q | Express (API + Mini App statik fayllari) |
| Baza | JSON fayl (`data/orders.json`), deployda o'chadi | Node SQLite (`node:sqlite`), Railway volume'da |
| Mini App | yo'q | Oddiy HTML/CSS + JavaScript ES modullari, frameworksiz |
| Konfiguratsiya | `.env` / Railway Variables | shu |

Boshqa frameworkka (React, Next va h.k.) o'tilmaydi.

### Baza kelishuvlari (2-bosqich)
- Pul — INTEGER, butun so'm; `CHECK (>= 0)`. Float ishlatilmaydi.
- Vaqt — INTEGER, Unix millisekund. Masofa — INTEGER, metr.
- `users.id` = Telegram user id.
- Migratsiyalar faqat qo'shiladi (`src/db/migrations.js`), `schema_migrations` jadvalida qayd etiladi.
- `order_items` nom va narxni snapshot qiladi; narx faqat bazadagi mahsulotdan olinadi.
- Begona buyurtma/manzil so'ralsa `404 NOT_FOUND` (mavjudligi oshkor qilinmaydi); begona restoran paneli — `403 FORBIDDEN`.

### Papka tuzilmasi (2-bosqichda yaratildi; i18n — 4-bosqichda)
```
src/
  index.js            # kirish: config → db → services → http + bot
  config.js           # muhit o'zgaruvchilari va tekshiruvi
  db/                 # ulanish, migratsiyalar
  services/           # biznes qoidalari (API ham, bot ham shularni chaqiradi)
  http/               # Express: auth (initData), routes, xatolar
  bot/                # grammY: buyruqlar, callbacklar, xabar shablonlari, notify/outbox
  i18n/               # uz.js, ru.js
public/               # Mini App: index.html, css, js (ES modullari), geo/jizzax.json
docs/                 # PROJECT_CONTEXT, PROGRESS, message-catalog, promptlar
```

## 3. Infratuzilma

| Band | Qiymat |
|---|---|
| Kod | https://github.com/kuvondikov-ss/taomkeldi (ochiq) |
| Railway loyihasi | `delivo-bot` (ID — Railway dashboard'da; ochiq repozitoriyga yozilmaydi) |
| Railway servisi | `Taomkeldi`, muhit `production` |
| Deploy usuli | `railway up` (lokal papkadan), Railpack, `npm start` |
| Bot rejimi | Long polling; har deployda bir necha soniya ikki nusxa ustma-ust tushib `409 Conflict` beradi, jarayon `exit 1` qiladi va Railway qayta ishga tushiradi |

### Muhit o'zgaruvchilari (faqat nomlari)
| Nomi | Holat | Izoh |
|---|---|---|
| `BOT_TOKEN` | Railway'da **yo'q** | Token hozir `taomkeldi_bot` nomi bilan saqlangan; kod ikkalasini o'qiydi. Keyinroq `BOT_TOKEN` ga o'tkazish kerak |
| `taomkeldi_bot` | Railway'da bor | Vaqtinchalik nom (yuqoriga qarang) |
| `PLATFORM_ADMIN_IDS` | Railway'da yo'q | Platforma adminlari. Berilmasa `ADMIN_CHAT_ID` o'qiladi (mavjud qiymat — 1 ta ID) |
| `ADMIN_CHAT_ID` | Railway'da bor | Eski nom, `PLATFORM_ADMIN_IDS` o'rnida ishlaydi |
| `DATA_DIR` | o'rnatilmagan (standart `./data`) | Volume ulanganda mount yo'liga qaratiladi; `DB_PATH`, `UPLOADS_DIR` shundan olinadi |
| `INITDATA_MAX_AGE_SEC`, `UPLOAD_MAX_BYTES`, `PORT` | ixtiyoriy | Standart: 86400 s, 5 MB, 3000 |
| `BOT_ENABLED`, `DEV_AUTH`, `AUTO_ADMIN` | faqat lokal | Production'da `DEV_AUTH` va `AUTO_ADMIN` kod tomonidan o'chiriladi |

Keyingi bosqichlarda kerak bo'ladiganlar: `WEBAPP_URL` (HTTPS), `PAYMENT_PROVIDER_TOKEN` (ixtiyoriy).

### Xavfsizlik eslatmasi
Bot tokeni chatda ochiq yozilgan. To'liq ishga tushirishdan oldin @BotFather'da `/revoke` qilib, yangisini faqat Railway Variables'ga qo'yish tavsiya etiladi. Token kodga, hujjatga va hisobotga yozilmaydi (`.env` `.gitignore` da).

## 4. Rollar

| Rol | Kim aniqlaydi | Ko'ra oladi / qila oladi | Qila olmaydi |
|---|---|---|---|
| Mijoz | Botga /start bosgan har kim | Restoranlar, menyu, savat, o'z buyurtmalari va manzillari, sevimlilar, baholash | Boshqa mijoz buyurtmasi/manzili, har qanday panel |
| Restoran egasi | Platforma admini taklifi yoki tasdiqlangan ariza | O'z restorani: buyurtmalar, menyu, kuryerlar, xodimlar, sozlamalar, to'lov rekvizitlari, hisobot, guruhni ulash | Boshqa restoranlar, platforma paneli |
| Restoran menejeri | Egasi taklifi | Operatsion amallar: buyurtmalar, menyu, kuryer biriktirish, hisobot | Karta rekvizitini o'zgartirish (maskalangan), egani o'chirish, egalikka xos amallar |
| Restoran kuryeri | Egasi/menejer taklifi | Biriktirilgan restoran(lar)ning o'ziga taklif qilingan/biriktirilgan buyurtmalari, ishga chiqish/tugatish, lokatsiya | Begona restoran buyurtmasi, boshqa kuryer buyurtmasi |
| Platforma administratori | Serverdagi aniq ID ro'yxati (muhit o'zgaruvchisi) | Restoranlar, arizalar, holatlar, takliflar, umumiy ko'rsatkichlar | — |

Qoidalar:
- Bitta foydalanuvchi bir nechta rolga ega bo'lishi mumkin (masalan, bir restoranda menejer, boshqasida mijoz).
- Rollar restoran doirasida serverda tekshiriladi; klientdagi ma'lumotga ishonilmaydi.
- Production'da birinchi /start bosgan odam admin bo'lmaydi.
- Telegram guruh admini bo'lish restoran rolini bermaydi.

## 5. Ekranlar xaritasi

### Bot — shaxsiy chat
| Kirish | Kim | Natija |
|---|---|---|
| `/start` | hamma | Salomlashish + "DasturXona'ning yangi loyihasi", asosiy tugmalar |
| `/start <taklif>` | taklif olgan | Egasi/menejer/kuryer rolini ulash |
| `/menu`, `/orders`, `/help`, `/id` | hamma | Mini App, buyurtmalar, yordam, ID |
| `/admin` (`/panel` alias) | ega, menejer, platforma admini | Restoran / platforma paneli |
| `/courier` | kuryer | Kuryer paneli |
| Asosiy tugmalar | rolga qarab | Buyurtma berish, Buyurtmalarim, Yordam; + Restoran paneli / Kuryer paneli / Platforma boshqaruvi |

### Bot — restoran guruhi
| Kirish | Natija |
|---|---|
| `/bogla` | Restoran egasi/menejeri, shu guruh admini bo'lsa, guruhni (yoki mavzuni) restoranga ulaydi; bot yoza olishi shart |
| `/start` guruhda | Faqat `/bogla` bo'yicha qisqa ko'rsatma |
| Yangi buyurtma xabari | Bitta asosiy xabar, holatga qarab tahrirlanadi, inline tugmalar; o'chirilsa — yangi nusxa |
| "Panelda ochish" | `t.me/<bot>?start=o_<id>` — shaxsiy chatda faqat xodimga Mini App tugmasi |

### Mini App — mijoz
1. Manzil tanlash (geolokatsiya / xarita pini / qidiruv / saqlangan manzil); Jizzax tashqarisi — xato holati
2. Bosh sahifa: header → manzil → qidiruv → banner → oshxona turlari → restoranlar
3. Qidiruv (restoran va taom)
4. Bepul yetkazib berish bo'limi
5. Restoran sahifasi (kategoriya tablari, mahsulotlar)
6. Taom oynasi (pastdan ochiladigan)
7. Savat
8. Checkout (yetkazish/olib ketish, manzil, kontakt, to'lov, izoh, jami)
9. To'lov (karta o'tkazmasi / onlayn)
10. Buyurtma kuzatuvi (holat, xarita, kuryer)
11. Buyurtmalar tarixi
12. Sevimlilar
13. Profil (kontakt, manzillar, til, yordam, "Ish bo'limlari")

Pastki navigatsiya: Bosh sahifa, Qidirish, Buyurtmalar, Profil.

### Mini App — restoran paneli (ega/menejer)
Dashboard (tayyorlik ro'yxati) · Buyurtmalar (yangi / tayyorlanmoqda / tayyor / yo'lda / yakunlangan) · Buyurtma tafsiloti · Menyu (kategoriyalar, taom editor, stop-list) · Kuryerlar · Xodimlar · Sozlamalar (ma'lumot, ish vaqti, yetkazish narxi va radiusi, minimal summa, bepul yetkazish, to'lov usullari, guruh) · Hisobot.

### Mini App — kuryer paneli
Joriy buyurtma (vazifa, manzillar, yo'nalish, aloqa, olinadigan summa, keyingi amal) · Takliflar · Ishga chiqish/tugatish · Tarix va statistika.

### Mini App — platforma administratori
Restoranlar ro'yxati · Kutilayotgan arizalar · Restoran yaratish + egasiga taklif · Umumiy ko'rsatkichlar.

### Ommaviy sahifa
Restoran arizasi (egasi to'ldiradi).

## 6. Buyurtma holatlari

Maqsad (8-bosqich): `pending_payment → new → accepted → ready → on_way → delivered`, istalgan ruxsat etilgan bosqichdan `cancelled`. Olib ketishda `ready → delivered` (kuryersiz). To'lov holati alohida: masalan `unpaid / claimed / paid / refund_requested / refunded`.

Hozirgi oddiy botda: `new, accepted, on_way, delivered, cancelled` (`ready` va `pending_payment` yo'q, to'lov holati yo'q).

## 7. Ish qoidalari
1. Har prompt — alohida bosqich; faqat o'sha bosqich bajariladi, keyingisiga asos qoldiriladi.
2. Imkoniyatlar "mavjud / qisman / yo'q" deb tekshiriladi; ishlayotgani qayta yozilmaydi.
3. Bosqich oxirida: bajarilgan ish, o'zgargan fayllar, sinov natijasi, qolgan bog'liqliklar.
4. `docs/PROJECT_CONTEXT.md` va `docs/PROGRESS.md` har bosqichda yangilanadi.
5. Tokenlar va shaxsiy ma'lumotlar kodga/hisobotga tushmaydi — faqat muhit o'zgaruvchilari.
6. Test ma'lumotlari alohida lokal/test bazada. Haqiqiy guruhga sinov xabari, production DB'ni o'zgartirish va deploy faqat aniq topshiriq bilan.
7. Ishlamaydigan tugma, yashirin mock API yoki faqat rasmga o'xshagan sahifa tugallangan funksiya hisoblanmaydi.

## 8. Qarorlar jurnali
| Sana | Qaror | Sabab |
|---|---|---|
| 2026-11-25 | Taomkeldi noldan quriladi, boshqa loyihalar kodi ishlatilmaydi | Loyihalar ajratilishi kerak |
| 2026-11-25 | Texnologiya: Node.js + Express + grammY + node:sqlite + oddiy HTML/CSS/JS | Promptlardagi tanlov; frameworksiz |
| 2026-11-25 | Hozirgi oddiy bot 2-bosqichgacha o'zgarishsiz ishlab turadi | 1-bosqichda biznes qoidalari o'zgartirilmaydi |
| 2026-11-25 | initData: `hash`dan boshqa barcha maydonlar (shu jumladan `signature`) data-check-string'ga kiradi; standart eskirish 24 soat | Rasmiy algoritm; `signature` faqat uchinchi tomon tekshiruvi uchun |
| 2026-11-25 | Platforma admini production'da faqat `PLATFORM_ADMIN_IDS`dan | Tasodifiy odam admin bo'lmasligi uchun |
| 2026-11-25 | Taklif havolalari: `inv_<token>`, faqat xesh saqlanadi, 7 kun, bir martalik; ega taklifi — faqat platforma admini, menejer — ega, kuryer — ega/menejer | Maxfiy taklif ommaviy havola bilan adashmasligi; dublikatsiz rol berish |
| 2026-11-25 | "Buyurtma berish" reply tugmasi Mini App'ni to'g'ridan-to'g'ri emas, inline web_app tugmasi orqali ochadi | Inline/menyu tugmasidan ochilgan Mini App initData oladi |
| 2026-11-25 | Bot guruhlarda faqat buyruq yozganlarni bazaga yozadi | Ortiqcha shaxsiy ma'lumot yig'ilmasligi |
| 2026-11-25 | Hudud: Jizzax viloyati OSM chegarasi (`public/geo/jizzax.json`); tekshiruv kodi `public/js/shared/geo-core.js` — server va Mini App bitta fayldan import qiladi | Frontend va backend bir xil natija berishi |
| 2026-11-25 | Masofa — to'g'ri chiziq (haversine), UI'da "to'g'ri chiziq" deb yoziladi; narx: baza + har boshlangan km | Yo'l masofasi API'si yo'q; yolg'on aniqlik bermaslik |
| 2026-11-25 | Xarita: Leaflet (o'z serverimizdan) + OSM plitkalari, attribution doim ko'rinadi; qidiruv — Nominatim server proksi orqali, avtomatik to'ldirishsiz | Provayder qoidalari (1 so'rov/s, kesh, User-Agent) |
| 2026-11-25 | Joriy yetkazish manzili = serverdagi asosiy (va hudud ichidagi) manzil | Qurilmalar orasida bir xil; tekshiruv serverda |
| 2026-11-25 | Saralash: har qanday tartibda ochiq restoranlar yopiqlardan oldin; "tavsiya" = reyting × ishonch (baholar soni/10, ko'pi 1) + yaqinlik; "arzon yetkazish" — narx bo'yicha, "bepul" deb atalmaydi | Buyurtma olinmaydigan restoran tepada turmasligi; kam bahoga ortiqcha ishonmaslik |
| 2026-11-25 | Aksiya = mavjud mahsulotda `old_price > price` | Soxta chegirma ko'rsatmaslik |
| 2026-11-25 | Taxminiy yetkazish vaqti: tayyorlash + masofa/15 km/soat + 5 daq, 10 daqiqalik oraliq | Aniq countdown va'da qilinmaydi |
| 2026-11-25 | So'nggi qidiruvlar qurilmada (localStorage) saqlanadi | Serverga ortiqcha shaxsiy ma'lumot yozmaslik |
| 2026-11-25 | Holat o'tishlari jadvali (`services/orders.js` `FLOW`): mijoz faqat `pending_payment`/`new` da bekor qiladi; xodim bekor qilishi sabab bilan; yetkazishda `ready → on_way → delivered`, olib ketishda `ready → delivered`; oldindan to'lovda `accepted` faqat `paid` dan keyin | Promptdagi qoidalar; eski tugma va parallel bosish shartli UPDATE bilan himoyalangan |
| 2026-11-25 | Naqd buyurtma `delivered` bo'lganda `payment_status = paid`; to'langan buyurtma bekor qilinsa `refund_requested` | Refund so'rovi va haqiqiy qaytarish alohida |
| 2026-11-25 | Bepul yetkazish: `free_delivery_from > 0` va taomlar summasi ≥ chegara (yetkazishsiz); 0/null — bepul emas | 16-bosqich qoidasi oldindan |
| 2026-11-25 | Oddiy botdagi "matn bilan buyurtma" oqimi yangi kodga ko'chirilmadi | Yangi modelda buyurtma restoran va mahsulotlarga bog'langan; Mini App orqali 8-bosqichda |
| 2026-11-25 | Original logo olindi: `public/brand/taomkeldi-original.svg` (shior: "Taomingiz eshigingizgacha"). Variantlar `scripts/brand-variants.mjs` bilan yasaladi — geometriya o'zgarmaydi, faqat kesish va qora yozuv rangi (to'q fon uchun) | 3-bosqich talabi: original SVG'dan full/mark, yorug'/to'q variantlar |
| 2026-11-25 | Palitra logodagi yashil ranglardan olinadi (promptdagi to'q ko'k/to'q sariq palitra o'rniga) — foydalanuvchi tasdiqladi; asosiy tugma `#21583A` + oq matn (8.3:1), `#679C76` faqat bezak (oq fonda 3.2:1). Batafsil: [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) | Logo yashil: `#679C76`, `#21583A`, `#92B88F`, `#B5CFAE`, yozuv `#232323` |
| 2026-11-25 | Restoran guruhi: guruh a'zoligi/adminligi rol bermaydi — har tugma bosuvchining restoran roli serverda tekshiriladi; ulash uchun xodim + guruh admini + bot yoza olishi kerak | Guruhga begona odam qo'shilsa ham buyurtmani boshqara olmaydi |
| 2026-11-25 | Guruhda bitta asosiy xabar (`order_messages.kind = group_main`), har o'zgarishda tahrirlanadi; o'chirilgan bo'lsa yangisi yuboriladi va id almashtiriladi; buyurtma bo'yicha navbat | Guruhda shovqin va dublikat bo'lmasligi |
| 2026-11-25 | Guruh ishlamasa (bot chiqarilgan, huquq yo'q, ulanmagan) yangi buyurtma ega va menejerlarga shaxsiy xabarda keladi; o'zlariga bir marta ogohlantirish | Buyurtma yo'qolmasligi |
| 2026-11-25 | Sinov xabari faqat panelda aniq bosilganda; bot guruhga qo'shilganda faqat qisqa /bogla yo'riqnomasi | Guruhga keraksiz xabar yubormaslik |
| 2026-11-25 | `pending_payment` buyurtmalar restoran guruhiga yuborilmaydi; karta o'tkazmasida "to'ladim"dan keyin "To'lov keldi / Pul kelmadi" tugmalari | To'lanmagan buyurtma tayyorlanmasligi |
| 2026-11-25 | Bot xabarlari outbox orqali (`notifications`): avval yoziladi, keyin yuboriladi; 8 tagacha qayta urinish, 429 da retry_after, `dedupe_key`, botni bloklaganlarga to'xtash | Telegram ishlamasa xabar yo'qolmasligi va takrorlanmasligi |
| 2026-11-25 | Mijozga faqat muhim bosqichlar (yuborildi, to'lov, qabul, olib ketishga tayyor, yo'lda, yetkazildi, bekor/qaytarish); yetkazishda "tayyor" va mijozning o'z bekor qilishi — xabarsiz | Shovqin bo'lmasligi; "qabul qilindi" faqat haqiqatda qabul qilingach |
| 2026-11-25 | Kuryerga bitta jonli xabar (tahrir), yo'nalish — Google Maps havolasi; naqd summa = naqd va to'lanmagan bo'lsa jami | Kuryer uchun kerakli minimal ma'lumot |
| 2026-11-25 | Restoran guruhi xabarlari o'zbekcha; mijoz va kuryer — o'z tilida | Guruhda bir nechta til aralashmasligi |
| 2026-11-25 | Dispetcher taklifni restoran qabul qilgandan keyin (`accepted`/`ready`) yuboradi; qo'lda biriktirish istalgan vaqtda (`new`–`ready`) | Kuryer tayyorlanmagan buyurtma uchun behuda kutmasligi |
| 2026-11-25 | "Birinchi bosgan oladi" — `UPDATE orders SET courier_id = ? WHERE courier_id IS NULL` (changes = 1); `courier_offers` faqat kimga ketgani va xabarni yopish uchun | Poyga holatida ham ikki kuryer bitta buyurtmani olmaydi |
| 2026-11-25 | Kuryer olib ketishdan oldin voz kecha oladi (o'sha buyurtma unga qayta taklif qilinmaydi); olib ketgach — faqat "Muammo" (restoran hal qiladi) | Promptdagi qoida; buyurtma yo'lda "egasiz" qolmasligi |
| 2026-11-25 | Smena har restoran uchun alohida (`couriers.is_online`); joylashuv faqat ishdagi kuryer yozuvlariga yoziladi | Kuryer bir nechta restoranda ishlashi mumkin; ishdan tashqarida kuzatilmaydi |
| 2026-11-25 | Kuryer haqi (to'lovi) tizimda hisoblanmaydi; "bepul yetkazish" faqat mijozning `delivery_fee` si | Promptdagi ogohlantirish; hisob-kitob restoran va kuryer o'rtasida |
| 2026-11-25 | Kuzatuv chegaralari bitta faylda (`public/js/shared/tracking.js`): jonli ≤ 3 daq, "oxirgi" ≤ 20 daq, keyin yashirin; yo'l vaqti faqat jonli nuqtadan, ~15 km/soat to'g'ri chiziq | Promptdagi qoida; yolg'on aniqlik bermaslik |
| 2026-11-25 | Mijoz kuryer joylashuvini faqat "yo'lda" bosqichida ko'radi; xodim — kuryer biriktirilgan har faol bosqichda | Kuryer shaxsiy harakati keraksiz oshkor bo'lmasligi |
| 2026-11-25 | Joylashuv yozish sharti: kuryer ishda YOKI faol (accepted/ready/on_way) buyurtmasi bor | Smenani yopgan, lekin yetkazayotgan kuryer kuzatuvdan chiqib qolmasligi |
| 2026-11-25 | Baho — buyurtmaga bitta yozuv (`order_ratings`), qayta baholash farq bilan `rating_sum` ni tuzatadi | Reyting sonini sun'iy oshirib bo'lmasligi |
| 2026-11-25 | Bepul yetkazish tasnifi bitta funksiyada (`freeDeliveryInfo`): always / threshold / none / unavailable / pickup; yetkazib bo'lmaydigan manzilda narx `null` | "0 so'm"ni xato yoki manzil yo'qligi bilan adashtirmaslik |
| 2026-11-25 | "Hozir bepul" — faqat narx haqiqatan 0 yoki savat chegaraga yetganda; savatsiz chegara — "summadan bepul" | Shartli taklifni shartsiz deb ko'rsatmaslik |
| 2026-11-25 | Bepul yetkazish xarajati — restoranniki (o'z kuryerlari); platforma subsidiyasi yoki aksiya budjeti yaratilmadi | Promptdagi model |
