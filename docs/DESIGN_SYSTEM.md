# Taomkeldi — dizayn tizimi

3-bosqich, 2026-11-25. Jonli namuna: `/ui-kit.html` (lokal serverda). Fayllar: `public/css/tokens.css`, `public/css/components.css`, `public/js/ui/*`.

## Logo
Original: `public/brand/taomkeldi-original.svg` (o'zgartirilmaydi). Shior: "Taomingiz eshigingizgacha".
Variantlar `node scripts/brand-variants.mjs` bilan qayta yasaladi; shakllar (path) originaldan aynan olinadi — buni `test/design.test.js` tekshiradi.

| Fayl | Qayerda |
|---|---|
| `taomkeldi-full-light.svg` / `-full-dark.svg` | Katta joylar: kirish ekrani, reklama (to'q variantda yozuv krem rangda) |
| `taomkeldi-compact-light.svg` / `-compact-dark.svg` | Ilova header'i (shiorsiz) |
| `taomkeldi-mark.svg` | Faqat belgi |
| `taomkeldi-favicon.svg`, `apple-touch-icon.png` | Brauzer yorlig'i |
| `taomkeldi-avatar-512.png` | Telegram bot avatari (@BotFather → /setuserpic) |
| `placeholder.svg` | Taom rasmi yo'q bo'lganda (fon shaffof, konteyner beradi) |

Cheklov: belgi keng, 16 px favikonda mayda; 32 px+ o'qiladi.

## Ranglar
Palitra logodan: `#679C76` (asosiy yashil), `#21583A` (to'q yashil), `#92B88F`, `#B5CFAE`, yozuv `#232323`.
Sahifalar faqat semantik tokenlardan foydalanadi; `components.css` da xom rang yo'q (test tekshiradi).

| Token | Yorug' | To'q | Vazifasi |
|---|---|---|---|
| `--bg` | #FAF8F4 | #111814 | Sahifa foni |
| `--surface` / `--surface-2` | #FFFFFF / #F3F1EA | #18221C / #213028 | Karta / qidiruv, placeholder |
| `--text` / `--text-2` | #232323 / #56635A | #EEF2EC / #A9B8AD | Matn / yordamchi matn |
| `--brand` | #679C76 | #92B88F | Bezak: faol tab chizig'i, ikonkalar (matn uchun emas) |
| `--primary` / `--on-primary` | #21583A / #FFFFFF | #92B88F / #0F1F15 | Asosiy tugma, faol nav |
| `--secondary` / `--on-secondary` | #DCE9D7 / #21583A | #26382D / #B5CFAE | Ikkinchi tugma, miqdor |
| `--danger`, `--success`, `--warning` (+ `-bg`) | | | Holatlar |

Kontrast `node scripts/contrast.mjs` bilan koddan hisoblanadi (WCAG): matn ≥ 4.5, bezak ≥ 3. Joriy natija — barcha juftliklar o'tadi; eng pasti: yorug' `--brand` oq fonda 3.18 (shuning uchun matnda ishlatilmaydi).

Mavzu: Telegram ichida `Telegram.WebApp.colorScheme` (`applyTelegramTheme()`, header/fon rangi ham moslanadi), tashqarida tizim sozlamasi.

## Tipografiya
Montserrat (variable, o'z serverimizdan: lotin, lotin-kengaytma, kirill), zaxira — tizim sans-serif.
Matn 16 px / 400–500; yordamchi 12–14 px; ajratish 600; sarlavha 20–24 px / 700. Narxlar `tabular-nums`, `price` sinfi; summa `formatSum()` — bo'shliq NBSP, "so‘m"/"сум".

## O'lchamlar
8 px ritm (`--sp-*`), yon chet 16 px (390 px+ ekranda 20 px), karta oralig'i 12 px, karta radiusi 16 px, bosish maydoni ≥ 44×44, pastki asosiy tugma 52 px, pastki navigatsiya 60 px + safe-area.

## Komponentlar
| Komponent | Sinf / funksiya | Holatlar |
|---|---|---|
| Tugma | `.btn` + `-primary/-secondary/-ghost/-danger`, `-lg`, `-block`, `-icon` | pressed (scale), focus, disabled, loading (`setLoading`) |
| Miqdor | `.qty` | — |
| Maydon | `.field .label .input .textarea .hint .error-text`, `.search` | focus, `aria-invalid`, disabled |
| Karta | `.card .card-media .card-body`, `.grid-2`, `.title-2l` | rasm yo'q — `.placeholder` |
| Chip | `.chip-row .chip` + `initChips()` | `aria-pressed`, disabled |
| Tablar | `.tabs .tab` + `initTabs()` (yopishqoq, ←/→) | `aria-selected` |
| Ro'yxat | `.list .list-item` | pressed |
| Sheet | `.sheet` + `openSheet()` | Esc, backdrop, fokus qaytishi |
| Dialog | `confirmDialog()` (native `<dialog>`) | danger varianti |
| Toast | `toast(msg, {type})` | info, success, error; `aria-live` |
| Skeleton | `.skeleton(-text/-title/-media)` | reduced-motion'da harakatsiz |
| Holat | `.state` (+ `.state-error`, `.state-success`) | bo'sh, xato/offline, muvaffaqiyat |
| Ogohlantirish | `.alert(-warning/-danger/-success)` | — |
| Belgi | `.badge(-success/-danger/-warning)` | — |
| Pastki navigatsiya | `.bottom-nav .nav-item` | `aria-current`, `.nav-badge` |
| Pastki CTA | `.cta-bar` | safe-area |

Ikonkalar: `public/js/ui/icons.js` — bitta oila (24×24, chiziq 2, yumaloq uchlar), `icon(name)` yoki `<i data-icon="...">` + `hydrateIcons()`. Mini App'da emoji ishlatilmaydi (test tekshiradi).

Harakat: `prefers-reduced-motion` da barcha animatsiya va o'tishlar o'chadi.

## Tekshirildi
- 320 px va 430 px kenglikda, yorug' va to'q mavzuda `ui-kit.html` va bosh sahifa (brauzerda skrinshot bilan).
- Sheet (ochish, Esc bilan yopish), dialog, tablar, chiplar ishlashi.
- 320 px da topilib tuzatilganlar: tor kartada belgi chiqib ketishi, telefon qatorining sig'masligi, inline ikonka qatorni buzishi.

Tekshirilmagan: haqiqiy Telegram ichida (HTTPS manzil yo'q), iOS/Android klaviaturasi bilan, 360/390 px (320 va 430 oralig'idagi chegaralar sifatida qoplangan deb hisoblanmaydi — 17-bosqichda).
