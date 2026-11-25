// Restoran kuryerlari va dispetcher.
// - Kuryer smenasi: "Ishga chiqdim" / "Ishni tugatdim" (couriers.is_online) — serverda.
// - Avtomatik dispetcher: restoran qabul qilgan yetkazish buyurtmasi faqat SHU restoranning faol, ulangan, onlayn kuryerlariga taklif qilinadi.
// - "Qabul qilaman": birinchi bosgan oladi — orders.courier_id IS NULL shartli UPDATE (frontend tekshiruvi emas).
// - Olib ketishdan oldin voz kechish mumkin; olib ketilgandan keyin — "Muammo" (restoran orqali hal qilinadi).
// - Onlayn kuryer yo'q yoki hech kim olmadi: dispatch_status = 'no_courier' (guruh xabari va panelda ogohlantirish).
import { now, tx } from '../db/index.js';
import { AppError } from '../lib/errors.js';
import * as v from '../lib/validate.js';
import { t } from '../i18n/index.js';
import { classifyTelegramError } from './telegram-errors.js';

const OFFERABLE = ['accepted', 'ready']; // restoran qabul qilgan, kuryer hali olib ketmagan
const RELEASABLE = ['new', 'accepted', 'ready'];
const ACTIVE = ['new', 'accepted', 'ready', 'on_way'];

export function createDispatchService(db, { access, users, templates, notify, orders, emitOrder, logger = console }) {
  let api = null;
  const getO = (id) => db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  const getR = (id) => db.prepare('SELECT * FROM restaurants WHERE id = ?').get(id);
  const langOf = (uid) => { const u = users.get(uid); return u ? users.langOf(u) : 'uz'; };
  const html = (reply_markup) => ({ parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...(reply_markup ? { reply_markup } : {}) });
  // emit=false — ko'rinishda o'zgarish yo'q (masalan, kuryer allaqachon biriktirilgan): ortiqcha xabar tahriri bo'lmasin.
  const setDispatch = (orderId, status, { emit = true } = {}) => {
    const res = db.prepare('UPDATE orders SET dispatch_status = ? WHERE id = ? AND COALESCE(dispatch_status, \'\') != COALESCE(?, \'\')').run(status, orderId, status);
    if (res.changes && emit) emitOrder(orderId, 'dispatch');
  };

  // Foydalanuvchining kuryer yozuvlari (har restoran uchun alohida).
  const myRows = (user) => (user ? db.prepare(`SELECT c.*, r.name AS restaurant_name, r.address_text AS restaurant_address, r.status AS restaurant_status, r.phone AS restaurant_phone
    FROM couriers c JOIN restaurants r ON r.id = c.restaurant_id WHERE c.user_id = ? AND c.status = 'active' ORDER BY r.name`).all(user.id) : []);
  const myRowFor = (user, rid) => myRows(user).find((c) => c.restaurant_id === rid) || null;

  // ---------- Taklif xabarlari ----------
  async function sendOffer(offer, o, r, c) {
    if (!api) return false;
    const msg = templates.courierOffer(o, r, langOf(c.user_id));
    try {
      const m = await api.sendMessage(c.user_id, msg.text, html(msg.reply_markup));
      db.prepare('UPDATE courier_offers SET chat_id = ?, message_id = ?, updated_at = ? WHERE id = ?').run(c.user_id, m.message_id, now(), offer.id);
      return true;
    } catch (e) {
      logger.error(`Kuryerga (${c.user_id}) taklif #${o.id} yuborilmadi:`, e.description || e.message);
      if (classifyTelegramError(e) === 'blocked') users.setBotBlocked(c.user_id, true);
      return false;
    }
  }

  // Taklif yopildi: xabardagi tugmalar olib tashlanadi va sababi yoziladi.
  async function closeOfferMessage(offer, key) {
    if (!api || !offer.message_id) return;
    try {
      await api.editMessageText(offer.chat_id, offer.message_id, t(langOf(offer.chat_id), key, { id: offer.order_id }), html({ inline_keyboard: [] }));
    } catch (e) {
      const kind = classifyTelegramError(e);
      if (!['not_modified', 'message_gone'].includes(kind)) logger.error(`Taklif xabari yopilmadi (#${offer.order_id}):`, e.description || e.message);
    }
  }

  async function closeOpenOffers(orderId, status, key, { exceptCourier = null } = {}) {
    const open = db.prepare("SELECT * FROM courier_offers WHERE order_id = ? AND status = 'open'").all(orderId).filter((x) => x.courier_id !== exceptCourier);
    if (!open.length) return 0;
    db.prepare(`UPDATE courier_offers SET status = ?, updated_at = ? WHERE id IN (${open.map(() => '?').join(',')})`).run(status, now(), ...open.map((x) => x.id));
    for (const offer of open) await closeOfferMessage(offer, key);
    return open.length;
  }

  // ---------- Dispetcher ----------
  // Shu restoranning onlayn kuryerlariga (hali taklif olmaganlariga) taklif. Natija: nechta yangi taklif yuborildi.
  async function dispatch(orderId, { exclude = [] } = {}) {
    const o = getO(orderId);
    if (!o || o.type !== 'delivery' || o.courier_id || !OFFERABLE.includes(o.status)) return 0;
    const r = getR(o.restaurant_id);
    if (!r.auto_dispatch) return 0;
    const online = db.prepare("SELECT * FROM couriers WHERE restaurant_id = ? AND status = 'active' AND user_id IS NOT NULL AND is_online = 1 ORDER BY id").all(o.restaurant_id)
      .filter((c) => !exclude.includes(c.id));
    let sent = 0;
    for (const c of online) {
      const res = db.prepare(`INSERT OR IGNORE INTO courier_offers (order_id, courier_id, status, created_at, updated_at) VALUES (?, ?, 'open', ?, ?)`).run(o.id, c.id, now(), now());
      if (!res.changes) continue; // bu kuryerga allaqachon taklif qilingan (yoki u rad etgan)
      const offer = db.prepare('SELECT * FROM courier_offers WHERE id = ?').get(Number(res.lastInsertRowid));
      if (await sendOffer(offer, o, r, c)) sent += 1;
      else if (api) db.prepare("UPDATE courier_offers SET status = 'cancelled', updated_at = ? WHERE id = ?").run(now(), offer.id);
    }
    const stillOpen = db.prepare("SELECT COUNT(*) AS n FROM courier_offers WHERE order_id = ? AND status = 'open'").get(o.id).n;
    setDispatch(o.id, stillOpen ? 'offering' : 'no_courier');
    return sent;
  }

  // Har buyurtma o'zgarishida: yangi qabul qilingan buyurtmaga taklif, biriktirilgan/yakunlangan buyurtma takliflarini yopish.
  async function onOrderChanged(orderId) {
    const o = getO(orderId);
    if (!o) return;
    if (o.status === 'cancelled') {
      await closeOpenOffers(o.id, 'cancelled', 'k_offer_cancelled');
      return;
    }
    if (o.courier_id || !ACTIVE.includes(o.status)) {
      await closeOpenOffers(o.id, 'lost', 'k_offer_taken');
      if (o.courier_id && o.dispatch_status !== 'assigned') setDispatch(o.id, 'assigned', { emit: false });
      return;
    }
    if (o.type === 'delivery' && OFFERABLE.includes(o.status) && !o.dispatch_status) await dispatch(o.id);
  }

  // ---------- Kuryer smenasi ----------
  async function setOnline(user, courierId, online) {
    const cid = v.id(courierId, 'courier_id');
    const c = myRows(user).find((x) => x.id === cid);
    if (!c) throw new AppError('NOT_FOUND');
    if (online && c.restaurant_status !== 'active') throw new AppError('CONFLICT', { details: { reason: 'restaurant_inactive' } });
    db.prepare('UPDATE couriers SET is_online = ?, online_changed_at = ?, updated_at = ? WHERE id = ?').run(online ? 1 : 0, now(), now(), cid);
    if (online) {
      // Kuryer topilmagan / taklif davom etayotgan buyurtmalar — yangi chiqqan kuryerga ham.
      const waiting = db.prepare(`SELECT id FROM orders WHERE restaurant_id = ? AND type = 'delivery' AND courier_id IS NULL
        AND status IN ('accepted','ready') ORDER BY id`).all(c.restaurant_id);
      for (const w of waiting) await dispatch(w.id);
    } else {
      const open = db.prepare("SELECT * FROM courier_offers WHERE courier_id = ? AND status = 'open'").all(cid);
      for (const offer of open) {
        db.prepare("UPDATE courier_offers SET status = 'cancelled', updated_at = ? WHERE id = ?").run(now(), offer.id);
        await closeOfferMessage(offer, 'k_offer_offline');
        await afterOfferGone(offer.order_id);
      }
    }
    return { courier_id: cid, is_online: online };
  }

  // Ochiq taklif qolmagan va kuryer yo'q — ogohlantirish.
  async function afterOfferGone(orderId) {
    const o = getO(orderId);
    if (!o || o.courier_id || !OFFERABLE.includes(o.status)) return;
    const open = db.prepare("SELECT COUNT(*) AS n FROM courier_offers WHERE order_id = ? AND status = 'open'").get(orderId).n;
    if (!open) setDispatch(orderId, 'no_courier');
  }

  // ---------- Taklifga javob ----------
  function offerFor(user, orderId) {
    const o = getO(v.id(orderId));
    if (!o) throw new AppError('NOT_FOUND');
    const c = myRowFor(user, o.restaurant_id);
    if (!c) throw new AppError('NOT_FOUND'); // boshqa restoran kuryeri — buyurtma mavjudligini oshkor qilmaymiz
    const offer = db.prepare('SELECT * FROM courier_offers WHERE order_id = ? AND courier_id = ?').get(o.id, c.id);
    return { o, c, offer };
  }

  // "Qabul qilaman" — birinchi bosgan oladi.
  async function accept(user, orderId) {
    const { o, c, offer } = offerFor(user, orderId);
    if (o.courier_id === c.id) return { already: true };
    if (o.courier_id) throw new AppError('CONFLICT', { details: { reason: 'taken' } });
    if (!offer || offer.status !== 'open') throw new AppError('CONFLICT', { details: { reason: 'offer_closed' } });
    if (!c.is_online) throw new AppError('CONFLICT', { details: { reason: 'offline' } });
    const won = tx(db, () => {
      const res = db.prepare(`UPDATE orders SET courier_id = ?, dispatch_status = 'assigned', updated_at = ?
        WHERE id = ? AND courier_id IS NULL AND status IN ('accepted','ready')`).run(c.id, now(), o.id);
      if (res.changes !== 1) return false;
      db.prepare("UPDATE courier_offers SET status = 'accepted', updated_at = ? WHERE id = ?").run(now(), offer.id);
      db.prepare(`INSERT INTO order_events (order_id, actor_id, actor_role, type, data, created_at) VALUES (?, ?, 'courier', 'courier_accepted', ?, ?)`)
        .run(o.id, user.id, JSON.stringify({ courier_id: c.id }), now());
      return true;
    });
    if (!won) {
      // Boshqasi bir lahza oldin oldi: bu taklif ham yopiladi.
      db.prepare("UPDATE courier_offers SET status = 'lost', updated_at = ? WHERE id = ? AND status = 'open'").run(now(), offer.id);
      await closeOfferMessage(offer, 'k_offer_taken');
      throw new AppError('CONFLICT', { details: { reason: 'taken' } });
    }
    // Taklif xabari o'rniga jonli kuryer xabari keladi (order-notify); qolgan takliflar yopiladi.
    await closeOfferMessage(offer, 'k_offer_accepted');
    await closeOpenOffers(o.id, 'lost', 'k_offer_taken');
    emitOrder(o.id, 'courier_accepted');
    return { already: false };
  }

  async function decline(user, orderId) {
    const { o, offer } = offerFor(user, orderId);
    if (!offer || offer.status !== 'open') return { already: true };
    db.prepare("UPDATE courier_offers SET status = 'declined', updated_at = ? WHERE id = ?").run(now(), offer.id);
    await closeOfferMessage(offer, 'k_offer_declined');
    await afterOfferGone(o.id);
    return { already: false };
  }

  // Olib ketishdan oldin voz kechish. Keyin — faqat "Muammo" (restoran hal qiladi).
  async function release(user, orderId) {
    const o = getO(v.id(orderId));
    const c = o && myRowFor(user, o.restaurant_id);
    if (!o || !c || o.courier_id !== c.id) throw new AppError('NOT_FOUND');
    if (!RELEASABLE.includes(o.status)) throw new AppError('CONFLICT', { details: { reason: 'picked_up' } });
    const res = db.prepare(`UPDATE orders SET courier_id = NULL, dispatch_status = NULL, updated_at = ?
      WHERE id = ? AND courier_id = ? AND status IN ('new','accepted','ready')`).run(now(), o.id, c.id);
    if (res.changes !== 1) throw new AppError('INVALID_TRANSITION');
    // Shu buyurtma bu kuryerga qayta taklif qilinmaydi.
    db.prepare(`INSERT INTO courier_offers (order_id, courier_id, status, created_at, updated_at) VALUES (?, ?, 'declined', ?, ?)
      ON CONFLICT(order_id, courier_id) DO UPDATE SET status = 'declined', updated_at = excluded.updated_at`).run(o.id, c.id, now(), now());
    db.prepare(`INSERT INTO order_events (order_id, actor_id, actor_role, type, data, created_at) VALUES (?, ?, 'courier', 'courier_released', ?, ?)`)
      .run(o.id, user.id, JSON.stringify({ courier_id: c.id }), now());
    for (const uid of staffIds(o.restaurant_id)) {
      await notify.send(uid, 'k_staff_released', { id: o.id, courier: c.name }, { dedupeKey: `released:${o.id}:${c.id}:${Math.floor(now() / 60000)}` });
    }
    emitOrder(o.id, 'courier_released'); // jonli xabarlar yangilanadi; dispetcher qayta taklif qiladi (bu kuryerga emas)
    return { ok: true };
  }

  const staffIds = (rid) => db.prepare("SELECT user_id FROM staff WHERE restaurant_id = ? AND status = 'active'").all(rid).map((x) => x.user_id);

  // Olib ketilgandan keyingi muammo: restoran xodimlariga xabar (kuryer telefoni bilan).
  async function reportProblem(user, orderId) {
    const o = getO(v.id(orderId));
    const c = o && myRowFor(user, o.restaurant_id);
    if (!o || !c || o.courier_id !== c.id || !ACTIVE.includes(o.status)) throw new AppError('NOT_FOUND');
    const bucket = Math.floor(now() / (10 * 60000)); // 10 daqiqada bir marta
    let sent = 0;
    for (const uid of staffIds(o.restaurant_id)) {
      if (await notify.send(uid, 'k_staff_problem', { id: o.id, courier: c.name, phone: c.phone || '—' }, { dedupeKey: `problem:${o.id}:${uid}:${bucket}` })) sent += 1;
    }
    const r = getR(o.restaurant_id);
    if (r.group_chat_id && r.group_status === 'active') {
      await notify.sendText(r.group_chat_id, t('uz', 'k_staff_problem', { id: o.id, courier: c.name, phone: c.phone || '—' }), { dedupeKey: `problem:${o.id}:group:${bucket}`, userId: null });
    }
    db.prepare(`INSERT INTO order_events (order_id, actor_id, actor_role, type, created_at) VALUES (?, ?, 'courier', 'courier_problem', ?)`).run(o.id, user.id, now());
    return { ok: true, restaurant_phone: r.phone || null, notified: sent };
  }

  // Kuryer amallari (olib ketdim / yetkazdim) — holat o'tishlari jadvali orqali (faqat biriktirilgan kuryer).
  const pickup = (user, orderId) => orders.transition(user, v.id(orderId), 'on_way');
  const deliver = (user, orderId) => orders.transition(user, v.id(orderId), 'delivered');

  // ---------- Kuryer ekrani ----------
  function dashboard(user, at = now()) {
    const rows = myRows(user);
    if (!rows.length) throw new AppError('FORBIDDEN');
    const ids = rows.map((c) => c.id);
    const inIds = ids.map(() => '?').join(',');
    const rById = new Map(rows.map((c) => [c.id, c]));
    const view = (o) => {
      const c = rById.get(o.courier_id) || rows.find((x) => x.restaurant_id === o.restaurant_id);
      let details = {};
      try { details = JSON.parse(o.address_details || '{}') || {}; } catch { details = {}; }
      const r = getR(o.restaurant_id);
      return {
        id: o.id, status: o.status, restaurant_id: o.restaurant_id, restaurant_name: r.name, restaurant_address: r.address_text, restaurant_phone: r.phone,
        restaurant_lat: r.lat, restaurant_lon: r.lon, customer_name: o.customer_name, customer_phone: o.customer_phone,
        address_text: o.address_text, address_details: details, address_lat: o.address_lat, address_lon: o.address_lon, comment: o.comment,
        total: o.total, payment_method: o.payment_method, payment_status: o.payment_status, collect_amount: templates.collectAmount(o),
        prep_minutes: o.prep_minutes, created_at: o.created_at, updated_at: o.updated_at, courier_id: c?.id,
        items: db.prepare('SELECT name, qty FROM order_items WHERE order_id = ? ORDER BY id').all(o.id).map((i) => ({ ...i })),
      };
    };
    const active = db.prepare(`SELECT * FROM orders WHERE courier_id IN (${inIds}) AND status IN ('new','accepted','ready','on_way')
      ORDER BY CASE status WHEN 'on_way' THEN 0 WHEN 'ready' THEN 1 ELSE 2 END, id`).all(...ids).map(view);
    const offers = db.prepare(`SELECT o.* FROM courier_offers f JOIN orders o ON o.id = f.order_id
      WHERE f.courier_id IN (${inIds}) AND f.status = 'open' AND o.courier_id IS NULL AND o.status IN ('accepted','ready') ORDER BY o.id`).all(...ids).map(view);
    const dayStart = new Date(at + 5 * 3600000); dayStart.setUTCHours(0, 0, 0, 0);
    const from = dayStart.getTime() - 5 * 3600000;
    const today = db.prepare(`SELECT COUNT(*) AS delivered, COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN total ELSE 0 END), 0) AS cash
      FROM orders WHERE courier_id IN (${inIds}) AND status = 'delivered' AND updated_at >= ?`).get(...ids, from);
    const history = db.prepare(`SELECT o.id, o.status, o.total, o.payment_method, o.address_text, o.updated_at, r.name AS restaurant_name
      FROM orders o JOIN restaurants r ON r.id = o.restaurant_id WHERE o.courier_id IN (${inIds}) AND o.status IN ('delivered','cancelled')
      ORDER BY o.updated_at DESC LIMIT 20`).all(...ids).map((x) => ({ ...x }));
    return {
      shifts: rows.map((c) => ({ courier_id: c.id, restaurant_id: c.restaurant_id, restaurant_name: c.restaurant_name, restaurant_status: c.restaurant_status, is_online: c.is_online === 1, name: c.name })),
      active, offers, today: { delivered: today.delivered, cash: today.cash }, history,
    };
  }

  return {
    setBotApi(a) { api = a; },
    myRows, setOnline, dispatch, onOrderChanged, accept, decline, release, reportProblem, pickup, deliver, dashboard,
  };
}
