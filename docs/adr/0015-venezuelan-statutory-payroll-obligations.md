# ADR 0015: Obligaciones legales de nómina venezolana

- Estado: aceptado
- Fecha: 2026-08-13

## Contexto

La Web de producción comenzó como una nómina quincenal y expresa obligaciones venezolanas mediante filas configurables. Actualmente aplica un tope de diez salarios mínimos al IVSS, no aplica el tope propio del RPE, condiciona FAOV e INCES a la segunda quincena y trimestraliza el cálculo anual del AR-I. Esas decisiones mezclan frecuencia de pago, período legal y base contributiva.

El core definido en ADR 0013 no conoce jurisdicciones. Las reglas venezolanas deben conservar su fuente, vigencia, base, tasa, tope, período de evaluación y resultado obrero o patronal sin contaminar el motor general.

## Decisión arquitectónica

Crear `@kontave/payroll-venezuela`, dependiente de `payroll-domain` y `monetary-domain`. El paquete contiene políticas puras, exactas y versionadas; no consulta Supabase, IVSS, BANAVIH, INCES, SENIAT, BCV ni servicios HTTP.

La frecuencia de una corrida (`weekly`, `biweekly`, `monthly`, `custom`) no modifica el período jurídico:

| Obligación | Período jurídico |
|---|---|
| IVSS | semana cotizable |
| RPE | mes calendario, usando la base legal del mes anterior |
| FAOV | mes calendario |
| INCES patronal | trimestre calendario, con acumulación continua |
| INCES trabajador | evento de pago de utilidades, aguinaldo o bonificación de fin de año |
| ISLR | porcentaje anual AR-I aplicado en cada pago o abono gravable |

Una modalidad por hora determina el devengo, no la frecuencia. Después de obtener el salario por horas, sus conceptos alimentan las mismas bases legales.

## Clasificación salarial

Cada percepción se clasifica por naturaleza salarial, regularidad, naturaleza de pago y tratamiento tributario. De esa clasificación se derivan las bases, no del nombre visible del concepto.

- Salario normal: percepción salarial, ganada y regular/permanente.
- Salario integral: toda percepción salarial y sus incidencias legalmente reconocidas.
- Horas extraordinarias accidentales: salario e integral, pero no salario normal.
- Horas extraordinarias regulares en la realidad: salario normal por habitualidad, sin perjuicio de los límites y autorizaciones laborales.
- Cestaticket y beneficios expresamente no salariales: no alimentan bases salariales.
- Reembolso comprobado: no remunera el servicio y no alimenta bases.
- Una alícuota de bono vacacional o utilidades utilizada para formar salario integral no se trata automáticamente como dinero pagado en cada corrida.

La clasificación de ISLR es independiente: una percepción salarial puede estar excluida o exenta por una norma tributaria específica.

## IVSS

Fuentes registradas: Ley del Seguro Social y Reglamento General publicados en Gaceta Oficial 39.912; Ley Orgánica del Sistema de Seguridad Social, artículos 113, 116 y 132.

Reglas implementadas:

- Base: salario cotizable regular conforme al artículo 83 del Reglamento.
- Tope máximo: cinco salarios mínimos urbanos mensuales.
- Base semanal exacta: `min(ingreso cotizable mensual, 5 × salario mínimo) × 12 / 52`.
- Cotización del trabajador: 4%.
- Cotización patronal: 9%, 10% u 11% para riesgo mínimo, medio o máximo según el artículo 109 del Reglamento.
- La cantidad de semanas es una entrada del calendario de cotización; no se deduce de que la corrida sea quincenal.
- La operación `12/52` permanece exacta y se redondea al cuantizar el resultado individual. La base semanal mostrada puede estar cuantizada, pero no se reutiliza para introducir doble redondeo.

Casos reservados para una política posterior: reposos certificados, semana parcial, ingreso o egreso dentro de la semana, continuación facultativa y regímenes parciales. Hasta implementarlos, la capa de aplicación debe suministrar las semanas cotizables ya resueltas y no inferirlas silenciosamente.

## Régimen Prestacional de Empleo (RPE)

Fuente registrada: Ley del Régimen Prestacional de Empleo, Gaceta Oficial 38.281, artículos 46 y 47.

Reglas implementadas:

- Base: salario normal devengado en el mes inmediatamente anterior al de causación.
- Tasa total: 2,5%; 2% patronal y 0,5% trabajador.
- Límite inferior: un salario mínimo urbano.
- Límite superior: diez salarios mínimos urbanos.
- Para jornada parcial se permite una fracción explícita del límite inferior. No se presume a partir de las horas de una sola corrida.
- Una suspensión total sin salario produce base y cotización cero; el límite inferior no puede crear una deuda ficticia.
- RPE no reutiliza el tope ni la base IVSS.

## FAOV

Fuente registrada: Ley del Régimen Prestacional de Vivienda y Hábitat, Gaceta Oficial 5.889 Extraordinario, artículo 30.

Reglas implementadas:

- Base: salario integral acumulado del mes.
- Ahorro del trabajador: 1%.
- Aporte patronal: 2%.
- Sin tope expresado en salarios mínimos.
- La obligación se reconcilia como `causado acumulado - aplicado previamente`.
- La segunda quincena puede ser una estrategia de recuperación o presentación, nunca la regla jurídica.
- En ingreso, egreso, nómina semanal, extraordinaria o mensual se conserva un único acumulado por trabajador y mes.

## INCES

Fuente registrada: Decreto con Rango, Valor y Fuerza de Ley del INCES, Gaceta Oficial 6.155 Extraordinario, artículos 49 y 50.

Reglas implementadas:

- Aporte patronal: 2% sobre la base salarial normal acumulada; se activa para entidades con cinco o más trabajadores.
- El acumulado y enteramiento se identifican por trimestre calendario.
- Retención del trabajador: 0,5% exclusivamente ante pago de utilidades, aguinaldos o bonificaciones de fin de año comprendidas por la regla.
- Una nómina ordinaria no activa el 0,5%.
- El disparador es una familia semántica del concepto, nunca una coincidencia de texto.

La capa de aplicación deberá conservar la evidencia del conteo de trabajadores y la composición de la base declarada.

## ISLR y AR-I

Fuente registrada: Decreto 1.808, Gaceta Oficial 36.203, artículos 1 al 7, y la Tarifa N.º 1 de la LISLR aplicable.

Reglas implementadas:

- Sujeción de residente cuando la remuneración anual estimada exceda 1.000 UT.
- La UT es un dato monetario externo, histórico y versionado; no es una constante del paquete.
- El AR-I del trabajador elige exactamente un método: desgravamen único o desgravámenes detallados.
- Se aplican Tarifa N.º 1, rebaja personal, cargas familiares y retenciones en exceso informadas.
- El porcentaje resultante se aplica a cada pago gravable.
- Si el trabajador omite informar, el patrono estima la remuneración anual y aplica el procedimiento subsidiario del artículo 6. No se concede automáticamente el desgravamen único; se aplica la rebaja personal de 10 UT.
- Las variaciones se versionan con vigencia para marzo, junio, septiembre y diciembre y deben considerar remuneración e impuesto retenido acumulados. Esta regularización entre versiones se implementará en aplicación/persistencia.
- Se prohíbe trimestralizar `1.000 UT`, el desgravamen o las rebajas.

Los parámetros tributarios que puedan cambiar se suministrarán mediante una versión normativa. La tabla inicial de Tarifa N.º 1 queda explícita y deberá sustituirse mediante nueva versión cuando cambie la ley.

## Reconciliación entre corridas

Toda obligación acumulable produce:

```text
assessedToDate
previouslyApplied
currentApplication = max(assessedToDate - previouslyApplied, 0)
outstanding
```

Una corrida confirmada no se recalcula con parámetros posteriores. Una corrección, retroactivo o nómina extraordinaria consulta el mismo período jurídico y aplica solo la diferencia. La persistencia futura usará claves estables por trabajador, obligación y período (`YYYY-MM`, `YYYY-Qn`, semana o ejercicio fiscal).

## Redondeo

Los cálculos usan decimales exactos de `monetary-domain`. Los porcentajes y factores no usan `number`. Cada obligación se cuantiza por trabajador en la moneda de liquidación con `half_up`. Los totales empresariales suman resultados individuales; no recalculan el porcentaje sobre un total agregado.

## Diferencias deliberadas con producción

- IVSS usa tope de 5 salarios mínimos, no 10.
- RPE usa su tope propio de 10 salarios mínimos.
- FAOV no depende de `quincena === 2`.
- INCES no depende de la última quincena y su retención obrera no grava el salario ordinario.
- AR-I es anual, no trimestral.
- Las frecuencias semanal, quincenal y mensual comparten el mismo motor de obligaciones.

## Fuera de alcance de este corte

- Persistencia de acumulados y fuentes.
- Adaptadores para TIUNA, BANAVIH, INCES y SENIAT.
- Resolución automática de semanas y reposos.
- Migración de la Web de producción.
- Declaraciones, archivos y comprobantes regulatorios.
- Beneficios no salariales como Cestaticket y Bono de Guerra, salvo su exclusión de bases.

## Consecuencias

- Las obligaciones dejan de ser filas editables con porcentajes libres.
- Una empresa podrá pagar semanal, quincenal o mensualmente sin alterar la deuda legal causada.
- Los resultados serán reproducibles por versión normativa y acumulado.
- Los casos aún no modelados deberán fallar o requerir una decisión explícita; no heredarán convenciones de producción.
