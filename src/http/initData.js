// Telegram Mini App initData tekshiruvi (rasmiy algoritm):
//   secret_key = HMAC_SHA256(key = "WebAppData", data = bot_token)
//   data_check_string = hash'dan boshqa barcha maydonlar, kalit bo'yicha alifbo tartibida, "key=value", "\n" bilan
//   hex(HMAC_SHA256(key = secret_key, data = data_check_string)) === hash
// Qo'shimcha: auth_date eskirmaganini va kelajakda emasligini tekshiramiz.
// Klientdagi initDataUnsafe yoki user_id'ga hech qachon ishonilmaydi.
import crypto from 'node:crypto';

const FUTURE_SKEW_SEC = 60;

export class InitDataError extends Error {
  constructor(code) {
    super(code);
    this.code = code; // AUTH_INVALID | AUTH_EXPIRED
  }
}

function dataCheckString(params) {
  return [...params.entries()]
    .filter(([k]) => k !== 'hash')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, val]) => `${k}=${val}`)
    .join('\n');
}

export function signInitData(params, botToken) {
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  return crypto.createHmac('sha256', secret).update(dataCheckString(params)).digest('hex');
}

export function validateInitData(initData, botToken, { maxAgeSec, nowSec = Math.floor(Date.now() / 1000) }) {
  if (typeof initData !== 'string' || initData.length === 0 || initData.length > 4096 || !botToken) {
    throw new InitDataError('AUTH_INVALID');
  }
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash || !/^[0-9a-f]{64}$/.test(hash) || params.getAll('hash').length !== 1) {
    throw new InitDataError('AUTH_INVALID');
  }
  const expected = Buffer.from(signInitData(params, botToken), 'hex');
  if (!crypto.timingSafeEqual(expected, Buffer.from(hash, 'hex'))) throw new InitDataError('AUTH_INVALID');

  const authDate = Number(params.get('auth_date'));
  if (!Number.isInteger(authDate) || authDate <= 0) throw new InitDataError('AUTH_INVALID');
  if (authDate > nowSec + FUTURE_SKEW_SEC) throw new InitDataError('AUTH_INVALID');
  if (nowSec - authDate > maxAgeSec) throw new InitDataError('AUTH_EXPIRED');

  let user;
  try {
    user = JSON.parse(params.get('user') || 'null');
  } catch {
    throw new InitDataError('AUTH_INVALID');
  }
  if (!user || !Number.isSafeInteger(user.id) || user.id <= 0) throw new InitDataError('AUTH_INVALID');
  return { user, authDate, queryId: params.get('query_id'), startParam: params.get('start_param') };
}
