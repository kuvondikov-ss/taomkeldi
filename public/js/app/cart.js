// Savat holati (qurilmada, foydalanuvchi bo'yicha). O'zgarishda 'cart:change' hodisasi.
import { state } from './state.js';
import * as core from '../shared/cart-core.js';

const key = () => `cart:${state.me?.user?.id ?? 'anon'}`;

export function getCart() {
  try {
    const c = JSON.parse(localStorage.getItem(key()));
    return c && typeof c === 'object' && c.items ? c : core.emptyCart();
  } catch {
    return core.emptyCart();
  }
}

function save(cart) {
  localStorage.setItem(key(), JSON.stringify(cart));
  window.dispatchEvent(new CustomEvent('cart:change', { detail: cart }));
  return cart;
}

export const qtyOf = (pid) => core.qtyOf(getCart(), pid);
export const qtyAll = (pid) => core.qtyAll(getCart(), pid);
export const count = () => core.count(getCart());
export const itemsTotal = () => core.itemsTotal(getCart());

// Natija: { ok } | { conflict } | { error }
export function setQty(restaurant, product, qty, opts) {
  const r = core.setQty(getCart(), restaurant, product, qty, opts);
  if (r.conflict || r.error) return r;
  save(r.cart);
  return { ok: true };
}

export function applyCheck(check, opts) {
  return save(core.applyCheck(getCart(), check, opts));
}

export function clearCart() {
  return save(core.emptyCart());
}

// Server tekshiruvi uchun so'rov tanasi.
export function cartPayload() {
  const c = getCart();
  return { restaurant_id: c.restaurantId, items: core.payloadItems(c) };
}
