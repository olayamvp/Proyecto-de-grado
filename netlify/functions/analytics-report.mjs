// GET /api/analytics/report — métricas por marca, producto y día, en JSON o CSV.
// Solo administradores (token de Supabase + rol admin en user_roles). Solo lectura.
// source=reales (por defecto) lee Supabase; source=simulados lee el conjunto de demostración
// incluido con la función (netlify/lib/simulados.mjs), siempre marcado como simulado.
import { authenticatedUser, settings } from '../../api/_supabase.js';
import { toCsv } from '../lib/eventos.mjs';
import { SIMULATED_DATASET, simulatedDailyBrand, simulatedDailyProduct, simulatedEvents } from '../lib/simulados.mjs';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const PAGE_SIZE = 1000;
const VIEWS = {
  marcas: ['brand_id', 'add_to_cart_events', 'units_added', 'outbound_clicks', 'outbound_tienda_web', 'outbound_instagram', 'outbound_whatsapp', 'outbound_otro'],
  productos: ['brand_id', 'product_id', 'add_to_cart_events', 'units_added', 'outbound_clicks'],
  diario: ['day', 'add_to_cart_events', 'units_added', 'outbound_clicks'],
  diario_marca: ['day', 'brand_id', 'add_to_cart_events', 'units_added', 'outbound_clicks', 'outbound_tienda_web', 'outbound_instagram', 'outbound_whatsapp', 'outbound_otro'],
  eventos: ['event_id', 'event_type', 'event_version', 'occurred_at', 'received_at', 'brand_id', 'product_id', 'related_product_ids', 'session_id', 'quantity', 'source_page', 'source_component', 'destination_type', 'catalog_verified'],
};
const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

// Suma filas agrupándolas por las columnas clave, conservando el orden de las métricas.
function sumBy(rows, keys, metrics) {
  const groups = new Map();
  for (const row of rows) {
    const id = keys.map(key => row[key]).join('\u0000');
    const group = groups.get(id) || Object.fromEntries([...keys.map(key => [key, row[key]]), ...metrics.map(metric => [metric, 0])]);
    for (const metric of metrics) group[metric] += Number(row[metric]) || 0;
    groups.set(id, group);
  }
  return [...groups.values()];
}

export function createHandler({ fetchImpl = fetch, getSettings = settings, authenticate = authenticatedUser } = {}) {
  return async request => {
    if (request.method !== 'GET') return reply(405, { error: 'metodo_no_permitido' });
    const cfg = getSettings();
    if (!cfg) return reply(503, { error: 'analitica_no_configurada' });
    const user = await authenticate({ headers: { authorization: request.headers.get('authorization') || '' } });
    if (!user) return reply(401, { error: 'inicia_sesion' });
    if (user.role !== 'admin') return reply(403, { error: 'solo_administradores' });

    const params = new URL(request.url).searchParams;
    const from = params.get('from'), to = params.get('to');
    const view = params.get('view') || 'marcas', format = params.get('format') || 'json';
    const source = params.get('source') || 'reales';
    if (!['reales', 'simulados'].includes(source)) return reply(400, { error: 'parametros_invalidos' });
    const simulated = source === 'simulados';
    if (!DAY.test(from || '') || !DAY.test(to || '') || from > to) return reply(400, { error: 'fechas_invalidas' });
    if ((Date.parse(to) - Date.parse(from)) / 86_400_000 > 731) return reply(400, { error: 'periodo_muy_largo' });
    if (!VIEWS[view] || !['json', 'csv'].includes(format)) return reply(400, { error: 'parametros_invalidos' });

    // Lee todas las páginas de PostgREST para que el CSV no quede truncado.
    const readAll = async path => {
      const rows = [];
      for (let start = 0; ; start += PAGE_SIZE) {
        const response = await fetchImpl(`${cfg.url}/rest/v1/${path}`, { headers: { apikey: cfg.service, Authorization: `Bearer ${cfg.service}`, Range: `${start}-${start + PAGE_SIZE - 1}`, 'Range-Unit': 'items' } });
        if (!response.ok) throw new Error(`supabase ${response.status}`);
        const page = await response.json();
        rows.push(...page);
        if (page.length < PAGE_SIZE) return rows;
      }
    };
    // El periodo se interpreta en días de Bogotá (UTC−5), igual que las vistas diarias.
    const dayRange = `day=gte.${from}&day=lte.${to}`;
    const instantRange = `occurred_at=gte.${from}T05:00:00Z&occurred_at=lt.${new Date(Date.parse(`${to}T05:00:00Z`) + 86_400_000).toISOString()}`;
    let rows;
    try {
      if (view === 'eventos') rows = simulated ? await simulatedEvents(from, to) : await readAll(`analytics_events?select=${VIEWS.eventos.join(',')}&${instantRange}&order=occurred_at.asc,event_id.asc`);
      else if (view === 'productos') rows = sumBy(simulated ? await simulatedDailyProduct(from, to) : await readAll(`analytics_daily_product?select=*&${dayRange}&order=day.asc`), ['brand_id', 'product_id'], VIEWS.productos.slice(2));
      else {
        const daily = simulated ? await simulatedDailyBrand(from, to) : await readAll(`analytics_daily_brand?select=*&${dayRange}&order=day.asc,brand_id.asc`);
        rows = view === 'diario_marca' ? daily
          : view === 'diario' ? sumBy(daily, ['day'], VIEWS.diario.slice(1))
          : sumBy(daily, ['brand_id'], VIEWS.marcas.slice(1));
      }
    } catch (error) {
      console.error(JSON.stringify({ analytics: 'error_de_reporte', detail: String(error.message).slice(0, 120) }));
      return reply(502, { error: 'consulta_no_disponible' });
    }
    if (view === 'marcas' || view === 'productos') rows.sort((a, b) => b.add_to_cart_events - a.add_to_cart_events || b.outbound_clicks - a.outbound_clicks || String(a.product_id ?? a.brand_id).localeCompare(String(b.product_id ?? b.brand_id)));
    if (format === 'csv') {
      // Los CSV simulados llevan una columna y un nombre de archivo que lo dicen explícitamente.
      const csv = simulated ? toCsv(rows.map(row => ({ datos: 'SIMULADOS', ...row })), ['datos', ...VIEWS[view]]) : toCsv(rows, VIEWS[view]);
      return new Response(csv, { status: 200, headers: {
        'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-store',
        'Content-Disposition': `attachment; filename="novum-analitica-${simulated ? 'SIMULADOS-' : ''}${view}-${from}_${to}.csv"`,
      } });
    }
    const totals = view === 'eventos' ? { events: rows.length } : sumBy(rows.map(row => ({ ...row, all: 'total' })), ['all'], ['add_to_cart_events', 'units_added', 'outbound_clicks'])[0] || { add_to_cart_events: 0, units_added: 0, outbound_clicks: 0 };
    delete totals.all;
    return reply(200, { from, to, view, source, simulated, ...(simulated && { dataset: SIMULATED_DATASET }), timezone: 'America/Bogota', generated_at: new Date().toISOString(), totals, rows });
  };
}

export default createHandler();
export const config = { path: '/api/analytics/report' };
