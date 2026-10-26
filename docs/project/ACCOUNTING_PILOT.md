# Guion de piloto contable

Estado: preparado para ejecución humana; todavía no ejecutado. No usarlo para contabilizar operaciones reales hasta que contabilidad apruebe la plantilla y el usuario autorice los cambios ambiguos del reporte W3.

## Preparación

1. Seleccionar una empresa piloto y confirmar que su plan activo, períodos, cuentas e integraciones son los esperados.
2. Registrar antes de la prueba: plan activo y versión, total de cuentas, balance de comprobación por período y reglas activas de nómina, compras y CxP.
3. Confirmar con el contador la plantilla VEN-NIF, la moneda funcional VES, monedas de reporte y roles de cuentas especiales.
4. Abrir en Web el plan de cuentas, cuentas, centros de costo, clases de gasto, atributos, auxiliares y cuatro páginas de configuración. Confirmar permisos de solo lectura y escritura con dos perfiles autorizados.

## Recorrido

1. Consultar el plan y buscar una cuenta por código y nombre.
2. Crear una cuenta de prueba en un borrador; editarla y convertirla de detalle a agrupadora cuando no tenga movimientos ni hijos.
3. Probar recodificación de una rama con una cuenta hija y verificar que IDs, asientos y balance no cambian.
4. Registrar un centro de costo, clase de gasto, atributo y valor de atributo; asociarlos a una cuenta.
5. Consultar fuentes auxiliares de clientes, proveedores, empleados y beneficiarios; crear un auxiliar propio.
6. Revisar tipos de comprobante, monedas de reporte, perfil y cuentas especiales.
7. Ejecutar una nómina y una compra de prueba; verificar asiento, balance y referencias de cuenta. No inactivar cuentas usadas por integraciones.
8. Crear y reversar un asiento manual de prueba; confirmar D9 para cuenta inactiva solo después de desactivar una cuenta de prueba sin integración.

## Criterios de salida

- Cada comando muestra éxito o error accionable y registra actor, correlación e idempotencia.
- La concurrencia con versión anterior se rechaza sin sobrescribir cambios.
- Ningún flujo modifica `account_id`; asientos e integraciones siguen enlazados.
- Los balances antes/después coinciden, salvo las transacciones controladas del recorrido.
- Nómina, compras y CxP completan publicación y reversa según sus reglas.
- Contabilidad documenta defectos, confirma los datos ambiguos por separado y aprueba explícitamente la salida del piloto.

## Evidencia a adjuntar al cerrar el piloto

Fecha y empresa (identificador enmascarado), perfiles/roles, versión del plan, pasos ejecutados, IDs de comandos de prueba, resultados de smokes, balances antes/después, incidencias y aprobación del contador. No registrar tokens ni credenciales.
