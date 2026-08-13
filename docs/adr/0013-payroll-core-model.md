# ADR 0013: Core de nómina independiente de legislación y plataforma

- Estado: aceptado
- Fecha: 2026-08-13

## Contexto

La implementación Web actual mezcla interfaz, persistencia, reglas venezolanas y cálculo. También presupone salario mensual, quincena y conceptos concretos. Eso impide reutilizar el motor para trabajadores por hora, por día, por contrato, corridas extraordinarias o futuras jurisdicciones.

## Decisión

Crear `@kontave/payroll-domain` como núcleo puro. El modelo separa definición y relación de nómina, período, elementos configurables, entradas con origen, resultados trazables, balances y el ciclo de vida de una corrida.

El dominio depende de `monetary`, `companies` y `employees`, pero no conoce Venezuela, BCV, Supabase, HTTP, React ni documentos fiscales. Las normas nacionales se expresarán como políticas y elementos provistos por un paquete jurisdiccional posterior. Los adaptadores convertirán jornadas, ausencias, contratos y persistencia en entradas del motor.

Los resultados confirmados no se editan: un cambio posterior se representa mediante reverso, corrección o corrida retroactiva. Todo resultado monetario usa `@kontave/monetary-domain`, conserva una traza del valor exacto y cuantiza en el límite del resultado.

## Alcance inicial

El primer corte soporta compensación mensual, diaria, horaria y fija por período; conceptos recurrentes y no recurrentes; dependencias acíclicas; vigencias; cálculos fijos, cantidad por tarifa, porcentajes y sumatorias; conciliación; y workflow auditable.

Balances acumulados, retroactividad entre corridas, prorrateo, calendarios, legislación venezolana y persistencia se implementarán encima de estos contratos, no dentro del motor genérico.

## Consecuencias

- El Web de producción permanece intacto hasta una migración explícita.
- El comportamiento venezolano deja de ser una suposición implícita del core.
- Los casos de uso podrán recalcular determinísticamente a partir de snapshots y conservar auditoría.
- Las nuevas fórmulas se modelarán como evaluadores o políticas acotadas, no como utilidades globales.
