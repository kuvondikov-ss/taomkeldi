// Express ilovasi: API + Mini App statik fayllari + yuklangan rasmlar.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { AppError, errorBody } from '../lib/errors.js';
import * as v from '../lib/validate.js';
import { validateInitData, InitDataError } from './initData.js';

const PUBLIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public');

function requestLang(req) {
  if (req.actor) return req.services.users.langOf(req.actor);
  return String(req.headers['accept-language'] || '').toLowerCase().startsWith('ru') ? 'ru' : 'uz';
}

export function createApp({ config, services, logger = console }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use((req, _res, next) => {
    req.services = services;
    next();
  });

  // Railway healthcheck. Baza ishlamasa — 503 (deploy "sog'lom emas"). Bot holati faqat ma'lumot uchun.
  app.get('/health', (_req, res) => {
    try {
      res.json({ ok: true, ...services.health(), bot: config.runtime?.bot || 'unknown', version: config.version || null });
    } catch (e) {
      logger.error('Healthcheck xatosi:', e.message);
      res.status(503).json({ ok: false, db: 'error' });
    }
  });

  // --- Autentifikatsiya: Authorization: tma <initData> ---
  // DEV_AUTH (faqat lokal, production'da config.devAuth=false): X-Dev-User: <telegram id>
  function authenticate(req, _res, next) {
    const header = req.get('authorization') || '';
    let tgUser = null;
    if (header.startsWith('tma ')) {
      try {
        tgUser = validateInitData(header.slice(4), config.botToken, { maxAgeSec: config.initDataMaxAgeSec }).user;
      } catch (e) {
        if (e instanceof InitDataError) throw new AppError(e.code);
        throw e;
      }
    } else if (config.devAuth && req.get('x-dev-user')) {
      const id = Number(req.get('x-dev-user'));
      if (!Number.isSafeInteger(id) || id <= 0) throw new AppError('AUTH_INVALID');
      tgUser = { id, first_name: `Dev ${id}` };
    } else {
      throw new AppError('AUTH_REQUIRED');
    }
    const actor = services.users.upsertFromTelegram(tgUser);
    if (actor.is_blocked) throw new AppError('USER_BLOCKED');
    req.actor = actor;
    next();
  }

  const api = express.Router();
  api.use(express.json({ limit: '100kb' }));
  api.use(authenticate);

  // --- Joriy foydalanuvchi ---
  api.get('/me', (req, res) => {
    const a = req.actor;
    res.json({
      ok: true,
      user: { id: a.id, first_name: a.first_name, last_name: a.last_name, username: a.username, phone: a.phone, contact_name: a.contact_name, lang: services.users.langOf(a) },
      roles: services.access.rolesOf(a),
    });
  });

  api.put('/me/lang', (req, res) => {
    const user = services.users.setLang(req.actor.id, req.body?.lang);
    res.json({ ok: true, lang: user.lang });
  });

  // --- Mini App sozlamalari: xarita va hudud ---
  api.get('/config', (_req, res) => {
    const p = services.geo.region.properties;
    res.json({
      ok: true,
      map: config.map,
      region: { name: p.name, name_ru: p.name_ru, bbox: p.bbox, geojson_url: '/geo/jizzax.json', attribution: p.attribution },
      distance_method: 'straight_line',
      geocoder: config.geocoder.enabled,
    });
  });

  // --- Hudud va manzil qidiruvi ---
  api.get('/geo/check', (req, res) => {
    const lat = v.coord(req.query.lat, 'lat', 'lat');
    const lon = v.coord(req.query.lon, 'lon', 'lon');
    res.json({ ok: true, inside: services.geo.isInServiceArea(lat, lon) });
  });
  api.get('/geo/search', async (req, res) => {
    res.json({ ok: true, results: await services.geocoder.search(req.query.q, services.users.langOf(req.actor)) });
  });
  api.get('/geo/reverse', async (req, res) => {
    res.json({ ok: true, place: await services.geocoder.reverse(req.query.lat, req.query.lon, services.users.langOf(req.actor)) });
  });

  // --- Manzillar (faqat o'ziniki, faqat Jizzax viloyati) ---
  api.get('/addresses', (req, res) => res.json({ ok: true, addresses: services.addresses.list(req.actor) }));
  api.post('/addresses', (req, res) => res.status(201).json({ ok: true, address: services.addresses.create(req.actor, req.body || {}) }));
  api.put('/addresses/:id', (req, res) => res.json({ ok: true, address: services.addresses.update(req.actor, req.params.id, req.body || {}) }));
  api.post('/addresses/:id/default', (req, res) => res.json({ ok: true, address: services.addresses.setDefault(req.actor, req.params.id) }));
  api.delete('/addresses/:id', (req, res) => {
    services.addresses.remove(req.actor, req.params.id);
    res.json({ ok: true });
  });

  // --- Katalog (mijoz): faqat tanlangan nuqtaga yetkazadigan faol restoranlar ---
  // ?address_id= yoki ?lat=&lon=; filtrlar: cuisine, promo=1, sort=recommended|rating|fast|cheap_delivery
  api.get('/restaurants', (req, res) => {
    const point = services.addresses.resolvePoint(req.actor, req.query);
    const { cuisine, promo, free, sort } = req.query;
    res.json({ ok: true, point, ...services.catalog.home(req.actor, point, { cuisine, promo, free, sort: sort || undefined }) });
  });
  api.get('/restaurants/:id', (req, res) => {
    const point = services.addresses.resolvePoint(req.actor, req.query);
    res.json({ ok: true, restaurant: services.catalog.restaurant(req.actor, v.id(req.params.id), point) });
  });
  api.post('/cart/check', (req, res) => {
    const point = services.addresses.resolvePoint(req.actor, req.body || {});
    res.json({ ok: true, ...services.catalog.checkCart(req.actor, point, req.body) });
  });
  api.get('/search', (req, res) => {
    const point = services.addresses.resolvePoint(req.actor, req.query);
    res.json({ ok: true, ...services.catalog.search(req.actor, point, req.query.q) });
  });
  api.get('/favorites', (req, res) => {
    const point = services.addresses.resolvePoint(req.actor, req.query);
    res.json({ ok: true, restaurants: services.catalog.favorites(req.actor, point) });
  });
  api.put('/favorites/:rid', (req, res) => res.json({ ok: true, ...services.catalog.setFavorite(req.actor, req.params.rid, true) }));
  api.delete('/favorites/:rid', (req, res) => res.json({ ok: true, ...services.catalog.setFavorite(req.actor, req.params.rid, false) }));
  api.get('/cuisines', (_req, res) => res.json({ ok: true, cuisines: services.catalog.allCuisines() }));

  api.put('/me/contact', (req, res) => {
    const u = services.checkout.saveContact(req.actor, req.body || {});
    res.json({ ok: true, contact: { name: u.contact_name, phone: u.phone } });
  });

  // --- Checkout: quote va buyurtma bitta hisob funksiyasidan ---
  api.post('/checkout/quote', (req, res) => res.json({ ok: true, quote: services.checkout.computeQuote(req.actor, req.body || {}) }));
  api.post('/orders', (req, res) => {
    const { orderId, duplicate } = services.checkout.placeOrder(req.actor, req.body || {});
    res.status(duplicate ? 200 : 201).json({ ok: true, duplicate, order: services.orders.getForActor(req.actor, orderId) });
  });
  api.post('/orders/:id/cancel', (req, res) => {
    services.orders.transition(req.actor, v.id(req.params.id), 'cancelled', { reason: req.body?.reason });
    res.json({ ok: true, order: services.orders.getForActor(req.actor, v.id(req.params.id)) });
  });
  // --- To'lovlar ---
  api.post('/orders/:id/payment-claim', (req, res) => {
    const r = services.payments.claimTransfer(req.actor, v.id(req.params.id));
    res.json({ ok: true, already: r.already, order: services.orders.getForActor(req.actor, v.id(req.params.id)) });
  });
  api.post('/orders/:id/invoice', async (req, res) => {
    res.json({ ok: true, ...(await services.payments.createInvoice(req.actor, v.id(req.params.id))) });
  });
  // Xodim: confirm ("To'lov keldi"), reject (pul kelmadi, sabab bilan), refunded (faqat ega/admin).
  api.post('/panel/orders/:id/payment', (req, res) => {
    const id = v.id(req.params.id);
    const action = v.oneOf(req.body?.action, 'action', ['confirm', 'reject', 'refunded']);
    if (action === 'confirm') services.payments.confirmTransfer(req.actor, id);
    else if (action === 'reject') services.payments.rejectTransfer(req.actor, id, req.body?.reason);
    else services.payments.markRefunded(req.actor, id);
    res.json({ ok: true, order: services.orders.getForActor(req.actor, id) });
  });
  api.put('/panel/restaurants/:rid/payment-methods', (req, res) => {
    res.json({ ok: true, restaurant: services.restaurants.updatePaymentMethods(req.actor, v.id(req.params.rid, 'rid'), req.body || {}) });
  });

  // Restoran xodimi / kuryer / admin: holatni o'zgartirish (panel UI — 11/14-bosqichlar).
  api.post('/panel/orders/:id/status', (req, res) => {
    services.orders.transition(req.actor, v.id(req.params.id), req.body?.to, { reason: req.body?.reason, prepMinutes: req.body?.prep_minutes });
    res.json({ ok: true, order: services.orders.getForActor(req.actor, v.id(req.params.id)) });
  });

  // --- Mijoz buyurtmalari ---
  api.get('/orders', (req, res) => res.json({ ok: true, orders: services.orders.listForCustomer(req.actor) }));
  api.get('/orders/:id', (req, res) => {
    const order = services.orders.getForActor(req.actor, v.id(req.params.id));
    if (order.viewer_role === 'customer') order.rating = services.tracking.ratingOf(order.id);
    res.json({ ok: true, order });
  });
  // --- Kuzatuv, baholash, qayta buyurtma (15-bosqich) ---
  api.get('/orders/:id/tracking', (req, res) => res.json({ ok: true, tracking: services.tracking.track(req.actor, req.params.id) }));
  api.post('/orders/:id/rating', (req, res) => res.json({ ok: true, rating: services.tracking.rate(req.actor, req.params.id, req.body || {}) }));
  api.post('/orders/:id/reorder', (req, res) => {
    const point = services.addresses.resolvePoint(req.actor, req.body || {});
    res.json({ ok: true, ...services.tracking.reorder(req.actor, req.params.id, point) });
  });
  api.post('/courier/location', (req, res) => res.json({ ok: true, ...services.tracking.courierPing(req.actor, req.body || {}) }));

  // --- Kuryer ---
  api.get('/courier/orders', (req, res) => res.json({ ok: true, orders: services.orders.listForCourier(req.actor) }));
  // --- Kuryer ekrani (14-bosqich): smena, takliflar, joriy buyurtma amallari. Vakolat — services.dispatch. ---
  const D = services.dispatch;
  const oid = (req) => v.id(req.params.id);
  api.get('/courier/dashboard', (req, res) => res.json({ ok: true, ...D.dashboard(req.actor) }));
  api.post('/courier/shift', async (req, res) => res.json({ ok: true, shift: await D.setOnline(req.actor, req.body?.courier_id, !!req.body?.online) }));
  api.post('/courier/offers/:id/accept', async (req, res) => res.json({ ok: true, ...(await D.accept(req.actor, oid(req))) }));
  api.post('/courier/offers/:id/decline', async (req, res) => res.json({ ok: true, ...(await D.decline(req.actor, oid(req))) }));
  api.post('/courier/orders/:id/pickup', (req, res) => { D.pickup(req.actor, oid(req)); res.json({ ok: true }); });
  api.post('/courier/orders/:id/deliver', (req, res) => { D.deliver(req.actor, oid(req)); res.json({ ok: true }); });
  api.post('/courier/orders/:id/release', async (req, res) => res.json({ ok: true, ...(await D.release(req.actor, oid(req))) }));
  api.post('/courier/orders/:id/problem', async (req, res) => res.json({ ok: true, ...(await D.reportProblem(req.actor, oid(req))) }));

  // --- Restoran paneli (ega/menejer/platforma admini) ---
  api.get('/panel/restaurants/:rid', (req, res) => {
    res.json({ ok: true, restaurant: services.restaurants.getForPanel(req.actor, v.id(req.params.rid, 'rid')) });
  });
  api.get('/panel/restaurants/:rid/orders', (req, res) => {
    const orders = services.orders.listForRestaurant(req.actor, v.id(req.params.rid, 'rid'), { status: req.query.status });
    res.json({ ok: true, orders });
  });
  // --- Restoran paneli bo'limlari (11-bosqich) ---
  const rid = (req) => v.id(req.params.rid, 'rid');
  const M = services.manage;
  api.get('/panel/restaurants/:rid/board', (req, res) => res.json({ ok: true, ...M.orders(req.actor, rid(req), req.query.group || 'new') }));
  api.post('/panel/orders/:id/courier', (req, res) => {
    M.assignCourier(req.actor, req.params.id, req.body?.courier_id ?? null);
    res.json({ ok: true, order: services.orders.getForActor(req.actor, v.id(req.params.id)) });
  });
  api.get('/panel/restaurants/:rid/menu', (req, res) => res.json({ ok: true, ...M.menu(req.actor, rid(req)) }));
  api.post('/panel/restaurants/:rid/categories', (req, res) => res.status(201).json({ ok: true, id: M.saveCategory(req.actor, rid(req), req.body || {}) }));
  api.put('/panel/restaurants/:rid/categories/:cid', (req, res) => res.json({ ok: true, id: M.saveCategory(req.actor, rid(req), req.body || {}, req.params.cid) }));
  api.delete('/panel/restaurants/:rid/categories/:cid', (req, res) => { M.deleteCategory(req.actor, rid(req), req.params.cid); res.json({ ok: true }); });
  api.put('/panel/restaurants/:rid/categories-order', (req, res) => { M.reorderCategories(req.actor, rid(req), req.body?.ids); res.json({ ok: true }); });
  api.post('/panel/restaurants/:rid/products', (req, res) => res.status(201).json({ ok: true, id: M.saveProduct(req.actor, rid(req), req.body || {}) }));
  api.put('/panel/restaurants/:rid/products/:pid', (req, res) => res.json({ ok: true, id: M.saveProduct(req.actor, rid(req), req.body || {}, req.params.pid) }));
  api.put('/panel/restaurants/:rid/products/:pid/availability', (req, res) => { M.setAvailability(req.actor, rid(req), req.params.pid, !!req.body?.available); res.json({ ok: true }); });
  api.delete('/panel/restaurants/:rid/products/:pid', (req, res) => { M.deleteProduct(req.actor, rid(req), req.params.pid); res.json({ ok: true }); });
  api.get('/panel/restaurants/:rid/couriers', (req, res) => res.json({ ok: true, couriers: M.couriers(req.actor, rid(req)) }));
  api.post('/panel/restaurants/:rid/couriers', (req, res) => res.status(201).json({ ok: true, id: M.saveCourier(req.actor, rid(req), req.body || {}) }));
  api.put('/panel/restaurants/:rid/couriers/:cid', (req, res) => res.json({ ok: true, id: M.saveCourier(req.actor, rid(req), req.body || {}, req.params.cid) }));
  api.delete('/panel/restaurants/:rid/couriers/:cid', (req, res) => { M.removeCourier(req.actor, rid(req), req.params.cid); res.json({ ok: true }); });
  api.get('/panel/restaurants/:rid/staff', (req, res) => res.json({ ok: true, staff: M.staffList(req.actor, rid(req)) }));
  api.delete('/panel/restaurants/:rid/staff/:sid', (req, res) => { M.revokeStaff(req.actor, rid(req), req.params.sid); res.json({ ok: true }); });
  api.put('/panel/restaurants/:rid/operations', (req, res) => { M.updateOperations(req.actor, rid(req), req.body || {}); res.json({ ok: true, restaurant: services.restaurants.getForPanel(req.actor, rid(req)) }); });
  api.put('/panel/restaurants/:rid/profile', (req, res) => { M.updateProfile(req.actor, rid(req), req.body || {}); res.json({ ok: true, restaurant: services.restaurants.getForPanel(req.actor, rid(req)) }); });
  api.get('/panel/restaurants/:rid/report', (req, res) => res.json({ ok: true, report: M.report(req.actor, rid(req)) }));
  // --- Restoran Telegram guruhi (12-bosqich). Ulash — guruhda /bogla orqali. ---
  const G = services.group;
  api.get('/panel/restaurants/:rid/group', (req, res) => res.json({ ok: true, group: G.status(req.actor, rid(req)) }));
  api.post('/panel/restaurants/:rid/group/check', async (req, res) => res.json({ ok: true, group: await G.check(req.actor, rid(req)) }));
  api.post('/panel/restaurants/:rid/group/test', async (req, res) => res.json({ ok: true, group: await G.sendTest(req.actor, rid(req)) }));
  api.delete('/panel/restaurants/:rid/group', (req, res) => res.json({ ok: true, group: G.unlink(req.actor, rid(req)) }));

  api.put('/panel/restaurants/:rid/cuisines', (req, res) => {
    res.json({ ok: true, cuisines: services.catalog.setRestaurantCuisines(req.actor, v.id(req.params.rid, 'rid'), req.body?.cuisine_ids) });
  });
  api.put('/panel/restaurants/:rid/location', (req, res) => {
    res.json({ ok: true, restaurant: services.restaurants.updateLocation(req.actor, v.id(req.params.rid, 'rid'), req.body || {}) });
  });
  api.put('/panel/restaurants/:rid/payment', (req, res) => {
    res.json({ ok: true, restaurant: services.restaurants.updatePayment(req.actor, v.id(req.params.rid, 'rid'), req.body || {}) });
  });
  api.post(
    '/panel/restaurants/:rid/uploads',
    express.raw({ type: () => true, limit: config.uploadMaxBytes }),
    (req, res) => {
      const file = services.uploads.saveRestaurantImage(req.actor, v.id(req.params.rid, 'rid'), req.body);
      res.status(201).json({ ok: true, file });
    },
  );

  // --- Taklif havolalari (ega — platforma admini; menejer — ega; kuryer — ega/menejer) ---
  const inviteView = (inv) => ({
    id: inv.id, kind: inv.kind, courier_id: inv.courierId, expires_at: inv.expiresAt,
    link: config.botUsername ? `https://t.me/${config.botUsername}?start=${inv.payload}` : null,
    start_payload: inv.payload,
  });
  api.get('/panel/restaurants/:rid/invites', (req, res) => {
    res.json({ ok: true, invites: services.invites.list(req.actor, v.id(req.params.rid, 'rid')) });
  });
  api.post('/panel/restaurants/:rid/invites', (req, res) => {
    const inv = services.invites.create(req.actor, v.id(req.params.rid, 'rid'), {
      kind: req.body?.kind, courierId: req.body?.courier_id,
    });
    res.status(201).json({ ok: true, invite: inviteView(inv) });
  });
  api.delete('/panel/restaurants/:rid/invites/:id', (req, res) => {
    services.invites.revoke(req.actor, v.id(req.params.rid, 'rid'), req.params.id);
    res.json({ ok: true });
  });

  // Restoranni faqat platforma admini qo'shadi (POST /admin/restaurants). Foydalanuvchi arizasi yopilgan:
  // eski Mini App versiyasidan kelgan so'rov ham aniq javob oladi.
  api.post('/applications', () => { throw new AppError('FORBIDDEN', { details: { reason: 'admin_only' } }); });
  api.get('/panel/restaurants/:rid/readiness', (req, res) => {
    res.json({ ok: true, ...services.platform.readiness(req.actor, v.id(req.params.rid, 'rid')) });
  });

  // --- Platforma administratori ---
  api.get('/admin/overview', (req, res) => res.json({ ok: true, overview: services.platform.overview(req.actor) }));
  api.get('/admin/finance', (req, res) => res.json({ ok: true, finance: services.platform.finance(req.actor, { period: req.query.period || 'week' }) }));
  api.get('/admin/restaurants/list', (req, res) => res.json({ ok: true, restaurants: services.platform.list(req.actor, { status: req.query.status || undefined }) }));
  api.post('/admin/restaurants/:id/approve', async (req, res) => res.json({ ok: true, restaurant: await services.platform.approve(req.actor, req.params.id) }));
  api.post('/admin/restaurants/:id/reject', async (req, res) => res.json({ ok: true, restaurant: await services.platform.reject(req.actor, req.params.id, req.body?.reason) }));
  api.post('/admin/restaurants/:id/block', async (req, res) => res.json({ ok: true, restaurant: await services.platform.block(req.actor, req.params.id, req.body?.reason) }));
  api.post('/admin/restaurants/:id/unblock', async (req, res) => res.json({ ok: true, restaurant: await services.platform.unblock(req.actor, req.params.id) }));
  api.post('/admin/demo/delete', (req, res) => res.json({ ok: true, deleted: services.platform.deleteDemo(req.actor, req.body?.confirm) }));
  api.get('/admin/restaurants', (req, res) => res.json({ ok: true, restaurants: services.restaurants.listAll(req.actor) }));
  api.post('/admin/restaurants', (req, res) => {
    res.status(201).json({ ok: true, restaurant: services.restaurants.create(req.actor, req.body || {}) });
  });

  api.use(() => {
    throw new AppError('NOT_FOUND');
  });

  app.use('/api', api);
  app.use('/uploads', express.static(config.uploadsDir, { fallthrough: false, index: false }));
  // HTML/JS/CSS har safar ETag bilan qayta tekshiriladi (deploydan keyin eski fayl qolmasin);
  // shrift, vendor va rasmlar bir hafta keshlanadi.
  app.use(express.static(PUBLIC_DIR, {
    index: 'index.html',
    setHeaders(res, filePath) {
      if (/\.(html|js|mjs|css|json)$/.test(filePath)) res.setHeader('Cache-Control', 'no-cache');
      else res.setHeader('Cache-Control', 'public, max-age=604800');
    },
  }));

  // --- Yagona xato javobi: { ok:false, error:{ code, message } } ---
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    let appErr = err;
    if (!(err instanceof AppError)) {
      if (err?.type === 'entity.too.large') appErr = new AppError('UPLOAD_TOO_LARGE');
      else if (err?.type === 'entity.parse.failed') appErr = new AppError('VALIDATION', { details: { reason: 'json' } });
      else if (err?.status === 404 || err?.statusCode === 404) appErr = new AppError('NOT_FOUND');
      else {
        logger.error('Kutilmagan xato:', err);
        appErr = new AppError('INTERNAL');
      }
    }
    res.status(appErr.status).json(errorBody(appErr, requestLang(req)));
  });

  return app;
}
