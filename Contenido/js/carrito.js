(() => {
  window.CLOTHES_PRODUCTS_READY.then(() => initializeCart()).catch(() => initializeCart());
  function initializeCart() {
  const products = window.CLOTHES_PRODUCTS || [];
  const read = () => { try { const value = JSON.parse(localStorage.getItem('clothes.cart') || '[]'); return Array.isArray(value) ? value : []; } catch { return []; } };
  const money = amount => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(amount);
  const grid = document.getElementById('cartItems');
  const summary = document.getElementById('cartSummary');
  const esc = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function updateBadge() { const badge = document.querySelector('[data-cart-count]'); if (!badge) return; const count = read().reduce((n, item) => n + (Number(item.quantity) || 0), 0); badge.textContent = count; badge.hidden = count === 0; }
  function render() {
    const cart = read().filter(item => products.some(product => product.id === item.id));
    localStorage.setItem('clothes.cart', JSON.stringify(cart)); updateBadge();
    if (!cart.length) { grid.innerHTML = '<div class="cart-empty"><p class="eyebrow">AÚN NO HAY PRENDAS</p><h2>Tu carrito está vacío.</h2><p>Explora el catálogo, elige una talla y añade tus favoritas.</p><a class="btn btn-dark" href="./ropa_hombre.html">Ir al catálogo</a></div>'; summary.hidden = true; return; }
    grid.innerHTML = cart.map((item,index) => { const p=products.find(product=>product.id===item.id); return `<article class="cart-item"><img src="${p.image}" alt="${esc(p.name)} de ${esc(p.brand)}" loading="lazy"><div class="cart-item-info"><p class="eyebrow">${esc(p.brand)} · ${esc(p.category)}</p><h2>${esc(p.name)}</h2><p>Talla: <strong>${esc(item.size)}</strong></p><strong>${money(p.price)}</strong>${p.priceCurrencyOriginal?'<small class="cart-demo">COP aproximados desde EUR; confirma en la tienda.</small>':''}${p.source==='muestra'?'<small class="cart-demo">Precio de referencia; producto de muestra.</small>':''}</div><div class="cart-item-controls"><label>Cantidad <select data-quantity="${index}">${[1,2,3,4,5,6,7,8,9,10].map(n=>`<option ${Number(item.quantity)===n?'selected':''}>${n}</option>`).join('')}</select></label><button class="cart-remove" type="button" data-remove="${index}">Quitar</button></div></article>`; }).join('');
    const total=cart.reduce((sum,item)=>sum+products.find(p=>p.id===item.id).price*(Number(item.quantity)||1),0);
    const savings=Math.round(total*0.10), discountedTotal=total-savings;
    const groups=[...new Set(cart.map(item=>products.find(p=>p.id===item.id).brand))];
    summary.hidden=false; summary.innerHTML=`<div><p class="eyebrow">RESUMEN</p><h2>Total referencial</h2><div class="cart-price-breakdown"><span>Subtotal</span><strong>${money(total)}</strong><span>Descuento Novum Label · 10% (estimado)</span><strong class="cart-savings">−${money(savings)}</strong><span class="cart-final-label">Total con descuento estimado</span><strong class="cart-total">${money(discountedTotal)}</strong></div><p class="cart-explainer">El 10% es un ahorro estimado en Novum Label; solo será válido en la tienda oficial si la marca ofrece o acepta un código promocional. Cada marca fija el precio final, envío y disponibilidad. Novum Label no procesa pagos ni transmite cupones.</p><button type="button" class="cart-clear" data-clear>Vaciar carrito</button></div><div class="cart-checkout"><h3>Continuar por marca</h3>${groups.map(brand=>{const items=cart.filter(item=>products.find(p=>p.id===item.id).brand===brand);const links=items.map(item=>products.find(p=>p.id===item.id)).filter(p=>p.officialUrl);return links.length?`<div class="brand-checkout"><strong>${esc(brand)}</strong>${links.map(p=>`<a href="${p.officialUrl}" target="_blank" rel="noopener noreferrer">Ver ${esc(p.name)} y pagar en tienda oficial ↗</a>`).join('')}</div>`:`<div class="brand-checkout"><strong>${esc(brand)}</strong><p>Estas prendas son muestras y no están disponibles para compra.</p></div>`;}).join('')}</div>`;
    grid.querySelectorAll('[data-quantity]').forEach(control=>control.addEventListener('change',()=>{const next=read();next[Number(control.dataset.quantity)].quantity=Number(control.value);localStorage.setItem('clothes.cart',JSON.stringify(next));render();}));
    grid.querySelectorAll('[data-remove]').forEach(button=>button.addEventListener('click',()=>{const next=read();next.splice(Number(button.dataset.remove),1);localStorage.setItem('clothes.cart',JSON.stringify(next));render();}));
    summary.querySelector('[data-clear]').addEventListener('click',()=>{localStorage.removeItem('clothes.cart');render();});
  }
  fetch('../header.html').then(r=>r.text()).then(html=>{document.getElementById('header').innerHTML=html;const root=document.documentElement;root.setAttribute('data-theme',localStorage.getItem('theme')||'light');const toggle=document.querySelector('[data-action="toggle-theme"]');if(toggle)toggle.addEventListener('click',()=>{const next=root.getAttribute('data-theme')==='dark'?'light':'dark';root.setAttribute('data-theme',next);localStorage.setItem('theme',next);});updateBadge();}).catch(console.error);
  render();
  }
})();
