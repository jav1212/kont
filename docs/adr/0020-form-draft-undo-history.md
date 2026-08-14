# ADR 0020: Historial de deshacer y rehacer para borradores de formularios

- Estado: aceptado
- Fecha: 2026-08-13

## Contexto

Los formularios operacionales de Kontave combinan edición textual con acciones que modifican varias partes de un borrador. Seleccionar un producto puede cambiar descripción, moneda, precio, tasa e IVA; cambiar el tipo de documento puede limpiar varios campos; agregar, eliminar o escanear una línea modifica la estructura completa del documento.

El historial nativo del navegador resuelve la edición de texto dentro de `input`, `textarea` y editores, pero no conoce estas acciones del formulario. Interceptarlo indiscriminadamente degradaría el cursor, la selección, el dictado y los métodos de entrada de cada plataforma.

## Decisión

Cada formulario operacional editable puede mantener un historial Memento propio con estados `past`, `present` y `future`. Los mementos contienen exclusivamente el modelo editable necesario para reproducir el borrador; no incluyen carga, errores, foco, paneles transitorios ni resultados que puedan derivarse.

El algoritmo portable vive en `@kontave/history-core`. No importa React, Next.js, Electron, React Native, persistencia ni entidades de negocio. Los hooks, atajos y controles visuales son adaptadores de presentación y permanecen fuera del core.

Las modificaciones relacionadas se registran como una acción semántica y atómica con nombre. Las ediciones repetidas de un mismo campo pueden agruparse durante una ventana breve, mientras que agregar o eliminar líneas, seleccionar productos, escanear códigos y aplicar cambios masivos producen entradas independientes.

`Ctrl+Z` o `Cmd+Z` conserva el comportamiento nativo cuando el objetivo es un campo editable. Fuera de campos editables, el formulario activo recibe deshacer. Rehacer usa `Ctrl+Y`, `Ctrl+Shift+Z` o `Cmd+Shift+Z`. La interfaz también expone controles visibles y accesibles con el nombre de la acción disponible.

La carga de un documento, el cambio de documento y la transición a solo lectura limpian el historial. Confirmar o contabilizar termina la edición por Memento; cualquier cambio posterior utiliza las reglas de reverso o compensación del dominio propietario.

## Fronteras

- El historial pertenece al formulario, no a un estado global de toda la aplicación.
- El coordinador de teclado decide qué formulario activo recibe el comando, pero no interpreta reglas de negocio.
- Guardar un borrador no representa por sí mismo una edición y no crea una entrada.
- Los totales y demás proyecciones se recalculan al restaurar las entradas que los originan.
- Un cambio nuevo después de deshacer elimina la rama de rehacer.
- El historial tiene un límite configurable para controlar memoria.

## Consecuencias

- Web y Desktop pueden compartir el algoritmo puro sin compartir componentes ni estado global.
- Los formularios necesitan un modelo de borrador coherente y operaciones inmutables para producir mementos fiables.
- Los componentes que realizan cambios multcampo deben comunicar una única intención semántica al historial.
- La reversión de operaciones persistidas o confirmadas permanece fuera de esta capacidad.
