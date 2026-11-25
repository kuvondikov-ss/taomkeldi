// Kiritmalarni tekshirish yordamchilari. Xato bo'lsa AppError('VALIDATION', { details: { field } }).
import { AppError } from './errors.js';

const fail = (field, reason) => {
  throw new AppError('VALIDATION', { details: { field, reason } });
};

// Pul: butun so'm, manfiy emas, oqilona chegara ichida.
export function money(value, field, { optional = false, max = 1_000_000_000 } = {}) {
  if (value === undefined || value === null || value === '') {
    if (optional) return null;
    fail(field, 'required');
  }
  const n = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  if (!Number.isSafeInteger(n) || n < 0 || n > max) fail(field, 'money');
  return n;
}

export function int(value, field, { min = 0, max = Number.MAX_SAFE_INTEGER, optional = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (optional) return null;
    fail(field, 'required');
  }
  const n = typeof value === 'string' && /^-?\d+$/.test(value) ? Number(value) : value;
  if (!Number.isSafeInteger(n) || n < min || n > max) fail(field, 'int');
  return n;
}

export function str(value, field, { min = 1, max = 500, optional = false } = {}) {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
    if (optional) return null;
    fail(field, 'required');
  }
  if (typeof value !== 'string') fail(field, 'string');
  const s = value.trim();
  if (s.length < min || s.length > max) fail(field, 'length');
  return s;
}

export function coord(value, field, kind) {
  const n = typeof value === 'string' ? Number(value) : value;
  const lim = kind === 'lat' ? 90 : 180;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < -lim || n > lim) fail(field, 'coord');
  return n;
}

export function id(value, field = 'id') {
  return int(value, field, { min: 1 });
}

export function oneOf(value, field, allowed) {
  if (!allowed.includes(value)) fail(field, 'enum');
  return value;
}

// O'zbekiston telefon raqami: +998 XX XXX XX XX yoki 9 xonali mahalliy raqam → "+998XXXXXXXXX".
export function phoneUz(value, field = 'phone') {
  const digits = String(value ?? '').replace(/\D/g, '');
  let n = digits;
  if (n.length === 9) n = `998${n}`;
  if (!/^998\d{9}$/.test(n)) fail(field, 'phone');
  return `+${n}`;
}

// Karta raqami: 16 raqam (bo'shliqlarsiz saqlanadi).
export function cardNumber(value, field = 'card_number') {
  const s = String(value ?? '').replace(/[\s-]/g, '');
  if (!/^\d{16}$/.test(s)) fail(field, 'card');
  return s;
}

export function maskCard(card) {
  if (!card) return null;
  return `${card.slice(0, 4)} **** **** ${card.slice(-4)}`;
}
