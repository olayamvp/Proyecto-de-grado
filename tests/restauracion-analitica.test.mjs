import test from 'node:test';
import assert from 'node:assert/strict';
import { COLUMNS, parseCsv, prepareRestoration } from '../scripts/preparar-restauracion-analitica.mjs';
import { toCsv } from '../netlify/lib/eventos.mjs';

const period = { from: '2026-10-01', to: '2026-10-31' };
const event = (overrides = {}) => ({
  event_id: '00000000-0000-4000-8000-000000000001', event_type: 'add_to_cart', event_version: 1,
  occurred_at: '2026-10-01T05:00:00.000+00:00', received_at: '2026-10-01T05:00:00.500+00:00',
  brand_id: 'buds', product_id: 'buds-hoodie-destroyed', related_product_ids: [],
  session_id: '11111111-1111-4111-8111-111111111111', quantity: 1,
  source_page: '/contenido/ropa_hombre', source_component: 'catalogo', destination_type: null,
  catalog_verified: true, ...overrides,
});
const prepare = rows => prepareRestoration(toCsv(rows, COLUMNS), period);

test('el CSV conserva BOM, comas, comillas, saltos internos y la última celda vacía', () => {
  assert.deepEqual(parseCsv('\uFEFFa,b,c\r\n"a,b","dos ""comillas""","línea\nsegunda"\r\nx,y,'), [
    ['a', 'b', 'c'], ['a,b', 'dos "comillas"', 'línea\nsegunda'], ['x', 'y', ''],
  ]);
  assert.throws(() => parseCsv('a\n"sin cerrar'), /sin cerrar/);
  assert.throws(() => parseCsv('a\n"celda"resto'), /caracteres/);
  assert.throws(() => parseCsv('a\nce"lda'), /comillas/);
});

test('la restauración conserva fechas originales y distingue UTC de día de Bogotá', () => {
  const last = event({ event_id: '00000000-0000-4000-8000-000000000002', occurred_at: '2026-11-01T04:59:59.999Z', received_at: '2026-11-01T05:00:00.001Z', catalog_verified: false });
  const { rows, summary } = prepare([event(), last]);
  assert.equal(rows[0].occurred_at, '2026-10-01T05:00:00.000Z');
  assert.equal(rows[0].received_at, '2026-10-01T05:00:00.500Z');
  assert.equal(rows[1].occurred_at, last.occurred_at);
  assert.equal(rows[1].catalog_verified, false);
  assert.equal(summary.events, 2);
  assert.throws(() => prepare([event({ occurred_at: '2026-10-01T04:59:59.999Z' })]), /fuera del periodo/);
  assert.throws(() => prepare([event({ occurred_at: '2026-11-01T05:00:00Z', received_at: '2026-11-01T05:00:01Z' })]), /fuera del periodo/);
});

test('los identificadores repetidos y las filas mal formadas detienen la preparación completa', () => {
  assert.throws(() => prepare([event(), event()]), /event_id repetido/);
  assert.throws(() => prepareRestoration(toCsv([event()], COLUMNS).replace(/\r\n$/, ',extra\r\n'), period), /Cantidad de columnas/);
  assert.throws(() => prepareRestoration('event_id,event_id\na,b\n', period), /encabezados repetidos/);
  assert.throws(() => prepareRestoration('event_id\na\n', period), /Falta la columna/);
});

test('la recuperación rechaza cambios en marca, cantidad, tipo, destino o fechas de apoyo', () => {
  for (const overrides of [{ brand_id: 'otra-marca' }, { quantity: -1 }, { quantity: 1.5 }, { event_type: 'purchase' }, { destination_type: 'tienda_web' }, { received_at: '2026-10-01T04:50:00Z' }, { session_id: 'sin-uuid' }]) assert.throws(() => prepare([event(overrides)]));
  assert.throws(() => prepareRestoration(toCsv([{ ...event(), dia_bogota: '2026-10-02' }], [...COLUMNS, 'dia_bogota']), period), /dia_bogota/);
  assert.throws(() => prepareRestoration(toCsv([event()], [...COLUMNS, 'columna_desconocida']), period), /Columnas no reconocidas/);
});

test('los clics y productos relacionados se preservan sin convertirlos en unidades', () => {
  const click = event({ event_type: 'outbound_click', quantity: null, destination_type: 'tienda_web', related_product_ids: ['buds-hoodie-destroyed'], source_component: 'carrito' });
  const { rows, summary } = prepare([click]);
  assert.deepEqual(rows[0].related_product_ids, click.related_product_ids);
  assert.equal(rows[0].quantity, null);
  assert.equal(summary.outbound_clicks, 1);
  assert.equal(summary.units_added, 0);
});
