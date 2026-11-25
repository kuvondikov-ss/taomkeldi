// Manzil qidiruvi va koordinatadan manzil matni (OpenStreetMap Nominatim orqali, server proksi).
// Nominatim foydalanish qoidalari: soniyasiga ko'pi bilan 1 so'rov, keshlash, aniq User-Agent,
// avtomatik to'ldirish (har harfda so'rov) taqiqlangan — Mini App faqat "Qidirish" bosilganda so'raydi.
// Natijalar faqat Jizzax viloyati ichidagilar bilan cheklanadi.
import { AppError } from '../lib/errors.js';
import * as v from '../lib/validate.js';

const CACHE_MAX = 500;

export function createGeocoderService(config, geo, { fetchImpl = globalThis.fetch } = {}) {
  const cache = new Map();
  let chain = Promise.resolve();
  let lastAt = 0;

  // So'rovlarni ketma-ket, kamida 1 soniya oraliq bilan yuborish.
  function throttled(fn) {
    const run = chain.then(async () => {
      const wait = lastAt + 1100 - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      lastAt = Date.now();
      return fn();
    });
    chain = run.catch(() => {});
    return run;
  }

  async function request(path, params, lang) {
    const key = `${path}?${new URLSearchParams(params)}&l=${lang}`;
    if (cache.has(key)) return cache.get(key);
    if (!config.geocoder.enabled) throw new AppError('GEOCODER_UNAVAILABLE');
    const url = `${config.geocoder.url}${path}?${new URLSearchParams({ ...params, format: 'jsonv2' })}`;
    let data;
    try {
      data = await throttled(async () => {
        const res = await fetchImpl(url, {
          headers: { 'User-Agent': config.geocoder.userAgent, 'Accept-Language': lang === 'ru' ? 'ru' : 'uz,ru' },
          signal: AbortSignal.timeout(6000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      });
    } catch {
      throw new AppError('GEOCODER_UNAVAILABLE');
    }
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
    cache.set(key, data);
    return data;
  }

  async function search(q, lang = 'uz') {
    const query = v.str(q, 'q', { min: 3, max: 120 });
    const [minLat, maxLat, minLon, maxLon] = geo.region.properties.bbox;
    const rows = await request('/search', {
      q: query, countrycodes: 'uz', limit: '10', bounded: '1',
      viewbox: `${minLon},${maxLat},${maxLon},${minLat}`,
    }, lang);
    return (Array.isArray(rows) ? rows : [])
      .map((r) => ({ text: r.display_name, lat: Number(r.lat), lon: Number(r.lon) }))
      .filter((r) => geo.isInServiceArea(r.lat, r.lon))
      .slice(0, 6);
  }

  async function reverse(latIn, lonIn, lang = 'uz') {
    const { lat, lon } = geo.requireServiceArea(latIn, lonIn);
    const r = await request('/reverse', { lat: lat.toFixed(5), lon: lon.toFixed(5), zoom: '18', addressdetails: '0' }, lang);
    return { text: r?.display_name || null, lat, lon };
  }

  return { search, reverse };
}
