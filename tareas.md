# Tareas pendientes — Psicomorfosis

Backlog priorizado tras la tanda de fixes del 20 de abril de 2026.
Referencias al documento `cambios-20-abril-2026.md` entre paréntesis.

---

## 🟢 Recomendación de orden (lectura rápida)

1. **Edición por bloque en historia clínica** + notas de sesión SOAP (#7, #6)
2. **Visor PDF en Documentos** (#12 crítico)
3. **Catálogo de tests extensible vía JSON** (los 7 tests que hoy son "plantilla") (#8)
4. **Reportes con datos históricos reales** (#13)
5. Resto (equipo granular, portal paciente, facturación avanzada, etc.)

### Por qué este orden (vs. el que propusiste)

| Tu propuesta | Mi sugerencia | Razón |
|---|---|---|
| 1. Historia editable | 1. Historia editable ✅ | De acuerdo. Es la columna vertebral clínico-legal. |
| 2. Reportes históricos | 2. **Visor PDF** | Es barato (1 tanda) y completa el módulo Documentos que hoy tiene botones fachada. Valor inmediato. |
| 3. Visor PDF | 3. **Tests extensibles** | Los tests son pan de cada día clínico (cada sesión puedes aplicar un GAD-7 o Rosenberg). Subir a prioridad 3. |
| — | 4. Reportes históricos | Se puede esperar. Los KPIs del dashboard y reportes ya muestran datos reales suficientes para 1 mes de uso. Además reportes requieren endpoints de agregación por fecha (lo más caro). |

**Regla mental**: lo que se usa en cada sesión > lo que se usa cada mes > lo cosmético.

---

## Tarea 1 · Edición por bloque en historia clínica + notas SOAP

**Prioridad**: 🔴 ALTA · **Valor**: muy alto · **Esfuerzo**: medio

### Contexto
Hoy los bloques de historia clínica (Motivo, Antecedentes, Examen mental, CIE-11, Plan) son cards estáticas que se generan de plantilla a partir de los campos del paciente. No se pueden editar ni agregar evoluciones.

Además, en Colombia la historia clínica es un **documento legal** (Res. 1995/1999 y 839/2017): cada nota debe tener autor, fecha/hora y ser inmodificable una vez firmada (solo se agregan notas, no se reescriben).

### Qué construir

**Backend**
- Tabla `clinical_notes` (id, workspace_id, patient_id, author_id, kind, content, created_at, signed_at)
  - `kind`: `motivo`, `antecedentes`, `examen_mental`, `cie11`, `plan`, `sesion` (SOAP), `evolucion`, `privada`
  - `content`: JSON o TEXT
  - `signed_at`: NULL si borrador
- Endpoints:
  - `GET /api/patients/:id/notes?kind=` → lista
  - `POST /api/patients/:id/notes` → crear (estado: borrador)
  - `PATCH /api/notes/:id` → solo mientras sea borrador
  - `POST /api/notes/:id/sign` → firmar (irreversible)
  - No se permite DELETE (legalmente). En su lugar: `POST /api/notes/:id/supersede` crea una nota nueva que reemplaza la anterior, ambas quedan en el log.

**Frontend**
- En `/historia?id=X`:
  - Botón ✏️ en cada bloque (Motivo, Antecedentes, etc.) abre un editor inline
  - Al guardar → se crea una nota tipo `motivo`/`antecedentes`/etc. Si hay una ya firmada, se "suspende" (supersede) con sello de tiempo
- Nueva sección "Notas de sesión" con formato SOAP estructurado (4 textareas: S/O/A/P) en lugar del textarea libre actual
- Cada nota de sesión muestra: autor, fecha/hora, estado (borrador/firmada), botón de firmar
- En la trayectoria longitudinal: cada nota firmada aparece como evento real

### Criterios de aceptación
- [ ] Puedo editar "Motivo de consulta" de un paciente y el cambio persiste
- [ ] Puedo crear una nota de sesión con formato SOAP
- [ ] Puedo firmar una nota (ya no se puede editar)
- [ ] Puedo ver historial de cambios de un bloque (versiones)
- [ ] El timeline muestra todas las notas firmadas con fecha/autor reales

---

## Tarea 2 · Visor PDF en Documentos

**Prioridad**: 🟠 ALTA · **Valor**: medio-alto · **Esfuerzo**: bajo

### Contexto
Hoy los íconos de ojo (ver) y descarga en Documentos son fachada. El módulo es "suban sus PDFs pero no los miren".

### Qué construir

**Backend**
- Endpoint `GET /api/documents/:id/file` que sirve el binario (PDF/imagen) con `Content-Type` correcto
- Storage de archivos: por ahora en disco local `server/uploads/`; luego se puede migrar a S3
- `POST /api/documents/:id/file` (multipart) para subir

**Frontend**
- Modal visor con `<iframe>` apuntando a la URL de descarga (Chrome/Firefox renderizan PDF nativo) o `react-pdf` si queremos control fino
- Ícono 👁 abre visor; ⬇ descarga directa (con Auth header)
- Panel de "Subir archivo" conectado real

### Criterios de aceptación
- [ ] Puedo subir un PDF y verlo inline en un modal
- [ ] Puedo descargar el PDF firmado de un consentimiento
- [ ] Si el archivo no es PDF (imagen, doc), muestra un fallback claro

---

## Tarea 3 · Catálogo de tests extensible vía JSON

**Prioridad**: 🟠 ALTA · **Valor**: alto · **Esfuerzo**: medio

### Contexto
Hoy solo PHQ-9 tiene aplicación interactiva completa. Los otros 7 (GAD-7, BDI-II, BAI, Rosenberg, PCL-5, AUDIT, EAT-26) muestran "disponible como plantilla". La IA recomendó definir cada test en un JSON estándar para que un renderizador genérico sirva a todos.

### Qué construir

**Schema JSON por test** (extender el campo `scoring` actual):
```json
{
  "code": "GAD-7",
  "name": "Generalized Anxiety Disorder",
  "intro": "En las últimas 2 semanas, ¿con qué frecuencia le ha molestado…",
  "ageRange": "≥ 12 años",
  "items": [
    { "id": 1, "text": "Sentirse nervioso/a, angustiado/a o muy alterado/a", "reverse": false, "critical": false }
  ],
  "options": [
    { "value": 0, "label": "Nunca" },
    { "value": 1, "label": "Varios días" },
    { "value": 2, "label": "Más de la mitad de los días" },
    { "value": 3, "label": "Casi todos los días" }
  ],
  "scoring": {
    "method": "sum",
    "ranges": [
      { "from": 0, "to": 4, "label": "Mínima", "level": "none" },
      { "from": 5, "to": 9, "label": "Leve", "level": "low" },
      { "from": 10, "to": 14, "label": "Moderada", "level": "moderate" },
      { "from": 15, "to": 21, "label": "Severa", "level": "high" }
    ]
  },
  "alerts": [
    { "when": { "item": 9, "min": 1 }, "severity": "critical", "message": "Ideación de daño reportada — activar protocolo" }
  ]
}
```

**Frontend**
- `ApplyView` se vuelve genérico: lee la definición y renderiza ítem por ítem + opciones
- Motor de alertas: revisa `alerts[]` y dispara banner si se cumple alguna condición (reutilizando el `Phq9Item9Alert` generalizado)
- Los 8 tests del seed se convierten a este JSON completo

**Backend**
- El `scoring` ya es JSON. Añadir campos `items`, `options`, `alerts` a `psych_tests`
- O mejor: guardar todo el JSON en un solo campo `definition` (TEXT con JSON completo)

### Criterios de aceptación
- [ ] Puedo aplicar el GAD-7 completo paso a paso (igual que PHQ-9)
- [ ] Si marco "Ideación" en cualquier test, salta la alerta crítica
- [ ] Al agregar un test nuevo al seed, no hay que tocar código del frontend

---

## Tarea 4 · Reportes con datos históricos reales

**Prioridad**: 🟡 MEDIA · **Valor**: medio · **Esfuerzo**: alto

### Contexto
Los KPIs del dashboard y reportes ya son reales (pacientes activos, sesiones atendidas, adherencia, recaudado). Las **gráficas** siguen con datos de ejemplo escalados.

### Qué construir

**Backend**
- Endpoints de agregación por fecha:
  - `GET /api/reports/revenue?from=&to=&groupBy=day|week|month` → ingresos por período
  - `GET /api/reports/sessions-by-modality?from=&to=` → distribución
  - `GET /api/reports/top-reasons?from=&to=` → motivos de consulta agregados
  - `GET /api/reports/retention?from=&to=` → nuevos/retenidos/alta por mes

**Frontend**
- Filtros de fecha en Reportes (rango desde/hasta, atajos: 7d, 30d, 90d, mes actual, año)
- Las 4 gráficas leen de los endpoints nuevos
- Exportar CSV real de cada reporte (Excel-compatible)

### Criterios de aceptación
- [ ] Al cambiar el rango de fechas, todas las gráficas se actualizan
- [ ] La gráfica de ingresos muestra los días reales con datos reales
- [ ] Exportar descarga un CSV con los datos filtrados

---

## Tarea 5 · Equipo con roles granulares y permisos

**Prioridad**: 🟡 MEDIA (solo modo Organización) · **Valor**: alto para clínicas · **Esfuerzo**: medio

Solo aplica al workspace modo Organización. En modo Individual es no-op.

**Qué construir**
- Roles: `super_admin`, `psicologo`, `recepcion`, `facturacion`
- Tabla `user_permissions` o matriz declarativa por rol
- Al invitar miembro: enviar email con link de activación (por ahora: crear usuario con contraseña temporal)
- Estados: activo, suspendido, pendiente invitación
- Middleware backend: cada endpoint declara permisos requeridos

**Criterios**
- [ ] Puedo invitar a un nuevo profesional y se crea como pendiente
- [ ] Un usuario con rol `recepcion` no puede leer historias clínicas
- [ ] Puedo suspender a un usuario sin eliminarlo

---

## Tarea 6 · Notificaciones canal + evento separados

**Prioridad**: 🟢 BAJA · **Valor**: medio · **Esfuerzo**: bajo-medio

Hoy hay 5 toggles que mezclan canal y evento.

**Qué construir**
- Matriz `evento × canal`:
  - Eventos: cita (recordatorio, confirmación, cancelación), pago recibido, riesgo crítico, mensaje, tarea vencida
  - Canales: in-app, email, push, SMS, WhatsApp
- Horario silencioso (desde/hasta) + zona horaria
- Preferencias guardadas en `user_notification_prefs`

---

## Tarea 7 · Facturación avanzada (abonos, paquetes, notas crédito)

**Prioridad**: 🟡 MEDIA · **Valor**: medio-alto (clínica real) · **Esfuerzo**: alto

**Qué construir**
- Paquetes prepago (4 o 10 sesiones) con descuento opcional
- Abonos parciales: una factura puede tener varios pagos parciales con sus métodos
- Nota de crédito (anula sin borrar)
- Recordatorios automáticos de mora
- Factura electrónica DIAN real (integración con proveedor tipo Siigo, Alegra, Factus)

---

## Tarea 8 · Portal del paciente

**Prioridad**: 🟡 MEDIA (alto para clínicas) · **Valor**: alto · **Esfuerzo**: muy alto

**Qué construir**
- Login independiente (dominio `/portal`)
- Ver próxima cita, confirmar asistencia
- Responder tests auto-aplicados (enlace desde email)
- Ver/pagar facturas pendientes
- Descargar consentimientos firmados
- Mensajería con el profesional (respeta horario de atención)

Es un proyecto en sí mismo: backend separado de auth, UI nueva, flujos completos.

---

## Tarea 9 · Versionado y firma digital con sello de tiempo

**Prioridad**: 🟢 BAJA (ya tenemos firma simulada) · **Valor**: alto legalmente · **Esfuerzo**: alto

**Qué construir**
- Al firmar un documento: calcular hash SHA-256 real del contenido, timestamp criptográfico (TSA), adjuntar certificado del firmante
- Integración con proveedor de firma digital certificada (ej. Certicámara, Camerfirma)
- Verificación independiente: un tercero puede validar que el documento no fue alterado

---

## Tarea 10 · Apariencia: densidad, fuente, color de acento

**Prioridad**: 🟢 BAJA · **Valor**: accesibilidad · **Esfuerzo**: bajo

- Slider de densidad (compacta/cómoda/amplia) → modifica paddings y gaps
- Tamaño de fuente base (ayuda con baja visión)
- Selector de color de acento (verde/teal actual / lavanda / rosa)
- Idioma (es-CO/es-MX/en) — requiere i18n

---

## Tarea 11 · Campo "quién remite" y "EPS/convenio" al alta del paciente

**Prioridad**: 🟢 BAJA · **Valor**: medio · **Esfuerzo**: bajo

- Añadir columnas `referred_by` y `insurance` a `patients`
- Mostrar en el Paso 2 del wizard de nuevo paciente
- Mostrar en la ficha y usarlo en la factura automáticamente

---

## Backlog menor (fixes de UX)

- [ ] En Tests → "Evolución GAD-7" sigue usando mock; falta endpoint de serie temporal por paciente/test
- [ ] Facturación: PDF del recibo real (no placeholder)
- [ ] Reportes: exportar PDF real
- [ ] Agenda: arrastrar-y-soltar para reagendar
- [ ] Configuración → Integraciones: conexiones reales con Google Calendar / Zoom

---

## Decisión sugerida

Si estás de acuerdo, empiezo por **Tarea 1 (historia editable + SOAP)** porque es el único que desbloquea uso clínico-legal real. Sin ella, el resto son mejoras sobre un documento que no se puede escribir.

Después de la 1, te sugiero ir por la **2 (Visor PDF)** antes de la 3 (tests extensibles), porque la 2 es barata (1 tanda) y la 3 es medio (2-3 tandas). Así completamos primero el módulo Documentos, que hoy tiene botones fachada.

¿Seguimos con la Tarea 1?
