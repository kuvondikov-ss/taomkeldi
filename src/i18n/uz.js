// O'zbekcha matnlar (standart til). Kalitlar ru.js bilan bir xil bo'lishi shart (test tekshiradi).
export default {
  // /start — matn promptdagidek aynan
  start: '<b>Taomkeldi’ga xush kelibsiz!</b>\nJizzaxdagi kafe va restoranlardan taom buyurtma qiling.\n<i>DasturXona\'ning yangi loyihasi.</i>',

  // Asosiy tugmalar
  btn_order: 'Buyurtma berish',
  btn_orders: 'Buyurtmalarim',
  btn_help: 'Yordam',
  btn_connect: 'Restoran ulash',
  btn_panel: 'Restoran paneli',
  btn_courier: 'Kuryer paneli',
  btn_admin: 'Platforma boshqaruvi',
  btn_open_app: 'Ilovani ochish',
  btn_cancel: 'Bekor qilish',
  btn_send_phone: 'Raqamni yuborish',

  app_not_ready: 'Ilova hali ulanmagan. Tez orada ishga tushadi.',
  order_open: 'Restoran va taomni ilovada tanlang:',

  orders_empty: 'Sizda hali buyurtma yo‘q.',
  orders_title: '<b>Oxirgi buyurtmalaringiz</b>',
  order_line: '#{id} · {restaurant} · {total} · {status}',

  status_pending_payment: 'To‘lov kutilmoqda',
  status_new: 'Yangi',
  status_accepted: 'Tayyorlanmoqda',
  status_ready: 'Tayyor',
  status_on_way: 'Yo‘lda',
  status_delivered: 'Yetkazildi',
  status_cancelled: 'Bekor qilindi',

  role_owner: 'egasi',
  role_manager: 'menejer',
  rstatus_pending: 'ko‘rib chiqilmoqda',
  rstatus_active: 'faol',
  rstatus_blocked: 'bloklangan',
  rstatus_rejected: 'rad etilgan',

  help: '<b>Yordam</b>\n'
    + '/menu — ilovani ochish\n'
    + '/orders — buyurtmalarim\n'
    + '/id — Telegram ID raqamingiz\n'
    + '/help — shu yordam\n\n'
    + 'Restoran egalari: /admin — restoran paneli\n'
    + 'Kuryerlar: /courier — kuryer paneli\n\n'
    + 'Tilni tanlang:',
  lang_set: 'Til: o‘zbekcha.',

  no_access: 'Bu bo‘lim siz uchun emas.',
  panel_title: '<b>Restoranlaringiz</b>',
  panel_line: '{name} — {role}, {status}',
  courier_title: '<b>Siz kuryer sifatida ulangan restoranlar</b>',
  courier_line: '{name} — {online}',
  courier_online: 'ishda',
  courier_offline: 'ishda emas',
  admin_title: '<b>Platforma</b>\nFaol restoranlar: {active}\nKutilayotgan arizalar: {pending}\nBloklangan: {blocked}',
  webapp_ok: 'Mini App manzili: to‘g‘ri sozlangan.',
  webapp_bad: 'Mini App manzili: {reason}',
  panel_in_app: 'To‘liq boshqaruv ilovada ochiladi.',

  id: 'Sizning ID: <code>{user}</code>\nChat ID: <code>{chat}</code>',

  group_start: 'Men Taomkeldi botiman. Restoran xodimlari guruhini ulash uchun restoran egasi yoki menejeri shu guruhda /bogla yuboradi.',
  bogla_private: '/bogla buyrug‘ini restoran xodimlari guruhida yuboring.',
  bogla_not_staff: 'Guruhni faqat restoran egasi yoki menejeri ulay oladi.',
  bogla_soon: 'Guruhni restoranga ulash keyingi bosqichda ishga tushadi. Hozircha buyurtmalar restoran paneliga tushadi.',

  invite_owner: 'Siz <b>{restaurant}</b> restoranining <b>egasi</b> sifatida ulandingiz.\nBoshqaruv: /admin',
  invite_manager: 'Siz <b>{restaurant}</b> restoranining <b>menejeri</b> sifatida ulandingiz.\nBoshqaruv: /admin',
  invite_courier: 'Siz <b>{restaurant}</b> restoranining <b>kuryeri</b> sifatida ulandingiz.\n\nIsh tartibi:\n1. Ishga chiqqaningizda kuryer panelida "Ishga chiqdim"ni bosing.\n2. Buyurtma olib ketayotganda Telegram’da jonli joylashuvni ulashing.\n3. Ish tugagach "Ishni tugatdim"ni bosing.\n\nPanel: /courier',
  invite_already: 'Siz allaqachon <b>{restaurant}</b> restoraniga ulangansiz.',
  invite_invalid: 'Taklif havolasi yaroqsiz, ishlatilgan yoki muddati o‘tgan. Restorandan yangi havola so‘rang.',
  invite_blocked: 'Bu restoran hozir faol emas. Havola ishlamaydi.',

  apply_in_app: 'Restoran arizasini ilovada to‘ldiring: nom, telefon, tavsif, xaritadagi joylashuv va oshxona turlari.',
  apply_name: 'Restoraningiz nomini yozing:',
  apply_phone: 'Bog‘lanish uchun telefon raqamini yuboring:',
  apply_phone_invalid: 'Raqam noto‘g‘ri. Masalan: +998 90 123 45 67',
  apply_done: 'Arizangiz qabul qilindi: <b>{name}</b>.\nAdministrator ko‘rib chiqib, siz bilan bog‘lanadi.',
  apply_exists: 'Sizning arizangiz ko‘rib chiqilmoqda: <b>{name}</b>.',
  apply_admin: '<b>Yangi restoran arizasi #{id}</b>\n{name}\nTelefon: {phone}\nAriza beruvchi: {user}',
  payment_ok: '✅ To‘lov qabul qilindi. Buyurtma #{id} restoranga yuborildi.',
  payment_late: 'To‘lov keldi, lekin buyurtma #{id} allaqachon bekor qilingan. Pulni qaytarish so‘raldi — administrator siz bilan bog‘lanadi.',
  app_approved: '🎉 <b>{name}</b> restorani tasdiqlandi. Siz restoran egasisiz.\nKeyingi qadam: /admin → tayyorlik ro‘yxatini to‘ldiring (menyu, ish vaqti, yetkazish hududi, to‘lov, kuryer, guruh).',
  app_rejected: '<b>{name}</b> arizasi rad etildi.\nSabab: {reason}\nKamchilikni tuzatib, qayta ariza yuborishingiz mumkin.',
  restaurant_blocked: '<b>{name}</b> restorani vaqtincha bloklandi — yangi buyurtmalar qabul qilinmaydi.\nSabab: {reason}',
  restaurant_unblocked: '<b>{name}</b> restorani qayta faollashtirildi.',
  cancelled: 'Bekor qilindi.',
  menu_hint: 'Menyudan tanlang.',
};
