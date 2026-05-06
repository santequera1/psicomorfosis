import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2, ShieldCheck, Sparkles, AlertCircle } from "lucide-react";
import { api, setSession } from "@/lib/api";
import { Logo } from "@/components/app/Logo";

export const Route = createFileRoute("/p_/activar/$token")({
  head: () => ({ meta: [{ title: "Activa tu cuenta — Psicomorfosis" }] }),
  component: ActivatePage,
});

function ActivatePage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Checkbox legal: requerido por Ley 1581/2012 Decreto 1377/2013 para
  // tratamiento de datos sensibles (historia clínica + biométricos).
  // Sin este consentimiento explícito no podemos activar la cuenta.
  const [acceptedLegal, setAcceptedLegal] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["patient-invite", token],
    queryFn: () => api.validatePatientInvite(token),
    retry: false,
  });

  const strength = useMemo(() => calcStrength(password), [password]);
  const passwordsMatch = password.length > 0 && password === confirm;
  const canSubmit = password.length >= 8 && passwordsMatch && acceptedLegal && !submitting;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const res = await api.activatePatientInvite(token, password, {
        acceptedLegal: acceptedLegal,
        // Mantener sincronizado con ULTIMA_ACTUALIZACION en /privacidad
        // y /terminos. Si actualizas los documentos, actualiza también
        // este string para que la auditoría refleje la versión correcta.
        legalVersion: "2026-05-06",
      });
      setSession(res.token, res.user as any);
      toast.success("¡Cuenta activada!");
      navigate({ to: "/p/inicio" });
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo activar la cuenta");
      setSubmitting(false);
    }
  }

  // ─── Estados de carga / error ─────────────────────────────────────────────
  if (isLoading) {
    return (
      <PortalCanvas>
        <div className="text-center py-20 text-ink-500">
          <Loader2 className="h-6 w-6 mx-auto mb-3 animate-spin" />
          Verificando invitación…
        </div>
      </PortalCanvas>
    );
  }

  if (error) {
    const msg = (error as any)?.message ?? "La invitación no es válida.";
    const expired = msg.toLowerCase().includes("expir");
    const used = msg.toLowerCase().includes("usada");
    return (
      <PortalCanvas>
        <div className="text-center py-12 max-w-sm mx-auto">
          <div className="h-14 w-14 mx-auto rounded-full bg-amber-50 flex items-center justify-center mb-4">
            <AlertCircle className="h-7 w-7 text-amber-700" />
          </div>
          <h1 className="font-serif text-2xl text-ink-900 mb-2">
            {expired ? "Esta invitación expiró" : used ? "Esta invitación ya fue usada" : "Invitación no válida"}
          </h1>
          <p className="text-sm text-ink-500 mb-6">
            {expired
              ? "Pide a tu psicóloga una nueva. Las invitaciones duran 5 días."
              : used
                ? "Si ya activaste tu cuenta, puedes iniciar sesión."
                : "Verifica el enlace que recibiste o pide uno nuevo."}
          </p>
          {used && (
            <a href="/p/login" className="inline-flex h-11 px-5 rounded-lg bg-brand-700 text-white text-sm font-medium hover:bg-brand-800 items-center justify-center">
              Ir a iniciar sesión
            </a>
          )}
        </div>
      </PortalCanvas>
    );
  }

  if (!data) return null;

  return (
    <PortalCanvas>
      <div className="max-w-md mx-auto">
        {/* Bienvenida */}
        <div className="text-center mb-8">
          <div className="h-16 w-16 mx-auto rounded-full bg-brand-50 flex items-center justify-center mb-4 border-2 border-brand-100">
            <Sparkles className="h-7 w-7 text-brand-700" />
          </div>
          <h1 className="font-serif text-3xl text-ink-900 leading-tight">
            Hola, {(data.patient.preferred_name?.trim() || data.patient.name.split(" ")[0])}
          </h1>
          <p className="text-base text-ink-500 mt-2 leading-relaxed">
            {data.professional?.name && (
              <>
                <span className="text-ink-700 font-medium">{data.professional.name}</span>
                {" te invita al portal de "}
              </>
            )}
            <span className="text-ink-700 font-medium">{data.clinic.name ?? "tu psicóloga"}</span>.
          </p>
          <p className="text-sm text-ink-500 mt-3">
            Crea tu contraseña para acceder a tus citas, tareas y documentos.
          </p>
        </div>

        {/* Formulario */}
        <form onSubmit={submit} className="space-y-4 bg-surface rounded-2xl border border-line-200 shadow-soft p-6">
          <div>
            <label className="block text-xs font-medium text-ink-700 mb-1.5">Tu correo</label>
            <input
              type="email"
              value={data.patient.email}
              readOnly
              className="w-full h-11 px-3 rounded-lg border border-line-200 bg-bg-100 text-sm text-ink-500 cursor-not-allowed"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-700 mb-1.5">Crea tu contraseña</label>
            <div className="relative">
              <input
                type={showPwd ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                minLength={8}
                placeholder="Mínimo 8 caracteres"
                className="w-full h-11 px-3 pr-10 rounded-lg border border-line-200 bg-bg text-sm text-ink-900 focus:outline-none focus:border-brand-400"
              />
              <button
                type="button"
                onClick={() => setShowPwd((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 rounded text-ink-500 hover:bg-bg-100 inline-flex items-center justify-center"
                tabIndex={-1}
              >
                {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {password.length > 0 && (
              <div className="mt-2 flex gap-1">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className={
                      "h-1 flex-1 rounded-full " +
                      (i < strength.score
                        ? strength.score <= 1 ? "bg-rose-400"
                          : strength.score === 2 ? "bg-amber-400"
                            : "bg-sage-500"
                        : "bg-line-200")
                    }
                  />
                ))}
              </div>
            )}
            {password.length > 0 && (
              <p className="text-xs text-ink-500 mt-1">{strength.label}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-700 mb-1.5">Confirma tu contraseña</label>
            <input
              type={showPwd ? "text" : "password"}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              minLength={8}
              placeholder="Vuelve a escribirla"
              className={
                "w-full h-11 px-3 rounded-lg border bg-bg text-sm text-ink-900 focus:outline-none " +
                (confirm.length > 0 && !passwordsMatch
                  ? "border-rose-400 focus:border-rose-500"
                  : "border-line-200 focus:border-brand-400")
              }
            />
            {confirm.length > 0 && !passwordsMatch && (
              <p className="text-xs text-rose-700 mt-1">Las contraseñas no coinciden.</p>
            )}
          </div>

          {/* Consentimiento informado para tratamiento de datos sensibles
              (Ley 1581/2012 + Decreto 1377/2013). Sin este check no se
              puede activar la cuenta — el botón queda deshabilitado. */}
          <label className="flex items-start gap-2.5 text-xs text-ink-700 leading-relaxed cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={acceptedLegal}
              onChange={(e) => setAcceptedLegal(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-line-300 text-brand-700 focus:ring-brand-400 shrink-0"
            />
            <span>
              He leído y acepto el{" "}
              <Link to="/privacidad" target="_blank" className="text-brand-700 underline">
                aviso de privacidad
              </Link>{" "}
              y los{" "}
              <Link to="/terminos" target="_blank" className="text-brand-700 underline">
                términos y condiciones
              </Link>
              . Autorizo el tratamiento de mis datos personales y datos
              sensibles (historia clínica, tests, firma) por parte de
              Psicomorfosis y mi profesional tratante para los fines
              descritos en el aviso.
            </span>
          </label>

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full h-11 rounded-lg bg-brand-700 text-white text-sm font-medium hover:bg-brand-800 disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Activar mi cuenta
          </button>

          <div className="flex items-start gap-2 text-[11px] text-ink-500 pt-2 border-t border-line-100">
            <ShieldCheck className="h-3.5 w-3.5 mt-0.5 shrink-0 text-sage-500" />
            <span>
              Tu información está protegida según la Ley 1581/2012 de Habeas Data.
              Tu psicóloga no ve tu contraseña.
            </span>
          </div>
        </form>
      </div>
    </PortalCanvas>
  );
}

function calcStrength(pwd: string): { score: number; label: string } {
  if (pwd.length === 0) return { score: 0, label: "" };
  let score = 0;
  if (pwd.length >= 8) score++;
  if (pwd.length >= 12) score++;
  if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score++;
  if (/\d/.test(pwd) || /[^a-zA-Z0-9]/.test(pwd)) score++;
  const labels = ["Muy débil", "Débil", "Aceptable", "Buena", "Excelente"];
  return { score, label: labels[score] };
}

/** Lienzo cálido para las páginas del portal antes de iniciar sesión. */
export function PortalCanvas({ children }: { children: React.ReactNode }) {
  // Aplicar clase para evitar el .dark global del staff
  useEffect(() => {
    const wasDark = document.documentElement.classList.contains("dark");
    document.documentElement.classList.remove("dark");
    return () => { if (wasDark) document.documentElement.classList.add("dark"); };
  }, []);
  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <header className="px-6 py-5 flex items-center justify-between max-w-3xl mx-auto w-full">
        <div className="inline-flex items-center gap-2.5 text-ink-900">
          <Logo className="h-7 w-7 text-brand-700" />
          <span className="font-serif text-lg">Psicomorfosis</span>
        </div>
      </header>
      <main className="flex-1 px-6 pb-12 pt-4">
        {children}
      </main>
      <footer className="px-6 py-6 text-center text-xs text-ink-400">
        © Psicomorfosis · Tu privacidad es nuestra prioridad
      </footer>
    </div>
  );
}
