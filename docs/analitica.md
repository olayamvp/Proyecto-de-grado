# Analítica persistente de Novum Label

Registro verificable de dos interacciones dentro de la plataforma: **agregar un producto al carrito** (`add_to_cart`) y **activar un enlace hacia el canal comercial oficial** de un emprendimiento (`outbound_click`). Los eventos se guardan en una base de datos Postgres (Supabase) y se consultan por emprendimiento, producto y periodo, con exportación CSV.

> Los eventos son **oportunidades de interacción y de derivación comercial**, no ventas. Novum Label no procesa pagos y no puede saber si una visita a la tienda oficial terminó en compra.

## A. Diagnóstico técnico inicial

| Aspecto | Hallazgo |
|---|---|
| Frontend | Sitio estático HTML, CSS y JavaScript sin framework ni paso de build (Bootstrap 5, Font Awesome y Three.js por CDN). El catálogo se arma en el navegador desde `Contenido/js/clothes-data.js` y los archivos `*-products.js`. |
| Backend | Carpeta `api/` con funciones en formato Vercel (`req`/`res`). Usan Supabase por REST con la *service role*. |
| Despliegue | Netlify (`novumlabel.netlify.app`) publica la rama `main`. **No había `netlify/functions`**: `/api/analytics`, `/api/catalog`, `/api/admin` y `/api/public-config` respondían 404 en producción, así que ninguna función de backend se ejecutaba. |
| Analítica previa | `api/analytics.js` solo registraba `heartbeat` (presencia) y `try-on`. No cubría el carrito ni las redirecciones, no tenía idempotencia, límite de frecuencia ni validación contra el catálogo, y usaba `novum.visitorId`, un identificador persistente en `localStorage`. En Netlify sus envíos fallaban con 404. |
| Carrito | `addToCart` en `Contenido/js/catalogo.js` es la única acción explícita de agregar. `carrito.js` gestiona cantidades, eliminación y vaciado. Todo se guarda en `localStorage['clothes.cart']`. |
| Redirecciones | Enlaces `<a target="_blank">` hacia `officialUrl` en la tarjeta y el detalle del catálogo, en los resultados de búsqueda y en el carrito (un enlace por producto, agrupados por marca). El directorio de marcas tiene «visitar marca» (`brand.url`). No hay enlaces a Instagram ni a WhatsApp. |
| Identificadores | Cada producto tiene un `id` estable. Las marcas solo tenían su nombre (`brand`), sin identificador. |

## B. Solución implementada

| Archivo | Responsabilidad |
|---|---|
| `supabase/analytics_events.sql` | Migración idempotente: tablas `analytics_events` y `analytics_rejections`, restricciones, índices, vistas diarias y permisos de solo inserción y lectura. |
| `supabase/analytics_consultas.sql` | Consultas de investigación listas para el editor SQL de Supabase. |
| `netlify/functions/analytics-events.mjs` | `POST /api/analytics/events`: valida, verifica contra el catálogo, aplica límites y guarda de forma idempotente. |
| `netlify/functions/analytics-report.mjs` | `GET /api/analytics/report`: métricas por marca, producto y día, y CSV. Solo administradores. |
| `netlify/functions/admin.mjs`, `public-config.mjs` | Reutilizan `api/admin.js` y `api/public-config.js` en Netlify (el panel los necesita para iniciar sesión). |
| `netlify/lib/eventos.mjs` | Reglas de validación, `brandSlug`, lectura acotada del cuerpo y CSV seguro. |
| `netlify/lib/adaptador-vercel.mjs` | Ejecuta los handlers existentes de `api/` en Netlify sin reescribirlos. |
| `netlify/lib/catalogo-indice.json` | Índice producto → marca (513 productos, 20 marcas) generado por `scripts/generar-indice-analitica.mjs`. |
| `netlify.toml` | Declara la carpeta de funciones. No cambia cómo se publica el sitio. |
| `Contenido/js/analitica.js` | Módulo del navegador: `NOVUM_ANALYTICS.track()`, cola con reintentos, sesión anónima y un listener único para los enlaces a tiendas. |
| `catalogo.js`, `carrito.js`, `descubrimiento.js` | Llamada a `track` después de agregar al carrito y atributos `data-outbound-*` en los enlaces oficiales. Los `href` no cambian. |
| 14 páginas HTML del catálogo | Cargan `analitica.js` después de `clothes-data.js`. |
| `Contenido/auth/admin.html`, `Contenido/js/admin-analitica.js` | Sección de reportes con selector de fechas y descarga de CSV. |
| `tests/` | Pruebas automáticas (`node --test tests/`) y un Supabase falso en memoria. |
| `scripts/servidor-local.mjs` | Servidor de pruebas manuales sin credenciales. |

No se agregaron dependencias de ejecución. `api/analytics.js` y sus tablas no se modificaron.

## C. Modelo de datos

Tabla `public.analytics_events` (una fila por acción del visitante):

| Campo | Tipo | Regla |
|---|---|---|
| `event_id` | `uuid` PK | Generado en el navegador. Se reutiliza en los reintentos, así que la base nunca guarda dos veces la misma acción. |
| `event_type` | `text` | `add_to_cart` o `outbound_click`. |
| `event_version` | `smallint` | Versión del esquema del evento (actual: 1). |
| `occurred_at` | `timestamptz` | Momento de la acción según el navegador, en UTC. No puede ser posterior a la recepción en más de 5 minutos. |
| `received_at` | `timestamptz` | Momento en que el servidor lo recibió, en UTC. |
| `brand_id` | `text` | *Slug* estable del nombre de la marca (`Kame.col` → `kame-col`). |
| `product_id` | `text` | Obligatorio en `add_to_cart`; en `outbound_click` cuando el enlace es de un producto. |
| `related_product_ids` | `text[]` | Productos asociados a una única redirección de varios productos (cuenta un solo clic). |
| `session_id` | `uuid` | Sesión anónima de la pestaña (ver sección 7). |
| `quantity` | `integer` 1–50 | Unidades agregadas (solo `add_to_cart`). |
| `source_page` | `text` | Ruta normalizada, por ejemplo `/contenido/ropa_hombre`. |
| `source_component` | `text` | `catalogo`, `detalle_producto`, `busqueda`, `carrito`, `perfil_marca` u `otro`. |
| `destination_type` | `text` | `tienda_web`, `instagram`, `whatsapp` u `otro` (solo `outbound_click`). |
| `catalog_verified` | `boolean` | Si el producto y la marca se verificaron contra el catálogo. |

Restricciones `CHECK` por tipo de evento. Índices por `occurred_at` y por `(event_type | brand_id | product_id, occurred_at)`.

Otras estructuras:
- **Vistas** `analytics_daily_brand` y `analytics_daily_product`: agregados por día de Bogotá.
- **`analytics_rejections`**: guarda solo el motivo técnico y el tipo de evento, sin el contenido.
- **Permisos**: el backend puede `INSERT` y `SELECT`; nadie puede hacer `UPDATE` ni `DELETE` desde la aplicación; el navegador (`anon`/`authenticated`) no tiene acceso.

## D. Integración

**`add_to_cart`.** Se envía dentro de `addToCart()`, después de guardar el carrito en `localStorage`. Cada clic en «Añadir al carrito» es una acción y un evento con `quantity_added: 1`, igual que el carrito suma una unidad. No generan eventos:
- renderizar la página,
- recargarla,
- restaurar el carrito,
- cambiar cantidades, quitar o vaciar desde la página del carrito,
- los productos que ya estaban guardados antes de la sesión.

**`outbound_click`.** Un único listener de `click` (y de `auxclick` con la rueda) sobre `document` detecta los enlaces `a[data-outbound-brand]`. Un clic produce un evento aunque atraviese varios elementos. Un segundo clic sobre el mismo enlace dentro de un segundo se trata como doble clic accidental y no se registra. La marca y el producto salen del enlace concreto, así que en un carrito con varias marcas cada clic se atribuye a la marca de ese enlace. El tipo de destino se deduce del dominio. La navegación nunca se detiene ni se retrasa.

**Envío.**
- Cola en `sessionStorage` y `fetch` con `keepalive`.
- Si hay error de red, 429 o 5xx: hasta 3 reintentos (2 s, 8 s y 30 s) con el mismo `event_id`.
- Al salir de la página, `navigator.sendBeacon` hace un último intento. Lo que quede se reenvía en la siguiente página y el servidor ignora los duplicados.
- Un evento solo se da por registrado cuando el servidor responde `registrado` o `duplicado`.
- Los fallos se reportan en la consola como `[analítica] …` y nunca se muestran al visitante.

**Servidor.**
1. Lista blanca de tipos y campos.
2. Cuerpo de máximo 4 KB y 10 eventos.
3. Mismo origen.
4. Verificación de que el producto existe y pertenece a la marca: primero contra el índice del catálogo y luego contra `catalog_products` si el producto se creó desde el panel.
5. Límite de 60 solicitudes por minuto e IP, aplicado por Netlify (la IP no se guarda).
6. Inserción con `ON CONFLICT (event_id) DO NOTHING`.
7. Los rechazos se registran en los logs de la función y en `analytics_rejections`.

## E. Configuración

1. **Supabase.** En el SQL Editor, ejecute `supabase/schema.sql` (si aún no lo hizo) y luego `supabase/analytics_events.sql`.
2. **Netlify → Site configuration → Environment variables.** Cree `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY`, con el *scope* «Functions». La *service role* es secreta: no debe ir a GitHub ni al código del navegador.
3. **Administrador.** Cree la cuenta en `/Contenido/auth/acceso.html` y asígnele el rol con el `insert` comentado al final de `schema.sql`.
4. **Desplegar.** Publique `main` (Netlify despliega solo). Compruebe `https://novumlabel.netlify.app/api/public-config`: debe responder `{"configured":true,…}`.
5. **Si cambia el catálogo.** Ejecute `node scripts/generar-indice-analitica.mjs` y suba el `catalogo-indice.json` actualizado. Si no lo hace, los eventos de productos nuevos se rechazan como `producto_desconocido`, salvo que el producto exista en `catalog_products`.

**Local.** Requiere Node 20 o superior. Ejecute `node scripts/servidor-local.mjs` y abra `http://localhost:8888`. Usa un Supabase falso en memoria. El token del reporte local es `admin-local` y los eventos guardados se ven en `/__pruebas/eventos`. Con `ANALITICA_FALLA=1` se simula la caída del servidor.

Mientras las variables no estén configuradas, el endpoint responde 503, el navegador descarta los eventos sin afectar la tienda y no se registra nada.

## F. Verificación

| # | Caso | Cómo se verificó | Resultado |
|---|---|---|---|
| 1 | Agregar un producto genera exactamente un evento | Navegador (servidor local) y prueba automática | ✔ |
| 2 | Volver a agregar el mismo producto es una acción nueva | Navegador y prueba automática | ✔ |
| 3 | Recargar no genera eventos | Navegador: 3 eventos antes y después de recargar | ✔ |
| 4 | Restaurar el carrito no genera eventos | Navegador: abrir el carrito con 2 productos guardados | ✔ |
| 5 | Cambiar cantidades no cuenta como `add_to_cart` | Navegador: cantidad 2 → 5 sin eventos nuevos | ✔ |
| 6 | La redirección registra el emprendimiento correcto | Navegador: enlace de Kame.col → `kame-col` / `kame-gengar` | ✔ |
| 7 | En un carrito con varias marcas no hay atribuciones cruzadas | Prueba automática: producto de otra marca → rechazado | ✔ |
| 8 | El mismo `event_id` no genera dos registros | Prueba automática y SQL real (PGlite) | ✔ |
| 9 | Un evento inválido se rechaza | 13 variantes inválidas + lote mixto | ✔ |
| 10 | Si la analítica falla, el carrito y los enlaces funcionan | Navegador con el envío bloqueado: el carrito sube, el `href` queda intacto y el reintento registra una vez | ✔ |
| 11 | Persistencia tras reiniciar o desplegar | Garantizada por diseño (Postgres; la función no guarda estado) | **Pendiente**: confirmar en Supabase real tras dos despliegues |
| 12 | Los reportes no son públicos | Prueba automática: sin sesión 401, cliente 403. Navegador: 401 | ✔ |
| 13 | Agrupación por producto, marca y día | Prueba automática (incluye el corte de día de Bogotá) y vistas SQL en PGlite | ✔ |
| 14 | El CSV conserva filas y columnas | Prueba automática: filas = eventos, 14 columnas, comillas, protección de fórmulas y paginación de más de 1000 filas | ✔ |

Comandos de verificación:
- `node --test tests/`: 18 pruebas, todas aprobadas.
- La migración también se ejecutó dos veces en Postgres (PGlite) para comprobar que es idempotente, junto con sus restricciones, vistas, permisos y las consultas de `analytics_consultas.sql`.

Pruebas manuales reproducibles (con `node scripts/servidor-local.mjs`):
1. Borre `localStorage['clothes.cart']`, abra `/Contenido/ropa_hombre.html` y pulse «Añadir al carrito» dos veces. En `/__pruebas/eventos` deben aparecer 2 eventos `add_to_cart`.
2. Recargue la página y abra `/Contenido/carrito.html`. No debe haber eventos nuevos.
3. Cambie una cantidad en el carrito. No debe haber eventos nuevos.
4. Pulse «Ver … y pagar en tienda oficial» de cada marca. Debe aparecer un `outbound_click` por clic con la marca de ese enlace.
5. Reinicie el servidor con `ANALITICA_FALLA=1` y repita el paso 1. El carrito debe seguir funcionando y la consola debe mostrar avisos `[analítica]`.

Limitaciones pendientes:
- El caso 11 requiere Supabase configurado.
- El límite de frecuencia de Netlify depende del plan; verifique en el panel que la regla esté activa.
- Los productos que llegan solo por APIs remotas necesitan estar en `catalog_products` o en el índice.

## G. Consulta y exportación

- **Panel**: `/Contenido/auth/admin.html` → «Analítica del carrito y redirecciones». Elija Desde y Hasta y use «Ver resumen» o los botones de CSV: por marca, por producto, serie diaria, diario por marca y eventos individuales.
- **API** (requiere un token de administrador):

  ```
  GET /api/analytics/report?from=AAAA-MM-DD&to=AAAA-MM-DD&view=marcas|productos|diario|diario_marca|eventos&format=json|csv
  ```

  El periodo se interpreta en días de Bogotá y admite como máximo 2 años.
- **SQL**: `supabase/analytics_consultas.sql` en el SQL Editor de Supabase. Use «Download CSV» sobre el resultado.

## H. Documentación académica

**Variables registradas.** Tipo de interacción, emprendimiento (`brand_id`), producto, unidades, página y componente de origen, tipo de canal de destino, momento de la acción y momento de recepción (UTC) y sesión anónima.

**Reglas de contabilización.**
1. Un `add_to_cart` equivale a una pulsación de «Añadir al carrito» que modificó el carrito.
2. Un `outbound_click` equivale a una activación explícita de un enlace hacia el canal oficial (clic o clic central). No se cuentan visualizaciones ni dobles clics dentro de un segundo.
3. Una redirección con varios productos cuenta como un solo clic y lista sus productos en `related_product_ids`. Las métricas por producto usan solo `product_id`, para no multiplicar clics.
4. Los cambios de cantidad, las eliminaciones, las recargas y los carritos restaurados no se cuentan.
5. Los reintentos no duplican registros, gracias a `event_id`.
6. Los días se agregan en hora de Bogotá (UTC−5).

**Sesiones.** Se identifican con un UUID aleatorio en `sessionStorage`, que expira tras 30 minutos sin actividad o al cerrar la pestaña. No se vincula con personas, cuentas ni otros sitios. Una persona puede producir varias sesiones (varias pestañas, otro dispositivo o la expiración), y por eso «sesiones con eventos» **no equivale a visitantes únicos**.

**Limitaciones de los indicadores.**
- Miden intención dentro de Novum Label, **no ventas ni conversiones**.
- La atribución entre M1 y M2 no es causal: otros factores (campañas, temporada, publicaciones en Instagram) también pueden afectar los indicadores.
- Los bloqueadores de contenido, la desactivación de JavaScript o la pérdida de conexión pueden omitir eventos.
- La hora de `occurred_at` depende del reloj del dispositivo; `received_at` es la referencia del servidor.
- Las métricas empiezan a contar desde la activación en producción: no hay datos retroactivos y no deben completarse con valores estimados o simulados.

**Privacidad.**
- No se guardan nombres, correos, teléfonos, direcciones, mensajes, datos de pago, IP ni huellas del dispositivo.
- El límite por IP lo aplica Netlify sin almacenarla en la base.
- Antes de activar la analítica en producción se recomienda publicar un aviso de privacidad que informe esta finalidad, conforme a la Ley 1581 de 2012 y el Decreto 1377 de 2013. El sitio aún no tiene esa página.
- La analítica previa (`novum.visitorId`, persistente en `localStorage`) sigue existiendo y conviene evaluarla con el mismo criterio de minimización.

## Datos simulados (octubre de 2026)

El panel tiene un selector **Datos reales / Simulados (oct.)**. Los simulados son un conjunto de
demostración de 10.861 eventos (1.215 agregados al carrito y 9.646 clics a tiendas) recibido como
`2026-10-01_2026-10-31.csv`. **No son mediciones**: la analítica real empezó el 11 de noviembre de
2026, y el archivo usa el catálogo depurado de noviembre (247 prendas).

- Viven en `netlify/lib/eventos-simulados-2026-10.mjs` y se incluyen con la función del reporte;
  **nunca se cargan en Supabase**, así que no se mezclan con `analytics_events`.
- `GET /api/analytics/report?...&source=simulados` los consulta; la respuesta trae `simulated: true`.
- En el panel aparece un aviso visible y los indicadores llevan la marca «sim.».
- Los CSV exportados se llaman `novum-analitica-SIMULADOS-…` y su primera columna es `datos=SIMULADOS`.
- Para quitarlos: borrar ese archivo, `netlify/lib/simulados.mjs` y el selector del panel.
