// Reportes de analítica en el panel: resumen por marca y exportación CSV por periodo.
(() => {
  const form = document.getElementById('analyticsForm');
  if (!form) return;
  const fromInput = document.getElementById('analyticsFrom');
  const toInput = document.getElementById('analyticsTo');
  const message = document.getElementById('analyticsMessage');
  const rows = document.getElementById('analyticsRows');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  // Fechas por defecto: los últimos 30 días en hora de Bogotá.
  const bogotaDay = offsetDays => new Date(Date.now() - 5 * 3_600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);
  fromInput.value = bogotaDay(-29);
  toInput.value = bogotaDay(0);

  const request = (view, format) => {
    const token = sessionStorage.getItem('novum.accessToken');
    const params = new URLSearchParams({ from: fromInput.value, to: toInput.value, view, format });
    return fetch(`/api/analytics/report?${params}`, { headers: { Authorization: `Bearer ${token}` } });
  };
  const failure = async response => {
    const data = await response.json().catch(() => ({}));
    return { 401: 'Tu sesión expiró; vuelve a iniciar sesión.', 403: 'Esta cuenta no es administradora.', 503: 'Falta configurar Supabase en Netlify.' }[response.status]
      || `No se pudo consultar (${data.error || response.status}).`;
  };

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    message.textContent = 'Consultando…';
    try {
      const response = await request('marcas', 'json');
      if (!response.ok) { message.textContent = await failure(response); return; }
      const data = await response.json();
      document.getElementById('totalAdds').textContent = data.totals.add_to_cart_events;
      document.getElementById('totalUnits').textContent = data.totals.units_added;
      document.getElementById('totalClicks').textContent = data.totals.outbound_clicks;
      rows.innerHTML = data.rows.length ? data.rows.map(row => `<tr><td>${esc(row.brand_id)}</td><td>${row.add_to_cart_events}</td><td>${row.units_added}</td><td>${row.outbound_clicks}</td><td>${row.outbound_tienda_web}</td><td>${row.outbound_instagram}</td><td>${row.outbound_whatsapp}</td><td>${row.outbound_otro}</td></tr>`).join('')
        : '<tr><td colspan="8">No hay eventos registrados en este periodo.</td></tr>';
      message.textContent = `Periodo ${data.from} a ${data.to}. Consultado: ${new Date(data.generated_at).toLocaleString('es-CO')}`;
    } catch { message.textContent = 'No se pudo conectar con el servidor de analítica.'; }
  });

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
})();
