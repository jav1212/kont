# SENIAT Compliance — Backlog pendiente

> **Origen:** auditoría inicial de cumplimiento SENIAT (carpeta `SENIAT K`) +
> follow-ups del Sprint 4 (Sales). Sprints 0-5 ya cerraron las brechas TIER 1
> (TXT IVA, comprobantes IVA/ISLR, XML ISLR consolidado, IGTF percepción) y
> TIER 2 principal (Sales invoicing + Estados Financieros). Lo que sigue es
> TIER 3 (niche/oportunista) y mejoras orientadas a redondear el flujo
> compra → venta → declaración.
>
> **Ámbito de este documento:** captura los requerimientos pendientes con
> contexto, base legal y criterios de aceptación para retomarlos cuando se
> prioricen. No incluye plan de ataque detallado — eso se elabora al mover
> cada item a `planned/`.

---

## Índice

| ID  | Nombre                                                  | Tier | Esfuerzo | Bloquea a |
|-----|---------------------------------------------------------|------|----------|-----------|
| R-1 | LOCTI — Aporte al FONACIT                               | T3   | M        | —         |
| R-2 | Anticipo semanal IVA + mensual ISLR                     | T3   | M        | —         |
| R-3 | IGP — Impuesto a los Grandes Patrimonios                | T3   | XL       | R-5, R-6  |
| R-4 | Modelos de escritos a SENIAT                            | T3   | S        | —         |
| R-5 | Catálogo Estado/Municipio de Venezuela                  | T3   | S        | R-3       |
| R-6 | Unidad Tributaria histórica                             | T3   | S        | R-1, R-3  |
| R-7 | Validación manual Providencia SNAT/2025/000054          | T3   | XS       | —         |
| R-8 | Integración factura de venta → movimiento de inventario | —    | M        | —         |
| R-9 | Retenciones IVA/ISLR recibidas del cliente              | —    | M        | —         |

Esfuerzo: XS (< 1 día) · S (1-3 días) · M (1 semana) · L (2 semanas) · XL (1 mes+).

---

## R-1 · LOCTI — Aporte al FONACIT

### Contexto
La **Ley Orgánica de Ciencia, Tecnología e Innovación** obliga a empresas con
ingresos brutos anuales > 100.000 U.T. a aportar un % al FONACIT. El plazo es
**anual, vence en junio**, y el calendario SENIAT 2026 (Gaceta 43.273) ya lo
lista pero KONT no tiene calculador.

### Base legal
- **LOCTI** — Ley Orgánica de Ciencia, Tecnología e Innovación.
- Tarifas (G.O. 39.575 y reformas): **0,5% / 1% / 2%** del ingreso bruto del
  ejercicio anterior según el sector económico (industrial, hidrocarburos,
  servicios, etc.).
- Umbral: ingresos brutos > 100.000 U.T. del ejercicio anterior.

### Funcional
- Pantalla `/tools/locti` (o subnav del módulo Contabilidad) con input de
  ingresos brutos del ejercicio anterior + selector de sector económico.
- Calculador: ingreso bruto × tarifa = aporte FONACIT.
- Validación de umbral 100.000 U.T. (depende de R-6).
- Recordatorio en calendario SENIAT 2026 (ya parseado).
- PDF de respaldo con el cálculo (papelería para subir al portal FONACIT).

### Criterios de aceptación
- [ ] Cálculo correcto para los 3 escalones (0,5/1/2%) según sector.
- [ ] Si ingresos < 100.000 U.T., mensaje claro de "no obligado".
- [ ] PDF muestra: razón social, RIF, ejercicio fiscal, ingreso bruto, sector,
      tarifa, aporte y fecha de vencimiento (junio del año siguiente).

### Notas
Sector de la empresa ya existe en `companies.sector` — se puede mapear a las
tarifas. La U.T. requiere R-6 para no hardcodearla.

---

## R-2 · Anticipo semanal IVA + mensual ISLR

### Contexto
Régimen temporal introducido por **G.O. Extraordinaria 6.396 del 21/08/2018**
para Sujetos Pasivos Especiales: anticipos semanales de IVA y mensuales de
ISLR sobre ingresos brutos. La aplicación práctica ha cambiado y conviene
**validar vigencia** antes de implementar — el calendario SENIAT 2026 sí
lista los anticipos, pero la fórmula y base actuales deben confirmarse.

### Base legal
- **G.O. Ext. 6.396 del 21/08/2018** — Reforma IVA + ISLR + IGTF.
- **Providencia SNAT/2018/0128** — Régimen de anticipos para SPE.
- Posibles modificaciones en providencias 2024-2025 (verificar).

### Funcional
- Solo aplica a empresas con `taxpayerType === 'especial'`.
- Pantalla con calculadora de anticipo semanal IVA (% sobre ingresos brutos
  de la semana anterior) + anticipo mensual ISLR.
- Histórico de anticipos pagados con saldo a favor/contra.
- Integración con calendario SENIAT (recordatorio por venida de pago).

### Criterios de aceptación
- [ ] **Validación vigencia (PRIMERO):** confirmar con providencia 2025
      vigente las tarifas, base de cálculo y periodicidad exactas.
- [ ] Cálculo automático a partir de las facturas confirmadas en el
      período (módulo `sales` ya tiene base de ingresos).
- [ ] PDF de respaldo con detalle de la base de cálculo.
- [ ] No aplicable a contribuyentes ordinarios (UI debe ocultarlo).

### Notas
**Riesgo:** la implementación queda inservible si el régimen cambió y los
anticipos ya no aplican a los SPE actuales. Validar antes de codear.

---

## R-3 · IGP — Impuesto a los Grandes Patrimonios

### Contexto
Aplica únicamente a SPE con **patrimonio neto ≥ 150.000.000 U.T.** Declaración
**anual definitiva**. Carga 100% web manual en el portal SENIAT — no hay
TXT/XML público. Mayoría de clientes de KONT no califican; valor agregado
sería preparar la data limpia para el portal.

### Base legal
- **Ley de Impuesto a los Grandes Patrimonios** — G.O. Ext. 6.507.
- Umbral: patrimonio neto ≥ 150M U.T. (verificar con G.O. 41.696).
- Tarifa: 0,25% – 1,5% sobre el excedente del umbral.

### Funcional
- Flag `Company.aplicaIgp` (calculado o manual).
- Módulo `/igp/` con 4 secciones (espejando portal SENIAT):
  - **Activos:** inmuebles, vehículos, valores, cuentas bancarias, otros.
    Cada registro pide ubicación (estado/municipio — depende de R-5).
  - **Pasivos:** deudas con respaldo legal.
  - **Patrimonio neto = Activos − Pasivos.**
  - **Liquidación del impuesto:** tarifa progresiva sobre excedente del umbral.
- PDF preparatorio con todos los registros estructurados para copiar al
  portal manualmente.

### Criterios de aceptación
- [ ] Solo visible para empresas con flag `aplicaIgp = true`.
- [ ] Validación de umbral usando U.T. vigente (depende de R-6).
- [ ] PDF organiza activos por categoría con totales subtotalizados.
- [ ] Cada activo registra: tipo, descripción, valor, ubicación
      (estado + municipio del país).

### Notas
**Bloqueado por** R-5 (catálogo geográfico) y R-6 (U.T.). Implementar solo
si hay clientes que califiquen (preguntar antes de empezar).

---

## R-4 · Modelos de escritos a SENIAT

### Contexto
El usuario pasó plantillas (`MODELO DE ESCRITO NUEVO.docx`,
`INFORMACION PARA ESCRITOS.pptx`) que los contadores usan repetidamente:
cambio de domicilio fiscal, recurso jerárquico, prórroga de declaración,
respuesta a fiscalización. Hoy se llenan a mano en Word.

### Base legal
- **Código Orgánico Tributario (COT-2020)** — Arts. 158-200 sobre escritos,
  recursos administrativos y plazos.

### Funcional
- Pantalla `/tools/escritos` con catálogo de plantillas:
  - Cambio de domicilio fiscal
  - Recurso jerárquico
  - Solicitud de prórroga
  - Respuesta a acta de reparo
  - Solicitud de inscripción en registro
  - (Lista extensible a partir de los .docx provistos.)
- Form con campos rellenables (RIF, razón social, dirección, fecha,
  motivo, etc.). El sistema completa automáticamente desde `Company`.
- Generación de PDF y/o DOCX con membrete y firma.

### Criterios de aceptación
- [ ] Mínimo 5 plantillas funcionales.
- [ ] Auto-rellenado desde la empresa activa (RIF, razón social, dirección).
- [ ] Salida en PDF (mínimo) y DOCX (opcional).
- [ ] Historial de escritos generados por empresa (auditoría).

### Notas
Esfuerzo bajo si no se intenta recrear el formato exacto del .docx oficial —
basta con un PDF profesional bien diagramado.

---

## R-5 · Catálogo Estado/Municipio de Venezuela

### Contexto
Tablas de los **23 estados + Distrito Capital + sus 335 municipios**.
Lo necesita IGP (R-3) para registrar la ubicación de cada bien. También es
útil para direcciones formales en facturas y reportes. Debería vivir en
`src/shared/data/venezuela-geography.ts` para reutilizarse desde múltiples
módulos.

### Funcional
- TS export con la lista oficial de estados (incluyendo Vargas/La Guaira y
  Miranda con sus ajustes recientes) y sus municipios.
- Componente `<EstadoMunicipioPicker/>` en `src/shared/frontend/components/`
  con cascading select.
- Migración opcional para persistir como tabla `public.venezuela_estados` y
  `public.venezuela_municipios` si se quiere editable.

### Criterios de aceptación
- [ ] Lista completa: 24 entidades federales y todos sus municipios.
- [ ] Componente `<EstadoMunicipioPicker/>` con búsqueda y cascading.
- [ ] No depende de red — todo en bundle.

### Notas
Datos públicos. INE (Instituto Nacional de Estadística) tiene la división
político-territorial vigente.

---

## R-6 · Unidad Tributaria histórica

### Contexto
La U.T. la actualiza SENIAT periódicamente (publicación en G.O.). Aplica
para AR-I, umbrales LOCTI, IGP, sustraendos ISLR, multas, etc. Hoy KONT la
tiene hardcodeada o no la usa. Conviene tener un registro histórico para
calcular obligaciones de períodos anteriores con la U.T. correcta.

### Funcional
- Tabla `public.unidades_tributarias` con `(vigente_desde, valor_bs)`.
- Helper `getUnidadTributaria(date: Date)` que retorna la U.T. vigente en
  esa fecha.
- UI de mantenimiento solo-admin para registrar nuevas U.T. cuando SENIAT
  publique (en `/admin/`, no en la app del usuario).
- Reemplazar usos hardcoded actuales por el helper.

### Criterios de aceptación
- [ ] Tabla seedeada con histórico desde 2019 (cuando entró Bs. soberano)
      hasta la fecha.
- [ ] Helper retorna la U.T. correcta para cualquier fecha pasada.
- [ ] Test/golden: calcular sustraendo ISLR PNR para abril 2024 con la
      U.T. del momento, comparar contra valor conocido.

### Notas
**Bloquea R-1** (LOCTI usa umbral 100.000 U.T.) y **R-3** (IGP usa
150.000.000 U.T.). Ataque temprano si se planea hacer cualquiera de los dos.

---

## R-7 · Validación manual Providencia SNAT/2025/000054

### Contexto
Durante la auditoría inicial el agente no pudo extraer texto del PDF
`GO 43171 16-07-2025 PROV SNAT-2025-000054.pdf`. **Riesgo:** podría
introducir cambios al formato TXT IVA o al esquema XML ISLR ya
implementados. Esta tarea es solo lectura humana + validación de
cumplimiento del código actual.

### Acciones
- [ ] Abrir el PDF manualmente (Adobe Reader, no extracción automática).
- [ ] Confirmar si reemplaza Providencia 0049/2015 o solo la complementa.
- [ ] Verificar campos del TXT (las 16 columnas A→P) contra el código
      actual en `src/modules/purchases/frontend/utils/txt-retenciones-iva.ts`.
- [ ] Verificar esquema XML ISLR contra `xml-retenciones-islr.ts`.
- [ ] Si hay cambios → abrir nuevo REQ con migración correspondiente.

### Criterios de aceptación
- [ ] Documento de hallazgos en `docs/requirements/notes/snat-2025-000054.md`
      con resumen del impacto.

### Notas
Esfuerzo XS. No requiere código si la providencia no introduce cambios.

---

## R-8 · Integración factura de venta → movimiento de inventario

### Contexto
Hoy `sales/` y `inventory/` están separados por diseño (un servicio se factura
sin afectar inventario). Pero cuando una **línea de factura corresponde a un
producto del inventario**, debería generar automáticamente un movimiento de
salida (`salida_venta`) que descuente existencia y registre el costo de
ventas para el Estado de Resultados.

### Funcional
- En `SalesInvoiceItem` agregar opcional `productId` (ya existe pero no usado).
- Selector de producto en el form de factura (autocomplete sobre catálogo de
  inventario).
- Al confirmar la factura: si el item tiene `productId`, generar
  `Movimiento { tipo: 'salida_venta', producto_id, cantidad, precio_unitario }`.
- Al desconfirmar: revertir el movimiento (mismo patrón que purchases).
- Reporte: Costo de Ventas en el Estado de Resultados a partir del
  método de valuación (promedio ponderado / PEPS).

### Criterios de aceptación
- [ ] Una factura de venta con producto del inventario descuenta existencia.
- [ ] El costo unitario del movimiento sale del kardex (PP/PEPS).
- [ ] Al desconfirmar factura, el movimiento se revierte y la existencia
      vuelve al estado anterior.
- [ ] Estado de Resultados muestra Costo de Ventas != 0 cuando hay ventas.

### Notas
Patrón existente: ver `confirmar-factura-compra.use-case.ts` que ya hace
esto para compras. Replicar con sentido inverso (salida en vez de entrada).

---

## R-9 · Retenciones IVA/ISLR recibidas del cliente

### Contexto
Cuando el cliente del KONT-user es **agente de retención** (otro SPE), al
pagar la factura del KONT-user **le retiene IVA y/o ISLR**. Estas retenciones
son **un crédito fiscal** que el KONT-user descuenta en su declaración. Hoy
no hay forma de registrarlas desde la factura de venta.

### Base legal
- **Providencia 0049/2015** — IVA: agente de retención debe entregar
  comprobante al sujeto retenido.
- **Decreto 1808** — ISLR: ídem comprobante de retención al sujeto retenido.

### Funcional
- En `SalesInvoice` agregar campos:
  - `retencionIvaCliente` (porcentaje, monto, número de comprobante recibido)
  - `retencionIslrCliente` (concepto, porcentaje, monto, comprobante)
- Sección colapsable en form de factura de venta: "El cliente me retiene".
- Una vez confirmada la factura con retención: registrar un crédito fiscal
  (asiento contable) por el monto retenido.
- Reporte trimestral: "Retenciones que me hicieron" — total recuperable.

### Criterios de aceptación
- [ ] La factura de venta acepta opcionalmente retenciones IVA + ISLR
      practicadas por el cliente al pagar.
- [ ] El total a cobrar = total factura − retenciones.
- [ ] Reporte de retenciones recibidas por período (PDF).
- [ ] Al cargar el comprobante físico (foto/PDF), se almacena en
      `documents/` para auditoría.

### Notas
Cierra el ciclo simétrico al módulo `purchases` (donde KONT-user RETIENE al
proveedor). Aquí KONT-user es **retenido**, no agente.

---

## Roadmap sugerido

Si se retoma este backlog:

1. **R-7 (XS)** — primero, valida que TXT/XML actuales sigan vigentes.
2. **R-6 (S)** — desbloquea R-1 y R-3.
3. **R-5 (S)** — desbloquea R-3 y mejora UX general.
4. **R-9 (M)** — alto valor para SPE. Cierra ciclo de retenciones.
5. **R-1 (M)** — LOCTI. Anual, junio. Sirve a casi todos los clientes con
   ingresos > 100k U.T.
6. **R-8 (M)** — integración sales↔inventory. Habilita Costo de Ventas real.
7. **R-4 (S)** — quick win en herramientas, papelería SENIAT.
8. **R-2 (M)** — anticipos. Validar vigencia primero (R-7 puede aclarar).
9. **R-3 (XL)** — IGP. Solo si hay cliente que califique.

---

## Mantenimiento de este documento

Cuando un item se promueva a implementación:

1. Cópialo a `docs/requirements/planned/REQ-NNN-<short-name>.md` usando
   `templates/REQUIREMENT_TEMPLATE.md`.
2. Marca el item aquí como ✅ con link al REQ planificado.
3. Al cerrar el sprint, mover a `done/` con notas de implementación final.
