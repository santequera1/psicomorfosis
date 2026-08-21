import { useState } from "react";
import { Mail, Loader2, ArrowRight, ChevronLeft, CheckCircle2 } from "lucide-react";
import { api } from "@/lib/api";

/**
 * "Olvidé mi contraseña". Pide correo o usuario y muestra SIEMPRE la
 * misma confirmación — el backend tampoco distingue, así que nadie puede
 * usar esta pantalla para averiguar qué correos están registrados.
 */
export function ForgotPasswordForm({ onBack, initialIdentifier = "" }: { onBack: () => void; initialIdentifier?: string }) {
  const [identifier, setIdentifier] = useState(initialIdentifier);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!identifier.trim() || loading) return;
    setLoading(true);
    try {
      await api.forgotPassword(identifier.trim());
    } catch {
      // Aunque falle la red mostramos la misma pantalla: no hay nada útil
      // que la persona pueda hacer distinto, y no filtramos información.
    }
    setSent(true);
    setLoading(false);
  }

  if (sent) {
    return (
      <div className="text-center">
        <div className="mx-auto h-12 w-12 rounded-full bg-brand-50 flex items-center justify-center">
          <CheckCircle2 className="h-6 w-6 text-brand-700" />
        </div>
        <h2 className="mt-4 font-serif text-xl text-ink-900">Revisa tu correo</h2>
        <p className="mt-2 text-sm text-ink-500 leading-relaxed">
          Si <span className="text-ink-900 font-medium break-all">{identifier}</span> corresponde a una cuenta,
          te enviamos un enlace para elegir una contraseña nueva. Vale 60 minutos.
        </p>
        <p className="mt-3 text-xs text-ink-400">¿No llega? Mira en spam, o prueba con tu nombre de usuario.</p>
        <button type="button" onClick={onBack} className="mt-6 text-sm font-medium text-brand-700 hover:underline inline-flex items-center gap-1">
          <ChevronLeft className="h-4 w-4" /> Volver a iniciar sesión
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <h2 className="font-serif text-xl text-ink-900">Restablecer contraseña</h2>
        <p className="mt-1 text-sm text-ink-500">Dinos tu correo o usuario y te mandamos un enlace.</p>
      </div>
      <label className="block">
        <span className="text-xs text-ink-700 font-medium pl-4">Correo o usuario</span>
        <div className="mt-1.5 flex items-center gap-3 h-12 pl-4 pr-3 rounded-full border border-line-200 bg-bg-50/60 focus-within:border-brand-700 focus-within:bg-surface transition-colors">
          <Mail className="h-4 w-4 text-ink-400 shrink-0" />
          <input
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            autoComplete="username"
            className="flex-1 bg-transparent text-sm outline-none text-ink-900 placeholder:text-ink-400"
            placeholder="tu@correo.com"
          />
        </div>
      </label>
      <button
        type="submit"
        disabled={!identifier.trim() || loading}
        className="w-full h-12 rounded-full text-primary-foreground text-sm font-semibold bg-brand-700 hover:bg-brand-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all inline-flex items-center justify-center gap-2"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Enviarme el enlace <ArrowRight className="h-4 w-4" /></>}
      </button>
      <button type="button" onClick={onBack} className="w-full text-sm text-ink-500 hover:text-brand-700 inline-flex items-center justify-center gap-1">
        <ChevronLeft className="h-4 w-4" /> Volver
      </button>
    </form>
  );
}
