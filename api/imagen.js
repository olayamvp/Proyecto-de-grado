// Proxy de fotos para el probador: algunas tiendas no envían CORS y el navegador no deja
// leer sus píxeles. Solo acepta hosts de las marcas del catálogo para no ser un proxy abierto.
export const config = { runtime: 'nodejs' };

const ALLOWED_HOSTS = new Set([
  'cdn.shopify.com', 'zipre.co', 'sukicohen.com', 'loborosa.com', 'zohet.com.co',
  'pub-05df4a1debca45a2a7db9b3bc70d7f5b.r2.dev', 'thesinnersgallery.com', 'b2cmattelsa.vtexassets.com',
  'trueshop.co', 'anewcross.com', 'www.aguabendita.com.co', 'baobab.com.co', 'co.maygelcoronel.com',
  'www.homen.com.co', 'homen.com.co', 'www.kamecol.com', 'kamecol.com', 'lowtripstudios.com', 'www.buds.com.co',
]);
const MAX_BYTES = 8 * 1024 * 1024;
const allowed = url => url.protocol === 'https:' && ALLOWED_HOSTS.has(url.hostname) && !url.username && !url.password && (!url.port || url.port === '443');

export default async function handler(req, res) {
  const fail = (status, message) => res.status(status).setHeader('Content-Type', 'text/plain; charset=utf-8').end(message);
  if (req.method !== 'GET') return fail(405, 'Método no permitido.');
  let target;
  try { target = new URL(String(req.query?.url || '')); } catch { return fail(400, 'URL no válida.'); }
  if (!allowed(target)) return fail(403, 'Origen de imagen no permitido.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const upstream = await fetch(target, { signal: controller.signal, redirect: 'follow', headers: { Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*' } });
    if (!allowed(new URL(upstream.url))) return fail(403, 'Origen de imagen no permitido.');
    const type = upstream.headers.get('content-type') || '';
    if (!upstream.ok || !/^image\/(png|jpe?g|webp|avif|gif)/i.test(type)) return fail(502, 'No se pudo leer la imagen.');
    if (Number(upstream.headers.get('content-length')) > MAX_BYTES) return fail(413, 'Imagen demasiado grande.');
    const body = Buffer.from(await upstream.arrayBuffer());
    if (body.length > MAX_BYTES) return fail(413, 'Imagen demasiado grande.');
    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.status(200).end(body);
  } catch {
    return fail(504, 'La tienda no respondió a tiempo.');
  } finally {
    clearTimeout(timer);
  }
}
