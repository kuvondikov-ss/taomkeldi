// Restoranni ulash arizasi (A yo'l): nom, telefon, tavsif, manzil, xaritadagi nuqta (Jizzax viloyati), oshxona turlari.
import { state } from '../state.js';
import { get, post, ApiError } from '../api.js';
import { t, getLang } from '../i18n.js';
import { icon } from '../../ui/icons.js';
import { toast, setLoading } from '../../ui/components.js';

const KEY = 'applyForm';
const load = () => { try { return JSON.parse(sessionStorage.getItem(KEY)) || {}; } catch { return {}; } };
const save = (f) => sessionStorage.setItem(KEY, JSON.stringify(f));

export async function renderApply(el, _p, _m, { go }) {
  const form = load();
  if (state.draft?.for === 'apply') { // xaritadan qaytdik
    form.lat = state.draft.lat;
    form.lon = state.draft.lon;
    if (!form.address_text && state.draft.text) form.address_text = state.draft.text;
    state.draft = null;
    save(form);
  }
  const [{ applications }, { cuisines }] = await Promise.all([get('/applications/mine'), get('/cuisines')]);
  const pending = applications.find((a) => a.status === 'pending');

  el.innerHTML = `
    <main class="page stack">
      <h1 class="h2">${t('apply_title')}</h1>
      ${applications.length ? `<section class="stack"><h2 class="label">${t('my_applications')}</h2><div class="list" id="mine"></div></section>` : ''}
      ${pending ? '' : `
      <p class="small text-2">${t('apply_intro')}</p>
      <form class="stack" id="form" novalidate>
        <div class="field"><label class="label" for="a-name">${t('f_rest_name')}</label><input class="input" id="a-name" name="name" maxlength="120" required></div>
        <div class="field"><label class="label" for="a-phone">${t('f_rest_phone')}</label><input class="input" id="a-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="+998 90 123 45 67"></div>
        <div class="field"><label class="label" for="a-desc">${t('f_desc')}</label><textarea class="textarea" id="a-desc" name="description" maxlength="1000"></textarea></div>
        <div class="field"><span class="label">${t('f_location')}</span>
          <button class="list-item card" type="button" id="pick">${icon('pin')}<span class="grow loc"></span><span class="small" style="color:var(--primary)">${t('choose_on_map')}</span></button>
          <span class="error-text" id="loc-err" hidden>${t('location_required')}</span></div>
        <div class="field"><label class="label" for="a-addr">${t('f_rest_addr')}</label><input class="input" id="a-addr" name="address_text" maxlength="300"></div>
        <div class="field"><span class="label">${t('f_cuisines')}</span><div class="wrap-chips" id="cuisines"></div></div>
        <div class="alert alert-danger" id="err" hidden></div>
        <button class="btn btn-primary btn-lg btn-block" id="submit" type="submit">${t('submit_application')}</button>
      </form>`}
    </main>`;

  const mine = el.querySelector('#mine');
  for (const a of applications) {
    const row = document.createElement('div');
    row.className = 'list-item';
    row.innerHTML = `${icon('store')}<span class="grow"><span class="h3 n"></span><span class="small text-2 s"></span></span>`;
    row.querySelector('.n').textContent = a.name;
    row.querySelector('.s').textContent = [t(`app_status_${a.status}`), a.status_reason && t('status_reason', { r: a.status_reason })].filter(Boolean).join(' · ');
    mine.append(row);
  }
  if (pending) return;

  const f = el.querySelector('#form');
  for (const k of ['name', 'phone', 'description', 'address_text']) if (form[k]) f.elements[k].value = form[k];
  if (!form.phone && state.me.user.phone) f.elements.phone.value = state.me.user.phone;
  const loc = el.querySelector('.loc');
  loc.textContent = form.lat ? `${form.lat.toFixed(5)}, ${form.lon.toFixed(5)}` : '—';
  form.cuisine_ids ||= [];
  const chips = el.querySelector('#cuisines');
  for (const c of cuisines) {
    const b = Object.assign(document.createElement('button'), { type: 'button', className: 'chip', textContent: getLang() === 'ru' ? c.name_ru : c.name_uz });
    b.setAttribute('aria-pressed', String(form.cuisine_ids.includes(c.id)));
    b.addEventListener('click', () => {
      const on = !form.cuisine_ids.includes(c.id);
      if (on && form.cuisine_ids.length >= 5) return;
      form.cuisine_ids = on ? [...form.cuisine_ids, c.id] : form.cuisine_ids.filter((x) => x !== c.id);
      b.setAttribute('aria-pressed', String(on));
      save(form);
    });
    chips.append(b);
  }
  const remember = () => { for (const k of ['name', 'phone', 'description', 'address_text']) form[k] = f.elements[k].value; save(form); };
  f.addEventListener('input', remember);
  el.querySelector('#pick').addEventListener('click', () => {
    remember();
    state.draft = form.lat ? { lat: form.lat, lon: form.lon, for: 'apply' } : null;
    go('address/pick?for=apply');
  });

  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    remember();
    el.querySelector('#loc-err').hidden = !!form.lat;
    if (!form.lat) return;
    const btn = el.querySelector('#submit');
    const err = el.querySelector('#err');
    err.hidden = true;
    setLoading(btn, true);
    try {
      await post('/applications', { ...form });
      sessionStorage.removeItem(KEY);
      toast(t('application_sent'), { type: 'success' });
      renderApply(el, _p, _m, { go });
    } catch (ex) {
      err.textContent = ex instanceof ApiError && ex.message ? ex.message : t('offline');
      err.hidden = false;
    } finally {
      setLoading(btn, false);
    }
  });
}
