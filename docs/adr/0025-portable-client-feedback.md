# ADR 0025: Feedback de cliente portable y presentacion por plataforma

- Estado: aceptado
- Fecha: 2026-08-14

## Contexto

La Web productiva concentra en `notify.error` la clasificacion del fallo, generacion de codigo, reporte del incidente, acceso a navegador y clipboard, y presentacion con Sonner. Esto convierte errores esperados en incidentes tecnicos y hace imposible reutilizar la politica en Desktop o Mobile sin importar detalles del DOM.

`observability` ya establece que solo los fallos inesperados se registran como incidentes. Los clientes necesitan una forma comun de producir feedback semantico y resolver fallos inesperados, conservando libertad para presentarlos como toast, snackbar, banner, dialogo o pantalla de recuperacion.

## Decision

Crear `@kontave/client-feedback-application` y `@kontave/client-feedback-testing`.

`client-feedback-application` define:

- `ClientFeedback`: mensaje portable con intencion, descripcion, referencia y clave de deduplicacion;
- `FeedbackPresenter`: puerto de presentacion transitoria;
- `IncidentReporter`: puerto estrecho para registrar un fallo inesperado;
- `PresentFeedback`: caso de uso para entregar feedback a la plataforma;
- `ResolveUnexpectedFailure`: registra best effort y devuelve un modelo presentable sin decidir la superficie visual.

Los errores esperados se convierten directamente en `ClientFeedback` y no crean incidentes. Un fallo inesperado se entrega a `IncidentReporter`; el codigo devuelto se incorpora como referencia visible. Un fallo del reporter nunca reemplaza ni oculta el fallo original.

## Adaptadores

`@kontave/ui-dom` implementa `FeedbackPresenter` con Sonner. Sonner, React, DOM, `navigator` y clipboard permanecen fuera de `client-feedback-application`. Un futuro cliente nativo implementara el mismo puerto con su tecnologia de presentacion.

Los error boundaries pueden usar `ResolveUnexpectedFailure` y renderizar el resultado directamente sin invocar un presenter transitorio. Un error global no presupone que el arbol donde vive un toaster siga disponible.

## Invariantes

- El mensaje publico es obligatorio y no contiene detalles tecnicos.
- `referenceCode` identifica una incidencia ya reportada o intentada; no dispara reporte por si mismo.
- La clave de deduplicacion es estable y de baja cardinalidad.
- La metadata tecnica solo cruza el puerto de incidentes y nunca se copia a la descripcion publica.
- Presentar feedback no realiza persistencia ni llamadas de red.
- Reportar un incidente no depende de una libreria visual.

## Adopcion

Desktop puede adoptar el adaptador DOM inmediatamente. La migracion de la Web productiva se hara de forma incremental mediante su fachada `notify`, sin cambiar todos los consumidores en este corte y respetando la congelacion Web.
