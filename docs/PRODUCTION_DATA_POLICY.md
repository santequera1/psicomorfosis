# Política de manejo de datos en producción

> A partir del **11 de mayo de 2026** Psicomorfosis dejó de operar con
> datos demo: a partir de la primera invitación a una psicóloga real,
> cada workspace contiene historia clínica, consentimientos firmados,
> recibos emitidos, notas con firma digital y otra información cuya
> pérdida tiene **implicaciones legales** (Ley 1581 de 2012,
> Resolución 1995 de 1999).

Este documento define qué se puede hacer y qué NO con la base de datos
de producción.

## 🔒 Reglas innegociables

### 1. La DB de producción no se borra. Nunca.
- ❌ `rm data.db` jamás (ni para "limpiar y empezar de cero").
- ❌ `DELETE FROM <tabla>` salvo casos puntuales y con backup verificado
  inmediatamente antes.
- ❌ Re-seedear (correr `seed()` sobre datos reales) — el código ahora
  bloquea esto con `FRESH_SEED_BLOCKED_IN_PRODUCTION`, ver
  [`server/src/db.js`](../server/src/db.js).
- ✅ Si necesitas "empezar limpio" un workspace concreto, lo correcto
  es **archivar/desactivar** el workspace, no borrar nada.

### 2. Cambios de esquema = migraciones idempotentes, NO seeds.
- Toda alteración del schema vive en `runMigrations()` de
  [`server/src/db.js`](../server/src/db.js).
- Cada migración debe ser idempotente (se puede correr 100 veces sin
  hacer daño) y aditiva (preferir `ALTER TABLE … ADD COLUMN` antes que
  recrear tablas).
- Si una migración requiere mover datos, hacerlo en SQL dentro de la
  misma migración con `INSERT … SELECT … WHERE NOT EXISTS …` o equivalente.

### 3. Cambios de datos = scripts SQL versionados.
- Si hay que tocar datos en prod (corregir un campo, restaurar una
  cuenta, etc.), se hace con un `.sql` versionado en `scripts/data/`,
  no ejecutando SQL ad-hoc por SSH.
- Antes de correr el script: `~/apps/psicomorfosis/scripts/backup.sh`
  manualmente y verificar que el snapshot quedó en
  `~/backups/psicomorfosis/db/` con tamaño > 1 KB.

### 4. Antes de cualquier operación riesgosa: backup manual.
```bash
# En el VPS, antes de tocar nada importante:
~/apps/psicomorfosis/scripts/backup.sh
ls -lah ~/backups/psicomorfosis/db/ | tail -3
```
Si el último backup automático tiene más de 26 horas, asumir que algo
está mal (cron muerto, script roto) y arreglarlo antes.

## 🛡️ Salvaguardas automáticas en el código

### `FRESH_SEED_BLOCKED_IN_PRODUCTION`
En `initDb()` (`server/src/db.js`): si `NODE_ENV=production` y la DB
parece vacía (sin workspaces), el server **se niega a arrancar** en vez
de sembrar datos demo encima. El log explica qué hacer (típicamente,
restaurar desde backup).

Si DE VERAS quieres sembrar fresh en producción (primera instalación
legítima, no recuperación), arranca con:
```bash
ALLOW_FRESH_SEED=1 pm2 restart psicomorfosis-api --update-env
```
Y desactiva el flag inmediatamente después.

### Backups automáticos diarios
`scripts/backup.sh` corre a las 3 AM vía cron. Retención: **30 días**.
Destino: `~/backups/psicomorfosis/db/` (DB comprimida) y `…/uploads/`
(tar.gz). El script registra cada ejecución en `backup.log`. Verificar
periódicamente:
```bash
tail -20 ~/backups/psicomorfosis/backup.log
```

### Snapshots a disco de versiones legales publicadas
Cada vez que la asesora legal publica una versión nueva de un
documento (privacidad, términos, acuerdo-beta, etc.), el server
escribe automáticamente el HTML completo + metadata a:
```
~/backups/psicomorfosis/legal-versions/<slug>/<version_label>__id<ID>__<timestamp>.html
```
Es un HTML standalone, abrible en cualquier navegador, con header de
metadata (quién publicó, cuándo, resumen de cambios). Si la DB se
pierde y los textos legales también, este es el respaldo de última
línea. Best-effort: si la escritura falla la publicación sigue, solo
se loguea `[legal-snapshot] FALLÓ …`. Configurable con la env var
`LEGAL_SNAPSHOT_DIR`.

### Backfills idempotentes
`backfillExisting()` corre en cada arranque cuando NO es seed fresh.
Solo INSERTA si falta el dato (`WHERE NOT EXISTS`, `INSERT … ON CONFLICT …
DO NOTHING`). Nunca sobreescribe `body_html` de documentos legales ni
otros campos editados por usuarios.

## 🔄 Restauración desde backup

Si pasa lo peor (DB corrupta, dato borrado por accidente):

```bash
# 1) Detener la API (importante: evitar escrituras concurrentes)
pm2 stop psicomorfosis-api

# 2) Listar backups
ls -lah ~/backups/psicomorfosis/db/

# 3) Restaurar el snapshot deseado
cd ~/apps/psicomorfosis/server
mv data.db data.db.broken-$(date +%s)
gunzip -c ~/backups/psicomorfosis/db/data-YYYY-MM-DD_HH-MM-SS.sqlite.gz > data.db
rm -f data.db-wal data.db-shm   # evitar mezclar WAL viejo con DB nueva

# 4) Restaurar uploads si aplica
tar -xzf ~/backups/psicomorfosis/uploads/uploads-YYYY-MM-DD_HH-MM-SS.tar.gz -C ~/apps/psicomorfosis/server/

# 5) Reiniciar
pm2 start psicomorfosis-api
pm2 logs psicomorfosis-api --lines 30 --nostream
```

## 📋 Checklist antes de un deploy con cambios estructurales

- [ ] El cambio NO incluye `seed()` ni borrar tablas.
- [ ] Las migraciones nuevas (si las hay) son idempotentes.
- [ ] Se probó en local con una copia reciente de la DB de prod.
- [ ] Hay un backup manual reciente (< 1 hora) antes del deploy.
- [ ] Se documenta el cambio en el commit message.
- [ ] Hay una vía de rollback identificada (revert + restore del backup).

## 🚨 Si pasa algo raro

1. **No reiniciar el server** hasta entender qué pasó.
2. Capturar evidencia: `pm2 logs psicomorfosis-api --lines 200 --nostream > /tmp/incident.log`.
3. Verificar el estado de la DB:
   ```bash
   sqlite3 ~/apps/psicomorfosis/server/data.db "SELECT COUNT(*) FROM workspaces, patients, appointments, tareas, legal_document_versions;"
   ```
4. Comparar con el último backup para decidir si restaurar o intentar
   reparar in-place.
