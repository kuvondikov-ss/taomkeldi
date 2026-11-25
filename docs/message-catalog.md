# Taomkeldi — bot xabarlari katalogi

Barcha matnlar: `src/i18n/uz.js` va `src/i18n/ru.js` (kalitlar bir xil, test tekshiradi). Murakkab xabarlar (buyurtma) — `src/services/templates.js`.
Ushbu hujjatdagi har kalit `test/messages.test.js` da tekshiriladi: yangi shablon qo'shilsa, shu yerga ham yoziladi.

## Umumiy qoidalar
- **Format:** Telegram HTML. Brend uslubi — qisqa qalin sarlavha, 1–3 ma'noli emoji, bo'sh qatorlar, tartibli inline tugmalar. Rasm-xabar ishlatilmaydi (narx va holat matn bo'lib qoladi — o'qiladi va nusxalanadi).
- **Xavfsizlik:** foydalanuvchi kiritgan har matn (ism, izoh, manzil, sabab, restoran nomi) HTML escape qilinadi (`t()` o'zgaruvchilari va `templates.esc`).
- **Callback:** faqat ixcham identifikator — `o:<buyurtma>:<amal>` (restoran), `c:<buyurtma>:<amal>` (kuryer), `bg:/bgc:<restoran>`, `bgx`, `lang:uz|ru`. Maxfiy yoki katta ma'lumot yo'q; 64 baytdan oshmaydi. Har bosishda vakolat va holat serverda qayta tekshiriladi.
- **Har callback javob oladi.** Holat o'zgargan bo'lsa — "Holat o'zgargan — xabar yangilandi" va xabar joriy holatga keltiriladi; noma'lum/eski tugma — `btn_stale`. Takror bosish dublikat yoki noto'g'ri holat bermaydi (shartli UPDATE).
- **Uzunlik:** 4096 dan oshmaydi. Taomlar ro'yxati 25 tagacha (`g_more_items`), to'liq ko'rinish — "Panelda ochish" / "Buyurtmani kuzatish".
- **Yetkazish (outbox):** `notifications` jadvali. Xabar avval yoziladi, keyin yuboriladi; vaqtinchalik xatoda (tarmoq, 5xx) orqaga surilgan qayta urinish (10 s → 30 daq, ko'pi 8 marta), 429 da `retry_after` kutiladi (navbat to'xtaydi), `dedupe_key` — bir hodisa uchun bitta xabar. Botni bloklagan foydalanuvchiga qayta urinilmaydi (`users.bot_blocked_at`; o'zi botga yozsa tiklanadi). Jonli xabarlar (guruh, kuryer) uchun `sync` topshirig'i. Telegram ishlamasa ham buyurtma bazada va panelda bor.
- **Til:** mijoz va kuryer — o'z tilida (uz/ru); restoran guruhi — o'zbekcha.

Yangilanish usullari: **yangi** — har safar yangi xabar; **bir marta** — `dedupe_key` bilan bir hodisaga bitta xabar; **tahrir** — bitta jonli xabar holatga qarab tahrirlanadi (`order_messages`), o'chirilgan bo'lsa yangi nusxa.

## Kirish, yordam, tillar
| Kalit | Hodisa | Auditoriya | Matn (qisqa) | Tugmalar | Shart | Yangilanish |
|---|---|---|---|---|---|---|
| `start` | `/start` | har kim (shaxsiy) | Xush kelibsiz, Jizzax restoranlari | rolga qarab: Buyurtma berish, Buyurtmalarim, Yordam, Restoran paneli / Kuryer paneli / Platforma boshqaruvi / Restoran ulash | — | yangi |
| `help` | `/help`, "Yordam" | har kim | Buyruqlar ro'yxati | O'zbekcha / Русский | shaxsiy chatda tugmalar | yangi |
| `app_not_ready` | Mini App manzili yo'q | har kim | Ilova hali ulanmagan | — | `WEBAPP_URL` noto'g'ri | yangi |

## Restoran arizasi va takliflar
| Kalit | Hodisa | Auditoriya | Matn | Tugmalar | Shart | Yangilanish |
|---|---|---|---|---|---|---|
| `app_approved` | admin tasdiqladi | ariza beruvchi | Restoran tasdiqlandi, keyingi qadam — tayyorlik ro'yxati | — | — | yangi |
| `app_rejected` | admin rad etdi | ariza beruvchi | Rad etildi, sabab | — | sabab majburiy | yangi |
| `restaurant_blocked` | admin blokladi | egalar | Bloklandi, sabab | — | — | yangi |
| `restaurant_unblocked` | blokdan chiqdi | egalar | Qayta faollashtirildi | — | — | yangi |
| `invite_owner`, `invite_manager`, `invite_courier` | taklif havolasi qabul qilindi | yangi xodim/kuryer | Rol va keyingi qadam (kuryerga ish tartibi) | asosiy menyu | havola yaroqli | yangi |
| `invite_already`, `invite_invalid`, `invite_blocked` | havola ishlamadi | taklif qilingan | Sabab | — | — | yangi |

## Restoran guruhi
| Kalit | Hodisa | Auditoriya | Matn | Tugmalar | Shart | Yangilanish |
|---|---|---|---|---|---|---|
| `group_start` | bot guruhga qo'shildi, `/start` guruhda | guruh | `/bogla` yo'riqnomasi | — | sinov xabari emas | yangi |
| `bogla_private` | `/bogla` shaxsiy chatda | foydalanuvchi | Guruhda yuboring | — | — | yangi |
| `bogla_not_staff` | `/bogla` xodim emas | guruh | Faqat ega/menejer | — | — | yangi |
| `bogla_not_admin` | yuboruvchi guruh admini emas | guruh / alert | Faqat guruh admini bo'lgan xodim | — | — | yangi |
| `bogla_anonymous` | anonim admin | guruh | O'z nomingizdan yuboring | — | — | yangi |
| `bogla_bot_cant_send` | botda yozish huquqi yo'q | guruh | Huquq bering | — | — | yangi |
| `bogla_choose` | bir nechta restoran | guruh | Qaysi restoran? | restoranlar `bg:<id>`, Bekor | — | tahrir |
| `bogla_confirm`, `bogla_confirm_move`, `bogla_topic` | tanlandi | guruh | Tasdiqlash (ko'chirish bo'lsa eski guruh nomi; mavzu bo'lsa "shu mavzuga") | Tasdiqlash `bgc:<id>`, Bekor `bgx` | — | tahrir |
| `bogla_done` | ulandi | guruh | Ulandi; tugmalar faqat xodimlarga | — | — | tahrir |
| `bogla_cancelled` | bekor | guruh | Bekor qilindi | — | — | tahrir |
| `group_moved_away` | restoran boshqa guruhga ko'chdi | eski guruh | Endi boshqa guruhga tushadi | — | eski guruh faol bo'lsa | yangi |
| `group_removed` | bot chiqarildi / chat topilmadi | ega, menejerlar (shaxsiy) | Buyurtmalar shaxsiy xabarda keladi, botni qaytaring | — | holat o'zgarganda bir marta | yangi |
| `group_no_rights` | yozish huquqi olindi | ega, menejerlar | Huquq bering | — | bir marta | yangi |
| `group_test` | panelda "Sinov xabari" | guruh | Sinov: guruh to'g'ri ulangan | — | faqat aniq bosilganda | yangi |
| Uzildi (panel) | panelda "Uzish" | — | Xabar yuborilmaydi; panelda holat "Ulanmagan" | — | — | — |

## Buyurtma — restoran (asosiy xabar)
Shablon `templates.staffOrder`; kalitlar `g_head_new` (🔔 YANGI BUYURTMA #N), `g_head` (holat), `g_items`, `g_delivery`, `g_free`, `g_total`, `g_payment`, `pm_*`, `ps_*`, `g_customer`, `g_phone`, `g_address`, `g_comment`, `g_prep`, `g_reason`, `g_more_items`.

```
🔔 YANGI BUYURTMA #{order_id}
{restaurant_name} · {created_at_local}

• {taom} × {soni} — {summa}

Taomlar: {items_total}
Yetkazish: {delivery_fee | bepul}
Jami: {total}
To‘lov: {usul} · {holat}

Mijoz: {customer_name}
Telefon: {customer_phone}
Manzil: {address} 🗺
Izoh: {comment | —}
```

| Holat | Tugmalar (`o:<id>:…`) |
|---|---|
| `new`, naqd yoki to'langan | ✅ 15 / 30 / 45 daq (`a15/a30/a45`); ✖️ Rad etish (`rj` → sabablar `rr1..3`, ← Orqaga `bk`), Panelda ochish (URL) |
| `new`, karta o'tkazmasi tasdiqlanmagan | 💳 To'lov keldi (`po`); Pul kelmadi (`pn`), Panelda ochish — qabul tugmalari yo'q |
| `accepted` | 🍽 Tayyor (`rd`); Panelda ochish |
| `ready` | 🛵 Kuryerga berildi (`ow`) yoki olib ketishda ✅ Mijozga berildi (`dl`) |
| `on_way` | ✅ Yetkazildi (`dl`) |
| `delivered`, `cancelled` | faqat Panelda ochish (eski amallar olib tashlanadi) |

- **Auditoriya:** restoran guruhi (mavzu bo'lsa — o'sha mavzu). Guruh yo'q yoki ishlamasa — ega va menejerlarga shaxsiy xabar (har biriga bir marta), keyin u ham tahrirlanadi.
- **Shart:** `pending_payment` buyurtma yuborilmaydi. **Yangilanish:** tahrir (har holat, to'lov, kuryer o'zgarishida).
- "Panelda ochish" — `t.me/<bot>?start=o_<id>` (guruhda `web_app` tugmasi ishlamaydi); shaxsiy chatda faqat restoran xodimiga Mini App tugmasi (`order_panel_open`).

## Buyurtma — mijoz (faqat muhim bosqichlar)
Bosqich `templates.customerMilestone` bilan aniqlanadi; har bosqich `cust:<id>:<bosqich>` kaliti bilan **bir marta**. Tugma — `web_app` (Mini App sozlangan bo'lsa).

| Kalit | Bosqich / hodisa | Matn | Tugma | Shart |
|---|---|---|---|---|
| `c_created` | naqd buyurtma restoranga tushdi | ✅ Buyurtma #N yuborildi; restoran ko'rib chiqmoqda; Jami; To'lov | `c_btn_track` Buyurtmani kuzatish | "Qabul qilindi" deyilmaydi |
| `c_await_transfer` | karta o'tkazmasi kutilmoqda | 💳 to'lov kutilmoqda, muddat | `c_btn_pay` To'lov sahifasi | `pending_payment` + karta |
| `c_claimed` | mijoz "To'ladim" bosdi | 🕓 to'lov tekshirilmoqda | kuzatish | — |
| `payment_ok` | to'lov tasdiqlandi (karta yoki onlayn) | ✅ To'lov qabul qilindi; restoran ko'rib chiqmoqda | kuzatish | onlayn to'lovda bot handler ham shu kalit bilan — takrorlanmaydi |
| `payment_late` | bekor qilingan buyurtmaga kech onlayn to'lov | Pul qaytarish so'raldi | — | `cust:<id>:late` |
| `c_accepted`, `c_accepted_eta` | restoran qabul qildi | 👨‍🍳 qabul qilindi (taxminan N daqiqa) | kuzatish | — |
| `c_ready_pickup` | olib ketish uchun tayyor | 🛍 tayyor, manzil | kuzatish | faqat olib ketish (yetkazishda "tayyor" yuborilmaydi) |
| `c_on_way`, `c_on_way_courier` | kuryer olib ketdi | 🛵 yo'lda (kuryer ismi) | kuzatish | — |
| `c_delivered`, `c_handed` | yetkazildi / topshirildi | 🎉 Yoqimli ishtaha | `c_btn_open` Buyurtmani ochish (baholash — 15-bosqich) | — |
| `c_cancelled` (+ `c_refund_next`) | restoran/tizim bekor qildi | ❌ bekor, sabab; to'langan bo'lsa — qaytarish bo'yicha keyingi qadam | kuzatish | mijozning o'zi bekor qilsa yuborilmaydi; muddat o'tsa sabab — `reason_payment_timeout` |
| `c_refunded` | pul qaytarildi | 💸 qaytarildi, summa | — | — |
| `c_free_delivery` | bepul yetkazish | "Yetkazish: bepul (0 so'm)" qatori | — | yetkazishda `delivery_fee = 0`; yangi buyurtma xabarlariga qo'shiladi |

## Buyurtma — kuryer (bitta jonli xabar)
Shablon `templates.courierOrder`; `order_messages.kind = courier_main`, holatga qarab **tahrir**.

```
🛵 Buyurtma #{order_id} · {holat}

Olish joyi: {restaurant_name}, {restaurant_address}
Yetkazish joyi: {customer_address}
Mijoz: {ism} · {telefon}

Mijozdan olinadi: {collect_amount | 0 so‘m — oldindan to‘langan}
To‘lov: {usul} · {holat}
```

| Kalit | Hodisa / holat | Tugmalar | Shart |
|---|---|---|---|
| `k_head`, `k_pickup`, `k_dropoff`, `k_collect`, `k_collect_none`, `k_wait_ready` | biriktirildi (`new`/`accepted`) | `k_btn_to_restaurant` 📍 Restoranga yo'nalish (URL) | faqat yetkazish; `pending_payment` emas |
| — | `ready` | 📍 Restoranga yo'nalish; `k_btn_picked` 📦 Olib ketdim (`c:<id>:pk`) | — |
| `k_btn_release` | `new` / `accepted` / `ready` | Voz kechish (`c:<id>:rl`) → `k_released_ok`; restoranga `k_staff_released` | faqat olib ketishdan oldin |
| — | `on_way` | `k_btn_to_customer` 📍 Mijozga yo'nalish; `k_btn_delivered` ✅ Yetkazdim (`c:<id>:dl`); `k_btn_problem` Muammo (`c:<id>:pb`) | voz kechish yo'q — `k_picked_alert` |
| `k_staff_problem`, `k_problem_ok` | kuryer "Muammo" bosdi | ega, menejerlar (shaxsiy) va guruh: kuryer ismi va telefoni | 10 daqiqada bir marta (dedupe) |
| `k_head_done` | `delivered` / `cancelled` | tugmalarsiz | — |
| `k_unassigned` | kuryer almashtirildi / olib tashlandi | eski xabardan tugmalar olinadi | — |
| `k_not_yours` | boshqa kuryer bosdi | alert | vakolat — `orders.transition` |

## Kuryer smenasi va dispetcher (14-bosqich)
Dispetcher: `services/dispatch.js`. Taklif — restoran qabul qilgan (`accepted`/`ready`) yetkazish buyurtmasi, faqat shu restoranning faol, ulangan, **ishdagi** kuryerlariga (`auto_dispatch` yoqilgan bo'lsa). "Qabul qilaman" — birinchi bosgan oladi: `orders.courier_id IS NULL` shartli UPDATE.

| Kalit | Hodisa | Auditoriya | Matn | Tugmalar | Shart | Yangilanish |
|---|---|---|---|---|---|---|
| `courier_title`, `courier_line`, `courier_online`, `courier_offline`, `courier_app_hint` | `/courier`, "Kuryer paneli", taklif havolasi qabul qilinganda | kuryer | Restoranlar va smena holati | `k_shift_on_btn` / `k_shift_off_btn` (`cs:<courier>:1`, `cs:<courier>:0`), Mini App | — | yangi |
| `k_shift_on`, `k_shift_off` | smena o'zgardi | kuryer | Ishdasiz (jonli joylashuv eslatmasi) / Ish tugatildi | — | — | yangi |
| `k_offer_head`, `k_offer_ready`, `k_offer_cooking` | dispetcher taklifi | ishdagi kuryerlar | 🆕 Yangi buyurtma #N, olish/yetkazish joyi, mijozdan olinadi | `k_btn_accept` (`d:<id>:ok`), `k_btn_skip` (`d:<id>:no`) | — | tahrir (yopilganda) |
| `k_offer_accepted`, `k_accept_ok` | taklifni oldi | g'olib kuryer | Biriktirildi; keyin jonli buyurtma xabari | — | — | tahrir |
| `k_offer_taken`, `k_taken_alert` | boshqasi oldi / qo'lda biriktirildi | qolgan kuryerlar | Buyurtmani boshqa kuryer oldi | tugmalar olib tashlanadi | — | tahrir |
| `k_offer_declined` | o'tkazib yubordi | kuryer | O'tkazib yuborildi | — | — | tahrir |
| `k_offer_offline` | kuryer ishni tugatdi | kuryer | Taklif yopildi | — | — | tahrir |
| `k_offer_cancelled` | buyurtma bekor | taklif olgan kuryerlar | Bekor qilindi | — | — | tahrir |
| `k_offer_closed_alert`, `k_offline_alert` | yopilgan taklif / ishda emas | kuryer (alert) | — | — | — | — |
| `g_dispatch_offering`, `g_dispatch_none` | kuryer qidirilmoqda / topilmadi | restoran guruhi (asosiy xabar qatori) va panel | 🔎 qidirilmoqda / ⚠️ onlayn kuryer yo'q — qo'lda biriktiring | — | yetkazish, kuryersiz, `accepted`/`ready` | tahrir |
| `k_location_ok` | kuryer joylashuv yubordi | kuryer | Qabul qilindi (jonli joylashuvda jim) | — | ishdagi kuryer | yangi |

## Rejalashtirilgan (keyingi bosqichlar)
| Xabar | Bosqich |
|---|---|
| Lokatsiya eskirdi / jonli joylashuv kerak (mijozga kuzatuv) | 15 |
| Baholash | 15 |
| "Bepul yetkazib berish" bo'limi xabarlari | 16 |

Sinov: faqat mock (`test/group.test.js`, `test/messages.test.js`, `test/courier.test.js`) yoki alohida test bot/guruh.
