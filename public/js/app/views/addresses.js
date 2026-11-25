// Saqlangan manzillar: tanlash (asosiy qilish), tahrirlash, o'chirish, yangisini qo'shish.
import { state, reloadAddresses, currentAddress } from '../state.js';
import { post, del, ApiError } from '../api.js';
import { t } from '../i18n.js';
import { toast, confirmDialog } from '../../ui/components.js';
import { icon } from '../../ui/icons.js';

export function renderAddresses(el, params, _m, { go }) {
  const choose = params.get('choose') === '1';
  const draw = () => {
    const list = state.addresses;
    el.innerHTML = `
      <main class="page stack">
        <h1 class="h2">${t(choose ? 'choose_address' : 'addresses_title')}</h1>
        ${choose && list.length && !currentAddress() ? `<div class="alert alert-warning">${icon('alert')}<span>${t('choose_address')}</span></div>` : ''}
        ${list.length ? '<div class="list" id="list"></div>' : `<div class="card"><div class="state"><div class="state-icon">${icon('pin')}</div><p class="h3">${t('no_addresses')}</p></div></div>`}
        <button class="btn btn-secondary btn-block" id="add">${icon('plus', { className: 'icon-sm' })}${t('add_address')}</button>
      </main>`;
    const ul = el.querySelector('#list');
    for (const a of list) {
      const row = document.createElement('div');
      row.className = 'list-item';
      row.innerHTML = `
        <button class="grow address-pick" type="button" ${a.in_service_area ? '' : 'disabled'}>
          <span class="row"><span class="h3"></span>${a.is_default && a.in_service_area ? `<span class="badge badge-success">${t('default_badge')}</span>` : ''}</span>
          <span class="small text-2 address-text"></span>
          ${a.in_service_area ? '' : `<span class="error-text">${t('address_invalid')}</span>`}
        </button>
        <button class="btn btn-icon btn-ghost" data-act="edit" aria-label="${t('edit')}">${icon('edit')}</button>
        <button class="btn btn-icon btn-ghost" data-act="delete" aria-label="${t('delete')}">${icon('trash')}</button>`;
      row.querySelector('.h3').textContent = a.label || a.text.split(',')[0];
      row.querySelector('.address-text').textContent = a.text;
      row.querySelector('.address-pick').addEventListener('click', async () => {
        try {
          if (!a.is_default) await post(`/addresses/${a.id}/default`);
          await reloadAddresses();
          go('', { replace: choose });
        } catch (err) {
          toast(err instanceof ApiError && err.message ? err.message : t('offline'), { type: 'error' });
        }
      });
      row.querySelector('[data-act="edit"]').addEventListener('click', () => go(`address/${a.id}/edit?back=addresses`));
      row.querySelector('[data-act="delete"]').addEventListener('click', async () => {
        const ok = await confirmDialog({ title: t('confirm_delete_title'), text: a.text, confirm: t('delete'), cancel: t('cancel'), danger: true });
        if (!ok) return;
        try {
          await del(`/addresses/${a.id}`);
          await reloadAddresses();
          toast(t('deleted'), { type: 'success' });
          draw();
        } catch (err) {
          toast(err instanceof ApiError && err.message ? err.message : t('offline'), { type: 'error' });
        }
      });
      ul.append(row);
    }
    el.querySelector('#add').addEventListener('click', () => { state.draft = null; go('address/pick'); });
  };
  draw();
}
