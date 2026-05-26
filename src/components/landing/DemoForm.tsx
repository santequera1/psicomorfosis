import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import { api } from "@/lib/api";
import { easeOutExpo } from "./motion";
import { SectionHeader } from "./Features";

/**
 * Formulario público para solicitar demo. POST sin auth a
 * /api/landing/demo-request. El backend persiste en demo_requests
 * y envía email a stivenantequera@gmail.com (best effort).
 *
 * Después del éxito muestra un thank-you state en lugar del form
 * para feedback claro y para evitar que el usuario envíe dos veces.
 */
export function DemoForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  const mu = useMutation({
    mutationFn: () => api.submitDemoRequest({
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim() || undefined,
      message: message.trim() || undefined,
    }),
    onSuccess: () => {
      setSent(true);
    },
    onError: (e: Error) => toast.error(e?.message ?? "No se pudo enviar"),
  });

  const canSubmit =
    name.trim().length >= 2 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) &&
    !mu.isPending;

  return (
    <section id="demo" className="py-20 sm:py-28 relative">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader
          eyebrow="Empieza aquí"
          title="Queremos conocer tu consulta"
          subtitle="Te mostramos la plataforma en vivo con tu propio workspace y escuchamos cómo organizas hoy tus pacientes. Te contactamos en menos de 24 horas."
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Nombre completo" required>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="María Camila Rondón"
                    autoComplete="name"
                    required
                    minLength={2}
                    className="w-full h-11 px-3 rounded-lg border border-line-200 bg-surface text-sm text-ink-900 focus:outline-none focus:border-brand-400"
                  />
                </Field>
                <Field label="Email" required>
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
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="¿Cuántos pacientes manejas? ¿Qué herramientas usas actualmente? ¿Qué buscas mejorar?"
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
                <p className="mt-3 text-[11px] text-ink-500 text-center">
                  Tus datos solo los usamos para contactarte. No vendemos información ni hacemos spam.
                </p>
              </div>
            </form>
          )}
        </motion.div>
      </div>
    </section>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-ink-700 mb-1.5">
        {label}{required && <span className="text-rose-600 ml-0.5">*</span>}
      </span>
      {children}
    </label>
  );
}

function ThankYou() {
  return (
    <div className="text-center py-8">
      <div className="h-14 w-14 mx-auto rounded-full bg-success-soft text-success flex items-center justify-center mb-4">
        <CheckCircle2 className="h-7 w-7" />
      </div>
      <h3 className="font-serif text-2xl text-ink-900">Recibido. Te contactamos pronto.</h3>
      <p className="mt-2 text-sm text-ink-500 max-w-md mx-auto leading-relaxed">
        Vamos a revisar tu solicitud y escribirte por email o WhatsApp en menos de 24 horas para coordinar la demo.
      </p>
    </div>
  );
}
