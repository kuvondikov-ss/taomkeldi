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

export function createServices(db, config, { fetchImpl } = {}) {
  const geo = createGeoService();
  const users = createUserService(db, config);
  const access = createAccessService(db, config);
  const restaurants = createRestaurantService(db, access, geo);
  const orders = createOrderService(db, access);
  const addresses = createAddressService(db, geo);
  const uploads = createUploadService(config, access);
  const invites = createInviteService(db, access, restaurants);
  const geocoder = createGeocoderService(config, geo, { fetchImpl });
  const catalog = createCatalogService(db, geo, access);
  return { geo, users, access, restaurants, orders, addresses, uploads, invites, geocoder, catalog };
}
