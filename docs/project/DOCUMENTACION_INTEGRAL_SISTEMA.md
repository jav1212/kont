# Kontave — Resumen ejecutivo y documentación funcional integral

Documento único con la visión del sistema, el alcance actual de sus módulos y las propuestas de evolución.

- [Resumen ejecutivo](#resumen-ejecutivo)
- [Índice de módulos y dependencias](#catalogo)

<a id="resumen-ejecutivo"></a>

## Resumen ejecutivo

**Fecha de revisión:** 19 de septiembre de 2026.  
**Base del documento:** funcionalidades identificadas en el código y la documentación del repositorio. La disponibilidad para cada cliente depende de los módulos habilitados, sus permisos, el plan y el despliegue correspondiente. Esta revisión no certifica el funcionamiento de un entorno de producción.

### Visión ejecutiva

Kontave es una plataforma modular de gestión empresarial orientada al mercado venezolano. Reúne nómina, compras, ventas, inventario, contabilidad y gestión documental en un espacio de trabajo que permite administrar varias empresas y colaborar con usuarios autorizados.

Su propuesta de valor consiste en centralizar la información operativa, reducir la captura repetida de datos y facilitar el seguimiento de remuneraciones, existencias, transacciones y resultados contables. Incorpora funciones adaptadas al contexto local: manejo de bolívares y divisas, consulta de tasas BCV, cálculos laborales, retenciones, libros y reportes tributarios, además de un calendario de obligaciones.

La solución está dirigida a empresas, equipos administrativos, comercios y profesionales que gestionan una o varias organizaciones. Combina la aplicación Web con clientes Desktop y Mobile de desarrollo progresivo y un componente local para conectar dispositivos compatibles.

### Panorama de módulos

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

### Características por módulo

#### 1. Nómina y gestión de personal

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

#### 2. Inventario, productos y precios

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

#### 3. Compras y proveedores

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

#### 4. Ventas y punto de venta

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

#### 5. Contabilidad

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

#### 6. Gestión documental y convenios

Reúne archivos y soportes dentro del espacio de trabajo empresarial.

- Organización jerárquica de carpetas.
- Carga, registro, listado, descarga y eliminación de documentos.
- Clasificación de documentos generales o vinculados a una empresa.
- Replicación de estructuras de carpetas entre espacios de clientes autorizados.
- Tablero con indicadores de documentos, almacenamiento y cargas recientes.
- Generación de convenios de beneficios para trabajadores, individualmente o en lote.
- Inclusión de datos de la empresa, representante, trabajador, importe y fechas del convenio.
- Personalización con logo y datos opcionales del abogado; generación en PDF.

#### 7. Empresas y organizaciones

Define el contexto en el que trabajan los usuarios y se registran las operaciones.

- Administración de varias empresas, con RIF, nombre, datos fiscales, contacto y logo.
- Creación, edición y eliminación conforme a las reglas y permisos aplicables.
- Importación y exportación de empresas mediante CSV.
- Selección de la empresa activa.
- Identidad de organización con nombre y logo separados del perfil personal.
- Cambio entre espacios propios y organizaciones en las que el usuario tiene membresía.
- Selección de módulo dentro del espacio de trabajo.
- Acceso condicionado por membresía, permisos y capacidad del plan.

#### 8. Herramientas administrativas

Ofrece utilidades de consulta para la operación cotidiana.

- Consulta de tasas BCV y calculadora de conversión entre divisas y bolívares.
- Selección de monedas disponibles y consulta de tasas por fecha en los flujos que lo admiten.
- Calendario tributario SENIAT con fechas según el RIF y las obligaciones contempladas en los datos cargados.
- Exportación del calendario en formato ICS.
- Suscripción a recordatorios tributarios por correo, sujeta a la configuración del servicio de envío.
- Consulta del estado y detalle de los portales monitoreados.
- Acceso público a determinadas herramientas y acceso integrado desde la aplicación.

### Capacidades de soporte

#### Usuarios, colaboración y control de acceso

- Registro, inicio de sesión, confirmación de cuenta y recuperación de contraseña.
- Perfil personal con nombre, foto, correo y teléfono.
- Invitaciones, aceptación de membresías y administración de miembros.
- Roles y permisos para delimitar el acceso a módulos y acciones.
- Acceso por carnet con código de barras en terminales autorizadas, cuando la función está habilitada.
- Emisión, reimpresión, reemisión, revocación e impresión o descarga PDF de carnets, incluidos lotes.
- Administración y revocación de terminales y control de las sesiones de carnet.

#### Planes, suscripciones y referidos

- Consulta de planes, precios, suscripciones y estado de facturación de la plataforma.
- Límites de capacidad, incluidos empresas y empleados según el plan.
- Solicitudes de pago con datos y soporte para revisión administrativa.
- Control de acceso a módulos según suscripciones y permisos.
- Código y enlace de referido, seguimiento de referidos y consulta de créditos aplicables a facturación.

#### Configuración y experiencia de uso

- Configuración de organización, empresa y cuenta personal.
- Preferencias de apariencia e interfaz adaptable al dispositivo.
- Fecha operativa, moneda de presentación y tasa seleccionada en los flujos que consumen ese contexto.
- Búsquedas, filtros, tablas, indicadores y acciones contextuales.
- Importación y exportación en formatos específicos de cada módulo: CSV, Excel, PDF, TXT, XML o ICS.
- Mensajes de validación, confirmaciones de operación y notificaciones de errores.
- Ayuda e instrucciones para instalar la aplicación Web como PWA.

#### Administración interna de Kontave

La consola de plataforma está orientada al operador del servicio y cuenta con acceso administrativo separado.

- Resumen de clientes, empresas, empleados, pagos pendientes e indicadores de suscripción.
- Administración del estado de los espacios de clientes.
- Revisión, aprobación o rechazo de solicitudes de pago.
- Gestión de planes y suscripciones.
- Gestión de usuarios administradores.
- Consulta de correo recibido y sus adjuntos.
- Panel de errores del sistema para diagnóstico y soporte.

### Plataformas y conexión de dispositivos

| Componente | Alcance identificado | Consideración de disponibilidad |
| --- | --- | --- |
| Web | Interfaz principal de los módulos descritos, accesible desde navegador. | La habilitación efectiva depende del despliegue y del acceso del usuario. |
| PWA | Instalación de la aplicación Web en dispositivos compatibles. | No implica que todas las operaciones funcionen sin conexión. |
| Desktop | Cliente Electron con sesión, contexto de trabajo y capacidades de productos, inventario, compras, ventas y configuración, entre otras. | La cobertura nativa es progresiva; una entrada de navegación no acredita una pantalla completamente implementada. |
| Mobile | Cliente Expo/React Native con sesión, espacios de trabajo, navegación, calculadora BCV y capacidades compartidas. | La cobertura depende del destino; no se presupone equivalencia total con Web ni publicación en tiendas. |
| Device Manager | Aplicación local Windows para emparejamiento y comunicación con dispositivos compatibles, incluidos lectores. | Los modelos y protocolos requieren soporte y validación específicos. |

El sistema contempla lectores USB tipo teclado para determinados flujos Web y lectores conectados mediante el componente local. La arquitectura permite ampliar los adaptadores a otros equipos; eso no constituye una garantía de soporte actual para cualquier balanza o impresora fiscal.

### Alcance y evolución

El repositorio muestra una plataforma con ocho áreas funcionales principales y capacidades compartidas para administración, colaboración y operación comercial. La documentación histórica que enumera solamente Nómina, Inventario y Documentos no describe por completo la estructura funcional actual.

La revisión identifica implementación, pero no sustituye una validación de despliegue, una prueba funcional integral ni una revisión de vigencia normativa. Las menciones a impuestos, formatos y cálculos describen funciones del software; no certifican cumplimiento automático. No se ha verificado transmisión directa de declaraciones al SENIAT.

La integración de catálogo con D3xD está documentada como propuesta de arquitectura y queda fuera del alcance disponible descrito. La cobertura nativa, los periféricos y las funciones condicionadas por configuración deben presentarse con su estado específico.

### Fuentes internas de verificación

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

---

<a id="catalogo"></a>

## Índice de módulos y dependencias

[Resumen ejecutivo de Kontave](#resumen-ejecutivo)

**Revisión:** 19 de septiembre de 2026. Este catálogo complementa el resumen ejecutivo con documentos de alcance actual y evolución propuesta. Su base es el repositorio; no certifica despliegues ni pruebas funcionales de producción.

### Módulos de negocio

| Documento | Contenido |
| --- | --- |
| [Nómina y personal](#nomina) | Empleados, remuneraciones, beneficios, retenciones y soportes. |
| [Inventario, productos y precios](#inventario) | Catálogo, existencias, costos, movimientos, cierres y reportes. |
| [Compras y proveedores](#compras) | Adquisiciones, impuestos, importaciones e imputación de inventario. |
| [Ventas y punto de venta](#ventas) | Clientes, documentos comerciales, POS y evolución de caja y cobros. |
| [Contabilidad](#contabilidad) | Planes, cuentas, períodos, asientos, integraciones y estados financieros. |
| [Documentos y convenios](#documentos) | Archivos, carpetas, convenios y evolución del control documental. |
| [Empresas y organizaciones](#empresas-organizaciones) | Identidad, espacios de trabajo y gestión de varias empresas. |
| [Herramientas administrativas](#herramientas) | Divisas, calendario tributario, recordatorios y estado de portales. |

### Modos sectoriales

| Documento | Base actual | Evolución planteada |
| --- | --- | --- |
| [Modo Restaurante](#modo-restaurante) | Plantilla de inventario, departamentos y campos propios del sector. | Mesas, comandas, cocina, recetas, consumo de insumos y gestión comercial. |
| [Modo Farmacia](#modo-farmacia) | Plantilla sectorial y perfil de importación de inventario de un POS compatible. | Lotes, vencimientos, trazabilidad, catálogo estructurado y controles operativos. |

Un modo sectorial adapta y amplía los módulos comunes. La selección del sector no demuestra que todo el proceso especializado esté implementado. Los campos personalizados de lote, vencimiento o refrigeración tampoco crean por sí mismos controles operativos.

El registro de plantillas también contiene supermercado, panadería, repuestos, ferretería, tienda de ropa, licorería y otro/personalizado. Son configuraciones de inventario existentes; no se presentan aquí como aplicaciones sectoriales completas. Véase el [registro de plantillas](../../src/modules/inventory/backend/domain/sector-template.ts).

### Capacidades de soporte

| Documento | Contenido |
| --- | --- |
| [Usuarios, colaboración y acceso](#usuarios-acceso) | Membresías, roles, permisos, carnets y terminales. |
| [Planes y suscripciones](#suscripciones) | Capacidad, acceso comercial y solicitudes de pago del servicio. |
| [Referidos](#referidos) | Invitaciones comerciales, seguimiento y créditos. |
| [Administración de la plataforma](#administracion) | Operación interna, clientes, pagos, correo e incidencias. |
| [Plataformas, configuración y dispositivos](#plataformas-dispositivos) | Web, PWA, Desktop, Mobile, preferencias y equipos compatibles. |

### Cómo interpretar los documentos

- **Actual verificado:** existe evidencia de la función o configuración en el código enlazado; su disponibilidad efectiva depende del despliegue, permisos y módulos habilitados.
- **Límite:** comportamiento que no se ha acreditado o que no debe inferirse de otra función existente.
- **Propuesta:** ampliación para evaluar; no equivale a implementación ni a un requisito ya aprobado.
- **P1/P2/P3:** orden sugerido de evaluación dentro de cada documento. No representa un calendario global ni una estimación de esfuerzo.
- **Criterios de aceptación:** condiciones sugeridas para validar una futura entrega, no pruebas ejecutadas durante esta revisión.

Cada documento describe objetivo, usuarios, funciones actuales, flujo de referencia, límites, propuestas y decisiones pendientes. Los modos sectoriales añaden detalle donde una plantilla existente podría confundirse con un proceso completo.

### Dependencias para planificar la evolución

| Capacidad | Dependencias que deben coordinarse |
| --- | --- |
| Lotes y vencimientos de farmacia | Inventario como dueño del saldo por lote; Compras para recibir y Ventas para registrar salidas. El primer flujo debe cubrir entrada y salida, no sólo agregar campos al catálogo. |
| Recetas de restaurante | Definición de recetas, rendimientos y unidades; consumo trazable en Inventario a partir del evento de Venta acordado. |
| Mesas, comandas y cocina | Operación sectorial coordinada con Ventas; caja, cobros y turnos son capacidades comerciales compartidas. |
| Conciliación y cuentas por cobrar/pagar | Documentos de Compras y Ventas, movimientos de pago y reglas de Contabilidad. |
| Aprobaciones y auditoría | Permisos de Usuarios y acceso, más reglas y registros del módulo propietario. |
| Nuevos clientes y equipos | Matriz de funciones por plataforma, contratos comunes y validación del hardware específico. |

Estas dependencias sirven para discutir alcance. No crean decisiones de arquitectura ni autorizan cambios de comportamiento. Las funciones propuestas deben concretarse en requisitos, diseño y validación antes de implementar.

---

<a id="nomina"></a>

## Nómina y personal


**Revisión:** 19 de septiembre de 2026. **Estado:** capacidades presentes en el repositorio, sin certificación de despliegue. Las ampliaciones siguientes son propuestas para validar; no son compromisos de entrega ni brechas exhaustivas.

### Objetivo y usuarios

Administrar empleados, remuneraciones y beneficios por empresa, con historial y soportes de cálculo.

**Usuarios:** Administración de personal, responsables de nómina y contadores.

### Alcance actual verificado

- Empleados: registro, edición, baja, estado, cambios de cédula, historial salarial e importación CSV.
- Nómina quincenal: asignaciones, deducciones, bonos, conversión de divisas y desglose por trabajador; borrador, confirmación, desconfirmación e historial.
- Cesta Ticket, Bono Socioeconómico y Bonificaciones con flujos y soportes propios; recibos y resúmenes PDF.
- Vacaciones y utilidades completas o fraccionadas, prestaciones, liquidaciones, aportes patronales, AR-I y reportes mensuales ISLR PDF/XML.

### Flujo actual de referencia

Seleccionar empresa y período → revisar empleados y tasas → preparar conceptos → comprobar el detalle → confirmar → consultar historial y emitir soportes.

### Límites del alcance

No se ha acreditado ejecución de pagos bancarios ni presentación automática de declaraciones. Las calculadoras y exportaciones no equivalen a esas operaciones.

### Evolución propuesta

P1, P2 y P3 indican orden sugerido de evaluación, no fechas aprobadas.

| Prioridad | Capacidad propuesta | Resultado esperado |
| --- | --- | --- |
| P1 | Revisión y aprobación de nómina antes de confirmar | Separar preparación y aprobación, guardar observaciones e identificar quién autorizó cada versión. |
| P2 | Preparación y conciliación de pagos | Definir formatos bancarios y registrar resultados por empleado, evitando marcar como pagado un archivo simplemente exportado. |
| P3 | Portal del trabajador | Permitir consulta de recibos propios y solicitudes, con permisos limitados al titular. |

### Criterios de aceptación de la evolución

Estos criterios se aplicarán al diseñar e implementar las ampliaciones; no representan pruebas ejecutadas.

- Una modificación posterior a la aprobación exige nueva revisión.
- La confirmación repetida no debe crear pagos o registros duplicados.
- Cada recibo debe poder relacionarse con empleado, período y versión de cálculo.

### Decisiones pendientes

Resolver responsables de aprobación, formatos bancarios, tratamiento de correcciones y alcance del autoservicio.

La evolución debe conservar aislamiento por organización y empresa, permisos, consistencia de importes cuando aplique y compatibilidad con los consumidores existentes. Las conexiones con otros módulos deben acordarse antes de implementar.

### Evidencia y documentos relacionados

- [app/%28app%29/payroll](../../app/%28app%29/payroll)
- [src/modules/payroll](../../src/modules/payroll)
- [app/api/payroll](../../app/api/payroll)
- [Resumen ejecutivo del sistema](#resumen-ejecutivo).

---

<a id="inventario"></a>

## Inventario, productos y precios


**Revisión:** 19 de septiembre de 2026. **Estado:** capacidades presentes en el repositorio, sin certificación de despliegue. Las ampliaciones siguientes son propuestas para validar; no son compromisos de entrega ni brechas exhaustivas.

### Objetivo y usuarios

Controlar catálogo, cantidades, costos y movimientos, con trazabilidad por empresa y período.

**Usuarios:** Encargados de almacén, compras, ventas y administración.

### Alcance actual verificado

- Productos con códigos, unidades, departamentos, estado, información tributaria, existencias y costo promedio.
- Precio fijo o recargo sobre costo; consulta de información de compras y precios; importación CSV de productos y Excel de inventario.
- Operaciones, movimientos, entradas, salidas, ajustes y sus generadores; compras pendientes de imputación y cierres.
- Tablero, reportes de saldos e inventario y libros de entradas, salidas e inventarios; reporte ISLR identificado como artículo 177.

### Flujo actual de referencia

Configurar catálogo → registrar o importar existencias y compras → procesar operaciones → revisar movimientos y valoración → emitir reportes → cerrar período.

### Límites del alcance

La interfaz revisada ofrece mercancía y promedio ponderado. No se presume disponibilidad actual de PEPS, producción, reservas por almacén o trazabilidad por lote.

### Evolución propuesta

P1, P2 y P3 indican orden sugerido de evaluación, no fechas aprobadas.

| Prioridad | Capacidad propuesta | Resultado esperado |
| --- | --- | --- |
| P1 | Lotes, vencimientos y estados de disponibilidad | Modelar cantidades por lote y separar mercancía disponible, bloqueada y vencida; base necesaria para el modo farmacia. |
| P2 | Almacenes y transferencias | Identificar origen y destino y controlar transferencias sin alterar la existencia total de la empresa. |
| P2 | Conteo físico y conciliación | Guardar conteos, diferencias y autorización de ajustes con su evidencia. |
| P3 | Reposición asistida | Proponer compras usando mínimos, consumo y tiempos de abastecimiento. |

### Criterios de aceptación de la evolución

Estos criterios se aplicarán al diseñar e implementar las ampliaciones; no representan pruebas ejecutadas.

- Los saldos por lote o almacén deben reconciliarse con el saldo del producto.
- Una operación repetida no debe duplicar el movimiento.
- Toda diferencia de conteo debe conservar motivo y responsable.

### Decisiones pendientes

Definir necesidad de múltiples almacenes, unidades fraccionadas, lotes y reglas de autorización.

La evolución debe conservar aislamiento por organización y empresa, permisos, consistencia de importes cuando aplique y compatibilidad con los consumidores existentes. Las conexiones con otros módulos deben acordarse antes de implementar.

### Evidencia y documentos relacionados

- [app/%28app%29/inventory](../../app/%28app%29/inventory)
- [src/modules/inventory](../../src/modules/inventory)
- [docs/inventory-product-import.md](../../docs/inventory-product-import.md)
- [Resumen ejecutivo del sistema](#resumen-ejecutivo).

---

<a id="compras"></a>

## Compras y proveedores


**Revisión:** 19 de septiembre de 2026. **Estado:** capacidades presentes en el repositorio, sin certificación de despliegue. Las ampliaciones siguientes son propuestas para validar; no son compromisos de entrega ni brechas exhaustivas.

### Objetivo y usuarios

Registrar adquisiciones y sus impuestos, soportes y efectos en inventario.

**Usuarios:** Compradores, administración, almacén y contabilidad.

### Alcance actual verificado

- Proveedores con RIF, contactos y estado; consulta por período y archivo histórico de compras.
- Facturas y notas de crédito/débito; preparación y confirmación; monedas, tasas, descuentos y recargos.
- IVA, impuestos adicionales, retenciones IVA/ISLR e IGTF en los flujos correspondientes; comprobantes PDF, TXT IVA y XML ISLR.
- Importación CSV asistida y de libro de compras; registro rápido del encabezado, imputación posterior de productos y entradas manuales.

### Flujo actual de referencia

Seleccionar proveedor → registrar o importar documento → revisar impuestos y productos → completar imputación cuando corresponda → confirmar → consultar movimientos y comprobantes.

### Límites del alcance

No se ha acreditado OCR de facturas PDF, un circuito completo de órdenes de compra ni pago bancario de obligaciones.

### Evolución propuesta

P1, P2 y P3 indican orden sugerido de evaluación, no fechas aprobadas.

| Prioridad | Capacidad propuesta | Resultado esperado |
| --- | --- | --- |
| P1 | Órdenes y recepción parcial | Relacionar lo solicitado, recibido y facturado; conservar cantidades pendientes y diferencias. |
| P2 | Cuentas por pagar | Registrar vencimientos, abonos y saldos por documento con conciliación. |
| P3 | Comparación de proveedores | Comparar precio, plazo y cumplimiento sobre datos documentados. |

### Criterios de aceptación de la evolución

Estos criterios se aplicarán al diseñar e implementar las ampliaciones; no representan pruebas ejecutadas.

- Una recepción parcial debe dejar el saldo pendiente correcto.
- La relación compra-recepción debe impedir imputaciones duplicadas.
- Una nota o reversión debe conservar referencia al documento de origen.

### Decisiones pendientes

Definir aprobación por importe, recepción previa a factura, tolerancias y monedas de pago.

La evolución debe conservar aislamiento por organización y empresa, permisos, consistencia de importes cuando aplique y compatibilidad con los consumidores existentes. Las conexiones con otros módulos deben acordarse antes de implementar.

### Evidencia y documentos relacionados

- [app/%28app%29/purchases](../../app/%28app%29/purchases)
- [src/modules/purchases](../../src/modules/purchases)
- [docs/purchasing-csv-import.md](../../docs/purchasing-csv-import.md)
- [Resumen ejecutivo del sistema](#resumen-ejecutivo).

---

<a id="ventas"></a>

## Ventas y punto de venta


**Revisión:** 19 de septiembre de 2026. **Estado:** capacidades presentes en el repositorio, sin certificación de despliegue. Las ampliaciones siguientes son propuestas para validar; no son compromisos de entrega ni brechas exhaustivas.

### Objetivo y usuarios

Registrar operaciones comerciales y ventas de mostrador con clientes, documentos y precios.

**Usuarios:** Vendedores, operadores POS y responsables comerciales.

### Alcance actual verificado

- Clientes, tablero por período y archivo histórico; facturas y notas de entrega.
- Creación y edición según estado; borrador, confirmación y anulación; canal administrativo o POS.
- Líneas de productos o servicios, precios, descuentos, recargos, IVA, monedas, tasas, crédito y vencimiento.
- POS con consulta por departamentos y códigos de barras; precio temporal cuando corresponde; PDFs y reporte quincenal IGTF Forma 99021.

### Flujo actual de referencia

Seleccionar cliente y productos o servicios → revisar precio, moneda e impuestos → preparar documento → confirmar → consultar o emitir soporte.

### Límites del alcance

El POS no acredita una suite completa de caja: no se verificaron turnos, arqueos, conciliación de cobros, despacho logístico ni integración fiscal certificada. Registrar vencimiento no constituye una cuenta por cobrar completa.

### Evolución propuesta

P1, P2 y P3 indican orden sugerido de evaluación, no fechas aprobadas.

| Prioridad | Capacidad propuesta | Resultado esperado |
| --- | --- | --- |
| P1 | Cobros y turnos de caja | Registrar apertura, medios de pago, cobros, devoluciones y cierre conciliado. |
| P2 | Cuentas por cobrar | Seguir abonos, saldos y antigüedad de deuda por cliente y documento. |
| P2 | Devoluciones comerciales | Relacionar devolución, ajuste financiero y movimiento físico sin perder el documento de origen. |
| P3 | Preparación y entrega de pedidos | Separar venta, preparación y entrega con estados y responsables. |

### Criterios de aceptación de la evolución

Estos criterios se aplicarán al diseñar e implementar las ampliaciones; no representan pruebas ejecutadas.

- Cada cobro debe asociarse a un documento sin duplicarse por reintento.
- El cierre debe explicar diferencias entre importe esperado y contado.
- Una anulación o devolución debe tener efectos financieros y físicos explícitos.

### Decisiones pendientes

Definir operación de caja, pagos divididos, crédito, política de devoluciones y equipos fiscales requeridos.

La evolución debe conservar aislamiento por organización y empresa, permisos, consistencia de importes cuando aplique y compatibilidad con los consumidores existentes. Las conexiones con otros módulos deben acordarse antes de implementar.

### Evidencia y documentos relacionados

- [app/%28app%29/sales](../../app/%28app%29/sales)
- [src/modules/sales](../../src/modules/sales)
- [docs/architecture/web-pos-hid-scanning.md](../../docs/architecture/web-pos-hid-scanning.md)
- [Resumen ejecutivo del sistema](#resumen-ejecutivo).

---

<a id="contabilidad"></a>

## Módulo de Contabilidad


**Revisión:** 19 de septiembre de 2026. Alcance identificado en el repositorio; sin certificación de despliegue. Las propuestas y criterios describen trabajo futuro, no pruebas ya ejecutadas.

### Propósito

Contabilidad concentra el registro y la consulta de la información contable por empresa. Permite organizar cuentas y períodos, registrar asientos manuales o generados desde operaciones conectadas, y obtener reportes basados en el balance de comprobación.

### Usuarios previstos

- Contadores y personal contable que configura el plan, revisa asientos y cierra períodos.
- Administradores que supervisan la posición financiera y las integraciones.
- Personal operativo que origina nómina o compras; sus operaciones pueden generar asientos si existen reglas activas.

El acceso se controla por permisos del módulo, incluidos permisos diferenciados para consultar, crear, actualizar y contabilizar asientos. Consulte la [política de acceso](../../src/modules/organizations/frontend/module-access-policy.ts) y el [mapa de rutas de API](../../src/modules/organizations/backend/web-api-route-access.ts).

### Capacidades actuales verificadas

- Planes de cuentas: creación, edición, eliminación e importación de planes; las cuentas admiten código, tipo, jerarquía, condición de grupo, estado y saldo inicial. Las cuentas de grupo no reciben asientos directamente. Véanse [modelo de cuenta](../../src/modules/accounting/backend/domain/account.ts), [modelo de plan](../../src/modules/accounting/backend/domain/account-chart.ts) y [pantalla de planes](../../app/%28app%29/accounting/charts/page.tsx).
- Períodos contables con rango de fechas y estado abierto o cerrado. El cierre vuelve el período inmutable para nuevos asientos contabilizados. Véanse [modelo de período](../../src/modules/accounting/backend/domain/accounting-period.ts) y [caso de uso de cierre](../../src/modules/accounting/backend/application/commands/close-accounting-period.use-case.ts).
- Libro diario con asientos en borrador y contabilizados. Antes de contabilizar, el asiento debe cuadrar débitos y créditos; una vez contabilizado se trata como inmutable. Véanse [modelo de asiento](../../src/modules/accounting/backend/domain/journal-entry.ts) y las [rutas del libro diario](../../app/%28app%29/accounting/journal).
- Balance de comprobación por empresa y período, con débitos, créditos y saldos por cuenta. Véanse [ruta](../../app/api/accounting/trial-balance/route.ts) y [consulta](../../src/modules/accounting/backend/application/queries/get-trial-balance.use-case.ts).
- Balance general y estado de resultados construidos a partir del balance de comprobación, agrupando las cuentas por tipo y mostrando una discrepancia de cuadratura. La interfaz permite generar PDF de esos reportes. Véanse [pantalla](../../app/%28app%29/accounting/financial-statements/page.tsx) y [constructor de estados](../../src/modules/accounting/frontend/utils/financial-statements.ts).
- Reglas de integración que indican las cuentas de débito y crédito, el importe de origen y una descripción para cada fuente. El registro de integración conserva el resultado de cada intento: exitoso, omitido o con error. Véanse [reglas](../../src/modules/accounting/backend/domain/integration-rule.ts) y [registro](../../src/modules/accounting/backend/domain/integration-log.ts).
- Integración automática disponible para la confirmación de nómina y de facturas de compra/inventario, condicionada a que exista un período abierto y reglas activas. Si la integración falla, se registra el intento y la operación de origen no se revierte por ese fallo. Véanse [integración de nómina](../../src/modules/accounting/backend/application/commands/process-payroll-integration.use-case.ts) e [integración de compras](../../src/modules/accounting/backend/application/commands/process-inventory-purchase-integration.use-case.ts).
- Tablero con período activo, cuentas, asientos recientes, reglas activas, errores recientes de integración y un resumen de posición financiera. Véase la [pantalla principal](../../app/%28app%29/accounting/page.tsx).

### Flujo operativo actual

1. Se crea o importa un plan de cuentas y se configuran sus cuentas.
2. Se abre un período con fechas de inicio y fin.
3. El usuario registra un asiento manual, o una operación de nómina o compra dispara reglas de integración configuradas.
4. El asiento queda en borrador o se contabiliza cuando cuadra y pertenece a un período abierto.
5. El equipo consulta el libro diario, el balance de comprobación y los estados financieros.
6. Al terminar el ciclo, se cierra el período para impedir nuevas contabilizaciones dentro de él.

### Límites del alcance actual

- Los estados financieros son presentaciones calculadas desde el balance de comprobación; este documento no los presenta como declaraciones regulatorias ni como sustituto de una revisión profesional.
- Las fuentes declaradas por el modelo de asiento son manual, nómina e inventario. La integración automática verificada cubre nómina y compras de inventario; otras fuentes requieren reglas y procesos que aún no están acreditados aquí.
- El módulo registra los resultados de integración, pero la resolución de errores depende de que el usuario revise reglas, cuentas y períodos configurados.
- No se ha acreditado en esta revisión la transmisión directa de declaraciones o libros a organismos externos.

### Propuestas pendientes

Las prioridades son orientativas y no constituyen un compromiso de entrega. Cualquier requisito fiscal, contable o de auditoría debe validarse con el responsable profesional y el marco aplicable antes de implementarlo.

#### P1 — Completar control operativo y conciliación

- Conciliación asistida entre bancos, documentos comerciales y asientos, con diferencias identificables y evidencia de resolución.
- Reintento controlado de integraciones fallidas y una vista que explique qué regla, cuenta o período impidió el asiento.
- Flujos de corrección trazables para asientos contabilizados, usando reversos y referencias al documento original.

**Criterios de aceptación:** una conciliación debe conservar el vínculo entre partidas; un reintento no puede duplicar un asiento; una corrección debe dejar visibles el asiento original, el reverso y el motivo.

#### P2 — Ampliar reportes y automatización

- Reportes comparativos por período y centro o dimensión contable, si se define un modelo de dimensiones.
- Plantillas de asientos recurrentes con control de período y aprobación.
- Integraciones adicionales desde ventas, gastos u otras operaciones, cada una con idempotencia, reglas explícitas y registro de resultados.

**Criterios de aceptación:** cada reporte debe revelar su período y filtros; las plantillas no deben contabilizar fuera de un período abierto; cada origen integrado debe poder rastrearse hasta sus asientos.

#### P3 — Colaboración y cierre avanzado

- Circuito de preparación, revisión y aprobación de cierre por roles.
- Exportaciones configurables para el trabajo del contador y auditorías internas.
- Indicadores de calidad del cierre, como asientos pendientes, cuentas sin clasificación y diferencias sin resolver.

**Criterios de aceptación:** las aprobaciones deben registrar autor, fecha y decisión; las exportaciones deben preservar los filtros aplicados; los indicadores deben enlazar a la partida que los origina.

### Decisiones pendientes

- Qué catálogo, formatos y reportes son necesarios para cada tipo de empresa y quién valida su uso.
- Si se incorporarán dimensiones analíticas y cuál será su relación con cuentas, documentos y períodos.
- Qué fuentes operativas se integrarán primero y qué política se aplicará para reversiones, reintentos y aprobaciones.

### Referencias internas

- [Rutas Web de Contabilidad](../../app/%28app%29/accounting)
- [API de Contabilidad](../../app/api/accounting)
- [Módulo de negocio](../../src/modules/accounting)
- [Resumen ejecutivo](#resumen-ejecutivo)

---

<a id="documentos"></a>

## Documentos y convenios


**Revisión:** 19 de septiembre de 2026. **Estado:** capacidades presentes en el repositorio, sin certificación de despliegue. Las ampliaciones siguientes son propuestas para validar; no son compromisos de entrega ni brechas exhaustivas.

### Objetivo y usuarios

Organizar archivos empresariales y generar convenios de beneficios para trabajadores.

**Usuarios:** Administración, contadores y responsables de personal.

### Alcance actual verificado

- Carpetas jerárquicas y archivos generales o asociados a empresa; carga, registro, listado, descarga y eliminación.
- Replicación autorizada de estructuras de carpetas entre espacios de clientes.
- Tablero de documentos, almacenamiento y cargas recientes.
- Convenios individuales o por lote con empresa, representante, trabajador, beneficio, importe y fechas; logo, datos opcionales de abogado y PDF.

### Flujo actual de referencia

Seleccionar empresa o ámbito general → organizar carpetas → cargar y consultar archivos; para convenios, seleccionar trabajadores → completar condiciones → generar PDF.

### Límites del alcance

No se ha acreditado firma electrónica, control formal de versiones, OCR o aprobación documental.

### Evolución propuesta

P1, P2 y P3 indican orden sugerido de evaluación, no fechas aprobadas.

| Prioridad | Capacidad propuesta | Resultado esperado |
| --- | --- | --- |
| P1 | Versiones e historial documental | Conservar versiones y autor de cada cambio sin sobrescribir silenciosamente el soporte. |
| P2 | Revisión y vencimientos | Añadir estados de revisión, responsables y avisos asociados a fechas. |
| P3 | Firma electrónica | Evaluar un proveedor y definir evidencia de firma, consentimiento y conservación. |

### Criterios de aceptación de la evolución

Estos criterios se aplicarán al diseñar e implementar las ampliaciones; no representan pruebas ejecutadas.

- Una nueva versión debe conservar la anterior y su identidad.
- Los permisos deben verificarse también al descargar una versión histórica.
- Generar un PDF no debe marcarlo como firmado.

### Decisiones pendientes

Definir tipos documentales, retención, acceso, aprobación y necesidad real de firma.

La evolución debe conservar aislamiento por organización y empresa, permisos, consistencia de importes cuando aplique y compatibilidad con los consumidores existentes. Las conexiones con otros módulos deben acordarse antes de implementar.

### Evidencia y documentos relacionados

- [app/%28app%29/documents](../../app/%28app%29/documents)
- [src/modules/documents](../../src/modules/documents)
- [Resumen ejecutivo del sistema](#resumen-ejecutivo).

---

<a id="empresas-organizaciones"></a>

## Empresas y organizaciones


**Revisión:** 19 de septiembre de 2026. **Estado:** capacidades presentes en el repositorio, sin certificación de despliegue. Las ampliaciones siguientes son propuestas para validar; no son compromisos de entrega ni brechas exhaustivas.

### Objetivo y usuarios

Mantener identidad y contexto de trabajo de varias empresas y organizaciones.

**Usuarios:** Propietarios, administradores y profesionales con varios clientes.

### Alcance actual verificado

- Empresas con RIF, nombre, datos fiscales, contacto y logo; creación, edición, eliminación y CSV conforme a permisos.
- Selección de empresa activa y módulos habilitados.
- Organización con nombre y logo independientes del perfil personal.
- Cambio entre espacios propios y organizaciones con membresía, con controles de permisos y capacidad.

### Flujo actual de referencia

Acceder a un espacio autorizado → seleccionar empresa → elegir módulo → operar con ese contexto → cambiar de espacio cuando corresponda.

### Límites del alcance

No se debe equiparar organización con empresa ni perfil personal. La disponibilidad observada en código no certifica despliegue.

### Evolución propuesta

P1, P2 y P3 indican orden sugerido de evaluación, no fechas aprobadas.

| Prioridad | Capacidad propuesta | Resultado esperado |
| --- | --- | --- |
| P1 | Alta guiada de empresa y sector | Validar datos y presentar los efectos de la plantilla antes de aplicarla. |
| P2 | Consolidación de gestión | Consultar indicadores de varias empresas autorizadas con reglas explícitas de moneda y período. |
| P3 | Estructuras empresariales | Evaluar sucursales y grupos cuando existan necesidades comprobadas. |

### Criterios de aceptación de la evolución

Estos criterios se aplicarán al diseñar e implementar las ampliaciones; no representan pruebas ejecutadas.

- Cambiar de empresa debe actualizar datos y permisos de forma coherente.
- Una consolidación no debe incluir empresas sin acceso.
- Aplicar una plantilla debe preservar información previa o explicar su sustitución.

### Decisiones pendientes

Definir relación de sucursales, propiedad de datos y alcance de consolidación.

La evolución debe conservar aislamiento por organización y empresa, permisos, consistencia de importes cuando aplique y compatibilidad con los consumidores existentes. Las conexiones con otros módulos deben acordarse antes de implementar.

### Evidencia y documentos relacionados

- [app/%28app%29/companies](../../app/%28app%29/companies)
- [app/%28app%29/settings/organization](../../app/%28app%29/settings/organization)
- [docs/architecture/web-organization-workspace.md](../../docs/architecture/web-organization-workspace.md)
- [Resumen ejecutivo del sistema](#resumen-ejecutivo).

---

<a id="herramientas"></a>

## Herramientas administrativas


**Revisión:** 19 de septiembre de 2026. **Estado:** capacidades presentes en el repositorio, sin certificación de despliegue. Las ampliaciones siguientes son propuestas para validar; no son compromisos de entrega ni brechas exhaustivas.

### Objetivo y usuarios

Facilitar consultas recurrentes de divisas, fechas tributarias y disponibilidad de portales.

**Usuarios:** Administración, contadores y usuarios de herramientas públicas.

### Alcance actual verificado

- Tasas BCV, conversión entre divisas y bolívares y selección de monedas disponibles.
- Consulta por fecha en los flujos que la admiten.
- Calendario SENIAT según RIF y obligaciones cargadas; exportación ICS.
- Suscripciones a recordatorios por correo y consulta del estado de portales monitoreados; acceso público a determinadas herramientas.

### Flujo actual de referencia

Seleccionar herramienta → indicar moneda, fecha o RIF → consultar resultados → exportar calendario o configurar recordatorios según la función.

### Límites del alcance

La cobertura temporal depende de los datos disponibles y los recordatorios de la configuración de envío. No se acredita presentación de declaraciones.

### Evolución propuesta

P1, P2 y P3 indican orden sugerido de evaluación, no fechas aprobadas.

| Prioridad | Capacidad propuesta | Resultado esperado |
| --- | --- | --- |
| P1 | Visibilidad de actualización y cobertura | Mostrar fecha de actualización, período cubierto y ausencia de datos sin confundirla con ausencia de obligaciones. |
| P2 | Seguimiento interno de obligaciones | Asignar responsables, estados y soportes de cumplimiento registrados por el usuario. |
| P3 | Alertas configurables | Definir canales, anticipación y preferencias por empresa. |

### Criterios de aceptación de la evolución

Estos criterios se aplicarán al diseñar e implementar las ampliaciones; no representan pruebas ejecutadas.

- Un período sin datos no debe presentarse como libre de obligaciones.
- Una actualización del calendario debe poder distinguirse del dato anterior.
- Marcar una tarea como hecha no debe indicar que fue declarada por el sistema.

### Decisiones pendientes

Definir fuentes, responsables de actualización, cobertura por año y canales de aviso.

La evolución debe conservar aislamiento por organización y empresa, permisos, consistencia de importes cuando aplique y compatibilidad con los consumidores existentes. Las conexiones con otros módulos deben acordarse antes de implementar.

### Evidencia y documentos relacionados

- [app/%28app%29/tools](../../app/%28app%29/tools)
- [src/modules/tools](../../src/modules/tools)
- [Resumen ejecutivo del sistema](#resumen-ejecutivo).

---

<a id="modo-restaurante"></a>

## Modo Restaurante


**Revisión:** 19 de septiembre de 2026. Plantilla sectorial existente y ampliaciones propuestas; sin certificación de despliegue. Los criterios de aceptación no representan pruebas ejecutadas.

### Propósito

El modo Restaurante es una plantilla sectorial para configurar el inventario de una empresa de alimentos y bebidas. Su función actual es adaptar el catálogo de productos y sus departamentos iniciales; no constituye todavía un sistema operativo completo de restaurante.

### Usuarios previstos

- Administradores que crean la empresa y seleccionan su sector.
- Encargados de inventario que mantienen insumos, existencias, costos y departamentos.
- Personal de compras que usa el catálogo para registrar o importar información de inventario.

### Capacidades actuales verificadas

- Al aplicar el sector `restaurante`, el sistema guarda el sector de la empresa y crea, si aún no existen, los departamentos sugeridos: Carnes, Vegetales, Lácteos, Bebidas, Condimentos y Desechables. Véase la [plantilla sectorial](../../src/modules/inventory/backend/domain/sector-template.ts) y el [caso de aplicación](../../src/modules/companies/backend/application/commands/apply-sector-template.use-case.ts).
- La plantilla propone unidades de medida como unidad, kg, g, litro y caja; productos de tipo mercancía; y costo promedio ponderado como método de valuación predeterminado. Estos son valores iniciales configurables, no reglas exclusivas del sector.
- El catálogo añade los campos de producto `Proveedor Habitual` y `Requiere Refrigeración`, este último con valores Sí y No. Estos datos se almacenan como campos personalizados del producto y se muestran junto con columnas habituales de inventario. Véanse el [modelo de producto](../../src/modules/inventory/backend/domain/product.ts), el [campo dinámico](../../src/modules/inventory/frontend/components/custom-field-input.tsx) y la [pantalla de productos](../../app/%28app%29/inventory/products/page.tsx).
- El negocio conserva las capacidades generales de inventario disponibles para la empresa, como catálogo, departamentos, movimientos, importación y reportes. Véanse las [rutas de inventario](../../app/%28app%29/inventory) y la [documentación de importación](../inventory-product-import.md).

### Flujo operativo actual

1. Un administrador elige Restaurante al configurar la empresa.
2. El sistema guarda la configuración sectorial y agrega los departamentos sugeridos que no existan.
3. El encargado registra o importa productos, asigna departamento, unidad, costo y los campos adicionales disponibles.
4. Las operaciones de inventario y los reportes generales usan ese catálogo.

### Límites del alcance actual

- La plantilla organiza datos de inventario; no crea mesas, zonas, turnos, comandas, recetas, producción de platos, cocina ni delivery.
- `Requiere Refrigeración` es un dato de producto. No activa monitoreo de temperatura, alertas ni controles de cadena de frío.
- `Proveedor Habitual` no reemplaza una gestión de proveedores, órdenes ni recepción por producto.
- La configuración sugerida no impone una clasificación, unidad o método de costo: el negocio debe revisar la configuración antes de operar.

### Propuestas pendientes

Las prioridades son orientativas y requieren descubrimiento con los restaurantes que usarán el producto.

#### P1 — Operación de salón y cocina

- Plano de mesas y zonas con estados operativos.
- Comandas por mesa, retiro o entrega, con ítems, modificadores y notas de preparación.
- Pantalla de cocina por estación y ciclo de estado de la comanda.

**Criterios de aceptación:** una comanda debe identificar su canal y responsable; sus cambios deben ser visibles para salón y cocina; el cierre no debe permitir cobrar dos veces la misma comanda.

#### P2 — Recetas, costo y consumo

- Fichas técnicas de platos, ingredientes, rendimiento y merma.
- Descuento de insumos desde una venta confirmada, con reverso cuando se anule o corrija la operación.
- Reporte de costo teórico frente a consumo y costo real.

**Criterios de aceptación:** cada descuento debe referenciar venta y receta; una modificación o anulación debe ajustar el consumo sin duplicarlo; el reporte debe indicar período, supuestos y diferencias.

#### P3 — Gestión comercial

- Turnos de caja, propinas, descuentos autorizados y arqueo.
- Canales de venta y entrega con estados, tiempos y responsables.
- Indicadores de ventas, rotación de insumos, merma y desempeño por zona o estación.

**Criterios de aceptación:** cada movimiento de caja debe ser auditable; las métricas deben permitir filtrar por fecha y local; las correcciones deben preservar el historial original.

### Decisiones pendientes

- Si el primer alcance prioriza servicio en mesa, mostrador, retiro, entrega o una combinación.
- Cómo se modelarán recetas, rendimientos, sustituciones, mermas y unidades de consumo.
- Qué integración se necesitará entre venta, inventario, cocina y contabilidad, y en qué momento se confirma cada efecto.

Las funciones compartidas de caja y cobros se describen en [Ventas](#ventas); el consumo y la valoración deben coordinarse con [Inventario](#inventario). Las prioridades sectoriales no sustituyen esas dependencias.

### Referencias internas

- [Plantillas de sector](../../src/modules/inventory/backend/domain/sector-template.ts)
- [Aplicación de plantilla](../../src/modules/companies/backend/application/commands/apply-sector-template.use-case.ts)
- [Inventario](../../app/%28app%29/inventory)
- [Configuración de inventario](../../app/%28app%29/settings/inventory-config/page.tsx)
- [Resumen ejecutivo](#resumen-ejecutivo)

---

<a id="modo-farmacia"></a>

## Modo Farmacia


**Revisión:** 19 de septiembre de 2026. Plantilla e importación existentes y ampliaciones propuestas; sin certificación de despliegue. Los criterios de aceptación no representan pruebas ejecutadas.

### Propósito

El modo Farmacia adapta el catálogo e importación de inventario a una farmacia. Actualmente aporta una plantilla de configuración y un perfil para reconocer determinadas exportaciones de inventario; no es todavía un sistema completo de dispensación, trazabilidad por lote ni control de productos sujetos a regulación.

### Usuarios previstos

- Administradores que seleccionan el sector al configurar la empresa.
- Encargados de inventario que mantienen catálogo, existencias, costos y departamentos.
- Personal que migra un inventario desde un POS de farmacia compatible con el perfil disponible.

### Capacidades actuales verificadas

- Al aplicar el sector `farmacia`, el sistema registra el sector y crea, cuando no existen, los departamentos sugeridos: Medicamentos, Perfumería, Misceláneos, Suplementos, Equipos Médicos y Fórmulas Infantiles. Véanse la [plantilla](../../src/modules/inventory/backend/domain/sector-template.ts) y el [caso de aplicación](../../src/modules/companies/backend/application/commands/apply-sector-template.use-case.ts).
- La plantilla propone productos de mercancía, unidades unidad/caja/paquete y valuación por promedio ponderado. También configura los campos personalizados Línea, Fecha Últ. Compra, Fecha Últ. Venta y Último Proveedor, junto con columnas de catálogo relacionadas. Son valores de configuración, no un modelo de trazabilidad clínica o farmacéutica.
- El asistente de importación contiene el perfil `Farmacia POS (inventario general)`. Reconoce un conjunto de encabezados de una exportación, mapea producto, departamento, existencia, costo, IVA y moneda, y conserva otros valores como campos personalizados. El perfil se describe como una foto de inventario sin movimientos de entrada y salida. Véase [perfil de importación](../../src/modules/inventory/frontend/utils/import-format-profiles.ts) y el [asistente](../../src/modules/inventory/frontend/components/excel-import-wizard.tsx).
- Entre los encabezados que el perfil puede conservar como datos importados aparecen lote, fecha de vencimiento, acción terapéutica, controlados, ubicación, mínimos, máximos, equivalentes y otros campos del origen. Esa importación guarda valores de catálogo; por sí sola no crea controles, alertas, restricciones de venta ni trazabilidad de movimientos por lote.
- La empresa puede usar las funciones generales de productos, departamentos, importación, movimientos y reportes del inventario. Véanse las [rutas de inventario](../../app/%28app%29/inventory) y la [documentación de importación](../inventory-product-import.md).

### Flujo operativo actual

1. El administrador selecciona Farmacia para la empresa.
2. El sistema aplica la configuración sectorial y agrega departamentos sugeridos sin duplicar los existentes.
3. El encargado crea productos o carga un archivo y el asistente propone el perfil de Farmacia POS si coincide con sus encabezados.
4. Se revisa el mapeo, se importan los valores de producto e inventario soportados y se continúa con las operaciones generales de inventario.

### Límites del alcance actual

- Los valores `lote` y `fecha vence` que puedan llegar desde la importación son campos personalizados del producto. No representan lotes independientes con saldo, vencimiento o historial de movimientos.
- El campo `controlados` importado no implementa validación de identidad, receta, autorización, cupos ni reportes regulatorios.
- La importación es una instantánea del catálogo e inventario descrito por el perfil. No reconstruye automáticamente un historial de compras, ventas, devoluciones o ajustes.
- No se afirma cumplimiento de obligaciones sanitarias, farmacéuticas, fiscales o de privacidad. Cualquier flujo que las afecte debe validarse antes de ponerse en producción.

### Propuestas pendientes

Las prioridades son orientativas. Las decisiones funcionales y cualquier requisito normativo deben validarse con el negocio y los responsables correspondientes antes de implementarlas.

#### P1 — Trazabilidad de inventario y vencimiento

- Modelo de lote por recepción, con cantidad disponible, fecha de vencimiento, ubicación y estado.
- Selección de lote en salidas y devoluciones, con historial por producto y lote.
- Alertas operativas de próximos vencimientos, productos vencidos y existencias bajo mínimo.

**Criterios de aceptación:** cada entrada y salida debe poder rastrearse a un lote cuando el producto lo requiera; una alerta debe indicar producto, lote, fecha y cantidad; una corrección debe usar reverso o ajuste trazable.

#### P2 — Catálogo y operación de farmacia

- Catálogo estructurado para presentación, equivalentes, principio activo u otros atributos que el negocio valide.
- Búsqueda por código, nombre, código de barras y equivalencias aprobadas por el negocio.
- Políticas configurables para productos que requieren revisión o autorización operativa, sin asumir reglas legales predefinidas.

**Criterios de aceptación:** los atributos deben tener fuente y responsable definidos; las equivalencias deben mostrar su relación y vigencia; una política debe registrar quién la configuró y cuándo se aplicó.

#### P3 — Integraciones y analítica

- Importaciones incrementales con previsualización de cambios, errores y conciliación con el catálogo existente.
- Integración de ventas y compras con el inventario por lote, cuando el origen y la política de confirmación estén definidos.
- Indicadores de rotación, días de inventario, vencimientos, quiebres y diferencias de conteo.

**Criterios de aceptación:** una importación incremental debe informar altas, cambios y conflictos antes de confirmar; las integraciones no deben duplicar movimientos al reintentarse; los indicadores deben declarar período y filtros.

### Decisiones pendientes

- Qué atributos de catálogo son esenciales, cuáles son informativos y cuáles requieren un control de cambios.
- Qué productos requieren seguimiento por lote y qué política tendrá el sistema ante vencidos, devoluciones y ajustes.
- Qué exportaciones de POS serán soportadas, cómo se versionarán sus perfiles y quién validará los datos importados.
- Qué responsabilidades y validaciones operativas se requieren antes de implementar funciones para productos con condiciones especiales.

El primer alcance de lotes debe coordinar entrada, saldo y salida entre [Compras](#compras), [Inventario](#inventario) y [Ventas](#ventas). Las integraciones adicionales planteadas en P3 no posponen esa trazabilidad mínima. Los atributos y equivalencias propuestos son información de catálogo; no deben producir recomendaciones terapéuticas ni sustituciones automáticas de medicamentos.

### Referencias internas

- [Plantillas de sector](../../src/modules/inventory/backend/domain/sector-template.ts)
- [Perfiles de importación](../../src/modules/inventory/frontend/utils/import-format-profiles.ts)
- [Asistente de importación](../../src/modules/inventory/frontend/components/excel-import-wizard.tsx)
- [Inventario](../../app/%28app%29/inventory)
- [Resumen ejecutivo](#resumen-ejecutivo)

---

<a id="usuarios-acceso"></a>

## Usuarios, colaboración y acceso


**Revisión:** 19 de septiembre de 2026. **Estado:** capacidades presentes en el repositorio, sin certificación de despliegue. Las ampliaciones siguientes son propuestas para validar; no son compromisos de entrega ni brechas exhaustivas.

### Objetivo y usuarios

Controlar quién entra al sistema y qué acciones puede realizar en cada espacio.

**Usuarios:** Propietarios, administradores, miembros y operadores de terminal.

### Alcance actual verificado

- Registro, inicio de sesión, confirmación y recuperación de contraseña; perfil personal.
- Invitaciones, aceptación, administración de miembros y roles/permisos.
- Acceso por carnet en navegadores autorizados cuando la función está habilitada.
- Emisión, reimpresión, reemisión, revocación y PDF de carnets; administración de terminales y sesiones.

### Flujo actual de referencia

Dar acceso al miembro → asignar rol → ingresar por un mecanismo habilitado → aplicar permisos por contexto → revocar acceso cuando corresponda.

### Límites del alcance

Un carnet es una credencial de acceso; no constituye control de asistencia laboral ni identificación biométrica. Las condiciones operativas específicas se mantienen en la documentación de seguridad enlazada.

### Evolución propuesta

P1, P2 y P3 indican orden sugerido de evaluación, no fechas aprobadas.

| Prioridad | Capacidad propuesta | Resultado esperado |
| --- | --- | --- |
| P1 | Revisión periódica de accesos | Mostrar quién conserva permisos y registrar una revisión administrativa. |
| P2 | Vigencia temporal de permisos | Programar altas y bajas de acceso sin cambiar retrospectivamente la autoría de operaciones. |
| P3 | Aprobación de acciones sensibles | Separar autorización de ejecución para acciones seleccionadas. |

### Criterios de aceptación de la evolución

Estos criterios se aplicarán al diseñar e implementar las ampliaciones; no representan pruebas ejecutadas.

- La revocación debe impedir nuevas solicitudes protegidas conforme al contrato de sesión.
- Una denegación debe aplicarse también en la API.
- Los cambios de permisos deben conservar responsable y fecha.

### Decisiones pendientes

Definir roles reales, acciones sensibles, accesos temporales y alcance del uso de carnets.

La evolución debe conservar aislamiento por organización y empresa, permisos, consistencia de importes cuando aplique y compatibilidad con los consumidores existentes. Las conexiones con otros módulos deben acordarse antes de implementar.

### Evidencia y documentos relacionados

- [app/%28app%29/settings/members](../../app/%28app%29/settings/members)
- [app/%28app%29/settings/roles](../../app/%28app%29/settings/roles)
- [app/%28app%29/settings/access](../../app/%28app%29/settings/access)
- [docs/security/web-barcode-access.md](../../docs/security/web-barcode-access.md)
- [Resumen ejecutivo del sistema](#resumen-ejecutivo).

---

<a id="suscripciones"></a>

## Planes y suscripciones


**Revisión:** 19 de septiembre de 2026. **Estado:** capacidades presentes en el repositorio, sin certificación de despliegue. Las ampliaciones siguientes son propuestas para validar; no son compromisos de entrega ni brechas exhaustivas.

### Objetivo y usuarios

Gestionar acceso comercial, capacidad y solicitudes de pago del servicio Kontave.

**Usuarios:** Propietarios de organizaciones y administración de la plataforma.

### Alcance actual verificado

- Consulta de planes, precios, suscripciones y estado de facturación.
- Capacidades como número de empresas y empleados según plan.
- Solicitudes de pago con datos y soporte para revisión.
- Control de acceso por suscripción y permisos; consola administrativa para planes y suscripciones.

### Flujo actual de referencia

Consultar plan → solicitar pago con soporte → revisión administrativa → consultar estado de suscripción y capacidades.

### Límites del alcance

La facturación del servicio Kontave es distinta de la facturación de ventas de las empresas usuarias. No se acredita cobro recurrente automático mediante pasarela.

### Evolución propuesta

P1, P2 y P3 indican orden sugerido de evaluación, no fechas aprobadas.

| Prioridad | Capacidad propuesta | Resultado esperado |
| --- | --- | --- |
| P1 | Historial claro de cambios de plan | Presentar fecha efectiva, capacidad y efectos de cada cambio. |
| P2 | Pasarela y conciliación | Evaluar un proveedor, registrar confirmaciones verificadas y resolver eventos repetidos. |
| P3 | Autoservicio de renovación | Ofrecer renovación y avisos con políticas de suspensión y recuperación explícitas. |

### Criterios de aceptación de la evolución

Estos criterios se aplicarán al diseñar e implementar las ampliaciones; no representan pruebas ejecutadas.

- Subir un comprobante no debe equivaler a pago aprobado.
- Una notificación repetida de pago no debe duplicar la aplicación.
- El acceso debe reflejar el período y estado de suscripción autorizado.

### Decisiones pendientes

Definir reglas comerciales, prorrateos, gracia, reembolsos y medios de pago.

La evolución debe conservar aislamiento por organización y empresa, permisos, consistencia de importes cuando aplique y compatibilidad con los consumidores existentes. Las conexiones con otros módulos deben acordarse antes de implementar.

### Evidencia y documentos relacionados

- [app/%28app%29/settings/billing](../../app/%28app%29/settings/billing)
- [src/modules/billing](../../src/modules/billing)
- [app/admin/page.tsx](../../app/admin/page.tsx)
- [Resumen ejecutivo del sistema](#resumen-ejecutivo).

---

<a id="referidos"></a>

## Referidos


**Revisión:** 19 de septiembre de 2026. **Estado:** capacidades presentes en el repositorio, sin certificación de despliegue. Las ampliaciones siguientes son propuestas para validar; no son compromisos de entrega ni brechas exhaustivas.

### Objetivo y usuarios

Facilitar invitaciones comerciales y la consulta de créditos por referidos.

**Usuarios:** Usuarios que recomiendan el servicio y administración comercial.

### Alcance actual verificado

- Código y enlace de referido para registro.
- Acciones para copiar o compartir el enlace.
- Consulta de referidos, indicadores y créditos.
- La interfaz describe la aplicación de créditos a facturación; sus condiciones deben revisarse junto al flujo comercial.

### Flujo actual de referencia

Consultar código → compartir enlace por iniciativa del usuario → seguir registros y créditos → revisar su aplicación a facturación.

### Límites del alcance

No se presume un programa de comisiones pagaderas en efectivo ni condiciones comerciales irrevocables a partir de la interfaz.

### Evolución propuesta

P1, P2 y P3 indican orden sugerido de evaluación, no fechas aprobadas.

| Prioridad | Capacidad propuesta | Resultado esperado |
| --- | --- | --- |
| P1 | Trazabilidad de créditos | Explicar origen, condición de asignación y aplicación de cada movimiento. |
| P2 | Gestión de incidencias | Permitir revisión de atribución y reversión justificada. |
| P3 | Campañas | Configurar vigencias y condiciones sin alterar retroactivamente créditos ya reconocidos. |

### Criterios de aceptación de la evolución

Estos criterios se aplicarán al diseñar e implementar las ampliaciones; no representan pruebas ejecutadas.

- Cada crédito debe tener un origen verificable.
- Un mismo evento no debe asignar el beneficio dos veces.
- El usuario debe distinguir crédito pendiente, disponible y aplicado si se introducen esos estados.

### Decisiones pendientes

Definir elegibilidad, evento que genera crédito, límites y tratamiento de anulaciones.

La evolución debe conservar aislamiento por organización y empresa, permisos, consistencia de importes cuando aplique y compatibilidad con los consumidores existentes. Las conexiones con otros módulos deben acordarse antes de implementar.

### Evidencia y documentos relacionados

- [app/%28app%29/settings/referrals](../../app/%28app%29/settings/referrals)
- [src/modules/referrals](../../src/modules/referrals)
- [Resumen ejecutivo del sistema](#resumen-ejecutivo).

---

<a id="administracion"></a>

## Administración de la plataforma


**Revisión:** 19 de septiembre de 2026. **Estado:** capacidades presentes en el repositorio, sin certificación de despliegue. Las ampliaciones siguientes son propuestas para validar; no son compromisos de entrega ni brechas exhaustivas.

### Objetivo y usuarios

Operar el servicio Kontave y dar seguimiento a clientes, suscripciones e incidencias.

**Usuarios:** Administradores internos de plataforma.

### Alcance actual verificado

- Indicadores de clientes, empresas, empleados, pagos e ingresos recurrentes cuando el dato está disponible.
- Gestión de estado de espacios de clientes, planes, suscripciones y administradores.
- Revisión, aprobación y rechazo de solicitudes de pago.
- Consulta de correo recibido y adjuntos; panel de errores del sistema.

### Flujo actual de referencia

Acceder a la consola administrativa → revisar pendientes e indicadores → ejecutar la acción autorizada → consultar resultado y seguimiento.

### Límites del alcance

La consola interna no es el módulo de administración de una empresa cliente. No se acredita una mesa de ayuda completa con tickets y acuerdos de servicio.

### Evolución propuesta

P1, P2 y P3 indican orden sugerido de evaluación, no fechas aprobadas.

| Prioridad | Capacidad propuesta | Resultado esperado |
| --- | --- | --- |
| P1 | Auditoría de acciones administrativas | Conservar actor, motivo y cambios relevantes, con acceso controlado a la consulta. |
| P2 | Gestión de incidencias | Relacionar errores, solicitudes y resolución sin exponer datos de otros clientes. |
| P3 | Indicadores de servicio | Medir tiempos de revisión y resolución con definiciones claras. |

### Criterios de aceptación de la evolución

Estos criterios se aplicarán al diseñar e implementar las ampliaciones; no representan pruebas ejecutadas.

- Las acciones internas deben respetar el alcance autorizado del administrador.
- Un reporte de soporte debe evitar exponer credenciales.
- La resolución de una incidencia debe conservar su historial.

### Decisiones pendientes

Definir responsabilidades, niveles de acceso interno y datos que puede consultar soporte.

La evolución debe conservar aislamiento por organización y empresa, permisos, consistencia de importes cuando aplique y compatibilidad con los consumidores existentes. Las conexiones con otros módulos deben acordarse antes de implementar.

### Evidencia y documentos relacionados

- [app/admin/page.tsx](../../app/admin/page.tsx)
- [src/modules/system-errors](../../src/modules/system-errors)
- [Resumen ejecutivo del sistema](#resumen-ejecutivo).

---

<a id="plataformas-dispositivos"></a>

## Plataformas, configuración y dispositivos


**Revisión:** 19 de septiembre de 2026. **Estado:** capacidades presentes en el repositorio, sin certificación de despliegue. Las ampliaciones siguientes son propuestas para validar; no son compromisos de entrega ni brechas exhaustivas.

### Objetivo y usuarios

Ofrecer acceso Web y nativo con preferencias y conexión a equipos compatibles.

**Usuarios:** Usuarios finales, operadores de POS y responsables de instalación.

### Alcance actual verificado

- Web con interfaz adaptable y PWA instalable; configuración de apariencia y contexto operativo en los flujos que lo consumen.
- Desktop Electron con sesión, contexto y capacidades empresariales de cobertura progresiva.
- Mobile Expo/React Native con sesión, espacios, navegación, calculadora BCV y capacidades compartidas.
- Device Manager Windows para conexión y emparejamiento local; lectores HID o mediante adaptador compatible según el flujo.

### Flujo actual de referencia

Elegir cliente compatible → iniciar sesión → seleccionar contexto → configurar preferencias → emparejar dispositivo si se necesita → validar el flujo concreto.

### Límites del alcance

No se presume paridad completa entre clientes, funcionamiento integral sin conexión, publicación en tiendas ni compatibilidad universal con impresoras y balanzas.

### Evolución propuesta

P1, P2 y P3 indican orden sugerido de evaluación, no fechas aprobadas.

| Prioridad | Capacidad propuesta | Resultado esperado |
| --- | --- | --- |
| P1 | Matriz de cobertura y equipos validados | Publicar funciones por plataforma y modelos/protocolos probados con evidencia. |
| P2 | Instalación y diagnóstico guiados | Mostrar estado de conexión y acciones de recuperación por dispositivo. |
| P3 | Operación sin conexión acotada | Definir operaciones permitidas, cola, reconciliación y conflictos antes de implementar. |

### Criterios de aceptación de la evolución

Estos criterios se aplicarán al diseñar e implementar las ampliaciones; no representan pruebas ejecutadas.

- Una función no soportada debe indicarse antes de iniciar la operación.
- Reconectar un lector no debe duplicar lecturas ya procesadas.
- Una futura sincronización debe resolver conflictos de permisos, saldo y versión.

### Decisiones pendientes

Definir plataformas prioritarias, hardware objetivo, distribución y necesidad efectiva de trabajo sin conexión.

La evolución debe conservar aislamiento por organización y empresa, permisos, consistencia de importes cuando aplique y compatibilidad con los consumidores existentes. Las conexiones con otros módulos deben acordarse antes de implementar.

### Evidencia y documentos relacionados

- [apps/desktop/README.md](../../apps/desktop/README.md)
- [apps/mobile/README.md](../../apps/mobile/README.md)
- [apps/device-bridge/README.md](../../apps/device-bridge/README.md)
- [app/%28app%29/settings](../../app/%28app%29/settings)
- [Resumen ejecutivo del sistema](#resumen-ejecutivo).
