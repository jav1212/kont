# Claude Code Task - Saneamiento Tecnico

Implementa este plan de saneamiento tecnico en el proyecto `Kont`, optimizando por impacto y ahorro de tokens.

## Objetivo principal

- Dejar de tener errores de lint en las capas shared y patrones base.
- Unificar el patron de hooks de datos.
- Reducir deuda transversal sin hacer refactors cosmeticos innecesarios.
- No tocar funcionalidad de negocio salvo que sea necesario para corregir errores estructurales.

## Prioridades y alcance

### 1. Shared primero

- Refactoriza `src/shared/frontend/components/base-input.tsx` para eliminar el uso de hooks dentro de una `abstract class`.
- Conviertelo en un componente funcional normal, manteniendo la API publica lo mas compatible posible.
- Corrige `src/shared/frontend/components/theme-provider.tsx`.
- Corrige `src/shared/frontend/hooks/use-is-desktop.ts`.
- Corrige `src/shared/frontend/components/pwa-install-button.tsx`.
- En estos archivos, elimina patrones de `setState` sincronico dentro de `useEffect` cuando exista una alternativa simple y segura.

### 2. Tipado transversal

- Elimina `any` en:
  - `src/shared/backend/source/infra/tenant-supabase.ts`
  - `src/shared/backend/utils/handle-result.ts`
- Introduce tipos minimos y pragmaticos.
- No hagas sobreingenieria ni generes tipos gigantes si no hacen falta.

### 3. Hooks de datos

- Define y aplica un patron consistente para hooks de carga remota:
  - `loading`
  - `error`
  - `reload`
  - parseo tipado de respuesta
- Empieza por:
  - `src/modules/payroll/frontend/hooks/use-employee.ts`
- Si encuentras el mismo problema en hooks hermanos inmediatos y el cambio es pequeño, arreglalos tambien.
- Evita cambios masivos fuera del mismo patron.

### 4. Backend/API consistency

- Mejora el contrato de `handleResult` para que tipar respuestas sea simple.
- No refactorices todas las rutas del proyecto.
- Solo toca rutas API si es necesario para mantener compatibilidad con los cambios anteriores.

### 5. Lint-driven cleanup minimo

- Ejecuta `pnpm lint`.
- Corrige primero errores, no warnings cosmeticos.
- Si un warning se resuelve naturalmente por el refactor, perfecto.
- No persigas todos los warnings del repo en esta tarea.

## Restricciones

- No cambies comportamiento funcional del producto salvo para corregir errores estructurales/lint.
- No rehagas modulos completos.
- No cambies estilos visuales salvo que sea necesario para preservar compatibilidad.
- No actualices dependencias.
- No modifiques archivos no relacionados.
- Manten los cambios pequenos, locales y faciles de revisar.

## Criterio de terminado

- `pnpm lint` con menos errores que al inicio, idealmente sin errores en `shared` y en los archivos tocados.
- Entrega un resumen final con:
  - archivos modificados
  - decisiones de compatibilidad
  - errores restantes de lint agrupados por patron
