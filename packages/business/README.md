# Contextos de negocio

Esta carpeta clasifica bounded contexts que modelan operaciones y políticas del negocio de Kontave. No es un paquete, un contexto agregado ni una autorización para dependencias laterales.

Cada contexto conserva su API pública `@kontave/*` y se consolida progresivamente conforme al ADR 0035. Una dependencia entre contextos debe pasar por la API pública del contexto propietario.
