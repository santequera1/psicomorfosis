import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { api, setSession, ApiError } from "@/lib/api";
import { Mail, Lock, Eye, EyeOff, AlertCircle, Loader2, ChevronLeft, Info, Check } from "lucide-react";

type LoginSearch = { redirect?: string };

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Ingresar · Psicomorfosis" }] }),
  validateSearch: (s: Record<string, unknown>): LoginSearch => ({
    redirect: typeof s.redirect === "string" ? s.redirect : undefined,
  }),
  component: LoginPage,
});

type Tab = "login" | "signup";

function LoginPage() {
  const search = useSearch({ from: "/login" });
  const navigate = useNavigate();

  const [tab, setTab] = useState<Tab>("login");
  const [username, setUsername] = useState("nathaly");
  const [password, setPassword] = useState("nathaly123");
  const [showPwd, setShowPwd] = useState(false);
  const [remember, setRemember] = useState(true);
  const [demoOpen, setDemoOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    try {
      const { token, user } = await api.login(username, password);
      setSession(token, user);
      const redirect = search.redirect ?? "/";
      navigate({ to: redirect as any });
    } catch (error) {
      const msg =
        error instanceof ApiError
          ? error.message
          : "No se pudo conectar al servidor. ¿Está corriendo el backend en http://localhost:3002?";
      setErr(msg);
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen w-full bg-bg-50 flex items-center justify-center px-4 py-6 md:py-10">
      <div className="relative w-full max-w-md rounded-[32px] overflow-hidden bg-surface shadow-modal">
        {/* Logo panel (inside card, subtle brand tint) */}
        <div className="relative bg-brand-50 py-12 px-6 flex items-center justify-center">
          <img
            src="/logo-psicomorfosis.png"
            alt="Psicomorfosis · Psic. Nathaly Ferrer Pacheco"
            className="w-[280px] max-w-full select-none"
          />

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
              Log In
            </button>
            <button
              type="button"
              onClick={() => setTab("signup")}
              className={
                "relative flex-1 h-9 text-sm font-medium rounded-full transition-colors " +
                (tab === "signup" ? "text-primary-foreground" : "text-ink-500")
              }
            >
              Sign Up
            </button>
          </div>

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
              demoOpen={demoOpen}
              setDemoOpen={setDemoOpen}
              onPickDemo={(u, p) => { setUsername(u); setPassword(p); setDemoOpen(false); }}
            />
          ) : (
            <SignUpBlocked />
          )}
        </div>
      </div>
    </div>
  );
}

function LoginForm({
  username, setUsername, password, setPassword,
  showPwd, setShowPwd, remember, setRemember,
  err, loading, onSubmit, demoOpen, setDemoOpen, onPickDemo,
}: {
  username: string; setUsername: (v: string) => void;
  password: string; setPassword: (v: string) => void;
  showPwd: boolean; setShowPwd: (v: boolean) => void;
  remember: boolean; setRemember: (v: boolean) => void;
  err: string | null; loading: boolean;
  onSubmit: (e: React.FormEvent) => void;
  demoOpen: boolean; setDemoOpen: (v: boolean) => void;
  onPickDemo: (u: string, p: string) => void;
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
        <div className="rounded-xl border border-risk-high/30 bg-error-soft p-3 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-risk-high shrink-0 mt-0.5" />
          <p className="text-xs text-ink-700">{err}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full h-12 rounded-full text-primary-foreground text-sm font-semibold transition-all disabled:opacity-60 bg-brand-700 hover:bg-brand-800 shadow-[0_8px_20px_-8px_oklch(0.53_0.045_200/0.5)] hover:shadow-[0_12px_28px_-10px_oklch(0.53_0.045_200/0.6)] hover:-translate-y-0.5 active:translate-y-0 inline-flex items-center justify-center gap-2"
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        Ingresar
      </button>

      {/* Divider */}
      <div className="flex items-center gap-3 py-1">
        <div className="flex-1 h-px bg-line-200" />
        <span className="text-[11px] uppercase tracking-widest text-ink-400">o continúa con</span>
        <div className="flex-1 h-px bg-line-200" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          disabled
          title="Disponible próximamente"
          className="w-full h-11 rounded-full border border-line-200 bg-surface text-sm text-ink-700 hover:border-brand-400 hover:bg-bg-50 transition-colors flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <GoogleIcon />
          Google
        </button>
        <button
          type="button"
          disabled
          title="Disponible próximamente"
          className="w-full h-11 rounded-full border border-line-200 bg-surface text-sm text-ink-700 hover:border-brand-400 hover:bg-bg-50 transition-colors flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <AppleIcon />
          Apple
        </button>
      </div>

      {/* Demo credentials collapsible */}
      <div className="pt-2">
        <button
          type="button"
          onClick={() => setDemoOpen(!demoOpen)}
          className="w-full text-[11px] text-ink-500 hover:text-brand-700 inline-flex items-center justify-center gap-1.5 transition-colors"
        >
          <Info className="h-3 w-3" />
          {demoOpen ? "Ocultar" : "Ver"} credenciales de demo
        </button>
        {demoOpen && (
          <div className="mt-2 rounded-xl border border-line-200 bg-bg-50/60 p-3">
            <p className="text-[10px] uppercase tracking-widest text-ink-500 font-medium mb-2">Demo</p>
            <ul className="space-y-1">
              {[
                { u: "admin",   p: "admin123",   label: "Super admin" },
                { u: "nathaly", p: "nathaly123", label: "Psicóloga (principal)" },
                { u: "lucia",   p: "lucia123",   label: "Psicóloga" },
                { u: "clara",   p: "clara123",   label: "Recepción" },
              ].map((c) => (
                <li key={c.u}>
                  <button
                    type="button"
                    onClick={() => onPickDemo(c.u, c.p)}
                    className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-left hover:bg-surface transition-colors"
                  >
                    <span className="text-xs text-ink-900 font-medium tabular">{c.u}</span>
                    <span className="text-[10px] text-ink-500">{c.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </form>
  );
}

function SignUpBlocked() {
  return (
    <div className="py-4 space-y-4">
      <div className="rounded-2xl border border-brand-700/20 bg-brand-50/50 p-5 text-center">
        <div className="h-12 w-12 rounded-full bg-brand-100 text-brand-800 inline-flex items-center justify-center mb-3">
          <Info className="h-5 w-5" />
        </div>
        <h3 className="font-serif text-lg text-ink-900">Acceso controlado</h3>
        <p className="text-sm text-ink-700 mt-2 leading-relaxed">
          Las cuentas de profesionales se crean desde el panel de administración.
          Contacta a tu super admin para obtener credenciales de acceso al workspace clínico.
        </p>
      </div>
      <button
        type="button"
        onClick={() => window.open("mailto:admin@psicomorfosis.co?subject=Solicitud%20de%20acceso%20Psicomorfosis")}
        className="w-full h-12 rounded-full text-primary-foreground text-sm font-semibold bg-brand-700 hover:bg-brand-800 shadow-[0_8px_20px_-8px_oklch(0.53_0.045_200/0.5)] hover:-translate-y-0.5 transition-all"
      >
        Solicitar acceso por correo
      </button>
      <p className="text-center text-xs text-ink-500">
        ¿Eres paciente? Próximamente tendrás un portal independiente.
      </p>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4">
      <path fill="#EA4335" d="M12 10.8v3.6h5.04c-.22 1.16-1.64 3.4-5.04 3.4-3.02 0-5.48-2.5-5.48-5.6S8.98 6.6 12 6.6c1.72 0 2.88.74 3.54 1.36l2.4-2.32C16.4 4.18 14.42 3.2 12 3.2 7.02 3.2 3 7.22 3 12.2s4.02 9 9 9c5.2 0 8.64-3.66 8.64-8.8 0-.6-.06-1.04-.14-1.6H12z" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-ink-900">
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  );
}
