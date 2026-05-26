import { cn } from "@/lib/utils";
import { useScrollReveal } from "./useScrollReveal";

/**
 * Sección de capacidades con screenshots alternados (zig-zag).
 * Es la pieza más larga de la landing — cada bloque tiene una imagen
 * real de la app + copy enfocado en sensación, no en feature list.
 *
 * El componente Features y SectionHeader siguen exportándose con esos
 * nombres porque otros archivos (DemoForm, BeforeAfter) los importan.
 */
interface Capability {
  eyebrow: string;
  title: string;
  description: string;
  image: string;
  alt: string;
  align: "left" | "right";
}

const CAPABILITIES: Capability[] = [
  {
    eyebrow: "Inicio",
    title: "Tu día clínico, listo cuando abres",
    description:
      "Sesiones, pacientes activos, recaudo y riesgo activo a primera vista. Sin armar dashboards en Excel ni revisar 4 herramientas distintas para saber cómo va tu consulta hoy.",
    image: "/landing/dashboard.png",
    alt: "Dashboard de Psicomorfosis con sesiones del día, KPIs y próximas citas",
    align: "left",
  },
  {
    eyebrow: "Pacientes",
    title: "Toda la información del paciente, en un solo lugar",
    description:
      "Historia clínica, sesiones, documentos, tareas y tests psicométricos en la misma vista. Dejas de cazar notas en WhatsApp, Drive y libretas.",
    image: "/landing/perfil-paciente.png",
    alt: "Perfil de paciente con datos, motivo de consulta y resumen clínico",
    align: "right",
  },
  {
    eyebrow: "Agenda",
    title: "Menos mensajes. Menos olvidos.",
    description:
      "Agenda sesiones individuales, de pareja, familia o tele. El paciente confirma desde su portal y recibe recordatorios automáticos por email. Las cancelaciones quedan registradas.",
    image: "/landing/agenda.png",
    alt: "Vista semanal de agenda con citas, próximo paciente y pendientes",
    align: "left",
  },
  {
    eyebrow: "Documentos",
    title: "Plantillas, firmas y biblioteca clínica",
    description:
      "Consentimientos, certificados y alta terapéutica con plantillas listas para Colombia. El paciente firma desde el portal con sello de hora, IP y verificación. Sin imprimir.",
    image: "/landing/carpeta-documentos.png",
    alt: "Biblioteca documental por paciente y plantillas clínicas",
    align: "right",
  },
  {
    eyebrow: "Portal del paciente",
    title: "Una experiencia más profesional para tus pacientes",
    description:
      "Tus pacientes entran a su propio espacio: ven su próxima cita, sus tareas, los documentos compartidos y los tests pendientes. No necesitas escribirles por WhatsApp para nada de eso.",
    image: "/landing/portal-paciente.png",
    alt: "Portal del paciente mostrando próxima cita, tareas y documentos",
    align: "left",
  },
  {
    eyebrow: "Reportes",
    title: "Saber cómo va tu consulta sin abrir Excel",
    description:
      "Asistencia, adherencia a tareas, recaudo, no-show, duración promedio y modalidad de atención — calculado automático. Vista mensual o de 90 días para decidir con datos.",
    image: "/landing/reportes.png",
    alt: "Reportes con KPIs clínicos, ingresos semanales y modalidad de atención",
    align: "right",
  },
];

export function Features() {
  return (
    <section id="capabilities" className="py-20 sm:py-28 bg-surface">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader
          eyebrow="La plataforma"
          title="Pensada como trabajas, no como vende un software"
          subtitle="Cada sección nació de una conversación con psicólogas reales en Colombia. Esto es lo que ves desde el primer día."
        />

        <div className="mt-20 space-y-24 sm:space-y-32">
          {CAPABILITIES.map((c, i) => (
            <CapabilityRow key={c.title} capability={c} index={i} />
          ))}
        </div>

        <ExtraGrid />
      </div>
    </section>
  );
}

function CapabilityRow({ capability, index }: { capability: Capability; index: number }) {
  const { ref, revealed } = useScrollReveal<HTMLDivElement>();
  const isRight = capability.align === "right";

  return (
    <div
      ref={ref}
      className={cn(
        "grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-14 items-center transition-all duration-700 ease-out",
        revealed ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10",
      )}
    >
      {/* Texto — orden inverso cuando align=right en desktop */}
      <div
        className={cn(
          "lg:col-span-5",
          isRight ? "lg:order-2" : "lg:order-1",
        )}
      >
        <p className="text-xs uppercase tracking-widest text-brand-700 font-semibold">
          {capability.eyebrow}
        </p>
        <h3 className="mt-3 font-serif text-2xl sm:text-3xl lg:text-4xl text-ink-900 leading-[1.15] tracking-tight">
          {capability.title}
        </h3>
        <p className="mt-4 text-base text-ink-500 leading-relaxed">
          {capability.description}
        </p>
        <div className="mt-5 inline-flex items-center gap-1 text-xs text-brand-700 font-medium">
          <span className="h-1 w-1 rounded-full bg-brand-700" />
          Capacidad #{String(index + 1).padStart(2, "0")}
        </div>
      </div>

      {/* Screenshot frame con glow sutil */}
      <div className={cn("lg:col-span-7", isRight ? "lg:order-1" : "lg:order-2")}>
        <div className="relative group">
          <div
            className="absolute -inset-4 -z-10 rounded-3xl opacity-0 group-hover:opacity-100 blur-2xl transition-opacity duration-700"
            style={{
              background:
                "radial-gradient(ellipse at center, oklch(0.7 0.12 175 / 0.35), transparent 70%)",
            }}
            aria-hidden
          />
          <div className="rounded-xl overflow-hidden border border-line-200 shadow-2xl shadow-brand-700/10 bg-surface transition-transform duration-500 group-hover:-translate-y-1">
            <img
              src={capability.image}
              alt={capability.alt}
              loading="lazy"
              className="w-full h-auto block"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Grid de 2 imágenes extras (DSM-5 + Documentos editor) abajo de las
 * capacidades grandes, para mostrar profundidad sin alargar más zig-zag.
 */
function ExtraGrid() {
  const { ref, revealed } = useScrollReveal<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={cn(
        "mt-24 sm:mt-32 grid grid-cols-1 md:grid-cols-2 gap-6 transition-all duration-700 ease-out",
        revealed ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10",
      )}
    >
      <ExtraCard
        eyebrow="Diagnóstico"
        title="DSM-5 y CIE-11 sin googlear códigos"
        description="Buscador de códigos integrado a la historia clínica. Agrega el diagnóstico principal y comórbidos en segundos."
        image="/landing/diagnostico-dsm5.png"
        alt="Modal para agregar diagnóstico DSM-5"
      />
      <ExtraCard
        eyebrow="Editor clínico"
        title="Notas y conceptos con formato real"
        description="Editor rico para conceptos psicológicos, redacción guiada y compartir con el paciente o pedir firma electrónica."
        image="/landing/documentos.png"
        alt="Editor de concepto psicológico clínico"
      />
    </div>
  );
}

function ExtraCard({
  eyebrow,
  title,
  description,
  image,
  alt,
}: {
  eyebrow: string;
  title: string;
  description: string;
  image: string;
  alt: string;
}) {
  return (
    <div className="rounded-xl border border-line-200 bg-bg-50/40 overflow-hidden group">
      <div className="aspect-16/10 overflow-hidden bg-bg">
        <img
          src={image}
          alt={alt}
          loading="lazy"
          className="w-full h-full object-cover object-top transition-transform duration-700 group-hover:scale-[1.02]"
        />
      </div>
      <div className="p-6">
        <p className="text-xs uppercase tracking-widest text-brand-700 font-semibold">
          {eyebrow}
        </p>
        <h4 className="mt-2 font-serif text-xl text-ink-900 leading-tight">{title}</h4>
        <p className="mt-2 text-sm text-ink-500 leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
}) {
  const { ref, revealed } = useScrollReveal<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={cn(
        "text-center max-w-2xl mx-auto transition-all duration-700 ease-out",
        revealed ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4",
      )}
    >
      <p className="text-xs uppercase tracking-widest text-brand-700 font-semibold">{eyebrow}</p>
      <h2 className="mt-3 font-serif text-3xl sm:text-4xl text-ink-900 leading-tight tracking-tight">{title}</h2>
      {subtitle && (
        <p className="mt-4 text-base text-ink-500 leading-relaxed">{subtitle}</p>
      )}
    </div>
  );
}
