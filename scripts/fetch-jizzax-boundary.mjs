// Jizzax VILOYATI (shahar emas) chegarasini OpenStreetMap Nominatim'dan olib, public/geo/jizzax.json ga yozadi.
// Bir martalik sozlash skripti: node scripts/fetch-jizzax-boundary.mjs
// Ma'lumot: © OpenStreetMap contributors, ODbL 1.0 — attribution faylning ichida saqlanadi.
import fs from 'node:fs';

const url = new URL('https://nominatim.openstreetmap.org/search');
url.search = new URLSearchParams({
  q: 'Jizzakh Region, Uzbekistan',
  format: 'jsonv2',
  polygon_geojson: '1',
  polygon_threshold: '0.0005', // ~50 m soddalashtirish
  limit: '5',
}).toString();

const res = await fetch(url, { headers: { 'User-Agent': 'geo-boundary-fetch/1.0', 'Accept-Language': 'en' } });
if (!res.ok) throw new Error(`Nominatim: HTTP ${res.status}`);
const results = await res.json();
for (const r of results) console.log(`- ${r.osm_type}/${r.osm_id} ${r.category}/${r.type} addresstype=${r.addresstype} "${r.display_name}" geom=${r.geojson?.type}`);

// Faqat viloyat (addresstype=state, boundary/administrative), shahar emas.
const region = results.find((r) => r.addresstype === 'state' && r.category === 'boundary' && /Polygon/.test(r.geojson?.type || ''));
if (!region) throw new Error('Viloyat chegarasi topilmadi');

const out = {
  type: 'Feature',
  properties: {
    name: 'Jizzax viloyati',
    name_ru: 'Джизакская область',
    osm: `${region.osm_type}/${region.osm_id}`,
    source: 'OpenStreetMap Nominatim, polygon_threshold=0.0005',
    attribution: '© OpenStreetMap contributors (ODbL 1.0)',
    fetched_at: new Date().toISOString().slice(0, 10),
    bbox: region.boundingbox.map(Number), // [minLat, maxLat, minLon, maxLon]
  },
  geometry: region.geojson,
};
fs.mkdirSync('public/geo', { recursive: true });
fs.writeFileSync('public/geo/jizzax.json', JSON.stringify(out));
const pts = JSON.stringify(region.geojson.coordinates).match(/\[/g).length;
console.log(`Saqlandi: public/geo/jizzax.json (${fs.statSync('public/geo/jizzax.json').size} bayt, ~${pts} nuqta)`);
