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
| `/bogla` | Vakolatli xodim guruhni restoranga ulaydi |
| `/start` guruhda | Faqat `/bogla` bo'yicha qisqa ko'rsatma |
| Yangi buyurtma xabari | Bitta asosiy xabar, holatga qarab tahrirlanadi, inline tugmalar |

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
| 2026-11-25 | Oddiy botdagi "matn bilan buyurtma" oqimi yangi kodga ko'chirilmadi | Yangi modelda buyurtma restoran va mahsulotlarga bog'langan; Mini App orqali 8-bosqichda |
| 2026-11-25 | Original logo olindi: `public/brand/taomkeldi-original.svg` (shior: "Taomingiz eshigingizgacha"). Variantlar `scripts/brand-variants.mjs` bilan yasaladi — geometriya o'zgarmaydi, faqat kesish va qora yozuv rangi (to'q fon uchun) | 3-bosqich talabi: original SVG'dan full/mark, yorug'/to'q variantlar |
| 2026-11-25 | Palitra logodagi yashil ranglardan olinadi (promptdagi to'q ko'k/to'q sariq palitra o'rniga) — foydalanuvchi tasdiqladi; asosiy tugma `#21583A` + oq matn (8.3:1), `#679C76` faqat bezak (oq fonda 3.2:1). Batafsil: [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) | Logo yashil: `#679C76`, `#21583A`, `#92B88F`, `#B5CFAE`, yozuv `#232323` |
