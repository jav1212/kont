# Tesorería y tributos venezolanos: evidencia de configuración

Fecha de revisión: 2026-10-01. Esta nota documenta fuentes y límites para la configuración de tesorería; no sustituye la revisión de un asesor tributario ni demuestra que no existan normas posteriores.

## Alcance del motor

`@kontave/taxation` mantiene separado el impuesto histórico al débito bancario, derogado por la Ley publicada en Gaceta Oficial N.º 38.375 del 08-02-2006, del IGTF. El motor genérico de débito bancario no presume que una operación sea IGTF, ni incorpora una alícuota legal. Requiere una política versionada, vigente, delimitada por organización y empresa, con base, moneda, aprobación y evidencia.

La política venezolana clasifica de forma explícita el sujeto del artículo 4, la naturaleza del pago, la moneda y el canal financiero. Una moneda extranjera por sí sola no identifica todos los supuestos de la ley; tampoco un débito identifica por sí mismo a un sujeto pasivo especial. Un dato `not_classified`, una política ausente, o dos políticas aplicables bloquean la determinación.

Las exenciones o exoneraciones necesitan una política y evidencia específicas. El código no activa una exclusión por desconocer hechos ni convierte esta nota en una lista completa de beneficios.

## Fuentes verificadas

1. [Gaceta Oficial Extraordinaria N.º 6.687, 25-02-2022](https://www.grantthornton.com.ve/globalassets/1.-member-firms/venezuela/2022/goe-6.687.pdfreforma-igtf-02-2022-1.pdf), reforma de la Ley de IGTF. Los artículos 3/4 definen hechos y sujetos; el 12, base sobre el débito o extinción; 13/24, tasas; 8/23, beneficios. El artículo 24 fija 3% para sujetos 5/6 mientras no se establezca otra tasa; `venezuelanArticle24ForeignCurrencyPolicyFixture` distingue canal bancario nacional sin corresponsal extranjero (5) de pagos sin mediación bancaria a sujetos especiales (6). El artículo 8 limita sus exenciones 5–11 a moneda legal o criptoactivos soberanos. Las referencias se configuran explícitamente y no se activan solas.
2. [Gaceta Oficial Extraordinaria N.º 6.821, Decreto N.º 4.972, 12-07-2024](https://sbasociados.com.ve/wp-content/uploads/2024/11/DECRETO-4.972-ALICUOTA-0-Bs.-GO.6821E-12.7.24.pdf). El decreto fija 0% para las transacciones de los contribuyentes de los numerales 1 a 4 del artículo 4, con vigencia desde el 15-07-2024. El fixture `venezuelanDecree4972PolicyFixture` sólo modela ese alcance y exige que la configuración autorizada suministre su 0% y el resto de datos.
3. [Gaceta Oficial N.º 43.292, Decreto N.º 5.207, 09-01-2026](https://www.grantthornton.com.ve/globalassets/1.-member-firms/venezuela/2026/exoneracion-iva-importacion-combustibles-aditivos-01-2026.pdf). Los artículos 1 y 4 incluyen una exoneración de IGTF para ventas nacionales de combustibles derivados de hidrocarburos, insumos y aditivos destinados a mejorar la gasolina, cuando las realizan los sujetos y bajo las condiciones del decreto. El artículo 4 remite a una Providencia Administrativa del SENIAT para requisitos y controles; el artículo 10 fija vigencia desde el 12-01-2026 y el artículo 9 limita el beneficio a un año. Por ello no se trata como exención general de débitos bancarios ni se habilita sin validar operación, sujeto, vigencia, providencia y evidencia.

La Ley que derogó la Ley de Impuesto al Débito Bancario fue identificada como Gaceta Oficial N.º 38.375 (08-02-2006). La copia consultada no pudo abrirse durante esta investigación; debe preservarse una copia primaria verificable antes de fijar una política histórica.

## Operación y mantenimiento

Antes de activar o modificar una política se debe conservar la Gaceta o providencia aplicable, el intervalo de vigencia, la aprobación responsable y la evidencia. La comprobación del 01-10-2026 confirma el alcance limitado del Decreto 5.207, pero no verifica si SENIAT ya publicó la providencia operativa mencionada en el artículo 4. Por tanto, la fixture no debe aplicar esa exoneración sin la providencia y los datos que acrediten elegibilidad. Para períodos posteriores se debe comprobar si hubo cambios de alícuota, exoneración, providencia, criterio del SENIAT o decisión aplicable antes de reutilizar una fixture.
