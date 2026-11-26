// Production API'ga platforma admini nomidan so'rov (admin CLI). Telegram initData lokal .env dagi BOT_TOKEN bilan
// ADMIN_CHAT_ID (yoki PLATFORM_ADMIN_IDS ning birinchisi) uchun imzolanadi — xuddi Mini App ochganda Telegram berganidek.
// Token va ID ekranga chiqarilmaydi. Faqat o'z serveringiz uchun.
//
//   node scripts/prod-admin.mjs GET /api/me
//   node scripts/prod-admin.mjs POST /api/admin/restaurants '{"name":"Taomkeldi"}'
//   PROD_URL=https://... node scripts/prod-admin.mjs ...
import fs from 'node:fs';
import { signInitData } from '../src/http/initData.js';

export function loadEnv(file = new URL('../.env', import.meta.url)) {
  const out = {};
  const text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return out;
}

export function adminClient({ base = process.env.PROD_URL || 'https://taomkeldi-production.up.railway.app' } = {}) {
  const env = loadEnv();
  const token = env.BOT_TOKEN;
  const adminId = Number(String(env.PLATFORM_ADMIN_IDS || env.ADMIN_CHAT_ID || '').split(',')[0]);
  if (!token || !adminId) throw new Error('.env da BOT_TOKEN va ADMIN_CHAT_ID (yoki PLATFORM_ADMIN_IDS) kerak');
  const initData = () => {
    const params = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), query_id: 'AAE-admin-cli', user: JSON.stringify({ id: adminId, first_name: 'Admin', language_code: 'uz' }) });
    params.set('hash', signInitData(params, token));
    return params.toString();
  };
  return async function call(method, path, body) {
    // Ulanish xatosida (javob kelmagan) 4 martagacha qayta urinadi; HTTP xatolari qayta yuborilmaydi.
    let res;
    for (let attempt = 1; ; attempt += 1) {
      try {
        res = await fetch(base + path, {
          method,
          // Buffer — fayl yuklash (rasm), aks holda JSON.
          headers: { Authorization: `tma ${initData()}`, ...(Buffer.isBuffer(body) ? { 'Content-Type': 'application/octet-stream' } : body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
          body: Buffer.isBuffer(body) ? body : body !== undefined ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(20_000),
        });
        break;
      } catch (e) {
        if (attempt >= 4) throw e;
        await new Promise((r) => setTimeout(r, 800 * attempt));
      }
    }
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const err = new Error(`${method} ${path} → ${res.status} ${json?.error?.code || ''} ${json?.error?.message || ''}`);
      err.status = res.status; err.body = json;
      throw err;
    }
    return json;
  };
}

if (process.argv[1]?.endsWith('prod-admin.mjs')) {
  const [method, path, body] = process.argv.slice(2);
  if (!method || !path) { console.error('Ishlatish: node scripts/prod-admin.mjs METHOD /api/... [json]'); process.exit(1); }
  adminClient()(method.toUpperCase(), path, body ? JSON.parse(body) : undefined)
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch((e) => { console.error(e.message); process.exit(1); });
}
