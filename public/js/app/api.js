// API so'rovlari. Telegram ichida: Authorization: tma <initData>.
// Lokal ishlab chiqish (Telegram'siz): ?dev=<id> — server DEV_AUTH=1 bo'lsagina qabul qiladi.
const tg = window.Telegram?.WebApp;
const params = new URLSearchParams(location.search);
if (params.get('dev')) sessionStorage.setItem('devUser', params.get('dev'));
const devUser = sessionStorage.getItem('devUser');

export const inTelegram = () => !!tg?.initData;
export const canAuth = () => inTelegram() || !!devUser;

export class ApiError extends Error {
  constructor(code, message, status) { super(message); this.code = code; this.status = status; }
}

export async function api(method, path, body) {
  const headers = {};
  if (inTelegram()) headers.Authorization = `tma ${tg.initData}`;
  else if (devUser) headers['X-Dev-User'] = devUser;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetch(`/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError('NETWORK', '', 0);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) throw new ApiError(data?.error?.code || 'INTERNAL', data?.error?.message || '', res.status);
  return data;
}

export const get = (p) => api('GET', p);
export const post = (p, b) => api('POST', p, b ?? {});
export const put = (p, b) => api('PUT', p, b ?? {});
export const del = (p) => api('DELETE', p);
