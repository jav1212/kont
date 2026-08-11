# ADR 0004: Subsistema de dispositivos

- Estado: aceptado
- Fecha: 2026-08-11

## Decisión

Kontave tendrá un único subsistema de dispositivos compuesto por contratos portables, un core independiente y adaptadores por plataforma.

- Desktop aloja el core y lo expone a su renderer mediante IPC.
- Device Bridge aloja el mismo core y lo expone a Web mediante WSS local seguro.
- Desktop y Bridge comparten los adaptadores Node.
- Mobile utiliza adaptadores nativos diferentes y conserva los mismos contratos del core.

El consumidor solicita capacidades como `barcode.scan`; no conoce puertos COM ni modelos de fabricante.

