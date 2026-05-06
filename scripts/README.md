# scripts/

Scripts operacionales del despliegue de Psicomorfosis. Versionados aquí
para que el setup del VPS sea reproducible.

## `backup.sh`

Backup automatizado de la SQLite + carpeta `uploads/`. Diseñado para
correr por cron en el VPS.

### Instalación en VPS

```bash
ssh ubuntu@51.195.109.26
cd ~/apps/psicomorfosis
git pull
chmod +x scripts/backup.sh

# Test manual primero:
./scripts/backup.sh
ls -lah ~/backups/psicomorfosis/db
ls -lah ~/backups/psicomorfosis/uploads
cat ~/backups/psicomorfosis/backup.log

# Cron diario a las 3am hora del VPS:
( crontab -l 2>/dev/null; echo "0 3 * * * $HOME/apps/psicomorfosis/scripts/backup.sh >/dev/null 2>&1" ) | crontab -

# Verifica:
crontab -l
```

### Configuración por env vars

El script lee variables con defaults razonables. Sobrescribe si lo
necesitas:

| Variable | Default | Descripción |
|---|---|---|
| `APP_DIR` | `/home/ubuntu/apps/psicomorfosis` | Raíz del repo desplegado |
| `DB_PATH` | `$APP_DIR/server/data.db` | Archivo SQLite |
| `UPLOADS_PATH` | `$APP_DIR/server/uploads` | Carpeta de archivos subidos |
| `BACKUP_DIR` | `/home/ubuntu/backups/psicomorfosis` | Destino |
| `KEEP_DAYS` | `14` | Días de retención |

### Por qué no `cp data.db`

SQLite en modo WAL (es nuestro caso, hay archivos `data.db-wal` y
`data.db-shm`) puede tener cambios pendientes en el WAL que un `cp`
crudo no captura, dejando el backup inconsistente. `sqlite3 .backup`
sí toma el snapshot atómicamente respetando el WAL — es la única
forma correcta para una BD en uso.

### Restauración

Documentada en el header del propio script. Resumen:

1. `pm2 stop psicomorfosis-api`
2. `gunzip -c data-YYYY-MM-DD_HH-MM-SS.sqlite.gz > server/data.db`
3. Borrar `data.db-wal` y `data.db-shm` si existen
4. (Opcional) `tar -xzf uploads-YYYY-MM-DD_HH-MM-SS.tar.gz -C server/`
5. `pm2 start psicomorfosis-api`
