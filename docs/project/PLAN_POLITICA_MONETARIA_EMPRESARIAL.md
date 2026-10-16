# Política monetaria empresarial

Fecha: 2026-09-28. Estado: **fundamento validado en desarrollo; integración Web pendiente.**

Este corte entrega una base de paquetes para configurar, resolver y conservar una política monetaria por empresa. Continúa la etapa 2 del [plan del núcleo administrativo](PLAN_IMPLEMENTACION_NUCLEO_ADMINISTRATIVO_FISCAL.md). No incorpora una ruta, pantalla ni composición en el cliente Web de producción.

## Resultado y límites del corte

Cada empresa puede tener revisiones inmutables de una política monetaria. El perfil inicial es deliberadamente acotado: moneda operativa `VES` con dos decimales, una lista no vacía de referencias `USD` y/o `EUR` ordenada canónicamente, fuente `bcv`, perfil `commercial_v1` que resuelve a `half_up`, y solamente tasas oficiales, frescas y de la fecha exacta solicitada. No habilita moneda funcional arbitraria, tasas manuales, fechas anteriores, cambio de moneda de documentos, contabilidad multimoneda ni preferencias de formato.

Una revisión monetaria tiene versión propia. El avance de `Company.version`, por ejemplo al asignar un correlativo comercial, no provoca un conflicto de política. Las políticas previas quedan consultables por versión y no se reinterpretan documentos históricos ni los JSON heredados de empresa.

La ausencia de política es explícita: leer la revisión actual devuelve `null`; resolver un contexto devuelve `COMPANY_MONETARY_POLICY_NOT_CONFIGURED`. Una lectura nunca inicializa configuración.

## Contrato público

El propietario es `@kontave/companies`. El dominio y aplicación no importan Supabase, HTTP ni UI; [el adaptador Supabase](../../packages/business/companies/src/adapters/supabase/index.ts) es de servidor de confianza y compone las RPC de la migración [289](../../supabase/migrations/289_company_monetary_policy.sql).

| Necesidad | API |
| --- | --- |
| Leer actual o histórica | `new GetCompanyMonetaryPolicy(authorization, repository).execute(query)` |
| Crear o revisar | `new ConfigureCompanyMonetaryPolicy(authorization, repository).execute(command)` |
| Resolver tasa y política | `new ResolveCompanyMonetaryContext(getPolicy, companies, rates).execute(query)` |
| Reproducir una conversión | `convertWithCompanyMonetaryContext(amount, snapshot)` |

La escritura requiere `companies.update`, empresa activa, `expectedPolicyVersion`, `idempotencyKey` y `reason`. Use `0` para crear; para actualizar, use exactamente la versión leída. La lectura requiere `companies.read`; una versión histórica inexistente es un error, mientras que solo la actual ausente devuelve `null`. Actor y organización deben derivarse de una sesión verificada en el servidor: no se aceptan como identidad datos controlados por el navegador.

```ts
const policy = await configure.execute({
  actorUserId,
  organizationId,
  companyId,
  expectedPolicyVersion: 0,
  idempotencyKey: "monetary-policy-20260928-001",
  reason: "Configuración inicial",
  settings: {
    operatingCurrencyCode: currencyCode("VES"),
    operatingCurrencyMinorUnit: 2,
    referenceCurrencyCodes: [currencyCode("USD")],
    rateSource: COMPANY_MONETARY_RATE_SOURCE,
    roundingProfile: COMPANY_MONETARY_ROUNDING_PROFILE,
    allowPreviousAvailableDate: false,
    maxPreviousDays: 0,
  },
});

const context = await resolve.execute({
  actorUserId,
  organizationId,
  companyId,
  referenceCurrencyCode: currencyCode("USD"),
  requestedDate: "2026-09-28",
});
const conversion = convertWithCompanyMonetaryContext(usdAmount, context);
```

El ejemplo presupone que `configure`, `resolve` y sus dependencias se crean en un límite de servidor autenticado. No se debe enviar una clave de servicio al cliente.

## Snapshot y persistencia del consumidor

`ResolveCompanyMonetaryContext` admite solamente un resultado `exact_date`, `fresh`, con fecha efectiva igual a la solicitada, dirección `USD|EUR → VES` y fuente oficial de autoridad `BCV`. Por ello una fecha sin publicación, incluido un fin de semana si el proveedor no publica ese día, se rechaza en vez de sustituirse silenciosamente por una tasa previa.

El `CompanyMonetaryContextSnapshot` es JSON seguro y guarda versión de política, monedas y escalas, perfil/modo de redondeo, fecha solicitada/efectiva, observación/frescura y el valor decimal de la tasa con su precisión publicada. Los importes y tasas siguen siendo cadenas o tipos exactos; no convertirlos a `number`.

Un consumidor que confirme una operación debe persistir su snapshot junto con el documento y su propio estado/idempotencia en **la misma transacción**. Las lecturas históricas y una reimpresión deben usar el snapshot guardado con `convertWithCompanyMonetaryContext`, no volver a consultar la política actual ni el proveedor. Integrar esa frontera transaccional en Facturación o Ventas es trabajo posterior explícito.

## Persistencia y recuperación

Las migraciones 289 y 290 son aditivas. Crean política actual, revisiones, recibos de idempotencia y eventos de auditoría privados, además del índice de clave foránea de revisiones; no modifican `shared_companies`, `config_fiscal`, nómina, inventario ni documentos existentes. Las RPC `get_native_company_monetary_policy` y `configure_native_company_monetary_policy` quedan reservadas a `service_role`; además verifican organización, membresía, permiso y estado de empresa. RLS está habilitado sin políticas de cliente para esas tablas.

Cada configuración toma un bloqueo de empresa, normaliza la lista de referencias, añade una revisión y evento, y guarda el resultado para reintentos con la misma intención. Reutilizar la misma clave con actor, versión esperada, motivo o política distintos genera conflicto de idempotencia. Revisiones y eventos no admiten actualización, y referencias con `RESTRICT` impiden borrar empresa u organización configuradas a través de una cascada heredada.

Ante una corrección posterior, se agrega una nueva migración o revisión; no se borran evidencias ni se revierte con una eliminación de tablas. Si un consumidor nuevo falla, se desactiva su uso y se conserva el esquema y los snapshots ya emitidos.

## Estado de implementación y verificación

| Hito | Estado | Evidencia |
| --- | --- | --- |
| M1. Perfil e invariantes | Hecho | Dominio tipado en `companies`; VES, USD/EUR, BCV, `commercial_v1` y fecha exacta. |
| M2. Casos de uso y autorización | Hecho | Lectura, configuración y resolución con `companies.read`/`companies.update`. |
| M3. Adaptador y migración | Hecho | RPC de servicio, revisiones, auditoría, idempotencia y RLS en migración 289. |
| M4. Snapshot reproducible | Hecho | Resolución restringida y conversión desde contexto serializado. |
| M5. Validación remota | Hecho | Preflight, smoke de 19 grupos y dos carreras PostgreSQL reales pasaron en el proyecto de desarrollo autorizado; fixtures eliminados y huellas preservadas. |
| M6. Entrega del fundamento | Hecho | Contrato, migraciones, checks y documentación cerrados. Falta un consumidor de documento y la integración Web explícita. |

Pasaron 39/39 pruebas de `@kontave/companies`, 23/23 de `@kontave/monetary`, 16 chequeos descendentes, TypeScript raíz y ESLint. En MCP, las migraciones 289 (`20260928180913`) y 290 (`20260928182149`) se aplicaron en el proyecto de desarrollo autorizado `fvantswxhepvkloygcvc`. El smoke cubrió 19 grupos, incluidos payload inválido, reintentos/rollback, ACL, permisos revocados, suspensión, lectura histórica, inmutabilidad, borrado bloqueado por FK, auditoría y numeración independiente. Las dos carreras verificaron conflicto de versión tanto en edición como en creación inicial; no quedaron políticas, revisiones, recibos ni eventos de prueba. Las huellas finales conservaron 74 empresas y 28 facturas. Esta evidencia valida el fundamento, no una integración Web ni políticas configuradas para clientes.

## Cobertura ProfitPlus

El [registro de validación reproducible](../audit/company-monetary-policy-validation-2026-09-28.json) conserva el preflight, migraciones, resultados del smoke, intervalos/PID de las carreras, permisos y huellas finales. Los scripts de preflight y smoke están en `supabase/checks`; las carreras requieren conexiones independientes y fixtures exclusivos, cuya eliminación controlada se verificó por identificadores exactos.

El corte avanza de forma limitada ADM-003 y ADM-020, y habilita una selección controlada de monedas de referencia para ADM-021/ADM-022. No completa parametrización general, cambio de moneda base ni operación multimoneda integral. La matriz histórica permanece en el [informe de administración](../audit/profitplus-administracion-packages-2026-09-28.md).
