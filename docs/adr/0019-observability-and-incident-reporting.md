# ADR 0019: Observabilidad y reporte de incidentes

- Estado: aceptado
- Fecha: 2026-08-13

## Contexto

La Web productiva registra errores en `system_error_logs` mediante una implementación que combina contrato de transporte, clasificación, sanitización, identidad de Next.js y persistencia Supabase. Desktop, Mobile y Device Bridge necesitarán la misma política sin depender de una aplicación, framework o proveedor concreto.

Los errores esperables del negocio, los incidentes técnicos, la auditoría, los logs operativos, las métricas y las trazas tienen propósitos y garantías diferentes. Tratarlos como una sola capacidad produce ruido, acoplamiento y políticas de seguridad ambiguas.

## Decisión

Se crea la capacidad transversal `observability` con las siguientes fronteras:

- `contracts` define DTOs portables que cruzan fronteras de transporte. No acepta identidades autoritativas proporcionadas por clientes.
- `application` define el modelo estructurado del incidente, sus políticas portables y el puerto `IncidentRecorder`.
- Los adaptadores, como `supabase`, implementan almacenamiento, idempotencia y traducción al proveedor.
- `testing` ofrece dobles de prueba reutilizables.
- Cada aplicación compone identidad confiable, contexto de tenant, reloj, generador de códigos y adaptador en su borde.

El dominio no registra errores. Los fallos esperables continúan modelados con tipos y códigos del negocio. Solo los fallos inesperados se convierten en incidentes técnicos. La auditoría permanece como una capacidad distinta y puede tener garantías transaccionales propias.

Los incidentes siguen un modelo estructurado compatible conceptualmente con OpenTelemetry: tiempo de ocurrencia y observación, severidad, nombre estable del evento, recurso emisor, correlación, error y atributos limitados. Adoptar este modelo no obliga a instalar un SDK o proveedor de telemetría.

## Confiabilidad y seguridad

- Registrar un incidente es `best effort`: un fallo del recorder se representa en el recibo y no reemplaza el fallo original.
- La auditoría obligatoria no utiliza esta semántica.
- Los adaptadores deben implementar escrituras idempotentes por código de incidente.
- La metadata se limita y sanitiza recursivamente. Secretos y datos personales no pertenecen a atributos libres.
- Usuario, organización, empresa y tenant se obtienen de contextos autenticados de la aplicación.

## Adopción incremental

Esta decisión no conecta la Web productiva con los paquetes nuevos ni modifica su endpoint o tabla. La base portable se valida primero en la arquitectura nueva. Una migración Web posterior conservará el contrato externo mediante una fachada de compatibilidad y se ejecutará como tarea explícita bajo ADR 0005.

## Consecuencias

- La política de incidentes puede probarse sin Next.js ni Supabase.
- Cada plataforma puede elegir un adaptador diferente sin duplicar clasificación y sanitización.
- Los consumidores deben aportar dependencias explícitas y contexto confiable.
- La persistencia actual puede recibir el modelo nuevo mediante un adaptador sin convertirse en API pública de la aplicación.
- Retención, alertas, acceso administrativo y exportación de telemetría requieren decisiones operativas adicionales antes de producción.
