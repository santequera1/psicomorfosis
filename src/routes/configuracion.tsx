import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  User, Bell, Shield, Palette, Building2, Users2, Globe, ChevronRight,
  Check, X, Video, Calendar, MessageCircle, Plus, MapPin,
  CheckCircle2, Circle, Home, Loader2, Trash2, Edit3, AlertCircle, CreditCard,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api, type Sede, type Professional, type WorkspaceMode } from "@/lib/api";
import { useWorkspace } from "@/lib/workspace";

export const Route = createFileRoute("/configuracion")({
  head: () => ({ meta: [{ title: "Configuración — Psicomorfosis" }] }),
  component: ConfiguracionPage,
});

const SECCIONES = [
  { id: "perfil",       label: "Perfil profesional", icon: User,        desc: "Datos personales y credenciales" },
  { id: "workspace",    label: "Workspace",          icon: Home,        desc: "Modo individual u organización" },
  { id: "sedes",        label: "Sedes",              icon: Building2,   desc: "Consultorios y ubicaciones" },
  { id: "equipo",       label: "Equipo",             icon: Users2,      desc: "Profesionales del workspace" },
  { id: "notificaciones", label: "Notificaciones",   icon: Bell,        desc: "Canales y preferencias de aviso" },
  { id: "seguridad",    label: "Seguridad",          icon: Shield,      desc: "Contraseña, 2FA, sesiones activas" },
  { id: "apariencia",   label: "Apariencia",         icon: Palette,     desc: "Tema, densidad y tipografía" },
  { id: "integraciones",label: "Integraciones",      icon: Globe,       desc: "Calendario, video y mensajería" },
];

function ConfiguracionPage() {
  const [active, setActive] = useState("perfil");
  const { data: workspace } = useWorkspace();
  const isOrg = workspace?.mode === "organization";

  // Ocultar pestaña Sedes en modo individual
  const secciones = SECCIONES.filter((s) => s.id !== "sedes" || isOrg);

  return (
    <AppShell>
      <div className="max-w-[1180px] mx-auto">
        <header className="mb-5 sm:mb-7">
          <div className="text-xs uppercase tracking-[0.14em] text-brand-700 font-semibold">Ajustes · {workspace?.name ?? "Workspace"}</div>
          <h1 className="font-serif text-2xl md:text-3xl text-ink-900 mt-1">Configuración</h1>
          <p className="text-sm text-ink-500 mt-1">
            Modo <span className="font-medium text-ink-900">{isOrg ? "Organización" : "Individual"}</span>
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-4 md:gap-6">
          {/* Tabs horizontales con scroll en mobile, sidebar sticky en desktop */}
          <aside className="md:rounded-xl md:bg-surface md:border md:border-line-200 md:shadow-soft md:p-2 md:h-fit md:sticky md:top-20 -mx-4 sm:-mx-6 md:mx-0 px-4 sm:px-6 md:px-0 overflow-x-auto md:overflow-visible no-scrollbar">
            <div className="flex md:flex-col gap-1 md:gap-0 pb-1 md:pb-0">
              {secciones.map((s) => {
                const Icon = s.icon;
                const isActive = active === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => setActive(s.id)}
                    className={cn(
                      "flex items-center gap-2 md:gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors shrink-0 md:w-full md:text-left whitespace-nowrap",
                      isActive ? "bg-brand-100 text-brand-800" : "text-ink-700 hover:bg-bg-100"
                    )}
                  >
                    <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-brand-700" : "text-ink-400")} />
                    <span className="md:flex-1">{s.label}</span>
                    {isActive && <ChevronRight className="h-4 w-4 text-brand-700 hidden md:inline-block" />}
                  </button>
                );
              })}
            </div>
          </aside>

          <main className="rounded-xl bg-surface border border-line-200 shadow-soft p-4 sm:p-6 md:p-7">
            {active === "perfil" && <PerfilPanel />}
            {active === "workspace" && <WorkspacePanel />}
            {active === "sedes" && <SedesPanel />}
            {active === "equipo" && <EquipoPanel />}
            {active === "notificaciones" && <NotifPanel />}
            {active === "seguridad" && <SeguridadPanel />}
            {active === "apariencia" && <AparienciaPanel />}
            {active === "integraciones" && <IntegracionesPanel />}
          </main>
        </div>
      </div>
    </AppShell>
  );
}


function PerfilPanel() {
  const qc = useQueryClient();
  const { data: workspace } = useWorkspace();
  const isOrg = workspace?.mode === "organization";

  // El profesional "principal" del workspace individual es el primero
  const mainProf = workspace?.professionals?.[0];

  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: () => api.getSettings() });

  const [profForm, setProfForm] = useState<{ name: string; title: string; email: string; phone: string; approach: string }>({
    name: "", title: "", email: "", phone: "", approach: "",
  });
  const [consultorio, setConsultorio] = useState<{ consultorio_name: string; address: string; phone: string; city: string }>({
    consultorio_name: "", address: "", phone: "", city: "",
  });
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Cargar del backend una vez
  useEffect(() => {
    if (mainProf && !loaded) {
      setProfForm({
        name: mainProf.name ?? "",
        title: mainProf.title ?? "",
        email: mainProf.email ?? "",
        phone: mainProf.phone ?? "",
        approach: mainProf.approach ?? "",
      });
    }
    if (settings && !loaded) {
      setConsultorio({
        consultorio_name: settings.consultorio_name ?? "",
        address: settings.address ?? "",
        phone: settings.phone ?? "",
        city: settings.city ?? "Bogotá",
      });
      setLoaded(true);
    }
  }, [mainProf, settings, loaded]);

  const profMu = useMutation({
    mutationFn: async () => {
      if (!mainProf) throw new Error("Sin profesional principal");
      return api.updateProfessional(mainProf.id, profForm);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workspace"] });
      qc.invalidateQueries({ queryKey: ["professionals"] });
      setSavedAt(new Date().toLocaleTimeString("es-CO"));
    },
  });

  const consMu = useMutation({
    mutationFn: () => api.updateSettings(consultorio),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] });
      setSavedAt(new Date().toLocaleTimeString("es-CO"));
    },
  });

  const initials = profForm.name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase() || "?";

  return (
    <>
      <SectionHeader title="Perfil profesional" desc="Información visible para pacientes y colegas." />
      <div className="flex items-center gap-5 mb-7 pb-7 border-b border-line-100">
        <div className="h-20 w-20 rounded-2xl bg-brand-100 text-brand-800 flex items-center justify-center text-2xl font-serif">{initials}</div>
        <div>
          <button disabled className="h-9 px-4 rounded-lg border border-line-200 bg-bg-100 text-ink-500 text-sm cursor-not-allowed" title="Disponible próximamente">Cambiar foto</button>
          <p className="text-xs text-ink-500 mt-2">JPG o PNG · máx. 2MB · disponible próximamente</p>
        </div>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); profMu.mutate(); }}
        className="space-y-5"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
          <LabeledInput label="Nombre completo" value={profForm.name} onChange={(v) => setProfForm((p) => ({ ...p, name: v }))} />
          <LabeledInput label="Título profesional" value={profForm.title} onChange={(v) => setProfForm((p) => ({ ...p, title: v }))} />
          <LabeledInput label="Enfoque terapéutico" value={profForm.approach} onChange={(v) => setProfForm((p) => ({ ...p, approach: v }))} />
          <LabeledInput label="Correo profesional" type="email" value={profForm.email} onChange={(v) => setProfForm((p) => ({ ...p, email: v }))} />
          <LabeledInput label="Teléfono" value={profForm.phone} onChange={(v) => setProfForm((p) => ({ ...p, phone: v }))} />
        </div>
        <div className="flex justify-end gap-3">
          <button type="submit" disabled={profMu.isPending} className="h-10 px-5 rounded-lg bg-brand-700 text-primary-foreground text-sm hover:bg-brand-800 disabled:opacity-60 inline-flex items-center gap-2">
            {profMu.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Guardar perfil
          </button>
        </div>
      </form>

      {!isOrg && (
        <>
          <div className="mt-10 pt-8 border-t border-line-100">
            <SectionHeader title="Mi consultorio" desc="Datos del lugar donde atiendes. Aparecerán en la agenda, documentos y facturas." />
            <form
              onSubmit={(e) => { e.preventDefault(); consMu.mutate(); }}
              className="space-y-5"
            >
              <LabeledInput label="Nombre del consultorio" placeholder="Consultorio Psic. Nathaly Ferrer" value={consultorio.consultorio_name} onChange={(v) => setConsultorio((p) => ({ ...p, consultorio_name: v }))} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
                <LabeledInput label="Dirección" placeholder="Cra 15 # 93-10, Oficina 402" value={consultorio.address} onChange={(v) => setConsultorio((p) => ({ ...p, address: v }))} />
                <LabeledInput label="Ciudad" placeholder="Bogotá" value={consultorio.city} onChange={(v) => setConsultorio((p) => ({ ...p, city: v }))} />
              </div>
              <LabeledInput label="Teléfono del consultorio" placeholder="+57 1 555 1200" value={consultorio.phone} onChange={(v) => setConsultorio((p) => ({ ...p, phone: v }))} />
              <div className="flex justify-end">
                <button type="submit" disabled={consMu.isPending} className="h-10 px-5 rounded-lg bg-brand-700 text-primary-foreground text-sm hover:bg-brand-800 disabled:opacity-60 inline-flex items-center gap-2">
                  {consMu.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Guardar consultorio
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {savedAt && (
        <p className="mt-4 text-xs text-success flex items-center gap-1"><Check className="h-3.5 w-3.5" /> Guardado a las {savedAt}</p>
      )}
    </>
  );
}

function LabeledInput({ label, value, onChange, type = "text", placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <label className="block">
      <div className="text-xs font-medium text-ink-700 mb-1.5">{label}</div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-10 px-3.5 rounded-lg border border-line-200 bg-bg-50 text-sm text-ink-900 focus:outline-none focus:border-brand-400 focus:bg-surface"
      />
    </label>
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

type ThemePreference = "claro" | "oscuro" | "auto";

function applyTheme(pref: ThemePreference) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const shouldDark =
    pref === "oscuro" ||
    (pref === "auto" && window.matchMedia?.("(prefers-color-scheme: dark)").matches);
  root.classList.toggle("dark", shouldDark);
}

function AparienciaPanel() {
  const [tema, setTema] = useState<ThemePreference>(() => {
    if (typeof window === "undefined") return "claro";
    return (window.localStorage.getItem("psm.theme") as ThemePreference) ?? "claro";
  });

  useEffect(() => {
    applyTheme(tema);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("psm.theme", tema);
    }

    // En modo auto, reaccionar a cambios del SO
    if (tema === "auto" && typeof window !== "undefined" && window.matchMedia) {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = () => applyTheme("auto");
      mq.addEventListener?.("change", handler);
      return () => mq.removeEventListener?.("change", handler);
    }
  }, [tema]);

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
      <p className="text-xs text-ink-500 mt-4">
        El tema se aplica inmediatamente y se guarda para la próxima sesión. "Auto" sigue la preferencia de tu sistema operativo.
      </p>
    </>
  );
}

// ─── Workspace panel: modo individual u organización ──────────────────────
function WorkspacePanel() {
  const { data: workspace } = useWorkspace();
  const qc = useQueryClient();
  const [name, setName] = useState<string>("");
  const [pendingMode, setPendingMode] = useState<WorkspaceMode | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  // Sync local state cuando cargue workspace
  if (workspace && name === "") setName(workspace.name);

  const updateMu = useMutation({
    mutationFn: (body: { name?: string; mode?: WorkspaceMode }) => api.updateWorkspace(body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["workspace"] }); setSavedAt(new Date().toLocaleTimeString("es-CO")); setPendingMode(null); },
  });

  if (!workspace) return <div className="text-sm text-ink-500">Cargando…</div>;

  const currentMode = pendingMode ?? workspace.mode;

  return (
    <>
      <SectionHeader title="Workspace" desc="Controla el alcance y nombre de tu espacio de trabajo." />

      <label className="block mb-6">
        <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">Nombre del workspace</span>
        <div className="mt-1 flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700"
          />
          <button
            onClick={() => updateMu.mutate({ name })}
            disabled={updateMu.isPending || name === workspace.name}
            className="h-10 px-4 rounded-md bg-brand-700 text-primary-foreground text-sm font-medium hover:bg-brand-800 disabled:opacity-50"
          >
            Guardar
          </button>
        </div>
      </label>

      <h4 className="text-xs uppercase tracking-widest text-brand-700 font-semibold mb-3">Modo de operación</h4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
        {([
          { id: "individual", title: "Individual", desc: "Un solo psicólogo atiende pacientes. Sin sedes ni equipo.", bullets: ["1 profesional", "Sin concepto de sede", "Ideal para consulta privada"] },
          { id: "organization", title: "Organización", desc: "Clínica con múltiples profesionales y sedes. Un profesional puede trabajar en varias sedes.", bullets: ["Múltiples profesionales", "Múltiples sedes", "Asignaciones flexibles"] },
        ] as Array<{ id: WorkspaceMode; title: string; desc: string; bullets: string[] }>).map((m) => (
          <button
            key={m.id}
            onClick={() => setPendingMode(m.id === workspace.mode ? null : m.id)}
            className={cn(
              "text-left rounded-xl border p-5 transition-colors",
              currentMode === m.id ? "border-brand-700 bg-brand-50/50" : "border-line-200 hover:border-brand-400"
            )}
          >
            <div className="flex items-center justify-between mb-1">
              <h5 className="font-serif text-lg text-ink-900">{m.title}</h5>
              {workspace.mode === m.id && <span className="text-[10px] uppercase tracking-wider text-brand-700 font-medium">Actual</span>}
              {pendingMode === m.id && <span className="text-[10px] uppercase tracking-wider text-warning font-medium">Nuevo</span>}
            </div>
            <p className="text-xs text-ink-700">{m.desc}</p>
            <ul className="mt-3 space-y-1">
              {m.bullets.map((b) => (
                <li key={b} className="text-[11px] text-ink-500 flex items-start gap-1.5">
                  <Check className="h-3 w-3 text-success mt-0.5 shrink-0" /> {b}
                </li>
              ))}
            </ul>
          </button>
        ))}
      </div>

      {pendingMode && (
        <div className="rounded-lg border border-warning/30 bg-warning-soft p-4 mb-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-4 w-4 text-risk-moderate shrink-0 mt-0.5" />
            <div className="flex-1 text-sm text-ink-700">
              Cambiarás el modo a <strong className="text-ink-900">{pendingMode === "organization" ? "Organización" : "Individual"}</strong>.
              {pendingMode === "individual" && " Las sedes y profesionales adicionales quedarán ocultos pero no se eliminarán."}
              {pendingMode === "organization" && " Podrás crear sedes y agregar más profesionales."}
            </div>
            <button
              onClick={() => updateMu.mutate({ mode: pendingMode })}
              disabled={updateMu.isPending}
              className="h-9 px-3 rounded-md bg-brand-700 text-primary-foreground text-xs font-medium hover:bg-brand-800 disabled:opacity-50"
            >
              {updateMu.isPending ? "Aplicando…" : "Confirmar cambio"}
            </button>
          </div>
        </div>
      )}

      {savedAt && !pendingMode && (
        <p className="text-xs text-success flex items-center gap-1"><Check className="h-3.5 w-3.5" /> Cambios guardados a las {savedAt}</p>
      )}
    </>
  );
}

// ─── Sedes panel ──────────────────────────────────────────────────────────
function SedesPanel() {
  const qc = useQueryClient();
  const { data: sedes = [], isLoading } = useQuery({ queryKey: ["sedes"], queryFn: () => api.listSedes() });
  const [editing, setEditing] = useState<Sede | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const delMu = useMutation({
    mutationFn: (id: number) => api.deleteSede(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["sedes"] }); qc.invalidateQueries({ queryKey: ["workspace"] }); },
  });

  return (
    <>
      <SectionHeader title="Sedes" desc="Consultorios físicos y modalidades remotas del workspace." />

      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-ink-500">{isLoading ? "Cargando…" : `${sedes.length} sedes registradas`}</p>
        <button
          onClick={() => setCreateOpen(true)}
          className="h-9 px-3 rounded-md bg-brand-700 text-primary-foreground text-xs font-medium hover:bg-brand-800 inline-flex items-center gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" /> Nueva sede
        </button>
      </div>

      {sedes.length === 0 && !isLoading && (
        <div className="rounded-lg border border-dashed border-line-200 p-10 text-center">
          <Building2 className="h-6 w-6 text-ink-400 mx-auto mb-2" />
          <p className="text-sm text-ink-500">Aún no hay sedes. Crea la primera para comenzar.</p>
        </div>
      )}

      <ul className="space-y-2">
        {sedes.map((s) => (
          <li key={s.id} className="rounded-lg border border-line-200 p-4 flex items-start gap-3 hover:border-brand-400 transition-colors">
            <div className="h-10 w-10 rounded-lg bg-brand-50 text-brand-800 flex items-center justify-center shrink-0">
              <Building2 className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-medium text-ink-900">{s.name}</h4>
                {s.active ? (
                  <span className="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full font-medium bg-success-soft text-success">Activa</span>
                ) : (
                  <span className="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full font-medium bg-bg-100 text-ink-500">Inactiva</span>
                )}
              </div>
              {s.address && <div className="text-xs text-ink-500 mt-0.5 inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {s.address}</div>}
              {s.phone && <div className="text-xs text-ink-500 tabular">{s.phone}</div>}
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setEditing(s)} className="h-8 w-8 rounded-md text-ink-500 hover:bg-bg-100 hover:text-ink-900 flex items-center justify-center" title="Editar">
                <Edit3 className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => { if (confirm(`¿Eliminar ${s.name}?`)) delMu.mutate(s.id); }} className="h-8 w-8 rounded-md text-ink-500 hover:bg-error-soft hover:text-risk-high flex items-center justify-center" title="Eliminar">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </li>
        ))}
      </ul>

      {(createOpen || editing) && (
        <SedeFormModal
          sede={editing}
          onClose={() => { setCreateOpen(false); setEditing(null); }}
          onSaved={() => { qc.invalidateQueries({ queryKey: ["sedes"] }); qc.invalidateQueries({ queryKey: ["workspace"] }); setCreateOpen(false); setEditing(null); }}
        />
      )}
    </>
  );
}

function SedeFormModal({ sede, onClose, onSaved }: { sede: Sede | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(sede?.name ?? "");
  const [address, setAddress] = useState(sede?.address ?? "");
  const [phone, setPhone] = useState(sede?.phone ?? "");
  const [active, setActive] = useState(sede ? !!sede.active : true);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (sede) await api.updateSede(sede.id, { name, address, phone, active });
      else await api.createSede({ name, address, phone });
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 backdrop-blur-sm p-4" onClick={onClose}>
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl bg-surface shadow-modal" onClick={(e) => e.stopPropagation()}>
        <header className="p-5 border-b border-line-100 flex items-start justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-brand-800 font-medium">Sedes</p>
            <h3 className="font-serif text-xl text-ink-900 mt-0.5">{sede ? "Editar sede" : "Nueva sede"}</h3>
          </div>
          <button type="button" onClick={onClose} className="h-9 w-9 rounded-md border border-line-200 text-ink-500 hover:border-brand-400 flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="p-5 space-y-3">
          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">Nombre</span>
            <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Sede Chapinero" className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700" />
          </label>
          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">Dirección</span>
            <input value={address ?? ""} onChange={(e) => setAddress(e.target.value)} placeholder="Calle 72 # 8-24" className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700" />
          </label>
          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">Teléfono</span>
            <input value={phone ?? ""} onChange={(e) => setPhone(e.target.value)} placeholder="+57 1 555 1200" className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700 tabular" />
          </label>
          {sede && (
            <label className="flex items-center gap-2 text-sm text-ink-700 cursor-pointer select-none">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="sr-only peer" />
              <span className="h-[18px] w-[18px] rounded-[5px] border border-line-200 bg-surface flex items-center justify-center peer-checked:bg-brand-700 peer-checked:border-brand-700">
                {active && <Check className="h-3 w-3 text-primary-foreground" strokeWidth={3} />}
              </span>
              Sede activa
            </label>
          )}
        </div>
        <footer className="p-4 border-t border-line-100 bg-bg-100/30 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-9 px-3 rounded-md border border-line-200 text-sm text-ink-700 hover:border-brand-400">Cancelar</button>
          <button type="submit" disabled={saving} className="h-9 px-4 rounded-md bg-brand-700 text-primary-foreground text-sm font-medium hover:bg-brand-800 disabled:opacity-50 inline-flex items-center gap-2">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {sede ? "Guardar cambios" : "Crear sede"}
          </button>
        </footer>
      </form>
    </div>
  );
}

// ─── Equipo panel: profesionales ──────────────────────────────────────────
function EquipoPanel() {
  const qc = useQueryClient();
  const { data: workspace } = useWorkspace();
  const { data: professionals = [], isLoading } = useQuery({ queryKey: ["professionals"], queryFn: () => api.listProfessionals() });
  const sedes = workspace?.sedes ?? [];
  const isOrg = workspace?.mode === "organization";
  const [editing, setEditing] = useState<Professional | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const delMu = useMutation({
    mutationFn: (id: number) => api.deleteProfessional(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["professionals"] }); qc.invalidateQueries({ queryKey: ["workspace"] }); },
  });

  return (
    <>
      <SectionHeader title="Equipo" desc={isOrg ? "Profesionales del workspace y sus sedes asignadas." : "Profesional a cargo del workspace."} />

      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-ink-500">{isLoading ? "Cargando…" : `${professionals.length} profesional${professionals.length === 1 ? "" : "es"}`}</p>
        {isOrg && (
          <button
            onClick={() => setCreateOpen(true)}
            className="h-9 px-3 rounded-md bg-brand-700 text-primary-foreground text-xs font-medium hover:bg-brand-800 inline-flex items-center gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" /> Nuevo profesional
          </button>
        )}
      </div>

      <ul className="rounded-lg border border-line-200 overflow-hidden divide-y divide-line-100">
        {professionals.map((p) => {
          const initials = p.name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase();
          const pSedes = sedes.filter((s) => p.sedeIds.includes(s.id));
          return (
            <li key={p.id} className="flex items-center gap-4 px-4 py-3 hover:bg-bg-100/40">
              <div className="h-10 w-10 rounded-full bg-brand-100 text-brand-800 flex items-center justify-center text-xs font-semibold shrink-0">
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-ink-900">{p.name}</div>
                <div className="text-xs text-ink-500 truncate">{p.title} · {p.email}</div>
                {isOrg && pSedes.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {pSedes.map((s) => (
                      <span key={s.id} className="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full font-medium bg-lavender-100 text-lavender-500 inline-flex items-center gap-1">
                        <Building2 className="h-2.5 w-2.5" /> {s.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <span className={cn(
                "text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full font-medium",
                p.active ? "bg-success-soft text-success" : "bg-bg-100 text-ink-500"
              )}>{p.active ? "Activo" : "Inactivo"}</span>
              <button onClick={() => setEditing(p)} className="h-8 w-8 rounded-md text-ink-500 hover:bg-bg-100 flex items-center justify-center" title="Editar">
                <Edit3 className="h-3.5 w-3.5" />
              </button>
              {isOrg && professionals.length > 1 && (
                <button onClick={() => { if (confirm(`¿Eliminar a ${p.name}?`)) delMu.mutate(p.id); }} className="h-8 w-8 rounded-md text-ink-500 hover:bg-error-soft hover:text-risk-high flex items-center justify-center" title="Eliminar">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {(createOpen || editing) && (
        <ProfessionalFormModal
          professional={editing}
          sedes={sedes}
          isOrg={!!isOrg}
          onClose={() => { setCreateOpen(false); setEditing(null); }}
          onSaved={() => { qc.invalidateQueries({ queryKey: ["professionals"] }); qc.invalidateQueries({ queryKey: ["workspace"] }); setCreateOpen(false); setEditing(null); }}
        />
      )}
    </>
  );
}

function ProfessionalFormModal({ professional, sedes, isOrg, onClose, onSaved }: {
  professional: Professional | null;
  sedes: Sede[];
  isOrg: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(professional?.name ?? "");
  const [title, setTitle] = useState(professional?.title ?? "");
  const [email, setEmail] = useState(professional?.email ?? "");
  const [phone, setPhone] = useState(professional?.phone ?? "");
  const [approach, setApproach] = useState(professional?.approach ?? "");
  const [sedeIds, setSedeIds] = useState<number[]>(professional?.sedeIds ?? []);
  const [active, setActive] = useState(professional ? !!professional.active : true);
  const [saving, setSaving] = useState(false);

  function toggleSede(id: number) {
    setSedeIds((ids) => ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id]);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body = { name, title, email, phone, approach, sedeIds, active };
      if (professional) await api.updateProfessional(professional.id, body);
      else await api.createProfessional(body);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 backdrop-blur-sm p-4" onClick={onClose}>
      <form onSubmit={submit} className="w-full max-w-lg rounded-2xl bg-surface shadow-modal max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <header className="p-5 border-b border-line-100 flex items-start justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-brand-800 font-medium">Equipo</p>
            <h3 className="font-serif text-xl text-ink-900 mt-0.5">{professional ? "Editar profesional" : "Nuevo profesional"}</h3>
          </div>
          <button type="button" onClick={onClose} className="h-9 w-9 rounded-md border border-line-200 text-ink-500 hover:border-brand-400 flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="p-5 space-y-3 overflow-y-auto">
          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">Nombre completo</span>
            <input required value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">Título</span>
              <input value={title ?? ""} onChange={(e) => setTitle(e.target.value)} placeholder="Psicóloga clínica" className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700" />
            </label>
            <label className="block">
              <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">Enfoque</span>
              <input value={approach ?? ""} onChange={(e) => setApproach(e.target.value)} placeholder="TCC" className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700" />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">Correo</span>
              <input type="email" value={email ?? ""} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700" />
            </label>
            <label className="block">
              <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">Teléfono</span>
              <input value={phone ?? ""} onChange={(e) => setPhone(e.target.value)} className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700 tabular" />
            </label>
          </div>

          {isOrg && sedes.length > 0 && (
            <div>
              <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">Sedes asignadas</span>
              <div className="mt-1 grid grid-cols-2 gap-2">
                {sedes.map((s) => {
                  const checked = sedeIds.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => toggleSede(s.id)}
                      className={cn(
                        "flex items-center gap-2 rounded-md border p-2.5 text-sm text-left transition-colors",
                        checked ? "border-brand-700 bg-brand-50/50" : "border-line-200 hover:border-brand-400"
                      )}
                    >
                      <span className={cn(
                        "h-4 w-4 rounded-[4px] border flex items-center justify-center shrink-0",
                        checked ? "bg-brand-700 border-brand-700" : "border-line-200 bg-surface"
                      )}>
                        {checked && <Check className="h-3 w-3 text-primary-foreground" strokeWidth={3} />}
                      </span>
                      <Building2 className="h-3.5 w-3.5 text-ink-400" />
                      <span className="truncate">{s.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {professional && (
            <label className="flex items-center gap-2 text-sm text-ink-700 cursor-pointer select-none">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="sr-only peer" />
              <span className="h-[18px] w-[18px] rounded-[5px] border border-line-200 bg-surface flex items-center justify-center peer-checked:bg-brand-700 peer-checked:border-brand-700">
                {active && <Check className="h-3 w-3 text-primary-foreground" strokeWidth={3} />}
              </span>
              Profesional activo
            </label>
          )}
        </div>
        <footer className="p-4 border-t border-line-100 bg-bg-100/30 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-9 px-3 rounded-md border border-line-200 text-sm text-ink-700 hover:border-brand-400">Cancelar</button>
          <button type="submit" disabled={saving} className="h-9 px-4 rounded-md bg-brand-700 text-primary-foreground text-sm font-medium hover:bg-brand-800 disabled:opacity-50 inline-flex items-center gap-2">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {professional ? "Guardar cambios" : "Crear profesional"}
          </button>
        </footer>
      </form>
    </div>
  );
}

function IntegracionesPanel() {
  const integrations = [
    { id: "gcal", name: "Google Calendar", Icon: Calendar, desc: "Sincroniza tu agenda con Google Calendar en dos sentidos.", status: "conectado" as const, meta: "nathaly@psicomorfosis.co" },
    { id: "zoom", name: "Zoom",             Icon: Video,    desc: "Genera automáticamente salas de Zoom para sesiones de telepsicología.", status: "conectado" as const, meta: "Plan Pro · licencia institucional" },
    { id: "jitsi", name: "Jitsi Meet",      Icon: Video,    desc: "Alternativa open-source para telepsicología sin licencias.", status: "disponible" as const, meta: "" },
    { id: "wa", name: "WhatsApp Business",  Icon: MessageCircle, desc: "Recordatorios de cita y mensajería con pacientes por WhatsApp.", status: "requiere configuracion" as const, meta: "Pendiente verificación del número" },
    { id: "dian", name: "DIAN · Factura electrónica", Icon: CreditCard, desc: "Emisión de factura electrónica con validación DIAN para Colombia.", status: "disponible" as const, meta: "" },
    { id: "fhir", name: "HL7 / FHIR",       Icon: Globe,   desc: "Intercambio de información clínica estructurada con EPS y prestadores.", status: "disponible" as const, meta: "" },
  ];

  const styleFor = (s: typeof integrations[number]["status"]) => ({
    conectado:             { bg: "bg-success-soft",   text: "text-success",       Icon: CheckCircle2, label: "Conectado" },
    disponible:            { bg: "bg-bg-100",         text: "text-ink-500",       Icon: Circle,       label: "Disponible" },
    "requiere configuracion": { bg: "bg-warning-soft",text: "text-risk-moderate", Icon: Circle,       label: "Configurar" },
  }[s]);

  return (
    <>
      <SectionHeader title="Integraciones" desc="Conecta Psicomorfosis con tus herramientas favoritas." />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {integrations.map((it) => {
          const s = styleFor(it.status);
          const StatusIcon = s.Icon;
          const ItIcon = it.Icon;
          return (
            <article key={it.id} className="rounded-xl border border-line-200 p-4 flex items-start gap-3 hover:border-brand-400 transition-colors">
              <div className="h-10 w-10 rounded-lg bg-brand-50 text-brand-800 flex items-center justify-center shrink-0">
                <ItIcon className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-sm font-medium text-ink-900">{it.name}</h4>
                  <span className={cn("inline-flex items-center gap-1 text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full font-medium", s.bg, s.text)}>
                    <StatusIcon className="h-3 w-3" /> {s.label}
                  </span>
                </div>
                <p className="text-xs text-ink-500 mt-1">{it.desc}</p>
                {it.meta && <p className="text-[11px] text-ink-400 mt-1 tabular">{it.meta}</p>}
                <button className={cn(
                  "mt-3 h-8 px-3 rounded-md text-xs font-medium transition-colors",
                  it.status === "conectado"
                    ? "border border-line-200 text-ink-700 hover:border-brand-400"
                    : "bg-brand-700 text-primary-foreground hover:bg-brand-800"
                )}>
                  {it.status === "conectado" ? "Desconectar" : it.status === "requiere configuracion" ? "Continuar configuración" : "Conectar"}
                </button>
              </div>
            </article>
          );
        })}
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
