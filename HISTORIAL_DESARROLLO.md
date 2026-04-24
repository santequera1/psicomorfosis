# Psicomorfosis — Historial de Desarrollo

## Resumen del Proyecto
Workspace clínico para **Psic. Nathaly Ferrer Pacheco** en Bogotá (Colombia).
Gestión de pacientes, historias clínicas, agenda, tests psicométricos validados, planes terapéuticos TCC, documentos clínicos con firma digital, mensajería asincrónica, facturación, reportes y configuración.

**Frontend original**: Generado con Lovable (TanStack Start + React 19 + TypeScript + Tailwind + shadcn/ui). Solo datos mock en memoria.
**Backend construido**: Express.js + SQLite (better-sqlite3) + JWT + Socket.IO para tiempo real.

---

## Stack Tecnológico

### Frontend
- React 19 + TypeScript + Vite (puerto 5173)
- TanStack Start (SSR + Cloudflare Workers ready)
- TanStack Router (file-based routing)
- TanStack Query (React Query) — fetch y cache de datos del backend
- Tailwind CSS 4 + shadcn/ui (50+ primitives)
- Recharts (gráficas)
- Lucide React (iconos)
- React Hook Form + Zod (formularios y validación)

### Backend
- Express.js (puerto 3002)
- SQLite con better-sqlite3 (archivo: `server/data.db`)
- JWT para autenticación (expira en 24h)
- bcryptjs para hash de contraseñas
- Socket.IO para WebSockets (eventos en vivo de pacientes, citas, mensajes)
- CORS habilitado

---

## Estructura de Archivos

```
psicomorfosis/
├── wrangler.jsonc                  # Config Cloudflare Workers (deploy opcional)
├── vite.config.ts                  # Vite + TanStack Router plugin
├── public/                         # Assets públicos
├── src/
│   ├── routes/                     # Rutas (file-based TanStack Router)
│   │   ├── __root.tsx              # Root + QueryClientProvider
│   │   ├── login.tsx               # Login con JWT real
│   │   ├── index.tsx               # Dashboard admin
│   │   ├── agenda.tsx              # Vistas día/semana/mes/lista + modales
│   │   ├── pacientes.tsx           # Lista pacientes (conectada al backend)
│   │   ├── pacientes.$id.tsx       # Detalle paciente (7 pestañas, conectada al backend)
│   │   ├── historia.tsx            # Historia clínica con selector de paciente
│   │   ├── tests.tsx               # Catálogo + aplicación interactiva + histórico
│   │   ├── prescripcion.tsx        # Tareas TCC + 7 plantillas + modal asignación
│   │   ├── documentos.tsx          # Biblioteca + modal subida + modal firma
│   │   ├── mensajes.tsx            # Chat con pacientes (lista + hilo + plantillas)
│   │   ├── facturacion.tsx         # Facturas + Nueva factura + detalle + export CSV
│   │   ├── reportes.tsx            # KPIs + 4 gráficas
│   │   └── configuracion.tsx       # Perfil / Notif / Seguridad / Apariencia / Plan / Equipo / Integraciones
│   ├── components/
│   │   ├── app/
│   │   │   ├── AppShell.tsx        # Layout con guard de auth (redirige a /login)
│   │   │   ├── AppSidebar.tsx      # Sidebar colapsable (Operación / Clínico / Gestión)
│   │   │   ├── Topbar.tsx          # Breadcrumb + búsqueda ⌘K + sede + crisis + notif + menú usuario
│   │   │   ├── KpiCard.tsx         # Card de KPI reutilizable
│   │   │   ├── RiskBadge.tsx       # Badge de bandera clínica (5 niveles)
│   │   │   └── Logo.tsx
│   │   ├── dashboards/
│   │   │   └── AdminDashboard.tsx  # Saludo dinámico + filtros período + KPIs clicables
│   │   └── ui/                     # ~50 componentes shadcn/ui
│   ├── lib/
│   │   ├── api.ts                  # Cliente HTTP al backend + manejo de sesión
│   │   ├── mock-data.ts            # Tipos + datos mock (origen del seed)
│   │   └── utils.ts                # cn() helper
│   ├── router.tsx                  # Config TanStack Router
│   ├── routeTree.gen.ts            # Auto-generado por TanStack Router
│   └── styles.css                  # Design system OKLCH (brand teal, sage, lavender)
├── server/
│   ├── package.json
│   ├── src/
│   │   ├── index.js                # Express + Socket.IO + mount de rutas
│   │   ├── db.js                   # Schema SQLite + seed
│   │   ├── auth.js                 # JWT sign/verify + middleware requireAuth / requireRole
│   │   └── routes/
│   │       ├── auth.js             # POST /api/auth/login, GET /api/auth/me
│   │       ├── patients.js         # CRUD pacientes + filtros
│   │       ├── appointments.js     # CRUD citas
│   │       ├── tests.js            # Catálogo + aplicaciones
│   │       ├── tasks.js            # CRUD tareas terapéuticas
│   │       ├── documents.js        # CRUD documentos + firmar
│   │       ├── messages.js         # Hilos + mensajes + marcar leído
│   │       ├── notifications.js    # Listar + marcar leída
│   │       └── settings.js         # GET/PUT clave-valor
│   └── data.db                     # SQLite (auto-generado con seed al primer arranque)
└── HISTORIAL_DESARROLLO.md         # Este archivo
```

---

## Modelo de Datos

### Tablas de la DB
- `users` — Usuarios del workspace (5 seed)
- `patients` — Pacientes con banderas de riesgo, modalidad, estado, tags
- `appointments` — Citas con fecha, hora, sala, profesional, modalidad
- `psych_tests` — Catálogo de 8 instrumentos validados (scoring en JSON)
- `test_applications` — Historial de aplicaciones con puntaje e interpretación
- `therapy_tasks` — Tareas TCC con adherencia 0–100 y estado
- `documents` — Documentos clínicos con tipo, estado y fecha de firma
- `message_threads` + `messages` — Mensajería asincrónica con pacientes
- `notifications` — Centro de notificaciones (alertas, citas, tests, tareas)
- `settings` — Configuración clave-valor del negocio

### Estados de paciente
```
'activo' | 'pausa' | 'alta' | 'derivado'
```

### Banderas de riesgo clínico (Risk)
```
'none' | 'low' | 'moderate' | 'high' | 'critical'
```

### Modalidades de sesión
```
'individual' | 'pareja' | 'familiar' | 'grupal' | 'tele'
```

### Estados de cita
```
'pendiente' | 'confirmada' | 'en_curso' | 'atendida' | 'cancelada'
```

### Tipos de tarea TCC
```
'registro_pensamientos' | 'exposicion' | 'activacion' |
'reestructuracion' | 'mindfulness' | 'psicoeducacion' | 'autoregistro'
```

### Roles de usuario
```
'super_admin' | 'psicologa' | 'recepcion' | 'paciente'
```

---

## Credenciales de Acceso

```
admin    / admin123    — Super admin (acceso total)
nathaly  / nathaly123  — Psic. Nathaly Ferrer Pacheco (psicóloga)
lucia    / lucia123    — Dra. Lucía Méndez (psicóloga)
mateo    / mateo123    — Dr. Mateo Rivas (psicólogo)
clara    / clara123    — Clara Vega (recepción)
```

---

## Cómo Ejecutar

```bash
# 1. Instalar dependencias (solo la primera vez)
npm install
cd server && npm install && cd ..

# 2. Si necesitas reiniciar la DB (borra todos los datos)
rm server/data.db

# 3. Iniciar backend (Terminal 1)
cd server && npm start

# 4. Iniciar frontend (Terminal 2)
npm run dev

# 5. Abrir en navegador
http://localhost:5173       # Frontend
http://localhost:3002/api/health  # Backend health check
```

---

## API REST

Todas las rutas (excepto `/api/auth/login`) requieren header `Authorization: Bearer <JWT>`.

### Auth
- `POST /api/auth/login` — `{ username, password }` → `{ token, user }`
- `GET  /api/auth/me` — Usuario actual

### Pacientes
- `GET    /api/patients?q=&status=&modality=&risk=&professional=`
- `GET    /api/patients/:id`
- `POST   /api/patients`
- `PATCH  /api/patients/:id`
- `DELETE /api/patients/:id`

### Citas
- `GET    /api/appointments?date=&from=&to=&professional=`
- `POST   /api/appointments`
- `PATCH  /api/appointments/:id`
- `DELETE /api/appointments/:id`

### Tests psicométricos
- `GET  /api/tests/catalog`
- `GET  /api/tests/catalog/:id`
- `GET  /api/tests/applications?patient_id=&status=`
- `POST /api/tests/applications`

### Tareas terapéuticas
- `GET    /api/tasks?patient_id=&status=`
- `POST   /api/tasks`
- `PATCH  /api/tasks/:id`
- `DELETE /api/tasks/:id`

### Documentos
- `GET    /api/documents?patient_id=&type=&status=&q=`
- `POST   /api/documents`
- `POST   /api/documents/:id/sign`
- `DELETE /api/documents/:id`

### Mensajería
- `GET  /api/messages/threads`
- `GET  /api/messages/threads/:id` (incluye mensajes)
- `POST /api/messages/threads/:id/messages` — `{ text }`
- `POST /api/messages/threads/:id/read`

### Notificaciones
- `GET  /api/notifications`
- `POST /api/notifications/:id/read`
- `POST /api/notifications/mark-all-read`

### Configuración
- `GET /api/settings`
- `PUT /api/settings` — body: `{ key1: value1, ... }`

---

## Eventos Socket.IO (tiempo real)

El backend emite estos eventos cuando hay cambios. El frontend puede suscribirse con `io-client`:

- `patient:created`, `patient:updated`, `patient:deleted`
- `appointment:created`, `appointment:updated`, `appointment:deleted`
- `message:created` — `{ threadId, message }`

---

## Funcionalidades Implementadas

### Autenticación
- Login con usuario/contraseña (JWT 24h)
- Auth guard en `AppShell` (redirige a `/login?redirect=/ruta-original`)
- Menú de usuario con cerrar sesión
- 5 usuarios seed con roles diferenciados

### Pacientes (end-to-end con backend)
- Lista filtrable por estado, modalidad, bandera de riesgo
- Buscador por nombre, documento, motivo, ID
- Click en fila → detalle `/pacientes/$id` (lectura desde API)
- Modal "Nuevo paciente" (wizard 3 pasos) con POST real al backend
- Export CSV de filtros aplicados
- Estado de loading/error integrado

### Detalle de Paciente (7 pestañas)
- **Datos** — contacto, EPS, contactos de emergencia, resumen clínico
- **Historia** — motivo, antecedentes, examen mental, CIE-11, plan TCC, notas privadas, timeline
- **Tests** — aplicaciones + gráfico de evolución
- **Prescripción** — tareas con adherencia visual
- **Documentos** — lista de documentos del paciente
- **Mensajes** — últimos 4 mensajes + link a bandeja
- **Facturación** — facturas + resumen

### Agenda
- 4 vistas: día, semana (grid horas × días), mes (calendario), lista
- Navegación entre semanas con flechas
- Modal "Nueva cita" con paciente, fecha, hora, modalidad, duración, recordatorio
- Modal de detalle al clickear slot (iniciar sesión, reagendar, cancelar)
- Panel lateral: próximo paciente, lista de riesgo, pendientes

### Dashboard
- Saludo dinámico según hora del día
- Fecha real (es-CO)
- Filtro de período funcional: Hoy / Semana / Mes / Trimestre / Año (recalcula KPIs)
- 8 KPI cards clicables que navegan al módulo correspondiente
- Banner de crisis con botón que abre modal de protocolo
- Gráfica de ingresos (area chart)
- Distribución de sesiones por modalidad
- Top motivos de consulta (bar chart)
- Próximas sesiones (ligadas a /agenda)
- Pacientes con riesgo activo (ligados al detalle)

### Tests psicométricos
- Catálogo filtrable por categoría (Depresión, Ansiedad, Autoestima, TEPT, Adicciones, Alimentación)
- 8 instrumentos: PHQ-9, GAD-7, BDI-II, BAI, Rosenberg, PCL-5, AUDIT, EAT-26
- Aplicación interactiva del PHQ-9 paso a paso
- Cálculo automático de puntaje con interpretación
- Histórico por paciente + gráfico de evolución (Recharts)

### Prescripción (Plan terapéutico)
- 7 plantillas TCC (registro pensamientos, exposición, activación, reestructuración, mindfulness, psicoeducación, autoregistro)
- Lista de tareas con barra de adherencia (0–100%)
- Filtros activas / vencidas / todas
- Modal de asignación en 3 pasos
- Panel lateral con detalle de tarea seleccionada

### Documentos
- Biblioteca con filtros tipo/estado
- 5 tipos: consentimiento, informe, certificado, remisión, cuestionario
- Modal de subida
- Modal de firma digital simulada (hash SHA-256)
- Plantillas base más usadas

### Mensajes
- Bandeja tipo chat con lista de hilos (con unread badge + pin + bandera de riesgo)
- Filtros todos / sin leer / anclados
- Vista de hilo con bubbles diferenciados (profesional vs paciente)
- Alerta de riesgo crítico visible
- Plantillas rápidas laterales
- Envío via POST al backend

### Facturación
- 4 KPIs: recaudado, por cobrar, vencidas, emitidas
- Tabs funcionales (Todas / Pagadas / Pendientes / Vencidas)
- Buscador global
- Click en fila → modal detalle con desglose IVA 19%
- Modal "Nueva factura" (formato compatible DIAN)
- Export CSV

### Reportes
- 4 KPIs clínicos (pacientes activos, sesiones, adherencia, reducción GAD-7)
- Área chart de ingresos
- Donut de modalidades
- Bar horizontal de motivos
- Bar apilado de retención de pacientes

### Configuración
- **Perfil profesional** — nombre, título, enfoque, tarjeta, correo, teléfono
- **Notificaciones** — 6 toggles de preferencias
- **Seguridad** — 2FA, auto-logout, alertas de nuevo inicio de sesión
- **Apariencia** — selector claro/oscuro/auto
- **Plan y facturación** — 3 planes (Solo, Pro, Clínica+) + historial de pagos
- **Equipo** — 6 miembros, modal invitación, tabla de roles
- **Integraciones** — Google Calendar, Zoom, Jitsi, WhatsApp Business, DIAN, HL7/FHIR

### Elementos globales
- **Topbar**
  - Breadcrumb dinámico
  - Búsqueda global ⌘K (command palette con grupos: rutas, pacientes, citas, documentos)
  - Selector de sede (Chapinero, Cedritos, Telepsicología)
  - Botón de protocolo de crisis (modal con 6 pasos + 4 líneas de ayuda + registro del incidente)
  - Notificaciones con badge de no leídas
  - Menú de usuario (Mi perfil, Configuración, Ayuda, Cerrar sesión)
- **Sidebar** colapsable con 3 grupos (Operación / Clínico / Gestión)

---

## Datos de Prueba (Seed)

### Pacientes (10)
1. **María Camila Rondón** — Ansiedad generalizada · riesgo bajo
2. **Andrés Felipe Galeano** — Episodio depresivo mayor · riesgo alto
3. **Familia Ortega-Pinilla** — Dinámica familiar · moderado
4. **Valentina Soto Cárdenas** (menor) — Autolesión no suicida · crítico
5. **Jorge & Patricia Lemus** — Crisis de pareja · sin bandera
6. **Laura Restrepo Vélez** — Duelo complicado · bajo (telepsicología)
7. **Camilo Esteban Ruiz** — Trastorno bipolar II · pausado
8. **Sara Liliana Beltrán** — TCA anorexia · alto
9. **Tomás Aristizábal** — Adicción a cannabis · moderado
10. **Marta Inés Cifuentes** — Adaptación jubilación · alta terapéutica

### Citas (8 del día)
Distribuidas entre 08:00 y 18:00 con 4 profesionales en 3 salas + telepsicología.

### Personal (users)
- Super admin, Nathaly Ferrer, Dra. Lucía Méndez, Dr. Mateo Rivas, Clara Vega (recepción)

### Tests psicométricos (8 instrumentos)
PHQ-9, GAD-7, BDI-II, BAI, Rosenberg, PCL-5, AUDIT, EAT-26 — con rangos de puntuación completos.

### Aplicaciones de tests (7) · Tareas TCC (7) · Documentos (10) · Hilos de mensajes (6) · Notificaciones (6)

---

## Pendiente / Ideas Futuras

### Alta prioridad (flujos core)
- Cablear `/agenda` al backend real (CRUD citas vía React Query)
- Cablear `/tests`, `/prescripcion`, `/documentos`, `/mensajes` al backend (hoy usan mock-data en el frontend)
- Conectar Socket.IO desde el frontend para actualización en vivo
- Historia clínica editable con persistencia en DB (tabla `clinical_notes` pendiente)
- Rate limiting en login (brute-force)

### Media prioridad
- Portal del paciente (`/portal`) con login independiente
- Telepsicología real vía Zoom/Jitsi (integración API)
- Factura electrónica DIAN validada (API oficial)
- Pagos PSE/tarjeta (Wompi, ePayco, o Mercado Pago)
- Recordatorios automáticos (email + WhatsApp Business)
- Subida real de archivos (consentimientos firmados, informes PDF)
- Firma digital certificada (sello de tiempo)
- Historial de cambios (audit log) por registro clínico

### Baja prioridad (polish)
- Tema oscuro completo
- PWA / instalable en móvil
- Exportación a PDF de reportes y historias
- Backup automático de DB (cron + S3)
- i18n (inglés, portugués)
- Modo multi-sede con bases de datos separadas

---

## Notas Técnicas

- La moneda es **COP** (pesos colombianos, sin decimales) → formateo con `Intl.NumberFormat("es-CO")`
- Frontend Vite corre en puerto **5173**, backend Express en **3002**
- Socket.IO se conecta automáticamente al backend; el frontend aún no tiene listeners (`io-client` no añadido)
- El JWT tiene expiración de **24h** — cuando expira, `api.ts` limpia la sesión y redirige a login
- La DB SQLite se crea automáticamente con seed al primer arranque del servidor
- Para reiniciar datos: borra `server/data.db` y reinicia el backend (`rm server/data.db && npm start`)
- Design system: tokens OKLCH en `src/styles.css` — brand (teal), sage (success), lavender (accent clínico), risk (low→critical)
- **Cloudflare Workers**: el `wrangler.jsonc` está configurado para desplegar el frontend, pero el backend Express **no** se puede desplegar tal cual a Workers — necesitaría reescritura a Hono o similar. Para producción, el backend puede desplegarse a Railway, Fly.io, Render o una VPS con Node.js

---

## Decisiones de arquitectura

- **TanStack Start (SSR) + Express separado** en lugar de server functions nativos, para espejar el patrón de Comidas Rápidas y permitir desplegar backend y frontend de forma independiente.
- **SQLite** (no Postgres) para simplicidad local y facilidad de backup (un archivo). Migrar a Postgres es 1 línea si se despliega a producción con volumen.
- **Auth guard en `AppShell`** (cliente) en lugar de `beforeLoad` de TanStack Router, porque `localStorage` no existe en SSR.
- **React Query** centraliza estado del servidor con cache automática, invalidación tras mutaciones e integración con Socket.IO cuando se conecte.
- **Design system OKLCH** para colores perceptualmente uniformes y escala clínica consistente de riesgo.
