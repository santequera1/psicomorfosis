import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api, setSession, getValidToken, ApiError } from "@/lib/api";
import { SignUpForm } from "@/components/auth/SignUpForm";
import { GoogleButton, AuthDivider } from "@/components/auth/GoogleButton";
import { Mail, Lock, Eye, EyeOff, AlertCircle, Loader2, ChevronLeft, Info, Check, Heart, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Ingresar · Psicomorfosis" }] }),
  component: LoginPage,
});

type Tab = "login" | "signup";

function LoginPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Si el backend nos dice que el usuario es paciente, mostramos un
  // CTA explícito para llevarlo al portal en vez de un mensaje seco.
  const [redirectToPortal, setRedirectToPortal] = useState(false);

  // Si ya hay sesión activa Y VIGENTE, saltar directo al dashboard. Evita que
  // un usuario logueado vea el formulario si pone /login manualmente en la URL.
  // getValidToken() descarta (y limpia) tokens vencidos — antes, un token
  // muerto en localStorage te "colaba" al dashboard y la sesión colapsaba en
  // la primera request real.
  useEffect(() => {
    if (getValidToken()) window.location.replace("/");
  }, []);

  // El backend redirige con ?google_error=<codigo> cuando el flujo de
  // Google falla (cancelado, state inválido, cuenta deshabilitada...).
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("google_error");
    if (!code) return;
    const msgs: Record<string, string> = {
      cancelado: "Cancelaste el ingreso con Google.",
      no_configurado: "El ingreso con Google no está disponible por ahora.",
      state_invalido: "El enlace expiró. Intenta de nuevo.",
      cuenta_deshabilitada: "Tu cuenta está deshabilitada. Contacta a soporte.",
      usa_portal_paciente: "Esa cuenta es de paciente. Entra por el portal de pacientes.",
    };
    setErr(msgs[code] ?? "No pudimos completar el ingreso con Google.");
    setTab("login");
    window.history.replaceState({}, "", "/login");
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    setRedirectToPortal(false);
    try {
      const { token, user } = await api.login(username, password);
      setSession(token, user);
      // Hard redirect al home. Siempre "/" — es el dashboard y punto de entrada
      // natural tras autenticar. Evitamos cualquier ?redirect= del query para no
      // generar loops con rutas mal formadas.
      window.location.assign("/");
    } catch (error) {
      const msg =
        error instanceof ApiError
          ? error.message
          : "No se pudo conectar al servidor. Verifica que el backend esté corriendo.";
      // El backend devuelve hint:"use_patient_portal" cuando un paciente
      // intenta entrar acá. La detección la hacemos por status + texto del
      // mensaje porque ApiError no expone el body completo; el mensaje sí
      // viene del backend ("Esta cuenta es de paciente...").
      if (error instanceof ApiError && error.status === 403 && /paciente/i.test(error.message)) {
        setRedirectToPortal(true);
      }
      setErr(msg);
      setLoading(false);
    }
  }

  function goToPatientPortal() {
    navigate({ to: "/p/login" });
  }

  return (
    <div className="min-h-screen w-full bg-bg-50 flex flex-col items-center justify-center px-4 py-6 md:py-10">
      <div className="relative w-full max-w-md rounded-[32px] overflow-hidden bg-surface shadow-modal">
        {/* Header textual: en lugar del logo, dejamos el wordmark
            tipográfico para no exponer marca específica de un cliente
            (logos de fundadora). El tag debajo da contexto. */}
        <div className="relative bg-brand-50 py-10 px-6 flex flex-col items-center justify-center text-center">
          <h1 className="font-serif text-3xl text-brand-800 leading-tight">Psicomorfosis</h1>
          <p className="text-xs text-ink-500 mt-1.5 tracking-wide">Plataforma para psicólogos</p>

          {tab === "signup" && (
            <button
              type="button"
              onClick={() => setTab("login")}
              className="absolute top-4 left-4 h-9 w-9 rounded-full bg-surface text-ink-700 hover:bg-brand-100 shadow-soft flex items-center justify-center transition-colors"
              aria-label="Volver"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Form section */}
        <div className="px-6 pt-8 pb-10">
          {/* Tab switcher */}
          <div className="relative flex p-1 rounded-full bg-bg-100 mb-7 w-full max-w-[260px] mx-auto">
            <div
              className={
                "absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-full transition-transform duration-300 ease-out bg-brand-700 shadow-soft " +
                (tab === "signup" ? "translate-x-full" : "translate-x-0")
              }
            />
            <button
              type="button"
              onClick={() => setTab("login")}
              className={
                "relative flex-1 h-9 text-sm font-medium rounded-full transition-colors " +
                (tab === "login" ? "text-primary-foreground" : "text-ink-500")
              }
            >
              Iniciar sesión
            </button>
            <button
              type="button"
              onClick={() => setTab("signup")}
              className={
                "relative flex-1 h-9 text-sm font-medium rounded-full transition-colors " +
                (tab === "signup" ? "text-primary-foreground" : "text-ink-500")
              }
            >
              Registrarse
            </button>
          </div>

          {/* Google primero: para la mayoría es el camino de un clic, y
              sirve tanto para entrar como para crear cuenta. */}
          <GoogleButton label={tab === "login" ? "Continuar con Google" : "Registrarme con Google"} />
          <AuthDivider text={tab === "login" ? "o con tu correo" : "o con tus datos"} />

          {tab === "login" ? (
            <LoginForm
              username={username}
              setUsername={setUsername}
              password={password}
              setPassword={setPassword}
              showPwd={showPwd}
              setShowPwd={setShowPwd}
              remember={remember}
              setRemember={setRemember}
              err={err}
              loading={loading}
              onSubmit={onSubmit}
              redirectToPortal={redirectToPortal}
              goToPatientPortal={goToPatientPortal}
            />
          ) : (
            <SignUpForm onDone={() => window.location.assign("/")} />
          )}

          {/* CTA discreto pero claro hacia el portal del paciente. Evita la
              confusión de tener un único login que en realidad son dos
              productos distintos (staff vs paciente). */}
          {tab === "login" && (
            <div className="mt-7 pt-5 border-t border-line-100 text-center">
              <p className="text-xs text-ink-500">¿Eres paciente?</p>
              <button
                type="button"
                onClick={goToPatientPortal}
                className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:text-brand-800 hover:underline"
              >
                <Heart className="h-3.5 w-3.5" />
                Ir al portal del paciente
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
      {/* Footer legal — visible siempre en la pantalla de login. */}
      <p className="mt-6 text-center text-xs text-ink-500">
        <Link to="/privacidad" className="hover:text-brand-700 hover:underline">Aviso de privacidad</Link>
        {" · "}
        <Link to="/terminos" className="hover:text-brand-700 hover:underline">Términos y condiciones</Link>
      </p>
    </div>
  );
}

function LoginForm({
  username, setUsername, password, setPassword,
  showPwd, setShowPwd, remember, setRemember,
  err, loading, onSubmit,
  redirectToPortal, goToPatientPortal,
}: {
  username: string; setUsername: (v: string) => void;
  password: string; setPassword: (v: string) => void;
  showPwd: boolean; setShowPwd: (v: boolean) => void;
  remember: boolean; setRemember: (v: boolean) => void;
  err: string | null; loading: boolean;
  onSubmit: (e: React.FormEvent) => void;
  redirectToPortal: boolean;
  goToPatientPortal: () => void;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="block">
          <span className="text-xs text-ink-700 font-medium pl-4">Email o usuario</span>
          <div className="mt-1.5 flex items-center gap-3 h-12 pl-4 pr-3 rounded-full border border-line-200 bg-bg-50/60 focus-within:border-brand-700 focus-within:bg-surface transition-colors">
            <Mail className="h-4 w-4 text-ink-400 shrink-0" />
            <input
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              className="flex-1 bg-transparent text-sm outline-none text-ink-900 placeholder:text-ink-400"
              placeholder="nathaly@psicomorfosis.co"
            />
          </div>
        </label>
      </div>

      <div>
        <label className="block">
          <span className="text-xs text-ink-700 font-medium pl-4">Contraseña</span>
          <div className="mt-1.5 flex items-center gap-3 h-12 pl-4 pr-2 rounded-full border border-line-200 bg-bg-50/60 focus-within:border-brand-700 focus-within:bg-surface transition-colors">
            <Lock className="h-4 w-4 text-ink-400 shrink-0" />
            <input
              type={showPwd ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="flex-1 bg-transparent text-sm outline-none text-ink-900 placeholder:text-ink-400"
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShowPwd(!showPwd)}
              className="h-8 w-8 rounded-full text-ink-400 hover:text-ink-700 hover:bg-bg-100 flex items-center justify-center transition-colors"
              aria-label={showPwd ? "Ocultar contraseña" : "Mostrar contraseña"}
            >
              {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </label>
      </div>

      <div className="flex items-center justify-between text-xs px-1">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="sr-only peer"
          />
          <span
            aria-hidden
            className="h-[18px] w-[18px] rounded-[5px] border border-line-200 bg-surface flex items-center justify-center transition-colors peer-checked:bg-brand-700 peer-checked:border-brand-700"
          >
            {remember && <Check className="h-3 w-3 text-primary-foreground" strokeWidth={3} />}
          </span>
          <span className="text-ink-700 leading-none">Recordarme</span>
        </label>
        <button type="button" className="text-brand-700 hover:underline font-medium">
          ¿Olvidaste la contraseña?
        </button>
      </div>

      {err && (
        <div className="rounded-xl border border-risk-high/30 bg-error-soft p-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-risk-high shrink-0 mt-0.5" />
            <p className="text-xs text-ink-700">{err}</p>
          </div>
          {redirectToPortal && (
            <button
              type="button"
              onClick={goToPatientPortal}
              className="mt-3 w-full inline-flex items-center justify-center gap-1.5 h-10 rounded-full bg-brand-700 text-primary-foreground text-sm font-semibold hover:bg-brand-800 transition-colors"
            >
              <Heart className="h-3.5 w-3.5" />
              Ir al portal del paciente
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        // En dark mode el botón pasa a fondo blanco con texto oscuro
        // (mismo estilo del light, invertido) — más legible que el teal
        // que casi se confundía con el fondo. dark:text-[oklch(...)]
        // hardcodea el valor del ink-900 del light theme porque el
        // token text-ink-900 se invierte en dark y daría blanco/blanco.
        className="w-full h-12 rounded-full text-sm font-semibold transition-all disabled:opacity-60 bg-brand-700 text-primary-foreground hover:bg-brand-800 dark:bg-white dark:text-[oklch(0.27_0.018_250)] dark:hover:bg-[oklch(0.94_0.005_120)] shadow-[0_8px_20px_-8px_oklch(0.53_0.045_200/0.5)] hover:shadow-[0_12px_28px_-10px_oklch(0.53_0.045_200/0.6)] hover:-translate-y-0.5 active:translate-y-0 inline-flex items-center justify-center gap-2"
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        Ingresar
      </button>


    </form>
  );
}



