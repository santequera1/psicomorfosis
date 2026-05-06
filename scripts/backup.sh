#!/usr/bin/env bash
#
# Backup automatizado de Psicomorfosis (SQLite + uploads).
# ----------------------------------------------------------------------
# QUÉ HACE:
#   1. Toma snapshot ATÓMICO del SQLite (respeta WAL mode usando
#      `sqlite3 .backup`, no un simple cp — copiar el .db crudo cuando
#      hay escritores en curso puede capturar estado inconsistente).
#   2. Comprime el snapshot con gzip.
#   3. Empaca la carpeta uploads/ (firmas, fotos de pacientes, recibos
#      generados) en un .tar.gz.
#   4. Rota: borra backups con más de KEEP_DAYS días.
#   5. Logea cada ejecución a $BACKUP_DIR/backup.log con timestamp.
#
# CÓMO RESTAURAR (manualmente):
#   1. Detener la API:
#        pm2 stop psicomorfosis-api
#   2. Restaurar la BD:
#        gunzip -c BACKUP_DIR/db/data-YYYY-MM-DD_HH-MM-SS.sqlite.gz \
#          > /home/ubuntu/apps/psicomorfosis/server/data.db
#      (Asegúrate de que NO existan los archivos data.db-wal ni
#       data.db-shm; si existen, bórralos antes de iniciar.)
#   3. Restaurar uploads (si aplica):
#        tar -xzf BACKUP_DIR/uploads/uploads-YYYY-MM-DD_HH-MM-SS.tar.gz \
#          -C /home/ubuntu/apps/psicomorfosis/server/
#   4. Reiniciar:
#        pm2 start psicomorfosis-api
#
# CRON SUGERIDO (3 AM hora del VPS):
#   0 3 * * * /home/ubuntu/apps/psicomorfosis/scripts/backup.sh >/dev/null 2>&1
# ----------------------------------------------------------------------

set -euo pipefail

# --- Configuración ---------------------------------------------------
APP_DIR="${APP_DIR:-/home/ubuntu/apps/psicomorfosis}"
DB_PATH="${DB_PATH:-$APP_DIR/server/data.db}"
UPLOADS_PATH="${UPLOADS_PATH:-$APP_DIR/server/uploads}"
BACKUP_DIR="${BACKUP_DIR:-/home/ubuntu/backups/psicomorfosis}"
KEEP_DAYS="${KEEP_DAYS:-14}"

TIMESTAMP="$(date +%Y-%m-%d_%H-%M-%S)"
LOG_FILE="$BACKUP_DIR/backup.log"

# --- Helpers ---------------------------------------------------------
mkdir -p "$BACKUP_DIR/db" "$BACKUP_DIR/uploads"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

fail() {
  log "ERROR: $*"
  exit 1
}

# --- 1) Snapshot atómico del SQLite ----------------------------------
log "===== Backup start ====="

if [[ ! -f "$DB_PATH" ]]; then
  fail "DB no encontrada en $DB_PATH"
fi

DB_TMP="$(mktemp --suffix=.sqlite)"
DB_OUT="$BACKUP_DIR/db/data-$TIMESTAMP.sqlite.gz"

# `.backup` produce una copia consistente del DB respetando WAL.
# IMPORTANTE: ejecuta como el mismo usuario que escribe la DB (ubuntu)
# para evitar problemas de permisos sobre los archivos -wal/-shm.
if ! sqlite3 "$DB_PATH" ".backup '$DB_TMP'"; then
  rm -f "$DB_TMP"
  fail "sqlite3 .backup falló"
fi

if ! gzip -c "$DB_TMP" > "$DB_OUT"; then
  rm -f "$DB_TMP"
  fail "gzip falló"
fi
rm -f "$DB_TMP"

DB_SIZE="$(du -h "$DB_OUT" | cut -f1)"
log "DB OK → $DB_OUT ($DB_SIZE)"

# --- 2) Backup de uploads --------------------------------------------
if [[ -d "$UPLOADS_PATH" ]]; then
  UPLOADS_OUT="$BACKUP_DIR/uploads/uploads-$TIMESTAMP.tar.gz"
  if tar -czf "$UPLOADS_OUT" -C "$(dirname "$UPLOADS_PATH")" "$(basename "$UPLOADS_PATH")"; then
    UPLOADS_SIZE="$(du -h "$UPLOADS_OUT" | cut -f1)"
    log "uploads OK → $UPLOADS_OUT ($UPLOADS_SIZE)"
  else
    log "WARN: tar de uploads falló (continuando con DB ya respaldada)"
  fi
else
  log "WARN: $UPLOADS_PATH no existe; salto uploads"
fi

# --- 3) Rotación -----------------------------------------------------
DELETED_DB="$(find "$BACKUP_DIR/db" -name "data-*.sqlite.gz" -mtime +"$KEEP_DAYS" -print -delete | wc -l)"
DELETED_UP="$(find "$BACKUP_DIR/uploads" -name "uploads-*.tar.gz" -mtime +"$KEEP_DAYS" -print -delete | wc -l)"
log "Rotación: borrados $DELETED_DB de DB + $DELETED_UP de uploads (>${KEEP_DAYS}d)"

# --- 4) Resumen ------------------------------------------------------
TOTAL_DB="$(ls -1 "$BACKUP_DIR/db" | wc -l)"
TOTAL_UP="$(ls -1 "$BACKUP_DIR/uploads" | wc -l)"
log "Inventario actual: $TOTAL_DB backups DB + $TOTAL_UP backups uploads"
log "===== Backup end ======"
