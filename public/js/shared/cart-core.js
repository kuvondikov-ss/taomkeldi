// Savat qoidalari (DOM'siz, Node testlarida ham ishlaydi).
// Savatda faqat BITTA restoran taomlari bo'ladi. Narx bu yerda faqat ko'rsatish uchun — server qayta hisoblaydi.
//
// cart = { restaurantId, restaurantName, items: { [key]: { product_id, qty, name, price, portion, image, options, options_label } } }
// key: standart taom — "<productId>"; "Maxsus" sozlama — "<productId>~<id:qty,...>" (shared/options-core.lineKey).
// Bir taom turli sozlamalarda alohida qator bo'ladi; bir xil sozlama — bitta qator.

export const MAX_QTY = 99;

export const emptyCart = () => ({ restaurantId: null, restaurantName: null, items: {} });

const pidOf = (key, item) => Number(item?.product_id ?? String(key).split('~')[0]);

// Standart qatordagi miqdor (taom kartasidagi +/− shu qator bilan ishlaydi).
export function qtyOf(cart, productId) {
  return cart.items[String(productId)]?.qty || 0;
}

// Taomning barcha sozlamalaridagi jami miqdor.
export function qtyAll(cart, productId) {
  return Object.entries(cart.items).filter(([k, i]) => pidOf(k, i) === Number(productId)).reduce((s, [, i]) => s + i.qty, 0);
}

export function count(cart) {
  return Object.values(cart.items).reduce((s, i) => s + i.qty, 0);
}

export function itemsTotal(cart) {
  return Object.values(cart.items).reduce((s, i) => s + i.qty * i.price, 0);
}

// Miqdorni o'rnatish. Boshqa restoran taomi bo'lsa — savatni yashirincha o'chirmaymiz:
// { conflict: true } qaytadi, foydalanuvchi tasdiqlasa force=true bilan qayta chaqiriladi.
// key/options/optionsLabel — "Maxsus" qator (berilmasa — standart).
export function setQty(cart, restaurant, product, qty, { force = false, key = null, options = null, optionsLabel = null } = {}) {
  const q = Math.max(0, Math.min(MAX_QTY, Math.floor(qty)));
  if (q > 0 && !product.is_available) return { cart, error: 'unavailable' };
  const otherRestaurant = cart.restaurantId != null && cart.restaurantId !== restaurant.id && count(cart) > 0;
  if (otherRestaurant && q > 0 && !force) return { cart, conflict: true };

  const k = key || String(product.id);
  const base = otherRestaurant ? emptyCart() : cart;
  const items = { ...base.items };
  if (q === 0) delete items[k];
  else {
    items[k] = {
      product_id: Number(product.id), qty: q, name: product.name, price: product.price, portion: product.portion || null,
      image: product.image_path || null, options: options?.length ? options : null, options_label: options?.length ? (optionsLabel || null) : null,
    };
  }
  const empty = Object.keys(items).length === 0;
  return {
    cart: {
      restaurantId: empty ? null : restaurant.id,
      restaurantName: empty ? null : restaurant.name,
      items,
    },
  };
}

// Server tekshiruvi natijasini qo'llash: o'chirilgan/mavjud bo'lmaganlarni olib tashlash yoki narxni yangilash.
// Qator server qaytargan key bo'yicha topiladi (eski javoblar uchun — product_id).
export function applyCheck(cart, check, { removeUnavailable = false } = {}) {
  const items = { ...cart.items };
  for (const line of check.lines) {
    const k = items[line.key] ? line.key : (items[String(line.product_id)] ? String(line.product_id) : null);
    if (!k) continue;
    if (line.status === 'removed' || line.status === 'options_changed' || (removeUnavailable && line.status === 'unavailable')) delete items[k];
    else if (line.price != null) items[k] = { ...items[k], price: line.price, name: line.name ?? items[k].name };
  }
  const empty = Object.keys(items).length === 0;
  return { restaurantId: empty ? null : cart.restaurantId, restaurantName: empty ? null : cart.restaurantName, items };
}

// Server so'rovi uchun qatorlar.
export function payloadItems(cart) {
  return Object.entries(cart.items).map(([key, i]) => ({
    key, product_id: pidOf(key, i), qty: i.qty, price: i.price, options: i.options || [],
  }));
}
