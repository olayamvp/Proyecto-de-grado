// Genera netlify/lib/catalogo-indice.json (producto → marca) desde los archivos del catálogo,
// para que el servidor verifique que cada evento corresponde a un producto y marca reales.
// Ejecutar después de cambiar el catálogo:  node scripts/generar-indice-analitica.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { brandSlug } from '../netlify/lib/eventos.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = path => readFileSync(`${root}${path}`, 'utf8');
const sandbox = { window: {} };
vm.createContext(sandbox);
// Solo la lista inicial de clothes-data.js; el resto del archivo usa APIs del navegador.
const base = read('Contenido/js/clothes-data.js');
vm.runInContext(base.slice(0, base.indexOf('const homenSnapshotReady')), sandbox);
for (const file of ['homen', 'partner', 'savage', 'zipre', 'kame', 'weedgreen']) vm.runInContext(read(`Contenido/js/${file}-products.js`), sandbox);
const w = sandbox.window;
const products = [w.CLOTHES_PRODUCTS, w.HOMEN_PRODUCTS, w.PARTNER_PRODUCTS, w.SAVAGE_PRODUCTS, w.ZIPRE_PRODUCTS, w.KAME_PRODUCTS, w.WEEDGREEN_PRODUCTS]
  .filter(Array.isArray).flat()
  .filter(product => product.brand !== 'Seven Seven' && product.brand !== 'EiiNA');

const index = { products: {}, brands: [] };
const conflicts = [];
for (const product of products) {
  const brand = brandSlug(product.brand);
  if (index.products[product.id] && index.products[product.id] !== brand) conflicts.push(product.id);
  index.products[product.id] = brand;
}
const discovery = read('Contenido/js/descubrimiento.js');
const brandBlock = discovery.slice(discovery.indexOf('const demoBrands'), discovery.indexOf('];', discovery.indexOf('const demoBrands')));
const directory = [...brandBlock.matchAll(/\{ name: '([^']+)'/g)].map(match => brandSlug(match[1]));
index.brands = [...new Set([...Object.values(index.products), ...directory])].sort();
if (conflicts.length) throw new Error(`Productos con dos marcas distintas: ${conflicts.join(', ')}`);
writeFileSync(`${root}netlify/lib/catalogo-indice.json`, `${JSON.stringify(index)}\n`);
console.log(`Índice generado: ${Object.keys(index.products).length} productos, ${index.brands.length} marcas.`);
