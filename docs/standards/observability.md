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

## Pruebas

- La política portable se prueba con un recorder en memoria.
- Sanitización, datos anidados, ciclos, límites, idempotencia y fallos del adaptador tienen cobertura.
- Debe existir una prueba que demuestre que un error esperable no produce un incidente.
- Los contratos verifican que el cliente no pueda atribuir identidades autoritativas.
