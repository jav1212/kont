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

## Revision 2026-10-27: contrato v0.2 y adopcion oficial en la Web

### Correccion de nombres

El paquete publicado es `@kontave/client-feedback` con subpaths `./application`, `./sonner` y `./testing`. Los nombres `@kontave/client-feedback-application` y `@kontave/client-feedback-testing` de la decision original no existen. El adaptador Sonner vive en `@kontave/client-feedback/sonner` (dependencia peer opcional), siguiendo el patron de `@kontave/observability/supabase`, y no en `@kontave/ui-dom`. Web y Desktop lo comparten; Mobile mantiene su presenter nativo en la aplicacion.

### Cambios del contrato

- `ClientFeedback` agrega `persistence` (`transient` | `sticky`), `autoDismissMs` y `action` (`FeedbackAction`). `loading` se suma a `FeedbackIntent`.
- El core ya no produce texto de presentacion: la linea `Codigo: …` la renderiza cada presenter a partir de `referenceCode`.
- Los fallos con referencia de incidente (`ResolveUnexpectedFailure`, `reportedFailureFeedback`) son `sticky`, para que el usuario pueda copiar el codigo (WCAG 2.2.1).
- `ResolveUnexpectedFailure` acota el reporte con un timeout (4 s por defecto). Un reporter colgado nunca retrasa el feedback.
- `UnexpectedFailureReport` agrega `requestId`, `fingerprint` y `route`.
- `FailureClassifier` + `ResolveFailure` centralizan la politica: `expected` (sin incidente), `reported` (incidente ya registrado por otra capa; se muestra sin reportarlo de nuevo) o `null` (inesperado; se reporta).
- `PresentFeedback.track` muestra el progreso de una operacion y lo reemplaza por su resultado.

### Adopcion en la Web de produccion

- `src/shared/frontend/feedback/web-feedback.ts` es la raiz de composicion: `SonnerFeedbackPresenter`, `WebIncidentReporter` y `WebFailureClassifier`.
- `notify` se mantiene como fachada publica con la misma API, ahora sobre el core:
  - `notify.error(message)` es un fallo esperado y **no** crea incidente. Un `errorCode` `KNT-…` devuelto por la API se muestra como referencia `sticky`.
  - `notify.failure(error, fallback)` es el camino obligatorio dentro de `catch`.
- `ApiRequestFailure` es el error tipado para respuestas `!response.ok`. El clasificador trata:
  - 4xx como esperado;
  - 5xx con codigo `KNT-…` como `reported`;
  - 5xx sin codigo, errores de programacion (`TypeError`, `ReferenceError`, `SyntaxError`, valores no `Error`) y caidas de repositorio remoto como inesperados;
  - fallos de red como mensaje de conexion.
- Regla transitoria: una instancia exacta de `Error` con mensaje se considera esperada, porque la Web historicamente lanza `new Error(mensajePublico)`. El codigo nuevo lanza `ApiRequestFailure` o `DomainError`; esta regla se retirara cuando no queden `throw new Error` de cara al usuario.
- `WebIncidentReporter` deduplica por firma durante 60 s y limita a 25 reportes por pagina. `/api/system-errors` aplica rate limit (30/min por IP), tamano maximo de payload, y guarda `eventName`, `severity`, `publicMessage` y el stack del cliente.
- El logger del servidor redacta emails, cedulas y telefonos tambien en valores de texto, no solo por nombre de clave.
- `app/error.tsx`, `app/(app)/error.tsx` y el nuevo `app/global-error.tsx` reportan mediante `useBoundaryIncident` y muestran el **mismo** codigo registrado.
- `UnhandledFailureListener` reporta, sin UI, los errores y promesas rechazadas no manejados.

### Pendiente

- `handleResult` registra como incidente todo `Result.fail` (incluidas reglas de negocio 4xx), porque `Result<T>` solo transporta un string. Separarlo requiere fallos tipados en los casos de uso del backend.
- Desktop y Mobile aun no tienen error boundary ni `IncidentReporter`. Necesitan un endpoint de incidentes en `client-api/v1`.
