# ADR 0028: Conectividad de cliente portable basada en evidencia

- Estado: aceptado
- Fecha: 2026-08-14

## Contexto

Web, Desktop, Mobile y Device Bridge necesitan reaccionar cuando Kontave deja de ser operable por conectividad. Las señales del sistema como `navigator.onLine` solo describen parcialmente la red: puede existir internet sin acceso al backend, un portal cautivo puede aparentar conectividad y un proveedor secundario puede fallar sin que toda la aplicacion este offline.

Acoplar `fetch`, Electron, NetInfo, temporizadores, banners o pantallas bloqueantes a la deteccion impediria compartir la politica y produciria transiciones inestables ante fallos breves.

## Decision

Crear la capacidad `client-connectivity` con tres paquetes:

- `@kontave/client-connectivity-contracts`: snapshots y resultados serializables;
- `@kontave/client-connectivity-application`: monitor observable, puerto de probe y politica de estabilidad;
- `@kontave/client-connectivity-testing`: probes, reloj y observador deterministas.

El monitor comienza en `unknown`. Un probe exitoso establece `available` inmediatamente. Un fallo conserva `unknown` si nunca hubo evidencia positiva, usa `degraded` mientras no alcance el umbral configurado y establece `unavailable` al alcanzarlo. La recuperacion exitosa limpia el contador sin demora.

Solo puede existir un probe en vuelo por monitor. Solicitudes concurrentes comparten la misma operacion, evitando resultados fuera de orden y carga duplicada.

## Puertos y adaptadores

`ConnectivityProbe` responde si el servicio principal de Kontave es alcanzable y clasifica los fallos esperados como red inaccesible, servicio inaccesible o timeout. Los adaptadores convierten HTTP, IPC o APIs nativas a ese resultado. Una excepcion inesperada del adaptador se registra best effort mediante `ConnectivityUnexpectedFailureObserver` y se trata como servicio inaccesible sin derribar al cliente.

Las señales de navegador, sistema operativo o framework movil solamente solicitan `refresh()`. Los intervalos, timeouts, cancelacion, backoff y jitter pertenecen al adaptador o al composition root de cada cliente.

## Integracion

La capacidad no importa `client-interaction` ni `client-feedback`. Cada cliente observa el snapshot y decide su experiencia:

- adquirir un lease de bloqueo cuando no puede operar;
- mostrar un banner si soporta trabajo offline;
- restringir solamente comandos que requieren servidor;
- notificar una recuperacion de conectividad.

Los fallos de BCV, correo u otros proveedores secundarios pertenecen a sus capacidades y no convierten por si solos la conectividad global en indisponible.

## Invariantes

- Los snapshots son inmutables, serializables y estables hasta el siguiente cambio.
- `checking` es independiente de la ultima disponibilidad conocida.
- El umbral es un entero positivo.
- Una respuesta exitosa reinicia los fallos consecutivos.
- Un `401` o `403` valido demuestra que el backend es alcanzable; el adaptador no debe clasificarlo como desconexion.
- El core no importa React, DOM, Electron, React Native, HTTP, almacenamiento ni temporizadores.
