// Ilova holati (bitta joyda).
import { get } from './api.js';

export const state = {
  me: null,        // { user, roles }
  config: null,    // /api/config
  region: null,    // /geo/jizzax.json (server bilan bir xil fayl)
  addresses: [],
  draft: null,     // xaritada tanlangan, hali saqlanmagan nuqta: { lat, lon, text, for }
};

// Joriy yetkazish manzili: asosiy va hudud ichidagi manzil.
export const currentAddress = () => state.addresses.find((a) => a.is_default && a.in_service_area) || null;

export async function reloadAddresses() {
  state.addresses = (await get('/addresses')).addresses;
  return state.addresses;
}
