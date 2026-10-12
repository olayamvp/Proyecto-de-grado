import { json } from './_supabase.js';

const STORES = [
  { brand: 'Agybo', url: 'https://agybo.com', platform: 'shopify', audience: 'unisex' },
  { brand: 'Zohet', url: 'https://zohet.com.co', platform: 'woocommerce', audience: 'mujer' },
  { brand: 'One Five', url: 'https://www.onefive.com.co', platform: 'shopify', audience: 'mujer' }
];

const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const plain = value => String(value || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim().slice(0, 320);
const stylesFor = (category, audience) => category === 'Vestidos' || category === 'Faldas' || category === 'Tops'
  ? ['Casual', 'Y2K'] : audience === 'unisex' ? ['Streetwear', 'Casual'] : ['Casual', 'Minimalista'];

function apparelCategory(name, type = '', categories = []) {
  const text = normalize([name, type, ...categories].join(' '));
  if (/accesor|bolso|bandolera|choker|sombrero|gorro|media|calcetin|correa|abanico|flor crochet|portabotella|zapato/.test(text)) return null;
  if (/vestido|dress/.test(text)) return 'Vestidos';
  if (/falda/.test(text)) return 'Faldas';
  if (/pantalon|jean|jogger|legging|short|bermuda/.test(text)) return 'Pantalones';
  if (/conjunto|set /.test(text)) return 'Conjuntos';
  if (/chaqueta|abrigo|cardigan|chaleco|blazer|kimono|ruana|poncho|capa/.test(text)) return 'Chaquetas';
  if (/buzo|hoodie|sweater|sueter|crewneck|sudadera|tejido|punto/.test(text)) return 'Buzos';
  if (/body/.test(text)) return 'Bodies';
  if (/top|blusa|bluson|camisa|camiseta|tee|polo|camisola/.test(text)) return 'Camisetas';
  return null;
}

function genderFor(product, fallback) {
  const text = normalize([product.title, product.product_type, product.name, ...(product.tags || []), ...(product.categories || []).map(item => item.name || '')].join(' '));
  if (/\bhombre\b|\bmen\b|masculin/.test(text)) return 'hombre';
  if (/\bmujer\b|\bwomen\b|femenin|dama/.test(text)) return 'mujer';
  return fallback;
}

function fromShopify(product, store) {
  const category = apparelCategory(product.title, product.product_type, product.tags || []);
  const variants = product.variants || [];
  const available = variants.filter(item => item.available);
  const selected = available.length ? available : variants;
  const prices = selected.map(item => Number(item.price)).filter(Number.isFinite);
  const image = product.images?.[0]?.src || product.image?.src;
  if (!category || !image || !prices.length) return null;
  const audience = genderFor({ ...product, tags: product.tags || [] }, store.audience);
  return {
    id: `${normalize(store.brand).replace(/[^a-z0-9]+/g, '-')}-${product.id}`,
    name: plain(product.title), brand: store.brand, audience, category, styles: stylesFor(category, audience),
    price: Math.min(...prices), color: product.options?.find(option => /color/i.test(option.name))?.values?.[0] || 'Varios',
    sizes: [...new Set(selected.map(item => item.title).filter(title => title && !/default title/i.test(title)))],
    image, logo: '', officialUrl: `${store.url}/products/${product.handle}`,
    description: plain(product.body_html) || `${plain(product.title)}. Confirma precio, tallas y disponibilidad en la tienda oficial.`, source: 'oficial'
  };
}

function fromWoo(product, store, euroCopRate) {
  const categories = (product.categories || []).map(item => item.name);
  const category = apparelCategory(product.name, '', categories);
  const image = product.images?.[0]?.src;
  const rawPrice = product.prices?.price;
  const divisor = 10 ** (product.prices?.currency_minor_unit || 0);
  const originalPrice = Number(rawPrice) / divisor;
  const currency = product.prices?.currency_code || 'COP';
  const price = currency === 'COP' ? originalPrice : currency === 'EUR' && euroCopRate ? originalPrice * euroCopRate : NaN;
  if (!category || !image || !Number.isFinite(price) || price <= 0) return null;
  const audience = genderFor({ ...product, categories }, store.audience);
  const sizes = (product.attributes || []).filter(attribute => /talla|size/i.test(attribute.name)).flatMap(attribute => (attribute.terms || []).map(term => term.name));
  return {
    id: `${normalize(store.brand).replace(/[^a-z0-9]+/g, '-')}-${product.id}`,
    name: plain(product.name), brand: store.brand, audience, category, styles: stylesFor(category, audience),
    price, color: (product.attributes || []).find(attribute => /color/i.test(attribute.name))?.terms?.[0]?.name || 'Varios',
    sizes, image, logo: '', officialUrl: product.permalink,
    description: `${plain(product.description || product.short_description) || `${plain(product.name)}. Confirma tallas y disponibilidad en la tienda oficial.`}${currency === 'EUR' ? ` Precio aproximado convertido desde EUR a COP; confirma el valor final en la tienda oficial.` : ''}`,
    ...(currency === 'EUR' ? { priceCurrencyOriginal: 'EUR' } : {}), source: 'oficial'
  };
}

async function fetchStore(store, euroCopRate) {
  const urls = store.platform === 'shopify'
    ? [`${store.url}/products.json?limit=250&page=1`, `${store.url}/products.json?limit=250&page=2`]
    : [`${store.url}/wp-json/wc/store/v1/products?per_page=100&page=1`, `${store.url}/wp-json/wc/store/v1/products?per_page=100&page=2`];
  const pages = await Promise.all(urls.map(async url => {
    try {
      const response = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!response.ok) return [];
      const data = await response.json();
      return store.platform === 'shopify' ? (data.products || []) : (Array.isArray(data) ? data : []);
    } catch { return []; }
  }));
  const products = pages.flat().map(product => store.platform === 'shopify' ? fromShopify(product, store) : fromWoo(product, store, euroCopRate)).filter(Boolean);
  return products.slice(0, 30);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Método no permitido.' });
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
  let euroCopRate = null;
  try {
    const rateResponse = await fetch('https://api.frankfurter.dev/v2/rate/EUR/COP');
    if (rateResponse.ok) euroCopRate = Number((await rateResponse.json()).rate) || null;
  } catch { /* Euro-priced products are omitted if no conversion rate is available. */ }
  const catalogs = await Promise.all(STORES.map(async store => [store.brand, await fetchStore(store, euroCopRate)]));
  const result = Object.fromEntries(catalogs);
  if (!Object.values(result).some(products => products.length)) return json(res, 502, { error: 'No se pudieron consultar los catálogos de las marcas.' });
  return json(res, 200, result);
}
