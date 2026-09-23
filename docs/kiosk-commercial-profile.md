# Perfil comercial Kiosco

Kontave Kiosco es una oferta comercial para comercios de atención rápida. Agrupa
**Ventas**, **Compras** e **Inventario** sobre el producto de Inventario ya
existente; no crea un producto operativo, tablas de inventario ni permisos
paralelos.

## Organización, empresa y acceso

La facturación pertenece a la **organización**. Por ello, una organización con
varias empresas contrata sus paquetes a nivel del espacio de trabajo y comparte
los derechos comerciales de cada paquete entre esas empresas.

El perfil operativo pertenece a la **empresa** (`operatingProfile`), no a la
organización ni a un usuario. Los valores actuales son `standard` y `kiosk`.
Cada empresa puede elegir su propia experiencia. Al seleccionar otra empresa en
la Web, el workspace conserva la selección y resuelve el inicio con el perfil
de esa empresa. Esto permite, por ejemplo, que una organización gestione una
empresa estándar y otra que opere como Kiosco sin contratar dos veces el mismo
paquete.

El perfil solo ordena la experiencia; no concede módulos, permisos ni acceso a
rutas. La suscripción activa al producto Inventario y los permisos efectivos de
la organización siguen siendo las fuentes de autorización. Un usuario sin
permiso de ventas no recibe el Punto de venta aunque la empresa use Kiosco.

Las empresas existentes y las respuestas de clientes anteriores se interpretan
como `standard` cuando el campo no está presente.

## Experiencia Web

Una empresa Kiosco abre el Punto de venta (`/sales/pos`) cuando Ventas está
disponible, la suscripción de Inventario está activa o en prueba y el usuario
tiene `sales.read` y `sales.create`. Si no se cumplen esas condiciones, la Web
elige la primera sección permitida entre Ventas, Compras e Inventario; quien
pueda consultar facturación llega a Configuración de facturación cuando el
paquete no está activo.

En la barra lateral de una empresa Kiosco, la entrada principal es **Vender** y
apunta al Punto de venta. También se muestran Ventas, Compras, Inventario y
Configuración conforme a los módulos y permisos disponibles. La sección de
Ventas nombra explícitamente **Vender** al Punto de venta y **Ventas** a su
listado.

El perfil se configura al crear o editar una empresa. Solo owner y admin pueden
cambiarlo mediante las APIs Web de empresas. Cambiarlo no transforma ni elimina
productos, movimientos, documentos o suscripciones.

## Oferta y operación comercial

La migración crea el plan `Kiosco` con código comercial `kiosk`, asociado al
producto Inventario y con los módulos anunciados `inventory`, `purchases` y
`sales`. La activación efectiva sigue siendo por producto: la suscripción de
Inventario habilita el conjunto de Compras y Ventas que deriva de él.

El plan se siembra inactivo, con precios mensual, trimestral y anual en cero y
sin límite nuevo de empresas (`max_companies` es `NULL`). Un administrador debe
definir un precio mensual mayor que cero antes de publicarlo. Los precios
trimestral y anual son opcionales; una solicitud de pago para un ciclo sin
precio positivo se rechaza también en persistencia.

El flujo histórico de solicitud de pago obtiene el importe del plan configurado
en el servidor antes de aplicar créditos disponibles. No acepta el importe que
envíe el cliente como precio del paquete.

La página pública `/kiosco` y el catálogo muestran la oferta solamente como
contratable cuando está publicada, tiene precio mensual positivo y declara los
tres módulos. Al empezar desde esa oferta, el registro conserva la intención de
crear una empresa con perfil `kiosk`; la contratación sigue el flujo normal de
facturación de la organización.

## Contratos, clientes nativos y despliegue

`operatingProfile` se expone de forma aditiva en `OrganizationCompanyDto` y
`CompanyDto`. Los decodificadores remotos aceptan respuestas antiguas sin el
campo y les aplican el valor `standard`; rechazan perfiles desconocidos. Desktop
y Mobile propagan el perfil al contexto de empresa con el mismo valor por
defecto. Estos clientes conservan su navegación actual: este cambio comparte el
contexto y no incorpora todavía una navegación Kiosco específica para ellos.

Antes de desplegar código que persista o consuma este perfil, aplicar
[`267_kiosk_profile_and_commercial_plan.sql`](../supabase/migrations/267_kiosk_profile_and_commercial_plan.sql).
La migración es aditiva y también instala las validaciones de precio y el puente
de suscripción para el plan. No debe marcarse la oferta como disponible hasta
completar la migración y configurar su precio mensual.

Restaurante es una futura oferta y un posible perfil posterior. No es un valor
aceptado por el contrato actual, ni comparte implícitamente precio, módulos o
comportamiento con Kiosco.

Para el modelo de organización y facturación que sustenta esta separación, ver
[ADR 0008](adr/0008-organizations-as-workspaces.md) y
[ADR 0009](adr/0009-organization-owned-billing.md).
