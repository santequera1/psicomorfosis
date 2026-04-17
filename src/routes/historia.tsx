import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { RiskBadge } from "@/components/app/RiskBadge";
import { useEffect, useRef, useState } from "react";
import {
  User, Phone, Mail, IdCard, MapPin, Stethoscope, Brain, Pill, FileText,
  AlertTriangle, ClipboardList, Activity, Sparkles, MessageSquareText, CalendarCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/historia")({
  head: () => ({
    meta: [
      { title: "Historia clínica — Psicomorfosis" },
      { name: "description", content: "Historia clínica integral del paciente con seguimiento longitudinal." },
    ],
  }),
  component: HistoriaPage,
});

const PATIENT = {
  name: "María Camila Rondón",
  preferredName: "Cami",
  pronouns: "ella",
  doc: "CC 1.024.587.331",
  age: 28,
  phone: "+57 310 482 1290",
  email: "cami.rondon@correo.co",
  city: "Bogotá · Chapinero",
  professional: "Psic. Nathaly Ferrer Pacheco",
  enfoque: "Terapia cognitivo-conductual",
  inicio: "Marzo 2024",
  sesiones: 18,
  risk: "low" as const,
};

const SECTIONS = [
  {
    icon: ClipboardList,
    title: "Motivo de consulta",
    body: "Consulta por episodios recurrentes de ansiedad anticipatoria asociados al ámbito laboral, con dificultades para conciliar el sueño y rumiación nocturna persistente desde hace ~6 meses.",
  },
  {
    icon: User,
    title: "Antecedentes personales",
    body: "Sin antecedentes psiquiátricos previos. Refiere período de tristeza prolongada en 2019 sin atención profesional. Niega consumo de sustancias. Familia nuclear funcional, hermana menor con diagnóstico de TAG en tratamiento.",
  },
  {
    icon: Brain,
    title: "Examen mental",
    body: "Paciente alerta, orientada en las tres esferas. Lenguaje fluido y coherente. Afecto modulado, ligeramente ansioso. Pensamiento lógico, con contenido focalizado en preocupaciones laborales. Sin ideación suicida ni síntomas psicóticos. Insight conservado.",
  },
  {
    icon: Stethoscope,
    title: "Diagnóstico CIE-11",
    body: "6B00 · Trastorno de ansiedad generalizada (leve-moderado). Diagnóstico diferencial descartado: episodio depresivo, trastorno de adaptación.",
  },
  {
    icon: Pill,
    title: "Plan de tratamiento",
    body: "Psicoterapia individual TCC, frecuencia semanal por 12 sesiones. Reestructuración cognitiva, técnicas de exposición gradual, higiene del sueño, mindfulness. Reevaluación al cierre del bloque.",
  },
];

const TIMELINE = [
  {
    date: "08 abr 2025",
    title: "Sesión 18 · Cierre de bloque TCC",
    type: "Sesión",
    icon: CalendarCheck,
    body: "Paciente reporta reducción significativa de síntomas (GAD-7: 6, baseline 16). Consolidación de habilidades de afrontamiento. Acuerdo: paso a frecuencia quincenal con plan de mantenimiento.",
    tag: "logro",
  },
  {
    date: "01 abr 2025",
    title: "Sesión 17 · Exposición in-vivo",
    type: "Sesión",
    icon: Activity,
    body: "Ejercicio de exposición programado a presentación frente a directivos. Ansiedad reportada SUDS 70 → 35 al finalizar. Refuerzo positivo y registro de evidencia adaptativa.",
  },
  {
    date: "25 mar 2025",
    title: "Aplicación PHQ-9 + GAD-7",
    type: "Test",
    icon: ClipboardList,
    body: "PHQ-9: 4 (mínimo). GAD-7: 8 (leve). Tendencia descendente sostenida vs. línea base. Se documenta en módulo de psicometría.",
    tag: "test",
  },
  {
    date: "11 mar 2025",
    title: "Sesión 14 · Reestructuración cognitiva",
    type: "Sesión",
    icon: MessageSquareText,
    body: "Identificación de distorsiones tipo catastrofización y lectura de mente. Trabajo con registro de pensamientos disfuncionales. Tarea inter-sesión asignada.",
  },
  {
    date: "18 feb 2025",
    title: "Evento crítico · Crisis de pánico nocturna",
    type: "Evento",
    icon: AlertTriangle,
    body: "Episodio de ansiedad aguda con palpitaciones y disnea ~3 a.m. Llamada al canal de soporte. Se aplicó protocolo de respiración diafragmática y grounding. Sin requerimiento de servicios de urgencias.",
    tag: "alerta",
  },
  {
    date: "12 ene 2025",
    title: "Inicio de bloque · Plan TCC 12 sesiones",
    type: "Plan",
    icon: Sparkles,
    body: "Encuadre, psicoeducación sobre TAG, formulación de caso conjunta. Establecimiento de objetivos terapéuticos medibles. Firma de consentimiento informado actualizado.",
  },
  {
    date: "15 mar 2024",
    title: "Primera consulta",
    type: "Apertura",
    icon: FileText,
    body: "Apertura de historia clínica. Anamnesis completa. Aplicación inicial de GAD-7 (16) y PHQ-9 (11). Definición de motivo principal y expectativas.",
  },
];

function HistoriaPage() {
  return (
    <AppShell>
      <div className="px-8 py-8 max-w-[1280px] mx-auto">
        <PatientHeader />
        <ClinicalSections />
        <SeguimientoTimeline />
      </div>
    </AppShell>
  );
}

function PatientHeader() {
  return (
    <section className="rounded-2xl bg-surface border border-line-200 shadow-soft overflow-hidden mb-8">
      <div className="bg-gradient-to-r from-brand-700 to-brand-600 h-20" />
      <div className="px-8 pb-7 -mt-10">
        <div className="flex items-end gap-5">
          <div className="h-20 w-20 rounded-2xl bg-brand-100 border-4 border-surface flex items-center justify-center text-2xl font-serif text-brand-800 shadow-card">
            MC
          </div>
          <div className="flex-1 pb-2">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-serif text-ink-900">{PATIENT.name}</h1>
              <span className="text-sm text-ink-500">"{PATIENT.preferredName}" · {PATIENT.pronouns}</span>
              <RiskBadge risk={PATIENT.risk} />
            </div>
            <div className="text-sm text-ink-500 mt-1">{PATIENT.age} años · {PATIENT.doc}</div>
          </div>
          <div className="pb-2 flex gap-2">
            <button className="h-9 px-4 rounded-lg border border-line-200 bg-surface text-sm text-ink-700 hover:border-brand-400">Nueva nota</button>
            <button className="h-9 px-4 rounded-lg bg-brand-700 text-primary-foreground text-sm hover:bg-brand-800">Agendar sesión</button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-line-100">
          <InfoItem icon={Phone} label="Teléfono" value={PATIENT.phone} />
          <InfoItem icon={Mail} label="Correo" value={PATIENT.email} />
          <InfoItem icon={MapPin} label="Ciudad" value={PATIENT.city} />
          <InfoItem icon={IdCard} label="Identificación" value={PATIENT.doc} />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
          <Stat label="Profesional" value={PATIENT.professional} />
          <Stat label="Enfoque" value={PATIENT.enfoque} />
          <Stat label="Inicio" value={PATIENT.inicio} />
          <Stat label="Sesiones" value={`${PATIENT.sesiones} realizadas`} />
        </div>
      </div>
    </section>
  );
}

function InfoItem({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="h-4 w-4 text-brand-700 mt-0.5 shrink-0" />
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wide text-ink-400">{label}</div>
        <div className="text-sm text-ink-900 truncate">{value}</div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-bg-100 border border-line-100 px-3 py-2.5">
      <div className="text-[11px] uppercase tracking-wide text-ink-400">{label}</div>
      <div className="text-sm font-medium text-ink-900 mt-0.5">{value}</div>
    </div>
  );
}

function ClinicalSections() {
  return (
    <section className="mb-12">
      <h2 className="text-xs uppercase tracking-[0.14em] text-brand-700 font-semibold mb-4">Historia clínica</h2>
      <div className="grid md:grid-cols-2 gap-4">
        {SECTIONS.map((s) => {
          const Icon = s.icon;
          return (
            <article key={s.title} className="rounded-xl bg-surface border border-line-200 p-5 shadow-xs hover:shadow-soft transition-shadow">
              <div className="flex items-center gap-2.5 mb-2">
                <div className="h-8 w-8 rounded-lg bg-brand-100 text-brand-700 flex items-center justify-center">
                  <Icon className="h-4 w-4" />
                </div>
                <h3 className="font-serif text-[17px] text-ink-900">{s.title}</h3>
              </div>
              <p className="text-sm text-ink-500 leading-relaxed">{s.body}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function SeguimientoTimeline() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState<Set<number>>(new Set());

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const items = el.querySelectorAll<HTMLElement>("[data-timeline-item]");
    const obs = new IntersectionObserver(
      (entries) => {
        setVisible((prev) => {
          const next = new Set(prev);
          entries.forEach((e) => {
            const idx = Number(e.target.getAttribute("data-idx"));
            if (e.isIntersecting) next.add(idx);
          });
          return next;
        });
      },
      { threshold: 0.25, rootMargin: "0px 0px -10% 0px" }
    );
    items.forEach((it) => obs.observe(it));
    return () => obs.disconnect();
  }, []);

  return (
    <section>
      <div className="flex items-end justify-between mb-6">
        <div>
          <div className="text-xs uppercase tracking-[0.14em] text-brand-700 font-semibold">Trayectoria terapéutica</div>
          <h2 className="font-serif text-2xl text-ink-900 mt-1">Seguimiento longitudinal</h2>
          <p className="text-sm text-ink-500 mt-1.5 max-w-xl">
            Recorrido cronológico de sesiones, evaluaciones y eventos clínicos significativos. Desplázate para revisar la evolución.
          </p>
        </div>
        <div className="text-xs text-ink-400 hidden md:block">{TIMELINE.length} eventos · 13 meses</div>
      </div>

      <div ref={containerRef} className="relative">
        {/* Línea vertical */}
        <div className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-brand-400/0 via-brand-400/60 to-lavender-400/30" aria-hidden />

        <div className="space-y-10 py-4">
          {TIMELINE.map((ev, idx) => {
            const Icon = ev.icon;
            const isLeft = idx % 2 === 0;
            const isVisible = visible.has(idx);
            return (
              <div
                key={idx}
                data-timeline-item
                data-idx={idx}
                className={cn(
                  "relative grid grid-cols-[1fr_auto_1fr] gap-6 items-center transition-all duration-700 ease-out",
                  isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
                )}
              >
                {/* Card lado izquierdo */}
                <div className={cn("col-start-1", !isLeft && "invisible")}>
                  {isLeft && <TimelineCard ev={ev} align="right" />}
                </div>

                {/* Nodo central */}
                <div className="col-start-2 relative z-10">
                  <div className={cn(
                    "h-11 w-11 rounded-full flex items-center justify-center border-2 transition-all duration-500",
                    isVisible
                      ? ev.tag === "alerta"
                        ? "bg-error-soft border-risk-high text-risk-high"
                        : ev.tag === "logro"
                        ? "bg-success-soft border-success text-success"
                        : ev.tag === "test"
                        ? "bg-lavender-100 border-lavender-500 text-lavender-500"
                        : "bg-brand-100 border-brand-700 text-brand-700"
                      : "bg-bg-100 border-line-200 text-ink-400"
                  )}>
                    <Icon className="h-4 w-4" />
                  </div>
                </div>

                {/* Card lado derecho */}
                <div className={cn("col-start-3", isLeft && "invisible")}>
                  {!isLeft && <TimelineCard ev={ev} align="left" />}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function TimelineCard({ ev, align }: { ev: typeof TIMELINE[number]; align: "left" | "right" }) {
  const Icon = ev.icon;
  return (
    <article className={cn(
      "rounded-xl bg-surface border border-line-200 shadow-soft hover:shadow-card transition-all p-5 relative",
      align === "right" ? "text-right" : "text-left"
    )}>
      <div className={cn("flex items-center gap-2 mb-2", align === "right" ? "justify-end" : "justify-start")}>
        <span className="text-[11px] uppercase tracking-wide text-brand-700 font-semibold">{ev.date}</span>
        <span className="text-[11px] px-2 py-0.5 rounded-full bg-bg-100 text-ink-500 border border-line-100">{ev.type}</span>
      </div>
      <h3 className="font-serif text-[18px] text-ink-900 leading-snug mb-2 flex items-center gap-2" style={align === "right" ? { justifyContent: "flex-end" } : undefined}>
        {align === "left" && <Icon className="h-4 w-4 text-brand-700 shrink-0" />}
        {ev.title}
        {align === "right" && <Icon className="h-4 w-4 text-brand-700 shrink-0" />}
      </h3>
      <p className="text-sm text-ink-500 leading-relaxed">{ev.body}</p>
    </article>
  );
}
