# Kontave Application Kernel

Runtime headless compartido por Desktop, Mobile y los futuros clientes de Kontave.

El kernel es el composition root portable de Kontave. No es un bounded context
de negocio y no posee las capacidades que ensambla.

## Fronteras

- `@kontave/client-contracts`: contratos serializables de lifecycle, features y presentación; conserva temporalmente su nombre público por compatibilidad.
- `@kontave/client-runtime`: composition root portable; conserva temporalmente su nombre público y no conoce HTTP ni frameworks.
- `@kontave/client-remote`: transporte y adaptadores de la API compartida; conserva temporalmente su nombre público y no conoce renderers.
- `@kontave/workspace-context-application`: sesión global de workspace coordinada por el kernel; no debe confundirse con el contexto operativo de los dominios.

Las aplicaciones proporcionan únicamente mecanismos propios de plataforma. Los
endpoints, DTOs y traducción de errores pertenecen a `client-remote`; la
orquestación y el estado funcional pertenecen a `client-runtime`.

`createRemoteKontavePorts` construye todos los adaptadores remotos sobre un solo
transporte autenticado. `createKontaveApplicationClient` recibe esos puertos,
crea el registro exhaustivo de features y administra su ciclo de vida. Ningún
renderer debe volver a instanciar un `Remote*Port` por pantalla o controlador.

## Organización interna

- Cada capacidad vive bajo `src/domains/<dominio>/` y expone su contrato mediante
  un `index.ts` local.
- `src/core/` contiene únicamente abstracciones transversales del cliente.
- `src/protocol/` define el sobre y los errores estables de la API.
- En `client-remote`, `src/transport/` implementa HTTP y cada adaptador remoto
  permanece dentro del dominio que sirve.
- El `src/index.ts` de cada paquete es exclusivamente su API pública compatible;
  los consumidores no importan archivos internos.

Desktop es el primer host del runtime completo. Inicia una única instancia del
cliente en Electron main, publica su lifecycle mediante un context bridge
aislado y conserva en la aplicación solamente adaptadores nativos, validación
IPC y coordinación de presentación.
