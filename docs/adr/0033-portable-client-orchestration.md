# ADR 0033: Orquestación portable de clientes

- Estado: aceptado
- Fecha: 2026-08-17

## Contexto

Kontave comparte dominio, casos de uso, contratos y adaptadores entre Desktop,
Mobile y el futuro cliente Web. Sin embargo, cada aplicación todavía compone
manualmente sus dependencias, inicializa sus capacidades y mantiene su propia
lista de integraciones.

Este modelo permite que una capacidad avance en Desktop sin que Web o Mobile
declaren cómo la consumirán. Comparar los `package.json` de las aplicaciones no
resuelve el problema: una dependencia instalada no demuestra que una capacidad
esté inicializada, presentada o disponible mediante navegación. Tampoco es
correcto igualar las interfaces, porque Web y Desktop usan React DOM mientras
Mobile requiere una presentación React Native propia.

Se necesita una única composición funcional de Kontave que garantice que todos
los clientes conocen las mismas capacidades, sin acoplar dominio y aplicación a
React, Next.js, Electron, Expo, Supabase o dispositivos.

## Decisión

Se creará un kernel de aplicación portable, modular y fuertemente tipado que
actuará como orquestador de los clientes. Web, Desktop y Mobile consumirán el
mismo kernel y proporcionarán únicamente sus adaptadores de plataforma y su
presentación.

La solución se organizará bajo una responsabilidad arquitectónica explícita:

```text
packages/client/
  application/   Kernel y orquestación portable
  remote/        Ensamblaje común de adaptadores API/Supabase
  react/         Context, Provider y hooks sin componentes visuales
  testing/       Suites contractuales y dobles reutilizables
```

Los nombres públicos previstos son:

```text
@kontave/client-application
@kontave/client-remote
@kontave/client-react
@kontave/client-testing
```

La nueva agrupación `client` posee una responsabilidad acotada: componer la
aplicación portable que consumen los distintos renderers. No será un directorio
genérico para código compartido.

## Kernel de aplicación

`@kontave/client-application` compondrá sesión, workspace, módulos y features.
Dependerá solamente de paquetes portables de dominio, aplicación y contratos.

```ts
export interface KontaveClientPorts {
  readonly authentication: AuthenticationGateway;
  readonly selectionStorage: WorkspaceSelectionStorage;
  readonly connectivity: ConnectivityMonitor;
  readonly products: ProductRepository;
  readonly inventory: InventoryRepository;
  readonly purchasing: PurchasingRepository;
  readonly sales: SalesRepository;
}

export interface KontaveClient {
  readonly session: SessionFeature;
  readonly workspace: WorkspaceFeature;
  readonly features: {
    readonly products: ProductsFeature;
    readonly inventory: InventoryFeature;
    readonly purchasing: PurchasingFeature;
    readonly sales: SalesFeature;
  };
  start(): Promise<void>;
  stop(): Promise<void>;
}

export function createKontaveClient(
  ports: KontaveClientPorts,
): KontaveClient;
```

El kernel ensamblará features; no absorberá su lógica. Cada dominio conservará
la propiedad de sus modelos, puertos, casos de uso, errores y reglas. Las
dependencias entre capacidades serán explícitas y se resolverán mediante
factories, coordinadores de aplicación o puertos definidos por la capacidad
propietaria.

No se utilizarán service locators, contenedores de inyección dinámicos,
decoradores de resolución ni claves de servicio basadas en strings. La
construcción explícita permitirá que TypeScript detecte dependencias ausentes y
mantendrá las pruebas deterministas.

## Adaptadores compartidos

`@kontave/client-remote` construirá el conjunto común de puertos utilizados por
los clientes conectados al backend de Kontave.

```ts
const remotePorts = createRemoteKontavePorts({
  apiUrl,
  authenticatedRequest,
  selectionStorage,
  connectivity,
});

const client = createKontaveClient(remotePorts);
```

Agregar una capacidad remota requerirá actualizar el kernel y este ensamblaje
una sola vez. Las aplicaciones no reconstruirán individualmente los mismos
repositorios o clientes HTTP.

El actual `@kontave/native-api-client` podrá evolucionar de forma retrocompatible
hacia un cliente de API neutral, porque la API compartida dejará de ser una
preocupación exclusiva de clientes nativos. El cambio de nombre no forma parte
obligatoria de la primera iteración.

Los adaptadores verdaderamente específicos permanecerán en su plataforma:

- Web proporciona almacenamiento del navegador, navegación Next.js y acceso a
  dispositivos mediante Device Bridge.
- Desktop proporciona ciclo de vida Electron, IPC, actualizaciones y acceso
  local a dispositivos.
- Mobile proporciona Expo Router, Secure Store y adaptadores nativos móviles.

Una capacidad no disponible se modelará explícitamente mediante un resultado o
estado tipado. No se representará silenciosamente con una dependencia ausente o
un valor `undefined` sin semántica.

## Integración con React

`@kontave/client-react` conectará el kernel con React mediante Context,
Providers y suscripciones a stores portables. No contendrá componentes visuales
ni dependerá de un renderer específico.

```text
@kontave/client-application
            |
@kontave/client-react
       /          \
React DOM      React Native
Web/Desktop       Mobile
```

Web y Desktop compartirán presentación React DOM cuando la experiencia coincida
mediante `@kontave/ui-dom` y los componentes Web correspondientes. Mobile
consumirá los mismos features, estados y acciones desde su presentación
React Native basada en `@kontave/ui-native`.

El kernel no expondrá componentes. Expondrá estado inmutable, suscripciones,
comandos y errores esperados tipados. Cada renderer decidirá la estructura
visual, navegación, interacción y accesibilidad apropiadas para su plataforma.

## Registro exhaustivo de presentación

Cada cliente mantendrá un registro tipado cuya clave derive del catálogo de
features del kernel. Todo feature deberá clasificarse para cada plataforma:

```ts
export const mobilePresentations = definePresentationRegistry({
  products: {
    status: "ready",
    component: ProductsScreen,
  },
  inventory: {
    status: "planned",
    reason: "Presentación nativa pendiente",
  },
  devices: {
    status: "unsupported",
    reason: "La administración local pertenece a Desktop",
  },
}) satisfies PresentationRegistry<KontaveClient["features"]>;
```

Los estados mínimos serán:

- `ready`: integración y presentación disponibles.
- `planned`: capacidad conocida cuya presentación está pendiente.
- `unsupported`: diferencia deliberada de plataforma, acompañada de una razón.

Agregar un feature al kernel deberá producir un error de TypeScript en todos los
registros que no lo hayan clasificado. Esto evita que un cliente quede atrás de
forma silenciosa sin obligar a que todas las plataformas tengan la misma UI o
entreguen una pantalla al mismo tiempo.

La navegación disponible se derivará del catálogo de aplicación y del registro
de presentación. Un destino `planned` o `unsupported` no se anunciará como una
pantalla funcional. Los labels y la jerarquía continuarán perteneciendo al
catálogo de navegación; iconos y componentes permanecerán en cada renderer.

## Dependencias permitidas

```text
dominio <- aplicación <- client-application <- client-react <- apps/*
                         ^
                         |
                    client-remote
```

- `client-application` puede depender de paquetes de dominio, aplicación y
  contratos portables.
- `client-remote` puede implementar puertos mediante contratos API, Supabase y
  transporte remoto.
- `client-react` puede depender de React como peer dependency y del contrato
  público del kernel.
- Las aplicaciones pueden depender del kernel, del ensamblaje remoto, del
  bridge React, de su renderer UI y de adaptadores propios de plataforma.
- El kernel no puede importar React, Next.js, Electron, Expo, Supabase, Node,
  SerialPort, HTTP concreto ni almacenamiento de plataforma.
- Ningún paquete puede depender de una aplicación y ninguna aplicación puede
  importar otra aplicación.

## Flujo de desarrollo

Una capacidad nueva se considerará integrada mediante este orden:

1. Definir dominio, aplicación, contratos y errores esperados.
2. Implementar y probar sus adaptadores.
3. Exponer un feature portable con estado y acciones.
4. Incorporar el feature al kernel.
5. Incorporar su ensamblaje al adaptador remoto común cuando corresponda.
6. Clasificar su presentación en Web, Desktop y Mobile.
7. Implementar o reutilizar la UI DOM para Web/Desktop.
8. Implementar la UI React Native cuando la capacidad móvil esté `ready`.
9. Ejecutar las verificaciones de arquitectura y las suites contractuales.

Una entrega puede dejar una presentación como `planned`, pero no puede omitirla
deliberada o accidentalmente del registro.

## Verificación automática

Se añadirá una comprobación equivalente a:

```bash
pnpm check:client-integrations
```

La comprobación validará progresivamente:

- Exhaustividad de los registros Web, Desktop y Mobile.
- Existencia de presentación y navegación para features `ready`.
- Ausencia de rutas funcionales para features `planned` o `unsupported`.
- Ausencia de dependencias Electron/Node en Web y Mobile.
- Ausencia de dependencias Next.js/Expo/Electron/Supabase en el kernel.
- Cumplimiento de los contratos compartidos por todos los adaptadores.

Las verificaciones se integrarán con `check:architecture`,
`test:architecture` y los typechecks de las aplicaciones.

## Migración

La adopción será incremental y no modificará inicialmente el Web productivo de
la raíz:

1. Crear la fundación de `packages/client/*`.
2. Migrar sesión, workspace y módulos al kernel.
3. Migrar una capacidad vertical, inicialmente Products o Inventory.
4. Hacer que Desktop consuma el kernel sin rediseñar su interfaz.
5. Conectar Mobile al mismo feature mediante su presentación nativa.
6. Crear `apps/web` sobre el mismo kernel y la presentación DOM compartida.
7. Migrar las demás capacidades una por una.
8. Sustituir composiciones antiguas únicamente cuando no tengan consumidores.

La aplicación Next.js en producción continuará bajo las restricciones de ADR
0001 y ADR 0005 hasta que el nuevo Web alcance paridad y exista una estrategia
de despliegue reversible.

## Consecuencias

- La integración funcional de una capacidad se realiza una sola vez.
- Web, Desktop y Mobile reciben el mismo catálogo portable de features.
- Las diferencias visuales y de plataforma permanecen explícitas.
- TypeScript convierte las omisiones entre clientes en errores verificables.
- Los `package.json` dejan de utilizarse como sustituto de una matriz de
  capacidades.
- El kernel introduce un punto central de composición que deberá mantenerse
  modular para evitar convertirse en un objeto global con lógica de negocio.
- Agregar una capacidad requiere actualizar el kernel y clasificar todos los
  renderers, aumentando deliberadamente la disciplina de cada entrega.
