# ADR 0027: Ciclo portable de actualizaciones de clientes

- Estado: aceptado
- Fecha: 2026-08-14

## Contexto

Kontave tendra clientes Web, Desktop, Mobile y Device Bridge. Cada plataforma distribuye software de forma distinta: Electron instala binarios, Expo puede entregar bundles compatibles con un runtime nativo, las tiendas reemplazan binarios moviles y Web activa nuevos despliegues mediante recarga o service worker.

Device Bridge integraba `electron-updater`, dialogos, descarga e instalacion directamente en su proceso principal. Repetir ese enfoque acoplaria las decisiones de producto a cada SDK y produciria experiencias y estados incompatibles entre clientes.

## Decision

Crear la capacidad `client-updates` con los paquetes:

- `@kontave/client-updates-contracts`: snapshots y DTOs serializables;
- `@kontave/client-updates-application`: coordinador, politica y puertos;
- `@kontave/client-updates-electron`: adaptador de `electron-updater`;
- `@kontave/client-updates-testing`: proveedores deterministas para pruebas.

No se crea una capa de dominio. Actualizar el ejecutable es una responsabilidad del ciclo de vida del cliente, no una regla del negocio de nomina, inventario o facturacion.

La aplicacion comparte el lenguaje, la maquina de estados y la politica. Cada plataforma conserva su mecanismo. Los adaptadores futuros para Expo, tiendas y Web implementaran el mismo puerto sin fingir capacidades que la plataforma no posee.

## Modelo

El snapshot observable usa estados explicitos: `idle`, `checking`, `up-to-date`, `available`, `downloading`, `ready`, `applying` y `failed`. Una version candidata distingue `binary`, `runtime` y `web-deployment`, ademas de producto, plataforma, arquitectura, canal, version publica, build, runtime, API minima, obligatoriedad, fecha y notas.

El proveedor publica capacidades: descarga en segundo plano, progreso y modo de aplicacion `restart`, `reload` u `open-store`. El coordinador serializa operaciones, valida progreso, conserva errores esperados tipados y nunca importa React, Electron, Expo, DOM o almacenamiento.

## Limites de plataforma

- Electron ejecuta el adaptador exclusivamente en el proceso principal. Preload y renderer cruzan IPC con contratos serializables.
- Mobile trata una actualizacion binaria de tienda y una actualizacion runtime de Expo como mecanismos diferentes. Un bundle OTA solo se aplica a una plataforma y runtime compatibles.
- Web detecta un despliegue nuevo y recarga o activa su service worker. No descarga instaladores.
- Builds administrados por una tienda deshabilitan actualizadores binarios externos.

## Seguridad y operacion

- Los artefactos se generan en CI, son inmutables y se firman por plataforma.
- Los canales iniciales son `internal`, `preview` y `production`.
- Una version defectuosa se corrige con una version superior; no se reemplaza un artefacto publicado.
- La aplicacion no se reinicia automaticamente al terminar una descarga si puede existir trabajo sin guardar.
- La compatibilidad con backend se protege tambien en la API mediante un fallo tipado `CLIENT_UPGRADE_REQUIRED`; el updater no es un control suficiente.
- `productVersion`, `buildNumber`, `runtimeVersion`, `apiVersion` y `localSchemaVersion` son conceptos independientes.

## Integracion con otras capacidades

`client-updates` produce estado semantico. La presentacion decide entre banner, dialogo o pantalla completa. Los fallos pueden resolverse mediante `client-feedback`; una actualizacion obligatoria puede adquirir un lease de `GlobalInteractionGate`. Ninguno de esos detalles forma parte del proveedor.

## Adopcion

Device Bridge valida primero el adaptador Electron. Desktop adopta el mismo coordinador mediante su API IPC. Mobile agregara proveedores Expo y tienda al crearse. Web permanece congelada hasta una migracion explicita y reversible.
