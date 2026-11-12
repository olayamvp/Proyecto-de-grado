// Revisa la página oficial de cada producto y genera Contenido/js/productos-retirados.js con
// los que la tienda ya no tiene (404/410). Las respuestas dudosas (429, 5xx, tiempo agotado)
// no retiran nada: solo se informan. Ejecutar:  node scripts/verificar-enlaces.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = path => readFileSync(`${root}${path}`, 'utf8');
const sandbox = { window: {} };
vm.createContext(sandbox);
const base = read('Contenido/js/clothes-data.js');
vm.runInContext(base.slice(0, base.indexOf('const homenSnapshotReady')), sandbox);
for (const file of ['homen', 'partner', 'savage', 'zipre', 'kame', 'weedgreen']) vm.runInContext(read(`Contenido/js/${file}-products.js`), sandbox);
const w = sandbox.window;
const products = [...new Map([w.CLOTHES_PRODUCTS, w.HOMEN_PRODUCTS, w.PARTNER_PRODUCTS, w.SAVAGE_PRODUCTS, w.ZIPRE_PRODUCTS, w.KAME_PRODUCTS, w.WEEDGREEN_PRODUCTS]
  .filter(Array.isArray).flat().filter(p => p.officialUrl).map(p => [p.id, p])).values()];

// Tiendas caídas por completo, verificadas a mano (el sitio entero responde error).
const MANUAL = { 'lobo-rosa-ciara-dress-blue': 'tienda loborosa.com fuera de línea (503) desde 2026-11-12' };

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function status(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh) NovumLabel-verificador' }, signal: AbortSignal.timeout(20000) });
      if (response.status !== 429) return response.status;
    } catch { if (attempt === 2) return 'sin respuesta'; }
    await sleep(4000 * (attempt + 1));
  }
  return 429;
}
// Partimos de lo ya confirmado: una tienda que hoy no responde (429/5xx) no "revive" ni retira nada.
const previous = (() => { try { const box = { window: {} }; vm.runInNewContext(read('Contenido/js/productos-retirados.js'), box); return box.window.RETIRED_PRODUCTS || {}; } catch { return {}; } })();
const retired = { ...previous }, doubtful = [];
const queue = [...products];
await Promise.all(Array.from({ length: 4 }, async () => {
  for (let product = queue.shift(); product; product = queue.shift()) {
    const code = await status(product.officialUrl);
    if (code === 404 || code === 410) retired[product.id] = `${product.brand}: la tienda responde ${code}`;
    else if (code === 200) delete retired[product.id];
    else doubtful.push(`${code} ${product.id} ${product.officialUrl}`);
    await sleep(600);
  }
}));
Object.assign(retired, MANUAL); // las tiendas caídas se mantienen hasta revisarlas a mano
const today = new Date().toISOString().slice(0, 10);
writeFileSync(`${root}Contenido/js/productos-retirados.js`, `/* Productos que la tienda oficial ya no tiene: no se muestran en el catálogo.
   Generado por scripts/verificar-enlaces.mjs el ${today}. */
window.RETIRED_PRODUCTS = ${JSON.stringify(Object.fromEntries(Object.entries(retired).sort()), null, 1)};
`);
console.log(`Revisados ${products.length} productos: ${Object.keys(retired).length} retirados, ${doubtful.length} sin confirmar.`);
if (doubtful.length) console.log(`Sin confirmar (se mantienen visibles):\n${doubtful.join('\n')}`);
