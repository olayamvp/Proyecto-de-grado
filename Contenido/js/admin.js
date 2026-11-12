const token = sessionStorage.getItem('novum.accessToken');
const messageNode = document.getElementById('adminMessage');
const rowsNode = document.getElementById('productRows');
let products = [];
let stats = {};
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]);
const say = text => { messageNode.textContent = text; };
const headers = () => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });
if (!token) location.replace('./acceso.html');
fetch('../../header.html').then(r => r.text()).then(html => { document.getElementById('header').innerHTML = html; }).catch(() => {});
document.getElementById('adminIdentity').textContent = `Sesión: ${sessionStorage.getItem('novum.userEmail') || ''}`;
async function loadCatalog() {
  const response = await fetch('/api/admin', { headers: headers() });
  if (!response.ok) { if (response.status === 401 || response.status === 403) { sessionStorage.removeItem('novum.accessToken'); location.replace('./acceso.html'); } throw new Error((await response.json()).error || 'No se pudo leer inventario.'); }
  products = await response.json(); renderRows();
}
function renderRows() {
  rowsNode.innerHTML = products.map((p, index) => `<tr><td><input data-field="name" data-index="${index}" value="${esc(p.name)}" aria-label="Nombre de producto"></td><td>${esc(p.brand)}</td><td><input type="number" min="0" step="1000" data-field="price" data-index="${index}" value="${Number(p.price)||0}" aria-label="Precio"></td><td><input data-field="category" data-index="${index}" value="${esc(p.category)}" aria-label="Categoría"></td><td><input data-field="color" data-index="${index}" value="${esc(p.color)}" aria-label="Color"></td><td><input data-field="image" data-index="${index}" value="${esc(p.image||'')}" aria-label="Imagen"></td><td><input type="url" data-field="officialUrl" data-index="${index}" value="${esc(p.officialUrl||'')}" aria-label="Enlace oficial"></td><td><input type="checkbox" data-field="active" data-index="${index}" ${p.active === false ? '' : 'checked'} aria-label="Producto visible"></td><td>${Number(stats[p.id]||0)}</td></tr>`).join('');
}
async function loadStats() {
  const response = await fetch('/api/analytics', { headers: headers() });
  if (!response.ok) throw new Error((await response.json()).error || 'No hay estadísticas disponibles.');
  const data = await response.json(); 
  stats = Object.fromEntries(data.tryOnByProduct.map(item => [item.productId, item.tries])); renderRows();
}
rowsNode.addEventListener('input', event => { const target = event.target; const index = Number(target.dataset.index); if (!Number.isInteger(index) || !target.dataset.field) return; products[index][target.dataset.field] = target.dataset.field === 'price' ? Number(target.value) : target.value; });
rowsNode.addEventListener('change', event => { const target = event.target; if (target.dataset.field === 'active') products[Number(target.dataset.index)].active = target.checked; });
document.getElementById('saveCatalog').addEventListener('click', async () => { try { const response = await fetch('/api/admin', { method: 'POST', headers: headers(), body: JSON.stringify({ products }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'No se guardaron los cambios.'); say(`Se guardaron ${data.saved} prendas.`); await loadCatalog(); } catch (error) { say(error.message); } });
document.getElementById('importCatalog').addEventListener('click', async () => { if (!confirm('¿Importar el catálogo que está publicado en este navegador? Esta acción sube y sincroniza los productos.')) return; try { await window.CLOTHES_PRODUCTS_READY; products = window.CLOTHES_PRODUCTS.map(p => ({ ...p, active: true })); const response = await fetch('/api/admin', { method: 'POST', headers: headers(), body: JSON.stringify({ products }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'No se pudo importar.'); say(`Catálogo inicial importado: ${data.saved} prendas.`); await loadCatalog(); } catch (error) { say(error.message); } });
document.getElementById('logoutButton').addEventListener('click', () => { sessionStorage.removeItem('novum.accessToken'); sessionStorage.removeItem('novum.userEmail'); location.href = './acceso.html'; });
// Las pruebas del probador (/api/analytics) son opcionales: si no están activas, la columna queda vacía sin error.
loadCatalog().then(() => loadStats().catch(() => {})).catch(error => say(error.message));
