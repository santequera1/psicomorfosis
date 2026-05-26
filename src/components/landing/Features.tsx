import {
  CalendarDays, ListTodo, Brain, FileSignature, Users, ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useScrollReveal } from "./useScrollReveal";

interface Feature {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}

const FEATURES: Feature[] = [
  {
    icon: CalendarDays,
    title: "Agenda con portal del paciente",
    description: "Vista día, semana y mes. El paciente ve sus citas en su propio portal y recibe recordatorios automáticos por email.",
  },
  {
    icon: ListTodo,
    title: "Tareas estilo Trello",
    description: "Kanban con drag-and-drop fluido. Asigna tareas terapéuticas con plantillas y archivos. El paciente las entrega desde su portal.",
  },
  {
    icon: Brain,
    title: "Tests psicométricos",
    description: "MCMI-II, PHQ-9, GAD-7, BIS-11, AUDIT y más. Corrección automática, perfil por escala y exportación al Excel oficial de cada test.",
  },
  {
    icon: FileSignature,
    title: "Firma electrónica con audit",
    description: "Consentimientos, certificados y autorizaciones. El paciente firma desde el portal con sello de hora, IP y certificado SHA-256.",
  },
  {
    icon: Users,
    title: "Multi-rol",
    description: "Psicóloga independiente o equipo. El paciente tiene su propio portal. Un admin de plataforma para gestionar cuentas.",
  },
  {
    icon: ShieldCheck,
    title: "Cumplimiento legal",
    description: "Ley 1581/2012 de Habeas Data y Resolución 1995/1999 de historia clínica. Sin checkbox de marketing — esto es base.",
  },
];

export function Features() {
  return (
    <section id="features" className="py-20 sm:py-28 bg-surface">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader
          eyebrow="Funciones"
          title="Todo lo que tu consulta necesita, en un solo lugar"
          subtitle="No es un Calendly con tema verde. Está hecho con psicólogas que ya nos enseñaron qué falta en las demás herramientas."
        />
        <div className="mt-16 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((f, i) => (
            <FeatureCard key={f.title} feature={f} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}

function FeatureCard({ feature, index }: { feature: Feature; index: number }) {
  const { ref, revealed } = useScrollReveal<HTMLDivElement>();
  const Icon = feature.icon;
  return (
    <div
      ref={ref}
      className={cn(
        "rounded-xl border border-line-200 bg-bg-50/40 p-6 transition-all duration-700 ease-out",
        revealed ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8",
      )}
      style={{ transitionDelay: `${(index % 3) * 80}ms` }}
    >
      <div className="h-11 w-11 rounded-lg bg-brand-50 text-brand-700 flex items-center justify-center">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="mt-4 font-serif text-xl text-ink-900 leading-tight">{feature.title}</h3>
      <p className="mt-2 text-sm text-ink-500 leading-relaxed">{feature.description}</p>
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
