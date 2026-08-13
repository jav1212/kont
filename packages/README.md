# Paquetes compartidos

Los paquetes se agrupan por capacidad arquitectónica. La carpeta facilita la navegación; el nombre público `@kontave/*` permanece estable para desacoplar consumidores y ubicación física.

## Grupos

- `auth/`: dominio, casos de uso y adaptadores de autenticación.
- `billing/`: facturación, suscripciones, capacidades, consumo y adaptadores organizacionales.
- `devices/`: contratos, núcleo portable, adaptadores de plataforma y utilidades de prueba para dispositivos.
- `ui/`: contratos visuales, tokens, marca y componentes por tecnología de renderizado.
- `platform/`: contratos y capacidades transversales de integración entre aplicaciones y backend.
- `organizations/`: espacios de trabajo, membresías, empresas accesibles y sus adaptadores.
- `products/`: identidad de productos, SKU, códigos de barras, categorías, unidades base, ciclo de vida y utilidades de prueba.
- `monetary/`: dinero exacto, monedas, tasas de cambio, resolución y caché de tasas, conversión, redondeo, distribución de residuos y adaptadores de proveedores cambiarios.

- `payroll/`: definiciones, relaciones, periodos, elementos, entradas, calculo trazable, balances, corridas y utilidades de prueba de nomina.

## Reglas

1. Un dominio no importa frameworks ni infraestructura.
2. Una capa de aplicación depende de su dominio y declara puertos.
3. Los adaptadores implementan puertos y pueden depender de SDKs concretos.
4. Las aplicaciones consumen paquetes por su nombre público, nunca mediante rutas físicas relativas.
5. No se crea un grupo o paquete sin una responsabilidad y un consumidor reales.
