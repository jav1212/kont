# Equipo multiagente de Kontave

Estos perfiles son especialistas bajo demanda. No son procesos permanentes: sólo
consumen trabajo de modelo cuando el agente principal los crea para una tarea.
La conversación principal conserva requisitos y decisiones; los subagentes
devuelven resultados compactos.

## Roles

| Agente | Responsabilidad predeterminada |
| --- | --- |
| `project_manager` | Planificación y coordinación de cambios transversales; no escribe código. |
| `backend_engineer` | API, dominio, aplicación, adaptadores y persistencia. |
| `web_engineer` | Next.js/React del Web productivo, excluyendo `app/api/**`. |
| `desktop_engineer` | Electron Desktop; Device Bridge sólo cuando se asigne expresamente. |
| `mobile_engineer` | Expo y React Native Mobile. |
| `documentation_engineer` | Documentación técnica y de producto derivada del diff final verificado. |

## Uso recomendado

Para una tarea de una sola superficie, evita la capa de coordinación adicional:

```text
Usa web_engineer para corregir este flujo de la página de inventario. Limita los
cambios a app/(app)/inventory y valida el build Web.
```

Para una tarea transversal, usa el coordinador:

```text
Usa project_manager para implementar esta capacidad en backend, Desktop y Mobile.
Primero define el contrato y el ownership; después delega trabajo independiente,
espera los resultados y entrega una validación consolidada.
```

Para cerrar un cambio material con documentación:

```text
Usa documentation_engineer después de estabilizar el diff. Actualiza sólo la
documentación propietaria afectada, verifica enlaces y separa claramente lo
implementado de lo planificado.
```

El paquete mínimo para una delegación es:

```text
Resultado: comportamiento observable que debe quedar listo.
Rutas permitidas: archivos o directorios propiedad del agente.
No tocar: consumidores o zonas fuera de alcance.
Contrato: entrada, salida, compatibilidad y errores.
Criterios: definition of done verificable.
Validación: comandos focalizados que deben pasar.
Salida: resumen breve, archivos, pruebas y bloqueos; sin logs completos.
```

## Presupuesto de tokens

- Usa un especialista directamente para cambios locales y `project_manager` sólo
  cuando existan varias superficies, dependencias o decisiones de secuencia.
- Ejecuta normalmente dos o tres agentes paralelos. Usa cuatro únicamente para
  trabajos independientes y sin archivos o paquetes compartidos.
- La configuración usa `gpt-5.6-terra` con razonamiento `medium` para subagentes.
  Escala capacidad o razonamiento sólo para dinero, normativa de nómina,
  autenticación, aislamiento tenant, seguridad, concurrencia, migraciones o
  contratos transversales de alto riesgo.
- Paraleliza exploración, revisión y pruebas. Secuencia escrituras cuando una
  salida es entrada de otra, y asigna un único escritor por archivo o paquete.
- Ejecuta `documentation_engineer` después de la implementación para evitar que
  documente un diff todavía inestable. Omítelo si el cambio no tiene impacto
  documental material.
- Envía rutas de ADR en vez de copiar su contenido, evita reenviar la conversación
  completa y solicita evidencia condensada. Cierra agentes terminados.

El límite de cuatro subagentes es una capacidad máxima, no un objetivo de uso.
