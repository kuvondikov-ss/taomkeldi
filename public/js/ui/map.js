// Leaflet xaritasi — Telegram Mini App uchun bitta yordamchi (manzil tanlash va buyurtma kuzatuvi).
// Muammolar va yechim:
// - Mini App avval yarim balandlikda ochilib, keyin kengayadi (expand / viewportChanged); konteyner o'lchami window
//   'resize'siz o'zgaradi → Leaflet eski o'lchamda qoladi: kulrang bo'shliqlar va markaz (tanlangan nuqta) pin'dan siljiydi.
//   Yechim: konteynerni ResizeObserver bilan kuzatish + Telegram viewportChanged → invalidateSize (markaz saqlanadi).
// - Mobil Leaflet plitkalarni faqat surish tugaganda yuklaydi (updateWhenIdle) → surish paytida kulrang. Yechim: false + bufer.
const tg = () => window.Telegram?.WebApp;

export function createMap(container, { center, zoom = 15, tileUrl, attribution, ...options } = {}) {
  const L = window.L;
  const map = L.map(container, {
    zoomControl: false,
    attributionControl: true,
    bounceAtZoomLimits: false,
    tapTolerance: 20,
    ...options,
  }).setView(center, zoom, { animate: false });
  L.tileLayer(tileUrl, {
    attribution,
    maxZoom: 19,
    updateWhenIdle: false,   // surish paytida ham yuklaydi
    updateWhenZooming: false,
    keepBuffer: 4,           // ekrandan tashqaridagi plitkalarni ko'proq saqlaydi
  }).addTo(map);

  // O'lcham o'zgarsa — markazni saqlab qayta hisoblash (bir kadrda bir marta).
  let raf = 0;
  const refresh = () => {
    cancelAnimationFrame(raf);
    // pan: true (standart) — o'lcham o'zgarganda markaz joyida qoladi (pin ostidagi nuqta siljimaydi).
    raf = requestAnimationFrame(() => { if (map._container) map.invalidateSize({ animate: false, debounceMoveend: true }); });
  };
  const ro = new ResizeObserver(refresh);
  ro.observe(container);
  const onViewport = () => refresh();
  tg()?.onEvent?.('viewportChanged', onViewport);
  window.addEventListener('orientationchange', onViewport);
  setTimeout(refresh, 0);
  setTimeout(refresh, 400); // Telegram expand() animatsiyasidan keyin

  const destroy = () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    tg()?.offEvent?.('viewportChanged', onViewport);
    window.removeEventListener('orientationchange', onViewport);
    map.remove();
  };
  return { map, refresh, destroy };
}
