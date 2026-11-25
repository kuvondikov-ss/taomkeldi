// Jonli kuzatuv chegaralari — BITTA joyda (server ham, Mini App ham shu fayldan import qiladi).
// Masofa — to'g'ri chiziq (geo-core.distanceMeters); taxminiy vaqt shunga qarab, aniq countdown emas.

export const LIVE_MAX_AGE_MS = 3 * 60_000;    // 3 daqiqagacha — "jonli"
export const HIDE_AFTER_MS = 20 * 60_000;     // 20 daqiqadan eski nuqta ko'rsatilmaydi
export const PING_ACTIVE_MS = 15_000;          // kuryer ekrani: faol yetkazishda ~15 s
export const PING_IDLE_MS = 60_000;            // qolgan vaqtda ~60 s
export const TRAVEL_M_PER_MIN = 250;           // ~15 km/soat (shahar ichida mototsikl/velosiped, to'g'ri chiziq bo'yicha)

// 'live' | 'stale' ("Oxirgi joylashuv") | 'hidden'
export function locationState(ageMs) {
  if (!Number.isFinite(ageMs)) return 'hidden';
  if (ageMs < 0) return ageMs > -60_000 ? 'live' : 'hidden'; // qurilma soatidagi kichik farq
  if (ageMs <= LIVE_MAX_AGE_MS) return 'live';
  if (ageMs <= HIDE_AFTER_MS) return 'stale';
  return 'hidden';
}

// Yo'l vaqti oralig'i (daqiqa): to'g'ri chiziq masofasidan, 5 daqiqalik oraliq bilan.
export function travelEta(distanceM) {
  const m = Math.max(1, Math.ceil(distanceM / TRAVEL_M_PER_MIN));
  return { from: m, to: m + 5 };
}
