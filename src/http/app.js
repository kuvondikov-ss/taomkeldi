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

  app.get('/health', (_req, res) => res.json({ ok: true }));

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
      user: { id: a.id, first_name: a.first_name, last_name: a.last_name, username: a.username, phone: a.phone, lang: services.users.langOf(a) },
      roles: services.access.rolesOf(a),
    });
  });

  api.put('/me/lang', (req, res) => {
    const user = services.users.setLang(req.actor.id, req.body?.lang);
    res.json({ ok: true, lang: user.lang });
  });

  // --- Manzillar (faqat o'ziniki) ---
  api.get('/addresses', (req, res) => res.json({ ok: true, addresses: services.addresses.list(req.actor) }));
  api.post('/addresses', (req, res) => res.status(201).json({ ok: true, address: services.addresses.create(req.actor, req.body || {}) }));
  api.delete('/addresses/:id', (req, res) => {
    services.addresses.remove(req.actor, req.params.id);
    res.json({ ok: true });
  });

  // --- Mijoz buyurtmalari ---
  api.get('/orders', (req, res) => res.json({ ok: true, orders: services.orders.listForCustomer(req.actor) }));
  api.get('/orders/:id', (req, res) => res.json({ ok: true, order: services.orders.getForActor(req.actor, v.id(req.params.id)) }));

  // --- Kuryer ---
  api.get('/courier/orders', (req, res) => res.json({ ok: true, orders: services.orders.listForCourier(req.actor) }));

  // --- Restoran paneli (ega/menejer/platforma admini) ---
  api.get('/panel/restaurants/:rid', (req, res) => {
    res.json({ ok: true, restaurant: services.restaurants.getForPanel(req.actor, v.id(req.params.rid, 'rid')) });
  });
  api.get('/panel/restaurants/:rid/orders', (req, res) => {
    const orders = services.orders.listForRestaurant(req.actor, v.id(req.params.rid, 'rid'), { status: req.query.status });
    res.json({ ok: true, orders });
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

  // --- Platforma administratori ---
  api.get('/admin/restaurants', (req, res) => res.json({ ok: true, restaurants: services.restaurants.listAll(req.actor) }));
  api.post('/admin/restaurants', (req, res) => {
    res.status(201).json({ ok: true, restaurant: services.restaurants.create(req.actor, req.body || {}) });
  });

  api.use(() => {
    throw new AppError('NOT_FOUND');
  });

  app.use('/api', api);
  app.use('/uploads', express.static(config.uploadsDir, { fallthrough: false, index: false }));
  app.use(express.static(PUBLIC_DIR, { index: 'index.html' }));

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
