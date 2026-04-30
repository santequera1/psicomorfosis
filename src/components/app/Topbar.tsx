import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import {
  Search, Bell, ChevronDown, Building2, MessageSquareWarning, X,
  Users, CalendarDays, FileText, Brain, Pill, MessagesSquare, LayoutDashboard,
  Phone, LifeBuoy, AlertOctagon, ChevronRight, BellDot, CheckCheck,
  User as UserIcon, Settings, LogOut, HelpCircle, Menu,
} from "lucide-react";
import { useSidebar } from "./SidebarContext";
import {
  NOTIFICATIONS, CRISIS_LINES, CRISIS_PROTOCOL_STEPS,
} from "@/lib/mock-data";
import { api, clearSession, getStoredUser } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { useWorkspace } from "@/lib/workspace";
import { RiskBadge } from "./RiskBadge";

const ROUTE_LABELS: Record<string, string> = {
  "/": "Inicio",
  "/agenda": "Agenda",
  "/pacientes": "Pacientes",
  "/historia": "Historia clínica",
  "/tests": "Tests psicométricos",
  "/prescripcion": "Prescripción",
  "/documentos": "Documentos",
  "/facturacion": "Recibos",
  "/reportes": "Reportes",
  "/configuracion": "Configuración",
};

export function Topbar() {
  const { location } = useRouterState();
  const navigate = useNavigate();
  const { toggle: toggleSidebar } = useSidebar();
  const pathKey = Object.keys(ROUTE_LABELS).find((k) => k === location.pathname || (k !== "/" && location.pathname.startsWith(k)));
  const label = pathKey ? ROUTE_LABELS[pathKey] : "Psicomorfosis";
  const [currentUser, setCurrentUser] = useState<ReturnType<typeof getStoredUser>>(null);
  useEffect(() => { setCurrentUser(getStoredUser()); }, []);

  function handleLogout() {
    clearSession();
    navigate({ to: "/login" as any });
  }

  const { data: workspace } = useWorkspace();
  const sedes = workspace?.sedes ?? [];
  const isOrg = workspace?.mode === "organization";
  const [sedeId, setSedeId] = useState<number | null>(null);
  useEffect(() => { if (isOrg && sedes.length > 0 && sedeId === null) setSedeId(sedes[0].id); }, [isOrg, sedes, sedeId]);
  const activeSede = sedes.find((s) => s.id === sedeId);

  const [sedeOpen, setSedeOpen] = useState(false);
  const [crisisOpen, setCrisisOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [cmdkOpen, setCmdkOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);

  const unread = NOTIFICATIONS.filter((n) => !n.read).length;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdkOpen((v) => !v);
      }
      if (e.key === "Escape") {
        setCmdkOpen(false);
        setNotifOpen(false);
        setCrisisOpen(false);
        setSedeOpen(false);
        setUserOpen(false);
      }
    };
    const onCrisis = () => setCrisisOpen(true);
    const onCmdk = () => setCmdkOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("psm:open-crisis", onCrisis);
    window.addEventListener("psm:open-cmdk", onCmdk);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("psm:open-crisis", onCrisis);
      window.removeEventListener("psm:open-cmdk", onCmdk);
    };
  }, []);

  return (
    <>
      <header className="sticky top-0 z-30 h-16 bg-surface/85 backdrop-blur border-b border-line-100">
        <div className="h-full px-3 sm:px-4 md:px-6 flex items-center gap-2 md:gap-4">
          {/* Hamburguesa visible solo en mobile */}
          <button
            onClick={toggleSidebar}
            className="md:hidden h-10 w-10 rounded-md border border-line-200 bg-surface text-ink-700 hover:border-brand-400 flex items-center justify-center shrink-0"
            aria-label="Abrir menú"
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Breadcrumb: en mobile solo muestra la ruta actual, sin workspace name */}
          <nav className="flex items-center gap-2 text-sm text-ink-500 min-w-0 flex-1 md:flex-initial">
            <Link to="/" className="hidden md:inline hover:text-ink-900 truncate max-w-[180px]">{workspace?.name ?? "Psicomorfosis"}</Link>
            <span className="hidden md:inline text-ink-300">/</span>
            <span className="text-ink-900 font-medium truncate">{label}</span>
          </nav>

          {/* Buscador: full en desktop, solo icono en mobile */}
          <div className="hidden md:block flex-1 max-w-xl mx-auto">
            <button
              onClick={() => setCmdkOpen(true)}
              className="w-full h-10 flex items-center gap-2 px-3.5 rounded-lg border border-line-200 bg-bg-100/60 text-ink-400 text-sm hover:border-brand-400 hover:text-ink-700 transition-colors"
            >
              <Search className="h-4 w-4" />
              <span className="flex-1 text-left">Buscar paciente, cita, documento…</span>
              <kbd className="text-[11px] px-1.5 py-0.5 rounded border border-line-200 bg-surface text-ink-500 tabular">⌘K</kbd>
            </button>
          </div>
          <button
            onClick={() => setCmdkOpen(true)}
            className="md:hidden h-10 w-10 rounded-md border border-line-200 bg-surface text-ink-700 hover:border-brand-400 flex items-center justify-center shrink-0"
            aria-label="Buscar"
          >
            <Search className="h-4 w-4" />
          </button>

          {isOrg && sedes.length > 0 && (
            <div className="relative hidden md:block">
              <button
                onClick={() => setSedeOpen((v) => !v)}
                className="flex items-center gap-2 h-10 px-3 rounded-lg border border-line-200 bg-surface text-ink-700 text-sm hover:border-brand-400"
              >
                <Building2 className="h-4 w-4 text-ink-400" />
                <span className="truncate max-w-[140px]">{activeSede?.name ?? "Todas las sedes"}</span>
                <ChevronDown className={"h-4 w-4 text-ink-400 transition-transform " + (sedeOpen ? "rotate-180" : "")} />
              </button>
              {sedeOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setSedeOpen(false)} />
                  <div className="absolute right-0 top-12 w-60 rounded-lg border border-line-200 bg-surface shadow-modal z-50 p-1">
                    <button
                      onClick={() => { setSedeId(null); setSedeOpen(false); }}
                      className={
                        "w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left transition-colors " +
                        (sedeId === null ? "bg-brand-50 text-brand-800 font-medium" : "text-ink-700 hover:bg-bg-100")
                      }
                    >
                      <Building2 className="h-4 w-4 text-ink-400" />
                      <span className="flex-1">Todas las sedes</span>
                      {sedeId === null && <CheckCheck className="h-4 w-4 text-brand-700" />}
                    </button>
                    <div className="my-1 h-px bg-line-100" />
                    {sedes.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => { setSedeId(s.id); setSedeOpen(false); }}
                        className={
                          "w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left transition-colors " +
                          (s.id === sedeId ? "bg-brand-50 text-brand-800 font-medium" : "text-ink-700 hover:bg-bg-100")
                        }
                      >
                        <Building2 className="h-4 w-4 text-ink-400" />
                        <span className="flex-1 truncate">{s.name}</span>
                        {s.id === sedeId && <CheckCheck className="h-4 w-4 text-brand-700" />}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          <button
            onClick={() => setCrisisOpen(true)}
            className="relative h-10 w-10 rounded-lg border border-risk-high/40 bg-error-soft/40 text-risk-high hover:bg-error-soft hover:border-risk-high transition-colors flex items-center justify-center"
            aria-label="Protocolo de crisis"
            title="Protocolo de crisis"
          >
            <MessageSquareWarning className="h-4 w-4" />
          </button>

          <div className="relative">
            <button
              onClick={() => setNotifOpen((v) => !v)}
              className="relative h-10 w-10 rounded-lg border border-line-200 bg-surface text-ink-700 hover:border-brand-400 flex items-center justify-center"
              aria-label="Notificaciones"
            >
              {unread > 0 ? <BellDot className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
              {unread > 0 && <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-risk-high ring-2 ring-surface" />}
            </button>
            {notifOpen && <NotificationsPanel onClose={() => setNotifOpen(false)} />}
          </div>

          <div className="relative">
            <button
              onClick={() => setUserOpen((v) => !v)}
              className="h-10 w-10 rounded-full bg-brand-100 text-brand-800 flex items-center justify-center text-sm font-semibold border border-line-200 hover:border-brand-400 transition-colors"
              title={currentUser?.name ?? "Menú de usuario"}
              aria-label="Menú de usuario"
            >
              {currentUser?.name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase() ?? "?"}
            </button>
            {userOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setUserOpen(false)} />
                <div className="absolute right-0 top-12 w-64 rounded-xl border border-line-200 bg-surface shadow-modal z-50 overflow-hidden">
                  <div className="p-4 border-b border-line-100 flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-brand-100 text-brand-800 flex items-center justify-center text-sm font-semibold shrink-0">
                      {currentUser?.name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase() ?? "?"}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-ink-900 truncate">{currentUser?.name ?? "Sin sesión"}</div>
                      <div className="text-[11px] text-ink-500 truncate">{currentUser?.email ?? ""}</div>
                      {currentUser?.role && (
                        <span className="mt-0.5 inline-block text-[10px] uppercase tracking-widest px-1.5 py-0.5 rounded-full bg-brand-100 text-brand-800 font-medium">
                          {currentUser.role.replace("_", " ")}
                        </span>
                      )}
                    </div>
                  </div>
                  <nav className="p-1">
                    <UserMenuItem to="/configuracion" icon={UserIcon} label="Mi perfil" onClose={() => setUserOpen(false)} />
                    <UserMenuItem to="/configuracion" icon={Settings} label="Configuración" onClose={() => setUserOpen(false)} />
                    <UserMenuItem icon={HelpCircle} label="Centro de ayuda" onClose={() => setUserOpen(false)} />
                  </nav>
                  <div className="p-1 border-t border-line-100">
                    <button
                      onClick={() => { setUserOpen(false); handleLogout(); }}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-risk-high hover:bg-error-soft/50 transition-colors"
                    >
                      <LogOut className="h-4 w-4" />
                      Cerrar sesión
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {crisisOpen && <CrisisModal onClose={() => setCrisisOpen(false)} />}
      {cmdkOpen && <CommandPalette onClose={() => setCmdkOpen(false)} />}
    </>
  );
}

function UserMenuItem({ to, icon: Icon, label, onClose }: { to?: string; icon: React.ComponentType<{ className?: string }>; label: string; onClose: () => void }) {
  const inner = (
    <>
      <Icon className="h-4 w-4 text-ink-500" />
      <span>{label}</span>
    </>
  );
  const cls = "w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-ink-700 hover:bg-bg-100 transition-colors";
  if (to) {
    return <Link to={to} onClick={onClose} className={cls}>{inner}</Link>;
  }
  return <button onClick={onClose} className={cls}>{inner}</button>;
}

// ─────────────────────────────────────────────────────────────
// Panel de notificaciones
// ─────────────────────────────────────────────────────────────

function NotificationsPanel({ onClose }: { onClose: () => void }) {
  const iconFor = (t: typeof NOTIFICATIONS[number]["type"]) => {
    switch (t) {
      case "cita": return <CalendarDays className="h-4 w-4" />;
      case "mensaje": return <MessagesSquare className="h-4 w-4" />;
      case "tarea": return <Pill className="h-4 w-4" />;
      case "test": return <Brain className="h-4 w-4" />;
      case "alerta": return <AlertOctagon className="h-4 w-4" />;
      case "documento": return <FileText className="h-4 w-4" />;
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      {/*
        En mobile: panel ocupa todo el ancho disponible con margen, anclado al
        borde derecho del topbar. En desktop: ancho fijo 380px.
        Usamos right-2 sm:right-0 para que no se salga al borde de la pantalla.
      */}
      <div className="fixed sm:absolute right-2 left-2 sm:left-auto sm:right-0 top-16 sm:top-12 sm:w-[380px] rounded-xl border border-line-200 bg-surface shadow-modal z-50 max-h-[70vh] sm:max-h-[560px] flex flex-col overflow-hidden">
        <header className="px-4 py-3 border-b border-line-100 flex items-center justify-between">
          <div>
            <h3 className="font-serif text-base text-ink-900">Notificaciones</h3>
            <p className="text-[11px] text-ink-500">{NOTIFICATIONS.filter((n) => !n.read).length} sin leer</p>
          </div>
          <button className="text-[11px] text-brand-700 hover:underline">Marcar todo como leído</button>
        </header>
        <ul className="flex-1 overflow-y-auto divide-y divide-line-100">
          {NOTIFICATIONS.map((n) => (
            <li key={n.id} className={"px-4 py-3 flex items-start gap-3 hover:bg-bg-100/40 transition-colors " + (!n.read ? "bg-brand-50/30" : "")}>
              <div className={
                "h-9 w-9 rounded-lg flex items-center justify-center shrink-0 " +
                (n.urgent ? "bg-error-soft text-risk-high" : n.read ? "bg-bg-100 text-ink-500" : "bg-brand-50 text-brand-800")
              }>
                {iconFor(n.type)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm text-ink-900 font-medium truncate">{n.title}</p>
                  {!n.read && <span className="h-1.5 w-1.5 rounded-full bg-brand-700 shrink-0" />}
                </div>
                <p className="text-xs text-ink-500 mt-0.5 line-clamp-2">{n.description}</p>
                <p className="text-[10px] text-ink-400 mt-1 tabular">{n.at}</p>
              </div>
            </li>
          ))}
        </ul>
        <footer className="px-4 py-2.5 border-t border-line-100 bg-bg-100/30">
          <button className="w-full text-xs text-center text-brand-700 hover:underline">Ver todas las notificaciones</button>
        </footer>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Protocolo de crisis
// ─────────────────────────────────────────────────────────────

function CrisisModal({ onClose }: { onClose: () => void }) {
  const [registroOpen, setRegistroOpen] = useState(false);
  const { data: patients = [] } = useQuery({ queryKey: ["patients"], queryFn: () => api.listPatients() });

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink-900/50 backdrop-blur-sm p-4 overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-2xl my-8 rounded-2xl bg-surface shadow-modal overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <header className="p-5 border-b border-line-100 flex items-start gap-4 bg-error-soft/40">
          <div className="h-12 w-12 rounded-xl bg-risk-high text-primary-foreground flex items-center justify-center shrink-0">
            <MessageSquareWarning className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <p className="text-[11px] uppercase tracking-[0.1em] text-risk-high font-medium">Activación inmediata</p>
            <h2 className="font-serif text-2xl text-ink-900 mt-0.5">Protocolo de crisis</h2>
            <p className="text-sm text-ink-700 mt-1">Para riesgo suicida, autolesión o descompensación aguda.</p>
          </div>
          <button onClick={onClose} className="h-9 w-9 rounded-md border border-line-200 bg-surface text-ink-500 hover:border-brand-400 flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="p-5 space-y-5">
          <section>
            <h3 className="font-serif text-base text-ink-900 mb-3">Pasos del protocolo</h3>
            <ol className="space-y-2.5">
              {CRISIS_PROTOCOL_STEPS.map((step, i) => (
                <li key={i} className="flex items-start gap-3 p-3 rounded-lg border border-line-200 bg-bg-100/40">
                  <div className="h-7 w-7 rounded-full bg-brand-700 text-primary-foreground text-xs font-semibold flex items-center justify-center shrink-0 tabular">
                    {i + 1}
                  </div>
                  <p className="text-sm text-ink-700 pt-1">{step}</p>
                </li>
              ))}
            </ol>
          </section>

          <section>
            <h3 className="font-serif text-base text-ink-900 mb-3">Líneas de ayuda</h3>
            <ul className="space-y-2">
              {CRISIS_LINES.map((c) => (
                <li key={c.number} className="flex items-center gap-3 p-3 rounded-lg border border-line-200 hover:border-risk-high hover:bg-error-soft/30 transition-colors">
                  <div className="h-10 w-10 rounded-lg bg-error-soft text-risk-high flex items-center justify-center shrink-0">
                    <Phone className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-ink-900">{c.name}</div>
                    <div className="text-xs text-ink-500 truncate">{c.description}</div>
                  </div>
                  <a href={`tel:${c.number.replace(/\s/g, "")}`} className="text-sm font-medium tabular text-risk-high whitespace-nowrap">
                    {c.number}
                  </a>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-lg border border-brand-700/20 bg-brand-50/40 p-4">
            <div className="flex items-center gap-2">
              <LifeBuoy className="h-4 w-4 text-brand-700" />
              <h3 className="font-serif text-base text-ink-900">Registro del incidente</h3>
            </div>
            <p className="text-xs text-ink-700 mt-1">Registra este incidente en la historia clínica del paciente antes de 24 h.</p>
            {!registroOpen ? (
              <button
                onClick={() => setRegistroOpen(true)}
                className="mt-3 h-9 px-3 rounded-md bg-brand-700 text-primary-foreground text-xs font-medium hover:bg-brand-800 inline-flex items-center gap-1.5"
              >
                Iniciar registro
              </button>
            ) : (
              <div className="mt-3 space-y-2">
                <select className="w-full h-9 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none">
                  <option>Paciente afectado…</option>
                  {patients.map((p) => <option key={p.id}>{p.name}</option>)}
                </select>
                <textarea
                  rows={3}
                  placeholder="Descripción del incidente, evaluación de riesgo, conductas observadas…"
                  className="w-full px-3 py-2 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700"
                />
                <div className="flex gap-2">
                  <button onClick={() => { setRegistroOpen(false); onClose(); }} className="h-9 px-3 rounded-md bg-brand-700 text-primary-foreground text-xs font-medium hover:bg-brand-800">
                    Guardar en historia
                  </button>
                  <button onClick={() => setRegistroOpen(false)} className="h-9 px-3 rounded-md border border-line-200 text-xs text-ink-700 hover:border-brand-400">Cancelar</button>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Command palette (⌘K)
// ─────────────────────────────────────────────────────────────

type CmdItem =
  | { kind: "ruta"; label: string; to: string; icon: React.ComponentType<{ className?: string }>; description?: string }
  | { kind: "paciente"; label: string; to: string; params?: { id: string }; description?: string; risk?: import("@/lib/mock-data").Risk }
  | { kind: "cita"; label: string; to: string; description?: string }
  | { kind: "documento"; label: string; to: string; description?: string };

const ROUTE_ITEMS: CmdItem[] = [
  { kind: "ruta", label: "Inicio", to: "/", icon: LayoutDashboard, description: "Dashboard" },
  { kind: "ruta", label: "Agenda", to: "/agenda", icon: CalendarDays, description: "Citas" },
  { kind: "ruta", label: "Pacientes", to: "/pacientes", icon: Users, description: "Lista" },
  { kind: "ruta", label: "Tests psicométricos", to: "/tests", icon: Brain },
  { kind: "ruta", label: "Prescripción", to: "/prescripcion", icon: Pill },
  { kind: "ruta", label: "Documentos", to: "/documentos", icon: FileText },
];

function CommandPalette({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const { data: patients = [] } = useQuery({ queryKey: ["patients"], queryFn: () => api.listPatients() });
  const today = new Date().toISOString().slice(0, 10);
  const { data: appointments = [] } = useQuery({
    queryKey: ["appointments", today],
    queryFn: () => api.listAppointments({ date: today }),
  });
  const { data: documents = [] } = useQuery({ queryKey: ["documents"], queryFn: () => api.listDocuments() });

  const q = query.toLowerCase().trim();

  const routeMatches: CmdItem[] = !q ? ROUTE_ITEMS : ROUTE_ITEMS.filter((r) => r.label.toLowerCase().includes(q));

  const patientMatches: CmdItem[] = patients
    .filter((p) => !q || p.name.toLowerCase().includes(q) || (p.preferredName ?? "").toLowerCase().includes(q) || p.id.toLowerCase().includes(q) || p.reason.toLowerCase().includes(q))
    .slice(0, 6)
    .map((p) => ({
      kind: "paciente" as const,
      label: p.preferredName ? `${p.preferredName} · ${p.name}` : p.name,
      to: "/pacientes/$id",
      params: { id: p.id },
      description: `${p.id} · ${p.reason}`,
      risk: p.risk,
    }));

  const appointmentMatches: CmdItem[] = (appointments as any[])
    .filter((a) => !q || (a.patient_name ?? "").toLowerCase().includes(q) || (a.time ?? "").includes(q))
    .slice(0, 4)
    .map((a) => ({
      kind: "cita" as const,
      label: `${a.time} · ${a.patient_name}`,
      to: "/agenda",
      description: [a.room, a.professional].filter(Boolean).join(" · "),
    }));

  const docMatches: CmdItem[] = (documents as any[])
    .filter((d) => q && (d.name.toLowerCase().includes(q) || (d.patient_name ?? "").toLowerCase().includes(q)))
    .slice(0, 4)
    .map((d) => ({
      kind: "documento" as const,
      label: d.name,
      to: "/documentos",
      description: d.patient_name ?? d.professional,
    }));

  const groups: { title: string; items: CmdItem[] }[] = [
    { title: "Navegación", items: routeMatches },
    { title: "Pacientes", items: patientMatches },
    { title: "Citas de hoy", items: appointmentMatches },
    ...(docMatches.length ? [{ title: "Documentos", items: docMatches }] : []),
  ].filter((g) => g.items.length > 0);

  const flat = groups.flatMap((g) => g.items);

  function go(item: CmdItem) {
    if (item.kind === "paciente" && "params" in item && item.params) {
      navigate({ to: "/pacientes/$id", params: item.params });
    } else {
      navigate({ to: item.to as any });
    }
    onClose();
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(flat.length - 1, c + 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)); }
    if (e.key === "Enter" && flat[cursor]) { e.preventDefault(); go(flat[cursor]); }
  }

  let runningIndex = -1;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink-900/40 backdrop-blur-sm p-4 pt-[12vh]" onClick={onClose}>
      <div className="w-full max-w-xl rounded-2xl bg-surface shadow-modal overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-4 h-12 border-b border-line-100">
          <Search className="h-4 w-4 text-ink-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setCursor(0); }}
            onKeyDown={onKey}
            placeholder="Buscar pacientes, citas, documentos, rutas…"
            className="flex-1 bg-transparent text-sm text-ink-900 placeholder:text-ink-400 outline-none"
          />
          <kbd className="text-[11px] px-1.5 py-0.5 rounded border border-line-200 bg-bg-100 text-ink-500">Esc</kbd>
        </div>
        <div className="max-h-[420px] overflow-y-auto p-2">
          {groups.length === 0 && (
            <div className="px-3 py-8 text-center text-sm text-ink-500">Sin resultados para "{query}"</div>
          )}
          {groups.map((g) => (
            <div key={g.title} className="mb-2">
              <div className="px-3 py-1.5 text-[10px] uppercase tracking-[0.1em] text-ink-500 font-medium">{g.title}</div>
              <ul>
                {g.items.map((it) => {
                  runningIndex++;
                  const idx = runningIndex;
                  const selected = cursor === idx;
                  const Icon = it.kind === "ruta" ? it.icon : it.kind === "paciente" ? Users : it.kind === "cita" ? CalendarDays : FileText;
                  return (
                    <li key={`${it.kind}-${it.label}-${idx}`}>
                      <button
                        onMouseEnter={() => setCursor(idx)}
                        onClick={() => go(it)}
                        className={
                          "w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left transition-colors " +
                          (selected ? "bg-brand-50 text-ink-900" : "hover:bg-bg-100 text-ink-700")
                        }
                      >
                        <div className="h-8 w-8 rounded-md bg-bg-100 text-ink-500 flex items-center justify-center shrink-0">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-ink-900 truncate flex items-center gap-2">
                            {it.label}
                            {it.kind === "paciente" && it.risk && (it.risk === "high" || it.risk === "critical") && <RiskBadge risk={it.risk} compact />}
                          </div>
                          {it.description && <div className="text-xs text-ink-500 truncate">{it.description}</div>}
                        </div>
                        {selected && <ChevronRight className="h-4 w-4 text-brand-700 shrink-0" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
        <footer className="px-3 py-2 border-t border-line-100 bg-bg-100/30 flex items-center justify-between text-[11px] text-ink-500">
          <div className="flex items-center gap-3">
            <span><kbd className="px-1 py-0.5 rounded border border-line-200 bg-surface tabular">↑↓</kbd> navegar</span>
            <span><kbd className="px-1 py-0.5 rounded border border-line-200 bg-surface tabular">↵</kbd> abrir</span>
          </div>
          <span>{flat.length} resultados</span>
        </footer>
      </div>
    </div>
  );
}
