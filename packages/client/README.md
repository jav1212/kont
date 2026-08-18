# Kontave Client

Runtime headless compartido por Desktop, Mobile y los futuros clientes de Kontave.

## Fronteras

- `@kontave/client-contracts`: contratos serializables de lifecycle, features y presentación.
- `@kontave/client-runtime`: composition root portable; no conoce HTTP ni frameworks.
- `@kontave/client-remote`: transporte y adaptadores de la API compartida; no conoce renderers.

Las aplicaciones proporcionan únicamente mecanismos propios de plataforma. Los
endpoints, DTOs y traducción de errores pertenecen a `client-remote`; la
orquestación y el estado funcional pertenecen a `client-runtime`.

## Organización interna

- Cada capacidad vive bajo `src/domains/<dominio>/` y expone su contrato mediante
  un `index.ts` local.
- `src/core/` contiene únicamente abstracciones transversales del cliente.
- `src/protocol/` define el sobre y los errores estables de la API.
- En `client-remote`, `src/transport/` implementa HTTP y cada adaptador remoto
  permanece dentro del dominio que sirve.
- El `src/index.ts` de cada paquete es exclusivamente su API pública compatible;
  los consumidores no importan archivos internos.

El runtime se migra por verticales tomando Desktop como referencia funcional.
Una capacidad no se considera portable hasta que su integración deja de vivir
en `apps/desktop` y puede consumirse mediante el contrato del cliente.
