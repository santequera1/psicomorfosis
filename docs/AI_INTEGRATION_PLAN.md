# Plan de integración de IA clínica — Psicomorfosis

> **Estado**: planeación, sin código aún.
> **Última actualización**: 2026-05-11
> **Próximo paso bloqueante**: Stiven recarga crédito en OpenRouter y setea
> la API key como env var en PM2. Hasta entonces no hay nada que codear.

## 1. Contexto y motivación

Las plataformas competidoras (Psiris específicamente) ya ofrecen "Asistente
IA" que convierte notas crudas de sesión al formato estructurado de
historia clínica. Para mantenernos competitivos en la fase de captación
de psicólogas beta, integramos un asistente equivalente — con el
diferencial de que **todo el flujo respeta la Ley 1581 de 2012** y queda
auditable.

**Caso de uso v1**: la psicóloga pega notas libres de la sesión → el
sistema las convierte automáticamente a formato SOAP (Subjetivo /
Objetivo / Análisis / Plan) → ella revisa y guarda como nota clínica.

**Casos de uso descartados para v1** (potenciales para v2/v3):
- Generación de bloques de historia (motivo, antecedentes, examen mental,
  CIE-11, plan). Más complejo y de menor frecuencia de uso.
- Resumen automático de sesiones previas al abrir un paciente.
- Sugerencia de objetivos terapéuticos o tareas para el paciente.
- Análisis de tests psicométricos (interpretación asistida).

## 2. Decisiones tomadas

| Decisión | Valor | Por qué |
|---|---|---|
| **Modelo** | `anthropic/claude-haiku-4-5` | Mejor calidad clínica en español, structured output más confiable, tono cauteloso. La diferencia de costo vs GPT mini es < $1 USD/mes en fase beta. |
| **Proveedor** | OpenRouter | Una sola API key, modelo intercambiable con env var, no commitment a un solo proveedor. |
| **Configuración del modelo** | `OPENROUTER_MODEL` env var | Cambiar modelo sin desplegar código nuevo. |
| **Marco legal** | Documento nuevo `ia-clinica`, no modificar los 3 existentes | Aislamiento: Otoniel edita un solo doc, opt-in claro, evolución independiente del resto del marco legal. |
| **Gating** | Feature flag por usuario, basado en `is_platform_admin` (fase 1) y luego en aceptación del doc `ia-clinica` (fase 2) | Activación gradual, sin riesgo de exposición prematura. |
| **Audit log** | Tabla `ai_usage_log` con metadata (sin contenido) | Trazabilidad de uso y costos sin guardar datos sensibles redundantes. |
| **Rate limiting** | 10 generaciones/min por user, 200/día por workspace | In-memory inicialmente; subir a Redis si crece. |
| **Costo proyectado** | < $1 USD/mes en beta, ~$17 USD/mes a 100 psicólogas activas | Aceptable. |

## 3. Prerequisitos del usuario

Stiven debe hacer **antes** de que tenga sentido escribir código:

```bash
# 1) Recargar crédito en OpenRouter (mínimo $5, recomendación $10-15)
#    https://openrouter.ai/credits

# 2) Crear API key
#    https://openrouter.ai/keys → "Create Key" → nombre: "psicomorfosis-prod"
#    Copiar la key (empieza con sk-or-v1-...). Solo se muestra UNA vez.

# 3) Setear como env var en el VPS via ecosystem.config.cjs
ssh ubuntu@51.195.109.26
cd ~/apps/psicomorfosis
nano ecosystem.config.cjs
# Agregar dentro del apps[0].env (psicomorfosis-api):
#   OPENROUTER_API_KEY: "sk-or-v1-...",
#   OPENROUTER_MODEL: "anthropic/claude-haiku-4-5",
# Guardar y aplicar:
pm2 restart ecosystem.config.cjs --update-env --only psicomorfosis-api

# 4) Verificar que el proceso tiene la key (sin revelarla):
pm2 env 5 | grep -E "OPENROUTER" | sed 's/=.*/=***/'
# Debe mostrar:
#   OPENROUTER_API_KEY=***
#   OPENROUTER_MODEL=***
```

**Importante**: la API key **nunca debe entrar al repositorio** ni al historial
de shell. Si por error queda en `~/.bash_history`, hay que borrarla.

## 4. Marco legal

### 4.1 Documento nuevo a crear

Slug: `ia-clinica`
Título: "Términos del Asistente IA"
`requires_acceptance`: `true`
`acceptance_audience`: `staff`
`public_path`: `null` (interno)

**Borrador inicial** (Otoniel/María lo pulen y publican):

```
1. Qué es el Asistente IA
2. Qué datos se procesan (notas que pegas, contexto mínimo del paciente)
3. Quién procesa (Anthropic Claude Haiku 4.5 vía OpenRouter, EEUU)
4. Garantías del proveedor (no uso para entrenamiento de modelos)
5. Tu responsabilidad clínica (la IA sugiere, tú decides)
6. Audit log (qué guardamos: tokens y timestamps; qué NO guardamos: contenido)
7. Cómo desactivarlo (Configuración → IA → desactivar)
8. Riesgos y limitaciones (alucinaciones, sesgo angloparlante)
9. Consentimiento del paciente (la psicóloga debe avisarle e idealmente
   incluir en su consentimiento clínico la cláusula de IA)
```

**Implementación**: agregar entrada a `LEGAL_DOCUMENTS_SEED` en
[`server/src/legal-seed.js`](../server/src/legal-seed.js) con el body_html
inicial. El backfill lo siembra como `draft` en el siguiente arranque y
Otoniel lo edita desde `/legal-admin`.

### 4.2 Términos de OpenRouter

Verificar antes de producción:
- ✅ OpenRouter NO usa los datos para entrenamiento por default.
- ⚠️ OpenRouter es proxy: el provider final (Anthropic) recibe los datos.
  Verificar que el endpoint específico está bajo "Privacy: stricter" (opt-out
  explícito de entrenamiento).
- ❌ No hay BAA formal — para escala futura, considerar migrar a Anthropic
  directo via AWS Bedrock con zero-retention.

### 4.3 Consentimiento del paciente

La plantilla de consentimiento del paciente (slug `consentimiento-paciente`)
debe ganar una cláusula opcional sobre uso de IA — Otoniel decide la redacción.
Esto NO bloquea la implementación: la psicóloga es responsable de avisar al
paciente independientemente.

## 5. Arquitectura técnica

### 5.1 Backend

**Nuevo archivo**: `server/src/routes/ai.js`

```
POST /api/ai/clinical-note/draft
  Auth: requireAuth
  Gate: user.is_platform_admin === true OR aceptó doc 'ia-clinica'
  Rate limit: 10/min por user, 200/día por workspace
  Body: {
    raw_notes: string (max 4000 chars),
    patient_id: string,
    note_kind: 'sesion' | 'evolucion'
  }
  Response 200: {
    soap: { s: string, o: string, a: string, p: string },
    model: string,
    tokens: { in: number, out: number },
    ms: number
  }
  Response 400: validation error
  Response 403: feature deshabilitada para este user
  Response 429: rate limit excedido
  Response 502: error del proveedor de IA
```

**Tabla nueva**: `ai_usage_log`

```sql
CREATE TABLE ai_usage_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  endpoint TEXT NOT NULL,           -- 'clinical-note/draft'
  model TEXT NOT NULL,              -- 'anthropic/claude-haiku-4-5'
  tokens_in INTEGER,
  tokens_out INTEGER,
  ms INTEGER,                       -- latencia
  success INTEGER NOT NULL,         -- 0 / 1
  error_kind TEXT,                  -- 'rate_limit' | 'provider_error' | null
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_ai_usage_workspace ON ai_usage_log(workspace_id, created_at);
```

**Migración**: agregar a `runMigrations()` en [`server/src/db.js`](../server/src/db.js)
con `CREATE TABLE IF NOT EXISTS`.

**Cliente OpenRouter**: usar `fetch` nativo de Node 22, no SDK.

```js
async function callOpenRouter({ system, user, max_tokens = 1500 }) {
  const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://psico.wailus.co",  // opcional, mejora rate limits
      "X-Title": "Psicomorfosis",                  // opcional
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL ?? "anthropic/claude-haiku-4-5",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens,
      temperature: 0.3,
      response_format: { type: "json_object" },
    }),
  });
  if (!resp.ok) throw new Error(`OpenRouter ${resp.status}: ${await resp.text()}`);
  return resp.json();
}
```

### 5.2 Prompt inicial (sujeto a iteración)

```
SYSTEM:
Eres un asistente que ayuda a psicólogos clínicos en Colombia a convertir
sus notas crudas de sesión al formato SOAP profesional. NO diagnosticas,
NO recomiendas medicación, NO inventas información que el psicólogo no
haya escrito. Solo organizas y estructuras lo que él/ella anotó.

Reglas estrictas:
- Mantén SIEMPRE el español colombiano profesional. No anglicismos.
- Si las notas no mencionan algo, deja ese campo VACÍO en vez de inventar.
- Usa tercera persona pasada: "El paciente refirió...", "Se observó...".
- Para escalas/tests aplicados: nómbralos si aparecen, NO los interpretes.
- Para riesgo (suicida, autolesión): si las notas mencionan algo, ponlo
  literal en O y en A marca "requiere evaluación de riesgo según protocolo".
- Devuelve JSON estricto: { "s": "...", "o": "...", "a": "...", "p": "..." }

Glosario SOAP:
- S (Subjetivo): lo que el paciente reporta. Síntomas, quejas, vivencias.
- O (Objetivo): observaciones del terapeuta. Apariencia, conducta, escalas
  aplicadas con sus puntajes brutos.
- A (Análisis): interpretación clínica del terapeuta. Hipótesis, formulación.
- P (Plan): técnicas usadas, tareas asignadas, próxima sesión, derivaciones.

CONTEXTO PACIENTE (opcional):
Nombre preferido: {preferredName}
Edad: {age}
Motivo de consulta: {motivoConsulta}

USER:
[Notas crudas que pegó la psicóloga]
```

### 5.3 Frontend

**Archivos a tocar**:
- [`src/routes/pacientes_.$id.tsx`](../src/routes/pacientes_.$id.tsx) — editor de notas SOAP
- [`src/lib/api.ts`](../src/lib/api.ts) — agregar método `aiClinicalNoteDraft`
- Nuevo: `src/components/ai/AiAssistantModal.tsx`
- [`src/routes/configuracion.tsx`](../src/routes/configuracion.tsx) — toggle en sección "IA"

**UX del modal**:

```
[✨ Asistente IA] (botón en el toolbar del editor SOAP)
    ↓ click
┌──────────────────────────────────────────────────┐
│  ✨ Asistente IA — Notas → Evolución SOAP    [X] │
├──────────────────────────────────────────────────┤
│ Pega aquí las notas crudas de la sesión:        │
│ ┌──────────────────────────────────────────────┐ │
│ │ <textarea>                                   │ │
│ │ ej: paciente refiere dificultad sueño 2 sem  │ │
│ └──────────────────────────────────────────────┘ │
│                                                  │
│ ℹ️ Las notas se procesan por un proveedor de IA  │
│ externo (Anthropic via OpenRouter, EEUU).        │
│ Los datos NO se usan para entrenamiento.         │
│ Tú eres responsable del contenido final.         │
│                                                  │
│  [Cancelar]            [Generar evolución]       │
└──────────────────────────────────────────────────┘
```

Después de generar:

```
┌──────────────────────────────────────────────────┐
│  Borrador generado — revisa antes de guardar    │
├──────────────────────────────────────────────────┤
│ S (Subjetivo)                                    │
│ ┌──────────────────────────────────────────────┐ │
│ │ Paciente refirió dificultad para conciliar... │ │
│ └──────────────────────────────────────────────┘ │
│ O (Objetivo) [...]                                │
│ A (Análisis) [...]                                │
│ P (Plan) [...]                                    │
│                                                   │
│ [Regenerar]  [Cancelar]  [Cargar al editor →]   │
└──────────────────────────────────────────────────┘
```

Al click en "Cargar al editor", los 4 campos se cargan en el formulario
principal de nota SOAP y el modal se cierra. La psicóloga puede editar
libremente antes de guardar.

**Metadata en la nota guardada**: agregar columna `generated_with_ai INTEGER`
(0/1) y `ai_model TEXT` a `clinical_notes`. Audit.

### 5.4 Settings / opt-in

En `/configuracion` agregar sección **"IA"** que muestra:

- Estado actual: "Activado" / "Desactivado"
- Toggle: al activar, abre modal con contenido del doc `ia-clinica` → "Acepto"
  → registra en `legal_acceptances` → habilita la feature
- Link al documento: "Ver términos del Asistente IA"
- Botón "Desactivar" si está activo (registra revocación, deshabilita feature)

## 6. Plan de implementación por bloques

| Bloque | Quién | Duración | Bloqueante de |
|---|---|---|---|
| **0. Recarga + API key** | Stiven | 15 min | Todo |
| **A. Doc legal `ia-clinica` en seed** | Claude | 30 min | Bloque D (settings opt-in) |
| **B. Backend completo (endpoint + tabla audit + cliente OR + rate limit)** | Claude | 1 día | Bloque C |
| **C. Frontend (modal + botón + integración con editor SOAP)** | Claude | 1 día | Pruebas |
| **D. Settings opt-in con aceptación del doc** | Claude | 0.5 día | Beta liberada |
| **E. Pruebas con Stiven (gating `is_platform_admin`)** | Claude + Stiven | 2-3 días | Iteración de prompt |
| **F. Otoniel publica `ia-clinica`** | Otoniel | a su ritmo | Fase 2 |
| **G. Liberación a Nathaly + Valentina como early adopters** | Stiven | manual | Fase 3 |
| **H. Liberación general** | Stiven | manual | — |

**Total estimado de desarrollo (A-D)**: ~3 días de trabajo. **Pruebas e
iteración (E)**: depende de feedback.

## 7. Plan de pruebas

### 7.1 Pruebas funcionales en Bloque E

Set de notas de prueba que cubre casos diversos:
1. Nota corta y clara (caso ideal).
2. Nota larga con datos mezclados.
3. Nota con menciones a riesgo suicida (verificar que NO minimiza).
4. Nota con tests aplicados (verificar que NO interpreta puntajes).
5. Nota con nombres propios y datos identificatorios (verificar privacidad).
6. Nota en spanglish (verificar que normaliza a español).
7. Nota incompleta / fragmentada.
8. Nota sobre un menor (verificar tono y consideraciones especiales).

Por cada caso, evaluar:
- ¿El SOAP tiene los 4 campos coherentes?
- ¿Hay alucinaciones (info que no estaba en la nota)?
- ¿El tono es profesional?
- ¿Hay anglicismos / errores de español?
- ¿Tiempo de respuesta razonable (< 5s)?

### 7.2 Pruebas de seguridad

- Intentar usar el endpoint sin estar autenticado → 401.
- Intentar usar el endpoint con un user que no es platform_admin (fase 1) → 403.
- Intentar usar el endpoint con `patient_id` de otro workspace → 403/404.
- Saturar el endpoint para verificar rate limit → 429.
- Verificar que `ai_usage_log` NO guarda contenido de las notas.

### 7.3 Pruebas de costos

Después de 1 semana de uso de Stiven, verificar:
- Total de tokens consumidos (suma de `ai_usage_log`).
- Costo equivalente (multiplicar por precio del modelo).
- Proyección si todos los usuarios lo usaran igual.
- ¿El rate limit es razonable o muy restrictivo?

## 8. Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Alucinación clínica (IA inventa síntoma no escrito) | Media | Alto | Prompt riguroso + label "borrador" siempre + preview editable obligatorio |
| Sanción SIC por procesamiento no autorizado | Baja con doc publicado | Alto | Doc `ia-clinica` con aceptación expresa antes de habilitar |
| Costos explosivos por uso indebido | Baja | Bajo | Rate limit + monitoreo de `ai_usage_log` |
| OpenRouter cae / cambia precios | Media | Medio | Modelo intercambiable con env var |
| API key fugada | Baja | Alto | Solo en env var de PM2, nunca en git, rotación posible en OpenRouter |
| Paciente no autoriza uso de IA | Media | Bajo | La psicóloga decide caso por caso; toggle desactivable |

## 9. Estado actual y próximo paso

**Estado**: solo planeación. Cero código tocado.

**Próximo paso bloqueante**: Stiven completa el paso 0 (recargar OpenRouter
y setear `OPENROUTER_API_KEY` + `OPENROUTER_MODEL` en `ecosystem.config.cjs`).

**Cuando esté listo**: en una nueva sesión, abrir este documento, comenzar
por Bloque A (doc legal) y avanzar secuencialmente. La sesión donde se
arranque NO requiere contexto previo — este documento es autocontenido.

## 10. Pendientes / observaciones

- [ ] **Audio de psicóloga sobre plataforma anterior**: Stiven va a compartir
  un audio donde una psicóloga describe su experiencia con una plataforma
  competidora que usa IA. Cuando llegue, incorporar observaciones a este
  documento (probablemente en sección 5.3 UX y/o sección 6 priorización).
- [ ] Investigar si OpenRouter ofrece zero-retention explícito en su contrato.
- [ ] Definir el texto exacto del documento `ia-clinica` (Otoniel lo redacta;
  Claude puede preparar un borrador en Bloque A para que él solo pula).
- [ ] Decidir si la nota guardada con `generated_with_ai: true` se distingue
  visualmente en el historial del paciente (sello "✨ IA-asistida") o queda
  invisible al usuario final.
