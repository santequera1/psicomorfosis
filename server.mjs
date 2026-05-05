import { serve } from "srvx/node";
import server from "./dist/server/index.js";

const PORT = Number(process.env.PORT ?? 3013);
const HOST = process.env.HOST ?? "127.0.0.1";

serve({
  fetch: server.fetch,
  port: PORT,
  hostname: HOST,
});

console.log(`[psicomorfosis-ssr] http://${HOST}:${PORT}`);
