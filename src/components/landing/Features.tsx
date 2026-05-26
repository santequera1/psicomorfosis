import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import {
  Users, Calendar, FileSignature, MonitorSmartphone, ClipboardCheck, BarChart3,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fadeUp, scaleIn, staggerParent, easeOutExpo } from "./motion";
import { FloatingBadge, type FloatingBadgePosition } from "./FloatingBadge";
import {
  GoogleCalendarIcon, ZoomIcon, GoogleMeetIcon, WhatsAppIcon,
  CalendlyIcon, ILovePDFIcon,
} from "./BrandIcons";

/**
 * Showcase de capacidades. Cada bloque es un "momento" editorial:
 *  - Layout asimétrico zig-zag
 *  - Screenshot con parallax sutil al scroll
 *  - Hover lift + glow
 *  - 1-2 floating badges por screenshot sugiriendo actividad real
 *
 * SectionHeader exportado se sigue usando en BeforeAfter, ThemeShowcase,
 * WhyUs y DemoForm.
 */
interface BadgeSpec {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  tone?: "brand" | "success" | "neutral";
  position: FloatingBadgePosition;
}

interface Capability {
  eyebrow: string;
  title: string;
  description: string;
  image: string;
  alt: string;
  align: "left" | "right";
  badges?: BadgeSpec[];
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
    badges: [
      { icon: ClipboardCheck, label: "3 sesiones hoy", tone: "brand", position: { top: "-1rem", right: "1rem" } },
    ],
  },
  {
    eyebrow: "Pacientes",
    title: "Toda la información del paciente, en un solo lugar",
    description:
      "Historia clínica, sesiones, documentos, tareas y tests psicométricos en la misma vista. Dejas de cazar notas en WhatsApp, Drive y libretas.",
    image: "/landing/perfil-paciente.png",
    alt: "Perfil de paciente con datos, motivo de consulta y resumen clínico",
    align: "right",
    badges: [
      { icon: Users, label: "Paciente activo", tone: "success", position: { top: "-1rem", left: "1rem" } },
    ],
  },
  {
    eyebrow: "Agenda",
    title: "Menos mensajes. Menos olvidos.",
    description:
      "Agenda sesiones individuales, de pareja, familia o tele. El paciente confirma desde su portal y recibe recordatorios automáticos por email. Las cancelaciones quedan registradas.",
    image: "/landing/agenda.png",
    alt: "Vista semanal de agenda con citas, próximo paciente y pendientes",
    align: "left",
    badges: [
      { icon: Calendar, label: "Sesión confirmada", tone: "brand", position: { bottom: "-1rem", right: "2rem" } },
    ],
  },
  {
    eyebrow: "Documentos",
    title: "Plantillas, firmas y biblioteca clínica",
    description:
      "Consentimientos, certificados y alta terapéutica con plantillas listas para Colombia. El paciente firma desde el portal con sello de hora, IP y verificación. Sin imprimir.",
    image: "/landing/documentos.png",
    alt: "Editor de concepto psicológico con datos del paciente y motivo de consulta",
    align: "right",
    badges: [
      { icon: FileSignature, label: "Firma realizada", tone: "success", position: { top: "-1rem", right: "1.5rem" } },
    ],
  },
  {
    eyebrow: "Portal del paciente",
    title: "Una experiencia más profesional para tus pacientes",
    description:
      "Tus pacientes entran a su propio espacio: ven su próxima cita, sus tareas, los documentos compartidos y los tests pendientes. No necesitas escribirles por WhatsApp para nada de eso.",
    image: "/landing/portal-paciente.png",
    alt: "Portal del paciente mostrando próxima cita, tareas y documentos",
    align: "left",
    badges: [
      { icon: MonitorSmartphone, label: "Paciente conectado", tone: "neutral", position: { top: "-1rem", left: "1.5rem" } },
    ],
  },
  {
    eyebrow: "Reportes",
    title: "Saber cómo va tu consulta sin abrir Excel",
    description:
      "Asistencia, adherencia a tareas, recaudo, no-show, duración promedio y modalidad de atención — calculado automático. Vista mensual o de 90 días para decidir con datos.",
    image: "/landing/reportes.png",
    alt: "Reportes con KPIs clínicos, ingresos semanales y modalidad de atención",
    align: "right",
    badges: [
      { icon: BarChart3, label: "67% asistencia 90d", tone: "brand", position: { bottom: "-1rem", left: "2rem" } },
    ],
  },
];

export function Features() {
  return (
    <section id="capabilities" className="py-14 sm:py-24 relative">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader
          eyebrow="La plataforma"
          title="Pensada como trabajas, no como vende un software"
          subtitle="Cada sección nació de una conversación con psicólogas reales en Colombia. Esto es lo que ves desde el primer día."
        />

        {/* Mobile: carousel horizontal scroll-snap. Evita que la
            página se vuelva interminable cuando 6 zig-zags se apilan
            verticalmente en pantallas pequeñas. */}
        <MobileCarousel />

        {/* Desktop: zig-zag editorial con parallax */}
        <div className="hidden lg:block mt-20 space-y-36">
          {CAPABILITIES.map((c, i) => (
            <CapabilityRow key={c.title} capability={c} index={i} />
          ))}
        </div>

        <ExtraGrid />
      </div>
    </section>
  );
}

function MobileCarousel() {
  return (
    <div className="lg:hidden mt-10">
      {/* Indicador de scroll horizontal — chevron animado */}
      <div className="flex items-center justify-center gap-2 text-xs text-brand-700 font-medium mb-4">
        <span>Desliza para ver las 6 capacidades</span>
        <motion.span
          animate={{ x: [0, 6, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          className="inline-flex"
        >
          <ChevronRight className="h-4 w-4" />
        </motion.span>
      </div>

      <div
        className="flex overflow-x-auto snap-x snap-mandatory gap-4 -mx-4 px-4 pb-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {CAPABILITIES.map((c, i) => (
          <MobileCard key={c.title} capability={c} index={i} />
        ))}
      </div>
    </div>
  );
}

const BADGE_TONE: Record<"brand" | "success" | "neutral", string> = {
  brand: "bg-brand-50 text-brand-800 border-brand-200/70",
  success: "bg-emerald-50 text-emerald-800 border-emerald-200/70",
  neutral: "bg-bg-50 text-ink-700 border-line-200",
};

function MobileCard({ capability, index }: { capability: Capability; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.6, ease: easeOutExpo }}
      className="snap-start shrink-0 w-[86%] sm:w-[60%] rounded-xl border border-line-200 bg-surface/70 backdrop-blur-sm overflow-hidden shadow-lg shadow-brand-700/5"
    >
      <img
        src={capability.image}
        alt={capability.alt}
        loading="lazy"
        className="w-full h-auto block"
      />

      {/* Badges estáticos entre imagen y texto. En mobile carousel los
          floating absolute se salían de la tarjeta — aquí van como pills
          horizontales dentro del flow, siempre visibles. */}
      {capability.badges && capability.badges.length > 0 && (
        <div className="px-5 pt-4 flex flex-wrap gap-1.5">
          {capability.badges.map((b) => {
            const Icon = b.icon;
            return (
              <span
                key={b.label}
                className={cn(
                  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-medium",
                  BADGE_TONE[b.tone ?? "brand"],
                )}
              >
                <Icon className="h-3 w-3" />
                {b.label}
              </span>
            );
          })}
        </div>
      )}

      <div className="p-5">
        <p className="text-[11px] uppercase tracking-widest text-brand-700 font-semibold">
          {capability.eyebrow} · #{String(index + 1).padStart(2, "0")}
        </p>
        <h3 className="mt-2 font-serif text-xl text-ink-900 leading-tight">
          {capability.title}
        </h3>
        <p className="mt-2 text-sm text-ink-500 leading-relaxed">
          {capability.description}
        </p>
      </div>
    </motion.div>
  );
}

function CapabilityRow({ capability, index }: { capability: Capability; index: number }) {
  const isRight = capability.align === "right";

  // Parallax sutil del screenshot — se traduce vertical al hacer scroll.
  // Range pequeño (±40px) para que se sienta como respiración, no como
  // un scroll-parallax marketinero.
  const rowRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: rowRef,
    offset: ["start end", "end start"],
  });
  const imageY = useTransform(scrollYProgress, [0, 1], [40, -40]);

  return (
    <motion.div
      ref={rowRef}
      variants={staggerParent}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-100px" }}
      className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-14 items-center"
    >
      {/* Texto */}
      <motion.div
        variants={fadeUp}
        className={cn("lg:col-span-5", isRight ? "lg:order-2" : "lg:order-1")}
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
      </motion.div>

      {/* Screenshot con parallax + hover */}
      <motion.div
        variants={scaleIn}
        className={cn("lg:col-span-7", isRight ? "lg:order-1" : "lg:order-2")}
      >
        <motion.div style={{ y: imageY }} className="relative group">
          {/* Glow hover */}
          <motion.div
            className="absolute -inset-6 -z-10 rounded-3xl blur-2xl pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse at center, oklch(0.7 0.12 175 / 0.3), transparent 70%)",
            }}
            initial={{ opacity: 0 }}
            whileHover={{ opacity: 1 }}
            transition={{ duration: 0.6 }}
            aria-hidden
          />
          <motion.div
            whileHover={{ y: -6 }}
            transition={{ duration: 0.5, ease: easeOutExpo }}
            className="relative rounded-xl overflow-hidden border border-line-200 shadow-2xl shadow-brand-700/10 bg-surface"
          >
            <img
              src={capability.image}
              alt={capability.alt}
              loading="lazy"
              className="w-full h-auto block"
            />
          </motion.div>

          {/* Badges flotantes específicos del bloque */}
          {capability.badges?.map((b, i) => (
            <FloatingBadge
              key={b.label}
              icon={b.icon}
              label={b.label}
              tone={b.tone}
              position={b.position}
              delay={0.3 + i * 0.15}
              floatPhase={i * 0.7}
            />
          ))}
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

function ExtraGrid() {
  return (
    <motion.div
      variants={staggerParent}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-80px" }}
      className="mt-28 sm:mt-36 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
    >
      <ExtraCard
        eyebrow="Diagnóstico"
        title="DSM-5 y CIE-11 sin googlear códigos"
        description="Buscador de códigos integrado a la historia clínica. Agrega el diagnóstico principal y comórbidos en segundos."
        image="/landing/diagnostico-dsm5.png"
        alt="Modal para agregar diagnóstico DSM-5"
      />
      <ExtraCard
        eyebrow="Biblioteca clínica"
        title="Documentos organizados por paciente"
        description="Vista por paciente con total, pendientes de firma, firmados y borradores. Plantillas listas a la derecha para reutilizar."
        image="/landing/carpeta-documentos.png"
        alt="Biblioteca documental por paciente y plantillas clínicas"
      />
      <IntegrationsCard />
    </motion.div>
  );
}

/**
 * Card especial: integraciones planeadas (próximamente) que viven en
 * Configuración → Integraciones dentro de la app. Cada una con su
 * logo de marca real (SVG inline en BrandIcons) y color oficial.
 */
const INTEGRATIONS: {
  Icon: React.ComponentType<{ className?: string }>;
  label: string;
  color: string;
}[] = [
  { Icon: GoogleCalendarIcon, label: "Google Calendar", color: "#4285F4" },
  { Icon: ZoomIcon, label: "Zoom", color: "#2D8CFF" },
  { Icon: GoogleMeetIcon, label: "Google Meet", color: "#00897B" },
  { Icon: WhatsAppIcon, label: "Recordatorios WhatsApp", color: "#25D366" },
  { Icon: CalendlyIcon, label: "Calendly", color: "#006BFF" },
  { Icon: ILovePDFIcon, label: "iLovePDF", color: "#E5322D" },
];

function IntegrationsCard() {
  return (
    <motion.div
      variants={fadeUp}
      whileHover={{ y: -4 }}
      transition={{ duration: 0.5, ease: easeOutExpo }}
      className="rounded-xl border border-line-200 bg-surface/60 backdrop-blur-sm overflow-hidden group relative"
    >
      <motion.div
        className="absolute -top-16 -right-16 h-40 w-40 rounded-full blur-2xl pointer-events-none"
        style={{
          background: "radial-gradient(circle, oklch(0.7 0.12 175 / 0.25), transparent 70%)",
        }}
        animate={{ opacity: [0.4, 0.7, 0.4] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        aria-hidden
      />

      <div className="aspect-16/10 bg-bg/40 flex items-center justify-center p-4 relative">
        <div className="grid grid-cols-3 gap-2.5 w-full max-w-xs">
          {INTEGRATIONS.map((it, i) => (
            <motion.div
              key={it.label}
              initial={{ opacity: 0, y: 12, scale: 0.9 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.5, ease: easeOutExpo, delay: i * 0.08 }}
              className="aspect-square rounded-xl border border-line-200 bg-surface shadow-sm flex flex-col items-center justify-center gap-1 hover:border-brand-400 hover:shadow-md transition-all"
              title={it.label}
            >
              <it.Icon className="h-5 w-5" style={{ color: it.color } as React.CSSProperties} />
              <span className="text-[9px] text-ink-700 font-medium leading-tight text-center px-1 truncate w-full">
                {it.label}
              </span>
            </motion.div>
          ))}
        </div>
      </div>
      <div className="p-6 relative">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-xs uppercase tracking-widest text-brand-700 font-semibold">
            Integraciones
          </p>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-[10px] text-amber-800 font-medium">
            <span className="h-1 w-1 rounded-full bg-amber-500 animate-pulse" />
            Próximamente
          </span>
        </div>
        <h4 className="mt-2 font-serif text-xl text-ink-900 leading-tight">
          Conecta tus herramientas favoritas
        </h4>
        <p className="mt-2 text-sm text-ink-500 leading-relaxed">
          Google Calendar, Zoom, Google Meet, Calendly e iLovePDF, más recordatorios y confirmaciones automáticas por WhatsApp Business. Exportar a PDF y Excel ya están disponibles.
        </p>
        <p className="mt-3 text-[11px] text-ink-400 italic leading-relaxed">
          *No somos enemigos de WhatsApp. La plataforma lo usa por ti para recordar citas, no para que respondas pacientes a las 11pm.
        </p>
      </div>
    </motion.div>
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
    <motion.div
      variants={fadeUp}
      whileHover={{ y: -4 }}
      transition={{ duration: 0.5, ease: easeOutExpo }}
      className="rounded-xl border border-line-200 bg-surface/60 backdrop-blur-sm overflow-hidden group"
    >
      <div className="aspect-16/10 overflow-hidden bg-bg">
        <motion.img
          src={image}
          alt={alt}
          loading="lazy"
          className="w-full h-full object-cover object-top"
          whileHover={{ scale: 1.03 }}
          transition={{ duration: 0.7, ease: easeOutExpo }}
        />
      </div>
      <div className="p-6">
        <p className="text-xs uppercase tracking-widest text-brand-700 font-semibold">
          {eyebrow}
        </p>
        <h4 className="mt-2 font-serif text-xl text-ink-900 leading-tight">{title}</h4>
        <p className="mt-2 text-sm text-ink-500 leading-relaxed">{description}</p>
      </div>
    </motion.div>
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
  return (
    <motion.div
      variants={staggerParent}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-80px" }}
      className="text-center max-w-4xl mx-auto"
    >
      <motion.p
        variants={fadeUp}
        className="text-xs uppercase tracking-widest text-brand-700 font-semibold"
      >
        {eyebrow}
      </motion.p>
      <motion.h2
        variants={fadeUp}
        className="mt-3 font-serif text-3xl sm:text-4xl text-ink-900 leading-tight tracking-tight text-balance"
      >
        {title}
      </motion.h2>
      {subtitle && (
        <motion.p variants={fadeUp} className="mt-4 text-base text-ink-500 leading-relaxed">
          {subtitle}
        </motion.p>
      )}
    </motion.div>
  );
}
