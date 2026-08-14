# ADR 0026: Bloqueo global de interaccion portable

- Estado: aceptado
- Fecha: 2026-08-14

## Contexto

Los clientes necesitan impedir toda interaccion durante situaciones distintas: arranque y reanudacion de Desktop, perdida de conectividad, mantenimiento, fallos irrecuperables y operaciones exclusivas como la exportacion de un PDF. Ninguna de esas causas pertenece a una animacion, a React o a Electron.

Un booleano global no es suficiente. Dos causas pueden coexistir y, si una termina antes que la otra, no debe desbloquear la interfaz. Tambien debe existir una regla determinista para decidir cual causa se presenta sin perder las demas.

## Decision

Crear `@kontave/client-interaction-application` y `@kontave/client-interaction-testing`.

`GlobalInteractionGate` conserva un conjunto de bloqueos activos. Cada productor adquiere un `InteractionBlockLease` independiente, puede actualizarlo y debe liberarlo al terminar. Liberar un lease es idempotente y nunca afecta los bloqueos adquiridos por otros productores.

El snapshot publico indica si la interaccion esta disponible, expone todos los bloqueos y selecciona un `activeBlock`. Gana la prioridad numerica mas alta; ante un empate gana el lease mas antiguo para evitar cambios visuales innecesarios. Los consumidores observan el gate mediante `subscribe` y `getSnapshot`.

Los bloques contienen solamente estado semantico: causa, estado, prioridad, mensajes publicos, progreso, referencia de incidente y acciones identificables. No contienen callbacks, componentes ni detalles tecnicos. La aplicacion interpreta las acciones `retry`, `cancel` y `exit` y ejecuta el caso de uso correspondiente.

## Adaptadores

Cada plataforma implementa un boundary de pantalla completa sobre el mismo snapshot. Un adaptador DOM puede usar React, `useSyncExternalStore`, CSS y una animacion; Desktop puede ademas reaccionar al ciclo de vida de Electron. Esos detalles quedan fuera del paquete portable.

La politica que decide bloquear por falta de red pertenece a la composicion de cada cliente. Un monitor de conectividad mantiene su propio lease mientras la aplicacion no puede operar. El arranque y cada operacion exclusiva hacen lo mismo con leases distintos.

## Invariantes

- La pantalla permanece bloqueada mientras exista al menos un lease activo.
- Cada token es unico dentro de un gate.
- Un lease liberado no puede actualizarse y liberarlo nuevamente no falla.
- El snapshot es inmutable y conserva una referencia estable hasta el siguiente cambio.
- Los mensajes son aptos para el usuario; errores y metadata tecnica no forman parte del bloque.
- El progreso determinado se expresa entre `0` y `1`.
- La capa portable no importa React, DOM, Electron, red, almacenamiento ni librerias de animacion.
