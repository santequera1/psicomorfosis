import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { CheckCircle2, Eye, EyeOff, Loader2, Lock, Send, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { easeOutExpo } from "./motion";
import { SectionHeader } from "./Features";

/**
 * Form público de registro (antes "solicitud de demo"). POST sin auth a
 * /api/landing/register. El backend persiste en account_requests con
 * status='pending'; el platform admin aprueba/rechaza desde
 * /platform/solicitudes y al aprobar el usuario recibe email de
 * bienvenida con su username.
 *
 * Mantenemos el componente exportado como `DemoForm` para no romper el
 * import de inicio.tsx — pero conceptualmente ahora es RegisterForm.
 */
export function DemoForm() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [sent, setSent] = useState(false);

  const mu = useMutation({
    mutationFn: () => api.submitRegistration({
      fullName: fullName.trim(),
      email: email.trim().toLowerCase(),
      username: username.trim().toLowerCase() || undefined,
      password,
      phone: phone.trim() || undefined,
      message: message.trim() || undefined,
    }),
    onSuccess: () => setSent(true),
    onError: (e: Error) => toast.error(e?.message ?? "No pudimos procesar tu solicitud"),
  });

  // Username sugerido a partir del email — solo display, no se envía
  // como "manual". Si el usuario lo deja vacío, el server lo deriva.
  const usernameHint = useMemo(() => {
    const local = email.split("@")[0]?.toLowerCase().replace(/[^a-z0-9._-]/g, "") ?? "";
    return local || null;
  }, [email]);

  const passwordsMatch = password.length === 0 || password === confirmPassword;

  const canSubmit =
    fullName.trim().length >= 2 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) &&
    password.length >= 8 &&
    passwordsMatch &&
    !mu.isPending;

  return (
    <section id="demo" className="py-20 sm:py-28 relative">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader
          eyebrow="Empieza aquí"
          title="Crea tu cuenta en Psicomorfosis"
          subtitle="Llenas el formulario, revisamos tu solicitud y te enviamos por correo el acceso a la plataforma — usualmente en menos de 24 horas."
        />

        <motion.div
          initial={{ opacity: 0, y: 30, filter: "blur(10px)" }}
          whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.9, ease: easeOutExpo }}
          className="mt-12 rounded-2xl border border-line-200 bg-surface/70 backdrop-blur-sm p-6 sm:p-10 shadow-lg shadow-brand-700/5"
        >
          {sent ? (
            <ThankYou />
          ) : (
            <form
              onSubmit={(e) => { e.preventDefault(); if (canSubmit) mu.mutate(); }}
              className="space-y-4"
            >
              <Field label="Nombre completo" required hint="Lo usaremos como nombre de tu consulta.">
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="María Camila Rondón"
                  autoComplete="name"
                  required
                  minLength={2}
                  maxLength={100}
                  className="w-full h-11 px-3 rounded-lg border border-line-200 bg-surface text-sm text-ink-900 focus:outline-none focus:border-brand-400"
                />
              </Field>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Correo electrónico" required>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="maria@consultorio.co"
                    autoComplete="email"
                    required
                    className="w-full h-11 px-3 rounded-lg border border-line-200 bg-surface text-sm text-ink-900 focus:outline-none focus:border-brand-400"
                  />
                </Field>
                <Field
                  label="Usuario"
                  hint={usernameHint && !username ? `Si lo dejas vacío, será “${usernameHint}”.` : "3-50 caracteres, sin espacios."}
                >
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder={usernameHint ?? "mariacamila"}
                    autoComplete="username"
                    maxLength={50}
                    className="w-full h-11 px-3 rounded-lg border border-line-200 bg-surface text-sm text-ink-900 focus:outline-none focus:border-brand-400 lowercase"
                  />
                </Field>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Contraseña" required hint="Mínimo 8 caracteres.">
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400" aria-hidden />
                    <input
                      type={showPwd ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Mínimo 8 caracteres"
                      autoComplete="new-password"
                      required
                      minLength={8}
                      maxLength={128}
                      className="w-full h-11 pl-9 pr-10 rounded-lg border border-line-200 bg-surface text-sm text-ink-900 focus:outline-none focus:border-brand-400"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwd((s) => !s)}
                      tabIndex={-1}
                      className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 inline-flex items-center justify-center rounded text-ink-500 hover:text-ink-700"
                      aria-label={showPwd ? "Ocultar contraseña" : "Mostrar contraseña"}
                    >
                      {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </Field>
                <Field
                  label="Confirma la contraseña"
                  required
                  hint={!passwordsMatch ? "Las contraseñas no coinciden." : undefined}
                  hintTone={!passwordsMatch ? "error" : undefined}
                >
                  <input
                    type={showPwd ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repítela"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    maxLength={128}
                    className="w-full h-11 px-3 rounded-lg border border-line-200 bg-surface text-sm text-ink-900 focus:outline-none focus:border-brand-400"
                  />
                </Field>
              </div>

              <Field label="Teléfono / WhatsApp">
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+57 300 000 0000"
                  autoComplete="tel"
                  className="w-full h-11 px-3 rounded-lg border border-line-200 bg-surface text-sm text-ink-900 focus:outline-none focus:border-brand-400"
                />
              </Field>

              <Field label="Cuéntanos sobre tu consulta (opcional)">
                <textarea
                  rows={3}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="¿Cuántos pacientes manejas? ¿Qué herramientas usas actualmente?"
                  maxLength={2000}
                  className="w-full px-3 py-2 rounded-lg border border-line-200 bg-surface text-sm text-ink-900 focus:outline-none focus:border-brand-400 resize-y leading-relaxed"
                />
              </Field>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="w-full h-12 rounded-lg bg-brand-700 text-white text-sm font-medium hover:bg-brand-800 disabled:opacity-50 inline-flex items-center justify-center gap-2 transition-colors"
                >
                  {mu.isPending
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Enviando…</>
                    : <><Send className="h-4 w-4" /> Quiero acceso</>}
                </button>
                <p className="mt-3 text-[11px] text-ink-500 text-center flex items-center justify-center gap-1.5">
                  <ShieldCheck className="h-3 w-3" />
                  Tu contraseña se guarda cifrada. No compartimos tus datos con nadie.
                </p>
              </div>
            </form>
          )}
        </motion.div>
      </div>
    </section>
  );
}

function Field({
  label,
  required,
  hint,
  hintTone,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  hintTone?: "default" | "error";
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-ink-700 mb-1.5">
        {label}{required && <span className="text-rose-600 ml-0.5">*</span>}
      </span>
      {children}
      {hint && (
        <span className={"mt-1 block text-[11px] " + (hintTone === "error" ? "text-rose-700" : "text-ink-500")}>
          {hint}
        </span>
      )}
    </label>
  );
}

function ThankYou() {
  return (
    <div className="text-center py-8">
      <div className="h-14 w-14 mx-auto rounded-full bg-success-soft text-success flex items-center justify-center mb-4">
        <CheckCircle2 className="h-7 w-7" />
      </div>
      <h3 className="font-serif text-2xl text-ink-900">Recibimos tu solicitud.</h3>
      <p className="mt-2 text-sm text-ink-500 max-w-md mx-auto leading-relaxed">
        Te enviamos un correo confirmando los datos. Cuando aprobemos tu acceso te avisaremos por
        email, generalmente en menos de 24 horas.
      </p>
    </div>
  );
}
