#!/usr/bin/env bash
#
# smoke.sh — Smoke tests para Psicomorfosis
#
# Ejecuta ~30 checks sobre endpoints críticos (públicos, staff, portal
# paciente, bot). Diseñado para correr desde CI, cron, o un subagente
# LLM. Output parseable, exit 0 = OK, exit 1 = algún fallo.
#
# Uso:
#   cp smoke.env.example smoke.env
#   # editá smoke.env con tus credenciales
#   ./smoke.sh
#   ./smoke.sh --verbose    # imprime body de responses
#   ./smoke.sh --json       # output JSON estructurado (para el subagente)
#
# Dependencias: bash 4+, curl, jq (opcional pero recomendado para JSON output).

set -uo pipefail
IFS=$'\n\t'

# ─── Config ──────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SMOKE_ENV_FILE:-$SCRIPT_DIR/smoke.env}"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a; source "$ENV_FILE"; set +a
fi

: "${BASE_URL:=https://psico.wailus.co}"
: "${TIMEOUT_SEC:=15}"
: "${BOT_API_KEY:=}"
: "${STAFF_EMAIL:=}"
: "${STAFF_PASSWORD:=}"
: "${PATIENT_EMAIL:=}"
: "${PATIENT_PASSWORD:=}"
: "${STAFF_PHONE:=}"       # para bot/identify
: "${PATIENT_PHONE:=}"     # para bot/identify + opt-in
: "${UNKNOWN_PHONE:=+57 111 111 1111}"

VERBOSE=false
JSON_OUTPUT=false
for arg in "$@"; do
  case "$arg" in
    --verbose|-v) VERBOSE=true ;;
    --json) JSON_OUTPUT=true ;;
    --help|-h)
      grep -E "^# " "$0" | head -20 | sed 's/^# //'
      exit 0
      ;;
  esac
done

# ─── State ───────────────────────────────────────────────────────────
declare -i TOTAL=0 PASSED=0 FAILED=0 SKIPPED=0
declare -a FAILURES=()
START_TIME=$(date +%s)
STAFF_TOKEN=""
PATIENT_TOKEN=""

# ─── Colors (solo en TTY, no en JSON) ────────────────────────────────
if [[ -t 1 ]] && [[ "$JSON_OUTPUT" == "false" ]]; then
  C_GREEN=$'\033[32m'; C_RED=$'\033[31m'; C_YELLOW=$'\033[33m'
  C_DIM=$'\033[2m'; C_BOLD=$'\033[1m'; C_RESET=$'\033[0m'
else
  C_GREEN=""; C_RED=""; C_YELLOW=""; C_DIM=""; C_BOLD=""; C_RESET=""
fi

# ─── Helpers ─────────────────────────────────────────────────────────

# test_case NAME EXPECTED_STATUS METHOD URL [HEADERS...] [-- BODY]
# Ej:
#   test_case "Front carga" 200 GET /
#   test_case "Bot identify staff" 200 POST /api/bot/identify \
#     "X-Bot-Api-Key: $BOT_API_KEY" \
#     "Content-Type: application/json" \
#     -- '{"phone":"+57 304 219 0650"}'
test_case() {
  local name="$1"; shift
  local expected="$1"; shift
  local method="$1"; shift
  local path="$1"; shift

  local -a headers=()
  local body=""
  local in_body=false
  for arg in "$@"; do
    if [[ "$arg" == "--" ]]; then in_body=true; continue; fi
    if $in_body; then body="$arg"; else headers+=("-H" "$arg"); fi
  done

  TOTAL+=1
  local idx; idx=$(printf "%3d" "$TOTAL")

  local url="${BASE_URL}${path}"
  local tmp_body; tmp_body=$(mktemp)
  local response_code
  local curl_args=(-sS -o "$tmp_body" -w "%{http_code}" -m "$TIMEOUT_SEC" -X "$method")
  # shellcheck disable=SC2206
  curl_args+=("${headers[@]}")
  if [[ -n "$body" ]]; then curl_args+=(-d "$body"); fi
  curl_args+=("$url")

  response_code=$(curl "${curl_args[@]}" 2>/dev/null || echo "000")
  # tr -d '\0' evita el warning "ignored null byte in input" cuando
  # el response es HTML con blobs binarios (algunos SSR y fuentes
  # inline). Solo afecta al preview del body, no al status HTTP.
  local response_body; response_body=$(tr -d '\0' < "$tmp_body")
  rm -f "$tmp_body"

  if [[ "$response_code" == "$expected" ]]; then
    PASSED+=1
    if $JSON_OUTPUT; then
      printf '{"n":%d,"status":"pass","name":%s,"method":"%s","path":"%s","http":%s}\n' \
        "$TOTAL" "$(jq -Rn --arg s "$name" '$s' 2>/dev/null || echo "\"$name\"")" \
        "$method" "$path" "$response_code"
    else
      printf "[%s] %s%s ✓%s %s (%s)\n" \
        "$idx" "$C_GREEN" "PASS" "$C_RESET" "$name" "$response_code"
      $VERBOSE && [[ -n "$response_body" ]] && printf "%s     └─ %s%s\n" \
        "$C_DIM" "$(echo "$response_body" | head -c 200)" "$C_RESET"
    fi
    return 0
  fi

  FAILED+=1
  FAILURES+=("$name")
  if $JSON_OUTPUT; then
    printf '{"n":%d,"status":"fail","name":%s,"method":"%s","path":"%s","expected":%s,"actual":%s,"body":%s}\n' \
      "$TOTAL" "$(jq -Rn --arg s "$name" '$s' 2>/dev/null || echo "\"$name\"")" \
      "$method" "$path" "$expected" "$response_code" \
      "$(jq -Rn --arg b "$(echo "$response_body" | head -c 300)" '$b' 2>/dev/null || echo "\"?\"")"
  else
    printf "[%s] %s✗ FAIL%s %s\n" \
      "$idx" "$C_RED" "$C_RESET" "$name"
    printf "%s      %s %s%s\n" "$C_DIM" "$method" "$path" "$C_RESET"
    printf "      expected: %s, got: %s%s%s\n" "$expected" "$C_RED" "$response_code" "$C_RESET"
    [[ -n "$response_body" ]] && printf "%s      body: %s%s\n" \
      "$C_DIM" "$(echo "$response_body" | head -c 300)" "$C_RESET"
  fi
  return 1
}

# test_body NAME EXPECTED_STATUS EXPECTED_BODY_SUBSTRING METHOD URL [HEADERS...] [-- BODY]
# Como test_case pero además exige que el body contenga un substring.
# Necesario cuando el status no basta para distinguir el origen de la
# respuesta (p.ej. dos middlewares distintos que devuelven 401).
test_body() {
  local name="$1"; shift
  local expected="$1"; shift
  local expected_substr="$1"; shift
  local method="$1"; shift
  local path="$1"; shift

  local -a headers=()
  local body=""
  local in_body=false
  for arg in "$@"; do
    if [[ "$arg" == "--" ]]; then in_body=true; continue; fi
    if $in_body; then body="$arg"; else headers+=("-H" "$arg"); fi
  done

  TOTAL+=1
  local idx; idx=$(printf "%3d" "$TOTAL")
  local url="${BASE_URL}${path}"
  local tmp_body; tmp_body=$(mktemp)
  local curl_args=(-sS -o "$tmp_body" -w "%{http_code}" -m "$TIMEOUT_SEC" -X "$method")
  curl_args+=("${headers[@]}")
  if [[ -n "$body" ]]; then curl_args+=(-d "$body"); fi
  curl_args+=("$url")
  local response_code; response_code=$(curl "${curl_args[@]}" 2>/dev/null || echo "000")
  local response_body; response_body=$(tr -d '\0' < "$tmp_body")
  rm -f "$tmp_body"

  if [[ "$response_code" == "$expected" && "$response_body" == *"$expected_substr"* ]]; then
    PASSED+=1
    if $JSON_OUTPUT; then
      printf '{"n":%d,"status":"pass","name":%s,"method":"%s","path":"%s","http":%s}\n' \
        "$TOTAL" "$(jq -Rn --arg s "$name" '$s' 2>/dev/null || echo "\"$name\"")" \
        "$method" "$path" "$response_code"
    else
      printf "[%s] %s%s ✓%s %s (%s + body ok)\n" \
        "$idx" "$C_GREEN" "PASS" "$C_RESET" "$name" "$response_code"
    fi
    return 0
  fi

  FAILED+=1
  FAILURES+=("$name")
  if $JSON_OUTPUT; then
    printf '{"n":%d,"status":"fail","name":%s,"method":"%s","path":"%s","expected":%s,"actual":%s,"body":%s}\n' \
      "$TOTAL" "$(jq -Rn --arg s "$name" '$s' 2>/dev/null || echo "\"$name\"")" \
      "$method" "$path" "$expected" "$response_code" \
      "$(jq -Rn --arg b "$(echo "$response_body" | head -c 300)" '$b' 2>/dev/null || echo "\"?\"")"
  else
    printf "[%s] %s✗ FAIL%s %s\n" "$idx" "$C_RED" "$C_RESET" "$name"
    printf "%s      %s %s%s\n" "$C_DIM" "$method" "$path" "$C_RESET"
    printf "      expected: %s + body con «%s», got: %s%s%s\n" \
      "$expected" "$expected_substr" "$C_RED" "$response_code" "$C_RESET"
    [[ -n "$response_body" ]] && printf "%s      body: %s%s\n" \
      "$C_DIM" "$(echo "$response_body" | head -c 300)" "$C_RESET"
  fi
  return 1
}

skip_case() {
  local name="$1"; shift
  local reason="$1"; shift
  TOTAL+=1
  SKIPPED+=1
  local idx; idx=$(printf "%3d" "$TOTAL")
  if $JSON_OUTPUT; then
    printf '{"n":%d,"status":"skip","name":%s,"reason":%s}\n' \
      "$TOTAL" \
      "$(jq -Rn --arg s "$name" '$s' 2>/dev/null || echo "\"$name\"")" \
      "$(jq -Rn --arg r "$reason" '$r' 2>/dev/null || echo "\"$reason\"")"
  else
    printf "[%s] %s— SKIP%s %s %s(%s)%s\n" \
      "$idx" "$C_YELLOW" "$C_RESET" "$name" "$C_DIM" "$reason" "$C_RESET"
  fi
}

section() {
  $JSON_OUTPUT && return
  printf "\n%s%s%s\n" "$C_BOLD" "── $1 ──" "$C_RESET"
}

# Login staff → guarda token en $STAFF_TOKEN
staff_login() {
  if [[ -z "$STAFF_EMAIL" || -z "$STAFF_PASSWORD" ]]; then return 1; fi
  local body; body=$(printf '{"username":"%s","password":"%s"}' "$STAFF_EMAIL" "$STAFF_PASSWORD")
  local resp; resp=$(curl -sS -m "$TIMEOUT_SEC" -X POST \
    "${BASE_URL}/api/auth/login" \
    -H "Content-Type: application/json" -d "$body" 2>/dev/null)
  STAFF_TOKEN=$(echo "$resp" | jq -r '.token // empty' 2>/dev/null || \
                 echo "$resp" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
  [[ -n "$STAFF_TOKEN" ]]
}

# Login paciente → guarda token en $PATIENT_TOKEN
patient_login() {
  if [[ -z "$PATIENT_EMAIL" || -z "$PATIENT_PASSWORD" ]]; then return 1; fi
  local body; body=$(printf '{"email":"%s","password":"%s"}' "$PATIENT_EMAIL" "$PATIENT_PASSWORD")
  local resp; resp=$(curl -sS -m "$TIMEOUT_SEC" -X POST \
    "${BASE_URL}/api/auth/patient/login" \
    -H "Content-Type: application/json" -d "$body" 2>/dev/null)
  PATIENT_TOKEN=$(echo "$resp" | jq -r '.token // empty' 2>/dev/null || \
                   echo "$resp" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
  [[ -n "$PATIENT_TOKEN" ]]
}

# ═════════════════════════════════════════════════════════════════════
# SUITE
# ═════════════════════════════════════════════════════════════════════

if ! $JSON_OUTPUT; then
  printf "%sSmoke test — Psicomorfosis%s\n" "$C_BOLD" "$C_RESET"
  printf "%sBase URL: %s%s\n" "$C_DIM" "$BASE_URL" "$C_RESET"
  printf "%sStarted:  %s%s\n" "$C_DIM" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$C_RESET"
fi

# ─── 1. Público (sin auth) ───────────────────────────────────────────
section "1. Público / infraestructura"

test_case "Front SSR responde" 200 GET "/"
test_case "API viva (laura/health sin token = 401)" 401 GET "/api/laura/health"
test_case "Página /privacidad carga" 200 GET "/privacidad"
test_case "Página /terminos carga" 200 GET "/terminos"

# CRÍTICO: este endpoint DEBE ser público. Un 401 acá indicaría que
# algún router con router.use(requireAuth) está bloqueando /api/*
# antes de llegar a portalRoutes (regresión histórica arreglada
# en commit 77d1846).
test_case "Invite endpoint PÚBLICO (token inválido → 404, NO 401)" 404 \
  GET "/api/patient-invite/token_inexistente_dummy_xxx"

# Igual — /api/auth/patient/login debe ser público
test_case "Login paciente PÚBLICO (creds vacías → 400)" 400 \
  POST "/api/auth/patient/login" \
  "Content-Type: application/json" \
  -- '{}'

# CRÍTICO: guardia contra INTERCEPTACIÓN de routers montados en /api a
# secas (misma clase de bug dos veces: laura.js jul-2026 con requireAuth
# global, bot.js jul-2026 con requireBotApiKey global). notes y diagnoses
# van montados al FINAL de la cadena — si algún router intermedio mete un
# router.use(middleware) sin scope, estos requests devuelven el error del
# interceptor en vez de "Missing token" del requireAuth legítimo.
# Se valida el BODY, no solo el status (ambos casos son 401).
test_body "notes sin token llega a requireAuth (no interceptado)" 401 "Missing token" \
  GET "/api/patients/P-0000-smoke/notes"
test_body "diagnoses sin token llega a requireAuth (no interceptado)" 401 "Missing token" \
  GET "/api/patients/P-0000-smoke/diagnoses"
# error-reports es PÚBLICO por diseño (reporta errores de usuarios sin
# sesión) y también va al final de la cadena — 401 = interceptado.
test_case "error-reports PÚBLICO (no interceptado)" 201 \
  POST "/api/error-reports" \
  "Content-Type: application/json" \
  -- '{"message":"[smoke] canary de interceptación de routers","source":"smoke.sh"}'

# ─── 2. Bot API ──────────────────────────────────────────────────────
section "2. Bot Laura (WhatsApp)"

if [[ -z "$BOT_API_KEY" ]]; then
  skip_case "Bot health con API key" "BOT_API_KEY no configurada"
  skip_case "Bot identify - staff" "BOT_API_KEY no configurada"
  skip_case "Bot identify - unknown" "BOT_API_KEY no configurada"
  skip_case "Bot appointment-vocab" "BOT_API_KEY no configurada"
  skip_case "Bot identify sin API key → 401" "BOT_API_KEY no configurada"
else
  test_case "Bot health con API key" 200 GET "/api/bot/health" \
    "X-Bot-Api-Key: $BOT_API_KEY"

  test_case "Bot sin API key → 401" 401 GET "/api/bot/health"

  test_case "Bot con API key inválida → 401" 401 GET "/api/bot/health" \
    "X-Bot-Api-Key: nope_wrong_key"

  test_case "Bot appointment-vocab (documentativo)" 200 GET "/api/bot/appointment-vocab" \
    "X-Bot-Api-Key: $BOT_API_KEY"

  if [[ -n "$STAFF_PHONE" ]]; then
    test_case "Bot identify — staff conocido" 200 POST "/api/bot/identify" \
      "X-Bot-Api-Key: $BOT_API_KEY" \
      "Content-Type: application/json" \
      -- "{\"phone\":\"$STAFF_PHONE\"}"
  else
    skip_case "Bot identify - staff" "STAFF_PHONE no configurado"
  fi

  test_case "Bot identify — desconocido → 404" 404 POST "/api/bot/identify" \
    "X-Bot-Api-Key: $BOT_API_KEY" \
    "Content-Type: application/json" \
    -- "{\"phone\":\"$UNKNOWN_PHONE\"}"

  if [[ -n "$PATIENT_PHONE" ]]; then
    test_case "Bot identify — paciente conocido" 200 POST "/api/bot/identify" \
      "X-Bot-Api-Key: $BOT_API_KEY" \
      "Content-Type: application/json" \
      -- "{\"phone\":\"$PATIENT_PHONE\"}"

    # Idempotente — no cambia estado clínico. Solo actualiza el flag.
    test_case "Bot opt-in paciente" 200 POST "/api/bot/opt-in" \
      "X-Bot-Api-Key: $BOT_API_KEY" \
      "Content-Type: application/json" \
      -- "{\"phone\":\"$PATIENT_PHONE\"}"
  else
    skip_case "Bot identify - paciente" "PATIENT_PHONE no configurado"
    skip_case "Bot opt-in paciente" "PATIENT_PHONE no configurado"
  fi

  test_case "Bot risk-flag con phone inexistente → 404" 404 POST "/api/bot/risk-flag" \
    "X-Bot-Api-Key: $BOT_API_KEY" \
    "Content-Type: application/json" \
    -- "{\"phone\":\"$UNKNOWN_PHONE\",\"severity\":\"low\",\"category\":\"smoke_test\",\"snippet\":\"test\",\"confidence\":0.5}"

  test_case "Bot risk-flag rechaza severity inválida → 400" 400 POST "/api/bot/risk-flag" \
    "X-Bot-Api-Key: $BOT_API_KEY" \
    "Content-Type: application/json" \
    -- "{\"phone\":\"$UNKNOWN_PHONE\",\"severity\":\"potato\",\"snippet\":\"test\"}"
fi

# ─── 3. Staff auth flow ──────────────────────────────────────────────
section "3. Login staff + endpoints protegidos"

if [[ -z "$STAFF_EMAIL" || -z "$STAFF_PASSWORD" ]]; then
  skip_case "Staff login" "STAFF_EMAIL/PASSWORD no configurados"
  skip_case "Staff GET /patients (con token)" "STAFF_EMAIL/PASSWORD no configurados"
  skip_case "Staff GET /appointments (con token)" "STAFF_EMAIL/PASSWORD no configurados"
  skip_case "Staff GET /tasks (con token)" "STAFF_EMAIL/PASSWORD no configurados"
  skip_case "Staff GET /documents (con token)" "STAFF_EMAIL/PASSWORD no configurados"
  skip_case "Staff GET /laura/quota (con token)" "STAFF_EMAIL/PASSWORD no configurados"
elif staff_login; then
  test_case "Staff login OK — devolvió token" 200 POST "/api/auth/login" \
    "Content-Type: application/json" \
    -- "{\"username\":\"$STAFF_EMAIL\",\"password\":\"$STAFF_PASSWORD\"}"

  # Endpoints con token
  test_case "Staff GET /patients" 200 GET "/api/patients" \
    "Authorization: Bearer $STAFF_TOKEN"

  test_case "Staff GET /appointments" 200 GET "/api/appointments" \
    "Authorization: Bearer $STAFF_TOKEN"

  test_case "Staff GET /tasks" 200 GET "/api/tasks" \
    "Authorization: Bearer $STAFF_TOKEN"

  test_case "Staff GET /documents" 200 GET "/api/documents" \
    "Authorization: Bearer $STAFF_TOKEN"

  test_case "Staff GET /laura/quota (con token)" 200 GET "/api/laura/quota" \
    "Authorization: Bearer $STAFF_TOKEN"

  test_case "Staff GET /settings" 200 GET "/api/settings" \
    "Authorization: Bearer $STAFF_TOKEN"

  # Token inválido → 401
  test_case "GET /patients con token roto → 401" 401 GET "/api/patients" \
    "Authorization: Bearer token_invalido_dummy"
else
  test_case "Staff login" 200 POST "/api/auth/login" \
    "Content-Type: application/json" \
    -- "{\"username\":\"$STAFF_EMAIL\",\"password\":\"$STAFF_PASSWORD\"}"
  skip_case "Staff endpoints" "login falló, saltando"
fi

# ─── 4. Portal paciente ──────────────────────────────────────────────
section "4. Portal paciente (auth + endpoints)"

if [[ -z "$PATIENT_EMAIL" || -z "$PATIENT_PASSWORD" ]]; then
  skip_case "Patient login" "PATIENT_EMAIL/PASSWORD no configurados"
  skip_case "Patient GET portal endpoints" "PATIENT_EMAIL/PASSWORD no configurados"
elif patient_login; then
  test_case "Patient login OK — devolvió token" 200 POST "/api/auth/patient/login" \
    "Content-Type: application/json" \
    -- "{\"email\":\"$PATIENT_EMAIL\",\"password\":\"$PATIENT_PASSWORD\"}"

  # Endpoints del portal — usan requirePatient (JWT del paciente)
  # Ojo: si algún día se agrega el prefijo /api/portal, actualizar acá.
  test_case "Patient GET /portal/inicio" 200 GET "/api/portal/inicio" \
    "Authorization: Bearer $PATIENT_TOKEN"

  test_case "Patient GET /portal/citas" 200 GET "/api/portal/citas" \
    "Authorization: Bearer $PATIENT_TOKEN"

  test_case "Patient GET /portal/tareas" 200 GET "/api/portal/tareas" \
    "Authorization: Bearer $PATIENT_TOKEN"

  test_case "Patient GET /portal/documentos" 200 GET "/api/portal/documentos" \
    "Authorization: Bearer $PATIENT_TOKEN"

  test_case "Patient GET /portal/tests" 200 GET "/api/portal/tests" \
    "Authorization: Bearer $PATIENT_TOKEN"

  # CRÍTICO: staff JWT en endpoints del portal → 403 wrong_role
  # (esta cascada de 403 nos costó tiempo en el pasado; hay memory
  # sobre esto en portal-staff-localstorage.md).
  if [[ -n "$STAFF_TOKEN" ]]; then
    test_case "Staff JWT en portal → 403 (protección de rol)" 403 GET "/api/portal/inicio" \
      "Authorization: Bearer $STAFF_TOKEN"
  else
    skip_case "Staff JWT en portal → 403" "STAFF_TOKEN no disponible"
  fi
else
  test_case "Patient login" 200 POST "/api/auth/patient/login" \
    "Content-Type: application/json" \
    -- "{\"email\":\"$PATIENT_EMAIL\",\"password\":\"$PATIENT_PASSWORD\"}"
  skip_case "Patient endpoints" "login falló, saltando"
fi

# ═════════════════════════════════════════════════════════════════════
# SUMMARY
# ═════════════════════════════════════════════════════════════════════

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

if $JSON_OUTPUT; then
  RESULT=$([[ $FAILED -eq 0 ]] && echo "pass" || echo "fail")
  # Construimos el array de failures como string JSON antes del printf
  # final. `local` afuera de función es error en bash strict — de ahí
  # el bug anterior donde el summary salía partido en dos líneas.
  FAILURES_JSON="["
  FIRST=true
  for f in "${FAILURES[@]:-}"; do
    [[ -z "$f" ]] && continue
    if $FIRST; then FIRST=false; else FAILURES_JSON="${FAILURES_JSON},"; fi
    FAILURES_JSON="${FAILURES_JSON}$(jq -Rn --arg s "$f" '$s' 2>/dev/null || printf '"%s"' "$f")"
  done
  FAILURES_JSON="${FAILURES_JSON}]"
  printf '{"kind":"summary","total":%d,"passed":%d,"failed":%d,"skipped":%d,"duration_s":%d,"result":"%s","failures":%s}\n' \
    "$TOTAL" "$PASSED" "$FAILED" "$SKIPPED" "$DURATION" "$RESULT" "$FAILURES_JSON"
else
  printf "\n%s─── SUMMARY ───%s\n" "$C_BOLD" "$C_RESET"
  printf "Total:    %d\n" "$TOTAL"
  printf "Passed:   %s%d%s\n" "$C_GREEN" "$PASSED" "$C_RESET"
  printf "Failed:   %s%d%s\n" "$([[ $FAILED -gt 0 ]] && echo "$C_RED" || echo "")" "$FAILED" "$C_RESET"
  printf "Skipped:  %s%d%s\n" "$C_YELLOW" "$SKIPPED" "$C_RESET"
  printf "Duration: %ds\n" "$DURATION"

  if [[ $FAILED -gt 0 ]]; then
    printf "\n%s%sFAILED CASES:%s\n" "$C_RED" "$C_BOLD" "$C_RESET"
    for f in "${FAILURES[@]}"; do
      printf "  - %s\n" "$f"
    done
  fi

  if [[ $FAILED -eq 0 && $SKIPPED -eq 0 ]]; then
    printf "\n%s✓ Todos los tests pasaron%s\n" "$C_GREEN" "$C_RESET"
  elif [[ $FAILED -eq 0 ]]; then
    printf "\n%s✓ Todos los tests corridos pasaron (%d skipped por config faltante)%s\n" \
      "$C_YELLOW" "$SKIPPED" "$C_RESET"
  else
    printf "\n%s✗ Hay tests fallando%s\n" "$C_RED" "$C_RESET"
  fi
fi

exit $([[ $FAILED -eq 0 ]] && echo 0 || echo 1)
