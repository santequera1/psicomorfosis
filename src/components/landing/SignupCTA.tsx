import { useState } from "react";
import { motion } from "framer-motion";
import { Mail, X } from "lucide-react";
import { easeOutExpo, fadeUp, staggerParent } from "./motion";
import { SignUpForm } from "@/components/auth/SignUpForm";

/**
 * Cierre de /inicio2 (1 sep 2026): reemplaza a FinalCTA + DemoForm.
 * Mismo panel oscuro cinematográfico del cierre original, pero con el
 * registro de verdad: "con Google" arranca el OAuth directo y "con mi
 * correo" abre el formulario real de registro (SignUpForm, el mismo del
 * /login) en un modal protegido contra cierres accidentales.
 */
export function SignupCTA() {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <section id="demo" className="py-16 sm:py-20 relative">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 40, filter: "blur(12px)" }}
          whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 1, ease: easeOutExpo }}
          className="relative rounded-3xl overflow-hidden border border-brand-900/20 bg-linear-to-br from-[oklch(0.28_0.04_175)] via-[oklch(0.32_0.05_175)] to-[oklch(0.25_0.05_185)] px-6 sm:px-12 lg:px-20 py-14 sm:py-20 text-center"
        >
          {/* Glow respirante */}
          <motion.div
            className="absolute -inset-x-32 -top-32 -bottom-32 pointer-events-none blur-3xl"
            style={{
              background:
                "radial-gradient(ellipse at center, oklch(0.7 0.15 175 / 0.5), transparent 60%)",
            }}
            animate={{ opacity: [0.4, 0.7, 0.4], scale: [1, 1.05, 1] }}
            transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
            aria-hidden
          />

          {/* Dots sutiles */}
          <div
            className="absolute inset-0 opacity-[0.06] pointer-events-none"
            style={{
              backgroundImage:
                "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
              backgroundSize: "32px 32px",
            }}
            aria-hidden
          />

          <motion.div
            variants={staggerParent}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            className="relative max-w-3xl mx-auto"
          >
            <motion.p
              variants={fadeUp}
              className="text-xs uppercase tracking-widest text-white font-semibold"
            >
              Empieza aquí
            </motion.p>
            <motion.h2
              variants={fadeUp}
              className="mt-4 font-serif text-4xl sm:text-5xl lg:text-6xl text-white leading-[1.05] tracking-tight"
            >
              Crea tu cuenta en Psicomorfosis
            </motion.h2>
            <motion.p
              variants={fadeUp}
              className="mt-6 text-base sm:text-lg text-brand-50/80 leading-relaxed max-w-2xl mx-auto"
            >
              Creas tu cuenta y entras de una. Gratis mientras estamos en fase
              inicial — sin tarjeta de crédito.
            </motion.p>

            <motion.div
              variants={fadeUp}
              className="mt-10 flex items-center justify-center gap-3 flex-wrap"
            >
              <motion.a
                href="/api/auth/google"
                whileHover={{ y: -2, scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                transition={{ duration: 0.3, ease: easeOutExpo }}
                className="h-12 px-6 rounded-lg bg-white text-ink-900 text-sm font-medium inline-flex items-center gap-2.5 shadow-2xl shadow-black/20"
              >
                <svg viewBox="0 0 48 48" className="h-[18px] w-[18px]" aria-hidden>
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                </svg>
                Crear cuenta con Google
              </motion.a>
              <motion.button
                type="button"
                onClick={() => setModalOpen(true)}
                whileHover={{ y: -2 }}
                transition={{ duration: 0.3, ease: easeOutExpo }}
                className="h-12 px-6 rounded-lg border border-white/20 bg-white/5 text-white text-sm font-medium inline-flex items-center gap-2 hover:bg-white/10 transition-colors"
              >
                <Mail className="h-4 w-4" /> Crear con mi correo
              </motion.button>
            </motion.div>

            <motion.p
              variants={fadeUp}
              className="mt-8 text-xs text-brand-100/70"
            >
              Sin tarjeta · Sin compromiso · Soporte directo por WhatsApp
            </motion.p>
          </motion.div>
        </motion.div>
      </div>

      {modalOpen && <SignupModal onClose={() => setModalOpen(false)} />}
    </section>
  );
}

/**
 * Modal con el formulario real de registro. Protegido como el wizard de
 * reservas: el clic fuera no cierra, y la X pregunta antes de descartar
 * lo diligenciado.
 */
function SignupModal({ onClose }: { onClose: () => void }) {
  const [confirmClose, setConfirmClose] = useState(false);

  return (
    <div className="fixed inset-0 z-50 bg-ink-900/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: easeOutExpo }}
        className="relative w-full sm:max-w-md bg-surface rounded-t-3xl sm:rounded-3xl shadow-modal max-h-[92svh] overflow-y-auto"
      >
        <header className="sticky top-0 z-10 bg-surface border-b border-line-100 px-5 sm:px-6 py-4 flex items-center justify-between">
          <div>
            <h3 className="font-serif text-lg text-ink-900">Crear mi cuenta</h3>
            <p className="text-xs text-ink-500 mt-0.5">Un minuto y entras de una.</p>
          </div>
          <button
            onClick={() => setConfirmClose(true)}
            className="h-9 w-9 rounded-full bg-bg-100 hover:bg-bg-200 text-ink-500 flex items-center justify-center"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="p-5 sm:p-6">
          <SignUpForm onDone={() => window.location.replace("/")} />
        </div>

        {confirmClose && (
          <div className="absolute inset-0 z-20 bg-surface/95 backdrop-blur-sm flex items-center justify-center p-6">
            <div className="text-center max-w-xs">
              <p className="text-base font-semibold text-ink-900">¿Cerrar sin terminar?</p>
              <p className="text-sm text-ink-500 mt-1">Se perderá lo que llevas diligenciado.</p>
              <div className="mt-5 grid gap-2">
                <button
                  onClick={() => setConfirmClose(false)}
                  className="h-11 rounded-xl bg-brand-700 text-white text-sm font-semibold hover:bg-brand-800"
                >
                  Seguir con mi registro
                </button>
                <button
                  onClick={onClose}
                  className="h-11 rounded-xl border border-line-200 text-sm text-ink-700 hover:border-brand-400"
                >
                  Cerrar de todos modos
                </button>
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
