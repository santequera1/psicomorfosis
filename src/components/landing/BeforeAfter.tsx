import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useScrollReveal } from "./useScrollReveal";
import { SectionHeader } from "./Features";

/**
 * Sección dolor → solución. Es la pieza que más conecta emocional:
 * el psicólogo se reconoce en la columna izquierda y respira con
 * la derecha. Va antes del showcase de capacidades para crear
 * apetito antes de mostrar pantallas.
 */
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
  const { ref: leftRef, revealed: leftRevealed } = useScrollReveal<HTMLDivElement>();
  const { ref: rightRef, revealed: rightRevealed } = useScrollReveal<HTMLDivElement>();

  return (
    <section id="antes-despues" className="py-20 sm:py-28 bg-bg-50/30">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader
          eyebrow="El cambio"
          title="Antes vs después de Psicomorfosis"
          subtitle="No vendemos software. Vendemos dejar de sufrir la parte administrativa de tu consulta."
        />

        <div className="mt-16 grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
          {/* Antes — apagado, pesado */}
          <div
            ref={leftRef}
            className={cn(
              "rounded-2xl border border-line-200 bg-surface p-6 sm:p-8 transition-all duration-700 ease-out",
              leftRevealed ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-6",
            )}
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-50 border border-rose-100 text-xs text-rose-700 font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
              Antes
            </div>
            <h3 className="mt-4 font-serif text-2xl text-ink-900 leading-tight">
              Atendiendo entre chats, papeles y hojas de cálculo
            </h3>
            <ul className="mt-6 space-y-3">
              {BEFORE.map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm text-ink-700 leading-relaxed">
                  <span className="mt-0.5 h-5 w-5 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center flex-shrink-0">
                    <X className="h-3 w-3" />
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Después — limpio, esperanzador */}
          <div
            ref={rightRef}
            className={cn(
              "rounded-2xl border-2 border-brand-200 bg-brand-50/40 p-6 sm:p-8 transition-all duration-700 ease-out relative overflow-hidden",
              rightRevealed ? "opacity-100 translate-x-0" : "opacity-0 translate-x-6",
            )}
            style={{ transitionDelay: "120ms" }}
          >
            <div
              className="absolute -top-12 -right-12 h-40 w-40 rounded-full opacity-40 blur-2xl"
              style={{ background: "radial-gradient(circle, oklch(0.7 0.12 175 / 0.5), transparent 70%)" }}
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
              <ul className="mt-6 space-y-3">
                {AFTER.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm text-ink-900 leading-relaxed">
                    <span className="mt-0.5 h-5 w-5 rounded-full bg-brand-700 text-white flex items-center justify-center flex-shrink-0">
                      <Check className="h-3 w-3" strokeWidth={3} />
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
