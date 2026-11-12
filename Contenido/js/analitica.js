/* Analítica de Novum Label: registra add_to_cart y outbound_click en /api/analytics/events.
   Nunca bloquea la interfaz ni la navegación: si el servidor falla, la tienda sigue igual.
   Sin datos personales: la sesión es un UUID anónimo que vive solo en esta pestaña. */
(() => {
  const ENDPOINT = '/api/analytics/events';
  const SESSION_KEY = 'novum.analytics.session';
  const QUEUE_KEY = 'novum.analytics.pending';
  const SESSION_IDLE_MS = 30 * 60 * 1000;
  const RETRY_DELAYS = [2000, 8000, 30000];
  const MAX_QUEUE = 50;
  const MAX_BODY = 3800;
  const enabled = location.protocol !== 'file:';
  const store = {
    read(key, fallback) { try { return JSON.parse(sessionStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
    write(key, value) { try { sessionStorage.setItem(key, JSON.stringify(value)); } catch {} },
  };
  const log = (level, message, detail) => console[level](`[analítica] ${message}`, detail ?? '');

  const uuid = () => {
    if (crypto.randomUUID) return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40; bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  };
  // Mismo algoritmo que netlify/lib/eventos.mjs (brandSlug).
  const brandId = name => String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  // "/Contenido/ropa_hombre.html" y "/contenido/ropa_hombre" (URL limpia de Netlify) son la misma página.
  const sourcePage = () => (location.pathname.toLowerCase().replace(/\.html$/, '').replace(/\/index$/, '/').replace(/(.)\/$/, '$1') || '/').slice(0, 120);
  function sessionId() {
    const now = Date.now();
    let session = store.read(SESSION_KEY, null);
    if (!session || typeof session.id !== 'string' || now - session.last > SESSION_IDLE_MS) session = { id: uuid(), last: now };
    session.last = now;
    store.write(SESSION_KEY, session);
    return session.id;
  }
  const destinationType = href => {
    try {
      const host = new URL(href, location.href).hostname.replace(/^www\./, '');
      if (host === 'instagram.com' || host.endsWith('.instagram.com')) return 'instagram';
      if (host === 'wa.me' || host === 'whatsapp.com' || host.endsWith('.whatsapp.com')) return 'whatsapp';
      return /^https?:$/.test(new URL(href, location.href).protocol) ? 'tienda_web' : 'otro';
    } catch { return 'otro'; }
  };

  // ---- Cola con reintentos: el mismo event_id en cada intento (el servidor ignora duplicados) ----
  const queue = () => store.read(QUEUE_KEY, []).filter(item => item && item.event && item.event.event_id);
  const saveQueue = items => {
    if (items.length > MAX_QUEUE) log('warn', `cola llena; se descartan ${items.length - MAX_QUEUE} eventos antiguos`);
    store.write(QUEUE_KEY, items.slice(-MAX_QUEUE));
  };
  const remove = ids => saveQueue(queue().filter(item => !ids.includes(item.event.event_id)));
  function batches(items) {
    const groups = [];
    let current = [];
    for (const item of items) {
      if (current.length && (current.length === 10 || JSON.stringify({ events: [...current, item.event] }).length > MAX_BODY)) { groups.push(current); current = []; }
      current.push(item.event);
    }
    if (current.length) groups.push(current);
    return groups;
  }
  let flushing = false, timer = null;
  async function flush() {
    if (!enabled || flushing || !navigator.onLine) return;
    const now = Date.now();
    const due = queue().filter(item => (item.next || 0) <= now);
    if (!due.length) return schedule();
    flushing = true;
    try {
      for (const events of batches(due)) {
        const ids = events.map(event => event.event_id);
        let response;
        try {
          response = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ events }), keepalive: true, credentials: 'same-origin' });
        } catch (error) { retry(ids, `red: ${error.message}`); continue; }
        if (response.status === 429 || response.status >= 500 && response.status !== 503) { retry(ids, `HTTP ${response.status}`); continue; }
        if (response.status === 503) { log('info', 'el servidor de analítica no está configurado; eventos descartados', ids.length); remove(ids); continue; }
        const data = await response.json().catch(() => null);
        if (Array.isArray(data?.results)) {
          for (const result of data.results) if (result.status === 'rechazado') log('warn', `evento rechazado (${result.reason})`, events[result.index]?.event_type);
          remove(ids);
        } else {
          log('warn', `respuesta inesperada HTTP ${response.status}; eventos descartados`, data?.error);
          remove(ids);
        }
      }
    } finally {
      flushing = false;
      schedule();
    }
  }
  function retry(ids, reason) {
    const items = queue().map(item => {
      if (!ids.includes(item.event.event_id)) return item;
      const attempts = (item.attempts || 0) + 1;
      return { ...item, attempts, next: Date.now() + (RETRY_DELAYS[attempts - 1] ?? Infinity) };
    });
    const dropped = items.filter(item => item.attempts > RETRY_DELAYS.length);
    if (dropped.length) log('warn', `eventos no registrados tras ${RETRY_DELAYS.length} reintentos (${reason})`, dropped.map(item => item.event.event_id));
    saveQueue(items.filter(item => item.attempts <= RETRY_DELAYS.length));
  }
  function schedule() {
    clearTimeout(timer);
    const next = Math.min(...queue().map(item => item.next || 0));
    if (Number.isFinite(next)) timer = setTimeout(flush, Math.max(0, next - Date.now()) + 50);
  }

  // ---- API pública ----
  function track({ type, brand, productId = null, quantityAdded, destination, component, relatedProductIds }) {
    if (!enabled) return null;
    const event = {
      event_id: uuid(),
      event_type: type,
      event_version: 1,
      occurred_at: new Date().toISOString(),
      brand_id: brandId(brand),
      source_page: sourcePage(),
      session_id: sessionId(),
    };
    if (component) event.source_component = component;
    if (type === 'add_to_cart') {
      Object.assign(event, { product_id: productId, quantity_added: quantityAdded });
    } else if (type === 'outbound_click') {
      event.destination_type = destination;
      if (productId) event.product_id = productId;
      if (relatedProductIds?.length) event.related_product_ids = relatedProductIds;
    } else { log('warn', `tipo de evento no soportado: ${type}`); return null; }
    if (!event.brand_id) { log('warn', 'evento sin marca; no se envía', type); return null; }
    saveQueue([...queue(), { event, attempts: 0, next: 0 }]);
    setTimeout(flush, 0);
    return event.event_id;
  }

  // Un solo listener para todos los enlaces marcados: un clic = un evento, sin importar
  // cuántos elementos atraviese. Nunca se detiene ni retrasa la navegación.
  const recent = new Map();
  function onOutbound(domEvent) {
    if (domEvent.type === 'auxclick' && domEvent.button !== 1) return;
    const link = domEvent.target instanceof Element ? domEvent.target.closest('a[data-outbound-brand]') : null;
    if (!link || !link.href) return;
    const key = `${link.href}|${link.dataset.outboundComponent || ''}`;
    const now = Date.now();
    if (now - (recent.get(key) || 0) < 1000) return; // doble clic accidental sobre el mismo enlace
    recent.set(key, now);
    const related = (link.dataset.outboundRelated || '').split(',').map(id => id.trim()).filter(Boolean);
    track({
      type: 'outbound_click',
      brand: link.dataset.outboundBrand,
      productId: link.dataset.outboundProduct || null,
      destination: destinationType(link.href),
      component: link.dataset.outboundComponent || 'otro',
      relatedProductIds: related,
    });
  }
  if (enabled) {
    document.addEventListener('click', onOutbound);
    document.addEventListener('auxclick', onOutbound);
    // Al salir de la página se intenta un último envío; lo que quede se reenvía al volver
    // (mismo event_id, así que nunca se duplica).
    window.addEventListener('pagehide', () => {
      if (!navigator.sendBeacon) return;
      for (const events of batches(queue())) navigator.sendBeacon(ENDPOINT, new Blob([JSON.stringify({ events })], { type: 'application/json' }));
    });
    window.addEventListener('online', flush);
    setTimeout(flush, 0);
  }
  // Atributos para marcar un enlace a una tienda oficial sin cambiar su href.
  const outboundAttributes = ({ brand, productId, component, relatedProductIds }) => {
    const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    return [`data-outbound-brand="${esc(brandId(brand))}"`, `data-outbound-component="${esc(component)}"`,
      productId ? `data-outbound-product="${esc(productId)}"` : '', relatedProductIds?.length ? `data-outbound-related="${esc(relatedProductIds.join(','))}"` : ''].filter(Boolean).join(' ');
  };
  window.NOVUM_ANALYTICS = { track, brandId, outboundAttributes, flush };
})();
