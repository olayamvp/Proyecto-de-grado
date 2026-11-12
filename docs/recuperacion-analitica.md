# Restaurar el histórico de octubre de 2026

El CSV entregado contiene 10.861 eventos recuperados de un análisis previo: 1.215 agregados al carrito, 1.215 unidades y 9.646 clics hacia tiendas, de 19 marcas. El periodo corresponde al 1–31 de octubre en hora de Bogotá, incluida la madrugada del 1 de noviembre en UTC.

## Preparar el archivo

En la terminal de VS Code, dentro de la carpeta del proyecto:

```powershell
node scripts/preparar-restauracion-analitica.mjs --input "C:\Users\sebas\Downloads\Novum_Analitica_Eventos_2026-10-01_2026-10-31.csv" --from 2026-10-01 --to 2026-10-31 --output outputs/recuperacion-analitica/octubre-2026
```

Este comando prepara `restaurar-eventos.sql` y `resumen.json`. **No ejecuta SQL ni escribe en Supabase.** Los archivos generados quedan fuera de Git y el CSV original permanece intacto. El resumen registra la huella SHA-256 del original y los totales esperados.

Se conservan los 14 campos de `analytics_events`, incluidas las fechas originales, los identificadores y las sesiones. Las seis columnas de presentación del CSV (nombres, categoría, precio y fechas de Bogotá) no pertenecen a esa tabla; permanecen en el original. El dashboard resuelve los nombres desde el catálogo y calcula el día de Bogotá desde `occurred_at`.

## Cargar en la base que usa el dashboard

1. Entra al **proyecto de Supabase conectado al sitio actual** → **SQL Editor** → **New query**.
2. Abre el archivo generado `outputs/recuperacion-analitica/octubre-2026/restaurar-eventos.sql` en VS Code, copia su contenido completo y pégalo en SQL Editor.
3. Pulsa **Run**. La tabla `public.analytics_events` y las vistas del dashboard deben existir previamente (`supabase/analytics_events.sql`); no se necesita volver a crear el esquema.
4. Una ejecución sin errores confirma la carga. El script compara los eventos existentes, inserta solo los faltantes y comprueba que todos los eventos del archivo estén presentes con los mismos valores antes de confirmar la transacción. Si hay un identificador con datos distintos, detiene y revierte toda la carga. Se puede ejecutar de nuevo sin duplicar eventos.
5. Abre Administración → **Interacciones en la plataforma**, selecciona **Desde: 01/10/2026**, **Hasta: 31/10/2026** y pulsa **Aplicar**. No hace falta desplegar el sitio otra vez.

Si octubre no tenía otros eventos, deben verse **1.215 agregados**, **1.215 unidades**, **9.646 clics** y **19 emprendimientos**. Los eventos adicionales que ya existan permanecen y también se incluyen en las cifras del dashboard. El filtro inicial de 30 días no abarca todo octubre.

El servidor `scripts/servidor-local.mjs` usa otra base, temporal y en memoria. Cargar allí un archivo no restaura los datos de producción. La ejecución en Supabase y la consulta posterior al dashboard son necesarias para confirmar la recuperación persistente.
