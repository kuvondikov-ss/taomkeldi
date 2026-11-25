// Test muhiti: har test uchun alohida vaqtinchalik papka va baza. Production bazasiga tegilmaydi.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../src/config.js';
import { openDb } from '../src/db/index.js';
import { createServices } from '../src/services/index.js';
import { createApp } from '../src/http/app.js';
import { signInitData } from '../src/http/initData.js';

export const TEST_TOKEN = '123456:TEST-token-for-unit-tests-only';
const silent = { log() {}, warn() {}, error() {} };

export async function setup(envOverrides = {}, { fetchImpl } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'taomkeldi-test-'));
  const env = { BOT_TOKEN: TEST_TOKEN, DATA_DIR: dir, PLATFORM_ADMIN_IDS: '900', NODE_ENV: 'test', GEOCODER_ENABLED: '0', ...envOverrides };
  const config = loadConfig(env);
  const db = openDb(config.dbPath);
  const services = createServices(db, config, { fetchImpl });
  const app = createApp({ config, services, logger: silent });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  async function close() {
    await new Promise((r) => server.close(r));
    try { db.close(); } catch { /* allaqachon yopilgan */ }
    fs.rmSync(dir, { recursive: true, force: true });
  }
  return { dir, env, config, db, services, base, close };
}

export function makeInitData(user, { token = TEST_TOKEN, authDate = Math.floor(Date.now() / 1000), extra = {} } = {}) {
  const params = new URLSearchParams({ auth_date: String(authDate), query_id: 'AAE-test', user: JSON.stringify(user), ...extra });
  params.set('hash', signInitData(params, token));
  return params.toString();
}

export function tgUser(id, first_name = `User ${id}`) {
  return { id, first_name, language_code: 'uz' };
}

// Foydalanuvchi nomidan so'rov (haqiqiy imzolangan initData bilan).
export async function call(base, userId, method, url, body, { headers = {} } = {}) {
  const h = { ...headers };
  if (userId != null) h.Authorization = `tma ${makeInitData(tgUser(userId))}`;
  let payload;
  if (Buffer.isBuffer(body)) {
    payload = body;
    h['Content-Type'] ||= 'application/octet-stream';
  } else if (body !== undefined) {
    payload = JSON.stringify(body);
    h['Content-Type'] = 'application/json';
  }
  const res = await fetch(base + url, { method, headers: h, body: payload });
  const json = await res.json().catch(() => null);
  return { status: res.status, body: json };
}

// Ikki restoran, xodimlar, kuryerlar, mijozlar va buyurtmalar.
// ID'lar: admin 900; R1 egasi 101, menejeri 102, kuryeri 103; R2 egasi 201, menejeri 202, kuryeri 203; mijozlar 301, 302.
export function seed(services) {
  const { users, restaurants, orders } = services;
  for (const id of [900, 101, 102, 103, 201, 202, 203, 301, 302]) users.upsertFromTelegram(tgUser(id));
  const admin = users.get(900);
  const r1 = restaurants.create(admin, { name: 'Restoran Bir', status: 'active' }).id;
  const r2 = restaurants.create(admin, { name: 'Restoran Ikki', status: 'active' }).id;
  restaurants.addStaff(r1, 101, 'owner', 900);
  restaurants.addStaff(r1, 102, 'manager', 101);
  restaurants.addStaff(r2, 201, 'owner', 900);
  restaurants.addStaff(r2, 202, 'manager', 201);
  const c1 = restaurants.addCourier(r1, { userId: 103, name: 'Kuryer Bir' });
  const c2 = restaurants.addCourier(r2, { userId: 203, name: 'Kuryer Ikki' });
  const p1 = restaurants.addProduct(r1, { name: 'Osh', price: 35000 });
  const p2 = restaurants.addProduct(r2, { name: 'Somsa', price: 8000 });
  restaurants.updatePayment(users.get(101), r1, { card_number: '8600 1234 5678 9012', card_holder: 'TEST OWNER' });

  const o1 = orders.createRecord(users.get(301), { restaurantId: r1, items: [{ productId: p1, qty: 2 }], deliveryFee: 5000 });
  const o2 = orders.createRecord(users.get(302), { restaurantId: r2, items: [{ productId: p2, qty: 3 }] });
  orders.assignCourierRaw(o1.id, c1);
  orders.assignCourierRaw(o2.id, c2);
  return { r1, r2, c1, c2, p1, p2, o1: o1.id, o2: o2.id };
}
