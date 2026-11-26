// Restoran sahifasi: ma'lumot, yopishqoq kategoriya tablari, 2 ustunli taomlar, taom oynasi, savat paneli.
import { currentAddress } from '../state.js';
import { get, put, del, ApiError } from '../api.js';
import { t, getLang, formatSum } from '../i18n.js';
import { icon } from '../../ui/icons.js';
import { openSheet, confirmDialog, toast } from '../../ui/components.js';
import { cuisineName, deliveryLine, ratingHtml, stateBlock } from './cards.js';
import * as cart from '../cart.js';
import { hoursText } from '../../shared/hours.js';
import { normalize, changes, lineKey, unitPrice, label } from '../../shared/options-core.js';

const nameOf = (x) => (getLang() === 'ru' && x.name_ru) || x.name_uz;
const descOf = (x) => (getLang() === 'ru' && x.description_ru) || x.description_uz || '';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const hasDiscount = (p) => p.old_price != null && p.old_price > p.price;

export async function renderRestaurant(el, params, m, { go }) {
  const id = Number(m[1]);
  const addr = currentAddress();
  el.innerHTML = '<main class="page stack" aria-busy="true"><div class="card"><div class="skeleton skeleton-media" style="aspect-ratio:16/9"></div><div class="card-body"><div class="skeleton skeleton-title"></div></div></div></main>';
  let r;
  try {
    r = (await get(`/restaurants/${id}?address_id=${addr.id}`)).restaurant;
  } catch (err) {
    el.innerHTML = '<main class="page"></main>';
    el.firstChild.append(stateBlock({
      iconName: err instanceof ApiError && err.code === 'NOT_FOUND' ? 'store' : 'wifiOff', error: true,
      title: err instanceof ApiError && err.message ? err.message : t('offline'),
      action: { label: t('nav_home'), onClick: () => go('') },
    }));
    return;
  }
  const canOrder = r.is_open && r.delivery?.deliverable;
  const products = new Map(r.products.map((p) => [p.id, p]));
  const restaurantRef = { id: r.id, name: r.name };

  // Bo'limlar: "Ommabop" (bo'lsa) + kategoriyalar + kategoriyasizlar. Bir taom bir nechta bo'limda bo'lishi mumkin.
  const sections = [];
  const popular = r.products.filter((p) => p.is_popular);
  if (popular.length) sections.push({ key: 'popular', title: t('popular'), items: popular });
  for (const c of r.categories) {
    const items = r.products.filter((p) => p.category_id === c.id);
    if (items.length) sections.push({ key: `c${c.id}`, title: nameOf(c), items });
  }
  const orphan = r.products.filter((p) => !r.categories.some((c) => c.id === p.category_id));
  if (orphan.length) sections.push({ key: 'other', title: t('other'), items: orphan });

  el.innerHTML = `
    <main class="page stack restaurant ${canOrder ? '' : 'cannot-order'}">
      <div class="restaurant-hero">
        <img class="card-media wide restaurant-cover" alt="" src="${esc(r.cover_path || '/brand/placeholder.svg')}">
        <button class="btn btn-icon fav-btn" type="button" aria-pressed="${r.is_favorite}" aria-label="${t(r.is_favorite ? 'fav_remove' : 'fav_add')}">${icon('heart')}</button>
      </div>
      <div class="stack" style="gap:var(--sp-1)">
        <div class="row" style="justify-content:space-between;align-items:flex-start">
          <h1 class="h2 rname"></h1>
          <span class="badge ${r.is_open ? 'badge-success' : 'badge-danger'}">${t(r.is_open ? 'open' : 'closed')}</span>
        </div>
        <p class="small text-2 cuisines"></p>
        <p class="small">${ratingHtml(r)}${r.rating ? ' · ' : ''}${deliveryLine(r)}</p>
        ${r.min_order ? `<p class="small text-2">${t('min_order', { sum: formatSum(r.min_order) })}</p>` : ''}
        <button class="btn btn-ghost small more-btn" type="button">${icon('info', { className: 'icon-sm' })}${t('more_info')}</button>
      </div>
      ${r.is_open ? '' : `<div class="alert alert-danger">${icon('info')}<span>${t('cannot_order_closed')}</span></div>`}
      ${r.delivery?.deliverable ? '' : `<div class="alert alert-warning">${icon('alert')}<span>${t('not_deliverable')}</span></div>`}
      <div class="alert alert-warning" id="cart-warn" hidden></div>
      ${sections.length ? `<div class="tabs" role="tablist" id="tabs">${sections.map((s, i) => `<button class="tab" role="tab" data-target="${s.key}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">${esc(s.title)}</button>`).join('')}</div>` : ''}
      <div id="menu" class="stack menu"></div>
    </main>
    <div class="cart-bar" id="cart-bar" hidden>
      <button class="btn btn-primary btn-lg btn-block cart-bar-btn" type="button">
        <span class="cart-bar-count"></span><span class="grow cart-bar-label">${t('cart')}</span><span class="cart-bar-sum"></span>
      </button>
      <p class="xs text-2 cart-bar-note">${t('delivery_extra')}</p>
    </div>
    <section class="sheet" id="dish-sheet" hidden aria-labelledby="dish-title"></section>`;
  el.querySelector('.rname').textContent = r.name;
  el.querySelector('.cuisines').textContent = r.cuisines.map(cuisineName).join(', ');

  // --- Sevimli ---
  const fav = el.querySelector('.restaurant-hero .fav-btn');
  fav.addEventListener('click', async () => {
    const on = fav.getAttribute('aria-pressed') !== 'true';
    fav.setAttribute('aria-pressed', String(on));
    try { if (on) await put(`/favorites/${r.id}`); else await del(`/favorites/${r.id}`); } catch { fav.setAttribute('aria-pressed', String(!on)); }
  });

  // --- Batafsil ma'lumot ---
  el.querySelector('.more-btn').addEventListener('click', () => {
    const sheet = el.querySelector('#dish-sheet');
    const hours = hoursText(r.work_hours);
    sheet.innerHTML = `<div class="sheet-handle"></div>
      <div class="sheet-header"><h2 class="h2" id="dish-title"></h2><button class="btn btn-icon btn-ghost" data-sheet-close aria-label="${t('cancel')}">${icon('close')}</button></div>
      <div class="stack">
        ${r.description ? `<div><p class="label">${t('description')}</p><p class="small desc"></p></div>` : ''}
        ${r.address_text ? `<div><p class="label">${t('address')}</p><p class="small addr"></p></div>` : ''}
        ${hours ? `<div><p class="label">${t('work_hours')}</p><p class="small hours"></p></div>` : ''}
        <p class="small text-2">${deliveryLine(r)}</p>
      </div>`;
    sheet.querySelector('#dish-title').textContent = r.name;
    if (r.description) sheet.querySelector('.desc').textContent = r.description;
    if (r.address_text) sheet.querySelector('.addr').textContent = r.address_text;
    if (hours) sheet.querySelector('.hours').textContent = hours;
    openSheet(sheet);
  });

  // --- Savatga qo'shish (boshqa restoran bo'lsa — tasdiq) ---
  // opts: "Maxsus" qator uchun { key, options, optionsLabel, price } (berilmasa — standart).
  async function setQty(p, qty, opts = {}) {
    if (!canOrder && qty > cart.qtyOf(p.id)) return false;
    const item = { id: p.id, name: nameOf(p), price: opts.price ?? p.price, portion: p.portion, image_path: p.image_path, is_available: p.is_available };
    let res = cart.setQty(restaurantRef, item, qty, opts);
    if (res.conflict) {
      const ok = await confirmDialog({
        title: t('switch_title'), text: t('switch_text', { name: cart.getCart().restaurantName }),
        confirm: t('switch_confirm'), cancel: t('cancel'), danger: true,
      });
      if (!ok) return false;
      res = cart.setQty(restaurantRef, item, qty, { ...opts, force: true });
    }
    return !!res.ok;
  }

  // --- Taom kartalari ---
  function actionsHtml(p) {
    if (!p.is_available) return `<span class="badge badge-danger">${t('out_of_stock')}</span>`;
    const q = cart.qtyOf(p.id);
    if (q === 0) {
      return `<button class="btn btn-icon btn-secondary add-btn" data-act="inc" aria-label="${t('add_to_cart')}" ${canOrder ? '' : 'disabled'}>${icon('plus')}</button>`;
    }
    return `<span class="qty" role="group" aria-label="${esc(nameOf(p))}">
      <button class="btn" data-act="dec" aria-label="${t('qty_dec')}">${icon('minus', { className: 'icon-sm' })}</button>
      <span class="qty-value" aria-live="polite">${q}</span>
      <button class="btn" data-act="inc" aria-label="${t('qty_inc')}" ${canOrder ? '' : 'disabled'}>${icon('plus', { className: 'icon-sm' })}</button>
    </span>`;
  }

  function productCard(p) {
    const a = document.createElement('article');
    a.className = `card product-card${p.is_available ? '' : ' is-unavailable'}`;
    a.dataset.pid = p.id;
    a.innerHTML = `
      <button class="product-open media-btn" type="button" aria-label="${esc(nameOf(p))}">
        ${p.image_path ? `<img class="card-media" alt="" loading="lazy" src="${esc(p.image_path)}">` : `<div class="placeholder">${icon('dish')}</div>`}
        ${hasDiscount(p) ? `<span class="badge badge-warning cover-badge">−${Math.round((1 - p.price / p.old_price) * 100)}%</span>` : ''}
      </button>
      <div class="card-body">
        <button class="product-open name-btn h3 title-2l" type="button"></button>
        ${p.portion ? '<span class="xs text-2 portion"></span>' : ''}
        <div class="product-price"><span class="price">${formatSum(p.price)}</span>${hasDiscount(p) ? `<span class="price-old">${formatSum(p.old_price)}</span>` : ''}</div>
        <div class="product-actions">${actionsHtml(p)}</div>
      </div>`;
    a.querySelector('.name-btn').textContent = nameOf(p);
    if (p.portion) a.querySelector('.portion').textContent = p.portion;
    return a;
  }

  const menu = el.querySelector('#menu');
  if (!sections.length) menu.append(stateBlock({ iconName: 'dish', title: t('menu_empty') }));
  for (const s of sections) {
    const sec = document.createElement('section');
    sec.className = 'stack menu-section';
    sec.id = `sec-${s.key}`;
    sec.dataset.key = s.key;
    sec.innerHTML = '<h2 class="h3 section-title"></h2><div class="grid-2"></div>';
    sec.querySelector('h2').textContent = s.title;
    for (const p of s.items) sec.querySelector('.grid-2').append(productCard(p));
    menu.append(sec);
  }

  // Bitta taom bir necha bo'limda bo'lsa ham miqdor bitta holatdan olinadi.
  function refreshProduct(pid) {
    const p = products.get(pid);
    el.querySelectorAll(`.product-card[data-pid="${pid}"] .product-actions`).forEach((box) => { box.innerHTML = actionsHtml(p); });
  }

  menu.addEventListener('click', async (e) => {
    const card = e.target.closest('.product-card');
    if (!card) return;
    const p = products.get(Number(card.dataset.pid));
    if (e.target.closest('.product-open')) return openDish(p);
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    await setQty(p, cart.qtyOf(p.id) + (act === 'inc' ? 1 : -1));
  });

  // --- Taom oynasi: "Standart" (o'rtacha miqdor) yoki "Maxsus" (har masalliq soni/miqdori) — narx darrov hisoblanadi ---
  function openDish(p) {
    const sheet = el.querySelector('#dish-sheet');
    const ings = p.ingredients || [];
    const hasCustom = ings.length > 0;
    let mode = 'std';
    const sel = new Map(ings.map((i) => [i.id, i.std_qty]));
    let q = Math.max(1, cart.qtyOf(p.id));
    const inCart = cart.qtyOf(p.id) > 0;
    const lang = getLang();
    const ingName = (i) => (lang === 'ru' && i.name_ru) || i.name_uz;
    const unitOf = (i) => t(`unit_${i.unit}`) === `unit_${i.unit}` ? i.unit : t(`unit_${i.unit}`);

    sheet.innerHTML = `<div class="sheet-handle"></div>
      ${p.image_path ? `<img class="card-media dish-photo" alt="" src="${esc(p.image_path)}">` : `<div class="placeholder dish-photo">${icon('dish')}</div>`}
      <div class="sheet-header" style="margin-top:var(--sp-3)">
        <h2 class="h2" id="dish-title"></h2>
        <button class="btn btn-icon btn-ghost" data-sheet-close aria-label="${t('cancel')}">${icon('close')}</button>
      </div>
      <div class="stack" style="gap:var(--sp-2)">
        ${p.portion ? '<p class="small text-2 portion"></p>' : ''}
        ${descOf(p) ? '<p class="small desc"></p>' : ''}
        ${hasCustom ? `<div class="mode-switch" role="tablist" aria-label="${t('mode_label')}">
            <button class="mode-btn" role="tab" data-mode="std" aria-selected="true">${t('mode_std')}</button>
            <button class="mode-btn" role="tab" data-mode="custom" aria-selected="false">${t('mode_custom')}</button>
          </div>
          <p class="xs text-2" id="mode-hint"></p>
          <div class="ing-list" id="ings"></div>` : ''}
        <div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:var(--sp-3)">
          <span><span class="price" id="unit-price" style="font-size:var(--fs-lg)"></span> ${hasDiscount(p) ? `<span class="price-old">${formatSum(p.old_price)}</span>` : ''}</span>
          ${p.is_available && canOrder ? `<span class="qty" role="group" aria-label="${t('qty_count')}"><button class="btn" data-q="-1" aria-label="${t('qty_dec')}">${icon('minus', { className: 'icon-sm' })}</button><span class="qty-value" id="dish-qty" aria-live="polite">${q}</span><button class="btn" data-q="1" aria-label="${t('qty_inc')}">${icon('plus', { className: 'icon-sm' })}</button></span>` : ''}
        </div>
        ${!p.is_available ? `<div class="alert alert-danger">${icon('info')}<span>${t('out_of_stock')}</span></div>` : ''}
        ${p.is_available && !canOrder ? `<div class="alert alert-warning">${icon('alert')}<span>${t(r.is_open ? 'not_deliverable' : 'cannot_order_closed')}</span></div>` : ''}
        ${p.is_available && canOrder ? '<button class="btn btn-primary btn-lg btn-block" id="dish-add"></button>' : ''}
        ${inCart ? `<button class="btn btn-ghost btn-block" id="dish-remove">${t('remove_from_cart')}</button>` : ''}
      </div>`;
    sheet.querySelector('#dish-title').textContent = nameOf(p);
    if (p.portion) sheet.querySelector('.portion').textContent = p.portion;
    if (descOf(p)) sheet.querySelector('.desc').textContent = descOf(p);
    const addBtn = sheet.querySelector('#dish-add');

    const price = () => (mode === 'custom' ? unitPrice(p.price, ings, sel) : p.price);
    const deltaText = (i) => {
      const d = Math.round(((sel.get(i.id) - i.std_qty) / i.step) * i.step_price);
      return d === 0 ? '' : `${d > 0 ? '+' : '−'}${formatSum(Math.abs(d))}`;
    };
    function drawIngredients() {
      if (!hasCustom) return;
      sheet.querySelector('#mode-hint').textContent = t(mode === 'custom' ? 'mode_custom_hint' : 'mode_std_hint');
      sheet.querySelectorAll('.mode-btn').forEach((b2) => b2.setAttribute('aria-selected', String(b2.dataset.mode === mode)));
      const box = sheet.querySelector('#ings');
      box.innerHTML = ings.map((i) => {
        const val = mode === 'custom' ? sel.get(i.id) : i.std_qty;
        return `<div class="ing-row" data-id="${i.id}">
          <span class="grow"><span class="small ing-name"></span><span class="xs text-2 ing-price">${mode === 'custom' ? deltaText(i) : ''}</span></span>
          ${mode === 'custom' ? `<span class="qty qty-sm" role="group">
              <button class="btn" data-d="-1" aria-label="${t('qty_dec')}" ${val <= i.min_qty ? 'disabled' : ''}>${icon('minus', { className: 'icon-sm' })}</button>
              <span class="qty-value ing-val">${val} ${esc(unitOf(i))}</span>
              <button class="btn" data-d="1" aria-label="${t('qty_inc')}" ${val >= i.max_qty ? 'disabled' : ''}>${icon('plus', { className: 'icon-sm' })}</button>
            </span>` : `<span class="small ing-val">${val ? `${val} ${esc(unitOf(i))}` : t('opt_none')}</span>`}
        </div>`;
      }).join('') + (mode === 'custom' ? `<button class="btn btn-ghost small" id="ing-reset" type="button">${t('opt_reset')}</button>` : '');
      box.querySelectorAll('.ing-row').forEach((row) => { row.querySelector('.ing-name').textContent = ingName(ings.find((i) => i.id === Number(row.dataset.id))); });
      box.querySelectorAll('[data-d]').forEach((btn) => btn.addEventListener('click', () => {
        const i = ings.find((x) => x.id === Number(btn.closest('.ing-row').dataset.id));
        const nv = Math.max(i.min_qty, Math.min(i.max_qty, sel.get(i.id) + Number(btn.dataset.d) * i.step));
        sel.set(i.id, nv);
        drawIngredients();
        sync();
      }));
      box.querySelector('#ing-reset')?.addEventListener('click', () => { for (const i of ings) sel.set(i.id, i.std_qty); drawIngredients(); sync(); });
    }
    const sync = () => {
      sheet.querySelector('#unit-price').textContent = formatSum(price());
      if (sheet.querySelector('#dish-qty')) sheet.querySelector('#dish-qty').textContent = q;
      if (addBtn) addBtn.textContent = t(inCart && mode === 'std' ? 'update_sum' : 'add_sum', { sum: formatSum(price() * q) });
    };
    sheet.querySelectorAll('.mode-btn').forEach((b2) => b2.addEventListener('click', () => { mode = b2.dataset.mode; drawIngredients(); sync(); }));
    drawIngredients();
    sync();
    sheet.querySelectorAll('[data-q]').forEach((b2) => b2.addEventListener('click', () => { q = Math.max(1, Math.min(99, q + Number(b2.dataset.q))); sync(); }));
    const { close } = openSheet(sheet);
    addBtn?.addEventListener('click', async () => {
      let ok;
      const norm = normalize(ings, [...sel].map(([id, qty]) => ({ id, qty })));
      const changed = mode === 'custom' ? changes(ings, norm) : [];
      if (changed.length) {
        // Maxsus: alohida savat qatori; bir xil sozlama bo'lsa — miqdor qo'shiladi.
        const key = lineKey(p.id, changed);
        const prev = cart.getCart().items[key]?.qty || 0;
        ok = await setQty(p, prev + q, { key, options: changed, optionsLabel: label(ings, norm, lang), price: unitPrice(p.price, ings, norm) });
      } else ok = await setQty(p, q);
      if (ok) { close(); toast(t('added'), { type: 'success' }); }
    });
    sheet.querySelector('#dish-remove')?.addEventListener('click', async () => { await setQty(p, 0); close(); });
  }

  // --- Savat paneli ---
  const bar = el.querySelector('#cart-bar');
  function refreshBar() {
    const c = cart.getCart();
    const n = cart.count();
    bar.hidden = n === 0;
    document.body.classList.toggle('has-cart-bar', n > 0);
    if (!n) return;
    bar.querySelector('.cart-bar-count').textContent = n;
    bar.querySelector('.cart-bar-label').textContent = c.restaurantId === r.id ? t('cart') : `${t('cart')} · ${c.restaurantName}`;
    bar.querySelector('.cart-bar-sum').textContent = formatSum(cart.itemsTotal());
  }
  bar.querySelector('.cart-bar-btn').addEventListener('click', () => go('cart'));

  // Savatdagi shu restoran taomlari stop-listga tushgan / o'chirilgan bo'lsa — ogohlantirish.
  function refreshCartWarning() {
    const c = cart.getCart();
    const warn = el.querySelector('#cart-warn');
    if (c.restaurantId !== r.id) { warn.hidden = true; return; }
    const bad = Object.keys(c.items).map(Number).filter((pid) => !products.get(pid)?.is_available);
    warn.hidden = bad.length === 0;
    if (!bad.length) return;
    warn.innerHTML = `${icon('alert')}<span></span><button class="btn btn-ghost" type="button">${t('remove_unavailable')}</button>`;
    warn.querySelector('span').textContent = t('unavailable_in_cart', { n: bad.length });
    warn.querySelector('button').addEventListener('click', () => {
      for (const pid of bad) cart.setQty(restaurantRef, { id: pid, is_available: false }, 0);
    });
  }

  const onCart = () => {
    for (const pid of products.keys()) refreshProduct(pid);
    refreshBar();
    refreshCartWarning();
  };
  window.addEventListener('cart:change', onCart);
  refreshBar();
  refreshCartWarning();

  // --- Yopishqoq tablar: bosilganda bo'limga, aylantirganda faol tab yangilanadi ---
  const tabs = el.querySelector('#tabs');
  let observer;
  if (tabs) {
    const selectTab = (key, scrollBar = true) => {
      tabs.querySelectorAll('.tab').forEach((tb) => {
        const on = tb.dataset.target === key;
        tb.setAttribute('aria-selected', String(on));
        tb.tabIndex = on ? 0 : -1;
        if (on && scrollBar) tabs.scrollTo({ left: tb.offsetLeft - 16, behavior: 'smooth' });
      });
    };
    tabs.addEventListener('click', (e) => {
      const tb = e.target.closest('.tab');
      if (!tb) return;
      const sec = el.querySelector(`#sec-${tb.dataset.target}`);
      const y = sec.getBoundingClientRect().top + window.scrollY - tabs.offsetHeight - 8;
      window.scrollTo({ top: y, behavior: 'smooth' });
      selectTab(tb.dataset.target);
    });
    tabs.addEventListener('keydown', (e) => {
      const list = [...tabs.querySelectorAll('.tab')];
      const i = list.indexOf(document.activeElement);
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (i < 0 || !d) return;
      const next = list[(i + d + list.length) % list.length];
      next.focus();
      next.click();
    });
    observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((en) => en.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible[0]) selectTab(visible[0].target.dataset.key);
    }, { rootMargin: '-25% 0px -65% 0px' });
    el.querySelectorAll('.menu-section').forEach((s) => observer.observe(s));
  }

  // Qidiruvdan taom tanlangan bo'lsa — o'sha taomga o'tamiz va belgilaymiz.
  const pid = params.get('product');
  const target = pid && el.querySelector(`.product-card[data-pid="${CSS.escape(pid)}"]`);
  if (target) {
    target.classList.add('is-highlighted');
    setTimeout(() => target.scrollIntoView({ block: 'center' }), 60);
  }

  return () => {
    window.removeEventListener('cart:change', onCart);
    observer?.disconnect();
    document.body.classList.remove('has-cart-bar');
  };
}
