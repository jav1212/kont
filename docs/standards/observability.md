# Estándar de observabilidad

## Clasificación

- Un error de dominio es un resultado esperable y tipado; no genera automáticamente un incidente.
- Un incidente representa un fallo técnico inesperado que requiere diagnóstico.
- Auditoría, logs operativos, métricas y trazas son capacidades distintas aunque compartan correlación.
- El nombre del evento es estable y de baja cardinalidad. Datos variables pertenecen a campos estructurados.

## Dependencias

- Dominio y aplicación no importan SDKs de observabilidad, frameworks ni proveedores de persistencia.
- La capa de aplicación define los puertos y la infraestructura aporta adaptadores.
- Las excepciones no controladas se capturan en bordes de HTTP, IPC, procesos o composición.
- No se inyecta un logger genérico en entidades para observar errores técnicos.

## Contexto y correlación

- Todo incidente declara severidad, nombre de evento, instante de ocurrencia, instante de observación, servicio, versión, entorno y plataforma.
- `incidentCode`, `requestId`, `traceId`, `spanId` y `fingerprint` conservan significados distintos.
- Identidades de usuario, organización, empresa o tenant provienen exclusivamente de un contexto autenticado y autorizado.
- Los timestamps usan UTC en formato ISO 8601.

## Datos y seguridad

- Nunca se registran contraseñas, cookies, tokens, claves, cadenas de conexión, cuerpos completos ni headers completos.
- Cédulas, datos bancarios, datos de nómina y demás información personal no se incluyen en atributos libres.
- Se prefieren atributos tipados o allowlists. Como defensa adicional, la sanitización es recursiva y limita profundidad, cantidad y longitud.
- El mensaje público es seguro y distinto del detalle técnico. Stack traces solo son visibles para operadores autorizados.
- Datos provenientes de otra zona de confianza se validan antes de registrarse.

## Entrega y disponibilidad

- El reporte de incidentes es `best effort` y nunca oculta ni reemplaza el error original.
- El recorder expone el fallo de entrega; la aplicación no afirma que un incidente fue almacenado cuando no lo fue.
- Los adaptadores definen timeout, idempotencia, reintentos acotados y comportamiento ante saturación.
- El fallo del sistema de observabilidad no puede generar recursión infinita.
- Deduplicación, fingerprinting, rate limiting y sampling controlan tormentas de eventos. Auditoría obligatoria nunca se muestrea.

## Operación

- Retención, acceso, cifrado, eliminación y separación de entornos se documentan por tipo de dato.
- Las alertas consideran severidad, fingerprint, frecuencia e impacto; no se alerta por cada registro individual.
- Cada alerta tiene propietario y procedimiento de respuesta.
- Se monitorean también descartes, errores y latencia del pipeline de observabilidad.

### Gestión de incidentes centralizados

Los administradores de plataforma consultan los incidentes de `system_error_logs` desde la pestaña **Errores** del portal `/admin`. La vista inicia con incidentes pendientes y permite filtrar por `pending`, `resolved` o todos, buscar por código de incidente y paginar; el tamaño de página predeterminado es 25 registros. El detalle técnico, la traza y los metadatos permanecen restringidos a esta superficie administrativa.

El contrato administrativo es:

- `GET /api/admin/system-errors` acepta `status`, `code`, `page` y `pageSize`. Devuelve registros ordenados del más reciente al más antiguo y el total que coincide con los filtros. `page` inicia en 1; `pageSize` predeterminado es 25 y el máximo es 100.
- `PATCH /api/admin/system-errors/{errorCode}` acepta `{ "status": "pending" | "resolved" }`. Solo cambia el estado vigente del incidente indicado por un código `KNT-YYYYMMDD-XXXXXXXX` válido.

Ambas rutas requieren una sesión que pertenezca a `public.admin_users`. Al resolver, el servidor registra la fecha y el identificador del administrador autenticado; no acepta un actor enviado por el cliente. Repetir una transición al estado ya vigente conserva su fecha y responsable originales. Reabrir un incidente lo devuelve a `pending` y elimina esos datos de resolución. Esta capacidad no mantiene historial de transiciones.

Los incidentes existentes antes de incorporar el estado de resolución se tratan como `pending`. Si el autor no tiene perfil disponible, el portal muestra **Usuario no identificado** y conserva el identificador disponible en el detalle. Para el responsable de resolución sin perfil, muestra su identificador; no infiere identidades. Los reportes enviados a `POST /api/system-errors` tampoco pueden atribuir un `userId` proporcionado por el cliente: la identidad se resuelve desde la sesión del servidor cuando exista.

La persistencia administrativa se ejecuta con credenciales de servicio solo después de verificar la sesión de administrador. La migración concede a `service_role` permiso de actualización sobre las columnas de resolución y conserva sus permisos previos; los usuarios autenticados no reciben permiso directo para modificar estos campos.

## Pruebas

- La política portable se prueba con un recorder en memoria.
- Sanitización, datos anidados, ciclos, límites, idempotencia y fallos del adaptador tienen cobertura.
- Debe existir una prueba que demuestre que un error esperable no produce un incidente.
- Los contratos verifican que el cliente no pueda atribuir identidades autoritativas.
