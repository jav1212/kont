# ADR 0034: Taxonomía de kernel, experiencia y plataforma

- Estado: aceptado
- Fecha: 2026-08-25

## Contexto

La arquitectura portable agrupaba bajo el prefijo físico `client` tanto el
composition root como capacidades de feedback, interacción, conectividad y
actualizaciones. La proximidad de nombres sugería incorrectamente que esas
capacidades pertenecían a un mismo bounded context.

Además, las capacidades transversales se encontraban al mismo nivel que los
dominios de negocio. Esto dificultaba distinguir entre lenguaje de negocio,
coordinación global, experiencia portable e integración técnica.

## Decisión

Los paquetes compartidos adoptan tres clasificaciones arquitectónicas:

```text
packages/kernel/      composición portable, lifecycle y sesión global
packages/experience/  comportamiento portable percibido por el usuario
packages/platform/    capacidades técnicas e integración con el entorno
```

La clasificación inicial es:

```text
kernel/
  contracts
  runtime
  remote
  workspace

experience/
  feedback
  interaction
  navigation
  preferences
  settings

platform/
  connectivity
  updates
  observability
  devices
```

`operation-context` permanece como capacidad operativa independiente: su fecha
efectiva, moneda y alcance organizacional forman parte del lenguaje utilizado
por casos de uso de negocio. Que el kernel lo consuma no transfiere su propiedad.

`portal-monitoring` también permanece como capacidad funcional independiente.
Modela la disponibilidad de portales públicos externos y no el estado de la
plataforma técnica de Kontave. El nombre anterior `platform-status` queda
retirado del lenguaje de dominio; la tabla legacy de persistencia se traduce en
el adaptador Supabase.

`delegated-access` colabora con `organizations` y `access-control`, pero posee
el ciclo de vida de los grants entre organizaciones. `organizations` conserva
identidad, membresías y empresas; `access-control` evalúa permisos; el kernel
combina acceso directo y delegado en una proyección de workspace. El nombre
anterior `organization-delegations` queda retirado del lenguaje TypeScript.

`unit-economics` es un read model de aplicación independiente de `products` y
`pricing`: Products posee el catálogo, Pricing posee decisiones de precio y
Unit Economics proyecta costos adquiridos y ventas realizadas. El nombre
anterior `product-insights` queda retirado del lenguaje TypeScript.

Las carpetas de clasificación no son bounded contexts, service locators ni
autorización para dependencias laterales. Cada paquete conserva una
responsabilidad explícita y las dependencias continúan apuntando hacia dentro.

Los nombres públicos `@kontave/client-*`, `@kontave/workspace-context-*` y los
demás nombres existentes se conservan durante esta fase. La ubicación física y
la API pública evolucionan por separado para que el cambio sea verificable y
reversible.

## Consecuencias

- `client-runtime` deja de interpretarse como propietario de las capacidades
  que ensambla.
- Feedback e interacción pueden evolucionar por motivos de experiencia sin
  depender del kernel.
- Conectividad, actualizaciones, observabilidad y dispositivos expresan
  explícitamente su naturaleza técnica.
- El workspace admite paquetes a tres niveles de profundidad.
- Una consolidación posterior puede reducir manifests y usar subpath exports;
  no forma parte de este movimiento físico.
