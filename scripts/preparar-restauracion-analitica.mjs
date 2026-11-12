// Prepara una restauración histórica para Supabase SQL Editor. No escribe en la base.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { basename, resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateEvent } from '../netlify/lib/eventos.mjs';
import catalog from '../netlify/lib/catalogo-indice.json' with { type: 'json' };

export const COLUMNS = ['event_id', 'event_type', 'event_version', 'occurred_at', 'received_at', 'brand_id', 'product_id', 'related_product_ids', 'session_id', 'quantity', 'source_page', 'source_component', 'destination_type', 'catalog_verified'];
const OPTIONAL = new Set(['product_id', 'related_product_ids', 'session_id', 'quantity', 'source_component', 'destination_type']);
const EXTRA = new Set(['occurred_at_bogota', 'dia_bogota', 'brand_name', 'product_name', 'category', 'price_cop']);
const DAY = /^\d{4}-\d{2}-\d{2}$/;

// CSV RFC 4180: admite BOM, comas, comillas escapadas y saltos dentro de celdas.
export function parseCsv(input) {
  const rows = [];
  let row = [], cell = '', state = 'start';
  const finishCell = () => { row.push(cell); cell = ''; state = 'start'; };
  const finishRow = () => { finishCell(); rows.push(row); row = []; };
  const text = input.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (state === 'quoted') {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') state = 'closed';
      else cell += ch;
    } else if (ch === ',') finishCell();
    else if (ch === '\r' || ch === '\n') { if (ch === '\r' && text[i + 1] === '\n') i++; finishRow(); }
    else if (ch === '"' && state === 'start') state = 'quoted';
    else {
      if (ch === '"' || state === 'closed') throw new Error('CSV: comillas o caracteres fuera de una celda cerrada.');
      cell += ch; state = 'plain';
    }
  }
  if (state === 'quoted') throw new Error('CSV: celda con comillas sin cerrar.');
  if (row.length || cell.length || state !== 'start') finishRow();
  return rows;
}

function iso(value, field) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.test(value)) throw new Error(`${field}: fecha ISO con zona horaria requerida.`);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`${field}: fecha inválida.`);
  return date.toISOString();
}

function day(value) {
  if (!DAY.test(value || '') || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw new Error('El periodo requiere fechas válidas AAAA-MM-DD.');
  return value;
}

export function prepareRestoration(text, { from, to }) {
  day(from); day(to);
  if (from > to) throw new Error('El inicio del periodo es posterior al final.');
  const [headers, ...records] = parseCsv(text);
  if (!headers?.length || !records.length) throw new Error('El CSV no contiene eventos.');
  if (new Set(headers).size !== headers.length) throw new Error('El CSV tiene encabezados repetidos.');
  for (const field of COLUMNS) if (!OPTIONAL.has(field) && !headers.includes(field)) throw new Error(`Falta la columna ${field}.`);
  const unknown = headers.filter(field => !COLUMNS.includes(field) && !EXTRA.has(field));
  if (unknown.length) throw new Error(`Columnas no reconocidas: ${unknown.join(', ')}.`);
  const ids = new Set();
  const rows = records.map((record, index) => {
    try {
      if (record.length !== headers.length) throw new Error('Cantidad de columnas distinta al encabezado.');
      if (record.some(value => value.includes('\0'))) throw new Error('Una celda contiene un carácter nulo.');
      const source = Object.fromEntries(headers.map((field, i) => [field, record[i]]));
      const occurred = iso(source.occurred_at, 'occurred_at');
      const received = iso(source.received_at, 'received_at');
      const local = new Date(Date.parse(occurred) - 5 * 3_600_000).toISOString();
      const localDay = local.slice(0, 10);
      if (localDay < from || localDay > to) throw new Error('El evento está fuera del periodo de Bogotá seleccionado.');
      if (source.dia_bogota && source.dia_bogota !== localDay) throw new Error('dia_bogota no coincide con occurred_at.');
      if (source.occurred_at_bogota && source.occurred_at_bogota !== local.slice(0, 19).replace('T', ' ')) throw new Error('occurred_at_bogota no coincide con occurred_at.');
      if (!['true', 'false'].includes(source.catalog_verified)) throw new Error('catalog_verified debe ser true o false.');
      if (source.event_version !== '1') throw new Error('event_version debe ser 1.');
      const raw = { event_id: source.event_id, event_type: source.event_type, event_version: 1, occurred_at: occurred, brand_id: source.brand_id, source_page: source.source_page };
      if (source.session_id) raw.session_id = source.session_id;
      if (source.product_id) raw.product_id = source.product_id;
      if (source.source_component) raw.source_component = source.source_component;
      if (source.event_type === 'add_to_cart') {
        if (!/^\d+$/.test(source.quantity || '') || source.destination_type || source.related_product_ids) throw new Error('Campos de agregado al carrito incompatibles.');
        raw.quantity_added = Number(source.quantity);
      } else {
        if (source.quantity) throw new Error('Un clic saliente no puede tener quantity.');
        raw.destination_type = source.destination_type;
        if (source.related_product_ids) raw.related_product_ids = source.related_product_ids.split('|');
      }
      // Una restauración conserva la recepción histórica. El colector público mantiene
      // su límite de 48 h: no se cambia ni se utiliza para reenviar estos eventos.
      const row = validateEvent(raw, { catalog, now: new Date(received) });
      row.received_at = received;
      row.catalog_verified = source.catalog_verified === 'true';
      if (ids.has(row.event_id)) throw new Error(`event_id repetido: ${row.event_id}.`);
      ids.add(row.event_id);
      return Object.fromEntries(COLUMNS.map(field => [field, row[field]]));
    } catch (error) { throw new Error(`Registro ${index + 1}: ${error.message}`); }
  });
  const summary = {
    from, to, timezone: 'America/Bogota', events: rows.length,
    add_to_cart_events: rows.filter(row => row.event_type === 'add_to_cart').length,
    units_added: rows.reduce((sum, row) => sum + (row.quantity || 0), 0),
    outbound_clicks: rows.filter(row => row.event_type === 'outbound_click').length,
    brands: new Set(rows.map(row => row.brand_id)).size,
    products: new Set(rows.map(row => row.product_id).filter(Boolean)).size,
  };
  return { rows, summary };
}

const literal = value => {
  if (value === null || value === undefined) return 'NULL';
  if (Array.isArray(value)) return `ARRAY[${value.map(literal).join(',')}]::text[]`;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return `E'${value.replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
};

export function restorationSql(rows, summary, sha256) {
  const columns = COLUMNS.join(', ');
  const different = `ROW(${COLUMNS.map(field => `e.${field}`).join(', ')}) IS DISTINCT FROM ROW(${COLUMNS.map(field => `i.${field}`).join(', ')})`;
  const batches = [];
  for (let i = 0; i < rows.length; i += 500) batches.push(`INSERT INTO novum_restore_events (${columns}) VALUES\n${rows.slice(i, i + 500).map(row => `(${COLUMNS.map(field => literal(row[field])).join(',')})`).join(',\n')};`);
  return `-- Restauración de eventos históricos del CSV recuperado de un análisis previo.
-- Periodo Bogotá: ${summary.from} a ${summary.to}. Archivo fuente SHA-256: ${sha256}.
-- Ejecutar COMPLETO en Supabase > SQL Editor > New query > Run.
-- ${summary.events} eventos; ${summary.add_to_cart_events} agregados; ${summary.units_added} unidades; ${summary.outbound_clicks} clics; ${summary.brands} marcas.
-- Conserva event_id, occurred_at y received_at. No modifica eventos existentes.
BEGIN;
SET LOCAL statement_timeout = '120s';
SELECT pg_advisory_xact_lock(16740391);
CREATE TEMP TABLE novum_restore_events (LIKE public.analytics_events INCLUDING DEFAULTS INCLUDING CONSTRAINTS) ON COMMIT DROP;
${batches.join('\n')}
DO $novum_restore$
BEGIN
  IF (SELECT count(*) FROM novum_restore_events) <> ${summary.events}
     OR (SELECT count(DISTINCT event_id) FROM novum_restore_events) <> ${summary.events} THEN
    RAISE EXCEPTION 'El lote no coincide con el número de eventos únicos esperado.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.analytics_events e JOIN novum_restore_events i USING (event_id) WHERE ${different}) THEN
    RAISE EXCEPTION 'Hay event_id existentes con datos distintos. Se cancela toda la carga sin sobrescribirlos.';
  END IF;
END;
$novum_restore$;
CREATE TEMP TABLE novum_restore_inserted (event_id uuid PRIMARY KEY) ON COMMIT DROP;
WITH inserted AS (
  INSERT INTO public.analytics_events (${columns}) SELECT ${columns} FROM novum_restore_events
  ON CONFLICT (event_id) DO NOTHING RETURNING event_id
) INSERT INTO novum_restore_inserted SELECT event_id FROM inserted;
DO $novum_restore$
BEGIN
  IF (SELECT count(*) FROM public.analytics_events e JOIN novum_restore_events i USING (event_id)) <> ${summary.events}
     OR EXISTS (SELECT 1 FROM public.analytics_events e JOIN novum_restore_events i USING (event_id) WHERE ${different}) THEN
    RAISE EXCEPTION 'La verificación final no coincide con el CSV. Se revierte toda la carga.';
  END IF;
END;
$novum_restore$;
SELECT ${summary.events} AS eventos_archivo,
       (SELECT count(*) FROM novum_restore_inserted) AS insertados,
       ${summary.events} - (SELECT count(*) FROM novum_restore_inserted) AS ya_existian_identicos,
       count(*) FILTER (WHERE e.event_type = 'add_to_cart') AS agregados_al_carrito,
       coalesce(sum(e.quantity) FILTER (WHERE e.event_type = 'add_to_cart'), 0) AS unidades_agregadas,
       count(*) FILTER (WHERE e.event_type = 'outbound_click') AS clics_a_tiendas,
       count(DISTINCT e.brand_id) AS marcas
FROM public.analytics_events e JOIN novum_restore_events i USING (event_id);
COMMIT;
`;
}

async function main() {
  const args = process.argv.slice(2);
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--input', '--output', '--from', '--to'].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error('Uso: node scripts/preparar-restauracion-analitica.mjs --input archivo.csv --from AAAA-MM-DD --to AAAA-MM-DD --output carpeta');
    options[args[i].slice(2)] = args[i + 1];
  }
  if (!options.input || !options.output) throw new Error('Se requieren --input y --output.');
  const input = resolve(options.input), output = resolve(options.output);
  const buffer = await readFile(input);
  const sha256 = createHash('sha256').update(buffer).digest('hex');
  const { rows, summary } = prepareRestoration(buffer.toString('utf8'), options);
  const manifest = { source_file: basename(input), source_sha256: sha256, provenance: 'Datos históricos recuperados de un análisis previo, según confirmación del usuario.', ...summary, status: 'preparado; ejecución en Supabase pendiente', preserved_fields: COLUMNS };
  await mkdir(output, { recursive: true });
  await writeFile(join(output, 'restaurar-eventos.sql'), restorationSql(rows, summary, sha256));
  await writeFile(join(output, 'resumen.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(JSON.stringify({ ...summary, source_sha256: sha256, sql: join(output, 'restaurar-eventos.sql'), database_written: false }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => { console.error(error.message); process.exitCode = 1; });
