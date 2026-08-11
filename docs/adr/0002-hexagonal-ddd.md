# ADR 0002: Arquitectura hexagonal y DDD pragmático

- Estado: aceptado
- Fecha: 2026-08-11

## Decisión

El código nuevo se organiza alrededor de capacidades del negocio. El dominio y la aplicación definen los puertos; infraestructura y presentación aportan adaptadores. Las dependencias siempre apuntan hacia el dominio.

DDD se utilizará para proteger reglas, invariantes y lenguaje del negocio. No se crearán capas, entidades o servicios sin una responsabilidad demostrable. DRY se aplica al conocimiento compartido, no a coincidencias superficiales entre plataformas.

## Reglas

- Dominio y aplicación no importan React, Next.js, Electron, React Native, Supabase ni SerialPort.
- Los repositorios son puertos; Supabase, HTTP y SQLite son adaptadores.
- Los efectos secundarios se mantienen en los bordes.
- Los errores esperables se modelan y no se representan únicamente con textos libres.
- Cada paquete expone una API pública desde `src/index.ts`; se prohíben imports internos entre paquetes.

