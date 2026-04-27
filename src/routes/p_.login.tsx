import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2, Heart } from "lucide-react";
import { api, setSession } from "@/lib/api";
import { PortalCanvas } from "./p_.activar.$token";

export const Route = createFileRoute("/p_/login")({
  head: () => ({ meta: [{ title: "Mi portal — Psicomorfosis" }] }),
  component: PortalLoginPage,
});

function PortalLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await api.loginPatient(email, password);
      setSession(res.token, res.user as any);
      toast.success(`¡Hola ${res.user.name.split(" ")[0]}!`);
      navigate({ to: "/p/inicio" });
    } catch (e: any) {
      toast.error(e?.message ?? "Credenciales inválidas");
      setSubmitting(false);
    }
  }

  return (
    <PortalCanvas>
      <div className="max-w-sm mx-auto">
        <div className="text-center mb-8">
          <div className="h-14 w-14 mx-auto rounded-full bg-brand-50 flex items-center justify-center mb-4 border-2 border-brand-100">
            <Heart className="h-6 w-6 text-brand-700" />
          </div>
          <h1 className="font-serif text-2xl text-ink-900">Bienvenido a tu portal</h1>
          <p className="text-sm text-ink-500 mt-1.5">Inicia sesión para acceder a tu espacio.</p>
        </div>

        <form onSubmit={submit} className="space-y-4 bg-surface rounded-2xl border border-line-200 shadow-soft p-6">
          <div>
            <label className="block text-xs font-medium text-ink-700 mb-1.5">Correo electrónico</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
              required
              placeholder="tucorreo@ejemplo.com"
              className="w-full h-11 px-3 rounded-lg border border-line-200 bg-bg text-sm text-ink-900 focus:outline-none focus:border-brand-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-700 mb-1.5">Contraseña</label>
            <div className="relative">
              <input
                type={showPwd ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
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
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full h-11 rounded-lg bg-brand-700 text-white text-sm font-medium hover:bg-brand-800 disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Entrar
          </button>
        </form>

        <p className="text-center text-xs text-ink-500 mt-5">
          ¿Eres profesional?{" "}
          <Link to="/login" className="text-brand-700 hover:underline">Ingresa por aquí</Link>.
        </p>
      </div>
    </PortalCanvas>
  );
}
