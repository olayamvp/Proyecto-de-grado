/* Acciones comunes de una prenda en cualquier página: añadir al carrito, enviarla al probador
   (avatar) y enlazar el Instagram oficial de su marca. Las usan el catálogo, el buscador y la
   página de cada marca, para que el comportamiento y la analítica sean siempre los mismos. */
(() => {
  const INSTAGRAM = {
    'Weedgreen': 'wgreen___', 'Buds': 'buds.med', 'Savage': 'svg_savage_svg', 'True': 'true_________________',
    'Undergold': 'undergold_', 'ZIPRE': 'zipre.co', 'Kame.col': 'kame.col', 'SINNERS': 'thesinnersgallery',
    'Mattelsa': 'mattelsa', 'Homen': 'homen___', 'A New Cross': 'anewcross', 'Agua Bendita': 'aguabyaguabendita',
    'Baobab': 'baobab', 'Suki Cohen': 'sukicohen', 'Maygel Coronel': 'maygelcoronel', 'Lobo Rosa': 'loborosaloborosa',
    'Low Trip': 'lowtrip.studios', 'Agybo': 'agybo', 'Zohet': 'zohet_soy_diferente', 'One Five': '_onefive1',
  };
  const read = key => { try { const value = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(value) ? value : []; } catch { return []; } };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function updateCartBadge() {
    const badge = document.querySelector('[data-cart-count]');
    if (!badge) return;
    const count = read('clothes.cart').reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
    badge.textContent = count; badge.hidden = count === 0;
  }
  // Aviso breve; usa el aviso de la página si existe (catálogo) o crea uno flotante.
  function announce(message) {
    let notice = document.getElementById('catalogNotice') || document.getElementById('prendaNotice');
    if (!notice) {
      notice = document.createElement('p');
      notice.id = 'prendaNotice'; notice.className = 'prenda-notice'; notice.setAttribute('role', 'status'); notice.setAttribute('aria-live', 'polite');
      document.body.appendChild(notice);
    }
    notice.textContent = message; notice.hidden = false;
    clearTimeout(announce.timer); announce.timer = setTimeout(() => { notice.hidden = true; }, 5000);
  }
  function addToCart(product, size, component) {
    if (!product || !product.officialUrl) return false;
    const cart = read('clothes.cart');
    const existing = cart.find(item => item.id === product.id && item.size === size);
    if (existing) existing.quantity += 1; else cart.push({ id: product.id, size, quantity: 1 });
    localStorage.setItem('clothes.cart', JSON.stringify(cart));
    updateCartBadge(); announce('Prenda añadida al carrito.');
    // Solo después de guardar: una acción explícita = un evento (cambios de cantidad en el carrito no cuentan).
    if (window.NOVUM_ANALYTICS) window.NOVUM_ANALYTICS.track({ type: 'add_to_cart', brand: product.brand, productId: product.id, quantityAdded: 1, component });
    return true;
  }
  function queueTryOn(product) {
    if (!product) return;
    const queue = read('clothes.tryOnQueue');
    if (!queue.includes(product.id)) queue.push(product.id);
    localStorage.setItem('clothes.tryOnQueue', JSON.stringify(queue));
    if (!read('clothes.worn').length) { localStorage.setItem('clothes.worn', JSON.stringify([product.id])); if (window.NOVUM_TRACK) window.NOVUM_TRACK('try-on', product.id); }
    announce('Prenda guardada. Abre Mi avatar para verla en el probador.');
  }
  const instagramUrl = brand => INSTAGRAM[brand] ? `https://www.instagram.com/${INSTAGRAM[brand]}/` : '';
  function instagramLink(brand, { productId = null, component = 'otro', className = 'instagram-link', label } = {}) {
    const url = instagramUrl(brand);
    if (!url) return '';
    const attrs = window.NOVUM_ANALYTICS ? window.NOVUM_ANALYTICS.outboundAttributes({ brand, productId, component }) : '';
    return `<a class="${className}" href="${url}" target="_blank" rel="noopener noreferrer" ${attrs}><i class="fa-brands fa-instagram" aria-hidden="true"></i> ${esc(label || `@${INSTAGRAM[brand]}`)}</a>`;
  }
  // Controles de la tarjeta: talla, «Añadir al carrito» y «Probar» (mismo marcado que el catálogo).
  function actionsHtml(product) {
    return `<div class="product-actions"><label class="product-size-choice"><span class="visually-hidden">Talla para ${esc(product.name)}</span><select data-size-for="${esc(product.id)}">${(product.sizes || ['Única']).map(size => `<option value="${esc(size)}">${esc(size)}</option>`).join('')}</select></label><button type="button" class="btn-product btn-cart" data-add-cart="${esc(product.id)}" ${product.officialUrl ? '' : 'disabled title="Prenda de muestra: no disponible para compra"'}>${product.officialUrl ? 'Añadir al carrito' : 'Solo muestra'}</button><button type="button" class="btn-product btn-try" data-try="${esc(product.id)}">Probar</button></div>`;
  }
  // Un solo listener por contenedor, aunque se vuelva a pintar la lista.
  function bindActions(container, products, component) {
    if (!container || container.dataset.prendaBound) return;
    container.dataset.prendaBound = 'true';
    container.addEventListener('click', event => {
      const cartButton = event.target.closest('[data-add-cart]');
      const tryButton = event.target.closest('[data-try]');
      const find = id => (typeof products === 'function' ? products() : products).find(product => product.id === id);
      if (cartButton && !cartButton.disabled) {
        const select = container.querySelector(`[data-size-for="${CSS.escape(cartButton.dataset.addCart)}"]`);
        addToCart(find(cartButton.dataset.addCart), select ? select.value : 'Única', component);
      } else if (tryButton) queueTryOn(find(tryButton.dataset.try));
    });
  }
  window.NOVUM_PRENDA = { INSTAGRAM, instagramUrl, instagramLink, addToCart, queueTryOn, actionsHtml, bindActions, announce, updateCartBadge };
})();
