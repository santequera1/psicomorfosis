import { motion } from "framer-motion";
import { Heart, MessageSquareQuote, Sparkles } from "lucide-react";
import { easeOutExpo, fadeUp, staggerParent } from "./motion";

/**
 * Manifiesto + testimonio. Es la sección de marca, no de features.
 * Aquí subimos el tono "movimiento" — Psicomorfosis es la nueva
 * generación de herramientas para psicólogos en Colombia.
 */
export function WhyUs() {
  return (
    <section id="why" className="py-20 sm:py-28 relative overflow-hidden">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Manifiesto grande */}
        <motion.div
          variants={staggerParent}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-100px" }}
          className="text-center max-w-3xl mx-auto"
        >
          <motion.p
            variants={fadeUp}
            className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-brand-700 font-semibold"
          >
            <Sparkles className="h-3.5 w-3.5" /> Posicionamiento
          </motion.p>
          <motion.h2
            variants={fadeUp}
            className="mt-4 font-serif text-3xl sm:text-4xl lg:text-5xl text-ink-900 leading-[1.15] tracking-tight"
          >
            La nueva generación de herramientas para{" "}
            <span className="text-brand-700">psicólogos en Colombia</span>.
          </motion.h2>
          <motion.p
            variants={fadeUp}
            className="mt-6 text-base sm:text-lg text-ink-700 leading-relaxed"
          >
            No es Notion con plantillas. No es Calendly con tema verde. Es la primera
            plataforma clínica construida con psicólogas reales que entiende
            cómo se trabaja aquí.
          </motion.p>
        </motion.div>

        <motion.div
          variants={staggerParent}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
          className="mt-16 grid grid-cols-1 md:grid-cols-2 gap-6"
        >
          {/* Testimonio */}
          <motion.div
            variants={fadeUp}
            whileHover={{ y: -4 }}
            transition={{ duration: 0.5, ease: easeOutExpo }}
            className="rounded-2xl bg-surface/80 backdrop-blur-sm border border-brand-700/15 p-8 shadow-lg shadow-brand-700/5"
          >
            <MessageSquareQuote className="h-7 w-7 text-brand-700" />
            <p className="mt-4 font-serif text-xl text-ink-900 leading-relaxed">
              "Antes pasaba dos horas al día solo gestionando WhatsApps, agendando citas y pasando tests al Excel. Ahora todo está aquí — y mis pacientes también."
            </p>
            <div className="mt-6 flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-brand-100 text-brand-800 flex items-center justify-center text-sm font-semibold">
                N
              </div>
              <div>
                <p className="text-sm text-ink-900 font-medium">Psicóloga clínica</p>
                <p className="text-xs text-ink-500">Usando Psicomorfosis hace 6 semanas · Bogotá</p>
              </div>
            </div>
          </motion.div>

          {/* Hecha en Colombia */}
          <motion.div
            variants={fadeUp}
            whileHover={{ y: -4 }}
            transition={{ duration: 0.5, ease: easeOutExpo }}
            className="rounded-2xl bg-surface/80 backdrop-blur-sm border border-line-200 p-8"
          >
            <Heart className="h-7 w-7 text-brand-700" />
            <h3 className="mt-4 font-serif text-2xl text-ink-900 leading-tight">
              Hecha en Colombia, con psicólogas reales
            </h3>
            <p className="mt-3 text-sm text-ink-700 leading-relaxed">
              Cada función nace de una conversación con una psicóloga clínica en ejercicio.
              No suponemos qué necesitas: nos lo dices y lo construimos en días, no en meses.
            </p>
            <ul className="mt-5 space-y-2.5 text-sm text-ink-700">
              <li className="flex items-start gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-700 mt-2 shrink-0" />
                Soporte directo por WhatsApp con quien construye la app
              </li>
              <li className="flex items-start gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-700 mt-2 shrink-0" />
                Plantillas pre-configuradas para consulta colombiana
              </li>
              <li className="flex items-start gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-700 mt-2 shrink-0" />
                Historia clínica organizada y lista para normativa colombiana
              </li>
            </ul>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
