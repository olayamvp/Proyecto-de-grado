-- Analítica persistente de Novum Label (versión 1 de eventos).
-- Ejecutar en Supabase → SQL Editor después de schema.sql. Es idempotente: se puede
-- volver a ejecutar sin borrar datos. No modifica ni elimina las tablas existentes.

create table if not exists public.analytics_events (
  event_id            uuid primary key,                      -- generado en el navegador; controla reintentos
  event_type          text not null check (event_type in ('add_to_cart', 'outbound_click')),
  event_version       smallint not null default 1 check (event_version >= 1),
  occurred_at         timestamptz not null,                   -- cuándo ocurrió (reloj del navegador, UTC)
  received_at         timestamptz not null default now(),     -- cuándo lo recibió el servidor (UTC)
  brand_id            text not null check (brand_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(brand_id) <= 60),
  product_id          text check (product_id is null or char_length(product_id) between 1 and 120),
  related_product_ids text[] not null default '{}' check (cardinality(related_product_ids) <= 50),
  session_id          uuid,                                   -- anónimo, temporal (sessionStorage, 30 min)
  quantity            integer check (quantity is null or quantity between 1 and 50),
  source_page         text not null check (char_length(source_page) between 1 and 120),
  source_component    text check (source_component is null or source_component in ('catalogo', 'detalle_producto', 'busqueda', 'carrito', 'perfil_marca', 'otro')),
  destination_type    text check (destination_type is null or destination_type in ('tienda_web', 'instagram', 'whatsapp', 'otro')),
  catalog_verified    boolean not null default true,          -- false si no había catálogo para verificar
  constraint analytics_add_to_cart_fields check (
    event_type <> 'add_to_cart' or (product_id is not null and quantity is not null and destination_type is null)),
  constraint analytics_outbound_fields check (
    event_type <> 'outbound_click' or (destination_type is not null and source_component is not null and quantity is null)),
  constraint analytics_received_after_window check (occurred_at <= received_at + interval '5 minutes')
);

create index if not exists analytics_events_occurred_idx on public.analytics_events (occurred_at);
create index if not exists analytics_events_type_occurred_idx on public.analytics_events (event_type, occurred_at);
create index if not exists analytics_events_brand_occurred_idx on public.analytics_events (brand_id, occurred_at);
create index if not exists analytics_events_product_occurred_idx on public.analytics_events (product_id, occurred_at) where product_id is not null;

-- Rechazos: solo el motivo técnico, sin el contenido del evento ni datos del visitante.
create table if not exists public.analytics_rejections (
  id          bigint generated always as identity primary key,
  received_at timestamptz not null default now(),
  reason      text not null check (char_length(reason) <= 60),
  event_type  text check (event_type is null or char_length(event_type) <= 40)
);
create index if not exists analytics_rejections_received_idx on public.analytics_rejections (received_at);

-- Series diarias. El día se calcula en hora de Bogotá (UTC−5); los datos se guardan en UTC.
create or replace view public.analytics_daily_brand with (security_invoker = true) as
select (e.occurred_at at time zone 'America/Bogota')::date as day,
       e.brand_id,
       count(*) filter (where e.event_type = 'add_to_cart')                                     as add_to_cart_events,
       coalesce(sum(e.quantity) filter (where e.event_type = 'add_to_cart'), 0)                as units_added,
       count(*) filter (where e.event_type = 'outbound_click')                                  as outbound_clicks,
       count(*) filter (where e.event_type = 'outbound_click' and e.destination_type = 'tienda_web') as outbound_tienda_web,
       count(*) filter (where e.event_type = 'outbound_click' and e.destination_type = 'instagram')  as outbound_instagram,
       count(*) filter (where e.event_type = 'outbound_click' and e.destination_type = 'whatsapp')   as outbound_whatsapp,
       count(*) filter (where e.event_type = 'outbound_click' and e.destination_type = 'otro')       as outbound_otro
from public.analytics_events e
group by 1, 2;

create or replace view public.analytics_daily_product with (security_invoker = true) as
select (e.occurred_at at time zone 'America/Bogota')::date as day,
       e.brand_id,
       e.product_id,
       count(*) filter (where e.event_type = 'add_to_cart')                      as add_to_cart_events,
       coalesce(sum(e.quantity) filter (where e.event_type = 'add_to_cart'), 0) as units_added,
       count(*) filter (where e.event_type = 'outbound_click')                   as outbound_clicks
from public.analytics_events e
where e.product_id is not null
group by 1, 2, 3;

-- Acceso: nadie desde el navegador. El backend (service role) solo puede insertar y leer;
-- sin UPDATE ni DELETE los registros históricos no se pueden alterar desde la aplicación.
alter table public.analytics_events enable row level security;
alter table public.analytics_rejections enable row level security;
revoke all on public.analytics_events, public.analytics_rejections from anon, authenticated;
revoke all on public.analytics_daily_brand, public.analytics_daily_product from anon, authenticated;
revoke update, delete, truncate on public.analytics_events from service_role;
grant select, insert on public.analytics_events to service_role;
grant select, insert on public.analytics_rejections to service_role;
grant usage, select on sequence public.analytics_rejections_id_seq to service_role;
grant select on public.analytics_daily_brand, public.analytics_daily_product to service_role;
