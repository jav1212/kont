# ROAD-MAP — kont MVP

Sistema de nómina venezolana SaaS. Este documento recoge todo lo que hace falta
para llegar a una prueba piloto funcional con clientes reales.

---

## Estado actual (Sprint 2 completado)

| Módulo | Estado |
|---|---|
| Auth + multi-tenant (schema por usuario) | ✅ Completo |
| Gestión de empresas (CRUD) | ✅ Completo |
| Gestión de empleados (CRUD, CSV, historial de salario) | ✅ Completo |
| Calculadora de nómina quincena con días/horas | ✅ Completo |
| Tasa BCV automática | ✅ Completo |
| Deducciones SSO / RPE / FAOV | ✅ Completo |
| Alícuotas + salario integral (LOTTT) | ✅ Completo |
| PDF de recibo por empleado | ✅ Completo |
| Confirmación y guardado de corrida de nómina | ✅ Completo |
| Planes de suscripción + límites | ✅ Completo |
| Panel de administración interno | ✅ Completo |
| Seguridad RLS / search_path / índices | ✅ Completo |

---

## Sprint 3 — Cierre de sprint 2 + fundamentos piloto

> Objetivo: sistema funcional y correcto para una nómina real venezolana.

### 3.1 Cierre de sprint 2

- [ ] **PDF: incluir salario integral** — agregar sección en `payroll-pdf.ts` con
  alícuota de utilidades, alícuota de bono vacacional y salario integral por empleado.
- [ ] **Persistir alícuotas al confirmar** — `calculationData` debe guardar
  `diasUtilidades`, `diasBonoVacacional`, `alicuotaUtil`, `alicuotaBono`,
  `salarioIntegral` para que el recibo histórico sea reproducible.

### 3.2 Corrección de nómina

- [ ] **Filtrar empleados inactivos automáticamente** — los empleados con
  `estado = 'inactivo'` no deben aparecer en el panel de cálculo de nómina.
- [ ] **Empleados en vacaciones** — mostrarlos con badge diferenciado y permitir
  incluirlos/excluirlos manualmente del cálculo.
- [ ] **Bloquear período ya confirmado** — si ya existe una corrida para la misma
  empresa + período, mostrar advertencia y bloquear confirmación duplicada.
- [ ] **Validación salario 0** — advertencia visible si algún empleado tiene
  `salarioMensual = 0` antes de confirmar.

### 3.3 Multi-moneda

- [ ] **Empleados USD en la misma nómina** — un empleado con `moneda = 'USD'`
  debe calcular su base de deducciones en VES usando `salarioMensual × tasaBCV`.
  Actualmente todos se tratan como VES.
- [ ] **Columna moneda visible** en la tabla de resultados de nómina.

### 3.4 Historial de nómina

- [ ] **Lista de corridas pasadas** — página con todas las nóminas confirmadas de
  la empresa activa, filtrable por mes/año.
- [ ] **Re-descarga de PDF histórico** — poder descargar el PDF de cualquier
  corrida pasada, reconstruido desde `calculationData`.

### 3.5 PDF del recibo

- [ ] **RIF / NIT de la empresa** en el encabezado (requiere campo en companies).
- [ ] **Número de recibo único** — serial legible (ej. `NOM-2026-03-Q1-0001`).
- [ ] **Período claro** — "1ª Quincena — Marzo 2026" en el encabezado.

---

## Sprint 4 — Conceptos legales venezolanos

> Objetivo: cubrir los conceptos que un contador venezolano espera ver.

### 4.1 Horas extras (Art. 118 LOTTT)

- [ ] Configuración de horas extras diurnas (recargo 25% sobre hora ordinaria).
- [ ] Horas extras nocturnas (recargo 45%).
- [ ] Horas en día feriado (recargo 100%).
- [ ] Fila de ingresos en la calculadora con tipo `horasExtras`.

### 4.2 Días feriados nacionales

- [ ] Tabla de feriados venezolanos configurables por año.
- [ ] Auto-detección de feriados dentro del período de la quincena.
- [ ] Separar días feriados de días normales en el conteo automático.

### 4.3 Bono nocturno

- [ ] Configuración de turno nocturno por empleado o por corrida.
- [ ] Cálculo: 30% sobre el salario diario por cada día en turno nocturno.

### 4.4 Deducciones avanzadas

- [ ] **Tope de base SSO**: la base de cotización tiene tope de 10 salarios mínimos
  según IVSS — validar y aplicar el tope automáticamente.
- [ ] **Préstamos y anticipos**: deducción fija por empleado, configurable por monto
  o cuotas, persistida entre corridas.
- [ ] **INPRES / colegios profesionales**: deducción optativa por porcentaje.

### 4.5 Reportes de aportes patronales

- [ ] Planilla resumen de aportes IVSS (SSO patronal 9%) por corrida.
- [ ] Planilla resumen de aportes BANAVIH (FAOV patronal 2%) por corrida.
- [ ] Planilla INCES (patronal 2% + obrero 0.5%) por corrida.
- [ ] Export de las planillas en CSV compatible con los portales gubernamentales.

---

## Sprint 5 — Prestaciones sociales y liquidaciones

> Objetivo: cubrir el ciclo completo de vida laboral del empleado.

### 5.1 Garantía de prestaciones (Art. 142 LOTTT)

- [ ] Acumulación mensual: 15 días de salario integral por año (1.25 días/mes).
  Adicional: 2 días adicionales por año a partir del segundo año.
- [ ] Balance acumulado visible por empleado en su perfil.
- [ ] Intereses mensuales sobre el saldo acumulado (tasa BCV pasiva).
- [ ] Export del saldo a la fecha para declaración.

### 5.2 Utilidades anuales

- [ ] Cálculo de utilidades anuales: `salarioIntegral × diasUtilidades` con base
  en los días configurados del plan de la empresa.
- [ ] Vista de proyección de utilidades por empleado.

### 5.3 Vacaciones y bono vacacional

- [ ] Días de vacaciones acumulados por antigüedad (Art. 190 LOTTT).
- [ ] Cálculo del bono vacacional.
- [ ] Registro de vacaciones tomadas y pendientes.

### 5.4 Liquidación de contrato

- [ ] Formulario de liquidación con fecha de egreso y causa.
- [ ] Cálculo automático: prestaciones + utilidades fraccionadas + vacaciones
  pendientes + otros conceptos.
- [ ] PDF de liquidación.

---

## Sprint 6 — Distribución y experiencia piloto

> Objetivo: que el cliente pueda usar kont sin asistencia técnica.

### 6.1 Distribución de recibos

- [ ] **Envío por correo electrónico** — enviar el PDF de recibo a cada empleado
  (requiere campo `email` en empleados).
- [ ] **Envío por WhatsApp** — integración con WhatsApp Business API o link
  de descarga con token temporal.
- [ ] **Portal del empleado** — URL única donde el empleado puede ver y descargar
  sus propios recibos (sin login).

### 6.2 Onboarding y usabilidad

- [ ] **Wizard de primera nómina** — guía paso a paso para usuarios nuevos:
  crear empresa → cargar empleados → calcular → confirmar.
- [ ] **Importación masiva desde Excel/CSV** — plantilla descargable con todas las
  columnas requeridas.
- [ ] **Tooltips y ayuda contextual** en los campos de alícuotas, tasas y conceptos
  legales.

### 6.3 Facturación y pagos

- [ ] **Flujo de pago por transferencia** — el usuario sube comprobante, el admin
  lo aprueba y activa la cuenta (ya existe la tabla `payment_requests`).
- [ ] **Notificación de vencimiento de plan** — aviso por correo antes de que expire
  el período de prueba o el plan activo.
- [ ] **Downgrade automático a trial** si el pago no se recibe a tiempo.

### 6.4 Contabilidad

- [ ] **Export CSV/Excel de nómina completa** para importar en sistemas contables
  (Profit Plus, SageX3, etc.).
- [ ] **Asientos contables sugeridos** — formato texto con los cargos y abonos
  correspondientes a la nómina.

---

## Deuda técnica y mejoras de plataforma

> Sin fecha fija, se atienden según impacto.

- [ ] Habilitar "Leaked Password Protection" cuando el plan lo permita (actualmente
  plan Free — requiere upgrade a Pro en Supabase).
- [ ] Migraciones registradas en Supabase (`supabase db push` con tracking) — las
  migraciones actuales se aplicaron directamente sin registro.
- [ ] Tests de integración para las RPCs principales (al menos `tenant_employees_upsert`,
  `tenant_payroll_run_save`).
- [ ] Rate limiting en los API routes de nómina.
- [ ] Logs de auditoría — quién confirmó qué nómina y cuándo.

---

## Criterios de MVP (prueba piloto)

Para salir a piloto con clientes reales se consideran bloqueantes:

- [x] Auth + multi-tenant funcional
- [ ] PDF con salario integral completo (sprint 3)
- [ ] Historial de nómina con re-descarga (sprint 3)
- [ ] Filtrado de inactivos y bloqueo de período duplicado (sprint 3)
- [ ] Empleados USD manejados correctamente (sprint 3)
- [ ] Horas extras básicas (sprint 4)
- [ ] Flujo de pago por transferencia activo (sprint 6)
- [ ] Onboarding mínimo: wizard o documentación clara

Todo lo de sprint 4 en adelante es deseable para el piloto pero no bloqueante.
