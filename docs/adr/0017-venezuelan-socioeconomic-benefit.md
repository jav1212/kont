# ADR 0017: Bono socioeconómico e ingreso mínimo indexado

- Estado: aceptado
- Fecha: 2026-08-13

## Contexto

Producción denomina `bonoGuerra` a un pago mensual de USD 200 y lo presenta en recibos como “Bono Socio Económico de Ayuda Alimenticia”. Además afirma de forma general que el Artículo 105 de la LOTTT lo convierte en beneficio no remunerativo y lo excluye de todas las bases laborales.

El beneficio público históricamente denominado Bono contra la Guerra Económica fue creado por el Decreto 4.805, Gaceta Oficial 6.746 Extraordinario del 01-05-2023, para trabajadores activos de la Administración Pública, jubilados y pensionados, con montos diferenciados. El 30-04-2026 el Ejecutivo anunció un ingreso mínimo integral de referencia de USD 240: USD 40 de Cestaticket y USD 200 del componente socioeconómico para trabajadores activos, pagados en bolívares a tasa oficial BCV.

No se encontró una ley equivalente a la Ley del Cestaticket que imponga universalmente a cada patrono privado un Bono contra la Guerra Económica de USD 200. Las comunicaciones oficiales de 2026 describen un acuerdo o exhorto para que el sector privado alcance el ingreso de referencia. Eso no basta para que el dominio convierta automáticamente el programa público en una obligación privada individual con idéntica causa y tratamiento.

## Decisión

El paquete `@kontave/payroll-venezuela` incorpora un modelo de beneficio socioeconómico separado de Cestaticket, salario y deducciones.

La regla vigente desde mayo de 2026 contiene:

- referencia mensual de USD 200;
- liquidación en VES;
- tasa oficial BCV correspondiente a la fecha efectiva de pago;
- período de evaluación mensual;
- versión, vigencia y fuentes;
- cobertura explícita;
- reconciliación de pagos parciales del mes.

No se agrega a `VenezuelanObligationCode`, porque con las fuentes disponibles no es una obligación legal universal de nómina comparable con IVSS, RPE, FAOV o Cestaticket.

## Cobertura

### Trabajador público activo

Se admite como programa público de ingreso indexado. El core aplica USD 200 a BCV y conserva la clasificación no salarial declarada por dicho programa.

Jubilados y pensionados quedan fuera del motor de nómina de trabajadores activos porque tienen beneficiarios, montos y mecanismos propios.

### Empresa privada

Solo se calcula cuando existe una fuente de adopción identificable:

- convención o acuerdo colectivo;
- contrato individual;
- política patronal documentada.

El sistema conserva referencia y fecha de vigencia. Un exhorto general al sector privado no se transforma silenciosamente en cláusula contractual ni en obligación individual de USD 200.

## Naturaleza salarial

El nombre “bono socioeconómico”, “ayuda alimenticia” o “bono de guerra” no decide su naturaleza. Para una adopción privada debe registrarse expresamente si:

- integra salario; o
- se sostiene como beneficio no salarial sujeto a que su propósito, forma de entrega y realidad material satisfagan la LOTTT, el acuerdo y la jurisprudencia aplicable.

El core no permite reutilizar la clasificación `public_program_non_salary` en una empresa privada. Tampoco considera que un pago libre y regular de efectivo encaje automáticamente en el numeral alimentario del Artículo 105 LOTTT.

## Tasa y fecha efectiva de pago

La aplicación obtiene el snapshot USD/VES mediante el puerto monetario. El dominio exige:

- fuente oficial identificada como BCV;
- dirección USD/VES;
- fecha efectiva de la tasa no posterior a la fecha de pago;
- preservación de todos los decimales publicados.

El cálculo exacto es `USD 200 × tasa BCV`; el resultado individual se cuantiza una vez en VES con redondeo `half_up`.

## Frecuencia y pagos parciales

La frecuencia semanal, quincenal o mensual no altera el monto mensual. Si el pago se divide, cada ejecución reconcilia el equivalente mensual contra lo previamente pagado. La persistencia debe conservar cada pago y su propio snapshot de tasa; un pago confirmado no se recalcula después.

## Casos no automatizados

- obligación privada derivada únicamente de un anuncio o exhorto sin instrumento aplicable;
- jubilados y pensionados;
- proporcionalidad por ingreso, egreso, suspensión o ausencia;
- absorción por otros bonos o complementos para alcanzar un piso global de USD 240;
- determinación judicial definitiva de la naturaleza salarial de un pago privado concreto;
- migración de producción y corrección de sus textos PDF.

## Consecuencias

- El monto USD 200 queda centralizado y versionado.
- El cálculo usa tasa oficial en la fecha de pago, no una tasa global editable sin contexto.
- El programa público no contamina automáticamente la nómina privada.
- La clasificación salarial privada queda auditable y no se deduce del nombre comercial del pago.
