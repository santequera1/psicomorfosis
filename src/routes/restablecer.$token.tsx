import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Lock, Eye, EyeOff, Loader2, AlertCircle, ArrowRight } from "lucide-react";
import { api, setSession, ApiError } from "@/lib/api";

/**
 * Página a la que llega el enlace del correo "Olvidé mi contraseña".
 * Comprueba el token al cargar (para no hacer escribir una contraseña
 * que luego no se va a aceptar), y al guardar deja la sesión iniciada.
 */
export const Route = createFileRoute("/restablecer/$token")({
  head: () => ({ meta: [{ title: "Nueva contraseña · Psicomorfosis" }] }),
  component: RestablecerPage,
});

function RestablecerPage() {
  const { token } = Route.useParams();
  const { data, isLoading } = useQuery({
    queryKey: ["reset-check", token],
    queryFn: () => api.resetPasswordCheck(token),
    retry: false,
  });
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Si ya hay sesión en este navegador, no estorba: el reset crea una
  // nueva y sustituye la anterior.
  useEffect(() => { setErr(null); }, [password, confirm]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) { setErr("Mínimo 8 caracteres."); return; }
    if (password !== confirm) { setErr("Las contraseñas no coinciden."); return; }
    setSaving(true);
    try {
      const { token: jwt, user } = await api.resetPassword(token, password);
      setSession(jwt, user);
      window.location.assign("/");
    } catch (error) {
      setErr(error instanceof ApiError ? error.message : "No pudimos guardar la contraseña. Inténtalo de nuevo.");
      setSaving(false);
    }
  }

  const field = "mt-1.5 flex items-center gap-3 h-12 pl-4 pr-2 rounded-full border border-line-200 bg-bg-50/60 focus-within:border-brand-700 focus-within:bg-surface transition-colors";

  return (
    <div className="min-h-screen w-full bg-bg-50 flex flex-col items-center justify-center px-4 py-6 md:py-10">
      <div className="relative w-full max-w-md rounded-[32px] overflow-hidden bg-surface shadow-modal">
        <div className="bg-brand-50 py-10 px-6 text-center">
          <h1 className="font-serif text-3xl text-brand-800 leading-tight">Psicomorfosis</h1>
          <p className="text-xs text-ink-500 mt-1.5 tracking-wide">Plataforma para psicólogos</p>
        </div>
        <div className="px-6 pt-8 pb-10">
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-ink-400" /></div>
          ) : !data?.valid ? (
            <div className="text-center">
              <div className="mx-auto h-12 w-12 rounded-full bg-rose-50 flex items-center justify-center">
                <AlertCircle className="h-6 w-6 text-rose-700" />
              </div>
              <h2 className="mt-4 font-serif text-xl text-ink-900">Este enlace ya no sirve</h2>
              <p className="mt-2 text-sm text-ink-500 leading-relaxed">
                Los enlaces valen 60 minutos y se usan una sola vez. Pide uno nuevo y llegará en segundos.
              </p>
              <Link to="/login" className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline">
                Ir a iniciar sesión <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <h2 className="font-serif text-xl text-ink-900">Elige tu nueva contraseña</h2>
                {data.name && <p className="mt-1 text-sm text-ink-500">Hola, {data.name.split(" ")[0]}. Mínimo 8 caracteres.</p>}
              </div>
              <label className="block">
                <span className="text-xs text-ink-700 font-medium pl-4">Nueva contraseña</span>
                <div className={field}>
                  <Lock className="h-4 w-4 text-ink-400 shrink-0" />
                  <input type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" autoFocus
                         className="flex-1 bg-transparent text-sm outline-none text-ink-900" placeholder="••••••••" />
                  <button type="button" onClick={() => setShow((v) => !v)} className="h-8 w-8 rounded-full text-ink-400 hover:text-ink-700 flex items-center justify-center" aria-label={show ? "Ocultar" : "Mostrar"}>
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </label>
              <label className="block">
                <span className="text-xs text-ink-700 font-medium pl-4">Repítela</span>
                <div className={field}>
                  <Lock className="h-4 w-4 text-ink-400 shrink-0" />
                  <input type={show ? "text" : "password"} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password"
                         className="flex-1 bg-transparent text-sm outline-none text-ink-900" placeholder="••••••••" />
                </div>
              </label>
              {err && (
                <div className="rounded-2xl bg-rose-50 border border-rose-200/60 px-4 py-3 flex items-start gap-2.5">
                  <AlertCircle className="h-4 w-4 text-rose-700 shrink-0 mt-0.5" />
                  <p className="text-xs text-rose-800 leading-relaxed">{err}</p>
                </div>
              )}
              <button type="submit" disabled={saving || password.length < 8 || !confirm}
                      className="w-full h-12 rounded-full text-primary-foreground text-sm font-semibold bg-brand-700 hover:bg-brand-800 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Guardar y entrar <ArrowRight className="h-4 w-4" /></>}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
