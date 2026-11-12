// Fuente «simulados» del reporte: eventos de demostración incluidos con la función, nunca en
// Supabase. Devuelve filas con la misma forma que analytics_events y las vistas diarias, para
// que el panel y los CSV funcionen igual que con los datos reales.
const bogotaDay = iso => new Date(Date.parse(iso) - 5 * 3_600_000).toISOString().slice(0, 10);

export const SIMULATED_DATASET = {
  label: 'Datos simulados · octubre 2026',
  from: '2026-10-01',
  to: '2026-10-31',
};

let cache;
async function events() {
  if (!cache) {
    const { COLUMNS, ROWS } = await import('./eventos-simulados-2026-10.mjs');
    cache = ROWS.map(values => ({
      ...Object.fromEntries(COLUMNS.map((column, i) => [column, values[i]])),
      event_version: 1, related_product_ids: [], catalog_verified: true,
    }));
  }
  return cache;
}

const inDays = (from, to) => event => { const day = bogotaDay(event.occurred_at); return day >= from && day <= to; };

export async function simulatedEvents(from, to) {
  return (await events()).filter(inDays(from, to))
    .sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at) || a.event_id.localeCompare(b.event_id));
}

// Equivalente a la vista analytics_daily_brand.
export async function simulatedDailyBrand(from, to) {
  const groups = new Map();
  for (const e of await simulatedEvents(from, to)) {
    const day = bogotaDay(e.occurred_at), key = `${day}|${e.brand_id}`;
    const g = groups.get(key) || { day, brand_id: e.brand_id, add_to_cart_events: 0, units_added: 0, outbound_clicks: 0, outbound_tienda_web: 0, outbound_instagram: 0, outbound_whatsapp: 0, outbound_otro: 0 };
    if (e.event_type === 'add_to_cart') { g.add_to_cart_events++; g.units_added += e.quantity || 0; }
    else { g.outbound_clicks++; g[`outbound_${e.destination_type}`]++; }
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => a.day.localeCompare(b.day) || a.brand_id.localeCompare(b.brand_id));
}

// Equivalente a la vista analytics_daily_product.
export async function simulatedDailyProduct(from, to) {
  const groups = new Map();
  for (const e of await simulatedEvents(from, to)) {
    if (!e.product_id) continue;
    const day = bogotaDay(e.occurred_at), key = `${day}|${e.brand_id}|${e.product_id}`;
    const g = groups.get(key) || { day, brand_id: e.brand_id, product_id: e.product_id, add_to_cart_events: 0, units_added: 0, outbound_clicks: 0 };
    if (e.event_type === 'add_to_cart') { g.add_to_cart_events++; g.units_added += e.quantity || 0; } else g.outbound_clicks++;
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => a.day.localeCompare(b.day));
}
