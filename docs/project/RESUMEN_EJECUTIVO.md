# Kontave — Resumen ejecutivo del sistema

**Fecha de revisión:** 19 de septiembre de 2026.  
**Base del documento:** funcionalidades identificadas en el código y la documentación del repositorio. La disponibilidad para cada cliente depende de los módulos habilitados, sus permisos, el plan y el despliegue correspondiente. Esta revisión no certifica el funcionamiento de un entorno de producción.

## Visión ejecutiva

Kontave es una plataforma modular de gestión empresarial orientada al mercado venezolano. Reúne nómina, compras, ventas, inventario, contabilidad y gestión documental en un espacio de trabajo que permite administrar varias empresas y colaborar con usuarios autorizados.

Su propuesta de valor consiste en centralizar la información operativa, reducir la captura repetida de datos y facilitar el seguimiento de remuneraciones, existencias, transacciones y resultados contables. Incorpora funciones adaptadas al contexto local: manejo de bolívares y divisas, consulta de tasas BCV, cálculos laborales, retenciones, libros y reportes tributarios, además de un calendario de obligaciones.

La solución está dirigida a empresas, equipos administrativos, comercios y profesionales que gestionan una o varias organizaciones. Combina la aplicación Web con clientes Desktop y Mobile de desarrollo progresivo y un componente local para conectar dispositivos compatibles.

## Panorama de módulos

| Área funcional | Alcance principal | Aporte a la gestión |
| --- | --- | --- |
| Nómina y personal | Empleados, remuneraciones, beneficios y retenciones | Organiza el procesamiento de pagos y sus soportes. |
| Inventario y productos | Catálogo, existencias, costos, movimientos y cierres | Permite conocer y seguir las entradas, salidas y valoración del inventario. |
| Compras y proveedores | Documentos de compra, impuestos e imputación de mercancía | Vincula las adquisiciones con sus proveedores, soportes y efectos en inventario. |
| Ventas y punto de venta | Clientes, documentos comerciales y operación de mostrador | Centraliza el registro y consulta de las ventas. |
| Contabilidad | Cuentas, períodos, asientos y estados financieros | Convierte registros operativos y contables en información financiera. |
| Documentos y convenios | Archivos, carpetas y generación de convenios | Organiza soportes por empresa y facilita su recuperación. |
| Empresas y organizaciones | Identidad, datos fiscales y espacios de trabajo | Permite gestionar varias empresas con un contexto de operación definido. |
| Herramientas | Divisas, calendario tributario y estado de portales | Facilita consultas recurrentes del trabajo administrativo. |

Estos módulos se apoyan en capacidades de usuarios y permisos, configuración, suscripciones, referidos, dispositivos y administración interna de la plataforma. La separación funcional no implica que todas las áreas se vendan como suscripciones independientes.

## Características por módulo

### 1. Nómina y gestión de personal

Centraliza la información del trabajador y el cálculo de remuneraciones y beneficios.

- Registro, edición y baja de empleados; identificación, cargo, salario y estado laboral.
- Importación de empleados por CSV, actualización de cédula e historial salarial.
- Cálculo de nómina quincenal con asignaciones, deducciones y bonificaciones configurables.
- Manejo del salario en bolívares y conversión de bonos expresados en dólares mediante la tasa seleccionada.
- Desglose por trabajador, totales y equivalencia de importes en divisas.
- Preparación de borradores, confirmación, desconfirmación e historial de nóminas.
- Recibos individuales y resúmenes en PDF.
- Flujos de Cesta Ticket, Bono Socioeconómico y Bonificaciones, con borradores, confirmación y soportes.
- Calculadoras de vacaciones y utilidades completas o fraccionadas, prestaciones sociales y liquidaciones.
- Cálculos de aportes patronales y tratamiento de fechas y feriados dentro de las utilidades de nómina.
- Gestión de AR-I y reportes mensuales de retenciones de ISLR en PDF y XML.
- Configuración de modalidades y beneficios, con tablero de consulta.

### 2. Inventario, productos y precios

Permite administrar el catálogo y seguir las cantidades y los costos de la mercancía.

- Registro, edición, activación y desactivación de productos.
- Código interno, código de barras, unidad, departamento y configuración tributaria del producto.
- Administración de departamentos o categorías comerciales.
- Consulta de existencias, costo promedio e información de reposición.
- Configuración de precio de venta fijo o calculado mediante recargo sobre el costo.
- Consulta de información e historial de compras y precios del producto.
- Importación de productos mediante CSV y flujos de importación de inventario desde Excel.
- Registro y consulta de operaciones, entradas, salidas y ajustes, con generadores específicos de salidas y ajustes.
- Identificación de compras pendientes de imputación al inventario.
- Historial de movimientos y seguimiento tipo kardex.
- Cierres por período y tableros de entradas, salidas y valoración.
- Reportes de inventario y saldos; libros de entradas, salidas e inventarios; reporte identificado en el sistema con el artículo 177 de ISLR.

**Alcance verificado:** la interfaz revisada ofrece mercancía y valoración por promedio ponderado. Las referencias históricas a PEPS, materias primas, productos terminados o transformaciones no se consideran aquí evidencia de disponibilidad actual de esos flujos.

### 3. Compras y proveedores

Gestiona los documentos de adquisición y su relación con proveedores, impuestos e inventario.

- Directorio de proveedores con RIF, contactos y estado.
- Registro de facturas, notas de crédito y notas de débito.
- Preparación y confirmación de documentos; consulta por período y archivo histórico.
- Operaciones en distintas monedas, con tasas de cambio, descuentos y recargos.
- IVA, impuestos adicionales, retenciones de IVA e ISLR y tratamiento de IGTF en los flujos correspondientes.
- Generación de comprobantes de retención en PDF.
- Exportaciones TXT de retenciones de IVA y XML de retenciones de ISLR para los procesos de preparación de información del SENIAT.
- Importación CSV asistida e importación de libro de compras.
- Registro rápido del encabezado de la compra y posterior imputación de sus productos al inventario.
- Entradas manuales y actualización de existencias y costo promedio al confirmar compras con afectación de inventario.

### 4. Ventas y punto de venta

Centraliza la relación comercial con clientes y el registro de ventas administrativas o de mostrador.

- Directorio de clientes.
- Facturas de venta y notas de entrega, con consulta y edición según su estado.
- Ciclo de borrador, confirmación y anulación.
- Registro de líneas de productos o servicios.
- Manejo de precios, descuentos, recargos, IVA, monedas y tasas.
- Condiciones de crédito y vencimiento en los documentos de venta.
- Punto de venta con consulta y selección de productos por departamento.
- Lectura de códigos de barras y consulta de precios; captura de precio temporal cuando corresponde.
- Generación de facturas y notas de entrega en PDF.
- Tablero de ventas por período y archivo histórico.
- Tratamiento de percepción de IGTF y reporte quincenal con PDF de la Forma 99021.

La generación de un documento PDF no acredita, por sí misma, integración con una impresora fiscal ni autorización de facturación electrónica. El registro de condiciones de crédito tampoco debe describirse como un módulo completo de cobranza.

### 5. Contabilidad

Organiza el registro contable y la consulta de resultados por empresa y período.

- Creación, importación y administración de planes de cuentas.
- Catálogo jerárquico de cuentas, grupos, naturaleza y saldos iniciales.
- Creación y cierre de períodos contables; consulta de períodos cerrados.
- Registro de asientos manuales con líneas de débito y crédito.
- Asientos en borrador y publicación al libro diario.
- Consulta del libro diario y detalle de cada asiento.
- Balance de comprobación con débitos, créditos y saldos.
- Balance general y estado de resultados, con descarga en PDF.
- Reglas de integración para generar asientos a partir de nómina y compras, con registro de resultados y flujos de reversión en los casos implementados.
- Tablero con períodos, cuentas, asientos, integraciones e indicadores financieros.

### 6. Gestión documental y convenios

Reúne archivos y soportes dentro del espacio de trabajo empresarial.

- Organización jerárquica de carpetas.
- Carga, registro, listado, descarga y eliminación de documentos.
- Clasificación de documentos generales o vinculados a una empresa.
- Replicación de estructuras de carpetas entre espacios de clientes autorizados.
- Tablero con indicadores de documentos, almacenamiento y cargas recientes.
- Generación de convenios de beneficios para trabajadores, individualmente o en lote.
- Inclusión de datos de la empresa, representante, trabajador, importe y fechas del convenio.
- Personalización con logo y datos opcionales del abogado; generación en PDF.

### 7. Empresas y organizaciones

Define el contexto en el que trabajan los usuarios y se registran las operaciones.

- Administración de varias empresas, con RIF, nombre, datos fiscales, contacto y logo.
- Creación, edición y eliminación conforme a las reglas y permisos aplicables.
- Importación y exportación de empresas mediante CSV.
- Selección de la empresa activa.
- Identidad de organización con nombre y logo separados del perfil personal.
- Cambio entre espacios propios y organizaciones en las que el usuario tiene membresía.
- Selección de módulo dentro del espacio de trabajo.
- Acceso condicionado por membresía, permisos y capacidad del plan.

### 8. Herramientas administrativas

Ofrece utilidades de consulta para la operación cotidiana.

- Consulta de tasas BCV y calculadora de conversión entre divisas y bolívares.
- Selección de monedas disponibles y consulta de tasas por fecha en los flujos que lo admiten.
- Calendario tributario SENIAT con fechas según el RIF y las obligaciones contempladas en los datos cargados.
- Exportación del calendario en formato ICS.
- Suscripción a recordatorios tributarios por correo, sujeta a la configuración del servicio de envío.
- Consulta del estado y detalle de los portales monitoreados.
- Acceso público a determinadas herramientas y acceso integrado desde la aplicación.

## Capacidades de soporte

### Usuarios, colaboración y control de acceso

- Registro, inicio de sesión, confirmación de cuenta y recuperación de contraseña.
- Perfil personal con nombre, foto, correo y teléfono.
- Invitaciones, aceptación de membresías y administración de miembros.
- Roles y permisos para delimitar el acceso a módulos y acciones.
- Acceso por carnet con código de barras en terminales autorizadas, cuando la función está habilitada.
- Emisión, reimpresión, reemisión, revocación e impresión o descarga PDF de carnets, incluidos lotes.
- Administración y revocación de terminales y control de las sesiones de carnet.

### Planes, suscripciones y referidos

- Consulta de planes, precios, suscripciones y estado de facturación de la plataforma.
- Límites de capacidad, incluidos empresas y empleados según el plan.
- Solicitudes de pago con datos y soporte para revisión administrativa.
- Control de acceso a módulos según suscripciones y permisos.
- Código y enlace de referido, seguimiento de referidos y consulta de créditos aplicables a facturación.

### Configuración y experiencia de uso

- Configuración de organización, empresa y cuenta personal.
- Preferencias de apariencia e interfaz adaptable al dispositivo.
- Fecha operativa, moneda de presentación y tasa seleccionada en los flujos que consumen ese contexto.
- Búsquedas, filtros, tablas, indicadores y acciones contextuales.
- Importación y exportación en formatos específicos de cada módulo: CSV, Excel, PDF, TXT, XML o ICS.
- Mensajes de validación, confirmaciones de operación y notificaciones de errores.
- Ayuda e instrucciones para instalar la aplicación Web como PWA.

### Administración interna de Kontave

La consola de plataforma está orientada al operador del servicio y cuenta con acceso administrativo separado.

- Resumen de clientes, empresas, empleados, pagos pendientes e indicadores de suscripción.
- Administración del estado de los espacios de clientes.
- Revisión, aprobación o rechazo de solicitudes de pago.
- Gestión de planes y suscripciones.
- Gestión de usuarios administradores.
- Consulta de correo recibido y sus adjuntos.
- Panel de errores del sistema para diagnóstico y soporte.

## Plataformas y conexión de dispositivos

| Componente | Alcance identificado | Consideración de disponibilidad |
| --- | --- | --- |
| Web | Interfaz principal de los módulos descritos, accesible desde navegador. | La habilitación efectiva depende del despliegue y del acceso del usuario. |
| PWA | Instalación de la aplicación Web en dispositivos compatibles. | No implica que todas las operaciones funcionen sin conexión. |
| Desktop | Cliente Electron con sesión, contexto de trabajo y capacidades de productos, inventario, compras, ventas y configuración, entre otras. | La cobertura nativa es progresiva; una entrada de navegación no acredita una pantalla completamente implementada. |
| Mobile | Cliente Expo/React Native con sesión, espacios de trabajo, navegación, calculadora BCV y capacidades compartidas. | La cobertura depende del destino; no se presupone equivalencia total con Web ni publicación en tiendas. |
| Device Manager | Aplicación local Windows para emparejamiento y comunicación con dispositivos compatibles, incluidos lectores. | Los modelos y protocolos requieren soporte y validación específicos. |

El sistema contempla lectores USB tipo teclado para determinados flujos Web y lectores conectados mediante el componente local. La arquitectura permite ampliar los adaptadores a otros equipos; eso no constituye una garantía de soporte actual para cualquier balanza o impresora fiscal.

## Alcance y evolución

El repositorio muestra una plataforma con ocho áreas funcionales principales y capacidades compartidas para administración, colaboración y operación comercial. La documentación histórica que enumera solamente Nómina, Inventario y Documentos no describe por completo la estructura funcional actual.

La revisión identifica implementación, pero no sustituye una validación de despliegue, una prueba funcional integral ni una revisión de vigencia normativa. Las menciones a impuestos, formatos y cálculos describen funciones del software; no certifican cumplimiento automático. No se ha verificado transmisión directa de declaraciones al SENIAT.

La integración de catálogo con D3xD está documentada como propuesta de arquitectura y queda fuera del alcance disponible descrito. La cobertura nativa, los periféricos y las funciones condicionadas por configuración deben presentarse con su estado específico.

## Fuentes internas de verificación

- [Rutas de la aplicación Web](../../app/%28app%29) y [módulos de negocio](../../src/modules): evidencia principal de pantallas, modelos y operaciones.
- [Nómina](../../app/%28app%29/payroll), [Inventario](../../app/%28app%29/inventory), [Compras](../../app/%28app%29/purchases) y [Ventas](../../app/%28app%29/sales).
- [Contabilidad](../../app/%28app%29/accounting), [Documentos](../../app/%28app%29/documents), [Herramientas](../../app/%28app%29/tools) y [Configuración](../../app/%28app%29/settings).
- [Consola administrativa](../../app/admin/page.tsx).
- [Organizaciones en Web](../architecture/web-organization-workspace.md).
- [Acceso por carnet](../security/web-barcode-access.md) y [lectura de códigos en POS](../architecture/web-pos-hid-scanning.md).
- [Importación de compras](../purchasing-csv-import.md) e [importación de productos](../inventory-product-import.md).
- [Desktop](../../apps/desktop/README.md), [Mobile](../../apps/mobile/README.md) y [Device Manager](../../apps/device-bridge/README.md).
- [Propuesta de integración D3xD](../architecture/d3xd-product-integration.md).
- [Catálogo histórico de módulos](../architecture/MODULES_CATALOG.md) y [documentación general](PROJECT_DOCUMENTATION.md): fuentes de contexto contrastadas con el código actual.
