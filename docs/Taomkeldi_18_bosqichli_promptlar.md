# Taomkeldi — Claude uchun 18 bosqichli promptlar

Tayyorlangan sana: 2026-yil 25-noyabr.

Bu to‘plam Taomkeldi platformasini bosqichma-bosqich qurish uchun tuzildi. Taomkeldi — mustaqil loyiha: o‘z boti, o‘z kod papkasi, o‘z Railway loyihasi. Boshqa loyihalar bilan kod, baza, token va deploylar aralashtirilmaydi. Promptlar amalga oshirish bog‘liqligi bo‘yicha tartiblangan.

## Qanday foydalaniladi

1. Claude’da bitta loyiha/chat oching. Taomkeldi kodi: https://github.com/kuvondikov-ss/taomkeldi. 1-promptda loyiha amalda noldan qurilishini ayting (hozirgi kod — oddiy yetkazish boti, quyidagi jadvalga qarang).
2. Original Taomkeldi logosini biriktiring (hali yo‘q bo‘lsa, 3-bosqichdan oldin tayyorlang). Dizayn bosqichiga kelganda Taomkeldi uchun maketlar bo‘lsa, ularni ham biriktiring. Boshqa brendlarning logosi va maketlaridan foydalanilmaydi.
3. Avval 1-promptni, keyin 2–18-promptlarni bittadan yuboring. Har bir bosqichning tekshiruvi tugagach keyingisiga o‘ting.
4. Mavjud funksiyani qayta yaratish o‘rniga Claude’dan uni koddan topish, tekshirish va yetishmayotgan joyini bajarishni talab qiling.
5. Muhitga kira olmagan yoki sinamagan qismini “ishlaydi” deb yozmasin. Production’ga joylash 18-bosqichda alohida ko‘riladi.

### Amaldagi holat va yangi talablar

| Qism | Ushbu to‘plamdagi maqomi |
|---|---|
| Oddiy yetkazish boti: /start, menyu, buyurtma (nima, qayerdan, qayerga, telefon), adminga yuborish, holat tugmalari, /myid | Amaldagi kodda mavjud (`src/bot.js`, grammY, JSON fayl); Railway’da ishlab turibdi |
| Mini App, restoranlar, menyu, savat, restoran paneli, o‘z kuryerlari, Jizzax hududi, guruhga `/bogla`, naqd/karta oqimi | Yo‘q; 2–15-bosqichlarda quriladi |
| Online to‘lov | Yo‘q; 9-bosqich, provayder sozlanmaguncha jonli to‘lov ishlaydi deb hisoblanmaydi |
| Summaga yetganda bepul yetkazish (`free_delivery_from`) | Yo‘q; 11 va 16-bosqichlar |
| Alohida “Bepul yetkazib berish” bo‘limi | Yo‘q; 16-bosqich |
| Doimiy baza | Yo‘q: buyurtmalar JSON faylda, har deployda o‘chadi; 2 va 18-bosqichlarda SQLite + Railway volume |

Hozirgi deploy: Railway loyihasi `delivo-bot`, servis `Taomkeldi`, long polling, bitta nusxa. Bot: @taomkeldi_bot.

## 1-prompt — loyiha pasporti va umumiy ish qoidalari

```text
Sen tajribali full-stack dasturchi, Telegram bot muhandisi va mahsulot dizaynerisan. Men uchun Taomkeldi nomli kafe va restoranlardan taom buyurtma qilish va yetkazib berish platformasini bosqichma-bosqich ishlab chiqasan.

Loyiha pasporti:
- Brend: Taomkeldi.
- Bot: @taomkeldi_bot.
- Ota brend yozuvi aynan: DasturXona'ning yangi loyihasi.
- Xizmat hududi: faqat Jizzax viloyati.
- Har bir restoran o‘z kuryerlari bilan ishlaydi. Umumiy kuryerlar birjasi yo‘q.
- Mijoz bir savatda faqat bitta restorandan buyurtma qiladi.
- Asosiy rollar: mijoz, restoran egasi, restoran menejeri, restoran kuryeri, platforma administratori.
- Interfeys va mijoz xabarlari: o‘zbekcha va ruscha. Standart til — o‘zbekcha, tanlov saqlanadi.
- Mijoz Mini App’da buyurtma qiladi; restoran panel va Telegram guruhi orqali boshqaradi; kuryer bot va Mini App orqali ishlaydi.

Avval repozitoriydagi mavjud kodni o‘qi. Hozir u faqat grammY’dagi oddiy yetkazish boti (src/bot.js, JSON fayl). Taomkeldi uchun maqsadli asos: Node.js, Express, grammY, Node SQLite, oddiy HTML/CSS va JavaScript ES modullari. Dizaynni yaxshilash uchun loyihani o‘z-o‘zidan boshqa frameworkka ko‘chirma. Loyihani shu tuzilma asosida noldan qur; mavjud botdagi foydali qismlarni (buyurtma oqimi, /myid, admin holat tugmalari) saqla yoki yangi tuzilmaga ko‘chir. Boshqa loyihalarning kodi, bazasi, tokeni yoki Railway loyihasiga tegma.

Ish tartibi:
1. Har bir yuborgan promptim alohida bosqich. Faqat o‘sha bosqichni yakunla; keyingi bosqich uchun tayyor asos qoldir.
2. Mavjud imkoniyatlarni “mavjud”, “qisman”, “yo‘q” deb tekshir. Ishlayotganini takror yozma.
3. Bosqich oxirida bajarilgan ish, o‘zgargan fayllar, sinov natijasi va qolgan bog‘liqliklarni qisqa yoz.
4. Loyihada docs/PROJECT_CONTEXT.md va docs/PROGRESS.md yurit: qarorlar, mavjud API, DB o‘zgarishlari, keyingi vazifa.
5. Bot tokeni, provayder tokenlari va shaxsiy ma’lumotlar kodga yoki hisobotga tushmasin; muhit o‘zgaruvchilaridan foydalan.
6. Test ma’lumotlari alohida lokal/test bazada bo‘lsin. Haqiqiy guruhlarga sinov xabari yuborish, production DB’ni o‘zgartirish yoki deploy qilishni shu promptlar avtomatik ruxsat bergan deb qabul qilma.
7. Ishlamaydigan tugma, yashirin mock API yoki faqat rasmga o‘xshagan sahifani tugallangan funksiya deb bermagin.

Hozir loyiha tuzilmasini aniqlab, rollar va ekranlar xaritasini tuz. Keyingi bosqichlarni boshlash uchun mavjud funksiyalar jadvalini tayyorla. Bu bosqichda mavjud biznes qoidalarini o‘zgartirma.
```

## 2-prompt — texnik asos, ma’lumotlar va rollar

```text
Endi loyiha poydevorini tayyorla yoki mavjudini tekshir.

Backend, Mini App statik fayllari va grammY bot bir-biriga tartibli ulangan bo‘lsin. Biznes qoidalari services qatlamida bo‘lsin: API ham, Telegram callback ham shu funksiyalarni chaqirsin.

Quyidagi ma’lumotlarni qamra: users, restaurants, staff, couriers, cuisines, restaurant_cuisines, menu_categories, products, addresses, favorites, orders, order_items, order_events, order_messages. Mavjud jadval va ustun nomlarini saqla. Yetishmayotgan jadval yoki ustunni ma’lumotni yo‘qotmaydigan migratsiya bilan qo‘sh. Pul qiymatlariga aniq birlik tanla, float orqali summani buzma. Buyurtmada mahsulot nomi, narxi va miqdori snapshot bo‘lib saqlansin.

Telegram Mini App initData’ni serverda amaldagi rasmiy algoritm bo‘yicha tekshir. Imzo, auth_date va ruxsat etilgan eskirish chegarasini tekshir; klientdagi initDataUnsafe yoki user_id’ga ishonma. DEV_AUTH faqat lokal test muhiti uchun, production’da o‘chiq bo‘lsin.

Rollarni restoran doirasida tekshir:
- mijoz faqat o‘z buyurtmasi/manzilini ko‘radi;
- egasi o‘z restorani, xodimlari va to‘lov rekvizitlarini boshqaradi;
- menejerga operatsion huquqlar beriladi, egasiga tegishli maxsus amallar ajratiladi;
- kuryer faqat biriktirilgan restoranlari va o‘z buyurtmalarini boshqaradi;
- platforma administratori server tomondan aniqlanadi.

Production’da birinchi /start bosgan tasodifiy odam avtomatik administrator bo‘lmasin. Mavjud AUTO_ADMIN faqat hujjatlashtirilgan test/bootstrap sharoitida ishlasin; production adminlari aniq berilgan ID’lardan olinsin.

API xatolari barqaror kod, foydalanuvchiga tushunarli matn va mos HTTP status bilan qaytsin. Kiritmalar, upload turi/hajmi va restoranlararo kirish huquqlarini serverda tekshir.

Sinov: mijoz boshqa mijoz buyurtmasini, menejer boshqa restoran panelini, kuryer begona restoran buyurtmasini ko‘ra olmasin. Baza qayta ishga tushganda saqlansin.
```

## 3-prompt — Taomkeldi brendi, logo va dizayn tizimi

```text
Biriktirilgan original Taomkeldi logosidan foydalanib yagona dizayn tizimini joriy qil.

Palitra:
--navy: #143252
--accent: #C25814
--accent-ink: #A54A10
--paper: #FAF8F4
--cream: #F3EBDC
--white: #FFFFFF
--carrot: #F47A24
--ink-2: #4A5D74

Asosiy tugma carrot fon va navy matn bilan bo‘lsin. Shrift — Montserrat, tizim sans-serif zaxirasi bilan. Oddiy matn 400–500, ajratish 600, sarlavha 700. Odatdagi matn 16 px, yordamchi matn 12–14 px, sarlavha 20–24 px. 8 px spacing ritmi, 16–20 px yon chet, 12–16 px karta oralig‘i, 16–20 px karta radiusi. Asosiy bosish maydonlari 44×44 px yoki kattaroq, asosiy pastki tugma 50–52 px.

Logo uchun yorug‘/to‘q fondagi full va mark variantlarini original SVG’dan ishlat. Geometriya, harf va proporsiyalarni o‘zgartirma; generatsiya qilingan maketdagi taxminiy logoni original o‘rniga olma. Favikon va bot avatari uchun mark, header uchun full variant kerak.

Ikonkalar bitta SVG oilasida: bir xil o‘lcham, chiziq va yumaloq uchlar. Mini App interfeysini emoji bilan to‘ldirma. Rasm bo‘lmasa, krem fondagi neytral SVG placeholder ishlat.

Taom rasmlari tabiiy va ishtaha ochadigan bo‘lsin. 3D obyektlar reklama bannerida oz miqdorda; boshqaruv tugmalari tekis. 3D logo ortiga aylana disk qo‘shma, obyekt matnni yopmasin.

Light/dark theme, focus, pressed, disabled, loading, empty, error, success komponentlarini yarat yoki bir xillashtir. Ranglarni sahifalarga tarqoq yozma: CSS tokenlaridan foydalan. Reduced-motion rejimini hurmat qil.

Natija: barcha sahifalar ishlatadigan logo, button, input, card, chip, tabs, sheet, dialog, toast, skeleton, bottom navigation komponentlari. 320–430 px ekranlarda matn va boshqaruvlar sig‘ishini ko‘rsat.
```

## 4-prompt — botning kirishi, menyusi va tillari

```text
Taomkeldi botining shaxsiy chatdagi boshlanishini yarat yoki tartibga keltir.

/start xabari:
“Taomkeldi’ga xush kelibsiz!
Jizzaxdagi kafe va restoranlardan taom buyurtma qiling.
DasturXona'ning yangi loyihasi.”

Asosiy tugmalar: “Buyurtma berish”, “Buyurtmalarim”, “Yordam”. Restoran ulash yo‘li mavjud bo‘lsin. Foydalanuvchi roliga qarab “Restoran paneli”, “Kuryer paneli”, “Platforma boshqaruvi” qo‘shilsin. Oddiy mijozga admin amallari ko‘rsatilmasin.

Buyruqlar: /start, /menu, /orders, /admin, /courier, /help, /id; guruh uchun /bogla. Mavjud /panel aliasini buzma. Bot menyusidan HTTPS Mini App ochilsin. Noto‘g‘ri sozlangan WEBAPP_URL bo‘lsa tushunarli diagnostika bo‘lsin.

Egasi/menejer va kuryer taklif deep-linklarini ishlat. Har bir taklif to‘g‘ri rol va restoranga bog‘lansin; ishlatilgan yoki bekor qilingan havola boshqa odamga rol bermasin. Qayta /start bosish takror staff/courier yozuvini yaratmasin. Maxfiy taklif kodi oddiy ommaviy reklama havolasi sifatida ishlatilmasin.

O‘zbekcha va ruscha matnlar markaziy tarjima fayllarida bo‘lsin. Til avval Telegram’dan taxmin qilinadi, foydalanuvchi tanlovi esa keyin ustun bo‘ladi. UI va shaxsiy bot xabarlari bir xil tanlangan tilda chiqsin.

Guruhda /start bosilganda shaxsiy ma’lumot yoki mijoz menyusini chiqarma; /bogla bo‘yicha qisqa ko‘rsatma ber. Shaxsiy chatga mo‘ljallangan web_app tugmasini guruhga yuborma.

Sinov: oddiy mijoz, egasi, menejer, kuryer, ko‘p rolga ega foydalanuvchi va noto‘g‘ri taklif havolasi.
```

## 5-prompt — Jizzax hududi va manzil tanlash

```text
Xizmatni faqat Jizzax viloyati bilan chekla. Mavjud public/geo/jizzax.json chegarasidan frontend va backendda bir xil foydalan. Jizzax shahri bilan butun viloyatni adashtirma.

Mijoz birinchi kirishda yetkazish nuqtasini tanlasin: Telegram/geolokatsiya, xaritada qo‘lda pin, qidiruv yoki saqlangan manzil. Ruxsat rad etilishi, GPS xatosi va qidiruv topilmasligi uchun muqobil yo‘l ber. Xarita attribution va amaldagi provayder talablariga rioya qil.

Manzil tanlanmaguncha restoranlar, qidiruv, sevimlilar va savat oqimini boshlatma. Profil, buyurtmalar va vakolatli ish panellari ochiq qolsin. Viloyatdan tashqaridagi pin uchun aniq xabar va “Manzilni o‘zgartirish” tugmasi ko‘rsat.

Restoran o‘z koordinatasi va yetkazish radiusiga ega. Mijozga faqat uning manzilini qamrab oladigan faol restoranlar ko‘rsatilsin. Ro‘yxat, restoran detail va checkout serverda ham tekshirilsin. Yopiq restoran ko‘rsatilsa, holati yaqqol bo‘lsin va buyurtma olinmasin.

Manzil: nomi, matni, koordinata, ixtiyoriy podyezd/qavat/xonadon va izoh. Mijoz saqlashi, tahrirlashi, o‘chirishi va asosiy manzilni tanlashi mumkin.

Mavjud to‘g‘ri chiziq masofasini yo‘l masofasi deb yozma. Yetkazish hisoblash usuli barcha ekranlarda bir xil bo‘lsin. Manzil o‘zgarsa restoran mosligi, yetkazish narxi va savat qayta tekshirilsin.

Sinov: chegaraning ichida/tashqarisida, radius ichida/tashqarisida, GPS rad etilganda, saqlangan manzil yaroqsiz bo‘lganda.
```

## 6-prompt — bosh sahifa, qidiruv va saralash

```text
Taomkeldi bosh sahifasini ishlab chiq yoki mavjudini bir xillashtir.

Tartib: ixcham logo/header → yetkazish manzili → “Taom yoki restoran qidirish” → bitta ixcham banner → oshxona turlari → restoranlar.

Banner: navy fon, tabiiy taom fotosi, “Mazali taomlar. Bir necha bosishda.” sarlavhasi va “Tanlash” tugmasi. Matn surat ustida yo‘qolmasin. Tugma tegishli restoran/taom bo‘limiga olib borsin. Banner ekran balandligini egallab olmasin.

Restoran kartasi: cover, nom, oshxona turi, mavjud bo‘lsa haqiqiy reyting va baholar soni, taxminiy yetkazish vaqti, narxi, ochiq/yopiq holati, sevimli tugmasi. Reyting yoki suratni o‘ylab topma. Rasm joyi oldindan o‘lchangan bo‘lsin.

Oshxona turlari shu manzildagi restoranlarda mavjud turlardan olinsin. Saralash: tavsiya, reyting, tez yetkazish, arzon yetkazish; aksiya esa alohida filtr bo‘lsin. “Arzon yetkazish” narx bo‘yicha saralashdir. Uni “Bepul yetkazish” deb noto‘g‘ri nomlama; alohida bepul bo‘lim 16-bosqichda keladi.

Qidiruv restoran va taom nomi bo‘yicha ishlasin, so‘nggi so‘rovlar saqlansin. Natijalar turini ajrat; taom bosilganda o‘sha taom yoki tegishli kategoriya ochilsin. Boshqa manzilga yetkazmaydigan restoran qidiruvdan qaytmasin.

Pastki navigatsiya: Bosh sahifa, Qidirish, Buyurtmalar, Profil. Sevimlilar qulay joydan ochilsin. Yuklanish skeleti, filtrlangan bo‘sh natija va hududda restoran yo‘q holati bir-biridan ajralsin.
```

## 7-prompt — restoran menyusi va taom oynasi

```text
Restoran sahifasini tayyorla: cover, nom, oshxona turi, ish vaqti, yetkazish narxi va taxminiy vaqt, minimal buyurtma, mavjud bepul yetkazish sharti, sevimli tugmasi va batafsil ma’lumot.

Kategoriyalar yuqoriga yopishadigan tablar bo‘lsin. Mahsulotlar ikki ustunli, 4:3 suratli kartalarda: nomi, porsiya/og‘irligi, amaldagi narxi, haqiqiy chegirma bo‘lsa eski narx, qo‘shish yoki miqdor tugmasi. Tor ekranda miqdor tugmalarini maydalash o‘rniga joylashuvini moslashtir.

Taom bosilganda pastdan ochiladigan oyna: kattaroq rasm, to‘liq nom, tavsif, porsiya, narx, miqdor, “Savatga qo‘shish · [summa]”. Ma’lumot bo‘lmasa tarkib/allergen yoki mahsulot opsiyalarini o‘ylab topma.

Stop-listdagi taom buyurtma qilinmasin. Savatdagi taom stop-listga tushsa checkoutda qayta tekshirib, olib tashlashni tushunarli taklif qil. Bir xil taom turli bo‘limlarda ko‘rinsa miqdori yagona holatdan olinsin.

Boshqa restoran mahsulotini qo‘shishda mavjud savatni yashirincha o‘chirma. Restoran almashtirish va savat tozalanishini aniq tasdiqlat. Pastki savat panelida mahsulot soni va taomlar summasi bo‘lsin; yetkazish kiritilmagan bo‘lsa yozuv buni tushuntirsin.

Sinov: uzun nom, rasm yo‘q, chegirma, mahsulot tugagan, savat miqdori, restoran almashtirish, orqaga qaytishda scroll va kategoriya holati.
```

## 8-prompt — savat, checkout va buyurtma holatlari

```text
Mijoz buyurtma yo‘lini to‘liq yakunla.

Savatda taomlar, miqdor, narx, olib tashlash, minimal buyurtma va mavjud bepul yetkazish chegarasigacha qolgan summa bo‘lsin. Qo‘shimcha taom tavsiyasi asosiy yakuniy summani pastga surmasin.

Checkout: yetkazish/olib ketish → manzil → qabul qiluvchi ism/telefon → mavjud to‘lov usuli → yig‘iladigan izoh/qo‘shimcha ma’lumot → taomlar summasi, yetkazish va jami → bitta tasdiqlash tugmasi. Kontakt to‘g‘ri saqlangan bo‘lsa “O‘zgartirish” qatori bilan ixcham ko‘rsat, yangi yoki noto‘g‘ri kontakt uchun forma och.

Narxlar, mavjudlik, restoran ochiqligi, manzil/radius, minimal summa va to‘lov usulini server qayta hisoblasin. Quote va createOrder bir xil hisoblash funksiyasidan foydalansin. Klient yuborgan jami yoki delivery_fee’ga ishonma. Narx o‘zgarsa tasdiqlashdan oldin yangilangan summa ko‘rsatiladi.

Holatlar: pending_payment, new, accepted, ready, on_way, delivered, cancelled. To‘lov holati alohida yuritiladi. Olib ketishda kuryer/on_way bosqichi talab qilinmaydi. Amaldagi qonuniy o‘tishlarni saqla, har birini rol va buyurtma turi bo‘yicha tekshir. Yakunlangan buyurtma eski tugmadan qayta ishga tushmasin.

Takroriy bosish yoki tarmoq qayta urinishidan dublikat buyurtma yaratilmasin: serverda idempotency yoki unga teng barqaror himoya kerak. O‘zgarishlar order_events’da kim, qachon, nima qilgani bilan saqlansin.

Mijozning o‘zi bekor qila oladigan bosqichlar amaldagi qoida bilan mos bo‘lsin. Keyingi bosqichlarda restoran bilan bog‘lanish yo‘lini ber. To‘lovli bekor qilish refund bajarilganini avtomatik anglatmasin.

Sinov: naqd buyurtma, olib ketish, minimal summa, takror bosish, narx o‘zgarishi, yopilgan restoran, o‘chirilgan mahsulot va telefon klaviaturasi.
```

## 9-prompt — naqd, kartaga o‘tkazma va onlayn to‘lov

```text
Mavjud to‘lov qoidalarini saqlab yakunla.

Naqd: buyurtma new holatida restoranga boradi. Mijoz qancha to‘lashini, kuryer qancha olishini aniq ko‘radi. Yetkazilganda naqd to‘lov holati yangilanadi; olib ketishda pulni restoran qabul qilishi alohida tushuntiriladi.

Kartaga o‘tkazma:
1. pending_payment — mijozga karta raqami, egasi, aniq summa, nusxalash va “To‘ladim” tugmasi.
2. “To‘ladim” — mijozning bildirishidir; payment_status=claimed, buyurtma new bo‘lib restoranga yuboriladi.
3. Vakolatli xodim real tushumni tekshirib “To‘lov keldi”ni bosgach paid bo‘ladi.
4. To‘lov tasdiqlanmasdan taom tayyorlashga qabul qilib bo‘lmaydi. Pul tushmagan bo‘lsa sabab bilan rad etiladi.
5. 30 daqiqada tasdiqlash harakati bo‘lmagan pending_payment buyurtma amaldagi qoida bo‘yicha tugatiladi. Kech pul o‘tkazilgan holatda yordam/refund yo‘li tushunarli bo‘lsin.

Karta raqami va egasini faqat restoran egasi o‘zgartirsin. Menejerga sozlamadagi karta raqami maskalansin. CVV, bank paroli yoki karta amal qilish muddatini so‘rama.

Online to‘lovni faqat PAYMENT_PROVIDER_TOKEN va restoran sozlamasi tayyor bo‘lsa ko‘rsat. Telegram Payments integratsiyasini joriy rasmiy hujjat bo‘yicha tekshir. Tugma bosilishi yoki klient “success” degani bilan paid qilma; serverdagi ishonchli to‘lov tasdig‘i, summa/valyuta/payload mosligi va takror hodisani tekshir. Provayder sozlanmagan bo‘lsa ishlaydigandek ko‘rsatma.

Kuryer oldindan to‘langan buyurtmada mijozdan 0 so‘m olishini ko‘rsin. Refund talab qilinishi va haqiqatan qaytarilishi ikki alohida holat bo‘lsin.

Sinov: takror “To‘ladim”, yolg‘on callback, boshqa mijoz buyurtmasi, tasdiqlanmagan o‘tkazmani qabul qilish, bekor qilingan buyurtmaga kech to‘lov va dublikat payment event.
```

## 10-prompt — platforma paneli va restoranlarni ulash

```text
Platforma administratori panelini va restoran onboarding’ini yarat yoki tugat.

Ikki ulash yo‘li:
A) Restoran egasi nom, telefon, tavsif, Jizzaxdagi xarita nuqtasi va oshxona turlari bilan ariza yuboradi; admin ko‘rib chiqadi.
B) Platforma administratori restoran yaratadi va egasiga bir martalik taklif havolasi beradi. Havolani ochgan to‘g‘ri foydalanuvchi o‘sha restoran egasi bo‘ladi.

Arizalar: kutmoqda, faol, bloklangan/rad etilgan holatlar; qaror va sabab egasiga tushunarli xabar bilan borsin. Restoran egasi va menejer rolini adashtirma. Taklifni qayta chiqarish avvalgisini bekor qila olsin.

Platforma panelida restoranlar, kutayotgan arizalar va umumiy ko‘rsatkichlar ko‘rinsin. Har bir restoran paneliga vakolatli kirish, statusni o‘zgartirish va egasi taklifini boshqarish bo‘lsin. Demo ma’lumotni o‘chirish alohida belgilangan, tasdiqli amal bo‘lsin va haqiqiy ma’lumotni o‘chirmasin.

Restoran egasining birinchi panelida tayyorlik ro‘yxati: restoran ma’lumoti, menyu, ish vaqti, yetkazish hududi, to‘lov, xodim/kuryer, Telegram guruhi. To‘liq bo‘lmagan sozlama bo‘lsa nimasi yetishmayotganini ko‘rsat.

Sinov: ariza → tasdiq → egasining kirishi; noto‘g‘ri/ishlatilgan taklif; restoran bloklanganda yangi buyurtmaning to‘xtashi; oddiy foydalanuvchining platforma API’ga kira olmasligi.
```

## 11-prompt — restoran panelining barcha bo‘limlari

```text
Restoran egasi va menejeri uchun yagona boshqaruv panelini yakunla.

Buyurtmalar: yangi, tayyorlanmoqda, tayyor, yo‘lda, yakunlangan/bekor qilingan. Kartada raqam, kelgan vaqt, mahsulotlar, summa, to‘lov holati, yetkazish/olib ketish va keyingi amal aniq. Telefon/manzil va tarix alohida ochilsin. Ovozli yangi buyurtma signali foydalanuvchi boshqaradigan bo‘lsin.

Amallar: qabul qilish va tayyorlash vaqti; sabab bilan rad etish; tayyor; o‘z kuryerini biriktirish/almashtirish; olib ketishni topshirish; ruxsatli yakunlash. Kartaga o‘tkazmada avval to‘lov tasdig‘i. Eski statusdagi tugma bosilsa yangi holat qaytsin.

Menyu: kategoriyalar, tartib, taom nomi/tavsifi/porsiyasi, rasm upload, narx/eski narx, ommaboplik va stop-list. Xato narx yoki yaroqsiz fayl tushunarli xabar bersin.

Kuryerlar: qo‘shish, taklif, onlayn/faol holat, transport, bugungi yetkazishlar va naqd yig‘imi. Faol buyurtmasi bor kuryerni o‘chirish/uzishdan oldin buyurtmalarni hal qilish kerak.

Xodimlar: egasi va menejer; taklif qilish, vakolat ko‘rsatish, kirishni bekor qilish. O‘zining yoki oxirgi egasining huquqini tasodifan olib tashlashdan himoya qil.

Sozlamalar: restoran ma’lumoti/logo/cover, ochiq-pauza, ish vaqti, baza narxi, bazaga kiradigan km, qo‘shimcha km narxi, radius, minimal buyurtma, free_delivery_from, olib ketish, to‘lov usullari, avtomatik dispetcher, Telegram guruhi.

Hisobot: bugungi buyurtma va tushum, 7 kunlik dinamika, o‘rtacha buyurtma, ommabop mahsulotlar, naqd va oldindan to‘langan summalarni ajratish. “Tushum”ni xarajatlar hisoblanmagan bo‘lsa “sof foyda” deb yozma.

Egasi/menejer farqini frontendda ham serverda ham qo‘lla. Butun panelda Taomkeldi tokenlari, o‘qiladigan kartalar va mos light/dark ko‘rinish bo‘lsin.
```

## 12-prompt — botni restoran guruhiga ulash

```text
Restoran Telegram guruhi integratsiyasini to‘liq tekshir va takomillashtir.

Oqim: bot restoran xodimlari guruhiga qo‘shiladi → vakolatli odam /bogla yuboradi → restoran tanlanadi → guruh va restoran nomi ko‘rsatiladi → ulanish tasdiqlanadi. Sozlamada guruh nomi, holati, tekshirish va uzish yo‘li bo‘lsin. Boshqa guruhga ko‘chirish eski bog‘lanishni nazoratli yangilasin.

MUHIM: amaldagi canManage’da chat ID ulangan guruhga teng bo‘lsa boshqarishga ruxsat beruvchi shart bor. Buni yetarli huquq deb qabul qilma. Har callback uchun foydalanuvchining platforma admini yoki shu restoranning vakolatli staff a’zosi ekanini serverda tekshir. Telegram guruh admini bo‘lishning o‘zi restoran egasi/menejeri rolini bermasin.

Bog‘lashda restoran vakolati va guruhda tegishli boshqaruv huquqi tekshirilsin. Botga faqat zarur huquqlar so‘ralsin. Oddiy buyurtma xabarlarini yuborish uchun barcha administrator huquqlarini asossiz talab qilma.

Bir restoran uchun asosiy guruh bo‘lsin. Mavjud arxitekturada topic qo‘llab-quvvatlanmasa qo‘llaydigandek ko‘rsatma; qo‘shilsa message_thread_id’ni chat_id bilan birga saqla va sinovdan o‘tkaz.

Yangi buyurtmada guruhga bitta asosiy xabar yubor. Holat o‘zgarganda o‘sha xabarning matni va inline tugmalarini yangila. Muhim istisno/eslatmalar alohida bo‘lishi mumkin. Xabar o‘chirilgan bo‘lsa nazoratli yangi nusxa yarat va yangi message_id saqla.

Guruhdan Mini App’ga o‘tishda qo‘llab-quvvatlanadigan URL/deep link ishlat. Guruhga shaxsiy chat uchun web_app tugmasini qo‘shma. Havoladan kirishda ham autentifikatsiya va restoran huquqi tekshirilsin.

Bot guruhdan chiqarilsa yoki xabar yubora olmasa egasi/panel buni ko‘rsin; “yuborildi” degan yolg‘on holat bo‘lmasin. Vakolatli egaga/xodimga zaxira xabarnoma yo‘li bo‘lsin. Guruhga test xabari faqat admin bosgan aniq “Sinov xabari” amali orqali yuborilsin.

Sinov: ruxsatli xodim, oddiy guruh a’zosi, begona restoran xodimi, eski tugma, o‘chirilgan xabar, guruhni almashtirish, bot chiqarilishi va supergroup migratsiyasi.
```

## 13-prompt — barcha bot xabarlari va tugmalar

```text
Taomkeldi botining barcha xabarlarini yagona shablonlar tizimiga keltir. Mijoz, restoran guruhi, egasi va kuryer uchun kerakli ma’lumot hajmi farq qilsin.

Oddiy Telegram HTML matnida Montserrat yoki erkin CSS ranglarini berishga urinma. Brend uslubi qisqa sarlavha, izchil matn, 1–3 ma’noli emoji, bo‘sh qator va tartibli inline tugmalar bilan sezilsin. Xabarni rasmga aylantirib asosiy narx/holatni o‘qish va nusxalashni qiyinlashtirma.

Barcha foydalanuvchi kiritgan matnlar HTML escape qilinsin. Callback’larda maxfiy/katta ma’lumot emas, tekshiriladigan ixcham identifikator ishlat. API uzunlik cheklovlariga mos qisqartirish va “Tafsilotlar” havolasi bo‘lsin. Har callback javob olsin; bir amal takror bosilganda dublikat yoki noto‘g‘ri status bo‘lmasin.

Restoran uchun asosiy shablon:
🔔 YANGI BUYURTMA #{{order_id}}
{{restaurant_name}} · {{created_at_local}}

{{items_lines}}

Taomlar: {{items_total}}
Yetkazish: {{delivery_fee_label}}
Jami: {{total}}
To‘lov: {{payment_label}} · {{payment_state_label}}

Mijoz: {{customer_name}}
Telefon: {{customer_phone}}
Manzil: {{address}}
Izoh: {{comment_or_dash}}

Naqd yoki tasdiqlangan to‘lovda tugmalar: “15 daqiqada”, “30 daqiqada”, “45 daqiqada”, ikkinchi qatorda “Rad etish”, “Panelda ochish”. Tasdiqlanmagan karta o‘tkazmasida asosiy tugma “To‘lov keldi”; qabul tugmalari hali bo‘lmasin. Rad etishda sabab talab qil.

Mijoz uchun yangi buyurtma:
✅ Buyurtma #{{order_id}} yuborildi
{{restaurant_name}} buyurtmangizni ko‘rib chiqmoqda.
Jami: {{total}}
To‘lov: {{payment_label}}
Tugma: “Buyurtmani kuzatish”.
Bu xabarda hali restoran qabul qilmagan bo‘lsa “Qabul qilindi” deb yozma.

Kuryerga biriktirilgan buyurtma:
🛵 Buyurtma #{{order_id}}
Olish joyi: {{restaurant_name}}, {{restaurant_address}}
Yetkazish joyi: {{customer_address}}
Mijozdan olinadi: {{collect_amount}}
To‘lov: {{payment_state_label}}
Tugmalar: holatga mos “Restoranga yo‘nalish” yoki “Mijozga yo‘nalish”, “Olib ketdim” yoki “Yetkazdim”; ruxsat etilgan bosqichda “Voz kechish”.

Yaratiladigan shablonlar katalogi:
- /start va yordam;
- restoran arizasi, tasdiq/rad, xodim/kuryer taklifi;
- guruh ulandi, uzildi, xabar yuborish xatosi;
- yangi buyurtma va pending payment;
- mijoz “To‘ladim”, tekshirilmoqda, to‘lov tasdiqlandi;
- qabul qilindi/tayyorlash vaqti;
- olib ketish uchun tayyor;
- kuryer taklifi, biriktirildi, boshqasi oldi, voz kechdi;
- onlayn kuryer yo‘q;
- yo‘lda, yetkazildi/topshirildi, baholash;
- bekor qilish sababi va kerak bo‘lsa refund bo‘yicha keyingi qadam;
- lokatsiya eskirdi yoki jonli joylashuv kerak;
- bepul yetkazish sharti va buyurtmada 0 so‘m tasdig‘i.

Mijoz holat xabarlari faqat muhim o‘zgarishda yuborilsin. Restoran asosiy xabari yangilansin, har mayda hodisa alohida uzun xabar bo‘lmasin. Tugmalar statusga mos almashsin; delivered/cancelled’da eski harakatlar olib tashlansin.

Yuborish xatolarini yo‘qotib yuborma: saqlanadigan notification/outbox yoki teng ishonchli mexanizm, qayta urinish, Telegram retry_after’ga rioya va duplicate himoyasi bo‘lsin. Buyurtma DB’da saqlanib, Telegram ishlamasa ham panelda ko‘rinsin. Bloklagan foydalanuvchiga cheksiz qayta yuborilmasin.

O‘zbekcha/ruscha shablonlarni va docs/message-catalog.md hujjatini yarat. Unda har xabar uchun hodisa, auditoriya, matn, tugmalar, shart va yangilanish usuli bo‘lsin. Sinovni faqat mock yoki alohida test bot/guruhda bajar.
```

## 14-prompt — restoran kuryerlari va dispetcher

```text
Har restoran o‘z kuryerlari bilan ishlashini bot va Mini App’da to‘liq yakunla.

Egasi/menejer kuryer yozuvi yaratadi, unga taklif havolasi beradi. Ulanganda kuryerga restoran nomi, ishga chiqish va jonli joylashuv bo‘yicha qisqa yo‘riqnoma yuboriladi. “Ishga chiqdim” va “Ishni tugatdim” holatlari serverda saqlanadi.

Avtomatik dispetcher faqat shu restoranning faol, onlayn va ulangan kuryerlariga taklif yuborsin. Qo‘lda biriktirish va boshqa kuryerga o‘tkazish ham bo‘lsin. Hech kim onlayn bo‘lmasa restoran guruhi/panelida amaliy ogohlantirish ko‘rinsin.

“Qabul qilaman”ni birinchi bosgan kuryer oladi. Bu frontend tekshiruvi emas, DB’dagi shartli atomik yangilash bilan himoyalansin. Ikkinchi kuryerga “Buyurtmani boshqa kuryer oldi” ko‘rsatilsin; qolgan taklif tugmalari yopilsin.

Kuryer ekranida: joriy buyurtma → hozirgi vazifa → olish/yetkazish manzili → yo‘nalish va aloqa → mijozdan olinadigan summa → bitta asosiy keyingi amal. Statistika va tarix ikkinchi darajada.

“Olib ketdim” faqat biriktirilgan kuryer va ruxsatli holatda; “Yetkazdim” faqat yo‘ldagi o‘z buyurtmasiga ishlasin. Olib ketishdan oldin voz kechish mumkin; olib ketilgandan keyin erkin voz kechish o‘rniga restoran orqali muammo hal qilish yo‘li kerak.

Oldindan to‘langan buyurtmada “Mijozdan olinadi: 0 so‘m — oldindan to‘langan”, naqd buyurtmada aniq jami ko‘rsat. Bepul yetkazish mijozning delivery_fee’si haqida; kuryer haqini avtomatik nol qilish degani emas.

Sinov: ikki kuryer bir paytda olishga urinishi, oflayn kuryer, noto‘g‘ri restoran, qayta biriktirish, bekor qilish, biriktirilmagan odam “Yetkazdim” bosishi.
```

## 15-prompt — jonli kuzatuv, tarix va profil

```text
Mijozning buyurtma kuzatuvi va shaxsiy bo‘limlarini yakunla.

Kuzatuvda yuqorida buyurtma raqami, haqiqiy holat va ma’lumot yetarli bo‘lsa taxminiy vaqt; keyin asosiy xarita, joylashuv yangilangan vaqt, kuryer bilan aloqa va yig‘iladigan tafsilotlar bo‘lsin. Katta dekorativ status belgisi xaritani pastga surmasin.

Mavjud lokatsiya mantiqini saqla va tekshir: Telegram live location hamda ochiq kuryer panelidan yangilanish; faol yetkazishda taxminan 15 soniya, qolgan vaqtda taxminan 60 soniya. Faol buyurtmasi bor kuryer offline tugmasini bossa kuzatuv mantiqi buzilmasin. Mini App fon rejimida yoki yopilganda GPS doim keladi deb va’da qilma.

3 daqiqadan eski joylashuv “Oxirgi joylashuv” deb ajratilsin; 20 daqiqadan eski nuqta yashirilsin. Bu chegaralar bir joyda saqlansin. Soxta kuryer animatsiyasi yoki asossiz aniq countdown qilma. To‘g‘ri chiziq masofasi shunday belgilanadi.

Kuryer koordinatasini faqat o‘sha faol buyurtmaning mijoziga va vakolatli xodimga ber. Yetkazilgandan keyin mijoz API’si jonli lokatsiyani qaytarmasin. Kuryer tayinlanmagan holatda tushunarli bo‘sh ko‘rinish bo‘lsin.

Buyurtmalar tarixi: raqam, restoran, sana, jami, holat, tafsilot. Qayta buyurtmada joriy narx/mavjudlik qayta tekshirilsin. Baholash faqat yetkazilgan o‘z buyurtmasi uchun, bir xil buyurtma reyting hisobini qayta-qayta oshirmasin.

Profil: ism/telefon, manzillar, sevimlilar, til, yordam va loyiha haqida. Ish rollari “Ish bo‘limlari”da ajratilsin. Ota brend yozuvi aynan “DasturXona'ning yangi loyihasi”.

Sinov: yangi/eski lokatsiya, kuryer almashishi, GPS uzilishi, delivered’dan keyingi kirish, begona buyurtma, tarixdan qayta buyurtma va til almashishi.
```

## 16-prompt — yangi “Bepul yetkazib berish” bo‘limi

```text
Endi Taomkeldi’ga alohida “Bepul yetkazib berish” bo‘limini qo‘sh. Bu oshxona turi emas, yetkazish sharti bo‘yicha bo‘lim/filtr.

Avval mavjud free_delivery_from, delivery_base, delivery_base_km, delivery_per_km va deliveryFee hisobini o‘qi. Mavjud shartlarni buzma, faqat UI’da narxni 0 qilib ko‘rsatish bilan cheklanma.

Ko‘rinish:
- bosh sahifada aniq “Bepul yetkazish” chipi yoki bo‘lim kartasi;
- bo‘lim ichida “Hozir bepul” va shartli takliflar aniq ajratiladi;
- doimiy/narxi haqiqatan 0 bo‘lgan taklif: “Yetkazish bepul”, mavjud minimal buyurtma bo‘lsa yonida;
- summaga bog‘liq taklif: “[summa] so‘mdan bepul”;
- savatda “Bepul yetkazish uchun yana [qoldiq] so‘m”;
- shart bajarilganda “Yetkazish: 0 so‘m — bepul”.

Hisob qoidalari:
1. Tanlangan manzil Jizzax ichida va restoran radiusida bo‘lishi shart. Manzil yo‘qligi yoki hisob xatosini “0 so‘m” deb talqin qilma.
2. Chegara taomlarning haqiqiy chegirmadan keyingi summasiga taqqoslanadi; delivery_fee chegarani to‘ldirmaydi.
3. items_total >= free_delivery_from bo‘lsa amaldagi threshold qoidasi ishlaydi. free_delivery_from=0 o‘z-o‘zidan “hamma uchun bepul” degani emas.
4. Savat yo‘q bo‘lsa shartli taklifni shartsiz “Hozir bepul” deb ko‘rsatma.
5. Olib ketishdagi 0 so‘m yetkazish aksiyasi deb hisoblanmaydi.
6. Minimal buyurtma, restoran ochiqligi va mahsulot mavjudligi baribir tekshiriladi.
7. Narx barcha joyda bitta server hisobidan olinadi: ro‘yxat, restoran, savat, checkout, buyurtma, restoran guruhi, kuryer va hisobot.
8. Savat/manzil o‘zgarsa eligibility va quote yangilanadi. Tasdiqlash paytida qayta hisoblanadi, yaratilgan buyurtmada snapshot saqlanadi.

Backend javobida shartsiz bepul, chegarali bepul, hali yetmagan qoldiq va yaroqsiz manzil holatlarini ajratadigan aniq maydonlar qaytar. Nomi mavjud kod uslubiga mos bo‘lsin. “Arzon yetkazish” saralashi o‘z vazifasida qolsin.

Restoran sozlamasida ushbu shartni qulay boshqarish va mijoz qanday ko‘rishini preview qilish bo‘lsin. Bepul yetkazish xarajatini restoran o‘z kuryerlari bilan qoplashi mavjud modelning asosi; platforma subsidiyasi yoki pullik yangi aksiya budjetini o‘zboshimchalik bilan yaratma.

Sinov: chegara N bo‘lsa N−1/N/N+1; mahsulot olib tashlash; manzil o‘zgarishi; radiusdan tashqari; yopiq restoran; minimum bajarilmagan; pickup; umumiy delivery_fee haqiqatan 0; order va bot xabaridagi jami tengligi.
```

## 17-prompt — barcha ekranlarning yakuniy dizayni

```text
Biriktirilgan uchta Taomkeldi maketi va dizayn tavsifiga tayangan holda barcha ekranlarni yakuniy bir xil ko‘rinishga keltir. Maketlar vizual yo‘nalish; namunaviy narx, xarita va generatsiyadagi logo haqiqiy ma’lumot o‘rniga olinmasin.

Qamrov: kirish/manzil, bosh sahifa, qidiruv, bepul yetkazish, restoran, taom oynasi, savat, checkout, to‘lov, kuzatuv, tarix, sevimlilar, profil; restoran dashboard/buyurtma/menyu/taom editor/kuryer/xodim/sozlama; kuryer faol buyurtma/taklif/tarix; platforma va restoran arizasi.

Mijozda taom va narx, restoranda navbat va keyingi amal, kuryerda manzil va olinadigan summa birinchi o‘rinda bo‘lsin. Har ekranda bitta asosiy harakat ajralsin. Keraksiz katta sarlavha, takror logo va bir necha ustma-ust pastki panelni kamaytir.

Bannerda realistik osh/somsa/burger fotosi, oz miqdorda 3D detal, navy/cream/carrot ranglar. Funksional ekranlarda og‘ir 3D, neon va kuchli soyalar bo‘lmasin. Original SVG logo va bir xil ikonlar ishlatilsin.

Telegramning haqiqiy yuqori panelini ilova ichida qayta chizma. Native BackButton, xavfsiz chetlar, content safe area, keyboard va viewport xatti-harakatini amaldagi SDK imkoniyatlariga mos sinab chiq. Pastki CTA klaviatura va navigatsiyani yopmasin.

Light/dark theme, loading, bo‘sh savat, natija yo‘q, yopiq restoran, tugagan taom, hududdan tashqari, offline, xato/qayta urinish, bekor qilingan va yakunlangan holatlarning hammasi dizayn tizimiga mos bo‘lsin.

320, 360, 390 va 430 px kengliklarda; uzun o‘zbekcha/ruscha matn; katta narx; matn kattalashtirish; fokus va klaviatura boshqaruvi; reduced-motion holatlarini tekshir. Aniq rang kontrastini koddan hisobla; maket rasmini accessibility sinovi deb ko‘rsatma.

Oldin/keyin ko‘rinishlarni test ma’lumotlari bilan taqdim et va yakunlangan ekranlar ro‘yxatini yoz. Ishlamagan yoki kirilmagan ekranni tekshirildi deb yozma.
```

## 18-prompt — yakuniy sinov, Railway va topshirish

```text
Taomkeldi’ni yakuniy tekshir va ishga tushirishga tayyorla. Hozirgi vazifa test va tayyorlash; production deploy uchun mening aniq topshirig‘im bo‘lmasa, deploy qilma.

Asosiy end-to-end ssenariylar:
1. Mijoz → manzil → restoran → savat → naqd buyurtma → guruh → qabul → kuryer → olib ketish → kuzatuv → yetkazish → baholash.
2. Kartaga o‘tkazma → “To‘ladim” → restoran tekshiruvi → tasdiq/rad → tegishli xabarlar.
3. Olib ketish → tayyor → mijozga topshirish, kuryersiz.
4. Restoran arizasi → admin qarori → egasi → menejer/kuryer takliflari → guruhga ulash.
5. Bepul yetkazish sharti bajariladi/bajarilmaydi; har ekran va xabarda jami mos.
6. Ikki kuryer bir buyurtmani olishga urinadi; bitta g‘olib.
7. Takror callback/checkout, noto‘g‘ri rol, begona restoran va bekor qilingan buyurtma.
8. Telegram ishlamasa buyurtma saqlanadi, notification qayta urinadi; restartdan keyin yo‘qolmaydi.
9. Bot guruhdan chiqarilishi, asosiy xabar o‘chishi, yangi guruhga ko‘chish.
10. UZ/RU, dark/light, tor ekran, GPS va klaviatura holatlari.

Sinovlar kritik biznes qoidalarini tekshirsin. Test DB va test botni production’dan ajrat. Haqiqiy mijozga xabar yoki haqiqiy to‘lov yuborma.

Railway uchun mavjud loyiha: delivo-bot, servis Taomkeldi. Yangi nusxa kerak bo‘lmasa ikkinchi bir xil loyiha yaratma. Boshqa Railway loyihalariga hech narsa joylama va ularni o‘zgartirma. SQLite DB va uploadlar persistent volume’da bo‘lsin; DB_PATH/UPLOADS_DIR to‘g‘ri mountga qarasin. Tokenlar muhit o‘zgaruvchilarida, HTTPS WEBAPP_URL to‘g‘ri, healthcheck ishlasin. Long polling ishlatilsa bir vaqtda bitta faol bot nusxasi bo‘lsin. Runtime va lockfile bir-biriga mosligini tekshir.

README, .env.example, migratsiya/backup/restore yo‘riqnomasi, rol jadvali, xabarlar katalogi va test hisobotini yangila. To‘lov provayderi yoki Telegram sessiyasi bo‘lmasa tekshirilmagan qismini aniq belgilagin.

Topshirishda: tayyor funksiyalar, bajarilgan testlar, qolgan cheklovlar, zarur muhit o‘zgaruvchilarining faqat nomlari va deploy uchun tayyor o‘zgarishlarni ko‘rsat. Men keyin “deploy qil” desam, aynan tekshirilgan versiyani joyla va deployment holati, healthcheck, xatolar hamda ma’lumotlar saqlanishini tekshir.
```

## Har bosqichdan keyin yuborish mumkin bo‘lgan tekshiruv prompti

```text
Hozirgi bosqichni talablar bilan solishtir. Har bandga “bajarildi”, “qisman”, “bajarilmadi” holati va dalil yoz. Dalil sifatida tegishli funksiya/fayl, API javobi yoki haqiqiy test natijasini ko‘rsat. Mock natijani jonli natija deb yozma. Topilgan kamchiliklarni shu bosqich doirasida tuzat va qayta tekshir. Keyingi bosqichdagi funksiyalarni aralashtirib yuborma. docs/PROGRESS.md’ni yangila.
```

## Claude’da yangi chatga o‘tish uchun davom ettirish prompti

```text
Taomkeldi loyihasini davom ettiramiz. Avval docs/PROJECT_CONTEXT.md, docs/PROGRESS.md, README va joriy kodni o‘qi. Tugallangan bosqichlarni qayta yaratma. Original brend Taomkeldi, bot @taomkeldi_bot, ota brend DasturXona. Restoranlar o‘z kuryerlari bilan ishlaydi, hudud Jizzax viloyati. Qaysi bosqichga kelganimizni dalil bilan aniqlab, men yuborgan navbatdagi promptni bajar. Ishlamayotgan yoki ulanmagan xizmatni ishlayapti deb hisoblama.
```

## Alohida, ixtiyoriy prompt — reklama va brend materiallari

Bu prompt ilovaning funksional bosqichlariga kirmaydi. Avvalgi logo, teaser, banner va shtendr talablarini alohida davom ettirish uchun.

```text
Taomkeldi uchun biriktirilgan original logo va brend palitrasiga mos reklama materiallarini tayyorlash topshirig‘ini tuz:
1. Telegram kanal avatari: mark markazda, kichik o‘lchamda taniqli, tiniq PNG va original SVG.
2. 3D logo: original proporsiyalar, tabiiy hajm/yoritish, orqasida aylana disk yo‘q.
3. Gorizontal promo: Taomkeldi, @taomkeldi_bot, “DasturXona'ning yangi loyihasi”, qisqa slogan, taom va yetkazish mazmuni.
4. “Tez kunda” varianti faqat loyiha hali ishga tushmagan kampaniyada ishlatiladi.
5. Mini App tepasiga banner: mavjud konteyner o‘lchami va matnning xavfsiz joylarini hisobga ol.
6. Kafe/restoran oldiga 80×120 sm vertikal shtendr: uzoqdan o‘qiladigan sarlavha, brend, taom, aniq CTA, @taomkeldi_bot va ishlaydigan QR.

Montserrat, krem/to‘q ko‘k va Taomkeldi orange aksenti. Yozuv va obyektlar ustma-ust tushmasin. QR generativ rasm sifatida chizilmasin: haqiqiy https://t.me/taomkeldi_bot manzilidan deterministik yaratiladi va skan bilan tekshiriladi. Chop fayli o‘lchami, bleed va rang profili bosmaxona talabiga mos alohida eksport qilinadi.

Mavjud Higgsfield yoki boshqa ruxsatli tasvir vositasi bo‘lsa reference asosida ishlat; bo‘lmasa vosita uchun tayyor prompt va aniq maket spetsifikatsiyasini ber. Generatsiya qilinmagan rasmni tayyor deb aytma.
```

## Manbalar va biriktirishlar

- Amaldagi kod: https://github.com/kuvondikov-ss/taomkeldi. Holat — `docs/PROGRESS.md`.
- [Telegram Bot API](https://core.telegram.org/bots/api#inlinekeyboardbutton): tugmalar va xabarlar qo‘llab-quvvatlashi. Xususan, oddiy `InlineKeyboardButton.web_app` foydalanuvchi va bot shaxsiy chati uchun; guruh oqimiga mos havola tanlanadi.
- [Telegram Mini Apps](https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app): serverdagi initData tekshiruvi va SDK integratsiyasi.
- Dizayn maketlari: Taomkeldi uchun hali tayyorlanmagan.

Promptlarda “mavjud …” deb tilga olingan narsalar (masalan, `public/geo/jizzax.json`, `canManage`, `AUTO_ADMIN`, `free_delivery_from`, lokatsiya mantiqi) Taomkeldi’da hali yo‘q: Claude ularni “yo‘q” deb belgilab, shu bosqichda noldan yaratadi. Ushbu hujjat promptlar to‘plamidir; undagi talablar hali botga kiritilmagan.
