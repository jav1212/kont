---
name: Decisiones de disenio validadas y conformes — Modulo Inventario
description: Registro de decisiones de arquitectura y diseno del modulo inventario que fueron revisadas y aprobadas como conformes a la legislacion venezolana.
type: project
---

Decisiones de disenio confirmadas como CONFORMES al 2026-03-21:

1. **Metodo de valuacion permitido:** Solo promedio_ponderado y peps. UEPS/LIFO excluido a nivel de CHECK constraint en BD. CONFORME — el SENIAT no acepta LIFO fiscalmente.

2. **Moneda canonica en Bs:** costo_unitario siempre en Bs. costo_moneda y tasa_dolar son referencia historica. CONFORME — principio correcto para contabilidad venezolana donde la moneda funcional es el bolivar.

3. **Multi-tasa IVA en compras por linea de item:** iva_alicuota por item ('exenta'|'reducida_8'|'general_16'). CONFORME — correcto segun Art. 27 y 62 de la Ley del IVA.

4. **Estado borrador/confirmada en facturas de compra:** Solo facturas confirmadas aparecen en el libro de compras. CONFORME — correcto flujo de control.

5. **Cierre de periodo con bloqueo de movimientos:** Una vez cerrado un periodo, no se pueden registrar movimientos. CONFORME — buena practica contable.

6. **Tasa BCV usando precio 'sell':** La tasa de cambio oficial se toma del precio de venta (sell) del BCV. CONFORME — es la tasa oficial de referencia.

7. **Libro de inventarios anual:** Calcula apertura al 01/01, entradas, salidas y cierre al 31/12 por producto. CONFORME — cumple Codigo de Comercio Art. 36 y requerimiento ISLR.

8. **Reporte ISLR Art. 177 con apertura de periodo:** Incluye saldo inicial antes del periodo solicitado como fila de apertura. CONFORME con el reglamento.

9. **Autoconsumo separado con IVA:** El autoconsumo se registra con iva_venta_monto y aparece separado en el libro de ventas. CONFORME — el autoconsumo genera debito fiscal segun Art. 4 de la Ley del IVA.

**Why:** Documentar decisiones ya aprobadas para no repetir validacion en futuras sesiones.
**How to apply:** Si en futuras revisiones se detecta que alguna de estas decisiones fue modificada, re-validar inmediatamente.
