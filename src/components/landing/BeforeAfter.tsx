import { motion } from "framer-motion";
import { Check, X } from "lucide-react";
import { easeOutExpo, fadeUp, staggerParent } from "./motion";
import { SectionHeader } from "./Features";

const BEFORE = [
  "Pacientes escribiendo por WhatsApp a cualquier hora",
  "Notas sueltas en libreta, Word o Drive",
  "Consentimientos impresos, firmados y escaneados",
  "Tests psicométricos corregidos a mano con la tabla del libro",
  "Recordatorios olvidados y citas que se pierden",
  "Sin idea de cuánto recauda la consulta este mes",
];

const AFTER = [
  "Cada paciente tiene su propio portal con citas, tareas y documentos",
  "Historia clínica organizada y lista para normativa colombiana",
  "Firma electrónica con sello de hora, IP y verificación",
  "Corrección automática, perfil por escala y exportación al Excel oficial",
  "Recordatorios automáticos por email a paciente y psicólogo",
  "Reportes de ingresos, asistencia y adherencia siempre al día",
];

export function BeforeAfter() {
  return (
    <section id="antes-despues" className="py-12 sm:py-20 relative">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader
          eyebrow="El cambio"
          title="Antes vs después de Psicomorfosis"
          subtitle="No vendemos software. Vendemos dejar de sufrir la parte administrativa de tu consulta."
        />

        <motion.div
          variants={staggerParent}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
          className="mt-10 sm:mt-14 grid grid-cols-1 md:grid-cols-2 gap-5 lg:gap-8"
        >
          {/* Antes — apagado, sutilmente inquieto */}
          <motion.div
            variants={fadeUp}
            whileHover="hover"
            className="rounded-2xl border border-rose-100/70 bg-rose-50/30 p-6 sm:p-8 relative overflow-hidden"
          >
            <motion.div
              variants={{
                hover: { x: [0, -2, 2, -1, 1, 0], transition: { duration: 0.5 } },
              }}
            >
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-100/70 border border-rose-200/60 text-xs text-rose-700 font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                Antes
              </div>
              <h3 className="mt-4 font-serif text-2xl text-ink-900 leading-tight">
                Atendiendo entre chats, papeles y hojas de cálculo
              </h3>
              <motion.ul
                variants={staggerParent}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true }}
                className="mt-6 space-y-3"
              >
                {BEFORE.map((item) => (
                  <motion.li
                    variants={fadeUp}
                    key={item}
                    className="flex items-start gap-3 text-sm text-ink-700 leading-relaxed"
                  >
                    <span className="mt-0.5 h-5 w-5 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                      <X className="h-3 w-3" />
                    </span>
                    <span>{item}</span>
                  </motion.li>
                ))}
              </motion.ul>
            </motion.div>
          </motion.div>

          {/* Después — limpio, con glow respirante */}
          <motion.div
            variants={fadeUp}
            whileHover={{ y: -4 }}
            transition={{ duration: 0.5, ease: easeOutExpo }}
            className="rounded-2xl border-2 border-brand-200 bg-brand-50/40 p-6 sm:p-8 relative overflow-hidden shadow-lg shadow-brand-700/5"
          >
            <motion.div
              className="absolute -top-16 -right-16 h-48 w-48 rounded-full blur-2xl pointer-events-none"
              style={{
                background:
                  "radial-gradient(circle, oklch(0.7 0.12 175 / 0.5), transparent 70%)",
              }}
              animate={{ opacity: [0.5, 0.8, 0.5], scale: [1, 1.1, 1] }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
              aria-hidden
            />
            <div className="relative">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-100 border border-brand-200 text-xs text-brand-800 font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-700" />
                Después
              </div>
              <h3 className="mt-4 font-serif text-2xl text-ink-900 leading-tight">
                Atendiendo desde una sola plataforma
              </h3>
              <motion.ul
                variants={staggerParent}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true }}
                className="mt-6 space-y-3"
              >
                {AFTER.map((item) => (
                  <motion.li
                    variants={fadeUp}
                    key={item}
                    className="flex items-start gap-3 text-sm text-ink-900 leading-relaxed"
                  >
                    <span className="mt-0.5 h-5 w-5 rounded-full bg-brand-700 text-white flex items-center justify-center shrink-0">
                      <Check className="h-3 w-3" strokeWidth={3} />
                    </span>
                    <span>{item}</span>
                  </motion.li>
                ))}
              </motion.ul>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
