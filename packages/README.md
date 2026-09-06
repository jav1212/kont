# Paquetes compartidos

Los paquetes se agrupan por capacidad arquitectónica. La carpeta facilita la navegación; el nombre público `@kontave/*` permanece estable para desacoplar consumidores y ubicación física.

## Grupos

- `business/`: bounded contexts de operaciones y políticas empresariales. Es una clasificación física, no un paquete ni un contexto agregado.
- `capabilities/`: capacidades funcionales transversales con responsabilidad propia, actualmente autenticación, control de acceso y perfil.
- `kernel/`: composition root portable, contratos del cliente, ensamblaje remoto y sesión global de workspace. El kernel coordina capacidades, pero no es un bounded context de negocio.
- `experience/`: capacidades portables percibidas por el usuario, actualmente feedback, interacción, navegación, preferencias y configuración.
- `platform/`: capacidades técnicas e integraciones con el entorno, actualmente conectividad, actualizaciones, observabilidad y dispositivos.
- `portal-monitoring/`: disponibilidad y tiempos de respuesta de portales públicos externos; no representa la salud interna de Kontave.
- `capabilities/auth/`: dominio, casos de uso y adaptadores de autenticación.
- `business/billing/`: facturación, suscripciones, capacidades, consumo y adaptadores organizacionales.
- `ui/`: catálogo visual único `@kontave/ui`, contratos y tokens portables,
  marca y adaptadores internos por renderer. Consulte su
  [README](ui/README.md) y el [estándar del sistema de diseño](../docs/standards/design-system.md).
- `history/`: historial Memento portable para borradores y adaptadores de presentación por plataforma.
- `capabilities/organizations/`: espacios de trabajo, membresías, empresas accesibles y sus adaptadores.
- `capabilities/delegated-access/`: grants de acceso entre organizaciones, scopes, vigencia, asignaciones y resolución de caminos delegados.
- `business/products/`: identidad de productos, SKU, códigos de barras, categorías, unidades base, ciclo de vida y utilidades de prueba.
- `business/unit-economics/`: read model histórico de costos adquiridos, ventas realizadas y agregados económicos por producto.
- `business/inventory/`: operaciones y efectos físicos, ubicaciones, lotes, conteos, posiciones y valuación de existencias.
- `business/fiscal/`: facturas y notas fiscales, partes, líneas, ajustes, determinaciones tributarias, pagos aplicados, totales y evidencia de emisión.
- `business/taxation/`: perfiles tributarios de productos, reglas temporales, políticas venezolanas de IVA e IGTF e integración con documentos fiscales.
- `business/purchasing/`: proveedores, órdenes, recepciones, conciliación de facturas, devoluciones y publicación idempotente hacia inventario.
- `business/sales/`: clientes, acuerdos comerciales, despachos, conciliación fiscal, devoluciones y publicación idempotente hacia inventario.
- `monetary/`: dinero exacto, monedas, tasas de cambio, resolución y caché de tasas, conversión, redondeo, distribución de residuos y adaptadores de proveedores cambiarios.
- `business/payroll/`: definiciones, relaciones, periodos, elementos, entradas, cálculo trazable, balances, corridas, políticas legales venezolanas y utilidades de prueba de nómina.

## Reglas

1. Un dominio no importa frameworks ni infraestructura.
2. Una capa de aplicación depende de su dominio y declara puertos.
3. Los adaptadores implementan puertos y pueden depender de SDKs concretos.
4. Las aplicaciones consumen paquetes por su nombre público, nunca mediante rutas físicas relativas.
5. No se crea un grupo o paquete sin una responsabilidad y un consumidor reales.
6. `business`, `capabilities`, `kernel`, `experience` y `platform` son clasificaciones arquitectónicas, no módulos genéricos ni capas obligatorias para toda capacidad.
7. La ubicación física puede cambiar sin renombrar el paquete público; los cambios de API y los movimientos estructurales se migran por separado.
8. La unidad predeterminada de workspace es el bounded context o capacidad; `domain`, `application`, `adapters` y `testing` son módulos internos.
9. Un workspace adicional requiere una frontera demostrable de runtime, distribución, dependencias, propiedad, seguridad o ciclo de entrega.
10. Las superficies especializadas se publican mediante subpath exports; no se crea un manifest únicamente para representar una capa hexagonal.
