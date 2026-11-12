// Reglas de los eventos de analítica (versión 1). Sin dependencias: lo usan las funciones
// de Netlify y las pruebas. Toda entrada se trata como no confiable.

export const EVENT_VERSION = 1;
export const MAX_BODY_BYTES = 4096;
export const MAX_EVENTS_PER_REQUEST = 10;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PRODUCT_ID = /^[a-z0-9][a-z0-9._-]{0,119}$/i;
const PAGE = /^\/[a-z0-9/_.-]{0,119}$/i;
const COMPONENTS = ['catalogo', 'detalle_producto', 'busqueda', 'carrito', 'perfil_marca', 'otro'];
const DESTINATIONS = ['tienda_web', 'instagram', 'whatsapp', 'otro'];
const FIELDS = {
  add_to_cart: { required: ['event_id', 'event_type', 'event_version', 'occurred_at', 'brand_id', 'product_id', 'quantity_added', 'source_page'], optional: ['session_id', 'source_component'] },
  outbound_click: { required: ['event_id', 'event_type', 'event_version', 'occurred_at', 'brand_id', 'destination_type', 'source_page', 'source_component'], optional: ['session_id', 'product_id', 'related_product_ids'] },
};

// Identificador estable de marca a partir de su nombre: "Kame.col" → "kame-col".
export function brandSlug(name) {
  return String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

export class Rejection extends Error {
  constructor(reason, eventType = null) { super(reason); this.reason = reason; this.eventType = eventType; }
}

// Lee el cuerpo con límite de tamaño y devuelve una lista de eventos sin validar.
export function parseBody(text) {
  if (typeof text !== 'string' || !text.length) throw new Rejection('cuerpo_vacio');
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) throw new Rejection('cuerpo_muy_grande');
  let data;
  try { data = JSON.parse(text); } catch { throw new Rejection('json_invalido'); }
  const events = data && typeof data === 'object' && !Array.isArray(data) && Object.keys(data).length === 1 && Array.isArray(data.events) ? data.events : null;
  if (!events) throw new Rejection('estructura_inesperada');
  if (!events.length || events.length > MAX_EVENTS_PER_REQUEST) throw new Rejection('cantidad_de_eventos');
  return events;
}

// Valida un evento y lo convierte en la fila de analytics_events.
// catalog: { products: {productId: brandId}, brands: [brandId] } o null si no hay catálogo verificable.
export function validateEvent(raw, { catalog, now = new Date() } = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Rejection('evento_no_es_objeto');
  const type = raw.event_type;
  const spec = FIELDS[type];
  if (!spec) throw new Rejection('tipo_no_autorizado', typeof type === 'string' ? type.slice(0, 40) : null);
  const reject = reason => { throw new Rejection(reason, type); };
  const keys = Object.keys(raw);
  if (keys.some(key => !spec.required.includes(key) && !spec.optional.includes(key))) reject('campo_inesperado');
  if (spec.required.some(key => raw[key] === undefined || raw[key] === null)) reject('campo_faltante');

  if (typeof raw.event_id !== 'string' || !UUID.test(raw.event_id)) reject('event_id_invalido');
  if (raw.event_version !== EVENT_VERSION) reject('version_no_soportada');
  if (typeof raw.occurred_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(raw.occurred_at)) reject('fecha_invalida');
  const occurred = new Date(raw.occurred_at);
  if (Number.isNaN(occurred.getTime())) reject('fecha_invalida');
  // Se aceptan reenvíos de la misma pestaña hasta 48 h después; nada en el futuro (5 min de margen).
  if (occurred.getTime() > now.getTime() + 5 * 60_000 || occurred.getTime() < now.getTime() - 48 * 3_600_000) reject('fecha_fuera_de_rango');
  if (typeof raw.brand_id !== 'string' || raw.brand_id !== brandSlug(raw.brand_id) || !raw.brand_id) reject('marca_invalida');
  if (raw.session_id !== undefined && raw.session_id !== null && (typeof raw.session_id !== 'string' || !UUID.test(raw.session_id))) reject('sesion_invalida');
  if (typeof raw.source_page !== 'string' || !PAGE.test(raw.source_page)) reject('pagina_invalida');
  if (raw.source_component !== undefined && !COMPONENTS.includes(raw.source_component)) reject('componente_invalido');
  if (raw.product_id !== undefined && raw.product_id !== null && (typeof raw.product_id !== 'string' || !PRODUCT_ID.test(raw.product_id))) reject('producto_invalido');

  const row = {
    event_id: raw.event_id.toLowerCase(),
    event_type: type,
    event_version: EVENT_VERSION,
    occurred_at: occurred.toISOString(),
    brand_id: raw.brand_id,
    product_id: raw.product_id ?? null,
    related_product_ids: [],
    session_id: raw.session_id ? raw.session_id.toLowerCase() : null,
    quantity: null,
    source_page: raw.source_page,
    source_component: raw.source_component ?? null,
    destination_type: null,
    catalog_verified: Boolean(catalog),
  };
  if (type === 'add_to_cart') {
    if (!Number.isInteger(raw.quantity_added) || raw.quantity_added < 1 || raw.quantity_added > 50) reject('cantidad_invalida');
    row.quantity = raw.quantity_added;
  } else {
    if (!DESTINATIONS.includes(raw.destination_type)) reject('destino_invalido');
    row.destination_type = raw.destination_type;
    if (raw.related_product_ids !== undefined) {
      const related = raw.related_product_ids;
      if (!Array.isArray(related) || related.length > 50 || related.some(id => typeof id !== 'string' || !PRODUCT_ID.test(id))) reject('productos_relacionados_invalidos');
      row.related_product_ids = [...new Set(related)];
    }
  }
  if (catalog) {
    const owner = id => catalog.products[id];
    if (!catalog.brands.includes(row.brand_id)) reject('marca_desconocida');
    for (const id of [row.product_id, ...row.related_product_ids].filter(Boolean)) {
      if (!owner(id)) reject('producto_desconocido');
      if (owner(id) !== row.brand_id) reject('producto_de_otra_marca');
    }
  }
  return row;
}

// CSV con comillas y protección contra fórmulas al abrirlo en Excel/Sheets.
export function toCsv(rows, columns) {
  const cell = value => {
    if (value === null || value === undefined) return '';
    let text = Array.isArray(value) ? value.join('|') : String(value);
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [columns.join(','), ...rows.map(row => columns.map(column => cell(row[column])).join(','))].join('\r\n') + '\r\n';
}
