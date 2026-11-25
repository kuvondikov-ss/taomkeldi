// Mini App matnlari (uz/ru). Til — serverdagi foydalanuvchi tili (bot bilan bir xil).
const uz = {
  popular: 'Ommabop', work_hours: 'Ish vaqti', more_info: 'Batafsil', free_from: '{sum}dan yuqori buyurtmada yetkazish bepul', description: 'Tavsif', address: 'Manzil',
  add_sum: 'Savatga qo‘shish · {sum}', update_sum: 'Saqlash · {sum}', remove_from_cart: 'Savatdan olib tashlash', add_to_cart: 'Savatga qo‘shish',
  cart: 'Savat', cart_items: '{n} ta taom', delivery_extra: 'Yetkazish narxi alohida', items_sum: 'Taomlar: {sum}',
  switch_title: 'Savatni tozalaysizmi?', switch_text: 'Savatda “{name}” taomlari bor. Bitta buyurtmada faqat bitta restoran taomlari bo‘ladi.', switch_confirm: 'Tozalash va qo‘shish',
  cart_empty: 'Savat bo‘sh', cart_empty_hint: 'Restorandan taom tanlang', to_restaurants: 'Restoranlarga o‘tish',
  unavailable_in_cart: 'Savatdagi {n} ta taom hozir mavjud emas', remove_unavailable: 'Mavjud emaslarini olib tashlash', removed_item: 'Bu taom menyudan olib tashlangan',
  price_changed: 'Narx o‘zgardi: {old} → {new}', checkout_soon: 'Buyurtmani rasmiylashtirish keyingi bosqichda qo‘shiladi.',
  cannot_order_closed: 'Restoran yopiq — hozir buyurtma olinmaydi', below_min: 'Minimal buyurtma {sum} — yana {left} qo‘shing',
  qty_dec: 'Kamaytirish', qty_inc: 'Ko‘paytirish', added: 'Savatga qo‘shildi', clear_cart: 'Savatni tozalash', cart_cleared: 'Savat tozalandi', go_restaurant: 'Restoranga qaytish',  search_home: 'Taom yoki restoran qidirish', banner_title: 'Mazali taomlar. Bir necha bosishda.', banner_cta: 'Tanlash',
  all_cuisines: 'Hammasi', sort_label: 'Saralash', sort_recommended: 'Tavsiya', sort_rating: 'Reyting', sort_fast: 'Tez yetkazish', sort_cheap_delivery: 'Arzon yetkazish',
  promo: 'Aksiya', filtered_empty: 'Bu filtr bo‘yicha restoran topilmadi', reset_filters: 'Filtrlarni tozalash',
  eta: '{from}–{to} daq', favorites: 'Sevimlilar', favorites_empty: 'Sevimli restoran yo‘q', favorites_empty_hint: 'Restoran kartasidagi yurakchani bosing.',
  fav_add: 'Sevimlilarga qo‘shish', fav_remove: 'Sevimlilardan olib tashlash',
  search_title: 'Qidirish', search_min: 'Kamida 2 ta harf yozing', recent: 'So‘nggi qidiruvlar', clear: 'Tozalash',
  found_restaurants: 'Restoranlar', found_dishes: 'Taomlar', nothing_found: 'Hech narsa topilmadi', nothing_found_hint: 'Boshqa so‘z bilan qidirib ko‘ring.',
  not_deliverable: 'Tanlangan manzilga yetkazmaydi', min_order: 'Minimal buyurtma {sum}', menu_empty: 'Menyu hali qo‘shilmagan',
  out_of_stock: 'Tugagan', ordering_soon: 'Savat va buyurtma berish keyingi bosqichda qo‘shiladi.', other: 'Boshqa',  nav_home: 'Bosh sahifa', nav_search: 'Qidirish', nav_orders: 'Buyurtmalar', nav_profile: 'Profil',
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
  popular: 'Популярное', work_hours: 'Часы работы', more_info: 'Подробнее', free_from: 'Доставка бесплатно при заказе от {sum}', description: 'Описание', address: 'Адрес',
  add_sum: 'В корзину · {sum}', update_sum: 'Сохранить · {sum}', remove_from_cart: 'Убрать из корзины', add_to_cart: 'В корзину',
  cart: 'Корзина', cart_items: '{n} блюд', delivery_extra: 'Доставка оплачивается отдельно', items_sum: 'Блюда: {sum}',
  switch_title: 'Очистить корзину?', switch_text: 'В корзине блюда из «{name}». В одном заказе — блюда только одного ресторана.', switch_confirm: 'Очистить и добавить',
  cart_empty: 'Корзина пуста', cart_empty_hint: 'Выберите блюда в ресторане', to_restaurants: 'К ресторанам',
  unavailable_in_cart: 'Нет в наличии: {n} блюд в корзине', remove_unavailable: 'Убрать недоступные', removed_item: 'Блюдо убрано из меню',
  price_changed: 'Цена изменилась: {old} → {new}', checkout_soon: 'Оформление заказа появится на следующем этапе.',
  cannot_order_closed: 'Ресторан закрыт — заказы сейчас не принимаются', below_min: 'Минимальный заказ {sum} — добавьте ещё {left}',
  qty_dec: 'Уменьшить', qty_inc: 'Увеличить', added: 'Добавлено в корзину', clear_cart: 'Очистить корзину', cart_cleared: 'Корзина очищена', go_restaurant: 'Вернуться в ресторан',  search_home: 'Поиск блюд и ресторанов', banner_title: 'Вкусная еда. В несколько касаний.', banner_cta: 'Выбрать',
  all_cuisines: 'Все', sort_label: 'Сортировка', sort_recommended: 'Рекомендуем', sort_rating: 'Рейтинг', sort_fast: 'Быстрая доставка', sort_cheap_delivery: 'Дешёвая доставка',
  promo: 'Акции', filtered_empty: 'По этим фильтрам ресторанов нет', reset_filters: 'Сбросить фильтры',
  eta: '{from}–{to} мин', favorites: 'Избранное', favorites_empty: 'Нет избранных ресторанов', favorites_empty_hint: 'Нажмите сердечко на карточке ресторана.',
  fav_add: 'Добавить в избранное', fav_remove: 'Убрать из избранного',
  search_title: 'Поиск', search_min: 'Введите хотя бы 2 буквы', recent: 'Недавние запросы', clear: 'Очистить',
  found_restaurants: 'Рестораны', found_dishes: 'Блюда', nothing_found: 'Ничего не найдено', nothing_found_hint: 'Попробуйте другое слово.',
  not_deliverable: 'Не доставляет по выбранному адресу', min_order: 'Минимальный заказ {sum}', menu_empty: 'Меню ещё не добавлено',
  out_of_stock: 'Нет в наличии', ordering_soon: 'Корзина и оформление заказа появятся на следующем этапе.', other: 'Другое',  nav_home: 'Главная', nav_search: 'Поиск', nav_orders: 'Заказы', nav_profile: 'Профиль',
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
