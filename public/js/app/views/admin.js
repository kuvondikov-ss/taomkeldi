// Platforma boshqaruvi: ko'rsatkichlar, arizalar (tasdiq/rad), restoranlar (bloklash, egasiga havola), yangi restoran, demo tozalash.
import { state } from '../state.js';
import { get, post, ApiError } from '../api.js';
import { t, formatSum } from '../i18n.js';
import { icon } from '../../ui/icons.js';
import { toast, confirmDialog, promptDialog, setLoading } from '../../ui/components.js';
import { stateBlock } from './cards.js';

const errText = (e) => (e instanceof ApiError && e.message ? e.message : t('offline'));

export async function renderAdmin(el, params, _m, { go }) {
  if (!state.me.roles.platformAdmin) {
    el.innerHTML = '<main class="page"></main>';
    el.firstChild.append(stateBlock({ iconName: 'info', title: t('no_access') || '—' }));
    return;
  }
  const tab = ['applications', 'restaurants', 'new'].includes(params.get('tab')) ? params.get('tab') : 'applications';
  el.innerHTML = `
    <main class="page stack">
      <h1 class="h2">${t('admin_title')}</h1>
      <div class="metrics" id="metrics"><div class="skeleton skeleton-text"></div></div>
      <div class="tabs" role="tablist">
        ${['applications', 'restaurants', 'new'].map((k) => `<button class="tab" role="tab" data-tab="${k}" aria-selected="${tab === k}">${t(`tab_${k}`)}</button>`).join('')}
      </div>
      <div id="body" class="stack"></div>
      <button class="btn btn-ghost" id="demo">${icon('trash', { className: 'icon-sm' })}${t('demo_delete')}</button>
    </main>`;
  el.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => go(`admin?tab=${b.dataset.tab}`, { replace: true })));

  // --- Ko'rsatkichlar ---
  try {
    const { overview: o } = await get('/admin/overview');
    const m = [
      ['m_active', o.restaurants.active], ['m_pending', o.restaurants.pending], ['m_blocked', o.restaurants.blocked],
      ['m_orders_today', o.today.orders], ['m_in_progress', o.today.in_progress], ['m_delivered_sum', formatSum(o.today.delivered_total)],
      ['m_couriers', o.couriers_online], ['m_users', o.users],
      // Bot xabarlari navbati: kutilayotgan va yuborilmay qolgan (qayta urinishlardan keyin).
      ...(o.notifications ? [['m_msg_pending', o.notifications.pending], ['m_msg_failed', o.notifications.failed]] : []),
    ];
    el.querySelector('#metrics').innerHTML = m.map(([k, val]) => `<div class="metric"><span class="metric-value">${val}</span><span class="xs text-2">${t(k)}</span></div>`).join('');
  } catch (e) {
    el.querySelector('#metrics').textContent = errText(e);
  }

  const body = el.querySelector('#body');
  const refresh = () => renderAdmin(el, params, _m, { go });

  // --- Demo tozalash: alohida, tasdiqli amal ---
  el.querySelector('#demo').addEventListener('click', async () => {
    const typed = await promptDialog({ title: t('demo_delete'), label: t('demo_delete_text'), confirm: t('delete'), cancel: t('cancel'), danger: true, placeholder: 'DEMO' });
    if (typed == null) return;
    try {
      const { deleted } = await post('/admin/demo/delete', { confirm: typed });
      toast(t('deleted_n', { r: deleted.restaurants, o: deleted.orders }), { type: 'success' });
      refresh();
    } catch (e) { toast(errText(e), { type: 'error' }); }
  });

  if (tab === 'new') return drawNew(body, go);

  const status = tab === 'applications' ? 'pending' : undefined;
  let list;
  try {
    list = (await get(`/admin/restaurants/list${status ? `?status=${status}` : ''}`)).restaurants;
  } catch (e) {
    body.append(stateBlock({ iconName: 'wifiOff', error: true, title: errText(e) }));
    return;
  }
  if (tab === 'restaurants') list = list.filter((r) => r.status !== 'pending');
  if (!list.length) body.append(stateBlock({ iconName: tab === 'applications' ? 'receipt' : 'store', title: t('no_items') }));

  for (const r of list) {
    const card = document.createElement('article');
    card.className = 'card';
    card.innerHTML = `<div class="card-body stack" style="gap:var(--sp-2)">
      <div class="row" style="justify-content:space-between;align-items:flex-start">
        <span class="h3 name"></span>
        <span class="row" style="gap:4px">${r.is_demo ? `<span class="badge">${t('demo_badge')}</span>` : ''}<span class="badge ${r.status === 'active' ? 'badge-success' : r.status === 'pending' ? 'badge-warning' : 'badge-danger'}">${t(`rs_${r.status}`)}</span></span>
      </div>
      <span class="small text-2 meta"></span>
      ${r.status_reason ? '<span class="small reason"></span>' : ''}
      <div class="row actions" style="flex-wrap:wrap;gap:var(--sp-2)"></div>
    </div>`;
    card.querySelector('.name').textContent = r.name;
    card.querySelector('.meta').textContent = [
      r.phone, r.cuisines.join(', '), r.address_text,
      r.applicant_id && `${t('applicant')}: ${r.applicant_name || ''}${r.applicant_username ? ` @${r.applicant_username}` : ''}`,
      r.status !== 'pending' && (r.owners ? null : t('no_owner')),
      r.status !== 'pending' && t('orders_n', { n: r.orders_count }),
    ].filter(Boolean).join(' · ');
    if (r.status_reason) card.querySelector('.reason').textContent = t('status_reason', { r: r.status_reason });
    const actions = card.querySelector('.actions');
    const btn = (label, cls, fn) => {
      const b = Object.assign(document.createElement('button'), { className: `btn ${cls}`, type: 'button', textContent: label });
      b.addEventListener('click', async () => {
        try { setLoading(b, true); await fn(); } catch (e) { toast(errText(e), { type: 'error' }); } finally { setLoading(b, false); }
      });
      actions.append(b);
    };
    const withReason = async (path) => {
      const reason = await promptDialog({ title: t('reason_title'), label: t('reason_hint'), confirm: t('save'), cancel: t('cancel'), minLength: 3, danger: true });
      if (reason == null) return;
      await post(path, { reason });
      refresh();
    };
    if (r.status === 'pending') {
      btn(t('approve'), 'btn-primary', async () => { await post(`/admin/restaurants/${r.id}/approve`); refresh(); });
      btn(t('reject'), 'btn-danger', () => withReason(`/admin/restaurants/${r.id}/reject`));
    } else if (r.status === 'active') {
      btn(t('owner_invite'), 'btn-secondary', async () => {
        const { invite } = await post(`/panel/restaurants/${r.id}/invites`, { kind: 'owner' });
        if (!invite.link) return toast(t('invite_no_bot', { code: invite.start_payload }), { timeout: 8000 });
        try { await navigator.clipboard.writeText(invite.link); } catch { /* nusxalab bo'lmasa ham havola ko'rsatiladi */ }
        toast(t('invite_created'), { type: 'success', timeout: 5000 });
        const p = Object.assign(document.createElement('p'), { className: 'xs mono invite-link', textContent: invite.link });
        card.querySelector('.card-body').append(p);
      });
      btn(t('open_panel'), 'btn-ghost', () => go(`panel/${r.id}`));
      btn(t('block'), 'btn-danger', () => withReason(`/admin/restaurants/${r.id}/block`));
    } else if (r.status === 'blocked') {
      btn(t('unblock'), 'btn-secondary', async () => {
        if (!(await confirmDialog({ title: t('unblock'), text: r.name, confirm: t('unblock'), cancel: t('cancel') }))) return;
        await post(`/admin/restaurants/${r.id}/unblock`);
        refresh();
      });
    }
    body.append(card);
  }
}

// --- B yo'l: admin restoran yaratadi, keyin egasiga havola beradi ---
function drawNew(body, go) {
  body.innerHTML = `<form class="stack" id="new" novalidate>
    <div class="field"><label class="label" for="n-name">${t('f_rest_name')}</label><input class="input" id="n-name" name="name" maxlength="120" required></div>
    <div class="field"><label class="label" for="n-phone">${t('f_rest_phone')}</label><input class="input" id="n-phone" name="phone" type="tel" inputmode="tel"></div>
    <div class="field"><label class="label" for="n-addr">${t('f_rest_addr')}</label><input class="input" id="n-addr" name="address_text" maxlength="300"></div>
    <button class="btn btn-primary btn-lg btn-block" type="submit">${t('create_restaurant')}</button></form>`;
  const f = body.querySelector('#new');
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await post('/admin/restaurants', { name: f.elements.name.value, phone: f.elements.phone.value || undefined, address_text: f.elements.address_text.value || undefined, status: 'active' });
      toast(t('created_ok'), { type: 'success', timeout: 5000 });
      go('admin?tab=restaurants', { replace: true });
    } catch (ex) { toast(errText(ex), { type: 'error' }); }
  });
}
