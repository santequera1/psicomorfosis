/**
 * Página de diagnóstico + reparación de sesión — TEMPORAL para soporte.
 *
 * GET  /api/debug/session         → HTML autocontenido que analiza el
 *                                   navegador del usuario (localStorage,
 *                                   token, service workers, caches) y
 *                                   permite repararlo con un click.
 * POST /api/debug/session-report  → recibe el JSON del análisis y lo
 *                                   escribe en el log del server para que
 *                                   soporte lo lea (pm2 logs).
 *
 * No expone datos de otros usuarios: todo el análisis corre client-side
 * sobre el storage del propio visitante. El token nunca se envía completo
 * al server — solo su payload decodificado (iat/exp/rol), sin firma.
 */

import { Router } from "express";

const router = Router();

const PAGE = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Diagnóstico de sesión · Psicomorfosis</title>
<style>
  body{font-family:system-ui,sans-serif;max-width:560px;margin:40px auto;padding:0 20px;color:#1a2b32;background:#f7f8f6}
  h1{font-size:22px}
  button{font-size:16px;padding:12px 22px;border-radius:10px;border:none;cursor:pointer;margin:6px 6px 6px 0}
  #analizar{background:#2e5f66;color:#fff}
  #reparar{background:#b3372a;color:#fff}
  pre{background:#eceeea;border-radius:10px;padding:14px;font-size:12px;white-space:pre-wrap;word-break:break-all}
  .ok{color:#2c7a4b}.bad{color:#b3372a}.warn{color:#9a6a00}
  #done{display:none;background:#e6f4ea;border-radius:10px;padding:16px;margin-top:14px;font-weight:600}
</style></head><body>
<h1>🔧 Diagnóstico de sesión</h1>
<p>1. Toca <b>Analizar</b> y espera el resultado.<br>2. Luego toca <b>Reparar sesión</b>.<br>3. Manda captura de lo que salga.</p>
<button id="analizar">1 · Analizar</button>
<button id="reparar">2 · Reparar sesión</button>
<div id="done"></div>
<pre id="out">(sin analizar aún)</pre>
<script>
function decodeJwt(t){try{const p=JSON.parse(atob(t.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));return {user:p.id,role:p.role,iat:p.iat?new Date(p.iat*1000).toISOString():null,exp:p.exp?new Date(p.exp*1000).toISOString():null,expired:p.exp?(p.exp*1000<Date.now()):null}}catch(e){return {error:'no decodificable'}}}
async function analizar(){
  const r={ua:navigator.userAgent,fecha:new Date().toISOString(),url:location.href};
  // localStorage: leer
  try{
    r.ls_keys={};let total=0;
    for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);const v=localStorage.getItem(k)||'';total+=v.length;r.ls_keys[k]=v.length}
    r.ls_total_chars=total;
    r.token_presente=!!localStorage.getItem('psm.token');
    if(r.token_presente)r.token=decodeJwt(localStorage.getItem('psm.token'));
    r.user_guardado=localStorage.getItem('psm.user')?JSON.parse(localStorage.getItem('psm.user')).email||true:false;
  }catch(e){r.ls_read_error=e.name+': '+e.message}
  // localStorage: escribir + borrar
  try{localStorage.setItem('__diag_test','1');localStorage.removeItem('__diag_test');r.ls_write='OK'}catch(e){r.ls_write='FALLO '+e.name+': '+e.message}
  // service workers
  try{const regs=await (navigator.serviceWorker?navigator.serviceWorker.getRegistrations():Promise.resolve([]));r.service_workers=regs.map(x=>x.scope)}catch(e){r.service_workers='error: '+e.message}
  // caches API
  try{r.caches=await (window.caches?caches.keys():Promise.resolve([]))}catch(e){r.caches='error: '+e.message}
  document.getElementById('out').textContent=JSON.stringify(r,null,2);
  // reportar al server
  try{await fetch('/api/debug/session-report',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(r)})}catch(e){}
  return r;
}
async function reparar(){
  const pasos=[];
  try{localStorage.clear();pasos.push('localStorage limpiado')}catch(e){pasos.push('localStorage FALLO: '+e.message)}
  try{sessionStorage.clear();pasos.push('sessionStorage limpiado')}catch(e){pasos.push('sessionStorage FALLO: '+e.message)}
  try{const regs=await (navigator.serviceWorker?navigator.serviceWorker.getRegistrations():Promise.resolve([]));for(const x of regs){await x.unregister()}pasos.push('service workers: '+regs.length+' removidos')}catch(e){pasos.push('SW FALLO: '+e.message)}
  try{const ks=await (window.caches?caches.keys():Promise.resolve([]));for(const k of ks){await caches.delete(k)}pasos.push('caches: '+ks.length+' borrados')}catch(e){pasos.push('caches FALLO: '+e.message)}
  try{await fetch('/api/debug/session-report',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reparacion:pasos,ua:navigator.userAgent,fecha:new Date().toISOString()})})}catch(e){}
  const d=document.getElementById('done');
  d.style.display='block';
  d.textContent='✅ Reparado: '+pasos.join(' · ')+' — te llevo al login en 3 segundos…';
  setTimeout(()=>{location.href='/login?repaired=1'},3000);
}
document.getElementById('analizar').onclick=analizar;
document.getElementById('reparar').onclick=reparar;
</script></body></html>`;

router.get("/session", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.type("html").send(PAGE);
});

router.post("/session-report", (req, res) => {
  try {
    const body = JSON.stringify(req.body).slice(0, 4000);
    console.warn(`[debug-session] ${body}`);
  } catch { /* noop */ }
  res.json({ ok: true });
});

export default router;
