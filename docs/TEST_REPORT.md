# Taomkeldi — test hisoboti (18-bosqich, 2026-11-25)

**Natija: 290 / 290 test o'tdi** (`npm test`, Node v24.21, Windows). Ketma-ket 7 marta to'liq ishga tushirildi — barchasi yashil (bitta beqarorlik topilib tuzatildi, pastga qarang).

Har test alohida vaqtinchalik bazada ishlaydi (production bazasi va tokeniga tegmaydi). Telegram API ushlab olinadi (mock) — haqiqiy mijozga xabar yoki haqiqiy to'lov yuborilmaydi.

## End-to-end ssenariylar (`test/e2e.test.js` va boshqalar)
| # | Ssenariy | Qayerda | Natija |
|---|---|---|---|
| 1 | Mijoz → manzil → restoran → savat → naqd buyurtma → guruh → qabul → kuryer (dispetcher) → olib ketish → kuzatuv → yetkazish → baho; jami hamma joyda bir xil | e2e 1 | ✅ |
| 2 | Kartaga o'tkazma → "To'ladim" → guruh tekshiruvi → rad (sabab) / tasdiq → mijoz xabarlari | e2e 2, payments, messages | ✅ |
| 3 | Olib ketish → tayyor → topshirildi, kuryersiz va dispetchersiz | e2e 3 | ✅ |
| 4 | Ariza → admin qarori → egasi → menejer/kuryer takliflari (bot /start) → guruhga ulash (/bogla) | e2e 4, platform, bot | ✅ |
| 5 | Bepul yetkazish sharti bajariladi/bajarilmaydi (N−1/N/N+1), har ekran va xabarda jami mos | free-delivery | ✅ |
| 6 | Ikki kuryer bir buyurtmani bir vaqtda oladi — bitta g'olib | courier | ✅ |
| 7 | Takror callback/checkout, noto'g'ri rol, begona restoran, bekor qilingan buyurtma | e2e 7, group, courier | ✅ |
| 8 | Telegram ishlamasa buyurtma saqlanadi, xabar navbatda; "restart"dan (yangi ulanish, o'sha fayl) keyin yuboriladi | e2e 8, messages (outbox) | ✅ |
| 9 | Bot guruhdan chiqarilishi, asosiy xabar o'chishi, yangi guruhga ko'chish, supergroup migratsiyasi | group | ✅ |
| 10 | UZ/RU, dark/light, tor ekran (320/390), 130% matn, GPS, klaviatura | brauzer (DESIGN_SYSTEM.md, 17-bosqich), tracking | ✅ qisman — pastga qarang |

## Fayllar bo'yicha
| Fayl | Nima |
|---|---|
| foundation | config, initData, rollar, xatolar, migratsiyalar, upload |
| bot | /start, menyular, rollar, takliflar, tillar, guruh buyruqlari |
| geo, catalog, cart, checkout | Jizzax hududi, ro'yxat/qidiruv/saralash, savat, yagona quote, idempotency, holat o'tishlari |
| payments | naqd, karta o'tkazmasi, Telegram Payments (pre_checkout, successful_payment, dublikat) |
| platform, manage | admin paneli, arizalar, restoran paneli bo'limlari |
| group | /bogla, guruh xabari, tugmalar, bot chiqarildi, migratsiya, mavzu |
| messages | shablonlar, mijoz bosqichlari, outbox (dedupe, 5xx, 429, bloklash) |
| courier | smena, dispetcher, poyga, voz kechish, muammo, kuryer API |
| tracking | joylashuv chegaralari, maxfiylik, baho, qayta buyurtma, tarix |
| free-delivery | bepul yetkazish qoidalari |
| e2e | yuqoridagi ssenariylar |
| design | dizayn tokenlari, tarjima kalitlari (takroriy kalit yo'q) |

## Topilgan va tuzatilgan (18-bosqichda)
- Beqaror test: 7 ta to'liq ishga tushirishdan birida 35 ta test yiqildi. Sabab: test bazani yopayotganda fon tinglovchilari (guruh/kuryer xabari, dispetcher) hali ishlayotgan edi ("database is not open"). Tuzatish: `test/helpers.js` yopishdan oldin `services.idle()` ni kutadi, Windows'da papkani o'chirish qayta urinadi. Keyingi 3 ishga tushirishda "database is not open" 0 marta.
- Healthcheck endi bazani haqiqatan tekshiradi (`/health` → `db`, `migration`, `notifications`, `bot`); baza ishlamasa 503.
- `railway.json` (Railpack, `npm start`, healthcheck, restart siyosati), `scripts/backup.mjs` (izchil zaxira + integrity), `docs/OPERATIONS.md`.

## Tekshirilmagan (aniq belgilangan)
- **Haqiqiy Telegram ichida**: Railway'da hali eski bot; yangi versiya deploy qilinmagan (foydalanuvchi buyrug'i kutilmoqda). Shuning uchun real Mini App (initData, BackButton, xavfsiz chetlar, klaviatura), real guruh va real kuryer telefoni bilan sinov yo'q.
- **Onlayn to'lov**: `PAYMENT_PROVIDER_TOKEN` yo'q — Telegram Payments faqat mock bilan sinalgan.
- **Real GPS va jonli joylashuv** (telefon, fon rejimi) — faqat API va brauzer (ruxsat berilmagan holat) darajasida.
- Ekran o'quvchi (screen reader) bilan to'liq o'tish.
- Railway volume, domen va healthcheck — deploydan keyin tekshiriladi (OPERATIONS.md, 6-qadam).
