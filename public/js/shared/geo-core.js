// Server (Node) va Mini App (brauzer) BIR XIL ishlatadigan geo funksiyalar.
// Chegara: /geo/jizzax.json (Jizzax VILOYATI, OSM relation/196254).
// GeoJSON koordinatalari [lon, lat] tartibida.

// Nuqta halqa ichidami (ray casting).
function inRing(ring, lon, lat) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inPolygon(rings, lon, lat) {
  if (!inRing(rings[0], lon, lat)) return false;
  for (let k = 1; k < rings.length; k++) if (inRing(rings[k], lon, lat)) return false; // teshiklar
  return true;
}

export function pointInGeometry(geometry, lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (geometry.type === 'Polygon') return inPolygon(geometry.coordinates, lon, lat);
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.some((p) => inPolygon(p, lon, lat));
  return false;
}

// To'g'ri chiziq (havo) bo'yicha masofa, metr. Bu YO'L masofasi emas.
export function distanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371008.8;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

// Yetkazish narxi: baza narx bazaga kiradigan masofagacha; undan keyin har boshlangan km uchun qo'shimcha.
// Barcha ekranlar va server shu bitta funksiyadan foydalanadi. Natija — butun so'm.
export function deliveryFee({ delivery_base = 0, delivery_base_m = 0, delivery_per_km = 0 }, distanceM) {
  const extraM = Math.max(0, distanceM - delivery_base_m);
  return delivery_base + delivery_per_km * Math.ceil(extraM / 1000);
}

// Bepul yetkazish sharti: faqat free_delivery_from > 0 bo'lsa va TAOMLAR summasi (yetkazishsiz) chegaraga yetsa.
// free_delivery_from = 0 yoki null — "hamma uchun bepul" degani emas.
export function freeDelivery({ free_delivery_from }, itemsTotal) {
  const threshold = Number.isInteger(free_delivery_from) && free_delivery_from > 0 ? free_delivery_from : null;
  if (!threshold) return { threshold: null, applied: false, left: null };
  const applied = itemsTotal >= threshold;
  return { threshold, applied, left: applied ? 0 : threshold - itemsTotal };
}

// "Bepul yetkazib berish" bo'limi va barcha ekranlar uchun BITTA tasnif (server hisoblaydi, Mini App faqat ko'rsatadi).
// delivery — deliveryFor() natijasi (shu manzil uchun); itemsTotal — savatdagi taomlar summasi (chegirmadan keyin,
// yetkazishsiz) yoki null (savat yo'q: ro'yxat, restoran sahifasi).
// kind:
//   'unavailable' — manzil yo'q/radiusdan tashqari/restoran nuqtasi yo'q: hech qanday "0 so'm" ko'rsatilmaydi;
//   'always'      — shu manzilga yetkazish narxining o'zi haqiqatan 0 (doimiy bepul);
//   'threshold'   — "[summa] so'mdan bepul" (applied — savat chegaraga yetdi; left — qoldiq);
//   'none'        — bepul yetkazish yo'q.
// now_free — hozir haqiqatan 0 so'm: 'always' yoki savat chegaraga yetgan 'threshold'. Savat bo'lmasa shartli taklif hech qachon now_free emas.
export function freeDeliveryInfo(restaurant, delivery, itemsTotal = null) {
  const base = { kind: 'none', threshold: null, applied: false, left: null, now_free: false };
  if (!delivery || !delivery.deliverable || delivery.delivery_fee == null) return { ...base, kind: 'unavailable' };
  if (delivery.delivery_fee === 0) return { ...base, kind: 'always', applied: true, now_free: true };
  const f = freeDelivery(restaurant, itemsTotal ?? 0);
  if (!f.threshold) return base;
  if (itemsTotal == null) return { ...base, kind: 'threshold', threshold: f.threshold };
  return { kind: 'threshold', threshold: f.threshold, applied: f.applied, left: f.left, now_free: f.applied };
}

// Taxminiy yetkazish vaqti oralig'i (daqiqa): tayyorlash + yo'l (to'g'ri chiziq, ~15 km/soat) + topshirish.
// Bu baho; aniq vaqt sifatida ko'rsatilmaydi. 5 daqiqaga yaxlitlanadi, oraliq 10 daqiqa.
export function deliveryEta({ prep_minutes = 20 }, distanceM) {
  const travel = Math.ceil(distanceM / 250);
  const from = Math.ceil((prep_minutes + travel + 5) / 5) * 5;
  return { from, to: from + 10 };
}

export const DISTANCE_METHOD = 'straight_line';
