// Biznes qoidalari qatlami. HTTP API ham, Telegram bot ham faqat shu funksiyalarni chaqiradi.
import { createUserService } from './users.js';
import { createAccessService } from './access.js';
import { createRestaurantService } from './restaurants.js';
import { createOrderService } from './orders.js';
import { createAddressService } from './addresses.js';
import { createUploadService } from './uploads.js';
import { createInviteService } from './invites.js';

export function createServices(db, config) {
  const users = createUserService(db, config);
  const access = createAccessService(db, config);
  const restaurants = createRestaurantService(db, access);
  const orders = createOrderService(db, access);
  const addresses = createAddressService(db);
  const uploads = createUploadService(config, access);
  const invites = createInviteService(db, access, restaurants);
  return { users, access, restaurants, orders, addresses, uploads, invites };
}
