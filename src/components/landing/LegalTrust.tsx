import { motion } from "framer-motion";
import { Lock, FileCheck, Eye, Database, ScrollText, ShieldCheck } from "lucide-react";
import { easeOutExpo, fadeUp, staggerParent } from "./motion";
import { SectionHeader } from "./Features";

/**
 * Sección Legal / Confidencialidad. Aborda las dos preguntas más
 * grandes que tiene una psicóloga al considerar una plataforma:
 *   1. "¿Cumple la normativa colombiana?" — Habeas Data, historia
 *      clínica y secreto profesional
 *   2. "¿Mi información clínica está segura técnicamente?" — cifrado,
 *      backups, auditoría
 *
 * Layout: dos columnas en desktop. Izquierda: 3 leyes colombianas
 * con su número y de qué tratan. Derecha: 3 medidas técnicas reales
 * de la plataforma.
 */
const LEYES = [
  {
    icon: ScrollText,
    code: "Ley 1581 / 2012",
    title: "Habeas Data",
    description: "Tratamiento de datos personales y consentimiento informado. Cada paciente firma su autorización al activar el portal.",
  },
  {
    icon: FileCheck,
    code: "Res. 1995 / 1999",
    title: "Historia clínica",
    description: "Formato, contenido y conservación de la historia clínica según la normativa del Ministerio de Salud colombiano.",
  },
  {
    icon: Lock,
    code: "Ley 1090 / 2006",
    title: "Secreto profesional",
    description: "Solo tú y tu paciente acceden a la información clínica. Ningún otro psicólogo del workspace puede verla sin tu permiso.",
  },
];

const MEDIDAS = [
  {
    icon: ShieldCheck,
    title: "Cifrado en tránsito",
    description: "Todo el tráfico viaja por HTTPS con TLS 1.3. Las sesiones JWT se firman con un secreto único por workspace.",
  },
  {
    icon: Database,
    title: "Backups diarios",
    description: "Snapshot completo de la base de datos cada noche a las 3 am, retenido 30 días. Restauración bajo demanda en menos de 1 hora.",
  },
  {
    icon: Eye,
    title: "Auditoría y trazabilidad",
    description: "Cada firma electrónica queda con sello de hora, IP y hash SHA-256. Toda modificación de historia clínica queda registrada.",
  },
];

export function LegalTrust() {
  return (
    <section id="legal" className="py-16 sm:py-24 relative">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader
          eyebrow="Privacidad y cumplimiento"
          title="Tu información clínica, protegida en serio"
          subtitle="No usamos 'cumplimos normativa' como una palabra de moda. Esto es lo que significa concretamente en Psicomorfosis."
        />

        <motion.div
          variants={staggerParent}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
          className="mt-12 sm:mt-16 grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8"
        >
          {/* Columna 1: marco legal colombiano */}
          <motion.div
            variants={fadeUp}
            whileHover={{ y: -4 }}
            transition={{ duration: 0.5, ease: easeOutExpo }}
            className="rounded-2xl border border-line-200 bg-surface/80 backdrop-blur-sm p-6 sm:p-8 relative overflow-hidden"
          >
            <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-brand-700 font-semibold">
              <ScrollText className="h-3.5 w-3.5" />
              Marco legal colombiano
            </div>
            <h3 className="mt-3 font-serif text-2xl text-ink-900 leading-tight">
              Cumplimos las 3 leyes que más importan
            </h3>
            <ul className="mt-6 space-y-5">
              {LEYES.map((l) => (
                <li key={l.title} className="flex items-start gap-3">
                  <span className="mt-0.5 h-9 w-9 rounded-lg bg-brand-50 text-brand-700 flex items-center justify-center shrink-0">
                    <l.icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-sm font-medium text-ink-900">{l.title}</span>
                      <span className="text-[11px] tabular-nums text-ink-500 font-mono">{l.code}</span>
                    </div>
                    <p className="mt-1 text-sm text-ink-500 leading-relaxed">
                      {l.description}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </motion.div>

          {/* Columna 2: medidas técnicas */}
          <motion.div
            variants={fadeUp}
            whileHover={{ y: -4 }}
            transition={{ duration: 0.5, ease: easeOutExpo }}
            className="rounded-2xl border-2 border-brand-200 bg-brand-50/40 p-6 sm:p-8 relative overflow-hidden shadow-lg shadow-brand-700/5"
          >
            <motion.div
              className="absolute -top-16 -right-16 h-48 w-48 rounded-full blur-2xl pointer-events-none"
              style={{
                background: "radial-gradient(circle, oklch(0.7 0.12 175 / 0.4), transparent 70%)",
              }}
              animate={{ opacity: [0.4, 0.7, 0.4] }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
              aria-hidden
            />
            <div className="relative">
              <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-brand-700 font-semibold">
                <ShieldCheck className="h-3.5 w-3.5" />
                Cómo lo protegemos técnicamente
              </div>
              <h3 className="mt-3 font-serif text-2xl text-ink-900 leading-tight">
                Tres capas de seguridad reales
              </h3>
              <ul className="mt-6 space-y-5">
                {MEDIDAS.map((m) => (
                  <li key={m.title} className="flex items-start gap-3">
                    <span className="mt-0.5 h-9 w-9 rounded-lg bg-brand-700 text-white flex items-center justify-center shrink-0 shadow-md shadow-brand-700/20">
                      <m.icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <span className="text-sm font-medium text-ink-900">{m.title}</span>
                      <p className="mt-1 text-sm text-ink-700 leading-relaxed">
                        {m.description}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        </motion.div>

        {/* Nota final + link a políticas */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.7, ease: easeOutExpo }}
          className="mt-10 text-center max-w-2xl mx-auto"
        >
          <p className="text-sm text-ink-500 leading-relaxed">
            ¿Necesitas el detalle completo? Revisa nuestra{" "}
            <a href="/privacidad" className="text-brand-700 font-medium hover:underline">
              política de privacidad
            </a>{" "}
            y{" "}
            <a href="/terminos" className="text-brand-700 font-medium hover:underline">
              términos de uso
            </a>{" "}
            — escritos en español claro, sin trampas.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
