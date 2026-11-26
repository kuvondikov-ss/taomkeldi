// Restoran paneli — sozlamalar (ish holati: ega+menejer; ma'lumot, yetkazish, to'lov: faqat ega) va hisobot.
import { get, put, post, del, upload, ApiError } from '../api.js';
import { t, formatSum } from '../i18n.js';
import { icon } from '../../ui/icons.js';
import { toast, setLoading, confirmDialog } from '../../ui/components.js';
import { stateBlock } from './cards.js';
import { parseHours } from '../../shared/hours.js';

const errText = (e) => {
  if (!(e instanceof ApiError)) return t('offline');
  return [e.message, e.details?.field].filter(Boolean).join(' — ');
};
const num = (x) => (String(x).trim() === '' ? null : Number(String(x).replace(/\s/g, '').replace(',', '.')));

export async function renderPanelSettings(el, _p, rid) {
  let r;
  try { r = (await get(`/panel/restaurants/${rid}`)).restaurant; } catch (e) {
    el.innerHTML = '';
    el.append(stateBlock({ iconName: 'wifiOff', error: true, title: errText(e) }));
    return;
  }
  const owner = r.viewer_role === 'owner';
  const hours = parseHours(r.work_hours);
  const days = t('days_short').split(',');
  const dis = owner ? '' : 'disabled';

  el.innerHTML = `
    <form class="card" id="ops"><div class="card-body stack">
      <h3 class="h3">${t('ops_title')}</h3>
      <label class="row check-row"><span class="switch"><input type="checkbox" name="is_open" ${r.is_open ? 'checked' : ''}><span></span></span><span class="grow">${t('is_open_toggle')}</span></label>
      <label class="row check-row"><input type="checkbox" name="has_hours" ${hours ? 'checked' : ''}> ${t('set_schedule')}</label>
      <div class="grid-2 hours-box" style="gap:var(--sp-2)" ${hours ? '' : 'hidden'}>
        <div class="field"><label class="label">${t('open_time')}</label><input class="input" type="time" name="open" value="${hours?.open || '09:00'}"></div>
        <div class="field"><label class="label">${t('close_time')}</label><input class="input" type="time" name="close" value="${hours?.close || '23:00'}"></div>
      </div>
      <div class="field hours-box" ${hours ? '' : 'hidden'}><span class="label">${t('days_off')}</span><div class="wrap-chips" id="days">${days.map((d, i) => `<button type="button" class="chip" data-day="${i}" aria-pressed="${hours?.days_off.includes(i) || false}">${d}</button>`).join('')}</div></div>
      <div class="field"><label class="label">${t('prep_default')}</label><input class="input" name="prep_minutes" inputmode="numeric" value="${r.prep_minutes}"></div>
      <label class="row check-row"><input type="checkbox" name="auto_dispatch" ${r.auto_dispatch ? 'checked' : ''}> ${t('auto_dispatch')}</label>
      <button class="btn btn-primary" type="submit">${t('save')}</button>
    </div></form>

    <form class="card" id="profile"><div class="card-body stack">
      <h3 class="h3">${t('rest_profile_title')}</h3>
      ${owner ? '' : `<div class="alert">${icon('info')}<span>${t('owner_only_note')}</span></div>`}
      <div class="photo-row"><span class="thumb big" id="cover-ph"></span><label class="btn btn-secondary ${owner ? '' : 'is-disabled'}">${t('f_cover')}<input type="file" accept="image/jpeg,image/png,image/webp" hidden ${dis} id="cover"></label></div>
      <div class="field"><label class="label">${t('f_rest_name')}</label><input class="input" name="name" ${dis}></div>
      <div class="field"><label class="label">${t('f_rest_phone')}</label><input class="input" name="phone" type="tel" inputmode="tel" ${dis}></div>
      <div class="field"><label class="label">${t('f_rest_addr')}</label><input class="input" name="address_text" ${dis}></div>
      <div class="field"><label class="label">${t('f_desc')}</label><textarea class="textarea" name="description" ${dis}></textarea></div>
      <h3 class="h3">${t('delivery_title')}</h3>
      <div class="grid-2" style="gap:var(--sp-2)">
        <div class="field"><label class="label">${t('f_base')}</label><input class="input" name="delivery_base" inputmode="numeric" ${dis}></div>
        <div class="field"><label class="label">${t('f_base_km')}</label><input class="input" name="base_km" inputmode="decimal" ${dis}></div>
        <div class="field"><label class="label">${t('f_per_km')}</label><input class="input" name="delivery_per_km" inputmode="numeric" ${dis}></div>
        <div class="field"><label class="label">${t('f_radius_km')}</label><input class="input" name="radius_km" inputmode="decimal" ${dis}></div>
        <div class="field"><label class="label">${t('f_min_order')}</label><input class="input" name="min_order" inputmode="numeric" ${dis}></div>
        <div class="field"><label class="label">${t('f_free_from')}</label><input class="input" name="free_delivery_from" inputmode="numeric" ${dis}></div>
      </div>
      <div class="free-preview" id="free-preview" aria-live="polite"></div>
      <label class="row check-row"><input type="checkbox" name="pickup_enabled" ${r.pickup_enabled ? 'checked' : ''} ${dis}> ${t('f_pickup')}</label>
      ${owner ? `<button class="btn btn-primary" type="submit">${t('save')}</button>` : ''}
    </div></form>

    <form class="card" id="payments"><div class="card-body stack">
      <h3 class="h3">${t('payments_title')}</h3>
      <label class="row check-row"><input type="checkbox" name="cash" ${r.pay_cash ? 'checked' : ''} ${dis}> ${t('pm_cash')}</label>
      <label class="row check-row"><input type="checkbox" name="card_transfer" ${r.pay_card_transfer ? 'checked' : ''} ${dis}> ${t('pm_card')}</label>
      <label class="row check-row"><input type="checkbox" name="online" ${r.pay_online ? 'checked' : ''} ${dis}> ${t('pm_online')}</label>
      <h3 class="label">${t('card_title')}</h3>
      <div class="field"><label class="label">${t('f_card_no')}</label><input class="input mono" name="card_number" inputmode="numeric" ${dis}></div>
      <div class="field"><label class="label">${t('f_card_holder')}</label><input class="input" name="card_holder" ${dis}></div>
      ${owner ? `<button class="btn btn-primary" type="submit">${t('save')}</button>` : ''}
    </div></form>

    <div class="card" id="group-card"><div class="card-body stack">
      <h3 class="h3">${t('group_title')}</h3>
      <div class="stack" id="group-box"><p class="small text-2">…</p></div>
    </div></div>`;
  renderGroupBox(el.querySelector('#group-box'), rid);

  const P = el.querySelector('#profile');
  const set = (name, val) => { if (P.elements[name]) P.elements[name].value = val ?? ''; };
  set('name', r.name); set('phone', r.phone); set('address_text', r.address_text); set('description', r.description);
  set('delivery_base', r.delivery_base); set('base_km', r.delivery_base_m / 1000); set('delivery_per_km', r.delivery_per_km);
  set('radius_km', r.delivery_radius_m / 1000); set('min_order', r.min_order); set('free_delivery_from', r.free_delivery_from);
  // Bepul yetkazish: mijoz nimani ko'rishini oldindan ko'rsatish (server bilan bir xil qoida — geo-core.freeDeliveryInfo).
  const drawFreePreview = () => {
    const base = num(P.elements.delivery_base.value) || 0;
    const perKm = num(P.elements.delivery_per_km.value) || 0;
    const from = num(P.elements.free_delivery_from.value) || 0;
    const min = num(P.elements.min_order.value) || 0;
    const lines = [];
    if (base === 0 && perKm === 0) lines.push(min ? t('fp_always_min', { min: formatSum(min) }) : t('fp_always'));
    else if (from > 0) {
      lines.push(t('fp_threshold', { sum: formatSum(from) }));
      lines.push(t('fp_threshold_cart', { sum: formatSum(from) }));
      if (min && from <= min) lines.push(t('fp_below_min'));
    } else lines.push(t('fp_none'));
    lines.push(t('fp_cost_note'));
    el.querySelector('#free-preview').innerHTML = `<p class="label">${t('fp_title')}</p>${lines.map((x, i) => `<p class="small ${i === lines.length - 1 ? 'text-2' : ''}"></p>`).join('')}`;
    el.querySelectorAll('#free-preview p.small').forEach((p, i) => { p.textContent = lines[i]; });
  };
  ['delivery_base', 'delivery_per_km', 'free_delivery_from', 'min_order'].forEach((n) => P.elements[n]?.addEventListener('input', drawFreePreview));
  drawFreePreview();
  const PM = el.querySelector('#payments');
  PM.elements.card_number.value = r.card_number || '';
  PM.elements.card_holder.value = r.card_holder || '';
  let cover = r.cover_path;
  const drawCover = () => { el.querySelector('#cover-ph').innerHTML = cover ? `<img alt="" src="${cover}">` : icon('store'); };
  drawCover();
  el.querySelector('#cover')?.addEventListener('change', async (ev) => {
    const f = ev.target.files[0];
    if (!f) return;
    try { cover = (await upload(`/panel/restaurants/${rid}/uploads`, f)).file.path; drawCover(); } catch (e) { toast(errText(e), { type: 'error' }); }
  });

  // Ish holati (ega + menejer)
  const O = el.querySelector('#ops');
  O.elements.has_hours.addEventListener('change', () => O.querySelectorAll('.hours-box').forEach((b) => { b.hidden = !O.elements.has_hours.checked; }));
  O.querySelector('#days').addEventListener('click', (e) => {
    const c = e.target.closest('[data-day]');
    if (c) c.setAttribute('aria-pressed', String(c.getAttribute('aria-pressed') !== 'true'));
  });
  const submit = (form, fn) => form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const b = form.querySelector('[type=submit]');
    setLoading(b, true);
    try { await fn(); toast(t('saved_ok'), { type: 'success' }); } catch (ex) { toast(errText(ex), { type: 'error', timeout: 5000 }); } finally { setLoading(b, false); }
  });
  submit(O, () => put(`/panel/restaurants/${rid}/operations`, {
    is_open: O.elements.is_open.checked,
    auto_dispatch: O.elements.auto_dispatch.checked,
    prep_minutes: num(O.elements.prep_minutes.value),
    work_hours: O.elements.has_hours.checked ? {
      open: O.elements.open.value, close: O.elements.close.value,
      days_off: [...O.querySelectorAll('[data-day][aria-pressed="true"]')].map((c) => Number(c.dataset.day)),
    } : null,
  }));
  if (owner) {
    submit(P, () => put(`/panel/restaurants/${rid}/profile`, {
      name: P.elements.name.value, phone: P.elements.phone.value || null, address_text: P.elements.address_text.value || null,
      description: P.elements.description.value || null, cover_path: cover,
      delivery_base: num(P.elements.delivery_base.value), delivery_base_m: Math.round(num(P.elements.base_km.value) * 1000),
      delivery_per_km: num(P.elements.delivery_per_km.value), delivery_radius_m: Math.round(num(P.elements.radius_km.value) * 1000),
      min_order: num(P.elements.min_order.value), free_delivery_from: num(P.elements.free_delivery_from.value), pickup_enabled: P.elements.pickup_enabled.checked,
    }));
    submit(PM, async () => {
      const card = PM.elements.card_number.value.replace(/\D/g, '');
      if (card && !card.includes('*') && PM.elements.card_holder.value) await put(`/panel/restaurants/${rid}/payment`, { card_number: card, card_holder: PM.elements.card_holder.value });
      await put(`/panel/restaurants/${rid}/payment-methods`, { cash: PM.elements.cash.checked, card_transfer: PM.elements.card_transfer.checked, online: PM.elements.online.checked });
    });
  }
}

// Telegram guruhi: holat, tekshirish, sinov xabari (faqat aniq bosilganda), uzish. Ulash — guruhda /bogla.
async function renderGroupBox(box, rid) {
  let g;
  try { g = (await get(`/panel/restaurants/${rid}/group`)).group; } catch (e) {
    box.innerHTML = `<p class="small text-2"></p>`;
    box.firstChild.textContent = errText(e);
    return;
  }
  const draw = (state) => {
    g = state;
    if (!g.linked) {
      const add = g.bot_username ? `https://t.me/${g.bot_username}?startgroup=bogla` : null;
      box.innerHTML = `
        <p class="small text-2">${t('group_not_linked')}</p>
        <ol class="small group-steps"><li>${t('group_step1')}</li><li>${t('group_step2')}</li><li>${t('group_step3')}</li></ol>
        ${add ? `<a class="btn btn-secondary" id="g-add" href="${add}" target="_blank" rel="noopener">${t('group_add_bot')}</a>` : ''}`;
      box.querySelector('#g-add')?.addEventListener('click', (ev) => {
        const tg = window.Telegram?.WebApp;
        if (tg?.openTelegramLink) { ev.preventDefault(); tg.openTelegramLink(add); }
      });
      return;
    }
    const tone = { active: 'success', removed: 'danger', no_rights: 'warning' }[g.status] || '';
    box.innerHTML = `
      <div class="row"><span class="badge ${tone ? `badge-${tone}` : ''}">${t(`group_st_${g.status}`)}</span><b class="grow" id="g-title"></b></div>
      ${g.thread_id ? `<p class="small text-2">${t('group_topic')}</p>` : ''}
      ${g.status !== 'active' ? `<p class="small text-2">${t(`group_hint_${g.status}`)}</p>` : ''}
      ${g.error ? `<p class="small text-2" id="g-err"></p>` : ''}
      <div class="group-actions">
        <button class="btn btn-secondary" id="g-check" type="button">${t('group_check')}</button>
        <button class="btn btn-secondary" id="g-test" type="button">${t('group_test')}</button>
        <button class="btn btn-ghost group-unlink" id="g-unlink" type="button">${t('group_unlink')}</button>
      </div>`;
    box.querySelector('#g-title').textContent = g.title || String(g.chat_id);
    if (g.error) box.querySelector('#g-err').textContent = `${t('group_last_error')}: ${g.error === 'topic_deleted' ? t('group_topic_deleted') : g.error}`;
    const act = (id, fn, okText) => box.querySelector(id).addEventListener('click', async (ev) => {
      const b = ev.currentTarget;
      setLoading(b, true);
      try {
        const res = await fn();
        if (res) draw(res.group);
        if (okText) toast(okText, { type: 'success' });
      } catch (ex) {
        if (ex.details?.group) draw(ex.details.group);
        const reason = ex.details?.reason;
        toast(reason && t(`group_err_${reason}`) !== `group_err_${reason}` ? t(`group_err_${reason}`) : errText(ex), { type: 'error', timeout: 5000 });
      } finally { if (b.isConnected) setLoading(b, false); }
    });
    act('#g-check', () => post(`/panel/restaurants/${rid}/group/check`), null);
    act('#g-test', () => post(`/panel/restaurants/${rid}/group/test`), t('group_test_sent'));
    box.querySelector('#g-unlink').addEventListener('click', async () => {
      const ok = await confirmDialog({ title: t('group_unlink_q'), text: t('group_unlink_text'), confirm: t('group_unlink'), cancel: t('cancel'), danger: true });
      if (!ok) return;
      try { draw((await del(`/panel/restaurants/${rid}/group`)).group); toast(t('saved_ok'), { type: 'success' }); } catch (ex) { toast(errText(ex), { type: 'error' }); }
    });
  };
  draw(g);
}

export async function renderPanelReport(el, _p, rid) {
  let r;
  try { r = (await get(`/panel/restaurants/${rid}/report`)).report; } catch (e) {
    el.innerHTML = '';
    el.append(stateBlock({ iconName: 'wifiOff', error: true, title: errText(e) }));
    return;
  }
  const block = (title, x) => `<div class="card"><div class="card-body stack" style="gap:var(--sp-2)"><h3 class="h3">${title}</h3>
    <div class="metrics">
      <div class="metric"><span class="metric-value">${x.orders}</span><span class="xs text-2">${t('rep_orders')}</span></div>
      <div class="metric"><span class="metric-value">${x.delivered}</span><span class="xs text-2">${t('rep_delivered')}</span></div>
      <div class="metric"><span class="metric-value">${formatSum(x.revenue)}</span><span class="xs text-2">${t('rep_revenue')}</span></div>
      <div class="metric"><span class="metric-value">${formatSum(x.average)}</span><span class="xs text-2">${t('rep_avg')}</span></div>
    </div>
    <div class="row sum-row small"><span>${t('fin_items')}</span><span>${formatSum(x.food_revenue)}</span></div>
    <div class="row sum-row small"><span>${t('fin_delivery_fees')}</span><span>${formatSum(x.delivery_revenue)}</span></div>
    <div class="row sum-row small"><span>${t('rep_cash')}</span><span>${formatSum(x.cash)}</span></div>
    <div class="row sum-row small"><span>${t('rep_prepaid')}</span><span>${formatSum(x.prepaid)}</span></div>
    <div class="row sum-row small"><span>${t('rep_free_deliveries')}</span><span>${x.free_deliveries ?? 0}</span></div>
    <div class="row sum-row small text-2"><span>${t('rep_cancelled')}</span><span>${x.cancelled}</span></div>
  </div></div>`;
  const max = Math.max(1, ...r.days.map((d) => d.revenue));
  el.innerHTML = `
    <div class="alert">${icon('info')}<span>${t('rep_revenue_note')}</span></div>
    ${block(t('rep_today'), r.today)}
    ${block(t('rep_week'), r.week)}
    <div class="card"><div class="card-body stack"><h3 class="h3">${t('rep_by_day')}</h3>
      <div class="bars">${r.days.map((d) => `<div class="bar-row"><span class="xs text-2">${d.date.slice(5)}</span><span class="bar"><span style="width:${(d.revenue / max) * 100}%"></span></span><span class="xs">${formatSum(d.revenue)}</span></div>`).join('')}</div>
    </div></div>
    <div class="card"><div class="card-body stack"><h3 class="h3">${t('rep_popular')}</h3>
      ${r.popular.length ? `<div class="list">${r.popular.map((p) => `<div class="list-item"><span class="grow pn"></span><span class="small text-2">× ${p.qty}</span><span class="price">${formatSum(p.total)}</span></div>`).join('')}</div>` : `<p class="small text-2">${t('no_items')}</p>`}
    </div></div>`;
  el.querySelectorAll('.pn').forEach((n, i) => { n.textContent = r.popular[i].name; });
}
