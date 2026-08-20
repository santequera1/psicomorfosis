import { useState } from "react";
import {
  Mail, Lock, Eye, EyeOff, AlertCircle, Loader2, Check,
  ArrowRight, User, Sparkles, Phone,
} from "lucide-react";
import { api, setSession, ApiError } from "@/lib/api";

/**
 * Registro público de psicólogos.
 *
 * Crea el workspace + la ficha del profesional + el usuario super_admin
 * en una sola llamada, y deja la sesión iniciada (el backend devuelve el
 * token). Plan 'free' por ahora; el cobro se habilita después sin tocar
 * este formulario.
 */
export function SignUpForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [terms, setTerms] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const pwdOk = password.length >= 8;
  const emailOk = /\S+@\S+\.\S+/.test(email);
  const canSubmit = name.trim().length >= 3 && emailOk && pwdOk && terms && !loading;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setErr(null);
    try {
      const { token, user } = await api.register({
        name: name.trim(),
        email: email.trim(),
        password,
        phone: phone.trim() || undefined,
        acceptedTerms: true,
      });
      setSession(token, user);
      onDone();
    } catch (error) {
      setErr(
        error instanceof ApiError
          ? error.message
          : "No pudimos crear tu cuenta. Intenta de nuevo.",
      );
      setLoading(false);
    }
  }

  const fieldWrap =
    "mt-1.5 flex items-center gap-3 h-12 pl-4 pr-3 rounded-full border border-line-200 bg-bg-50/60 focus-within:border-brand-700 focus-within:bg-surface transition-colors";
  const inputCls =
    "flex-1 bg-transparent outline-none text-sm text-ink-900 placeholder:text-ink-400";

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="rounded-2xl bg-brand-50/60 border border-brand-100 px-4 py-3 flex items-start gap-2.5">
        <Sparkles className="h-4 w-4 text-brand-700 shrink-0 mt-0.5" />
        <p className="text-xs text-brand-900 leading-relaxed">
          Crea tu consulta en un minuto. <strong>Gratis</strong> mientras estamos en
          fase inicial — sin tarjeta de crédito.
        </p>
      </div>

      <label className="block">
        <span className="text-xs text-ink-700 font-medium pl-4">Nombre completo</span>
        <div className={fieldWrap}>
          <User className="h-4 w-4 text-ink-400 shrink-0" />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ana Ramírez Gómez"
            autoComplete="name"
            className={inputCls}
          />
        </div>
      </label>

      <label className="block">
        <span className="text-xs text-ink-700 font-medium pl-4">Correo profesional</span>
        <div className={fieldWrap}>
          <Mail className="h-4 w-4 text-ink-400 shrink-0" />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@correo.com"
            inputMode="email"
            autoComplete="email"
            className={inputCls}
          />
        </div>
      </label>

      <label className="block">
        <span className="text-xs text-ink-700 font-medium pl-4">Contraseña</span>
        <div className="mt-1.5 flex items-center gap-3 h-12 pl-4 pr-2 rounded-full border border-line-200 bg-bg-50/60 focus-within:border-brand-700 focus-within:bg-surface transition-colors">
          <Lock className="h-4 w-4 text-ink-400 shrink-0" />
          <input
            type={showPwd ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mínimo 8 caracteres"
            autoComplete="new-password"
            className={inputCls}
          />
          <button
            type="button"
            onClick={() => setShowPwd((v) => !v)}
            className="h-9 w-9 rounded-full hover:bg-bg-100 flex items-center justify-center text-ink-400 shrink-0"
            aria-label={showPwd ? "Ocultar contraseña" : "Mostrar contraseña"}
          >
            {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {password.length > 0 && !pwdOk && (
          <span className="text-[11px] text-risk-moderate pl-4 mt-1 inline-block">
            Te faltan {8 - password.length} caracteres
          </span>
        )}
      </label>

      <label className="block">
        <span className="text-xs text-ink-700 font-medium pl-4">
          WhatsApp <span className="text-ink-400 font-normal">(opcional)</span>
        </span>
        <div className={fieldWrap}>
          <Phone className="h-4 w-4 text-ink-400 shrink-0" />
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+57 300 123 4567"
            inputMode="tel"
            autoComplete="tel"
            className={inputCls}
          />
        </div>
      </label>

      <button
        type="button"
        onClick={() => setTerms((v) => !v)}
        className="flex items-start gap-2.5 text-left w-full"
      >
        <span
          className={
            "h-5 w-5 rounded-md border shrink-0 mt-0.5 flex items-center justify-center transition-colors " +
            (terms ? "bg-brand-700 border-brand-700" : "border-line-200 bg-surface")
          }
        >
          {terms && <Check className="h-3 w-3 text-primary-foreground" strokeWidth={3} />}
        </span>
        <span className="text-xs text-ink-700 leading-relaxed">
          Acepto los{" "}
          <a href="/terminos" target="_blank" rel="noreferrer" className="text-brand-700 underline underline-offset-2">
            términos y condiciones
          </a>{" "}
          y el{" "}
          <a href="/privacidad" target="_blank" rel="noreferrer" className="text-brand-700 underline underline-offset-2">
            aviso de privacidad
          </a>
          . Manejaré datos clínicos conforme a la Ley 1581 de 2012.
        </span>
      </button>

      {err && (
        <div className="rounded-2xl bg-error-soft border border-error/20 px-4 py-3 flex items-start gap-2.5">
          <AlertCircle className="h-4 w-4 text-error shrink-0 mt-0.5" />
          <p className="text-xs text-error leading-relaxed">{err}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full h-12 rounded-full text-primary-foreground text-sm font-semibold bg-brand-700 hover:bg-brand-800 disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_8px_20px_-8px_oklch(0.53_0.045_200/0.5)] hover:-translate-y-0.5 disabled:hover:translate-y-0 transition-all inline-flex items-center justify-center gap-2"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            Crear mi consulta <ArrowRight className="h-4 w-4" />
          </>
        )}
      </button>
    </form>
  );
}
