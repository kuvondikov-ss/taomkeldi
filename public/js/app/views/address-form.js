// Manzil tafsilotlari: nomi, matni, podyezd/qavat/xonadon, izoh. Nuqta xaritadan (picker) keladi.
import { state, reloadAddresses } from '../state.js';
import { post, put, ApiError } from '../api.js';
import { t } from '../i18n.js';
import { toast, setLoading } from '../../ui/components.js';
import { icon } from '../../ui/icons.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function renderAddressForm(el, addressId, params, { go }) {
  const existing = addressId ? state.addresses.find((a) => a.id === addressId) : null;
  if (addressId && !existing) return go('addresses', { replace: true });
  const forKey = addressId ? String(addressId) : 'new';
  const draft = state.draft?.for === forKey ? state.draft : null;
  if (!existing && !draft) return go('address/pick', { replace: true });

  const point = draft ? { lat: draft.lat, lon: draft.lon } : { lat: existing.lat, lon: existing.lon };
  const data = { ...(existing || {}), text: draft?.text || existing?.text || '' };
  const back = params.get('back');

  el.innerHTML = `
    <main class="page stack">
      <h1 class="h2">${t(existing ? 'form_title_edit' : 'form_title_new')}</h1>
      <div class="list">
        <div class="list-item" style="cursor:default">${icon('pin')}
          <span class="grow"><span class="small text-2">${t('f_point')}</span><br><span class="nowrap">${point.lat.toFixed(5)}, ${point.lon.toFixed(5)}</span></span>
          <button class="btn btn-ghost small" type="button" id="change-point">${t('f_change_point')}</button>
        </div>
      </div>
      <form class="stack" id="form" novalidate>
        <div class="field">
          <span class="label">${t('f_label')}</span>
          <div class="chip-row" id="label-chips">
            <button type="button" class="chip" data-label="${esc(t('f_label_home'))}">${t('f_label_home')}</button>
            <button type="button" class="chip" data-label="${esc(t('f_label_work'))}">${t('f_label_work')}</button>
          </div>
          <input class="input" name="label" maxlength="40" value="${esc(data.label)}" aria-label="${t('f_label')}">
        </div>
        <div class="field">
          <label class="label" for="f-text">${t('f_text')}</label>
          <textarea class="textarea" id="f-text" name="text" maxlength="300" required placeholder="${t('f_text_hint')}">${esc(data.text)}</textarea>
          <span class="error-text" id="text-err" hidden></span>
        </div>
        <div class="grid-3">
          <div class="field"><label class="label" for="f-ent">${t('f_entrance')}</label><input class="input" id="f-ent" name="entrance" maxlength="20" inputmode="numeric" value="${esc(data.entrance)}"></div>
          <div class="field"><label class="label" for="f-floor">${t('f_floor')}</label><input class="input" id="f-floor" name="floor" maxlength="20" inputmode="numeric" value="${esc(data.floor)}"></div>
          <div class="field"><label class="label" for="f-apt">${t('f_apartment')}</label><input class="input" id="f-apt" name="apartment" maxlength="20" value="${esc(data.apartment)}"></div>
        </div>
        <div class="field">
          <label class="label" for="f-comment">${t('f_comment')}</label>
          <input class="input" id="f-comment" name="comment" maxlength="300" placeholder="${t('f_comment_ph')}" value="${esc(data.comment)}">
        </div>
        <div class="alert alert-danger" id="form-err" hidden></div>
        <button class="btn btn-primary btn-lg btn-block" id="save" type="submit">${t('save')}</button>
      </form>
    </main>`;

  const form = el.querySelector('#form');
  const labelInput = form.elements.label;
  const syncChips = () => el.querySelectorAll('#label-chips .chip').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.label === labelInput.value)));
  el.querySelector('#label-chips').addEventListener('click', (e) => {
    const c = e.target.closest('.chip');
    if (!c) return;
    labelInput.value = c.dataset.label;
    syncChips();
  });
  labelInput.addEventListener('input', syncChips);
  syncChips();

  el.querySelector('#change-point').addEventListener('click', () => {
    state.draft = { ...point, text: form.elements.text.value, for: forKey };
    go(`address/pick?for=${forKey}`);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const textErr = el.querySelector('#text-err');
    const formErr = el.querySelector('#form-err');
    textErr.hidden = true;
    formErr.hidden = true;
    const body = Object.fromEntries(['label', 'text', 'entrance', 'floor', 'apartment', 'comment'].map((k) => [k, form.elements[k].value.trim() || null]));
    if (!body.text) {
      textErr.textContent = t('f_text_hint');
      textErr.hidden = false;
      form.elements.text.setAttribute('aria-invalid', 'true');
      return form.elements.text.focus();
    }
    Object.assign(body, point);
    const btn = el.querySelector('#save');
    setLoading(btn, true);
    try {
      if (existing) await put(`/addresses/${existing.id}`, body);
      else await post('/addresses', { ...body, is_default: true });
      state.draft = null;
      await reloadAddresses();
      toast(t('saved'), { type: 'success' });
      go(back === 'addresses' ? 'addresses' : '', { replace: true });
    } catch (err) {
      formErr.textContent = err instanceof ApiError && err.message ? err.message : t('offline');
      formErr.hidden = false;
    } finally {
      setLoading(btn, false);
    }
  });
}
