# Paquetes compartidos

Los paquetes se agrupan por capacidad arquitectónica. La carpeta facilita la navegación; el nombre público `@kontave/*` permanece estable para desacoplar consumidores y ubicación física.

## Grupos

- `auth/`: dominio, casos de uso y adaptadores de autenticación.
- `billing/`: facturación, suscripciones, capacidades, consumo y adaptadores organizacionales.
- `devices/`: contratos, núcleo portable, adaptadores de plataforma y utilidades de prueba para dispositivos.
- `ui/`: contratos visuales, tokens, marca y componentes por tecnología de renderizado.
- `platform/`: contratos y capacidades transversales de integración entre aplicaciones y backend.
- `history/`: historial Memento portable para borradores y adaptadores de presentación por plataforma.
- `organizations/`: espacios de trabajo, membresías, empresas accesibles y sus adaptadores.
- `products/`: identidad de productos, SKU, códigos de barras, categorías, unidades base, ciclo de vida y utilidades de prueba.
- `inventory/`: operaciones y efectos físicos, ubicaciones, lotes, conteos, posiciones y valuación de existencias.
- `fiscal/`: facturas y notas fiscales, partes, líneas, ajustes, determinaciones tributarias, pagos aplicados, totales y evidencia de emisión.
- `taxation/`: perfiles tributarios de productos, reglas temporales, políticas venezolanas de IVA e IGTF e integración con documentos fiscales.
- `purchasing/`: proveedores, órdenes, recepciones, conciliación de facturas, devoluciones y publicación idempotente hacia inventario.
- `sales/`: clientes, acuerdos comerciales, despachos, conciliación fiscal, devoluciones y publicación idempotente hacia inventario.
- `monetary/`: dinero exacto, monedas, tasas de cambio, resolución y caché de tasas, conversión, redondeo, distribución de residuos y adaptadores de proveedores cambiarios.
- `observability/`: contratos de incidentes, políticas portables, adaptadores operativos y dobles de prueba.
- `client-feedback/`: feedback semántico portable, resolución de fallos inesperados y dobles de prueba para clientes.
- `client-interaction/`: bloqueo global portable mediante leases concurrentes y estado semántico observable.

- `payroll/`: definiciones, relaciones, periodos, elementos, entradas, cálculo trazable, balances, corridas, políticas legales venezolanas y utilidades de prueba de nómina.

## Reglas

1. Un dominio no importa frameworks ni infraestructura.
2. Una capa de aplicación depende de su dominio y declara puertos.
3. Los adaptadores implementan puertos y pueden depender de SDKs concretos.
4. Las aplicaciones consumen paquetes por su nombre público, nunca mediante rutas físicas relativas.
5. No se crea un grupo o paquete sin una responsabilidad y un consumidor reales.
