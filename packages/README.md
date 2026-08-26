# Paquetes compartidos

Los paquetes se agrupan por capacidad arquitectónica. La carpeta facilita la navegación; el nombre público `@kontave/*` permanece estable para desacoplar consumidores y ubicación física.

## Grupos

- `kernel/`: composition root portable, contratos del cliente, ensamblaje remoto y sesión global de workspace. El kernel coordina capacidades, pero no es un bounded context de negocio.
- `experience/`: capacidades portables percibidas por el usuario, actualmente feedback, interacción, navegación, preferencias y configuración.
- `platform/`: capacidades técnicas e integraciones con el entorno, actualmente conectividad, actualizaciones, observabilidad y dispositivos.
- `portal-monitoring/`: disponibilidad y tiempos de respuesta de portales públicos externos; no representa la salud interna de Kontave.
- `auth/`: dominio, casos de uso y adaptadores de autenticación.
- `billing/`: facturación, suscripciones, capacidades, consumo y adaptadores organizacionales.
- `ui/`: contratos visuales, tokens, marca y componentes por tecnología de renderizado.
- `history/`: historial Memento portable para borradores y adaptadores de presentación por plataforma.
- `organizations/`: espacios de trabajo, membresías, empresas accesibles y sus adaptadores.
- `delegated-access/`: grants de acceso entre organizaciones, scopes, vigencia, asignaciones y resolución de caminos delegados.
- `products/`: identidad de productos, SKU, códigos de barras, categorías, unidades base, ciclo de vida y utilidades de prueba.
- `unit-economics/`: read model histórico de costos adquiridos, ventas realizadas y agregados económicos por producto.
- `inventory/`: operaciones y efectos físicos, ubicaciones, lotes, conteos, posiciones y valuación de existencias.
- `fiscal/`: facturas y notas fiscales, partes, líneas, ajustes, determinaciones tributarias, pagos aplicados, totales y evidencia de emisión.
- `taxation/`: perfiles tributarios de productos, reglas temporales, políticas venezolanas de IVA e IGTF e integración con documentos fiscales.
- `purchasing/`: proveedores, órdenes, recepciones, conciliación de facturas, devoluciones y publicación idempotente hacia inventario.
- `sales/`: clientes, acuerdos comerciales, despachos, conciliación fiscal, devoluciones y publicación idempotente hacia inventario.
- `monetary/`: dinero exacto, monedas, tasas de cambio, resolución y caché de tasas, conversión, redondeo, distribución de residuos y adaptadores de proveedores cambiarios.
- `payroll/`: definiciones, relaciones, periodos, elementos, entradas, cálculo trazable, balances, corridas, políticas legales venezolanas y utilidades de prueba de nómina.

## Reglas

1. Un dominio no importa frameworks ni infraestructura.
2. Una capa de aplicación depende de su dominio y declara puertos.
3. Los adaptadores implementan puertos y pueden depender de SDKs concretos.
4. Las aplicaciones consumen paquetes por su nombre público, nunca mediante rutas físicas relativas.
5. No se crea un grupo o paquete sin una responsabilidad y un consumidor reales.
6. `kernel`, `experience` y `platform` son clasificaciones arquitectónicas, no módulos genéricos ni capas obligatorias para toda capacidad.
7. La ubicación física puede cambiar sin renombrar el paquete público; los cambios de API y los movimientos estructurales se migran por separado.
