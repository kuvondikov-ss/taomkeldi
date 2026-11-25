// Barqaror xato kodlari. API ham, bot ham shu kodlardan foydalanadi.
// Kod o'zgarmaydi (klient unga tayanadi); matn foydalanuvchiga ko'rsatiladi.
export const ERRORS = {
  AUTH_REQUIRED:     { status: 401, uz: 'Kirish talab qilinadi. Ilovani Telegram ichidan oching.', ru: 'Требуется вход. Откройте приложение из Telegram.' },
  AUTH_INVALID:      { status: 401, uz: 'Kirish ma\'lumotlari noto\'g\'ri. Ilovani qayta oching.', ru: 'Неверные данные входа. Откройте приложение заново.' },
  AUTH_EXPIRED:      { status: 401, uz: 'Sessiya eskirgan. Ilovani qayta oching.', ru: 'Сессия устарела. Откройте приложение заново.' },
  USER_BLOCKED:      { status: 403, uz: 'Hisobingiz bloklangan.', ru: 'Ваш аккаунт заблокирован.' },
  FORBIDDEN:         { status: 403, uz: 'Bu amal uchun ruxsatingiz yo\'q.', ru: 'У вас нет прав на это действие.' },
  OWNER_ONLY:        { status: 403, uz: 'Bu amalni faqat restoran egasi bajara oladi.', ru: 'Это действие доступно только владельцу ресторана.' },
  NOT_FOUND:         { status: 404, uz: 'Topilmadi.', ru: 'Не найдено.' },
  VALIDATION:        { status: 400, uz: 'Ma\'lumotlar noto\'g\'ri to\'ldirilgan.', ru: 'Данные заполнены неверно.' },
  UPLOAD_TYPE:       { status: 415, uz: 'Faqat JPG, PNG yoki WEBP rasm yuklash mumkin.', ru: 'Можно загрузить только изображение JPG, PNG или WEBP.' },
  UPLOAD_TOO_LARGE:  { status: 413, uz: 'Fayl juda katta.', ru: 'Файл слишком большой.' },
  CONFLICT:          { status: 409, uz: 'Holat o\'zgargan. Sahifani yangilang.', ru: 'Состояние изменилось. Обновите страницу.' },
  INTERNAL:          { status: 500, uz: 'Kutilmagan xato. Birozdan keyin qayta urinib ko\'ring.', ru: 'Непредвиденная ошибка. Попробуйте позже.' },
};

export class AppError extends Error {
  constructor(code, { details, message } = {}) {
    const def = ERRORS[code] || ERRORS.INTERNAL;
    super(message || def.uz);
    this.code = ERRORS[code] ? code : 'INTERNAL';
    this.status = def.status;
    this.details = details; // masalan, VALIDATION uchun { field: 'price' }
  }
}

export function errorBody(err, lang = 'uz') {
  const code = err instanceof AppError ? err.code : 'INTERNAL';
  const def = ERRORS[code];
  const body = { ok: false, error: { code, message: def[lang] || def.uz } };
  if (err instanceof AppError && err.details) body.error.details = err.details;
  return body;
}
