

The user wants a detailed inventory of what's pending. This is a research/status question — no plan needed, just a clear breakdown. But the system prompt says plans are for implementation tasks; this is informational. Let me give a structured status report inside the plan tag since that's the only allowed output in this mode.

Let me review what exists vs what the spec (psicomorfosis.md) requires.

**Built so far:**
- Shell visual (sidebar + topbar)
- `/` Dashboard admin (KPIs, gráficos)
- `/agenda` (timeline del día)
- `/pacientes` (tabla filtrable)
- `/historia` (con timeline de seguimiento)
- `/facturacion` (KPIs + tabla)
- `/reportes` (gráficos)
- `/configuracion` (tabs)

**Pending per sidebar + spec:**

## Estado actual de Psicomorfosis

### Rutas declaradas en el sidebar pero SIN implementar (404)

1. **`/tests` — Tests psicométricos**
   - Catálogo (PHQ-9, GAD-7, BDI-II, Beck, etc.)
   - Aplicación interactiva paso a paso
   - Cálculo automático de puntaje + interpretación
   - Histórico por paciente con gráfico de evolución

2. **`/prescripcion` — Prescripción / Plan terapéutico**
   - Tareas terapéuticas asignables al paciente
   - Plantillas TCC (registro de pensamientos, exposición gradual, activación conductual)
   - Seguimiento de adherencia

3. **`/documentos` — Documentos clínicos**
   - Consentimientos informados
   - Informes psicológicos
   - Certificados, remisiones
   - Carga y firma digital

4. **`/mensajes` — Mensajería con pacientes**
   - Bandeja estilo chat (lista + hilo)
   - Indicadores de no leído
   - Plantillas rápidas, horario de atención

### Módulos del spec aún no abordados

5. **Portal del Paciente** (`/portal` o subdominio)
   - Vista cálida, acento lavanda
   - Próxima sesión, tareas, mensajes, documentos
   - Línea de crisis 24/7
   - Login independiente del staff

6. **Autenticación + Roles** (requiere Lovable Cloud)
   - Super admin, psicóloga, recepción, paciente
   - 2FA
   - Permisos por rol en cada módulo

7. **Telepsicología**
   - Sala de videollamada integrada o link a Jitsi/Daily
   - Sala de espera virtual
   - Grabación con consentimiento

8. **Agenda completa** (la actual solo muestra el día)
   - Vista semanal y mensual
   - Drag & drop para reagendar
   - Modal de creación/edición de cita
   - Recordatorios automáticos (email/SMS/WhatsApp)
   - Bloqueos y disponibilidad por profesional

9. **Detalle de paciente** (la lista existe, el perfil completo no)
   - `/pacientes/$id` con todas las pestañas: datos, historia, tests, prescripción, documentos, facturación, mensajes

10. **Historia clínica completa**
    - La actual es una vista demo de un paciente fijo
    - Falta: motivo consulta, antecedentes, examen mental, diagnóstico CIE-11 con buscador, plan TCC editable, notas de proceso privadas (separadas)

11. **Facturación real**
    - Generación de factura electrónica (DIAN Colombia)
    - Pagos en línea (PSE, tarjeta)
    - Conciliación, reportes contables
    - Recibos imprimibles / PDF

12. **Reportes avanzados**
    - Exportar a PDF/Excel
    - Filtros por fecha, profesional, sede
    - Reportes clínicos (evolución de cohortes, abandono terapéutico)

13. **Configuración real**
    - Persistencia de preferencias
    - Gestión de profesionales (multi-staff)
    - Gestión de sedes
    - Plantillas editables (consentimientos, recordatorios)

14. **Protocolo de crisis** (el botón rojo del topbar no hace nada)
    - Modal con pasos del protocolo
    - Línea nacional, contactos de emergencia del paciente
    - Registro del incidente

15. **Búsqueda global** (⌘K en topbar, no funcional)
    - Command palette: pacientes, citas, documentos

16. **Selector de sede** (dropdown en topbar, no funcional)

17. **Notificaciones** (campana en topbar, no funcional)
    - Centro de notificaciones
    - Recordatorios de tareas, citas próximas, mensajes nuevos

### Calidad / cierre
- Estados vacíos, loading skeletons, error boundaries por ruta
- Responsive mobile (sidebar como drawer)
- Accesibilidad (focus visible, contraste, lectores de pantalla)
- Internacionalización (es-CO actualmente hardcoded)

### Recomendación de orden

**Fase A (sin backend, completar maqueta):** 4 → 1 → 9 → 10 → 14 → 15
**Fase B (activar Lovable Cloud):** 6 → persistencia de pacientes/historia/agenda → 8
**Fase C (integraciones externas):** 7 (video), 11 (DIAN/pagos), 5 (portal paciente con auth), recordatorios

Dime por dónde seguir y lo construyo.

