import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { useState } from "react";
import { User, Bell, Shield, Palette, CreditCard, Users2, Globe, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/configuracion")({
  head: () => ({ meta: [{ title: "Configuración — Psicomorfosis" }] }),
  component: ConfiguracionPage,
});

const SECCIONES = [
  { id: "perfil",       label: "Perfil profesional", icon: User,        desc: "Datos personales y credenciales" },
  { id: "notificaciones", label: "Notificaciones",   icon: Bell,        desc: "Canales y preferencias de aviso" },
  { id: "seguridad",    label: "Seguridad",          icon: Shield,      desc: "Contraseña, 2FA, sesiones activas" },
  { id: "apariencia",   label: "Apariencia",         icon: Palette,     desc: "Tema, densidad y tipografía" },
  { id: "facturacion",  label: "Plan y facturación", icon: CreditCard,  desc: "Suscripción y métodos de pago" },
  { id: "equipo",       label: "Equipo",             icon: Users2,      desc: "Profesionales y permisos" },
  { id: "integraciones",label: "Integraciones",      icon: Globe,       desc: "Calendario, video y mensajería" },
];

function ConfiguracionPage() {
  const [active, setActive] = useState("perfil");

  return (
    <AppShell>
      <div className="px-8 py-8 max-w-[1180px] mx-auto">
        <header className="mb-7">
          <div className="text-xs uppercase tracking-[0.14em] text-brand-700 font-semibold">Ajustes</div>
          <h1 className="font-serif text-3xl text-ink-900 mt-1">Configuración</h1>
          <p className="text-sm text-ink-500 mt-1">Personaliza la cuenta y la operación de Psicomorfosis.</p>
        </header>

        <div className="grid grid-cols-[260px_1fr] gap-6">
          <aside className="rounded-xl bg-surface border border-line-200 shadow-soft p-2 h-fit sticky top-20">
            {SECCIONES.map((s) => {
              const Icon = s.icon;
              const isActive = active === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => setActive(s.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors text-left",
                    isActive ? "bg-brand-100 text-brand-800" : "text-ink-700 hover:bg-bg-100"
                  )}
                >
                  <Icon className={cn("h-4 w-4", isActive ? "text-brand-700" : "text-ink-400")} />
                  <span className="flex-1">{s.label}</span>
                  {isActive && <ChevronRight className="h-4 w-4 text-brand-700" />}
                </button>
              );
            })}
          </aside>

          <main className="rounded-xl bg-surface border border-line-200 shadow-soft p-7">
            {active === "perfil" && <PerfilPanel />}
            {active === "notificaciones" && <NotifPanel />}
            {active === "seguridad" && <SeguridadPanel />}
            {active === "apariencia" && <AparienciaPanel />}
            {active === "facturacion" && <PlaceholderPanel title="Plan y facturación" desc="Estás en el plan Clínica Pro. Próximo cobro: 01 may 2025 · $389.000 COP." />}
            {active === "equipo" && <PlaceholderPanel title="Equipo" desc="Gestiona profesionales, recepción y roles administrativos." />}
            {active === "integraciones" && <PlaceholderPanel title="Integraciones" desc="Conecta Google Calendar, Zoom y WhatsApp Business." />}
          </main>
        </div>
      </div>
    </AppShell>
  );
}

function Field({ label, value, type = "text" }: { label: string; value: string; type?: string }) {
  return (
    <label className="block">
      <div className="text-xs font-medium text-ink-700 mb-1.5">{label}</div>
      <input
        type={type}
        defaultValue={value}
        className="w-full h-10 px-3.5 rounded-lg border border-line-200 bg-bg-50 text-sm text-ink-900 focus:outline-none focus:border-brand-400 focus:bg-surface"
      />
    </label>
  );
}

function PerfilPanel() {
  return (
    <>
      <SectionHeader title="Perfil profesional" desc="Información visible para pacientes y colegas." />
      <div className="flex items-center gap-5 mb-7 pb-7 border-b border-line-100">
        <div className="h-20 w-20 rounded-2xl bg-brand-100 text-brand-800 flex items-center justify-center text-2xl font-serif">NF</div>
        <div>
          <button className="h-9 px-4 rounded-lg bg-brand-700 text-primary-foreground text-sm hover:bg-brand-800">Cambiar foto</button>
          <p className="text-xs text-ink-500 mt-2">JPG o PNG · máx. 2MB</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-5">
        <Field label="Nombre completo" value="Nathaly Ferrer Pacheco" />
        <Field label="Título profesional" value="Psicóloga clínica" />
        <Field label="Enfoque terapéutico" value="Terapia cognitivo-conductual" />
        <Field label="Tarjeta profesional" value="TP 318.245" />
        <Field label="Correo profesional" value="nathaly@psicomorfosis.co" type="email" />
        <Field label="Teléfono" value="+57 318 442 0098" />
      </div>
      <div className="mt-7 flex justify-end gap-3">
        <button className="h-10 px-4 rounded-lg border border-line-200 bg-surface text-sm text-ink-700 hover:border-brand-400">Cancelar</button>
        <button className="h-10 px-5 rounded-lg bg-brand-700 text-primary-foreground text-sm hover:bg-brand-800">Guardar cambios</button>
      </div>
    </>
  );
}

function Toggle({ label, desc, on = false }: { label: string; desc: string; on?: boolean }) {
  const [v, setV] = useState(on);
  return (
    <div className="flex items-start justify-between py-4 border-b border-line-100 last:border-0">
      <div>
        <div className="text-sm font-medium text-ink-900">{label}</div>
        <div className="text-xs text-ink-500 mt-0.5">{desc}</div>
      </div>
      <button
        onClick={() => setV(!v)}
        className={cn("h-6 w-11 rounded-full transition-colors relative shrink-0 mt-0.5", v ? "bg-brand-700" : "bg-line-200")}
      >
        <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-surface shadow-soft transition-transform", v ? "translate-x-5" : "translate-x-0.5")} />
      </button>
    </div>
  );
}

function NotifPanel() {
  return (
    <>
      <SectionHeader title="Notificaciones" desc="Elige qué eventos quieres recibir y por qué canal." />
      <Toggle label="Recordatorio de citas" desc="Recibirás un aviso 1h antes de cada sesión." on />
      <Toggle label="Alertas de riesgo clínico" desc="Notificación inmediata ante banderas críticas." on />
      <Toggle label="Resumen diario" desc="Cada mañana, panorama de tu agenda." on />
      <Toggle label="Pagos recibidos" desc="Avisos cuando un paciente confirma pago." />
      <Toggle label="Mensajes de pacientes" desc="Solo dentro del horario de atención." on />
    </>
  );
}

function SeguridadPanel() {
  return (
    <>
      <SectionHeader title="Seguridad" desc="Cuida el acceso a información clínica protegida." />
      <Toggle label="Autenticación de dos factores (2FA)" desc="Recomendado para roles clínicos y administrativos." on />
      <Toggle label="Cierre automático de sesión" desc="Tras 30 min de inactividad." on />
      <Toggle label="Notificar nuevos inicios de sesión" desc="Recibe correo si se accede desde un dispositivo nuevo." on />
      <div className="mt-6">
        <button className="h-10 px-5 rounded-lg border border-line-200 bg-surface text-sm text-ink-700 hover:border-brand-400">Cambiar contraseña</button>
      </div>
    </>
  );
}

function AparienciaPanel() {
  const [tema, setTema] = useState<"claro" | "oscuro" | "auto">("claro");
  return (
    <>
      <SectionHeader title="Apariencia" desc="Adapta la interfaz a tu manera de trabajar." />
      <div className="grid grid-cols-3 gap-3">
        {(["claro", "oscuro", "auto"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTema(t)}
            className={cn(
              "rounded-xl border-2 p-4 text-left capitalize transition-all",
              tema === t ? "border-brand-700 bg-brand-50" : "border-line-200 bg-surface hover:border-brand-400"
            )}
          >
            <div className={cn("h-16 rounded-lg mb-3", t === "claro" ? "bg-bg-50 border border-line-200" : t === "oscuro" ? "bg-ink-900" : "bg-gradient-to-r from-bg-50 to-ink-900")} />
            <div className="text-sm font-medium text-ink-900">{t}</div>
          </button>
        ))}
      </div>
    </>
  );
}

function PlaceholderPanel({ title, desc }: { title: string; desc: string }) {
  return (
    <>
      <SectionHeader title={title} desc={desc} />
      <div className="rounded-lg border border-dashed border-line-200 bg-bg-50 p-10 text-center">
        <p className="text-sm text-ink-500">Módulo en preparación.</p>
      </div>
    </>
  );
}

function SectionHeader({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="mb-6">
      <h2 className="font-serif text-xl text-ink-900">{title}</h2>
      <p className="text-sm text-ink-500 mt-1">{desc}</p>
    </div>
  );
}
