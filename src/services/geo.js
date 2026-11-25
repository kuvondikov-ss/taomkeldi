// Xizmat hududi (Jizzax viloyati) va yetkazish hisobi.
// Chegara fayli va hisoblash kodi Mini App bilan umumiy: public/geo/jizzax.json, public/js/shared/geo-core.js
import fs from 'node:fs';
import { AppError } from '../lib/errors.js';
import * as v from '../lib/validate.js';
import { pointInGeometry, distanceMeters, deliveryFee, DISTANCE_METHOD } from '../../public/js/shared/geo-core.js';

const REGION = JSON.parse(fs.readFileSync(new URL('../../public/geo/jizzax.json', import.meta.url), 'utf8'));

export function createGeoService() {
  function isInServiceArea(lat, lon) {
    return pointInGeometry(REGION.geometry, lat, lon);
  }

  // Koordinatani tekshiradi; hududdan tashqarida bo'lsa OUT_OF_AREA (422).
  function requireServiceArea(latIn, lonIn) {
    const lat = v.coord(latIn, 'lat', 'lat');
    const lon = v.coord(lonIn, 'lon', 'lon');
    if (!isInServiceArea(lat, lon)) throw new AppError('OUT_OF_AREA', { details: { lat, lon } });
    return { lat, lon };
  }

  // Restoran shu nuqtaga yetkaza oladimi va qancha turadi. Bitta hisob — ro'yxat, restoran, checkout uchun.
  function deliveryFor(restaurant, point) {
    if (restaurant.lat == null || restaurant.lon == null) {
      return { deliverable: false, reason: 'no_location', distance_m: null, delivery_fee: null, distance_method: DISTANCE_METHOD };
    }
    const d = distanceMeters(restaurant.lat, restaurant.lon, point.lat, point.lon);
    const inRadius = d <= restaurant.delivery_radius_m;
    return {
      deliverable: inRadius,
      reason: inRadius ? null : 'out_of_radius',
      distance_m: d,
      distance_method: DISTANCE_METHOD,
      delivery_fee: inRadius ? deliveryFee(restaurant, d) : null,
    };
  }

  return { isInServiceArea, requireServiceArea, deliveryFor, region: REGION };
}
