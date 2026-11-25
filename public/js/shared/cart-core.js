// Savat qoidalari (DOM'siz, Node testlarida ham ishlaydi).
// Savatda faqat BITTA restoran taomlari bo'ladi. Narx bu yerda faqat ko'rsatish uchun — server qayta hisoblaydi.
//
// cart = { restaurantId, restaurantName, items: { [productId]: { qty, name, price, portion, image } } }

export const MAX_QTY = 99;

export const emptyCart = () => ({ restaurantId: null, restaurantName: null, items: {} });

export function qtyOf(cart, productId) {
  return cart.items[productId]?.qty || 0;
}

export function count(cart) {
  return Object.values(cart.items).reduce((s, i) => s + i.qty, 0);
}

export function itemsTotal(cart) {
  return Object.values(cart.items).reduce((s, i) => s + i.qty * i.price, 0);
}

// Miqdorni o'rnatish. Boshqa restoran taomi bo'lsa — savatni yashirincha o'chirmaymiz:
// { conflict: true } qaytadi, foydalanuvchi tasdiqlasa force=true bilan qayta chaqiriladi.
export function setQty(cart, restaurant, product, qty, { force = false } = {}) {
  const q = Math.max(0, Math.min(MAX_QTY, Math.floor(qty)));
  if (q > 0 && !product.is_available) return { cart, error: 'unavailable' };
  const otherRestaurant = cart.restaurantId != null && cart.restaurantId !== restaurant.id && count(cart) > 0;
  if (otherRestaurant && q > 0 && !force) return { cart, conflict: true };

  const base = otherRestaurant ? emptyCart() : cart;
  const items = { ...base.items };
  if (q === 0) delete items[product.id];
  else items[product.id] = { qty: q, name: product.name, price: product.price, portion: product.portion || null, image: product.image_path || null };
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
export function applyCheck(cart, check, { removeUnavailable = false } = {}) {
  const items = { ...cart.items };
  for (const line of check.lines) {
    if (!items[line.product_id]) continue;
    if (line.status === 'removed' || (removeUnavailable && line.status === 'unavailable')) delete items[line.product_id];
    else if (line.price != null) items[line.product_id] = { ...items[line.product_id], price: line.price, name: line.name ?? items[line.product_id].name };
  }
  const empty = Object.keys(items).length === 0;
  return { restaurantId: empty ? null : cart.restaurantId, restaurantName: empty ? null : cart.restaurantName, items };
}
