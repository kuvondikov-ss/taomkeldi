// Mini App matnlari (uz/ru). Til — serverdagi foydalanuvchi tili (bot bilan bir xil).
const uz = {
  nav_home: 'Bosh sahifa', nav_search: 'Qidirish', nav_orders: 'Buyurtmalar', nav_profile: 'Profil',
  loading: 'Yuklanmoqda…', retry: 'Qayta urinish', save: 'Saqlash', cancel: 'Bekor qilish', delete: 'O‘chirish', edit: 'Tahrirlash',
  outside_tg: 'Ilovani Telegram ichidan oching', outside_tg_hint: '@taomkeldi_bot → Ilovani ochish',
  offline: 'Server bilan aloqa yo‘q', offline_hint: 'Internetni tekshirib, qayta urinib ko‘ring.',

  deliver_to: 'Yetkazish manzili', choose_address: 'Manzilni tanlang',
  pick_title: 'Yetkazish manzili', pick_hint: 'Xaritani suring — pin turgan joyga yetkazamiz',
  my_location: 'Joylashuvim', search_placeholder: 'Ko‘cha, mahalla yoki joy nomi', search_btn: 'Qidirish',
  search_none: 'Topilmadi. Boshqacha yozing yoki xaritada belgilang.',
  search_short: 'Kamida 3 ta harf yozing.',
  geocoder_off: 'Manzil qidiruvi hozir ishlamayapti. Xaritada belgilang.',
  locating: 'Joylashuv aniqlanmoqda…',
  gps_denied: 'Joylashuvga ruxsat berilmadi. Xaritada belgilang yoki qidiring.',
  gps_settings: 'Ruxsat sozlamalari',
  gps_failed: 'Joylashuvni aniqlab bo‘lmadi. Xaritada belgilang yoki qidiring.',
  gps_unsupported: 'Bu qurilmada joylashuvni aniqlab bo‘lmaydi. Xaritada belgilang.',
  resolving: 'Manzil aniqlanmoqda…', resolve_failed: 'Manzil nomi aniqlanmadi — keyingi qadamda o‘zingiz yozasiz.',
  outside_area: 'Bu nuqta Jizzax viloyatidan tashqarida. Taomkeldi faqat Jizzax viloyatida ishlaydi.',
  change_address: 'Manzilni o‘zgartirish',
  deliver_here: 'Shu yerga yetkazish',
  saved_addresses: 'Saqlangan manzillar',

  form_title_new: 'Manzil tafsilotlari', form_title_edit: 'Manzilni tahrirlash',
  f_label: 'Nomi', f_label_home: 'Uy', f_label_work: 'Ish', f_text: 'Manzil', f_text_hint: 'Ko‘cha, uy raqami, mo‘ljal',
  f_entrance: 'Podyezd', f_floor: 'Qavat', f_apartment: 'Xonadon', f_comment: 'Kuryer uchun izoh', f_comment_ph: 'Masalan: domofon ishlamaydi',
  f_point: 'Xaritadagi nuqta', f_change_point: 'Nuqtani o‘zgartirish',
  saved: 'Manzil saqlandi',

  addresses_title: 'Manzillarim', add_address: 'Yangi manzil', default_badge: 'Asosiy', make_default: 'Asosiy qilish',
  address_invalid: 'Xizmat hududidan tashqarida — tahrirlang',
  confirm_delete_title: 'Manzilni o‘chirasizmi?', deleted: 'Manzil o‘chirildi',
  no_addresses: 'Saqlangan manzil yo‘q',

  restaurants_title: 'Restoranlar',
  no_restaurants: 'Bu manzilga yetkazadigan restoran hozircha yo‘q',
  no_restaurants_hint: 'Boshqa manzilni tanlab ko‘ring yoki keyinroq qayting.',
  open: 'Ochiq', closed: 'Yopiq', closed_hint: 'Hozir buyurtma qabul qilinmaydi',
  distance: '~{km} km (to‘g‘ri chiziq)', delivery_fee: 'Yetkazish {sum}',

  search_soon: 'Taom va restoran qidiruvi keyingi bosqichda qo‘shiladi.',
  orders_title: 'Buyurtmalar', orders_empty: 'Hali buyurtma yo‘q',
  profile_title: 'Profil', language: 'Til', work_sections: 'Ish bo‘limlari', help: 'Yordam',
  panel: 'Restoran paneli', courier: 'Kuryer paneli', admin: 'Platforma boshqaruvi',
  section_soon: 'Bu bo‘lim keyingi bosqichlarda tayyor bo‘ladi.',
  about: 'Loyiha haqida', about_text: 'Taomkeldi — Jizzax viloyatidagi kafe va restoranlardan taom yetkazib berish. DasturXona\'ning yangi loyihasi.',
  help_text: 'Savollar bo‘yicha botga yozing: @taomkeldi_bot',
  status_pending_payment: 'To‘lov kutilmoqda', status_new: 'Yangi', status_accepted: 'Tayyorlanmoqda', status_ready: 'Tayyor',
  status_on_way: 'Yo‘lda', status_delivered: 'Yetkazildi', status_cancelled: 'Bekor qilindi',
};

const ru = {
  nav_home: 'Главная', nav_search: 'Поиск', nav_orders: 'Заказы', nav_profile: 'Профиль',
  loading: 'Загрузка…', retry: 'Повторить', save: 'Сохранить', cancel: 'Отмена', delete: 'Удалить', edit: 'Изменить',
  outside_tg: 'Откройте приложение в Telegram', outside_tg_hint: '@taomkeldi_bot → Открыть приложение',
  offline: 'Нет связи с сервером', offline_hint: 'Проверьте интернет и попробуйте снова.',

  deliver_to: 'Адрес доставки', choose_address: 'Выберите адрес',
  pick_title: 'Адрес доставки', pick_hint: 'Двигайте карту — доставим туда, где стоит метка',
  my_location: 'Моё местоположение', search_placeholder: 'Улица, махалля или место', search_btn: 'Найти',
  search_none: 'Ничего не найдено. Измените запрос или отметьте на карте.',
  search_short: 'Введите хотя бы 3 буквы.',
  geocoder_off: 'Поиск адреса сейчас недоступен. Отметьте точку на карте.',
  locating: 'Определяем местоположение…',
  gps_denied: 'Доступ к геопозиции не разрешён. Отметьте на карте или найдите адрес.',
  gps_settings: 'Настройки доступа',
  gps_failed: 'Не удалось определить местоположение. Отметьте на карте или найдите адрес.',
  gps_unsupported: 'На этом устройстве геопозиция недоступна. Отметьте на карте.',
  resolving: 'Определяем адрес…', resolve_failed: 'Не удалось определить адрес — укажете его на следующем шаге.',
  outside_area: 'Эта точка вне Джизакской области. Taomkeldi работает только в Джизакской области.',
  change_address: 'Изменить адрес',
  deliver_here: 'Доставить сюда',
  saved_addresses: 'Сохранённые адреса',

  form_title_new: 'Детали адреса', form_title_edit: 'Изменить адрес',
  f_label: 'Название', f_label_home: 'Дом', f_label_work: 'Работа', f_text: 'Адрес', f_text_hint: 'Улица, дом, ориентир',
  f_entrance: 'Подъезд', f_floor: 'Этаж', f_apartment: 'Квартира', f_comment: 'Комментарий курьеру', f_comment_ph: 'Например: не работает домофон',
  f_point: 'Точка на карте', f_change_point: 'Изменить точку',
  saved: 'Адрес сохранён',

  addresses_title: 'Мои адреса', add_address: 'Новый адрес', default_badge: 'Основной', make_default: 'Сделать основным',
  address_invalid: 'Вне зоны обслуживания — измените',
  confirm_delete_title: 'Удалить адрес?', deleted: 'Адрес удалён',
  no_addresses: 'Нет сохранённых адресов',

  restaurants_title: 'Рестораны',
  no_restaurants: 'Пока нет ресторанов с доставкой по этому адресу',
  no_restaurants_hint: 'Попробуйте другой адрес или загляните позже.',
  open: 'Открыто', closed: 'Закрыто', closed_hint: 'Сейчас заказы не принимаются',
  distance: '~{km} км (по прямой)', delivery_fee: 'Доставка {sum}',

  search_soon: 'Поиск блюд и ресторанов появится на следующем этапе.',
  orders_title: 'Заказы', orders_empty: 'Заказов пока нет',
  profile_title: 'Профиль', language: 'Язык', work_sections: 'Рабочие разделы', help: 'Помощь',
  panel: 'Панель ресторана', courier: 'Панель курьера', admin: 'Управление платформой',
  section_soon: 'Этот раздел будет готов на следующих этапах.',
  about: 'О проекте', about_text: 'Taomkeldi — доставка еды из кафе и ресторанов Джизакской области. DasturXona\'ning yangi loyihasi.',
  help_text: 'По вопросам пишите боту: @taomkeldi_bot',
  status_pending_payment: 'Ожидает оплаты', status_new: 'Новый', status_accepted: 'Готовится', status_ready: 'Готов',
  status_on_way: 'В пути', status_delivered: 'Доставлен', status_cancelled: 'Отменён',
};

export const DICTS = { uz, ru };
let current = 'uz';
export const setLang = (l) => { current = DICTS[l] ? l : 'uz'; document.documentElement.lang = current; };
export const getLang = () => current;
export function t(key, vars = {}) {
  const s = DICTS[current][key] ?? uz[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}
export function formatSum(n) {
  const s = Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return current === 'ru' ? `${s} сум` : `${s} so‘m`;
}
