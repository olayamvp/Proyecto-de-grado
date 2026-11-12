# Restaurar el histórico de octubre de 2026

El CSV entregado contiene 10.861 eventos recuperados de un análisis previo: 1.215 agregados al carrito, 1.215 unidades y 9.646 clics hacia tiendas, de 19 marcas. El periodo corresponde al 1–31 de octubre en hora de Bogotá, incluida la madrugada del 1 de noviembre en UTC.

## Preparar el archivo

En la terminal de VS Code, dentro de la carpeta del proyecto:

```powershell
node scripts/preparar-restauracion-analitica.mjs --input "C:\Users\sebas\Downloads\Novum_Analitica_Eventos_2026-10-01_2026-10-31.csv" --from 2026-10-01 --to 2026-10-31 --output outputs/recuperacion-analitica/octubre-2026
```

Este comando prepara dos consultas cortas (`01-crear-tabla-carga.sql` y `02-confirmar-restauracion.sql`), `eventos-para-importar.csv` y `resumen.json`. **No ejecuta SQL ni escribe en Supabase.** Los archivos generados quedan fuera de Git y el CSV original permanece intacto. El resumen registra la huella SHA-256 del original y los totales esperados. También conserva `restaurar-eventos.sql` para clientes externos de PostgreSQL; ese archivo completo supera el límite del SQL Editor.

Se conservan los 14 campos de `analytics_events`, incluidas las fechas originales, los identificadores y las sesiones. Las seis columnas de presentación del CSV (nombres, categoría, precio y fechas de Bogotá) no pertenecen a esa tabla; permanecen en el original. El dashboard resuelve los nombres desde el catálogo y calcula el día de Bogotá desde `occurred_at`.

## Cargar en la base que usa el dashboard

1. Entra al **proyecto de Supabase conectado al sitio actual** → **SQL Editor** → **New query**.
2. Ejecuta el contenido de `outputs/recuperacion-analitica/octubre-2026/01-crear-tabla-carga.sql`. Crea una tabla de carga protegida, separada de los eventos del dashboard. La tabla `public.analytics_events` y sus vistas deben existir previamente.
3. En **Table Editor**, actualiza la lista de tablas y selecciona **analytics_restore_20261001_20261031**. Usa **Insert → Import data from CSV** y elige `eventos-para-importar.csv` de la carpeta generada. Importa las 14 columnas. No uses el CSV original de 20 columnas ni selecciones directamente `analytics_events`. Esta tabla tiene RLS sin políticas públicas y se administra desde el Dashboard.
4. Una vez completada la importación de las **10.861 filas**, ejecuta `02-confirmar-restauracion.sql` en **SQL Editor**. Esta consulta corta valida el periodo, los totales y los conflictos antes de insertar en `analytics_events` dentro de una transacción. Una carga parcial o un identificador con valores distintos cancela toda la transferencia. La consulta de confirmación se puede repetir sin duplicar eventos. No vuelvas a importar el CSV si la tabla de carga ya contiene las 10.861 filas.
5. Abre Administración → **Interacciones en la plataforma**, selecciona **Desde: 01/10/2026**, **Hasta: 31/10/2026** y pulsa **Aplicar**. No hace falta desplegar el sitio otra vez. Conserva la tabla de carga hasta verificar el dashboard.

Si octubre no tenía otros eventos, deben verse **1.215 agregados**, **1.215 unidades**, **9.646 clics** y **19 emprendimientos**. Los eventos adicionales que ya existan permanecen y también se incluyen en las cifras del dashboard. El filtro inicial de 30 días no abarca todo octubre.

El servidor `scripts/servidor-local.mjs` usa otra base, temporal y en memoria. Cargar allí un archivo no restaura los datos de producción. La ejecución en Supabase y la consulta posterior al dashboard son necesarias para confirmar la recuperación persistente.
