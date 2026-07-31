# Dictado por voz (Whisper) — cómo funciona y cómo portarlo

Guía de la integración de voz-a-texto de Psicomorfosis, escrita para poder
**copiar la feature a otro proyecto** sin arqueología. Fuentes de verdad en
este repo: `src/lib/useVoiceRecorder.ts` (captura), `server/src/routes/voice.js`
(proxy), `src/components/app/VoiceRecorderButton.tsx` (UI).

## Arquitectura en una línea

```
Micrófono → MediaRecorder (browser) → Blob webm/opus
  → POST multipart a NUESTRO backend (/api/voice/transcribe)
  → backend reenvía a OpenAI /v1/audio/transcriptions
  → texto plano de vuelta al cliente
```

**Regla de oro: la API key de OpenAI NUNCA toca el navegador.** El backend es
un proxy delgado; el cliente solo habla con nuestro servidor autenticado.

## Modelo

| Qué | Valor |
|---|---|
| Modelo | **`gpt-4o-transcribe`** (la generación nueva de Whisper) |
| Endpoint | `POST https://api.openai.com/v1/audio/transcriptions` |
| Auth | `Authorization: Bearer <OPENAI_API_KEY>` (solo server-side) |
| Costo | ~$0.006/min (`gpt-4o-mini-transcribe` cuesta la mitad y sirve para dictado casual) |
| Límite | 25 MB por archivo (~5 min de webm/opus caben sobrados) |
| Alternativa legacy | `whisper-1` (mismo endpoint, mismo contrato) |

## Lado cliente — captura (`useVoiceRecorder.ts`)

Hook React que encapsula `MediaRecorder`. Lo esencial para portar:

1. **Pedir micrófono con procesamiento**:
   ```js
   navigator.mediaDevices.getUserMedia({
     audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
   });
   ```
2. **Elegir mime por soporte** (Chrome/Firefox → `audio/webm;codecs=opus`,
   Safari → `audio/mp4`). Probar con `MediaRecorder.isTypeSupported()` en
   orden: `webm;codecs=opus` → `webm` → `mp4` → `ogg`. Whisper acepta todos.
3. **⚠️ `recorder.start(1000)` con timeslice — el gotcha más importante.**
   Sin timeslice, algunos browsers pierden el chunk final del `stop()` y el
   audio llega cortado (síntoma real que tuvimos: "solo transcribe las dos
   primeras palabras"). Con `timeslice=1000` el recorder emite
   `ondataavailable` cada segundo y los chunks intermedios están
   garantizados. Acumularlos en un array y armar el Blob en `onstop`.
4. **Indicador de volumen** (opcional, para UX): `AudioContext` +
   `AnalyserNode` (fftSize 512) + loop de `requestAnimationFrame` calculando
   RMS del dominio temporal. Nivel ≈ `min(1, rms * 4)`.
5. **Higiene obligatoria**: al parar/cancelar/desmontar, hacer
   `stream.getTracks().forEach(t => t.stop())` y cerrar el AudioContext —
   si no, el LED de "micrófono en uso" del SO queda encendido.
6. **Auto-stop** a los 5 min (timer) para que un dictado olvidado no crezca
   hasta el límite de 25 MB.

## Lado cliente — envío (`api.ts → transcribeAudio`)

```js
const form = new FormData();
form.append("audio", blob, "dictado.webm");   // field name: "audio"
const res = await fetch("/api/voice/transcribe", {
  method: "POST",
  headers: { Authorization: `Bearer ${token}` },  // tu auth normal
  body: form,   // NO poner Content-Type manual: fetch arma el boundary
});
const { success, text, error } = await res.json();
```

## Lado servidor — proxy (`server/src/routes/voice.js`)

Express + multer con **memoryStorage** (el audio nunca toca disco — requisito
de privacidad clínica; en otro proyecto puede ser irrelevante, pero es gratis).

```js
import multer from "multer";
const upload = multer({ storage: multer.memoryStorage(),
                        limits: { fileSize: 25 * 1024 * 1024, files: 1 } });

router.post("/transcribe", requireAuth, rateLimiter, upload.single("audio"), async (req, res) => {
  // FormData y Blob NATIVOS de Node 18+ — cero dependencias extra.
  const filename = req.file.originalname || "audio.webm";  // ⚠️ OpenAI EXIGE
  const blob = new Blob([req.file.buffer], { type: req.file.mimetype || "audio/webm" });
  const form = new FormData();
  form.append("file", blob, filename);        // ⚠️ nombre con extensión válida
  form.append("model", "gpt-4o-transcribe");
  form.append("language", "es");              // hint: precisión + velocidad
  form.append("response_format", "text");     // string plano, sin JSON verbose

  const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form,
  });
  if (!r.ok) return res.status(502).json({ success: false, error: "Transcripción rechazada" });
  res.json({ success: true, text: (await r.text()).trim() });
});
```

### Gotchas del servidor (los que nos mordieron de verdad)

1. **El `filename` en `form.append("file", blob, filename)` es OBLIGATORIO
   y debe tener extensión válida** (`.webm`, `.mp4`, `.mp3`, `.wav`, `.ogg`).
   Sin él, OpenAI responde 400 "Invalid file format" aunque el audio esté
   perfecto. Es el error #1 al portar esta integración.
2. **Leer `process.env.OPENAI_API_KEY` de forma LAZY** (dentro del handler,
   no a nivel de módulo). En ESM los imports se evalúan ANTES del
   `dotenv.config()` del entry point → a nivel de módulo la key siempre es
   `undefined`. (Bug real de este repo, mismo patrón en mailer.js.)
3. **Rate limit por usuario** (30 req / 5 min por user id, no por IP — un
   consultorio con varios psicólogos comparte IP).
4. `response_format: "text"` evita parsear JSON; si necesitas timestamps
   por palabra usa `verbose_json` + `timestamp_granularities`.

## Checklist para portar a otro proyecto

- [ ] `OPENAI_API_KEY` en el `.env` del **servidor** (jamás `VITE_*`/cliente)
- [ ] Endpoint proxy con multer memoryStorage + auth + rate limit
- [ ] `form.append("file", blob, "audio.webm")` — con extensión
- [ ] Cliente: MediaRecorder con `start(1000)` (timeslice) + pickMime()
- [ ] Cleanup de tracks + AudioContext al parar/desmontar
- [ ] `language` hint del idioma principal de tus usuarios
- [ ] HTTPS en producción — `getUserMedia` no funciona en http:// (salvo localhost)
