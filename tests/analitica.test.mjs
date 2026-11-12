// Pruebas de la analítica persistente. Ejecutar:  node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { validateEvent, parseBody, brandSlug, toCsv, Rejection } from '../netlify/lib/eventos.mjs';
import { createHandler as eventsHandler } from '../netlify/functions/analytics-events.mjs';
import { createHandler as reportHandler } from '../netlify/functions/analytics-report.mjs';
import { createFakeSupabase } from './supabase-falso.mjs';

const catalog = JSON.parse(readFileSync(new URL('../netlify/lib/catalogo-indice.json', import.meta.url)));
const NOW = new Date('2026-11-11T15:00:00.000Z');
const ORIGIN = 'https://novumlabel.netlify.app';
let counter = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`;
const addToCart = (over = {}) => ({ event_id: uuid(), event_type: 'add_to_cart', event_version: 1, occurred_at: '2026-11-11T14:59:00.000Z', brand_id: 'buds', product_id: 'buds-hoodie-destroyed', quantity_added: 1, source_page: '/contenido/ropa_hombre', source_component: 'catalogo', session_id: '11111111-1111-4111-8111-111111111111', ...over });
const outbound = (over = {}) => ({ event_id: uuid(), event_type: 'outbound_click', event_version: 1, occurred_at: '2026-11-11T14:59:30.000Z', brand_id: 'buds', product_id: 'buds-hoodie-destroyed', destination_type: 'tienda_web', source_page: '/contenido/carrito', source_component: 'carrito', session_id: '11111111-1111-4111-8111-111111111111', ...over });
const post = (events, headers = {}) => new Request(`${ORIGIN}/api/analytics/events`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN, ...headers }, body: typeof events === 'string' ? events : JSON.stringify({ events }) });
const setup = () => {
  const fake = createFakeSupabase();
  return { fake, handler: eventsHandler({ fetchImpl: fake.fetchImpl, getSettings: fake.settings, catalog, now: () => NOW }) };
};
const rejects = (raw, reason) => assert.throws(() => validateEvent(raw, { catalog, now: NOW }), error => error instanceof Rejection && error.reason === reason);

// ---------- Validación ----------
test('un add_to_cart válido produce exactamente una fila con los campos del esquema', () => {
  const row = validateEvent(addToCart(), { catalog, now: NOW });
  assert.equal(row.event_type, 'add_to_cart');
  assert.equal(row.brand_id, 'buds');
  assert.equal(row.quantity, 1);
  assert.equal(row.destination_type, null);
  assert.equal(row.catalog_verified, true);
  assert.equal(row.occurred_at, '2026-11-11T14:59:00.000Z');
});
test('eventos inválidos se rechazan con un motivo técnico', () => {
  rejects({ ...addToCart(), event_type: 'purchase' }, 'tipo_no_autorizado');
  rejects({ ...addToCart(), email: 'x@y.co' }, 'campo_inesperado');
  rejects(addToCart({ event_id: 'no-es-uuid' }), 'event_id_invalido');
  rejects(addToCart({ quantity_added: 0 }), 'cantidad_invalida');
  rejects(addToCart({ quantity_added: 1.5 }), 'cantidad_invalida');
  rejects(addToCart({ occurred_at: '2030-01-01T00:00:00.000Z' }), 'fecha_fuera_de_rango');
  rejects(addToCart({ product_id: 'producto-inexistente' }), 'producto_desconocido');
  rejects(addToCart({ brand_id: 'zipre' }), 'producto_de_otra_marca');
  rejects(addToCart({ brand_id: 'Buds' }), 'marca_invalida');
  rejects(addToCart({ source_page: 'https://otro.sitio/x' }), 'pagina_invalida');
  rejects(outbound({ destination_type: 'tiktok' }), 'destino_invalido');
  rejects(outbound({ quantity_added: 2 }), 'campo_inesperado');
  const { quantity_added, ...missing } = addToCart();
  rejects(missing, 'campo_faltante');
});
test('el cuerpo se limita en tamaño, estructura y cantidad de eventos', () => {
  assert.throws(() => parseBody('x'.repeat(5000)), { reason: 'cuerpo_muy_grande' });
  assert.throws(() => parseBody('{"events":[],"extra":1}'), { reason: 'estructura_inesperada' });
  assert.throws(() => parseBody(JSON.stringify({ events: Array.from({ length: 11 }, () => ({})) })), { reason: 'cantidad_de_eventos' });
  assert.throws(() => parseBody('no es json'), { reason: 'json_invalido' });
});
test('el brand_id del navegador y del servidor es idéntico para todas las marcas', () => {
  const sandbox = { window: {}, location: { protocol: 'file:', pathname: '/', href: 'file:///' }, sessionStorage: { getItem: () => null, setItem() {} }, console, crypto: globalThis.crypto, navigator: {}, document: {}, setTimeout, clearTimeout, URL, Blob };
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(new URL('../Contenido/js/analitica.js', import.meta.url), 'utf8'), sandbox);
  for (const name of ['Kame.col', 'A New Cross', 'Agua Bendita', 'SINNERS', 'ZIPRE', 'Low Trip', 'Maygel Coronel', 'One Five']) {
    assert.equal(sandbox.window.NOVUM_ANALYTICS.brandId(name), brandSlug(name), name);
  }
  assert.equal(brandSlug('Kame.col'), 'kame-col');
});

// ---------- Registro (casos 1, 2, 6–10) ----------
test('agregar un producto registra exactamente un evento', async () => {
  const { fake, handler } = setup();
  const response = await handler(post([addToCart()]));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).results[0].status, 'registrado');
  assert.equal(fake.db.analytics_events.length, 1);
});
test('volver a agregar el mismo producto es una nueva acción legítima', async () => {
  const { fake, handler } = setup();
  await handler(post([addToCart()]));
  await handler(post([addToCart()]));
  assert.equal(fake.db.analytics_events.length, 2);
  assert.equal(new Set(fake.db.analytics_events.map(e => e.event_id)).size, 2);
});
test('el mismo event_id enviado dos veces (reintento) se guarda una sola vez', async () => {
  const { fake, handler } = setup();
  const event = addToCart();
  const first = await (await handler(post([event]))).json();
  const second = await (await handler(post([event]))).json();
  assert.equal(first.results[0].status, 'registrado');
  assert.equal(second.results[0].status, 'duplicado');
  assert.equal(fake.db.analytics_events.length, 1);
});
test('un evento inválido se rechaza y queda constancia técnica sin su contenido', async () => {
  const { fake, handler } = setup();
  const response = await handler(post([addToCart({ product_id: 'no-existe' })]));
  assert.equal(response.status, 400);
  assert.equal(fake.db.analytics_events.length, 0);
  assert.deepEqual(fake.db.analytics_rejections, [{ reason: 'producto_desconocido', event_type: 'add_to_cart' }]);
});
test('en un lote mixto solo se guardan los eventos válidos', async () => {
  const { fake, handler } = setup();
  const body = await (await handler(post([addToCart(), addToCart({ quantity_added: 99 })]))).json();
  assert.deepEqual(body.results.map(r => r.status), ['registrado', 'rechazado']);
  assert.equal(fake.db.analytics_events.length, 1);
});
test('una redirección registra la marca correcta en un carrito con varias marcas', async () => {
  const { fake, handler } = setup();
  await handler(post([
    outbound({ brand_id: 'buds', product_id: 'buds-hoodie-destroyed' }),
    outbound({ brand_id: 'kame-col', product_id: 'kame-gengar' }),
  ]));
  assert.deepEqual(fake.db.analytics_events.map(e => [e.brand_id, e.product_id]), [['buds', 'buds-hoodie-destroyed'], ['kame-col', 'kame-gengar']]);
  const wrong = await (await handler(post([outbound({ brand_id: 'buds', product_id: 'kame-gengar' })]))).json();
  assert.equal(wrong.results[0].reason, 'producto_de_otra_marca');
});
test('una redirección con varios productos cuenta un solo clic', async () => {
  const { fake, handler } = setup();
  await handler(post([outbound({ product_id: undefined, source_component: 'perfil_marca', related_product_ids: ['buds-hoodie-destroyed', 'buds-tank-rib'] })]));
  assert.equal(fake.db.analytics_events.length, 1);
  assert.deepEqual(fake.db.analytics_events[0].related_product_ids, ['buds-hoodie-destroyed', 'buds-tank-rib']);
});
test('origen ajeno, cuerpo grande y método incorrecto se rechazan', async () => {
  const { handler } = setup();
  assert.equal((await handler(post([addToCart()], { Origin: 'https://ataque.example' }))).status, 403);
  assert.equal((await handler(post(JSON.stringify({ events: [addToCart({ source_page: `/${'a'.repeat(110)}` })] }) + ' '.repeat(5000)))).status, 413);
  assert.equal((await handler(new Request(`${ORIGIN}/api/analytics/events`))).status, 405);
});
test('si el almacenamiento falla responde 502 y no confirma el registro', async () => {
  const { fake, handler } = setup();
  fake.state.failNext = 1;
  const response = await handler(post([addToCart()]));
  assert.equal(response.status, 502);
  assert.equal(fake.db.analytics_events.length, 0);
});
test('sin Supabase configurado responde 503 sin errores', async () => {
  const handler = eventsHandler({ getSettings: () => null, catalog });
  assert.equal((await handler(post([addToCart()]))).status, 503);
});

// ---------- Reportes (casos 12–14) ----------
const reportSetup = async () => {
  const { fake, handler } = setup();
  await handler(post([
    addToCart({ occurred_at: '2026-11-11T14:00:00.000Z' }),
    addToCart({ occurred_at: '2026-11-11T14:10:00.000Z', quantity_added: 2 }),
    addToCart({ brand_id: 'kame-col', product_id: 'kame-gengar', occurred_at: '2026-11-11T14:20:00.000Z' }),
    outbound({ occurred_at: '2026-11-11T14:30:00.000Z' }),
    // 03:00 UTC del 11 = 22:00 del 10 en Bogotá: cuenta para el día 10.
    outbound({ brand_id: 'kame-col', product_id: 'kame-gengar', destination_type: 'instagram', occurred_at: '2026-11-11T03:00:00.000Z' }),
  ]));
  const admin = { role: 'admin' };
  const report = reportHandler({ fetchImpl: fake.fetchImpl, getSettings: fake.settings, authenticate: async req => req.headers.authorization === 'Bearer admin' ? admin : req.headers.authorization === 'Bearer cliente' ? { role: 'customer' } : null });
  const get = (query, token = 'admin') => report(new Request(`${ORIGIN}/api/analytics/report?${query}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }));
  return { fake, get };
};
test('las consultas administrativas exigen sesión de administrador', async () => {
  const { get } = await reportSetup();
  assert.equal((await get('from=2026-11-01&to=2026-11-30', null)).status, 401);
  assert.equal((await get('from=2026-11-01&to=2026-11-30', 'cliente')).status, 403);
  assert.equal((await get('from=2026-11-30&to=2026-11-01')).status, 400);
});
test('los eventos se agrupan por marca, producto y día de Bogotá', async () => {
  const { get } = await reportSetup();
  const brands = await (await get('from=2026-11-01&to=2026-11-30&view=marcas')).json();
  const buds = brands.rows.find(r => r.brand_id === 'buds');
  const kame = brands.rows.find(r => r.brand_id === 'kame-col');
  assert.deepEqual([buds.add_to_cart_events, buds.units_added, buds.outbound_clicks, buds.outbound_tienda_web], [2, 3, 1, 1]);
  assert.deepEqual([kame.add_to_cart_events, kame.outbound_clicks, kame.outbound_instagram], [1, 1, 1]);
  assert.deepEqual(brands.totals, { add_to_cart_events: 3, units_added: 4, outbound_clicks: 2 });
  const products = await (await get('from=2026-11-01&to=2026-11-30&view=productos')).json();
  assert.equal(products.rows.find(r => r.product_id === 'buds-hoodie-destroyed').units_added, 3);
  const daily = await (await get('from=2026-11-01&to=2026-11-30&view=diario')).json();
  assert.deepEqual(daily.rows.map(r => [r.day, r.add_to_cart_events, r.outbound_clicks]), [['2026-11-10', 0, 1], ['2026-11-11', 3, 1]]);
  const onlyDay11 = await (await get('from=2026-11-11&to=2026-11-11&view=eventos')).json();
  assert.equal(onlyDay11.rows.length, 4);
});
test('el CSV conserva todas las filas, comillas y columnas', async () => {
  const { fake, get } = await reportSetup();
  const response = await get('from=2026-11-01&to=2026-11-30&view=eventos&format=csv');
  assert.match(response.headers.get('content-type'), /text\/csv/);
  assert.match(response.headers.get('content-disposition'), /novum-analitica-eventos-2026-11-01_2026-11-30\.csv/);
  const lines = (await response.text()).trim().split('\r\n');
  assert.equal(lines.length, fake.db.analytics_events.length + 1);
  assert.equal(lines[0].split(',').length, 14);
  assert.deepEqual(new Set(lines.slice(1).map(line => line.split(',')[0])), new Set(fake.db.analytics_events.map(e => e.event_id)));
  assert.equal(toCsv([{ a: '=SUMA(1)', b: 'con "comillas", y coma' }], ['a', 'b']), "a,b\r\n'=SUMA(1),\"con \"\"comillas\"\", y coma\"\r\n");
});
test('la paginación del reporte no trunca periodos con más de 1000 eventos', async () => {
  const { fake, get } = await reportSetup();
  for (let i = 0; i < 1500; i++) fake.db.analytics_events.push({ ...validateEvent(addToCart(), { catalog, now: NOW }), received_at: NOW.toISOString() });
  const body = await (await get('from=2026-11-01&to=2026-11-30&view=eventos')).json();
  assert.equal(body.rows.length, 1505);
});
test('los datos simulados se leen aparte, nunca de Supabase, y quedan marcados', async () => {
  const { fake, get } = await reportSetup();
  const before = fake.state.requests;
  const brands = await (await get('from=2026-10-01&to=2026-10-31&view=marcas&source=simulados')).json();
  assert.equal(fake.state.requests, before, 'no consulta Supabase');
  assert.equal(brands.simulated, true);
  assert.deepEqual(brands.totals, { add_to_cart_events: 1215, units_added: 1215, outbound_clicks: 9646 });
  const events = await (await get('from=2026-10-01&to=2026-10-31&view=eventos&source=simulados')).json();
  assert.equal(events.rows.length, 10861);
  const daily = await (await get('from=2026-10-01&to=2026-10-01&view=diario&source=simulados')).json();
  assert.equal(daily.rows[0].add_to_cart_events + daily.rows[0].outbound_clicks, 236); // día de Bogotá
  const csv = await get('from=2026-10-01&to=2026-10-31&view=marcas&format=csv&source=simulados');
  assert.match(csv.headers.get('content-disposition'), /novum-analitica-SIMULADOS-marcas/);
  assert.match((await csv.text()).split('\r\n')[1], /^SIMULADOS,/);
  const real = await (await get('from=2026-10-01&to=2026-10-31&view=marcas')).json();
  assert.equal(real.simulated, false);
  assert.equal(real.totals.outbound_clicks, 0, 'los datos reales no incluyen los simulados');
  assert.equal((await get('from=2026-10-01&to=2026-10-31&source=otro')).status, 400);
});
