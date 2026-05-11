/**
 * Configuración PM2 para Psicomorfosis en el VPS.
 *
 * NODE_ENV=production es crítico — la salvaguarda en server/src/db.js
 * (initDb → FRESH_SEED_BLOCKED_IN_PRODUCTION) depende de este flag
 * para bloquear sembrar datos demo encima de un workspace real cuando
 * la DB aparece vacía (típicamente porque algo se borró por accidente).
 *
 * Para arrancar la primera vez:
 *   pm2 start ecosystem.config.cjs --only psicomorfosis-api
 *   pm2 start ecosystem.config.cjs --only psicomorfosis
 *
 * Para reiniciar conservando los env vars (sin que vuelvan a N/A):
 *   pm2 restart ecosystem.config.cjs --update-env
 *
 * Sembrar la PRIMERA vez en una instalación nueva (cuidado):
 *   ALLOW_FRESH_SEED=1 pm2 restart psicomorfosis-api --update-env
 *   …luego apagar el flag inmediatamente.
 */
module.exports = {
  apps: [
    {
      name: "psicomorfosis-api",
      script: "server/src/index.js",
      cwd: __dirname,
      env: {
        NODE_ENV: "production",
        PORT: "3012",
      },
    },
    {
      name: "psicomorfosis",
      // El SSR del cliente lo expone el server de TanStack Start
      // (archivo generado por `npm run build`).
      script: "server.mjs",
      cwd: __dirname,
      env: {
        NODE_ENV: "production",
        PORT: "3013",
      },
    },
  ],
};
