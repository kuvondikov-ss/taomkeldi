// Restoran paneli — kuryerlar va xodimlar.
import { get, post, put, del, ApiError } from '../api.js';
import { t, formatSum, getLang } from '../i18n.js';
import { icon } from '../../ui/icons.js';
import { toast, confirmDialog, openSheet, setLoading } from '../../ui/components.js';
import { stateBlock } from './cards.js';

const errText = (e) => (e instanceof ApiError && e.message ? e.message : t('offline'));
const TRANSPORT = ['foot', 'bike', 'moto', 'car'];

async function copyInvite(invite) {
  if (!invite.link) return toast(t('invite_no_bot', { code: invite.start_payload }), { timeout: 8000 });
  try { await navigator.clipboard.writeText(invite.link); } catch { /* nusxalab bo'lmasa ham ko'rsatamiz */ }
  toast(t('invite_copied'), { type: 'success', timeout: 5000 });
  return invite.link;
}

export async function renderPanelCouriers(el, _p, rid) {
  async function load() {
    let list;
    try { list = (await get(`/panel/restaurants/${rid}/couriers`)).couriers; } catch (e) {
      el.innerHTML = '';
      el.append(stateBlock({ iconName: 'wifiOff', error: true, title: errText(e) }));
      return;
    }
    el.innerHTML = `<div class="row" style="flex-wrap:wrap"><button class="btn btn-secondary" id="refresh">${getLang() === 'ru' ? 'Обновить геопозиции' : 'Joylashuvlarni yangilash'}</button><button class="btn btn-primary" id="add">${icon('plus', { className: 'icon-sm' })}${t('add_courier')}</button></div><div class="stack" id="list"></div><section class="sheet" id="c-sheet" hidden></section>`;
    el.querySelector('#refresh').addEventListener('click', load);
    el.querySelector('#add').addEventListener('click', () => form(null));
    const box = el.querySelector('#list');
    if (!list.length) box.append(stateBlock({ iconName: 'scooter', title: t('no_items') }));
    for (const c of list) {
      const card = document.createElement('article');
      card.className = 'card';
      card.innerHTML = `<div class="card-body stack" style="gap:var(--sp-2)">
        <div class="row" style="justify-content:space-between"><span class="h3 n"></span>
          <span class="badge ${!c.linked ? 'badge-warning' : c.is_online ? 'badge-success' : ''}">${!c.linked ? t('not_linked') : t(c.is_online ? 'online_now' : 'offline_now')}</span></div>
        <span class="small text-2 meta"></span>
        <span class="small">${t('today_stats', { n: c.delivered_today, sum: formatSum(c.cash_today) })}</span>
        <div class="row acts" style="gap:var(--sp-2);flex-wrap:wrap"></div>
        <p class="xs mono invite-link" hidden></p>
      </div>`;
      card.querySelector('.n').textContent = c.name;
      card.querySelector('.meta').textContent = [c.phone, c.transport && t(`t_${c.transport}`), c.username && `@${c.username}`, c.active_orders ? `${t('g_on_way')}: ${c.active_orders}` : null].filter(Boolean).join(' · ');
      const acts = card.querySelector('.acts');
      const ru = getLang() === 'ru';
      const loc = c.location;
      const location = document.createElement('p');
      location.className = 'small text-2';
      location.textContent = loc ? `${loc.state === 'live' ? (ru ? 'Актуальная геопозиция' : 'Yangi joylashuv') : (ru ? 'Последняя геопозиция' : 'Oxirgi joylashuv')} · ${new Date(loc.at).toLocaleString(ru ? 'ru-RU' : 'uz-UZ', { timeZone: 'Asia/Tashkent' })}` : (ru ? 'Геопозиция недоступна' : 'Joylashuv mavjud emas');
      acts.before(location);
      if (loc) {
        const mapLink = document.createElement('a');
        mapLink.className = 'btn btn-secondary';
        mapLink.href = `https://www.google.com/maps?q=${loc.lat},${loc.lon}`;
        mapLink.target = '_blank';
        mapLink.rel = 'noopener noreferrer';
        mapLink.textContent = ru ? 'На карте' : 'Xaritada ko‘rish';
        acts.append(mapLink);
      }
      const btn = (label, cls, fn) => {
        const b = Object.assign(document.createElement('button'), { className: `btn ${cls}`, type: 'button', textContent: label });
        b.addEventListener('click', async () => { try { setLoading(b, true); await fn(); } catch (e) { toast(errText(e), { type: 'error' }); } finally { setLoading(b, false); } });
        acts.append(b);
      };
      if (!c.linked) {
        btn(t('courier_invite'), 'btn-secondary', async () => {
          const { invite } = await post(`/panel/restaurants/${rid}/invites`, { kind: 'courier', courier_id: c.id });
          const link = await copyInvite(invite);
          if (link) { const p = card.querySelector('.invite-link'); p.textContent = link; p.hidden = false; }
        });
      }
      btn(t('edit'), 'btn-ghost', () => form(c));
      btn(t('remove'), 'btn-ghost', async () => {
        if (!(await confirmDialog({ title: t('confirm_remove_courier'), text: c.name, confirm: t('remove'), cancel: t('cancel'), danger: true }))) return;
        await del(`/panel/restaurants/${rid}/couriers/${c.id}`);
        load();
      });
      box.append(card);
    }
  }

  function form(c) {
    const sheet = el.querySelector('#c-sheet');
    sheet.innerHTML = `<div class="sheet-handle"></div><div class="sheet-header"><h2 class="h2">${t(c ? 'edit' : 'add_courier')}</h2><button class="btn btn-icon btn-ghost" data-sheet-close aria-label="${t('cancel')}">${icon('close')}</button></div>
      <form class="stack" novalidate>
        <div class="field"><label class="label">${t('f_name')}</label><input class="input" name="name" maxlength="80"></div>
        <div class="field"><label class="label">${t('f_phone')}</label><input class="input" name="phone" type="tel" inputmode="tel" placeholder="+998 90 123 45 67"></div>
        <div class="field"><label class="label">${t('transport')}</label><select class="select" name="transport"><option value="">—</option>${TRANSPORT.map((x) => `<option value="${x}">${t(`t_${x}`)}</option>`).join('')}</select></div>
        <div class="alert alert-danger cerr" hidden></div>
        <button class="btn btn-primary btn-lg btn-block" type="submit">${t('save')}</button></form>`;
    const f = sheet.querySelector('form');
    if (c) { f.elements.name.value = c.name; f.elements.phone.value = c.phone || ''; f.elements.transport.value = c.transport || ''; }
    const { close } = openSheet(sheet);
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const body = { name: f.elements.name.value, phone: f.elements.phone.value || null, transport: f.elements.transport.value || null };
      try {
        if (c) await put(`/panel/restaurants/${rid}/couriers/${c.id}`, body);
        else await post(`/panel/restaurants/${rid}/couriers`, body);
        close();
        load();
      } catch (e) { const er = sheet.querySelector('.cerr'); er.textContent = errText(e); er.hidden = false; }
    });
  }
  await load();
}

export async function renderPanelStaff(el, _p, rid, { role }) {
  async function load() {
    let list;
    try { list = (await get(`/panel/restaurants/${rid}/staff`)).staff; } catch (e) {
      el.innerHTML = '';
      el.append(stateBlock({ iconName: 'wifiOff', error: true, title: errText(e) }));
      return;
    }
    const owner = role === 'owner' || role === 'admin';
    el.innerHTML = `${owner ? `<button class="btn btn-primary" id="invite">${icon('plus', { className: 'icon-sm' })}${t('invite_manager')}</button><p class="xs mono invite-link" hidden></p>` : `<div class="alert">${icon('info')}<span>${t('owner_only_note')}</span></div>`}<div class="list" id="list"></div>`;
    el.querySelector('#invite')?.addEventListener('click', async () => {
      try {
        const { invite } = await post(`/panel/restaurants/${rid}/invites`, { kind: 'manager' });
        const link = await copyInvite(invite);
        if (link) { const p = el.querySelector('.invite-link'); p.textContent = link; p.hidden = false; }
      } catch (e) { toast(errText(e), { type: 'error' }); }
    });
    const box = el.querySelector('#list');
    for (const s of list) {
      const row = document.createElement('div');
      row.className = 'list-item';
      row.innerHTML = `${icon('user')}<span class="grow"><span class="h3 n"></span><span class="small text-2">${t(`role_${s.role}_t`)}${s.is_me ? ` · ${t('you')}` : ''}</span></span>`;
      row.querySelector('.n').textContent = [s.first_name, s.last_name].filter(Boolean).join(' ') + (s.username ? ` @${s.username}` : '');
      // O'zini va egani bu yerda olib tashlab bo'lmaydi (server ham himoyalaydi).
      if (owner && !s.is_me && s.role === 'manager') {
        const b = Object.assign(document.createElement('button'), { className: 'btn btn-ghost small', type: 'button', textContent: t('remove') });
        b.addEventListener('click', async () => {
          if (!(await confirmDialog({ title: t('confirm_remove_staff'), confirm: t('remove'), cancel: t('cancel'), danger: true }))) return;
          try { await del(`/panel/restaurants/${rid}/staff/${s.id}`); load(); } catch (e) { toast(errText(e), { type: 'error' }); }
        });
        row.append(b);
      }
      box.append(row);
    }
  }
  await load();
}
