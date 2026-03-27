# Claude Code Task - Unificacion de Hooks de Datos

Implementa una limpieza enfocada exclusivamente en el patron de hooks de datos del proyecto `Kont`, optimizando por impacto y ahorro de tokens.

## Objetivo

- Unificar el patron de hooks de carga remota.
- Reducir errores de lint relacionados con efectos y estado.
- Eliminar `any` innecesario en parseo de respuestas API dentro de hooks.
- Mantener compatibilidad funcional.

## Alcance

Empieza por:

- `src/modules/payroll/frontend/hooks/use-employee.ts`

Si detectas hooks hermanos con el mismo patron y el arreglo es pequeno y directo, puedes incluir tambien:

- `src/modules/payroll/frontend/hooks/use-payroll-history.ts`
- hooks equivalentes en otros modulos solo si comparten exactamente el mismo problema y el cambio es local

## Tarea concreta

### 1. Definir un patron unico para hooks remotos

Todos los hooks tocados deben converger a un patron consistente con:

- `data` o estado principal tipado
- `loading`
- `error`
- `reload`
- parseo seguro de respuestas

### 2. Corregir efectos fragiles

- Evita `setState` sincronico dentro de `useEffect` cuando el estado pueda derivarse de otra forma.
- Evita llamar funciones como `reload()` dentro de `useEffect` si eso dispara el patron que el lint reporta y existe una alternativa simple.
- Prefiere soluciones pequenas y claras sobre abstracciones complejas.

### 3. Tipar respuestas de API

- Elimina `any` en el parseo de respuestas dentro de hooks.
- Introduce tipos minimos reutilizables para respuestas del estilo:
  - `{ data?: T; error?: string }`
- No construyas una capa de cliente HTTP gigante.

### 4. Mantener compatibilidad

- No cambies las firmas publicas del hook salvo que sea estrictamente necesario.
- Si cambias algo, mantenlo lo mas compatible posible con los consumidores actuales.
- No reestructures paginas completas para adaptar el hook.

## Restricciones

- No rehagas modulos completos.
- No cambies comportamiento de negocio.
- No introduzcas librerias nuevas.
- No conviertas esto en una refactorizacion global del frontend.
- Toca solo hooks y helpers cercanos si realmente ayudan a resolver el patron.

## Criterio de terminado

- Los hooks tocados tienen un patron coherente y predecible.
- Se reducen errores de lint ligados a `useEffect`, `setState` y `any`.
- `pnpm lint` muestra mejora en los archivos intervenidos.
- Entrega resumen final con:
  - archivos modificados
  - patron adoptado
  - compatibilidades preservadas
  - errores restantes relacionados con hooks de datos
