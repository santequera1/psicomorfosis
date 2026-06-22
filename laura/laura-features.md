# Laura — Especificación de funcionalidades (IA de Psicomorfosis)

> **Para Claude / desarrollo:** Este documento describe el asistente clínico "Laura"
> (avatar: Mnemosine, diosa de la memoria) dentro de Psicomorfosis. Úsalo como guía de
> integración. Implementa por **fases**, respetando en TODO momento las dos reglas
> transversales de la sección 0. Las condicionantes de comportamiento y alcance de Laura
> viven en `laura-condicionantes.md` — léelo antes de tocar el prompt del asistente.

---

## 0. Reglas transversales (NO negociables)

### 0.1 Leer todo / Actuar con confirmación

Laura tiene **lectura completa** del workspace del psicólogo: pacientes, historia clínica,
sesiones, tareas, tests, agenda, documentos y reportes. Eso es el diferenciador.

Pero **toda acción que escriba, envíe o modifique** pasa por confirmación explícita del
psicólogo (patrón *propone → aprueba*). Nada se ejecuta solo.

| Tipo de operación | Permiso |
|---|---|
| Leer / consultar / resumir / buscar | Directo, sin confirmación |
| Escribir en historia clínica | **Requiere confirmación** |
| Generar documento clínico/legal | **Requiere confirmación** |
| Enviar mensaje a un paciente | **Requiere confirmación** |
| Reagendar / cancelar citas | **Requiere confirmación** |
| Crear o asignar tareas | **Requiere confirmación** |

Implementación sugerida: cada acción de Laura devuelve un objeto `proposed_action`
(tipo, payload, preview) que la UI muestra con botones **Aprobar / Editar / Descartar**.
La acción solo se ejecuta tras aprobación.

### 0.2 Privacidad de datos clínicos

- Resolver **antes** de enviar cualquier dato a un LLM: consentimiento del paciente para
  procesamiento con IA, acuerdo de tratamiento de datos con el proveedor, y política de
  retención cero / no-entrenamiento.
- Desidentificar donde el flujo lo permita (separar identificadores del texto clínico,
  sobre todo para embeddings/memoria).
- Aislamiento por workspace: Laura nunca cruza información entre psicólogos
  (secreto profesional, Ley 1090).

---

## FASE 1 — Asistente de escritura y productividad (sobre lo que ya existe)

Aprovecha lo ya construido: Whisper/dictado, historia clínica, documentos.

### 1.1 Resumen automático de sesión
- **Hace:** A partir de la transcripción, genera resumen, temas tratados, puntos clave y
  sugerencias para la próxima sesión.
- **Lee:** Transcripción de la sesión + contexto del paciente.
- **Acción:** Propone guardar el resumen en la sesión → requiere confirmación.
- **UI:** Dentro de la vista de sesión / paciente.

### 1.2 Mejorar texto clínico
- **Hace:** Reescribe una evolución o nota en registro clínico. Opciones: más clínico,
  más breve, más humano, formato SOAP, formato historia clínica.
- **Lee:** El texto que el psicólogo seleccionó.
- **Acción:** Devuelve propuesta editable; el psicólogo decide si reemplaza.
- **Regla:** Nunca inventa datos clínicos que no estén en el texto original.

### 1.3 Autollenado como sugerencia
- **Hace:** A partir de un relato libre, propone llenar motivo de consulta, antecedentes,
  factores de riesgo, hipótesis inicial.
- **Acción:** Cada campo se marca como **"Sugerencia pendiente de revisión"**; no se
  guarda hasta que el psicólogo aprueba.

### 1.4 Chat dentro del paciente
- **Hace:** Conversación con Laura en el contexto de un paciente abierto.
- **Lee:** Toda la ficha de ese paciente.
- **Alcance:** Limitado por `laura-condicionantes.md`.

---

## FASE 2 — Memoria clínica (el foso / la razón del nombre)

Esta es la pieza estrella. Mnemosine = memoria. Prioriza esto sobre features genéricos.

### 2.1 Memoria por paciente (RAG / embeddings)
- **Hace:** Indexa sesiones, notas e historia de cada paciente para recuperación semántica.
- **Ejemplo:** *"Juan lleva 6 sesiones; temas frecuentes: ansiedad laboral, baja
  autoestima, dificultad para poner límites."*
- **Nota técnica:** Desidentificar antes de generar embeddings cuando sea posible.

### 2.2 Preguntas sobre el historial
- **Hace:** *"¿Cuándo mencionó problemas con su padre?"* → cita la sesión y fecha.
- **Regla:** Siempre referencia la fuente (sesión/fecha). Si no hay registro, lo dice;
  no inventa.

### 2.3 Búsqueda semántica entre pacientes
- **Hace:** *"Muéstrame pacientes donde haya trabajado duelo"* → lista por significado de
  las notas, no por títulos.
- **Acción:** Solo lectura. Respeta aislamiento por workspace.

### 2.4 Preparador de sesión
- **Hace:** Antes de cada cita, arma briefing: última sesión, pendientes, tarea asignada,
  objetivo planteado.
- **Disparador:** X minutos antes de la cita (configurable) o al abrir la agenda del día.
- **Por qué importa:** Junto con la memoria, es lo que hace que el psicólogo abra la app
  todos los días.

---

## FASE 3 — Acciones con confirmación

Todo aquí sigue el patrón *propone → aprueba* de la sección 0.1.

### 3.1 Generar documentos completos
- **Hace:** Consentimientos, informes de evolución, certificados, remisiones, alta.
- **Ejemplo:** *"Genera informe de evolución de Juan desde enero."*
- **Acción:** Crea borrador → el psicólogo revisa, edita y firma.

### 3.2 Análisis de progreso
- **Hace:** Resume evolución a lo largo de N sesiones (qué disminuye, qué mejora).
- **Regla:** Descriptivo, no diagnóstico. No concluye cuadros clínicos.

### 3.3 Sugerir y asignar tareas
- **Hace:** Propone ejercicios/tareas para el paciente desde una biblioteca clínica.
- **Acción:** *"Asignar tarea"* crea la tarea → requiere confirmación.

### 3.4 Apoyo con tests psicométricos
- **Hace:** Tras un test, explica resultados según los criterios del instrumento y los
  relaciona con la historia.
- **Regla CRÍTICA:** Explica e informa; **no diagnostica**. Frasea como apoyo a la
  interpretación del profesional.

### 3.5 WhatsApp / agenda asistida
- **Hace:** Reagendamiento y recordatorios. Si el paciente dice "no puedo mañana",
  Laura ofrece reagendar y busca espacios.
- **Regla CRÍTICA:** Solo logística. **Nunca** contenido clínico por mensajería.

---

## FASE 4 — Alertas clínicas (al final, con marco legal listo)

> El feature de mayor valor y mayor responsabilidad. No empezar hasta tener lo demás
> sólido y un marco legal claro.

- **Hace:** Señala patrones en las notas que podrían requerir revisión (riesgo, abandono,
  empeoramiento).
- **Reglas CRÍTICAS:**
  - **Nunca** diagnostica ni concluye. **Escala al psicólogo humano**, punto.
  - **Nunca** tranquiliza ni minimiza ("parece que está bien").
  - Posicionado como herramienta de apoyo, no instrumento diagnóstico (dejarlo explícito
    en términos de uso).

---

## Orden de implementación recomendado

1. **Fase 1** completa (gana el "wow" rápido, bajo costo sobre lo existente).
2. **Fase 2.1 + 2.4** (memoria + preparador de sesión: el foso y la retención diaria).
3. Resto de Fase 2, luego Fase 3.
4. **Fase 4** solo con marco legal y de privacidad cerrado.

## Posicionamiento

> "Laura conoce tu consulta completa y nunca actúa sin tu permiso."
> Conocimiento total + agencia controlada.
