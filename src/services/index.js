// Biznes qoidalari qatlami. HTTP API ham, Telegram bot ham faqat shu funksiyalarni chaqiradi.
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

export function createServices(db, config, { fetchImpl } = {}) {
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
  const notify = createNotifyService(users);
  const platform = createPlatformService(db, { access, restaurants, geo, catalog, notify, users });
  const manage = createManageService(db, { access, geo });
  // Bot ishga tushganda: xabar yuborish va onlayn to'lov uchun Telegram API.
  const setBotApi = (api) => { payments.setBotApi(api); notify.setBotApi(api); };
  return { geo, users, access, restaurants, orders, addresses, uploads, invites, geocoder, catalog, checkout, payments, notify, platform, manage, setBotApi };
}
