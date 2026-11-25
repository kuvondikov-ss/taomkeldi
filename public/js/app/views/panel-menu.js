// Restoran paneli — menyu: kategoriyalar (qo'shish, nomini o'zgartirish, tartib, o'chirish), taomlar (forma, rasm, stop-list).
import { get, post, put, del, upload, ApiError } from '../api.js';
import { t, formatSum } from '../i18n.js';
import { icon } from '../../ui/icons.js';
import { toast, confirmDialog, promptDialog, openSheet, setLoading } from '../../ui/components.js';
import { stateBlock } from './cards.js';

const errText = (e) => (e instanceof ApiError && e.message ? e.message : t('offline'));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export async function renderPanelMenu(el, _params, rid) {
  let data;
  async function load() {
    try {
      data = await get(`/panel/restaurants/${rid}/menu`);
      draw();
    } catch (e) {
      el.innerHTML = '';
      el.append(stateBlock({ iconName: 'wifiOff', error: true, title: errText(e) }));
    }
  }

  function draw() {
    el.innerHTML = `
      <div class="row" style="gap:var(--sp-2);flex-wrap:wrap">
        <button class="btn btn-primary" id="add-product">${icon('plus', { className: 'icon-sm' })}${t('add_product')}</button>
        <button class="btn btn-secondary" id="add-cat">${icon('plus', { className: 'icon-sm' })}${t('add_category')}</button>
      </div>
      <div id="menu" class="stack"></div>
      <section class="sheet" id="p-sheet" hidden></section>`;
    el.querySelector('#add-product').addEventListener('click', () => productForm(null));
    el.querySelector('#add-cat').addEventListener('click', async () => {
      const name = await promptDialog({ title: t('add_category'), confirm: t('save'), cancel: t('cancel'), minLength: 1 });
      if (!name) return;
      try { await post(`/panel/restaurants/${rid}/categories`, { name_uz: name }); load(); } catch (e) { toast(errText(e), { type: 'error' }); }
    });
    const menu = el.querySelector('#menu');
    const groups = [...data.categories, { id: null, name_uz: t('no_category') }];
    if (!data.products.length && !data.categories.length) menu.append(stateBlock({ iconName: 'dish', title: t('menu_empty') }));
    groups.forEach((c, idx) => {
      const items = data.products.filter((p) => (c.id === null ? !data.categories.some((x) => x.id === p.category_id) : p.category_id === c.id));
      if (c.id === null && !items.length) return;
      const sec = document.createElement('section');
      sec.className = 'stack';
      sec.innerHTML = `<div class="row" style="justify-content:space-between"><h3 class="h3 cname"></h3>
        ${c.id ? `<span class="row" style="gap:0">
          <button class="btn btn-icon btn-ghost" data-a="up" aria-label="${t('move_up')}" ${idx === 0 ? 'disabled' : ''}>${icon('back', { className: 'icon-sm rot-up' })}</button>
          <button class="btn btn-icon btn-ghost" data-a="down" aria-label="${t('move_down')}" ${idx >= data.categories.length - 1 ? 'disabled' : ''}>${icon('back', { className: 'icon-sm rot-down' })}</button>
          <button class="btn btn-icon btn-ghost" data-a="rename" aria-label="${t('edit')}">${icon('edit', { className: 'icon-sm' })}</button>
          <button class="btn btn-icon btn-ghost" data-a="delete" aria-label="${t('delete')}">${icon('trash', { className: 'icon-sm' })}</button></span>` : ''}</div>
        <div class="list"></div>`;
      sec.querySelector('.cname').textContent = c.name_uz;
      sec.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', async () => {
        try {
          if (b.dataset.a === 'rename') {
            const name = await promptDialog({ title: t('edit'), confirm: t('save'), cancel: t('cancel') });
            if (name) await put(`/panel/restaurants/${rid}/categories/${c.id}`, { name_uz: name, name_ru: c.name_ru });
          } else if (b.dataset.a === 'delete') {
            if (!(await confirmDialog({ title: t('confirm_delete_category'), confirm: t('delete'), cancel: t('cancel'), danger: true }))) return;
            await del(`/panel/restaurants/${rid}/categories/${c.id}`);
          } else {
            const ids = data.categories.map((x) => x.id);
            const i = ids.indexOf(c.id);
            const j = b.dataset.a === 'up' ? i - 1 : i + 1;
            [ids[i], ids[j]] = [ids[j], ids[i]];
            await put(`/panel/restaurants/${rid}/categories-order`, { ids });
          }
          load();
        } catch (e) { toast(errText(e), { type: 'error' }); }
      }));
      const list = sec.querySelector('.list');
      for (const p of items) {
        const row = document.createElement('div');
        row.className = `list-item menu-row${p.is_available ? '' : ' is-unavailable'}`;
        row.innerHTML = `${p.image_path ? `<img class="thumb" alt="" src="${esc(p.image_path)}">` : `<span class="thumb placeholder">${icon('dish', { className: 'icon-sm' })}</span>`}
          <button class="grow edit-btn" type="button"><span class="h3 title-2l pn"></span><span class="small"><span class="price">${formatSum(p.price)}</span>${p.old_price ? ` <span class="price-old">${formatSum(p.old_price)}</span>` : ''}${p.is_popular ? ` · ${t('f_popular')}` : ''}</span></button>
          <label class="switch" title="${t('stop_list')}"><input type="checkbox" ${p.is_available ? 'checked' : ''} aria-label="${t('f_available')}"><span></span></label>`;
        row.querySelector('.pn').textContent = p.name_uz;
        row.querySelector('.edit-btn').addEventListener('click', () => productForm(p));
        row.querySelector('input').addEventListener('change', async (ev) => {
          try { await put(`/panel/restaurants/${rid}/products/${p.id}/availability`, { available: ev.target.checked }); p.is_available = ev.target.checked ? 1 : 0; row.classList.toggle('is-unavailable', !ev.target.checked); } catch (e) { ev.target.checked = !ev.target.checked; toast(errText(e), { type: 'error' }); }
        });
        list.append(row);
      }
      menu.append(sec);
    });
  }

  function productForm(p) {
    const sheet = el.querySelector('#p-sheet');
    let image = p?.image_path || null;
    sheet.innerHTML = `<div class="sheet-handle"></div>
      <div class="sheet-header"><h2 class="h2">${t(p ? 'edit_product' : 'add_product')}</h2><button class="btn btn-icon btn-ghost" data-sheet-close aria-label="${t('cancel')}">${icon('close')}</button></div>
      <form class="stack" novalidate>
        <div class="photo-row"><span class="thumb big" id="ph"></span><label class="btn btn-secondary">${icon('plus', { className: 'icon-sm' })}${t('upload_photo')}<input type="file" accept="image/jpeg,image/png,image/webp" hidden></label></div>
        <div class="field"><label class="label">${t('f_name_uz')}</label><input class="input" name="name_uz" maxlength="120" required></div>
        <div class="field"><label class="label">${t('f_name_ru')}</label><input class="input" name="name_ru" maxlength="120"></div>
        <div class="grid-2" style="gap:var(--sp-2)">
          <div class="field"><label class="label">${t('f_price')}</label><input class="input" name="price" inputmode="numeric"></div>
          <div class="field"><label class="label">${t('f_old_price')}</label><input class="input" name="old_price" inputmode="numeric"></div>
        </div>
        <div class="field"><label class="label">${t('f_portion')}</label><input class="input" name="portion" maxlength="40" placeholder="350 g"></div>
        <div class="field"><label class="label">${t('category')}</label><select class="select" name="category_id"><option value="">${t('no_category')}</option>${data.categories.map((c) => `<option value="${c.id}">${esc(c.name_uz)}</option>`).join('')}</select></div>
        <div class="field"><label class="label">${t('f_desc_uz')}</label><textarea class="textarea" name="description_uz" maxlength="1000"></textarea></div>
        <div class="field"><label class="label">${t('f_desc_ru')}</label><textarea class="textarea" name="description_ru" maxlength="1000"></textarea></div>
        <label class="row check-row"><input type="checkbox" name="is_popular"> ${t('f_popular')}</label>
        <label class="row check-row"><input type="checkbox" name="is_available" checked> ${t('f_available')}</label>
        <div class="alert alert-danger" id="perr" hidden></div>
        <button class="btn btn-primary btn-lg btn-block" type="submit">${t('save')}</button>
        ${p ? `<button class="btn btn-ghost" type="button" id="pdel">${icon('trash', { className: 'icon-sm' })}${t('delete')}</button>` : ''}
      </form>`;
    const f = sheet.querySelector('form');
    const ph = sheet.querySelector('#ph');
    const drawPh = () => { ph.innerHTML = image ? `<img alt="" src="${esc(image)}">` : icon('dish'); };
    drawPh();
    if (p) {
      for (const k of ['name_uz', 'name_ru', 'price', 'old_price', 'portion', 'description_uz', 'description_ru']) f.elements[k].value = p[k] ?? '';
      f.elements.category_id.value = p.category_id ?? '';
      f.elements.is_popular.checked = !!p.is_popular;
      f.elements.is_available.checked = !!p.is_available;
    }
    sheet.querySelector('input[type=file]').addEventListener('change', async (ev) => {
      const file = ev.target.files[0];
      if (!file) return;
      ph.innerHTML = `<span class="xs">${t('uploading')}</span>`;
      try { image = (await upload(`/panel/restaurants/${rid}/uploads`, file)).file.path; } catch (e) { toast(errText(e), { type: 'error' }); }
      drawPh();
    });
    const { close } = openSheet(sheet);
    const perr = sheet.querySelector('#perr');
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      perr.hidden = true;
      const num = (x) => (x.trim() === '' ? null : Number(x.replace(/\s/g, '')));
      const body = {
        name_uz: f.elements.name_uz.value, name_ru: f.elements.name_ru.value || null,
        price: num(f.elements.price.value), old_price: num(f.elements.old_price.value),
        portion: f.elements.portion.value || null, category_id: f.elements.category_id.value ? Number(f.elements.category_id.value) : null,
        description_uz: f.elements.description_uz.value || null, description_ru: f.elements.description_ru.value || null,
        is_popular: f.elements.is_popular.checked, is_available: f.elements.is_available.checked, image_path: image,
      };
      const btn = f.querySelector('[type=submit]');
      setLoading(btn, true);
      try {
        if (p) await put(`/panel/restaurants/${rid}/products/${p.id}`, body);
        else await post(`/panel/restaurants/${rid}/products`, body);
        close();
        toast(t('saved_ok'), { type: 'success' });
        load();
      } catch (e) {
        // Qaysi maydon xato ekanini aniq ko'rsatamiz.
        const labels = { price: t('f_price'), old_price: t('f_old_price'), name_uz: t('f_name_uz'), category_id: t('category'), image_path: t('f_photo'), portion: t('f_portion') };
        const fld = e instanceof ApiError && e.details?.field;
        perr.textContent = e instanceof ApiError ? [e.message, fld && labels[fld]].filter(Boolean).join(' — ') : t('offline');
        perr.hidden = false;
      } finally { setLoading(btn, false); }
    });
    sheet.querySelector('#pdel')?.addEventListener('click', async () => {
      if (!(await confirmDialog({ title: t('confirm_delete_product'), confirm: t('delete'), cancel: t('cancel'), danger: true }))) return;
      try { await del(`/panel/restaurants/${rid}/products/${p.id}`); close(); load(); } catch (e) { toast(errText(e), { type: 'error' }); }
    });
  }

  await load();
}
