// POST /api/analytics/events — registra add_to_cart y outbound_click en Supabase.
// Público pero acotado: lista blanca de tipos, validación estricta, verificación contra el
// catálogo, límite de tamaño y de frecuencia, e idempotencia por event_id.
import { settings } from '../../api/_supabase.js';
import { parseBody, validateEvent, brandSlug, Rejection } from '../lib/eventos.mjs';
import catalogIndex from '../lib/catalogo-indice.json' with { type: 'json' };

const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
// Observabilidad sin datos personales: solo el motivo técnico y el tipo de evento.
const logRejection = (reason, eventType = null) => console.warn(JSON.stringify({ analytics: 'rechazo', reason, event_type: eventType }));

export function createHandler({ fetchImpl = fetch, getSettings = settings, catalog = catalogIndex, now = () => new Date() } = {}) {
  return async request => {
    if (request.method !== 'POST') return reply(405, { error: 'metodo_no_permitido' });
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) { logRejection('origen_no_permitido'); return reply(403, { error: 'origen_no_permitido' }); }
    const type = (request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (type && type !== 'application/json' && type !== 'text/plain') { logRejection('tipo_de_contenido'); return reply(415, { error: 'tipo_de_contenido' }); }
    const declared = Number(request.headers.get('content-length'));
    if (declared > 4096) { logRejection('cuerpo_muy_grande'); return reply(413, { error: 'cuerpo_muy_grande' }); }
    const cfg = getSettings();
    if (!cfg) return reply(503, { error: 'analitica_no_configurada' });
    const supabase = (path, init = {}) => fetchImpl(`${cfg.url}/rest/v1/${path}`, { ...init, headers: { apikey: cfg.service, Authorization: `Bearer ${cfg.service}`, 'Content-Type': 'application/json', ...init.headers } });
    const rejections = [];
    const recordRejections = async () => {
      if (!rejections.length) return;
      for (const item of rejections) logRejection(item.reason, item.event_type);
      try { await supabase('analytics_rejections', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(rejections) }); } catch {}
    };

    let events;
    try { events = parseBody(await request.text()); }
    catch (error) {
      rejections.push({ reason: error instanceof Rejection ? error.reason : 'cuerpo_ilegible', event_type: null });
      await recordRejections();
      return reply(error.reason === 'cuerpo_muy_grande' ? 413 : 400, { error: rejections[0].reason });
    }

    // Productos creados desde el panel (catalog_products) también cuentan como catálogo verificable.
    const known = { products: { ...catalog.products }, brands: [...catalog.brands] };
    const unknown = [...new Set(events.flatMap(event => [event?.product_id, ...(Array.isArray(event?.related_product_ids) ? event.related_product_ids : [])])
      .filter(id => typeof id === 'string' && /^[a-z0-9][a-z0-9._-]{0,119}$/i.test(id) && !known.products[id]))];
    if (unknown.length) {
      try {
        const response = await supabase(`catalog_products?select=id,brand:data->>brand&active=eq.true&id=in.(${unknown.map(id => `"${id}"`).join(',')})`);
        if (response.ok) for (const row of await response.json()) { known.products[row.id] = brandSlug(row.brand); if (!known.brands.includes(brandSlug(row.brand))) known.brands.push(brandSlug(row.brand)); }
      } catch {}
    }

    const results = [];
    const rows = [];
    const received = now();
    events.forEach((raw, index) => {
      try {
        const row = validateEvent(raw, { catalog: known, now: received });
        if (rows.some(existing => existing.event_id === row.event_id)) throw new Rejection('event_id_repetido_en_lote', row.event_type);
        rows.push(row);
        results.push({ index, event_id: row.event_id, status: 'pendiente' });
      } catch (error) {
        const reason = error instanceof Rejection ? error.reason : 'error_de_validacion';
        rejections.push({ reason, event_type: error.eventType ?? null });
        results.push({ index, status: 'rechazado', reason });
      }
    });

    if (rows.length) {
      // ignore-duplicates + return=representation: solo vuelven las filas realmente nuevas.
      let inserted;
      try {
        const response = await supabase('analytics_events?on_conflict=event_id&select=event_id', {
          method: 'POST',
          headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
          body: JSON.stringify(rows.map(row => ({ ...row, received_at: received.toISOString() }))),
        });
        if (!response.ok) throw new Error(`supabase ${response.status}`);
        inserted = new Set((await response.json()).map(row => row.event_id));
      } catch (error) {
        console.error(JSON.stringify({ analytics: 'error_de_almacenamiento', detail: String(error.message).slice(0, 120) }));
        await recordRejections();
        return reply(502, { error: 'almacenamiento_no_disponible' });
      }
      for (const result of results) if (result.status === 'pendiente') result.status = inserted.has(result.event_id) ? 'registrado' : 'duplicado';
    }
    await recordRejections();
    return reply(rows.length ? 200 : 400, { results });
  };
}

export default createHandler();
export const config = {
  path: '/api/analytics/events',
  // Límite por IP aplicado por Netlify antes de ejecutar la función; la IP no se guarda.
  rateLimit: { windowLimit: 60, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
