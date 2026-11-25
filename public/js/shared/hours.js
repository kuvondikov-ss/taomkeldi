// Ish vaqti (server va Mini App uchun umumiy). Vaqt zonasi — Asia/Tashkent (UTC+5, yozgi vaqt yo'q).
// work_hours JSON: { open: "09:00", close: "23:00", days_off: [0..6] }  (0 = yakshanba)
//   close < open bo'lsa — yarim tundan o'tadi (masalan 10:00–02:00).
// work_hours yo'q bo'lsa — vaqt cheklovi yo'q (faqat "ochiq/pauza" tugmasi ishlaydi).
const TZ_OFFSET_MIN = 5 * 60;

const toMin = (s) => {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(s || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

export function parseHours(json) {
  if (!json) return null;
  try {
    const h = typeof json === 'string' ? JSON.parse(json) : json;
    if (toMin(h.open) == null || toMin(h.close) == null) return null;
    return { open: h.open, close: h.close, days_off: Array.isArray(h.days_off) ? h.days_off.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6) : [] };
  } catch {
    return null;
  }
}

export function validHoursInput(h) {
  return !!h && toMin(h.open) != null && toMin(h.close) != null && h.open !== h.close
    && (h.days_off === undefined || (Array.isArray(h.days_off) && h.days_off.length < 7 && h.days_off.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)));
}

// Hozir ish vaqti ichidami (ms — UTC vaqt).
export function withinHours(json, ms = Date.now()) {
  const h = parseHours(json);
  if (!h) return true;
  const local = new Date(ms + TZ_OFFSET_MIN * 60000);
  const day = local.getUTCDay();
  const minute = local.getUTCHours() * 60 + local.getUTCMinutes();
  const o = toMin(h.open);
  const c = toMin(h.close);
  if (o < c) return !h.days_off.includes(day) && minute >= o && minute < c;
  // Yarim tundan o'tadigan: kechki qism shu kun, ertalabki qism — oldingi kunga tegishli.
  if (minute >= o) return !h.days_off.includes(day);
  const prev = (day + 6) % 7;
  return minute < c && !h.days_off.includes(prev);
}

export const hoursText = (json) => {
  const h = parseHours(json);
  return h ? `${h.open}–${h.close}` : '';
};
