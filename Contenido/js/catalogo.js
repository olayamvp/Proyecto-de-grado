(async () => {
await window.CLOTHES_PRODUCTS_READY;
const demoProducts = window.CLOTHES_PRODUCTS;
const catalogRoot = document.documentElement;
const catalogGender = catalogRoot.dataset.catalogGender;
const urlParams = new URLSearchParams(window.location.search);
const initialStyle = catalogRoot.dataset.catalogStyle;
document.getElementById('catalogSearch').value = urlParams.get('q') || '';
if (initialStyle) document.getElementById('styleFilter').value = initialStyle;
const catalogGrid = document.getElementById('productGrid');
const filterElements = ['catalogSearch', 'categoryFilter', 'brandFilter', 'priceFilter', 'sizeFilter', 'colorFilter', 'styleFilter', 'sortFilter'].map(id => document.getElementById(id));
const readList = (key) => { try { const value = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(value) ? value : []; } catch { return []; } };
const money = (amount) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(amount);

function populateOptions(id, values) {
  const select = document.getElementById(id);
  const placeholder = select.options[0];
  select.replaceChildren(placeholder);
  values.sort((a, b) => a.localeCompare(b, 'es')).forEach(value => {
    const option = document.createElement('option'); option.value = value; option.textContent = value; select.append(option);
  });
}
const matchesAudience = product => !catalogGender || catalogGender === 'estilo' || product.audience === catalogGender;
const audienceProducts = demoProducts.filter(matchesAudience);
populateOptions('categoryFilter', [...new Set(audienceProducts.map(product => product.category))]);
populateOptions('brandFilter', [...new Set(audienceProducts.map(product => product.brand))]);
populateOptions('sizeFilter', [...new Set(audienceProducts.flatMap(product => product.sizes))]);
populateOptions('colorFilter', [...new Set(audienceProducts.map(product => product.color))]);
const audienceName = value => ({ mujer: 'Mujer', hombre: 'Hombre', unisex: 'Unisex' })[value] || 'Unisex';


function renderProducts() {
  const query = document.getElementById('catalogSearch').value.trim().toLocaleLowerCase('es');
  const category = document.getElementById('categoryFilter').value;
  const brand = document.getElementById('brandFilter').value;
  const size = document.getElementById('sizeFilter').value;
  const color = document.getElementById('colorFilter').value;
  const price = document.getElementById('priceFilter').value;
  const style = document.getElementById('styleFilter').value;
  let products = demoProducts.filter(product => {
    const text = `${product.name} ${product.brand} ${product.category} ${product.styles.join(' ')}`.toLocaleLowerCase('es');
    return (!query || text.includes(query)) && matchesAudience(product) && (!category || product.category === category) && (!brand || product.brand === brand) && (!price || (price === 'under-100' ? product.price < 100000 : price === '100-180' ? product.price >= 100000 && product.price <= 180000 : product.price > 180000)) && (!size || product.sizes.includes(size)) && (!color || product.color === color) && (!style || product.styles.includes(style));
  });
  if (document.getElementById('sortFilter').value === 'price-low') products.sort((a, b) => a.price - b.price);
  if (document.getElementById('sortFilter').value === 'price-high') products.sort((a, b) => b.price - a.price);
  const favorites = readList('clothes.favorites');
  document.getElementById('resultCount').textContent = `${products.length} ${products.length === 1 ? 'prenda' : 'prendas'} disponibles`;
  document.getElementById('emptyState').hidden = products.length > 0;
  catalogGrid.innerHTML = products.map(product => `
    <article class="catalog-product">
      <div class="catalog-product-image"><img src="${product.image}" alt="${product.name} de ${product.brand}" loading="lazy"><span class="product-tag">${product.category} · ${audienceName(product.audience)}</span>
        <button class="favorite-toggle ${favorites.includes(product.id) ? 'is-favorite' : ''}" type="button" data-favorite="${product.id}" aria-label="${favorites.includes(product.id) ? 'Quitar de' : 'Añadir a'} favoritos" aria-pressed="${favorites.includes(product.id)}"><i class="fa-${favorites.includes(product.id) ? 'solid' : 'regular'} fa-heart" aria-hidden="true"></i></button>
      </div>
      <div class="catalog-product-info"><div class="product-brand-row">${product.logo ? `<img src="${product.logo}" alt="" loading="lazy">` : ''}<span>${product.brand}</span></div><h2>${product.name}</h2><div class="product-meta"><span>${money(product.price)} <small>${product.priceCurrencyOriginal ? 'COP aproximados desde EUR' : product.source === 'muestra' ? 'precio referencial' : 'consultado en tienda oficial'}</small></span><span>${product.color}</span></div><div class="product-actions"><label class="product-size-choice"><span class="visually-hidden">Talla para ${product.name}</span><select data-size-for="${product.id}">${product.sizes.map(size => `<option value="${size}">${size}</option>`).join('')}</select></label><button type="button" class="btn-product btn-cart" data-add-cart="${product.id}" ${product.officialUrl ? '' : 'disabled title="Prenda de muestra: no disponible para compra"'}>${product.officialUrl ? 'Añadir al carrito' : 'Solo muestra'}</button><button type="button" class="btn-product btn-try" data-try="${product.id}">Probar</button></div>${product.officialUrl ? `<a class="official-product-link" href="${product.officialUrl}" target="_blank" rel="noopener noreferrer">Consultar en tienda oficial ↗</a>` : ''}</div>
    </article>`).join('');
  catalogGrid.querySelectorAll('[data-favorite]').forEach(button => button.addEventListener('click', () => toggleFavorite(button.dataset.favorite)));
  catalogGrid.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => showProduct(button.dataset.view)));
  catalogGrid.querySelectorAll('[data-try]').forEach(button => button.addEventListener('click', () => queueTryOn(button.dataset.try)));
  catalogGrid.querySelectorAll('[data-add-cart]:not(:disabled)').forEach(button => button.addEventListener('click', () => { const size = catalogGrid.querySelector(`[data-size-for="${button.dataset.addCart}"]`).value; addToCart(button.dataset.addCart, size); }));
}

function addToCart(id, size) {
  const cart = readList('clothes.cart');
  const existing = cart.find(item => item.id === id && item.size === size);
  if (existing) existing.quantity += 1; else cart.push({ id, size, quantity: 1 });
  localStorage.setItem('clothes.cart', JSON.stringify(cart));
  updateCartBadge(); announce('Prenda añadida al carrito.');
}
function updateCartBadge() {
  const badge = document.querySelector('[data-cart-count]');
  if (!badge) return;
  const count = readList('clothes.cart').reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  badge.textContent = count; badge.hidden = count === 0;
}
function toggleFavorite(id) {
  const favorites = readList('clothes.favorites');
  const next = favorites.includes(id) ? favorites.filter(item => item !== id) : [...favorites, id];
  localStorage.setItem('clothes.favorites', JSON.stringify(next));
  renderProducts();
  announce(next.includes(id) ? 'Prenda guardada en favoritos.' : 'Prenda eliminada de favoritos.');
}
function showProduct(id) {
  const product = demoProducts.find(item => item.id === id);
  const content = document.getElementById('productModalContent');
  content.innerHTML = `<div class="product-detail"><img src="${product.image}" alt="${product.name} de ${product.brand}"><div><p class="eyebrow">${product.brand} · ${product.category} · ${audienceName(product.audience)}</p><h2 id="modalProductName">${product.name}</h2><p>${product.description}</p><p class="detail-price">${money(product.price)} <small>${product.priceCurrencyOriginal ? 'COP aproximados desde EUR' : product.source === 'muestra' ? 'precio referencial' : 'precio consultado; puede cambiar'}</small></p><p><strong>${product.source === 'muestra' ? 'Tallas de referencia' : 'Tallas publicadas'}:</strong> ${product.sizes.join(' · ')}</p><p><strong>Estilos:</strong> ${product.styles.join(', ')}</p><p><strong>Color:</strong> ${product.color}</p>${product.officialUrl ? `<a class="btn btn-dark" href="${product.officialUrl}" target="_blank" rel="noopener noreferrer">Consultar en la tienda oficial</a>` : '<span class="sample-only">Prenda de muestra · no disponible para compra</span>'} <button class="btn btn-outline-dark" type="button" data-modal-try="${product.id}">Guardar para probar</button></div></div>`;
  content.querySelector('[data-modal-try]').addEventListener('click', () => { bootstrap.Modal.getOrCreateInstance(document.getElementById('productModal')).hide(); queueTryOn(id); });
  bootstrap.Modal.getOrCreateInstance(document.getElementById('productModal')).show();
}
function queueTryOn(id) {
  const queue = readList('clothes.tryOnQueue');
  if (!queue.includes(id)) queue.push(id);
  localStorage.setItem('clothes.tryOnQueue', JSON.stringify(queue));
  if (!readList('clothes.worn').length) { localStorage.setItem('clothes.worn', JSON.stringify([id])); if (window.NOVUM_TRACK) window.NOVUM_TRACK('try-on', id); }
  announce('Prenda guardada. Abre Mi avatar para verla en el probador.');
}
function announce(message) {
  const notice = document.getElementById('catalogNotice');
  notice.textContent = message; notice.hidden = false;
  window.clearTimeout(announce.timer); announce.timer = window.setTimeout(() => { notice.hidden = true; }, 5000);
}
filterElements.forEach(element => element.addEventListener(element.tagName === 'INPUT' ? 'input' : 'change', renderProducts));
document.getElementById('clearFilters').addEventListener('click', () => { filterElements.forEach(element => { element.value = ''; }); document.getElementById('sortFilter').value = 'featured'; renderProducts(); });
renderProducts();

fetch('../header.html').then(response => { if (!response.ok) throw new Error('No se pudo cargar la navegación'); return response.text(); }).then(html => {
  document.getElementById('header').innerHTML = html;
  updateCartBadge();
  const saved = localStorage.getItem('theme');
  const theme = saved || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  catalogRoot.setAttribute('data-theme', theme);
  const toggle = document.querySelector('[data-action="toggle-theme"]');
  const icon = toggle && toggle.querySelector('i');
  const syncIcon = () => { if (icon) { icon.classList.toggle('fa-moon', catalogRoot.getAttribute('data-theme') !== 'dark'); icon.classList.toggle('fa-sun', catalogRoot.getAttribute('data-theme') === 'dark'); } };
  syncIcon();
  if (toggle) toggle.addEventListener('click', () => { const next = catalogRoot.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'; catalogRoot.setAttribute('data-theme', next); localStorage.setItem('theme', next); syncIcon(); });
}).catch(error => console.error(error));
})();
