// Servidor de pruebas local: sirve el sitio y ejecuta las funciones de analítica contra un
// Supabase falso en memoria (los datos se pierden al cerrarlo; nunca toca producción).
//   node scripts/servidor-local.mjs            → http://localhost:8888
//   ANALITICA_FALLA=1 node scripts/...          → el endpoint de eventos responde 500 (prueba 10)
// Inspección: GET /__pruebas/eventos lista lo guardado. El reporte usa el token «admin-local».
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHandler as eventsHandler } from '../netlify/functions/analytics-events.mjs';
import { createHandler as reportHandler } from '../netlify/functions/analytics-report.mjs';
import { createFakeSupabase } from '../tests/supabase-falso.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = Number(process.env.PORT) || 8888;
const fake = createFakeSupabase();
const events = eventsHandler({ fetchImpl: fake.fetchImpl, getSettings: fake.settings });
const report = reportHandler({ fetchImpl: fake.fetchImpl, getSettings: fake.settings, authenticate: async req => req.headers.authorization === 'Bearer admin-local' ? { role: 'admin' } : null });
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf' };

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  const send = async response => {
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  };
  try {
    if (url.pathname === '/api/analytics/events' || url.pathname === '/api/analytics/report') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const request = new Request(url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) });
      if (url.pathname.endsWith('/events') && process.env.ANALITICA_FALLA) return send(new Response('{"error":"falla simulada"}', { status: 500 }));
      return send(await (url.pathname.endsWith('/events') ? events : report)(request));
    }
    if (url.pathname === '/__pruebas/eventos') return send(Response.json({ eventos: fake.db.analytics_events, rechazos: fake.db.analytics_rejections }));
    if (url.pathname === '/api/public-config') return send(Response.json({ configured: false }));
    if (url.pathname.startsWith('/api/')) return send(new Response('No disponible en el servidor local', { status: 404 }));
    const path = normalize(join(root, decodeURIComponent(url.pathname.endsWith('/') ? `${url.pathname}index.html` : url.pathname)));
    if (!path.startsWith(root)) return send(new Response('', { status: 403 }));
    const body = await readFile(path);
    res.writeHead(200, { 'Content-Type': TYPES[extname(path).toLowerCase()] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404); res.end('No encontrado');
  }
}).listen(port, () => console.log(`Novum Label (pruebas de analítica) en http://localhost:${port}${process.env.ANALITICA_FALLA ? ' — modo falla' : ''}`));
