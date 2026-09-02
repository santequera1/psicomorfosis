import { motion } from "framer-motion";
import { CheckCheck, ArrowRight } from "lucide-react";
import { fadeUpSubtle, scaleIn, staggerParent } from "./motion";

/**
 * Sección de precios (experimento /inicio2, 1 sep 2026 — referencia:
 * pricing de 21st.dev, adaptada al sistema visual de la landing).
 * Estrategia de lanzamiento: mostrar el precio de mercado TACHADO y
 * "Gratis durante todo el 2026" en grande. Sin toggle mensual/anual —
 * no hay nada que alternar mientras todo esté en cero.
 */

const PLANS = [
  {
    name: "Independiente",
    description: "Para psicólogos con consulta propia.",
    strikePrice: "$59.900 COP/mes",
    popular: true,
    includesTitle: "Tu cuenta incluye:",
    includes: [
      "Pacientes y agenda ilimitados",
      "Historia clínica y notas de sesión",
      "Documentos con firma del paciente",
      "Tests psicométricos calificados",
      "Laura, tu asistente por WhatsApp",
      "Perfil público con reservas en línea",
      "Google Calendar y Meet conectados",
      "Portal del paciente",
    ],
  },
  {
    name: "Consultorio",
    description: "Para centros y equipos con varios profesionales.",
    strikePrice: "$119.900 COP/mes",
    popular: false,
    includesTitle: "Todo lo de Independiente, más:",
    includes: [
      "Varios profesionales en la misma cuenta",
      "Sedes y consultorios",
      "Roles y permisos por miembro",
      "Reportes de todo el equipo",
      "Acompañamiento en la migración de tus datos",
    ],
  },
];

export function Pricing2() {
  return (
    <section id="precios" className="py-14 sm:py-24 relative">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          variants={staggerParent}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.4 }}
          className="mb-8 sm:mb-12 max-w-2xl"
        >
          <motion.p variants={fadeUpSubtle} className="text-xs uppercase tracking-widest text-brand-700 font-semibold">
            Precios
          </motion.p>
          <motion.h2 variants={fadeUpSubtle} className="mt-2 font-serif text-3xl sm:text-5xl text-ink-900 tracking-tight">
            Todo esto, gratis durante el 2026.
          </motion.h2>
          <motion.p variants={fadeUpSubtle} className="mt-3 text-sm sm:text-base text-ink-500 leading-relaxed">
            Las plataformas de gestión para psicólogos suelen costar entre
            $25 y $60 USD al mes. Nosotros estamos construyendo esto con la
            comunidad, así que la cuenta completa no cuesta nada durante todo
            el 2026. Sin tarjeta y sin letra pequeña.
          </motion.p>
        </motion.div>

        <motion.div
          variants={staggerParent}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.15 }}
          className="grid md:grid-cols-2 gap-4 sm:gap-5"
        >
          {PLANS.map((plan) => (
            <motion.div
              key={plan.name}
              variants={scaleIn}
              className={`relative rounded-2xl border bg-surface p-6 sm:p-8 ${
                plan.popular
                  ? "border-brand-400 ring-1 ring-brand-400/40 shadow-lg shadow-brand-700/10"
                  : "border-line-200"
              }`}
            >
              {plan.popular && (
                <span className="absolute -top-3 left-6 px-3 py-1 rounded-full bg-brand-700 text-white text-[11px] font-medium">
                  Lanzamiento
                </span>
              )}
              <h3 className="font-serif text-2xl text-ink-900">{plan.name}</h3>
              <p className="mt-1 text-sm text-ink-500">{plan.description}</p>

              <div className="mt-5 flex items-baseline gap-3 flex-wrap">
                <span className="font-serif text-4xl sm:text-5xl text-ink-900">Gratis</span>
                <span className="text-sm text-ink-400 line-through decoration-ink-400/70">
                  {plan.strikePrice}
                </span>
              </div>
              <span className="mt-2 inline-flex items-center px-2.5 py-1 rounded-full bg-brand-50 border border-brand-100 text-[11px] text-brand-800 font-medium">
                Hasta el 31 de diciembre de 2026
              </span>

              <a
                href="#demo"
                className={`mt-6 w-full h-11 rounded-lg text-sm font-medium inline-flex items-center justify-center gap-2 transition-colors ${
                  plan.popular
                    ? "bg-brand-700 text-white hover:bg-brand-800 shadow-lg shadow-brand-700/20"
                    : "border border-line-200 text-ink-700 hover:border-brand-400"
                }`}
              >
                Crear mi cuenta gratis <ArrowRight className="h-4 w-4" />
              </a>

              <div className="mt-6 pt-5 border-t border-line-100">
                <p className="text-xs font-medium text-ink-800 mb-3">{plan.includesTitle}</p>
                <ul className="space-y-2.5">
                  {plan.includes.map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5 text-sm text-ink-600">
                      <span className="h-5 w-5 rounded-full bg-brand-50 border border-brand-200 grid place-content-center shrink-0 mt-px">
                        <CheckCheck className="h-3 w-3 text-brand-700" />
                      </span>
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          ))}
        </motion.div>

        <motion.p
          variants={fadeUpSubtle}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          className="mt-6 text-xs text-ink-400 text-center max-w-xl mx-auto"
        >
          Cuando los planes tengan precio, avisaremos con meses de antelación
          — y nada de lo que registres queda atrapado: tus datos siempre se
          pueden exportar.
        </motion.p>
      </div>
    </section>
  );
}
