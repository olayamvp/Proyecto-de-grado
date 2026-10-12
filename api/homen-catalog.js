import { json } from './_supabase.js';

const STORE_URL = 'https://www.homen.com.co';
const COLOR_NAMES = [
  'blanco hueso', 'azul petroleo', 'azul hortencia', 'azul marino', 'azul oscuro',
  'gris oscuro', 'gris claro', 'verde botella', 'verde militar', 'verde pino',
  'verde seco', 'verde agua', 'verde oliva', 'verde pistacho', 'azul celeste',
  'vinotinto', 'chocolate', 'berenjena', 'mandarina', 'curuba', 'guayaba',
  'banana', 'beige', 'caqui', 'piedra', 'cafe', 'amarillo', 'negro', 'blanco', 'azul', 'gris',
  'verde', 'morado', 'lila', 'rosa', 'rojo'
];

const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function titleCase(value) {
  return String(value || '').toLocaleLowerCase('es-CO').replace(/(^|[\s-])\p{L}/gu, part => part.toLocaleUpperCase('es-CO'));
}

function plainText(value) {
  return String(value || '')
    .replace(/<br\s*\/?\s*>/gi, ' ')
    .replace(/<\/(p|li|h[1-6])\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 320);
}

function categoryFor(product) {
  const title = normalize(product.title);
  const tags = normalize(Array.isArray(product.tags) ? product.tags.join(' ') : product.tags);
  if (/\bset\b|conjunto/.test(title)) return 'Conjuntos';
  if (/bermuda|jogger|pantalon/.test(title) || tags.includes('pantalon')) return 'Pantalones';
  if (/hoodie|hoddie|camibuzo|buzo|sudadera/.test(title)) return 'Buzos';
  if (/crop top/.test(title)) return 'Crop Tops';
  return 'Camisetas';
}

function colorFor(product, variants) {
  const colorOption = (product.options || []).find(option => /color/i.test(option.name));
  if (colorOption) {
    const variant = variants.find(item => item.available) || variants[0];
    return variant?.[`option${colorOption.position}`] || colorOption.values?.[0] || 'Varios';
  }
  const title = normalize(product.title);
  return COLOR_NAMES.find(color => title.includes(color)) || 'Varios';
}

function mapProduct(product) {
  const variants = Array.isArray(product.variants) ? product.variants : [];
  const availableVariants = variants.filter(variant => variant.available);
  const pricedVariants = availableVariants.length ? availableVariants : variants;
  const prices = pricedVariants.map(variant => Number(variant.price)).filter(Number.isFinite);
  const images = Array.isArray(product.images) ? product.images : [];
  const image = images.find(item => item.src && !/(tabla|guia_de_tallas|oversize\.jpg|regular_fit\.jpg|crop_top\.png)/i.test(item.src)) || images.find(item => item.src);
  if (!image || !prices.length) return null;

  const name = titleCase(product.title);
  const category = categoryFor(product);
  const normalizedName = normalize(product.title);
  const audience = /dama|mujer|crop top/.test(normalizedName) ? 'mujer' : /kids|set camis/.test(normalizedName) ? 'unisex' : 'hombre';
  const styles = category === 'Pantalones' || category === 'Conjuntos'
    ? ['Streetwear', 'Casual']
    : category === 'Buzos'
      ? ['Streetwear', 'Techwear']
      : audience === 'mujer'
        ? ['Casual', 'Y2K']
        : ['Streetwear', 'Casual'];

  return {
    id: `homen-${product.id}`,
    name,
    brand: 'Homen',
    audience,
    category,
    styles,
    price: Math.min(...prices),
    color: colorFor(product, variants),
    sizes: [...new Set(variants.map(variant => variant.title).filter(Boolean))],
    image: image.src,
    logo: '',
    officialUrl: `${STORE_URL}/products/${product.handle}`,
    description: plainText(product.body_html) || `${name}. Consulta tallas y disponibilidad en la tienda oficial de Homen.`,
    source: 'oficial'
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Método no permitido.' });
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
  try {
    const pages = await Promise.all([1, 2].map(async page => {
      const response = await fetch(`${STORE_URL}/collections/all/products.json?limit=250&page=${page}`);
      if (!response.ok) return [];
      const data = await response.json();
      return Array.isArray(data.products) ? data.products : [];
    }));
    const products = pages.flat().map(mapProduct).filter(Boolean);
    if (!products.length) return json(res, 502, { error: 'No se pudo leer el catálogo de Homen.' });
    return json(res, 200, products);
  } catch {
    return json(res, 502, { error: 'No se pudo leer el catálogo de Homen.' });
  }
}