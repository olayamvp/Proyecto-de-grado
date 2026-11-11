(() => {
  window.CLOTHES_PRODUCTS_READY.then(() => initializeTryOn()).catch(() => initializeTryOn());
  function initializeTryOn() {
  const products = window.CLOTHES_PRODUCTS || [];
  const prendas = window.NOVUM_PRENDAS;
  const form = document.getElementById('avatarForm');
  const list = document.getElementById('tryOnItems');
  const moreButton = document.getElementById('tryOnMore');
  const filter = document.getElementById('tryOnFilter');
  const intro = document.getElementById('tryOnIntro');
  const heightInput = document.getElementById('avatarHeight');
  const weightInput = document.getElementById('avatarWeight');
  const DEFAULTS = {
    mujer: { gender: 'mujer', height: 163, weight: 58, skin: '#e0a982', hairStyle: 'largo', hairColor: '#3b2a20', eyeColor: '#6b4423', eyeShape: 'almendrados', brows: 'normales', beard: 'ninguna' },
    hombre: { gender: 'hombre', height: 175, weight: 72, skin: '#c98e65', hairStyle: 'corto', hairColor: '#1f1a17', eyeColor: '#3b2416', eyeShape: 'almendrados', brows: 'normales', beard: 'ninguna' },
  };
  const LIMITS = { height: [140, 210], weight: [40, 160] };
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
  const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };
  const clamp = (value, [min, max], fallback) => Math.min(max, Math.max(min, Number(value) || fallback));
  // Older profiles had a third "neutro" body and wider ranges; map them onto the current ones.
  function profile() {
    const saved = read('clothes.profile', {}) || {};
    const gender = saved.gender === 'hombre' ? 'hombre' : 'mujer';
    const merged = { ...DEFAULTS[gender], ...saved, gender };
    merged.height = clamp(merged.height, LIMITS.height, DEFAULTS[gender].height);
    merged.weight = clamp(merged.weight, LIMITS.weight, DEFAULTS[gender].weight);
    if (gender === 'mujer') merged.beard = 'ninguna';
    return merged;
  }
  const queue = () => read('clothes.tryOnQueue', []);
  const wornIds = () => { const value = read('clothes.worn', []); return Array.isArray(value) ? value : value ? [value] : []; };
  const byId = id => products.find(product => product.id === id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const colorLabel = color => color === 'Diseño de muestra' ? 'Multicolor' : color;
  const audienceLabel = audience => ({ mujer: 'MUJER', hombre: 'HOMBRE', unisex: 'UNISEX' })[audience] || 'UNISEX';
  const price = value => Number(value) ? Number(value).toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }) : '';
  const slotGroup = product => prendas.spec(product)?.slot || null;

  function emitAvatar() {
    const p = profile();
    const garments = wornIds().map(byId).filter(Boolean);
    document.getElementById('avatarMeasures').textContent = `${p.height} cm · ${p.weight} kg`;
    document.getElementById('avatarPreviewTitle').textContent = garments.length ? 'Tu conjunto' : 'Tu avatar';
    renderWorn(garments);
    window.dispatchEvent(new CustomEvent('clothes:avatar-updated', { detail: { profile: p, garments } }));
  }
  function renderWorn(garments) {
    const box = document.getElementById('wornItems');
    box.innerHTML = garments.map(item => `<span>${esc(item.name)}<button type="button" data-unwear="${esc(item.id)}" aria-label="Quitar ${esc(item.name)} del avatar">×</button></span>`).join('');
    box.querySelectorAll('[data-unwear]').forEach(button => button.addEventListener('click', () => toggleWear(button.dataset.unwear)));
  }

  // ---- Profile form: every change is saved and shown at once ----
  function fillForm(p) {
    for (const [key, value] of Object.entries(p)) {
      const field = form.elements[key];
      if (!field) continue;
      if (field instanceof RadioNodeList || field.length) {
        let matched = false;
        for (const option of form.querySelectorAll(`input[name="${key}"]`)) { option.checked = option.value === String(value); matched ||= option.checked; }
        if (!matched && field.tagName === 'SELECT') field.value = value;
      } else field.value = value;
    }
    form.querySelectorAll('[data-only]').forEach(element => { element.hidden = element.dataset.only !== p.gender; });
    syncMeasurements();
  }
  function syncMeasurements() {
    const height = Number(heightInput.value), weight = Number(weightInput.value);
    document.getElementById('avatarHeightValue').textContent = `${height} cm`;
    document.getElementById('avatarWeightValue').textContent = `${weight} kg`;
    heightInput.setAttribute('aria-valuetext', `${height} centímetros`);
    weightInput.setAttribute('aria-valuetext', `${weight} kilogramos`);
  }
  function formProfile() {
    const data = new FormData(form);
    const next = { ...profile() };
    for (const key of ['gender', 'skin', 'hairStyle', 'hairColor', 'eyeColor', 'eyeShape', 'brows', 'beard']) if (data.get(key)) next[key] = data.get(key);
    next.height = clamp(heightInput.value, LIMITS.height, next.height);
    next.weight = clamp(weightInput.value, LIMITS.weight, next.weight);
    return next;
  }
  let previewTimer;
  function saveProfile(next, delay = 0) {
    write('clothes.profile', next);
    clearTimeout(previewTimer);
    previewTimer = setTimeout(emitAvatar, delay);
  }
  form.addEventListener('input', event => {
    const target = event.target;
    if (target.name === 'gender') {
      // Switching body type keeps custom choices but swaps the other body's defaults.
      const before = profile(), gender = target.value, other = DEFAULTS[before.gender], mine = DEFAULTS[gender];
      const next = { ...before, gender };
      for (const key of ['hairStyle', 'hairColor', 'eyeColor', 'skin', 'height', 'weight']) if (before[key] === other[key]) next[key] = mine[key];
      if (gender === 'mujer') next.beard = 'ninguna';
      fillForm(next);
      saveProfile(next);
      list.dataset.page = '1';
      renderCloset();
      return;
    }
    if (target === heightInput || target === weightInput) { syncMeasurements(); saveProfile(formProfile(), 90); return; }
    saveProfile(formProfile());
  });
  form.addEventListener('submit', event => event.preventDefault());
  form.querySelectorAll('[data-focus]').forEach(group => group.addEventListener('focusin', () => setView(group.dataset.focus)));
  document.getElementById('avatarReset').addEventListener('click', () => {
    const fresh = DEFAULTS[profile().gender];
    fillForm(fresh);
    saveProfile(fresh);
    setView('body');
  });

  function setView(view) {
    document.querySelectorAll('[data-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === view)));
    window.dispatchEvent(new CustomEvent('clothes:avatar-focus', { detail: view }));
  }
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));

  // ---- Closet: saved garments or the whole inventory ----
  let source = queue().length ? 'saved' : 'inventory';
  const PAGE = 12;
  function toggleWear(id) {
    const item = byId(id);
    if (!item) return;
    let selected = wornIds();
    if (selected.includes(id)) selected = selected.filter(other => other !== id);
    else {
      const slots = prendas.slotsOf(item);
      if (!slots.length) return;
      selected = selected.filter(other => !prendas.slotsOf(byId(other)).some(slot => slots.includes(slot)));
      selected.push(id);
      if (window.NOVUM_TRACK) window.NOVUM_TRACK('try-on', id);
    }
    if (selected.length) write('clothes.worn', selected); else localStorage.removeItem('clothes.worn');
    renderCloset();
  }
  function visibleItems() {
    const gender = profile().gender;
    const kind = filter.value;
    const pool = source === 'saved'
      ? queue().map(byId).filter(Boolean)
      : products.filter(product => prendas.wearable(product) && (product.audience === gender || product.audience === 'unisex' || !product.audience));
    return pool.filter(product => kind === 'all' || slotGroup(product) === kind);
  }
  function renderCloset() {
    document.querySelectorAll('[data-source]').forEach(tab => tab.setAttribute('aria-selected', String(tab.dataset.source === source)));
    intro.textContent = source === 'saved'
      ? 'Prendas que guardaste desde el catálogo con «Probar».'
      : `Prendas del inventario para ${profile().gender === 'hombre' ? 'hombre' : 'mujer'} y unisex que el avatar puede vestir.`;
    const items = visibleItems();
    const page = Number(list.dataset.page || 1);
    const shown = items.slice(0, page * PAGE);
    moreButton.hidden = shown.length >= items.length;
    if (!items.length) {
      list.innerHTML = source === 'saved'
        ? '<div class="tryon-empty">No has guardado prendas. En el catálogo pulsa «Probar», o abre la pestaña Inventario para elegir aquí mismo.</div>'
        : '<div class="tryon-empty">No hay prendas de este tipo en el inventario.</div>';
      emitAvatar();
      return;
    }
    const wearing = wornIds(), saved = queue();
    list.innerHTML = shown.map(item => {
      const wearable = prendas.wearable(item);
      const on = wearing.includes(item.id);
      const secondary = saved.includes(item.id)
        ? `<button type="button" data-remove-try="${esc(item.id)}">Quitar de guardadas</button>`
        : `<button type="button" data-save-try="${esc(item.id)}">Guardar</button>`;
      return `<article class="tryon-card${on ? ' is-worn' : ''}"><img src="${esc(item.image)}" alt="${esc(item.name)}" loading="lazy"><div><p class="eyebrow">${esc(item.brand || '')} · ${audienceLabel(item.audience)}</p><h3>${esc(item.name)}</h3><p>${esc(item.category)} · ${esc(colorLabel(item.color))}${price(item.price) ? ` · ${price(item.price)}` : ''}</p><div class="tryon-actions">${wearable
        ? `<button type="button" data-wear="${esc(item.id)}" aria-pressed="${on}">${on ? 'Quitar del avatar' : 'Poner en avatar'}</button>`
        : '<button type="button" disabled>No se muestra en el avatar</button>'}${secondary}</div></div></article>`;
    }).join('');
    list.querySelectorAll('[data-wear]').forEach(button => button.addEventListener('click', () => toggleWear(button.dataset.wear)));
    list.querySelectorAll('[data-save-try]').forEach(button => button.addEventListener('click', () => {
      write('clothes.tryOnQueue', [...new Set([...queue(), button.dataset.saveTry])]);
      renderCloset();
    }));
    list.querySelectorAll('[data-remove-try]').forEach(button => button.addEventListener('click', () => {
      write('clothes.tryOnQueue', queue().filter(id => id !== button.dataset.removeTry));
      const remaining = wornIds().filter(id => id !== button.dataset.removeTry);
      if (remaining.length) write('clothes.worn', remaining); else localStorage.removeItem('clothes.worn');
      renderCloset();
    }));
    emitAvatar();
  }
  document.querySelectorAll('[data-source]').forEach(tab => tab.addEventListener('click', () => { source = tab.dataset.source; list.dataset.page = '1'; renderCloset(); }));
  filter.addEventListener('change', () => { list.dataset.page = '1'; renderCloset(); });
  moreButton.addEventListener('click', () => { list.dataset.page = String(Number(list.dataset.page || 1) + 1); renderCloset(); });

  fillForm(profile());
  write('clothes.profile', profile());
  fetch('../header.html').then(r => r.text()).then(html => {
    document.getElementById('header').innerHTML = html; const root = document.documentElement; root.setAttribute('data-theme', localStorage.getItem('theme') || 'light');
    const toggle = document.querySelector('[data-action="toggle-theme"]'); if (toggle) toggle.addEventListener('click', () => { const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'; root.setAttribute('data-theme', next); localStorage.setItem('theme', next); });
    const badge = document.querySelector('[data-cart-count]'); if (badge) { try { const cart = JSON.parse(localStorage.getItem('clothes.cart') || '[]'); badge.textContent = cart.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0); badge.hidden = Number(badge.textContent) === 0; } catch { badge.hidden = true; } }
  }).catch(console.error);
  renderCloset();
  }
})();
