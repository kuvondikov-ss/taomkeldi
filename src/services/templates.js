// Bot xabarlari shablonlari: restoran (guruh/shaxsiy), mijoz, kuryer. Matnlar — src/i18n/{uz,ru}.js.
// Qoidalar: foydalanuvchi kiritgan har matn escape qilinadi; callback_data — ixcham `o:<id>:<amal>` / `c:<id>:<amal>`;
// xabar Telegram chegarasidan (4096) oshmaydi — taomlar ro'yxati qisqartiriladi, to'liq ko'rinish "Panelda ochish"/"Buyurtmani kuzatish" orqali.
// Batafsil katalog: docs/message-catalog.md
import { t, formatSum } from '../i18n/index.js';

export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const hhmm = (ms) => new Date(ms + 5 * 3600000).toISOString().slice(11, 16); // Toshkent vaqti (UTC+5)
const MAX_ITEMS = 25;
const LIMIT = 4000;
export const PANEL_PREFIX = 'o_';

// Uzun matnni qator chegarasida qisqartirish (HTML tegini kesib yubormaslik uchun).
export function clip(text, max = LIMIT) {
  if (text.length <= max) return text;
  const cut = text.lastIndexOf('\n', max - 2);
  return `${text.slice(0, cut > 0 ? cut : max - 2)}\n…`;
}

const mapsDir = (lat, lon) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;

export function createTemplates(db, config) {
  const items = (oid) => db.prepare('SELECT name, qty, line_total FROM order_items WHERE order_id = ? ORDER BY id').all(oid);
  const courierName = (o) => (o.courier_id ? db.prepare('SELECT name FROM couriers WHERE id = ?').get(o.courier_id)?.name : null);
  const appUrl = (route) => (config.webapp?.ok ? `${config.webapp.url}/#/${route}` : null);
  const panelUrl = (o) => (config.botUsername ? `https://t.me/${config.botUsername}?start=${PANEL_PREFIX}${o.id}` : null);
  const L = (lang, key, vars) => t(lang, key, vars);
  const sum = (n, lang) => formatSum(n, lang);
  const reasonText = (o, lang) => (o.cancel_reason === 'payment_timeout' ? L(lang, 'reason_payment_timeout', { min: config.payments?.pendingTimeoutMin ?? 30 }) : o.cancel_reason);
  // Mijozdan kuryer oladigan naqd: naqd to'lov va hali to'lanmagan bo'lsa — jami, aks holda 0.
  const collectAmount = (o) => (o.payment_method === 'cash' && o.payment_status !== 'paid' ? o.total : 0);

  function addressLine(o, lang) {
    if (o.type === 'pickup') return esc(L(lang, 'g_pickup'));
    let d = {};
    try { d = JSON.parse(o.address_details || '{}') || {}; } catch { d = {}; }
    return [o.address_text, d.entrance && `${L(lang, 'g_entrance')} ${d.entrance}`, d.floor && `${L(lang, 'g_floor')} ${d.floor}`,
      d.apartment && `${L(lang, 'g_apartment')} ${d.apartment}`, d.comment].filter(Boolean).map(esc).join(', ') || '—';
  }
  function itemLines(o, lang) {
    const list = items(o.id);
    const lines = list.slice(0, MAX_ITEMS).map((i) => `• ${esc(i.name)} × ${i.qty} — ${sum(i.line_total, lang)}`);
    if (list.length > MAX_ITEMS) lines.push(L(lang, 'g_more_items', { n: list.length - MAX_ITEMS }));
    return lines;
  }
  const deliveryLabel = (o, lang) => (o.delivery_fee ? sum(o.delivery_fee, lang) : L(lang, 'g_free'));
  const paymentLabel = (o, lang) => `${L(lang, `pm_${o.payment_method}`)} · ${L(lang, `ps_${o.payment_status}`)}`;

  // ---------- Restoran: asosiy buyurtma xabari (guruh yoki zaxira shaxsiy xabar) ----------
  function staffOrder(o, r, lang = 'uz') {
    const head = o.status === 'new' ? L(lang, 'g_head_new', { id: o.id }) : L(lang, 'g_head', { id: o.id, status: L(lang, `status_${o.status}`) });
    const courier = courierName(o);
    const map = o.type === 'delivery' && o.address_lat != null ? ` <a href="https://maps.google.com/?q=${o.address_lat},${o.address_lon}">🗺</a>` : '';
    const text = [
      head,
      `${esc(r.name)} · ${hhmm(o.created_at)}`,
      '',
      ...itemLines(o, lang),
      '',
      `${L(lang, 'g_items')}: ${sum(o.items_total, lang)}`,
      o.type === 'delivery' ? `${L(lang, 'g_delivery')}: ${deliveryLabel(o, lang)}` : null,
      `${L(lang, 'g_total')}: <b>${sum(o.total, lang)}</b>`,
      `${L(lang, 'g_payment')}: ${paymentLabel(o, lang)}`,
      '',
      `${L(lang, 'g_customer')}: ${esc(o.customer_name || '—')}`,
      `${L(lang, 'g_phone')}: ${esc(o.customer_phone || '—')}`,
      `${L(lang, 'g_address')}: ${addressLine(o, lang)}${map}`,
      `${L(lang, 'g_comment')}: ${esc(o.comment || '—')}`,
      o.prep_minutes && o.status === 'accepted' ? L(lang, 'g_prep', { n: o.prep_minutes }) : null,
      courier ? `🛵 ${esc(courier)}` : null,
      o.status === 'cancelled' && o.cancel_reason ? `${L(lang, 'g_reason')}: ${esc(reasonText(o, lang))}` : null,
    ].filter((x) => x !== null).join('\n');
    return { text: clip(text), reply_markup: staffKeyboard(o, 'main', lang) };
  }

  function staffKeyboard(o, mode = 'main', lang = 'uz') {
    const rows = [];
    const cb = (text, act) => ({ text, callback_data: `o:${o.id}:${act}` });
    const url = panelUrl(o);
    const panelBtn = url ? [{ text: L(lang, 'g_btn_panel'), url }] : [];
    if (mode === 'reject') {
      rows.push([cb(L(lang, 'g_rr1'), 'rr1')], [cb(L(lang, 'g_rr2'), 'rr2')], [cb(L(lang, 'g_rr3'), 'rr3')], [cb(L(lang, 'g_btn_back'), 'bk')]);
      return { inline_keyboard: rows };
    }
    const awaitingTransfer = o.payment_method === 'card_transfer' && o.payment_status !== 'paid';
    if (o.status === 'new' && awaitingTransfer) {
      // Tasdiqlanmagan karta o'tkazmasi: avval pulni tekshirish, qabul tugmalari hali yo'q.
      rows.push([cb(L(lang, 'g_btn_pay_ok'), 'po')], [cb(L(lang, 'g_btn_pay_no'), 'pn'), ...panelBtn]);
    } else if (o.status === 'new') {
      rows.push([15, 30, 45].map((n) => cb(L(lang, 'g_btn_min', { n }), `a${n}`)));
      rows.push([cb(L(lang, 'g_btn_reject'), 'rj'), ...panelBtn]);
    } else if (o.status === 'accepted') {
      rows.push([cb(L(lang, 'g_btn_ready'), 'rd')], panelBtn);
    } else if (o.status === 'ready') {
      rows.push([o.type === 'pickup' ? cb(L(lang, 'g_btn_handed'), 'dl') : cb(L(lang, 'g_btn_on_way'), 'ow')], panelBtn);
    } else if (o.status === 'on_way') {
      rows.push([cb(L(lang, 'g_btn_delivered'), 'dl')], panelBtn);
    } else {
      rows.push(panelBtn); // yakunlangan: amal tugmalari olib tashlanadi
    }
    return { inline_keyboard: rows.filter((x) => x.length) };
  }

  // ---------- Mijoz: faqat muhim o'zgarishlar ----------
  // Buyurtma holatidan "bosqich" kaliti. null — xabar yuborilmaydi.
  function customerMilestone(o) {
    if (!o) return null;
    if (o.status === 'pending_payment') return o.payment_method === 'card_transfer' && o.payment_status === 'unpaid' ? 'await_transfer' : null;
    if (o.status === 'new') {
      if (o.payment_method === 'cash') return 'created';
      if (o.payment_status === 'claimed') return 'claimed';
      if (o.payment_status === 'paid') return 'paid';
      return null;
    }
    if (o.status === 'accepted') return 'accepted';
    if (o.status === 'ready') return o.type === 'pickup' ? 'ready_pickup' : null; // yetkazishda "tayyor" mijoz uchun muhim emas
    if (o.status === 'on_way') return 'on_way';
    if (o.status === 'delivered') return 'delivered';
    if (o.status === 'cancelled') return o.payment_status === 'refunded' ? 'refunded' : 'cancelled';
    return null;
  }

  function customerOrder(o, r, milestone, lang = 'uz') {
    const base = { id: o.id, restaurant: r.name, total: sum(o.total, lang), payment: L(lang, `pm_${o.payment_method}`) };
    let text;
    switch (milestone) {
      case 'created': text = L(lang, 'c_created', base); break;
      case 'await_transfer': text = L(lang, 'c_await_transfer', { ...base, min: config.payments?.pendingTimeoutMin ?? 30 }); break;
      case 'claimed': text = L(lang, 'c_claimed', base); break;
      case 'paid': text = L(lang, 'payment_ok', base); break;
      case 'accepted': text = o.prep_minutes ? L(lang, 'c_accepted_eta', { ...base, n: o.prep_minutes }) : L(lang, 'c_accepted', base); break;
      case 'ready_pickup': text = L(lang, 'c_ready_pickup', { ...base, address: r.address_text || r.name }); break;
      case 'on_way': {
        const c = courierName(o);
        text = c ? L(lang, 'c_on_way_courier', { ...base, courier: c }) : L(lang, 'c_on_way', base);
        break;
      }
      case 'delivered': text = L(lang, o.type === 'pickup' ? 'c_handed' : 'c_delivered', base); break;
      case 'cancelled': {
        text = L(lang, 'c_cancelled', base);
        if (o.cancel_reason) text += `\n${L(lang, 'g_reason')}: ${esc(reasonText(o, lang))}`;
        if (o.payment_status === 'refund_requested') text += `\n\n${L(lang, 'c_refund_next')}`;
        break;
      }
      case 'refunded': text = L(lang, 'c_refunded', base); break;
      default: return null;
    }
    // Bepul yetkazish — 0 so'm aniq ko'rsatiladi (yangi buyurtma xabarlarida).
    if (['created', 'await_transfer', 'paid'].includes(milestone) && o.type === 'delivery' && !o.delivery_fee) text += `\n${L(lang, 'c_free_delivery')}`;
    const url = appUrl(`order/${o.id}`);
    const label = milestone === 'await_transfer' ? 'c_btn_pay' : milestone === 'delivered' ? 'c_btn_open' : 'c_btn_track';
    const terminalNoButton = ['refunded'].includes(milestone);
    return {
      text: clip(text),
      reply_markup: url && !terminalNoButton ? { inline_keyboard: [[{ text: L(lang, label), web_app: { url } }]] } : undefined,
    };
  }

  // ---------- Kuryer: biriktirilgan buyurtma (bitta jonli xabar) ----------
  function courierOrder(o, r, lang = 'uz', { active = true } = {}) {
    if (!active) return { text: L(lang, 'k_unassigned', { id: o.id }), reply_markup: { inline_keyboard: [] } };
    const collect = collectAmount(o);
    const head = ['delivered', 'cancelled'].includes(o.status)
      ? L(lang, 'k_head_done', { id: o.id, status: L(lang, `status_${o.status}`) })
      : L(lang, 'k_head', { id: o.id, status: L(lang, `status_${o.status}`) });
    const text = [
      head,
      '',
      `${L(lang, 'k_pickup')}: ${esc(r.name)}${r.address_text ? `, ${esc(r.address_text)}` : ''}`,
      `${L(lang, 'k_dropoff')}: ${addressLine(o, lang)}`,
      `${L(lang, 'g_customer')}: ${esc(o.customer_name || '—')} · ${esc(o.customer_phone || '—')}`,
      o.comment ? `${L(lang, 'g_comment')}: ${esc(o.comment)}` : null,
      '',
      `${L(lang, 'k_collect')}: <b>${collect ? sum(collect, lang) : L(lang, 'k_collect_none')}</b>`,
      `${L(lang, 'g_payment')}: ${paymentLabel(o, lang)}`,
      ['new', 'accepted'].includes(o.status) ? `\n${L(lang, 'k_wait_ready')}` : null,
      o.status === 'cancelled' && o.cancel_reason ? `${L(lang, 'g_reason')}: ${esc(reasonText(o, lang))}` : null,
    ].filter((x) => x !== null).join('\n');
    const rows = [];
    const toRestaurant = r.lat != null ? { text: L(lang, 'k_btn_to_restaurant'), url: mapsDir(r.lat, r.lon) } : null;
    const toCustomer = o.address_lat != null ? { text: L(lang, 'k_btn_to_customer'), url: mapsDir(o.address_lat, o.address_lon) } : null;
    const cb = (key, act) => ({ text: L(lang, key), callback_data: `c:${o.id}:${act}` });
    if (['new', 'accepted'].includes(o.status) && toRestaurant) rows.push([toRestaurant]);
    if (o.status === 'ready') rows.push(...[toRestaurant && [toRestaurant], [cb('k_btn_picked', 'pk')]].filter(Boolean));
    if (o.status === 'on_way') rows.push(...[toCustomer && [toCustomer], [cb('k_btn_delivered', 'dl')]].filter(Boolean));
    return { text: clip(text), reply_markup: { inline_keyboard: rows } };
  }

  return { staffOrder, staffKeyboard, customerMilestone, customerOrder, courierOrder, collectAmount, panelUrl };
}
