// Tablero de analítica del panel: indicadores, evolución diaria, destinos, marcas y productos
// del periodo, más exportación CSV. Todo sale de /api/analytics/report (solo administradores).
(() => {
  const form = document.getElementById('analyticsForm');
  if (!form) return;
  const $ = id => document.getElementById(id);
  const fromInput = $('analyticsFrom'), toInput = $('analyticsTo'), message = $('analyticsMessage');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const fmt = new Intl.NumberFormat('es-CO');
  const DESTINATIONS = [['outbound_tienda_web', 'Tienda web'], ['outbound_instagram', 'Instagram'], ['outbound_whatsapp', 'WhatsApp'], ['outbound_otro', 'Otro']];
  const bogotaDay = offsetDays => new Date(Date.now() - 5 * 3_600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);
  const shortDay = day => new Date(`${day}T12:00:00Z`).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const longDay = day => new Date(`${day}T12:00:00Z`).toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'long', timeZone: 'UTC' });

  // Nombres legibles desde el catálogo publicado (el reporte guarda identificadores estables).
  let names = { brands: {}, products: {}, brandCount: 0 };
  const namesReady = (window.CLOTHES_PRODUCTS_READY || Promise.resolve()).catch(() => {}).then(() => {
    const slug = name => String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    // Incluye los catálogos completos de cada marca: el visible solo muestra una selección.
    const all = ['HOMEN_PRODUCTS', 'PARTNER_PRODUCTS', 'SAVAGE_PRODUCTS', 'ZIPRE_PRODUCTS', 'KAME_PRODUCTS', 'WEEDGREEN_PRODUCTS', 'CLOTHES_PRODUCTS'].flatMap(key => Array.isArray(window[key]) ? window[key] : []);
    for (const product of all) {
      names.brands[slug(product.brand)] = product.brand;
      names.products[product.id] = product.name;
    }
    names.brandCount = new Set((window.CLOTHES_PRODUCTS || []).map(product => slug(product.brand))).size;
  });

  // Fuente: datos reales (Supabase) o el conjunto simulado de octubre, siempre señalado como tal.
  const SIMULATED_RANGE = ['2026-10-01', '2026-10-31'];
  let source = 'reales';
  const request = (view, format = 'json') => {
    const params = new URLSearchParams({ from: fromInput.value, to: toInput.value, view, format, source });
    return fetch(`/api/analytics/report?${params}`, { headers: { Authorization: `Bearer ${sessionStorage.getItem('novum.accessToken')}` } });
  };
  const failure = async response => {
    const data = await response.json().catch(() => ({}));
    return { 401: 'Tu sesión expiró; vuelve a iniciar sesión.', 403: 'Esta cuenta no es administradora.', 503: 'Falta configurar Supabase en Netlify.' }[response.status]
      || `No se pudo consultar (${data.error || response.status}).`;
  };

  // ---- Gráfica de líneas: una sola escala (ambas series cuentan eventos) ----
  function lineChart(host, days) {
    if (!days.some(d => d.add_to_cart_events || d.outbound_clicks)) {
      host.innerHTML = '<div class="empty">Todavía no hay interacciones registradas en este periodo.</div>';
      return;
    }
    const W = 640, H = 220, L = 34, R = 14, T = 12, B = 26;
    const max = Math.max(1, ...days.flatMap(d => [d.add_to_cart_events, d.outbound_clicks]));
    const step = Math.max(1, Math.ceil(max / 4));
    const top = step * 4;
    const x = i => L + (days.length === 1 ? (W - L - R) / 2 : i * (W - L - R) / (days.length - 1));
    const y = v => T + (H - T - B) * (1 - v / top);
    const path = key => days.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d[key]).toFixed(1)}`).join('');
    const grid = [0, 1, 2, 3, 4].map(k => `<line x1="${L}" x2="${W - R}" y1="${y(k * step)}" y2="${y(k * step)}"/><text x="${L - 6}" y="${y(k * step) + 4}" text-anchor="end">${fmt.format(k * step)}</text>`).join('');
    const ticks = [...new Set([0, Math.floor((days.length - 1) / 2), days.length - 1])]
      .map(i => `<text x="${x(i)}" y="${H - 6}" text-anchor="${i === 0 && days.length > 1 ? 'start' : i === days.length - 1 && days.length > 1 ? 'end' : 'middle'}">${shortDay(days[i].day)}</text>`).join('');
    const dots = days.length <= 2 ? days.map((d, i) => `<circle cx="${x(i)}" cy="${y(d.add_to_cart_events)}" r="4" fill="var(--series-1)"/><circle cx="${x(i)}" cy="${y(d.outbound_clicks)}" r="4" fill="var(--series-2)"/>`).join('') : '';
    host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolución diaria de agregados al carrito y clics a tiendas oficiales">
      <g class="grid">${grid}</g>${ticks}
      <path d="${path('add_to_cart_events')}" fill="none" stroke="var(--series-1)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      <path d="${path('outbound_clicks')}" fill="none" stroke="var(--series-2)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>${dots}
      <g class="hover" visibility="hidden"><line y1="${T}" y2="${H - B}" stroke="var(--muted-ink)" stroke-dasharray="3 3"/>
        <circle r="5" fill="var(--series-1)" stroke="var(--card)" stroke-width="2"/><circle r="5" fill="var(--series-2)" stroke="var(--card)" stroke-width="2"/></g>
      <rect x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="transparent"/></svg><div class="chart-tip" hidden></div>`;
    const svg = host.querySelector('svg'), hover = svg.querySelector('.hover'), tip = host.querySelector('.chart-tip');
    const [cross, dotA, dotB] = hover.children;
    const show = event => {
      const box = svg.getBoundingClientRect();
      const px = (event.clientX - box.left) * W / box.width;
      const i = days.length === 1 ? 0 : Math.max(0, Math.min(days.length - 1, Math.round((px - L) / ((W - L - R) / (days.length - 1)))));
      const d = days[i];
      cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i));
      dotA.setAttribute('cx', x(i)); dotA.setAttribute('cy', y(d.add_to_cart_events));
      dotB.setAttribute('cx', x(i)); dotB.setAttribute('cy', y(d.outbound_clicks));
      hover.setAttribute('visibility', 'visible');
      tip.innerHTML = `<b>${longDay(d.day)}</b><i style="background:var(--series-1)"></i>Agregados: ${fmt.format(d.add_to_cart_events)} (${fmt.format(d.units_added)} u.)<br><i style="background:var(--series-2)"></i>Clics a tiendas: ${fmt.format(d.outbound_clicks)}`;
      tip.hidden = false;
      const left = x(i) * box.width / W;
      tip.style.left = `${Math.min(Math.max(0, left - tip.offsetWidth / 2), box.width - tip.offsetWidth)}px`;
      tip.style.top = `${Math.max(0, y(Math.max(d.add_to_cart_events, d.outbound_clicks)) * box.height / H - tip.offsetHeight - 12)}px`;
    };
    svg.addEventListener('pointermove', show);
    svg.addEventListener('pointerleave', () => { hover.setAttribute('visibility', 'hidden'); tip.hidden = true; });
  }

  // Todos los días del periodo, con cero donde no hubo eventos.
  function fillDays(rows) {
    const byDay = Object.fromEntries(rows.map(row => [row.day, row]));
    const days = [];
    for (let t = Date.parse(`${fromInput.value}T00:00:00Z`); t <= Date.parse(`${toInput.value}T00:00:00Z`); t += 86_400_000) {
      const day = new Date(t).toISOString().slice(0, 10);
      days.push({ day, add_to_cart_events: 0, units_added: 0, outbound_clicks: 0, ...byDay[day] });
    }
    return days;
  }
  const bar = (value, total, color) => `<div class="bar" role="img" aria-label="${total ? Math.round(value / total * 100) : 0}%"><span style="width:${total ? Math.max(value ? 2 : 0, value / total * 100) : 0}%;background:${color}"></span></div>`;

  let productRows = [], showAllProducts = false;
  function renderProducts() {
    const rows = showAllProducts ? productRows : productRows.slice(0, 10);
    $('productStatsRows').innerHTML = rows.length ? rows.map(row => `<tr><td>${esc(names.products[row.product_id] || row.product_id)}</td><td>${esc(names.brands[row.brand_id] || row.brand_id)}</td><td class="num">${fmt.format(row.add_to_cart_events)}</td><td class="num">${fmt.format(row.units_added)}</td><td class="num">${fmt.format(row.outbound_clicks)}</td></tr>`).join('')
      : '<tr><td colspan="5" class="admin-small">Sin productos con interacción en este periodo.</td></tr>';
    $('moreProducts').hidden = productRows.length <= 10;
    $('moreProducts').textContent = showAllProducts ? 'Ver solo los 10 primeros' : `Ver los ${productRows.length} productos`;
  }
  $('moreProducts').addEventListener('click', () => { showAllProducts = !showAllProducts; renderProducts(); });

  async function load() {
    if (!form.reportValidity()) return;
    message.textContent = 'Consultando…';
    try {
      const responses = await Promise.all(['marcas', 'productos', 'diario'].map(view => request(view)));
      const failed = responses.find(response => !response.ok);
      if (failed) { message.textContent = await failure(failed); return; }
      const [brands, products, daily] = await Promise.all(responses.map(response => response.json()));
      await namesReady;
      const t = brands.totals;
      $('totalAdds').textContent = fmt.format(t.add_to_cart_events);
      $('totalUnits').textContent = fmt.format(t.units_added);
      $('totalClicks').textContent = fmt.format(t.outbound_clicks);
      const active = brands.rows.filter(row => row.add_to_cart_events || row.outbound_clicks).length;
      $('totalBrands').textContent = fmt.format(active);
      $('totalBrandsNote').textContent = names.brandCount ? `de ${names.brandCount} marcas del catálogo` : 'marcas con al menos un evento';

      lineChart($('dailyChart'), fillDays(daily.rows));

      const clicks = t.outbound_clicks;
      $('destinations').innerHTML = clicks ? DESTINATIONS.map(([key, label]) => {
        const value = brands.rows.reduce((sum, row) => sum + Number(row[key] || 0), 0);
        return `<li><span>${label}</span><strong>${fmt.format(value)} · ${Math.round(value / clicks * 100)}%</strong>${bar(value, clicks, 'var(--series-2)')}</li>`;
      }).join('') : '<li class="empty">Aún no hay clics hacia tiendas oficiales.</li>';

      $('brandRows').innerHTML = brands.rows.length ? brands.rows.map(row => `<tr><td>${esc(names.brands[row.brand_id] || row.brand_id)}</td><td class="num">${fmt.format(row.add_to_cart_events)}</td><td class="num">${fmt.format(row.units_added)}</td><td class="num">${fmt.format(row.outbound_clicks)}</td><td class="bar-cell">${bar(row.add_to_cart_events, t.add_to_cart_events, 'var(--series-1)')}</td></tr>`).join('')
        : '<tr><td colspan="5" class="admin-small">Sin interacciones en este periodo.</td></tr>';

      productRows = products.rows;
      showAllProducts = false;
      renderProducts();
      message.textContent = `${brands.simulated ? 'DATOS SIMULADOS · ' : ''}Del ${longDay(brands.from)} al ${longDay(brands.to)} · actualizado ${new Date(brands.generated_at).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' })}`;
    } catch { message.textContent = 'No se pudo conectar con el servidor de analítica.'; }
  }

  const presets = [...document.querySelectorAll('[data-range]')];
  const setPreset = days => {
    presets.forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.range) === days)));
    if (days) { fromInput.value = bogotaDay(-(days - 1)); toInput.value = bogotaDay(0); }
  };
  presets.forEach(button => button.addEventListener('click', () => { setPreset(Number(button.dataset.range)); load(); }));
  const sources = [...document.querySelectorAll('[data-source]')];
  sources.forEach(button => button.addEventListener('click', () => {
    if (button.dataset.source === source) return;
    source = button.dataset.source;
    sources.forEach(other => other.setAttribute('aria-pressed', String(other === button)));
    const simulated = source === 'simulados';
    $('simulatedBanner').hidden = !simulated;
    form.closest('.admin-page')?.classList.toggle('is-simulated', simulated);
    if (simulated) { setPreset(0); [fromInput.value, toInput.value] = SIMULATED_RANGE; } else setPreset(30);
    load();
  }));
  [fromInput, toInput].forEach(input => input.addEventListener('input', () => setPreset(0)));
  form.addEventListener('submit', event => { event.preventDefault(); load(); });

  document.querySelectorAll('[data-csv]').forEach(button => button.addEventListener('click', async () => {
    if (!form.reportValidity()) return;
    message.textContent = 'Generando CSV…';
    try {
      const response = await request(button.dataset.csv, 'csv');
      if (!response.ok) { message.textContent = await failure(response); return; }
      const name = /filename="([^"]+)"/.exec(response.headers.get('content-disposition') || '')?.[1] || `novum-analitica-${button.dataset.csv}.csv`;
      const link = document.createElement('a');
      link.href = URL.createObjectURL(await response.blob());
      link.download = name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      message.textContent = `Descargado ${name}.`;
    } catch { message.textContent = 'No se pudo generar el CSV.'; }
  }));

  setPreset(30);
  load();
})();
