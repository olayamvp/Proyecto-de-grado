// Ejecuta en Netlify un handler escrito para Vercel (req/res de Node) sin reescribirlo.
// Solo se usa para reutilizar funciones existentes de /api que el panel necesita.
export function fromVercel(handler) {
  return async request => {
    const url = new URL(request.url);
    const text = request.method === 'GET' || request.method === 'HEAD' ? '' : await request.text();
    let body;
    try { body = text ? JSON.parse(text) : undefined; } catch { body = undefined; }
    const req = {
      method: request.method,
      url: url.pathname + url.search,
      headers: Object.fromEntries([...request.headers].map(([key, value]) => [key.toLowerCase(), value])),
      query: Object.fromEntries(url.searchParams),
      body,
    };
    let status = 200;
    const headers = new Headers();
    let payload = '';
    const res = {
      status(code) { status = code; return res; },
      setHeader(name, value) { headers.set(name, value); return res; },
      end(data = '') { payload = data; return res; },
    };
    await handler(req, res);
    return new Response(status === 204 ? null : payload, { status, headers });
  };
}
