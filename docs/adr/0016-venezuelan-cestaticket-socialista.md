# ADR 0016: Cestaticket Socialista venezolano

- Estado: aceptado
- Fecha: 2026-08-13

## Contexto

Producción representa el Cestaticket como un monto USD editable que normalmente se incorpora en la segunda quincena, la última semana o la corrida mensual. También permite excluir trabajadores y pagar en efectivo por solicitud del trabajador. Ese comportamiento mezcla cuatro decisiones diferentes: nacimiento del derecho, cuantía legal, frecuencia operativa de nómina y modalidad permitida de entrega.

El Cestaticket no es una deducción del trabajador ni una contribución parafiscal. Es un beneficio de alimentación a cargo del empleador y a favor del trabajador. Debe permanecer fuera de las bases de salario normal e integral, IVSS, RPE, FAOV e ISLR, salvo que una convención colectiva, acuerdo colectivo o contrato individual le reconozca expresamente carácter salarial.

## Fuentes y alcance

La primera versión se apoya en:

- Decreto con Rango, Valor y Fuerza de Ley del Cestaticket Socialista, Decreto 2.066, Gaceta Oficial 40.773 del 23-10-2015, especialmente artículos 2, 4 al 8 y 18.
- Reglamento de la Ley de Alimentación reformado en Gaceta Oficial 40.112 del 20-02-2013, artículos 17, 24, 29, 30 y 34, en cuanto sea compatible con la ley posterior.
- Decreto 4.805, Gaceta Oficial 6.746 Extraordinario del 01-05-2023, artículos 1, 5 y 7.
- Ajuste anunciado por el Ejecutivo Nacional el 01-05-2023 a USD 40 mensuales indexados a la tasa oficial BCV.
- Sentencia 712 de la Sala de Casación Social del 19-12-2024 y reiteraciones, entre ellas las sentencias 371 del 13-08-2025 y 250 del 01-06-2026.

El Decreto 4.805 publicó directamente Bs. 1.000 mensuales y facultó al Ejecutivo para ordenar ajustes tomando como referencia el tipo de cambio BCV. El anuncio ejecutivo contemporáneo expresó el beneficio como USD 40 y la Administración lo aplicó de esa manera. La Sala de Casación Social reconoció posteriormente USD 40 mensuales como valor vigente, convertidos y pagados en bolívares con la tasa oficial para la fecha efectiva de pago, y ha reiterado el criterio hasta 2026.

Por ello la regla operativa vigente del core es USD 40 a BCV en la fecha efectiva de pago. Los Bs. 1.000 se conservan como antecedente promulgado e histórico, no como valor predeterminado actual. El modelo registra conjuntamente la particularidad de las fuentes: el USD 40 no aparece literalmente en el artículo 1 de la Gaceta 6.746, pero sí está respaldado por el ajuste ejecutivo, la aplicación administrativa y el criterio judicial reiterado.

## Decisión

`@kontave/payroll-venezuela` incorpora `VE_CESTATICKET_SOCIALISTA` como obligación patronal mensual cuyo beneficiario es el trabajador.

La evaluación conserva:

- mes calendario y fecha límite de entrega;
- versión, vigencia, monto de referencia, tipo de autoridad y fuentes;
- monto mensual completo;
- inasistencias imputables y ausencias protegidas por separado;
- modalidad de entrega y, si existe efectivo, su excepción y evidencia;
- tratamiento salarial convencional;
- snapshot de tasa y conversión monetaria, cuando el monto aprobado esté denominado en moneda distinta de la liquidación;
- total causado, entregado previamente, aplicación actual y saldo.

La tasa nunca es consultada por el dominio. La aplicación resuelve mediante el puerto monetario el snapshot oficial BCV correspondiente a la fecha efectiva de pago, preserva todos sus decimales y lo entrega al cálculo. La regla vigente falla si falta ese snapshot o si su autoridad no es BCV. La multiplicación permanece exacta y solo el resultado monetario se cuantiza con redondeo `half_up`.

## Período y frecuencia de nómina

El período jurídico es el mes calendario. La frecuencia semanal, quincenal, mensual o por horas no modifica el total causado. Cada corrida reconcilia:

```text
aplicación actual = max(derecho mensual causado - entregado previamente, 0)
```

La empresa puede presentar o entregar el beneficio en una corrida determinada, pero el estado mensual evita duplicarlo u omitirlo. Para cupones, tarjeta electrónica y los casos válidos de efectivo, el reglamento exige cumplimiento dentro de los cinco días siguientes al cierre del mes.

## Inasistencias

Por cada jornada incumplida por una causa imputable al trabajador puede descontarse `monto mensual / 30`. El core agrega las jornadas y redondea el descuento monetario individual una sola vez.

No se descuenta por:

- causa imputable al empleador;
- riesgo, emergencia, catástrofe o calamidad natural que afecte directa y personalmente al trabajador;
- vacaciones;
- incapacidad por enfermedad o accidente que no exceda doce meses;
- descanso pre y post natal;
- permiso o licencia de paternidad.

Las categorías no demostradas no se convierten automáticamente en ausencia protegida. La capa de aplicación debe conservar el soporte del evento.

## Jornada parcial y trabajo por horas

La forma de remuneración por horas no elimina el beneficio. Para una jornada contractualmente parcial, el reglamento permite prorratear cupones, tarjetas o efectivo por la proporción efectiva de horas. Esa proporción debe ser suministrada explícitamente y estar entre cero y uno; no se infiere de una sola corrida.

La comida servida mediante comedor o servicio especializado es indivisible y no usa ese prorrateo monetario. Su valoración contable requiere una política separada; el evaluador monetario no inventa un precio de comida.

## Modalidades de cumplimiento

Se registran comedor propio, comida contratada, comedor común, comedor público de nutrición, cupones, tarjeta electrónica y efectivo excepcional.

El efectivo solo es válido cuando se identifica una de estas causas:

1. entidad con menos de veinte trabajadores y cumplimiento por las otras modalidades imposible o desproporcionadamente oneroso;
2. imposibilidad de acceso factible y oportuno a establecimientos afiliados;
3. sustitución temporal durante vacaciones, maternidad/paternidad o incapacidad protegida cuando normalmente se usa comedor o comida servida.

Los supuestos 1 y 2 exigen evidencia de notificación a la Inspectoría del Trabajo dentro del plazo legal. La simple voluntad del trabajador no es una excepción.

## Casos deliberadamente no automatizados

- El valor actual de USD 40 se aplica como regla operativa respaldada por el criterio reiterado de la Sala de Casación Social, sin afirmar falsamente que esa denominación aparece literalmente en el artículo 1 del Decreto 4.805.
- La fecha de conversión es la fecha efectiva de pago. Una corrida no puede reutilizar silenciosamente la tasa de emisión, cierre del mes o configuración general.
- Comedores y comidas servidas se validan como modalidad, pero no se valoran con el evaluador monetario.
- Ingreso o egreso a mitad de mes, incapacidad superior a doce meses, relaciones múltiples y pagos retroactivos requieren reglas adicionales antes de automatizar una reducción.
- El core no sustituye la revisión legal de convenios colectivos más favorables.

## Consecuencias

- Cestaticket deja de ser una fila libre o una deducción asociada a la segunda quincena.
- Los montos y tasas quedan reproducibles y auditables.
- Las ausencias protegidas no dependen de que el empleado tenga estado `activo` el día de la corrida.
- Las excepciones de efectivo fallan si carecen de causa o evidencia requerida.
- Producción seguirá sin depender del paquete hasta que exista una migración explícita y compatible.
