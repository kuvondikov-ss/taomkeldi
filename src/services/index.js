// Biznes qoidalari qatlami. HTTP API ham, Telegram bot ham faqat shu funksiyalarni chaqiradi.
import { EventEmitter } from 'node:events';
import { createUserService } from './users.js';
import { createAccessService } from './access.js';
import { createRestaurantService } from './restaurants.js';
import { createOrderService } from './orders.js';
import { createAddressService } from './addresses.js';
import { createUploadService } from './uploads.js';
import { createInviteService } from './invites.js';
import { createGeoService } from './geo.js';
import { createGeocoderService } from './geocoder.js';
import { createCatalogService } from './catalog.js';
import { createCheckoutService } from './checkout.js';
import { createPaymentService } from './payments.js';
import { createNotifyService } from './notify.js';
import { createPlatformService } from './platform.js';
import { createManageService } from './manage.js';
import { createGroupService } from './group.js';
import { createOutbox } from './outbox.js';
import { createTemplates } from './templates.js';
import { createOrderNotifier } from './order-notify.js';
import { createDispatchService } from './dispatch.js';

export function createServices(db, config, { fetchImpl, logger = console } = {}) {
  // Buyurtma o'zgarishi hodisasi: ('order', orderId, kind). Tinglovchilar (masalan, restoran guruhi xabari)
  // tranzaksiyadan KEYIN, alohida navbatda ishlaydi — asosiy amalni sekinlashtirmaydi va buzmaydi.
  const events = new EventEmitter();
  events.setMaxListeners(20);
  const emitOrder = (orderId, kind = 'changed') => setImmediate(() => events.emit('order', orderId, kind));
  const geo = createGeoService();
  const users = createUserService(db, config);
  const access = createAccessService(db, config);
  const restaurants = createRestaurantService(db, access, geo);
  const orders = createOrderService(db, access, config);
  const addresses = createAddressService(db, geo);
  const uploads = createUploadService(config, access);
  const invites = createInviteService(db, access, restaurants);
  const geocoder = createGeocoderService(config, geo, { fetchImpl });
  const catalog = createCatalogService(db, geo, access);
  const payments = createPaymentService(db, config, { access, orders });
  const checkout = createCheckoutService(db, { geo, addresses, users, payments });
  const outbox = createOutbox(db, { logger });
  const templates = createTemplates(db, config);
  const notify = createNotifyService(users, outbox);
  const platform = createPlatformService(db, { access, restaurants, geo, catalog, notify, users, outbox });
  const manage = createManageService(db, { access, geo });
  const group = createGroupService(db, { access, notify, config, templates, logger });
  const orderNotify = createOrderNotifier(db, { users, templates, notify, logger });
  const dispatch = createDispatchService(db, { access, users, templates, notify, orders, emitOrder, logger });
  // Buyurtmani o'zgartiradigan amallar muvaffaqiyatli tugagach — 'order' hodisasi.
  const emitAfter = (obj, name, idOf) => {
    const fn = obj[name];
    obj[name] = (...args) => {
      const out = fn(...args);
      const id = idOf(out, args);
      if (id) emitOrder(Number(id), name);
      return out;
    };
  };
  emitAfter(orders, 'transition', (out) => out?.id);
  emitAfter(checkout, 'placeOrder', (out) => (out.duplicate ? null : out.orderId));
  emitAfter(payments, 'claimTransfer', (out, a) => (out.already ? null : a[1]));
  emitAfter(payments, 'confirmTransfer', (out, a) => (out.already ? null : a[1]));
  emitAfter(payments, 'markRefunded', (_o, a) => a[1]);
  emitAfter(payments, 'applySuccessfulPayment', (out) => (out.outcome === 'duplicate' ? null : out.orderId));
  emitAfter(manage, 'assignCourier', (_o, a) => a[1]);
  // Har o'zgarishda: restoran guruhidagi asosiy xabar, kuryerning jonli xabari, mijozga muhim bosqich xabari.
  // Vaqtinchalik Telegram xatosida jonli xabarlar outbox orqali qayta yangilanadi.
  const retryLater = (target, orderId) => (r) => { if (r?.retry) outbox.enqueueSync(target, orderId, { delayMs: r.retryAfter ?? 10_000 }); };
  const pending = new Set();
  const track = (p) => { pending.add(p); p.finally(() => pending.delete(p)); return p; };
  events.on('order', (orderId) => {
    track(group.syncOrder(orderId).then(retryLater('group', orderId)));
    track(orderNotify.handle(orderId).then(retryLater('courier', orderId)));
    // Dispetcher: qabul qilingan yetkazish buyurtmasiga kuryer taklifi; biriktirilganda takliflar yopiladi.
    track(dispatch.onOrderChanged(orderId).catch((e) => logger.error('Dispetcher xatosi:', e)));
  });
  outbox.onSync('group', ({ orderId }) => group.syncOrder(orderId));
  outbox.onSync('courier', ({ orderId }) => orderNotify.courier(orderId));

  // Testlar va to'xtatish uchun: navbatdagi hodisalar va yuborishlar tugashini kutish.
  async function idle() {
    const tick = () => new Promise((res) => setImmediate(res));
    for (let i = 0; i < 50; i += 1) {
      await tick();
      if (!pending.size) { await tick(); if (!pending.size) break; }
      await Promise.allSettled([...pending]);
    }
    await Promise.all([group.idle(), orderNotify.idle()]);
  }

  // Bot ishga tushganda: xabar yuborish va onlayn to'lov uchun Telegram API.
  const setBotApi = (api) => { payments.setBotApi(api); outbox.setBotApi(api); group.setBotApi(api); orderNotify.setBotApi(api); dispatch.setBotApi(api); };
  return {
    geo, users, access, restaurants, orders, addresses, uploads, invites, geocoder, catalog, checkout, payments, notify, platform, manage, group,
    outbox, templates, orderNotify, dispatch, setBotApi, events, idle,
  };
}
