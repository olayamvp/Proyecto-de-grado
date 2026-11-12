// Doble de prueba de la API REST de Supabase (PostgREST) para analytics_events.
// Reproduce lo que usan las funciones: inserción con ignore-duplicates, vistas diarias
// (día de Bogotá), filtros por fecha, orden y paginación con Range. Solo para pruebas locales.
export function createFakeSupabase() {
  const db = { analytics_events: [], analytics_rejections: [], catalog_products: [] };
  const state = { failNext: 0, requests: 0 };
  const bogotaDay = iso => new Date(Date.parse(iso) - 5 * 3_600_000).toISOString().slice(0, 10);
  const views = {
    analytics_daily_brand() {
      const groups = new Map();
      for (const e of db.analytics_events) {
        const key = `${bogotaDay(e.occurred_at)}|${e.brand_id}`;
        const g = groups.get(key) || { day: bogotaDay(e.occurred_at), brand_id: e.brand_id, add_to_cart_events: 0, units_added: 0, outbound_clicks: 0, outbound_tienda_web: 0, outbound_instagram: 0, outbound_whatsapp: 0, outbound_otro: 0 };
        if (e.event_type === 'add_to_cart') { g.add_to_cart_events++; g.units_added += e.quantity; }
        else { g.outbound_clicks++; g[`outbound_${e.destination_type}`]++; }
        groups.set(key, g);
      }
      return [...groups.values()];
    },
    analytics_daily_product() {
      const groups = new Map();
      for (const e of db.analytics_events.filter(e => e.product_id)) {
        const key = `${bogotaDay(e.occurred_at)}|${e.brand_id}|${e.product_id}`;
        const g = groups.get(key) || { day: bogotaDay(e.occurred_at), brand_id: e.brand_id, product_id: e.product_id, add_to_cart_events: 0, units_added: 0, outbound_clicks: 0 };
        if (e.event_type === 'add_to_cart') { g.add_to_cart_events++; g.units_added += e.quantity; } else g.outbound_clicks++;
        groups.set(key, g);
      }
      return [...groups.values()];
    },
  };
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  async function fetchImpl(input, init = {}) {
    state.requests++;
    if (state.failNext > 0) { state.failNext--; return json(500, { message: 'falla simulada' }); }
    const url = new URL(input);
    const table = url.pathname.replace('/rest/v1/', '');
    const method = init.method || 'GET';
    if (method === 'POST') {
      const rows = JSON.parse(init.body);
      if (table === 'analytics_rejections') { db.analytics_rejections.push(...rows); return new Response(null, { status: 201 }); }
      if (table !== 'analytics_events') return json(404, {});
      const inserted = [];
      for (const row of rows) {
        if (db.analytics_events.some(existing => existing.event_id === row.event_id)) continue; // ON CONFLICT DO NOTHING
        db.analytics_events.push(structuredClone(row));
        inserted.push({ event_id: row.event_id });
      }
      return json(201, inserted);
    }
    let rows = views[table] ? views[table]() : (db[table] || []).map(row => ({ ...row }));
    for (const [key, value] of url.searchParams) {
      const match = /^(gte|lte|lt|eq)\.(.*)$/.exec(value);
      if (!match || ['select', 'order'].includes(key)) continue;
      const [, op, operand] = match;
      rows = rows.filter(row => op === 'gte' ? row[key] >= operand : op === 'lte' ? row[key] <= operand : op === 'lt' ? row[key] < operand : String(row[key]) === operand);
    }
    const select = url.searchParams.get('select');
    if (select && select !== '*' && !select.includes(':')) rows = rows.map(row => Object.fromEntries(select.split(',').map(column => [column, row[column]])));
    const order = url.searchParams.get('order');
    if (order) {
      const keys = order.split(',').map(part => part.split('.')[0]);
      rows.sort((a, b) => { for (const k of keys) { if (a[k] < b[k]) return -1; if (a[k] > b[k]) return 1; } return 0; });
    }
    const range = /^(\d+)-(\d+)$/.exec(init.headers?.Range || '');
    if (range) rows = rows.slice(Number(range[1]), Number(range[2]) + 1);
    return json(200, rows);
  }
  return { db, state, fetchImpl, settings: () => ({ url: 'https://falso.supabase.co', anon: 'anon-falso', service: 'service-falso' }) };
}
