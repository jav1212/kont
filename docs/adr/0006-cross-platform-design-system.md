# ADR 0006: Sistema de diseño multiplataforma

- Estado: sustituido por ADR 0038
- Fecha: 2026-08-11

## Decisión

Kontave centraliza decisiones visuales portables en `@kontave/ui` y recursos de identidad en `@kontave/brand-assets`. Los clientes basados en React DOM comparten primitivas mediante `@kontave/ui-dom`; Mobile utiliza `@kontave/ui-react-native`. El ADR 0038 precisa la topología y sustituye los nombres de distribución originales.

No se mantiene un único paquete de componentes para React DOM y React Native. Se comparte el significado visual y la API coherente; cada renderer conserva una implementación apropiada para su plataforma.

## Reglas DRY

- Un valor de marca o semántico se declara una vez en `design-tokens`.
- Los componentes consumen variables semánticas y no colores literales.
- Las aplicaciones componen primitivas; no duplican botones, campos, alertas o tarjetas.
- Un componente se incorpora al sistema cuando representa un concepto reutilizable, no solo porque dos fragmentos tienen JSX parecido.
- Las diferencias reales de plataforma permanecen separadas.

## Accesibilidad

Las primitivas conservan semántica HTML, foco visible, etiquetas asociadas, estados `disabled`/`loading`, mensajes mediante `aria-describedby` y soporte para reducción de movimiento.
