# Integración de productos D3xD con Kontave

## Estado

- Tipo: propuesta de arquitectura
- Alcance inicial: catálogo de productos D3xD → Kontave
- Dirección: unidireccional
- Sistema maestro inicial: D3xD
- Cliente local: Kontave Local Agent

## Contexto

Algunos clientes necesitan operar D3xD y Kontave en paralelo durante una migración o por necesidades comerciales. Los productos creados o modificados en D3xD deben reflejarse en Kontave sin introducir dependencias de D3xD dentro de los dominios de Productos, Precios, Tributación o Inventario.

La documentación pública de D3xD confirma que Gisin3 utiliza MySQL Server, permite importar productos desde archivos tabulados y dispone de un módulo de Tienda Virtual capaz de publicar productos y departamentos en una base remota. No se encontró una API pública documentada.

Referencias:

- [Manual oficial de Gisin3](https://www.d3xd.com/productos/p0/manuales/manual_producto.pdf)
- [Guía general de instalación](https://sistemasd3xd.com/descargas/guia_install_todos.pdf)
- [Instalación de MySQL 5.6 para D3xD](https://www.d3xd.com/descargas/mysql_all/Instalacion_MySql_Vers_5.6.x.pdf)
- [Instalación de MySQL 8 para D3xD](https://www.d3xd.com/descargas/mysql_all/Instalacion_MySql_Vers_8.pdf)

## Decisión propuesta

Implementar un agente local que consulte la base MySQL de D3xD con una cuenta dedicada de solo lectura y envíe cambios a una API de integraciones de Kontave mediante HTTPS.

```text
D3xD
  │
  ▼
MySQL local
  │ usuario restringido de lectura
  ▼
Kontave Local Agent
  │ cola local + HTTPS + idempotencia
  ▼
Bounded context de Integraciones
  │ contratos canónicos
  ├── Productos
  ├── Precios
  ├── Tributación
  └── Inventario, en una fase posterior
```

D3xD seguirá siendo propietario de los campos sincronizados durante la primera etapa. Kontave no escribirá directamente en las tablas de D3xD.

## Relación con Device Bridge

El conector se distribuirá en la misma aplicación local que hoy aloja Device Bridge, pero no formará parte del `DeviceManager` ni del core de dispositivos.

La aplicación evolucionará conceptualmente a `Kontave Local Agent`:

```text
Kontave Local Agent
├── Device Manager
│   ├── lectores de códigos
│   ├── puertos seriales
│   └── otros dispositivos
└── Integraciones
    └── D3xD
        ├── conexión MySQL
        ├── detección de cambios
        ├── cola local
        └── sincronización HTTPS
```

El ejecutable, instalador, bandeja de Windows y mecanismos comunes pueden compartirse. Los fallos deben permanecer aislados: una caída de MySQL no puede detener lectores de códigos y un error serial no puede detener la sincronización de D3xD.

No se requiere un renombrado inmediato de `apps/device-bridge`. El cambio de nombre puede realizarse después de validar la nueva capacidad sin bloquear el desarrollo incremental.

## Descubrimiento técnico inicial

El esquema de D3xD no debe adivinarse ni codificarse a partir de nombres vistos en instalaciones ajenas. Cada familia de versión compatible debe validarse.

### Accesos necesarios

- Autorización expresa del propietario de los datos.
- Acceso al equipo Windows que aloja D3xD y MySQL.
- Cuenta normal de D3xD para consultar productos.
- Credenciales MySQL administrativas únicamente para preparar el acceso restringido.
- Empresa o base de pruebas para crear y modificar productos controlados.
- Respaldo verificable antes de cualquier prueba con escritura.

### Credencial predeterminada documentada

Los manuales de instalación de D3xD indican `1232` como contraseña recomendada o predeterminada para el usuario `root` de MySQL. Esta información sirve para recuperar administrativamente una instalación autorizada, pero constituye una debilidad de seguridad si nunca fue modificada.

Reglas obligatorias:

- Nunca incorporar `root` ni `1232` al código, instalador o configuración de Kontave.
- Nunca probar esa credencial desde Internet ni contra instalaciones no autorizadas.
- No escribir la contraseña en argumentos de consola que queden en el historial.
- Utilizar `root` solo para preparar una cuenta restringida y cerrar la sesión inmediatamente.
- No rotar la contraseña de `root` hasta confirmar si D3xD depende de ella y preparar una ventana de mantenimiento.
- Bloquear el puerto MySQL en Internet y preferir conexiones desde `localhost`.

### Procedimiento de levantamiento

1. Identificar versión de D3xD, versión de MySQL, servicio, puerto y base utilizada.
2. Inventariar tablas, vistas, claves, índices y relaciones sin modificar datos.
3. Identificar candidatos de productos, departamentos, impuestos, precios, unidades y existencias.
4. Capturar el estado de un producto ficticio autorizado.
5. Crear el producto desde la interfaz de D3xD.
6. Comparar los cambios en MySQL.
7. Modificar individualmente código, referencia, descripción, precio, impuesto y departamento.
8. Probar desactivación o eliminación desde D3xD.
9. Verificar si existe una marca de creación o modificación confiable.
10. Documentar diferencias por versión de esquema.

Las escrituras de prueba se realizan desde D3xD, no mediante SQL directo. La observación de MySQL se mantiene en modo lectura.

## Cuenta MySQL definitiva

Después del descubrimiento se creará una cuenta exclusiva, restringida a `localhost` y a las tablas o vistas necesarias.

Ejemplo ilustrativo:

```sql
CREATE USER 'kontave_sync'@'localhost'
IDENTIFIED BY 'CONTRASENA_LARGA_Y_ALEATORIA';

GRANT SELECT
ON `base_d3xd`.`productos`
TO 'kontave_sync'@'localhost';

GRANT SELECT
ON `base_d3xd`.`departamentos`
TO 'kontave_sync'@'localhost';
```

Si es viable, se prefieren vistas de integración que expongan solamente las columnas requeridas. El acceso amplio de descubrimiento debe ser temporal y revocarse al finalizar.

El agente nunca recibirá permisos `INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `CREATE` ni `GRANT OPTION` sobre la base operativa.

## Vinculación del agente

Un administrador de Kontave generará un código temporal de emparejamiento. El agente lo intercambiará por una credencial de máquina asociada a una organización, empresa y conexión específicas.

Esto permite:

- revocar una instalación sin afectar a otras;
- rotar credenciales;
- evitar sesiones personales de usuario;
- identificar qué agente produjo cada operación;
- autorizar únicamente las capacidades habilitadas.

Los secretos locales se protegerán mediante mecanismos seguros de Windows. No se guardarán en archivos de texto ni se mostrarán después de configurarlos.

## Sincronización inicial

La primera lectura producirá una previsualización antes de escribir en Kontave:

- productos nuevos;
- coincidencias seguras;
- códigos o referencias duplicados;
- departamentos sin equivalencia;
- unidades desconocidas;
- monedas o impuestos no reconocidos;
- registros inválidos.

El usuario confirmará el plan de importación. Esta etapa es necesaria para evitar duplicados cuando el cliente ya tenga parte del catálogo en Kontave.

## Identidad externa

La relación no dependerá únicamente del código comercial. Cuando D3xD exponga una clave interna estable se utilizará como `externalId`.

```text
provider: d3xd
connectionId: conexión del cliente
entityType: product
externalId: identificador interno estable de D3xD
externalCode: código comercial visible
domainEntityId: UUID de producto en Kontave
```

Esto permite modificar el código sin crear un producto nuevo.

## Mapeo de campos

El mapeo definitivo dependerá del levantamiento. El objetivo inicial incluye:

| Concepto D3xD | Destino Kontave | Regla |
|---|---|---|
| Identificador interno | `externalId` | Identidad estable de integración |
| Código | SKU/código | Identificador comercial |
| Referencia | Código de barras o campo externo | Validar semántica real |
| Descripción | Nombre | Obligatorio |
| Descripción adicional | Descripción | Opcional |
| Departamento | Categoría | Requiere equivalencias |
| Precio 1 | Precio fijo | Definir moneda e IVA incluido |
| Precios 2 y 3 | Lista externa o dato archivado | No elegir automáticamente |
| Impuesto | Perfil tributario | Mapear gravado, exento u otro |
| Estado | Activo/inactivo | No eliminar físicamente |
| Existencia | Fuera de fase 1 | No sobrescribir kardex |

Productos, precios y tributación se proyectarán mediante sus casos de uso respectivos. No se construirá una entidad de producto gigante para acomodar D3xD.

## Detección de cambios

### Cuando existe una marca de modificación confiable

El agente utiliza un checkpoint compuesto por fecha e identificador para evitar omitir registros con la misma resolución temporal.

```json
{
  "lastModifiedAt": "2026-08-17T14:32:10",
  "lastExternalId": "18492"
}
```

### Cuando no existe una marca confiable

El agente normaliza los campos relevantes y calcula una huella SHA-256 por producto. Solo envía registros nuevos o cuya huella cambió.

Una conciliación completa nocturna verifica que no se hayan perdido cambios. La frecuencia normal de lectura puede comenzar en 60 segundos y ajustarse según volumen y desempeño observado.

No se agregarán triggers ni columnas a las tablas de D3xD como mecanismo principal, porque eso acoplaría la integración a una base ajena y podría romper actualizaciones.

## Cola local y tolerancia a fallos

El agente utilizará SQLite para:

- checkpoints;
- huellas conocidas;
- outbox de cambios pendientes;
- confirmaciones recibidas;
- errores locales;
- datos mínimos de diagnóstico.

Si Internet no está disponible, D3xD continúa funcionando. Los cambios permanecen en la cola y se reintentan con espera progresiva. Los lotes deben ser pequeños, por ejemplo 100 registros, y cada operación debe ser idempotente.

Ejemplo de llave:

```text
d3xd:{connectionId}:{entityType}:{externalId}:{sourceHash}
```

Reenviar el mismo cambio no puede producir duplicados.

## Reglas de propiedad y conflictos

Durante la primera versión:

- D3xD controla los campos sincronizados.
- Kontave controla los campos que no provienen de D3xD.
- La interfaz identifica los campos administrados externamente.
- Una edición local conflictiva se bloquea o advierte que será sobrescrita.
- Kontave no envía cambios de regreso a D3xD.

La sincronización bidireccional no se implementará hasta definir propiedad por campo, resolución de conflictos y garantías de escritura soportadas por cada proveedor.

## Eliminaciones

Un producto que desaparezca de D3xD no se eliminará físicamente en Kontave.

1. La conciliación lo marca como ausente.
2. Una segunda observación o período de gracia confirma la ausencia.
3. Kontave lo marca como inactivo.
4. Se conservan vínculos, documentos y movimientos históricos.

## Inventario y existencias

La fase inicial sincroniza catálogo, categoría, precio, impuesto y estado. No modifica `currentStock` directamente.

Kontave mantiene un kardex auditable. Sobrescribir la existencia rompería la trazabilidad. Una fase posterior deberá leer movimientos externos e importar entradas, salidas, devoluciones y ajustes con identidad e idempotencia propias. El saldo de D3xD podrá utilizarse para conciliación, no como reemplazo silencioso del ledger.

## Alternativas sin acceso administrativo a MySQL

El orden preferido es:

1. módulo Tienda Virtual hacia una base intermedia aislada;
2. exportación periódica TXT o Excel procesada por el agente;
3. conexión administrativa existente y autorizada en MySQL Workbench;
4. inspección autorizada de la configuración local;
5. recuperación administrativa de MySQL en una ventana de mantenimiento.

La base de Tienda Virtual nunca será la base productiva de Kontave. Si D3xD requiere permisos para crear o modificar tablas, se concederán únicamente sobre una base intermedia desechable y aislada.

## Operación y observabilidad

Kontave mostrará:

- estado de conexión;
- último heartbeat;
- última sincronización;
- productos vinculados;
- pendientes y errores;
- versión del adaptador y esquema detectado;
- conciliaciones completas;
- acciones de reintento, pausa y revocación.

Cada registro debe permitir reconstruir qué recibió Kontave, qué mapeo aplicó, qué entidad resultó y por qué una operación fue omitida o falló.

## Fases de entrega

1. Descubrimiento y matriz real de campos.
2. Prueba de concepto de lectura sin escritura en Kontave.
3. Previsualización e importación inicial controlada.
4. Servicio automático, cola local e idempotencia.
5. Panel, alertas y conciliación.
6. Movimientos y existencias, solo si se requiere.

## Criterios de aceptación iniciales

- Crear un producto en D3xD lo crea una sola vez en Kontave.
- Modificarlo actualiza la misma entidad vinculada.
- Un reintento no duplica productos.
- La falta de Internet no pierde cambios.
- Un error de un producto no bloquea permanentemente el lote.
- El agente no puede escribir en MySQL.
- D3xD continúa operando si el agente está detenido.
- Las existencias y el kardex no se alteran en la fase de catálogo.
- Una actualización incompatible del esquema detiene la sincronización de manera segura.
