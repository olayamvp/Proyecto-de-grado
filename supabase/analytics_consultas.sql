-- Consultas de investigación para Supabase → SQL Editor (solo lectura).
-- Cambie las fechas del periodo en la primera línea de cada consulta. Los días son de Bogotá.
-- «Agregado al carrito» y «clic a tienda oficial» son intenciones, no ventas confirmadas.

-- 1. Por emprendimiento: eventos, unidades y redirecciones por tipo de destino.
select brand_id,
       sum(add_to_cart_events) as add_to_cart_events, sum(units_added) as units_added,
       sum(outbound_clicks) as outbound_clicks, sum(outbound_tienda_web) as tienda_web,
       sum(outbound_instagram) as instagram, sum(outbound_whatsapp) as whatsapp, sum(outbound_otro) as otro
from analytics_daily_brand
where day between '2026-11-01' and '2026-11-30'
group by brand_id order by add_to_cart_events desc, outbound_clicks desc;

-- 2. Por producto (comparación dentro de cada marca).
select brand_id, product_id,
       sum(add_to_cart_events) as add_to_cart_events, sum(units_added) as units_added, sum(outbound_clicks) as outbound_clicks
from analytics_daily_product
where day between '2026-11-01' and '2026-11-30'
group by brand_id, product_id order by brand_id, add_to_cart_events desc;

-- 3. Serie temporal diaria (todas las marcas).
select day, sum(add_to_cart_events) as add_to_cart_events, sum(units_added) as units_added, sum(outbound_clicks) as outbound_clicks
from analytics_daily_brand
where day between '2026-11-01' and '2026-11-30'
group by day order by day;

-- 4. Evolución diaria de una marca.
select * from analytics_daily_brand
where brand_id = 'kame-col' and day between '2026-11-01' and '2026-11-30' order by day;

-- 5. Sesiones anónimas distintas con al menos un evento (ver limitaciones en docs/analitica.md).
select (occurred_at at time zone 'America/Bogota')::date as day, count(distinct session_id) as sesiones_con_eventos
from analytics_events
where occurred_at >= timestamptz '2026-11-01 00:00 America/Bogota' and occurred_at < timestamptz '2026-12-01 00:00 America/Bogota'
group by 1 order by 1;

-- 6. Calidad de datos: rechazos por motivo y eventos sin verificación de catálogo.
select reason, event_type, count(*) from analytics_rejections
where received_at >= now() - interval '30 days' group by 1, 2 order by 3 desc;
select count(*) filter (where not catalog_verified) as sin_verificar, count(*) as total from analytics_events;

-- 7. Exportación completa (desde el editor: botón «Download CSV» del resultado).
select * from analytics_events
where occurred_at >= timestamptz '2026-11-01 00:00 America/Bogota' and occurred_at < timestamptz '2026-12-01 00:00 America/Bogota'
order by occurred_at, event_id;
