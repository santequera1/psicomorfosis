# Smoke tests — Psicomorfosis

Suite de ~30 checks sobre endpoints críticos del backend. Corre
en < 30s. Sirve para detectar regresiones grandes antes de que
los usuarios las reporten.

Historia de bugs que estos tests atrapan:

- **Invite público bloqueado por auth ajena** — un `router.use(requireAuth)`
  en el router de Laura estaba interceptando `/api/patient-invite/:token`
  antes de llegar a `portalRoutes`, devolviendo 401 en lugar de la
  metadata pública. Los pacientes veían "Invitación no válida".
  → Test #6: `Invite endpoint PÚBLICO (token inválido → 404, NO 401)`.

- **Staff JWT en portal del paciente = 403 en cascada** — el localStorage
  del staff y del portal son la misma key; si un staff abre `/p/*` con su
  token, todos los endpoints del portal devuelven 403 y la UI queda en
  loop de reintentos.
  → Test: `Staff JWT en portal → 403 (protección de rol)`.

- **Sesión sliding rota** — antes el JWT expiraba en 24h fijas. Ahora
  se renueva mientras haya actividad.
  → Indirectamente cubierto: los smoke corren un login real y usan el
  token para 6 endpoints — si el token no anda, todos fallan.

- **Bot auth global bloqueando `/api/*`** — mismo patrón que el bug del
  invite: si algún router monta un middleware global sin prefijo, rompe
  todos los endpoints públicos que van después.
  → Test #6 (invite) es el canario principal para esto.

---

## Instalación (una vez)

```bash
cd smoke
cp smoke.env.example smoke.env
# editá smoke.env con tus credenciales
chmod +x smoke.sh
```

Requiere `bash 4+`, `curl`, y opcionalmente `jq` (mejor output JSON).

## Uso

### Local, ver en terminal
```bash
./smoke.sh
```

Output tipo:
```
── 1. Público / infraestructura ──
[  1] PASS ✓ Front SSR responde (200)
[  2] PASS ✓ API viva (laura/health sin token = 401) (401)
...

── SUMMARY ──
Total:    23
Passed:   23
Failed:   0
Skipped:  0
Duration: 6s

✓ Todos los tests pasaron
```

### Verbose (imprime body de responses)
```bash
./smoke.sh --verbose
```

### JSON estructurado (para consumo por subagente)
```bash
./smoke.sh --json
```

Emite una línea JSON por test + una final con el summary:
```json
{"n":1,"status":"pass","name":"Front SSR responde","method":"GET","path":"/","http":200}
{"n":2,"status":"pass","name":"API viva ...","method":"GET","path":"/api/laura/health","http":401}
...
{"kind":"summary","total":23,"passed":23,"failed":0,"skipped":0,"duration_s":6,"result":"pass","failures":[]}
```

### Exit code
- `0` = todo pasó
- `1` = al menos un test falló

Sirve para cron y CI:
```bash
./smoke.sh > /var/log/smoke.log 2>&1 || \
  curl -X POST "https://ntfy.sh/mi-canal" -d "Smoke tests fallando en $(date)"
```

---

## Correr desde un subagente

Ver [AGENT_PROMPT.md](AGENT_PROMPT.md) — instrucciones específicas para
que Codex, Claude Haiku, o cualquier LLM con acceso a shell corra esto
periódicamente y reporte al usuario.

---

## Qué NO cubre (aún)

- **Envío real de emails** — no queremos spammear al psicólogo demo.
  El test se limita a verificar que el endpoint que dispara email
  responde OK (el email real es best-effort async).
- **Streaming de Laura** (SSE) — bash + curl con streaming es feo.
  El test verifica que `/api/laura/health` responde y que `/laura/quota`
  con token válido devuelve 200. El chat real requiere WebSocket-like
  handling.
- **Front interactivo** — solo verifica que el SSR devuelve 200. La UX
  (formularios, tests, agenda) requiere Playwright — otro proyecto.
- **Firma de documentos** — el token de firma vive 5 días y no vamos
  a generar/consumir uno por corrida.

---

## Agregar tests nuevos

Cada test es una línea:

```bash
test_case "Nombre del test" HTTP_CODE_ESPERADO METHOD /path
```

Con headers y body:

```bash
test_case "Con auth y body" 200 POST "/api/foo" \
  "Authorization: Bearer $STAFF_TOKEN" \
  "Content-Type: application/json" \
  -- '{"foo":"bar"}'
```

Convención: agregalos a la sección más apropiada (público, bot, staff,
portal) para que la salida quede organizada.

---

## Troubleshooting

**Todo falla con `HTTP=000`**  
El VPS está caído o hay problema de red. Verificá `curl -m 5 -o /dev/null -w "%{http_code}" https://psico.wailus.co`.

**Login staff falla (401)**  
Probá el login manual desde `psico.wailus.co/login`. Si tampoco anda, la
password cambió; actualizá `smoke.env`.

**Login paciente falla**  
El paciente demo puede no haber activado su cuenta todavía, o el email
en `smoke.env` no corresponde. Confirmar con Stiven cuál usar.

**Portal endpoints devuelven 404**  
La ruta puede haber cambiado. Chequeá `server/src/routes/portal.js`
para ver los paths reales (algunos usan español, algunos inglés).
