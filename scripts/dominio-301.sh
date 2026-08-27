#!/usr/bin/env bash
# Redirección 301 del dominio anterior (psico.wailus.co) al nuevo (psicomorfosis.co).
#
#   sudo bash scripts/dominio-301.sh apply    # activa la redirección (con backup)
#   sudo bash scripts/dominio-301.sh revert   # vuelve al último backup
#   sudo bash scripts/dominio-301.sh status   # ¿qué responde hoy el dominio viejo?
#
# Qué hace `apply`:
#   1. Copia la config actual a /etc/nginx/backups/psico.wailus.co.pre-301-<fecha>.
#   2. Quita psico.wailus.co del server_name del bloque que sirve la app.
#   3. Añade un bloque 443 solo para psico.wailus.co que devuelve
#      301 https://psicomorfosis.co$request_uri (mismo certificado: cubre
#      los tres nombres). El bloque :80 existente ya manda a https.
#   4. nginx -t y reload. Si el test falla, no recarga: revert.
#
# Efecto para la gente: quien entre por la dirección vieja aterriza en la
# nueva con la misma ruta; la sesión va atada al dominio, así que vuelve a
# iniciar sesión (lo dice el correo de la campaña). Las llamadas /api de
# una pestaña vieja fallan hasta recargar — es esperado.
set -euo pipefail

CONF=/etc/nginx/sites-enabled/psico.wailus.co
BKDIR=/etc/nginx/backups
OLD="psico.wailus.co"
NEW="psicomorfosis.co"

case "${1:-}" in
  apply)
    if grep -q "server_name $OLD;" "$CONF"; then
      echo "Ya hay un bloque solo para $OLD: parece aplicado. Usa status."; exit 1
    fi
    mkdir -p "$BKDIR"
    BK="$BKDIR/$OLD.pre-301-$(date +%Y%m%d-%H%M%S)"
    cp "$CONF" "$BK"; echo "backup: $BK"
    sed -i "s/server_name $OLD $NEW www.$NEW;/server_name $NEW www.$NEW;/" "$CONF"
    cat >> "$CONF" <<EOF

# Dominio anterior: solo redirige al nuevo (cambio de dominio, ago 2026).
server {
    listen 443 ssl;
    server_name $OLD;
    ssl_certificate /etc/letsencrypt/live/$OLD/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$OLD/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
    return 301 https://$NEW\$request_uri;
}
EOF
    if nginx -t; then
      systemctl reload nginx
      echo "301 activo: https://$OLD → https://$NEW"
      sleep 1
      curl -sI "https://$OLD/agenda" | grep -iE "^(HTTP|location)" || true
    else
      echo "nginx -t falló: restaurando $BK"; cp "$BK" "$CONF"; nginx -t; exit 1
    fi
    ;;
  revert)
    LATEST=$(ls -t "$BKDIR"/$OLD.pre-301-* 2>/dev/null | head -1)
    [ -n "$LATEST" ] || { echo "sin backup pre-301"; exit 1; }
    cp "$LATEST" "$CONF" && nginx -t && systemctl reload nginx && echo "revertido desde $LATEST"
    ;;
  status)
    echo "server_name del bloque principal: $(grep -m1 'server_name' "$CONF")"
    curl -sI "https://$OLD/agenda" | grep -iE "^(HTTP|location)" || echo "(sin respuesta)"
    ;;
  *)
    echo "uso: sudo bash $0 apply | revert | status"; exit 1;;
esac
