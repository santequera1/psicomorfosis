import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app/AppShell";
import { type Patient, type PatientStatus, type Modality, type Risk, type RiskType } from "@/lib/mock-data";
import { api } from "@/lib/api";
import { useWorkspace } from "@/lib/workspace";
import { RiskBadge } from "@/components/app/RiskBadge";
import { RiskPicker } from "@/components/app/RiskPicker";
import { ViewToggle, usePersistedViewMode } from "@/components/app/ViewToggle";
import { Search, Filter, Download, Plus, ChevronRight, Tag, X, Loader2, AlertCircle, MoreVertical, Edit3, Trash2, Eye, Calendar } from "lucide-react";
import { FaWhatsapp } from "react-icons/fa";
import { whatsappUrl } from "@/lib/display";
import { cn, displayPatientName } from "@/lib/utils";
import { PortalStatusBadge } from "@/components/patients/PortalStatusBadge";
import { AppSelect } from "@/components/app/AppSelect";
import { useAutoTour, patientsTour, TOUR_NAMES } from "@/lib/tours";
import { NewAppointmentModal } from "@/components/app/NewAppointmentModal";
import { NewPatientModal } from "@/components/app/NewPatientModal";
import { TagEditor } from "@/components/app/TagEditor";
import { toast } from "sonner";

export const Route = createFileRoute("/pacientes")({
  head: () => ({
    meta: [
      { title: "Pacientes · Psicomorfosis" },
      { name: "description", content: "Listado de pacientes activos de la clínica." },
    ],
  }),
  component: PatientsPage,
});

const STATUS_STYLE: Record<string, string> = {
  activo:   "bg-success-soft text-success",
  pausa:    "bg-warning-soft text-risk-moderate",
  alta:     "bg-brand-100 text-brand-800",
  derivado: "bg-lavender-100 text-lavender-500",
};

const MODALITY_LABEL: Record<string, string> = {
  individual: "Individual",
  pareja: "Pareja",
  familiar: "Familiar",
  grupal: "Grupal",
  tele: "Telepsicología",
};

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((n) => n[0]).join("").toUpperCase();
}

/**
 * Menú flotante de acciones de paciente. Se renderiza con createPortal
 * en document.body y position: fixed, así nunca queda atrapado por
 * `overflow` de ancestros (la tabla tiene overflow-x-auto que clipa
 * también overflow-y por spec CSS). Auto-flip: si no hay espacio
 * abajo del botón, se abre hacia arriba.
 *
 * Variantes:
 *  - "full" (default): muestra Ver ficha, Editar, Historia, Agendar y
 *    Archivar/Eliminar — usado en tabla y cards.
 *  - "compact": sin "Archivar o eliminar" — usado en la vista de lista
 *    mobile donde el delete vive como botón aparte.
 */
const MENU_HEIGHT_FULL = 240;  // 5 items + separador + padding
const MENU_HEIGHT_COMPACT = 180;
const MENU_WIDTH = 192; // w-48 = 12rem = 192px

function PortaledActionsMenu({
  patient, rect, onClose, onEdit, onAppointment, onRemove, variant = "full",
}: {
  patient: Patient;
  rect: DOMRect;
  onClose: () => void;
  onEdit: () => void;
  onAppointment: () => void;
  onRemove?: () => void;
  variant?: "full" | "compact";
}) {
  const menuHeight = variant === "compact" ? MENU_HEIGHT_COMPACT : MENU_HEIGHT_FULL;
  // Auto-flip vertical: si abajo del botón no caben los ítems del menú
  // sin desbordar el viewport, lo abrimos hacia arriba.
  const spaceBelow = window.innerHeight - rect.bottom;
  const openUp = spaceBelow < menuHeight + 12;
  const top = openUp ? rect.top - menuHeight - 4 : rect.bottom + 4;
  // Alineación derecha del menú con el botón. Si el right del botón
  // está muy cerca del borde izquierdo del viewport (caso extremo),
  // forzamos un mínimo de 8px para no cortar el menú.
  const left = Math.max(8, rect.right - MENU_WIDTH);

  const menuJsx = (
    <>
      {/* Click afuera cierra. Cubre toda la pantalla. */}
      <div
        className="fixed inset-0 z-60"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
      />
      <div
        className="fixed z-61 w-48 rounded-lg border border-line-200 bg-surface shadow-modal py-1"
        style={{ top, left }}
        onClick={(e) => e.stopPropagation()}
      >
        <Link
          to="/pacientes/$id"
          params={{ id: patient.id }}
          className="flex items-center gap-2 px-3 py-2 text-sm text-ink-700 hover:bg-bg-100"
          onClick={onClose}
        >
          <Eye className="h-3.5 w-3.5 text-ink-400" /> Ver ficha completa
        </Link>
        <button
          onClick={() => { onClose(); onEdit(); }}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-ink-700 hover:bg-bg-100 text-left"
        >
          <Edit3 className="h-3.5 w-3.5 text-ink-400" /> Editar paciente
        </button>
        <Link
          to="/historia"
          search={{ id: patient.id }}
          className="flex items-center gap-2 px-3 py-2 text-sm text-ink-700 hover:bg-bg-100"
          onClick={onClose}
        >
          <Tag className="h-3.5 w-3.5 text-ink-400" /> Historia clínica
        </Link>
        <button
          onClick={() => { onClose(); onAppointment(); }}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-ink-700 hover:bg-bg-100 text-left"
        >
          <Calendar className="h-3.5 w-3.5 text-ink-400" /> Agendar cita
        </button>
        {variant === "full" && onRemove && (
          <>
            <div className="my-1 h-px bg-line-100" />
            <button
              onClick={() => { onClose(); onRemove(); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-risk-high hover:bg-error-soft text-left"
            >
              <Trash2 className="h-3.5 w-3.5" /> Archivar o eliminar
            </button>
          </>
        )}
      </div>
    </>
  );

  if (typeof document === "undefined") return null;
  return createPortal(menuJsx, document.body);
}
function avatarTone(name: string) {
  const tones = ["bg-brand-100 text-brand-800", "bg-sage-200 text-sage-700", "bg-lavender-100 text-lavender-500", "bg-warning-soft text-risk-moderate"];
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % tones.length;
  return tones[h];
}

function PatientsPage() {
  // Tour auto-arranca primera vez que el usuario entra acá.
  useAutoTour(TOUR_NAMES.patients, patientsTour);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: workspace } = useWorkspace();
  const isOrg = workspace?.mode === "organization";
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<PatientStatus | "todos">("todos");
  const [modality, setModality] = useState<Modality | "todas">("todas");
  const [riskFilter, setRiskFilter] = useState<Risk | "todos">("todos");
  const [tagFilter, setTagFilter] = useState<string>("todos");
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Patient | null>(null);
  // Estado del menú de acciones de paciente. Antes solo guardaba el id,
  // pero el menú se posicionaba con `absolute` dentro de un contenedor
  // que tiene `overflow-x-auto` (la tabla) — por spec CSS, eso clipa
  // implícitamente el eje Y también, así que cuando el paciente estaba
  // cerca del fondo del scroll, el botón "Eliminar" quedaba oculto.
  // Ahora guardamos el rect del botón para renderizar el menú via
  // portal en document.body con position fixed + auto-flip.
  const [menuOpen, setMenuOpen] = useState<{ id: string; rect: DOMRect } | null>(null);

  // Cerrar el menú si la página hace scroll o cambia de tamaño — el
  // menú no se reposicionará junto con el botón porque está fixed.
  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(null);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [menuOpen]);
  const [removing, setRemoving] = useState<Patient | null>(null);
  const [apptFor, setApptFor] = useState<Patient | null>(null);
  const [viewMode, setViewMode] = usePersistedViewMode("psm.patients.view", "list");
  // En mobile los filtros viven detrás de un botón colapsable para no
  // ocupar tanto espacio. El contador de filtros activos en el botón
  // hace evidente que hay algo aplicado.
  const [filtersOpenMobile, setFiltersOpenMobile] = useState(false);

  const { data: patients = [], isLoading, error } = useQuery({
    queryKey: ["patients"],
    queryFn: () => api.listPatients(),
  });

  // Lista de etiquetas únicas usadas en el workspace para alimentar el filtro.
  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const p of patients) (p.tags ?? []).forEach((t) => set.add(t));
    return Array.from(set).sort();
  }, [patients]);

  const filtered = useMemo(() => patients.filter((p) => {
    if (status !== "todos" && p.status !== status) return false;
    if (modality !== "todas" && p.modality !== modality) return false;
    if (riskFilter !== "todos" && p.risk !== riskFilter) return false;
    if (tagFilter !== "todos" && !(p.tags ?? []).includes(tagFilter)) return false;
    if (query.trim()) {
      const q = query.toLowerCase();
      if (!p.name.toLowerCase().includes(q) && !p.id.toLowerCase().includes(q) && !p.reason.toLowerCase().includes(q) && !p.doc.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [patients, query, status, modality, riskFilter, tagFilter]);

  function exportCSV() {
    if (filtered.length === 0) {
      toast.error("No hay pacientes para exportar con los filtros actuales");
      return;
    }
    const rows: string[][] = [["ID", "Nombre", "Edad", "Motivo", "Profesional", "Modalidad", "Estado", "Riesgo", "Próxima sesión"], ...filtered.map((p) => [p.id, p.name, String(p.age || ""), p.reason, p.professional, p.modality, p.status, p.risk, p.nextSession ?? ""])];
    // Excel detecta UTF-8 s\u00F3lo si encuentra el BOM (0xEF 0xBB 0xBF) al inicio.
    // Codificamos bytes expl\u00EDcitamente v\u00EDa TextEncoder y anteponemos los 3
    // bytes del BOM, en lugar de concatenar "\uFEFF" como string. CRLF para
    // compatibilidad con Excel en Windows.
    const csv = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const utf8 = new TextEncoder().encode(csv);
    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const blob = new Blob([bom, utf8], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `pacientes-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exportados ${filtered.length} paciente${filtered.length === 1 ? "" : "s"} a CSV`);
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-ink-500 flex items-center gap-2">
              {isOrg ? workspace?.name : "Mi consulta"} · {filtered.length} de {patients.length} pacientes
              {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-700" />}
            </p>
            <h1 data-tour="page-title" className="font-serif text-2xl md:text-[32px] leading-tight text-ink-900 mt-1">Pacientes</h1>
          </div>
          <div className="flex gap-2">
            <button onClick={exportCSV} className="h-10 px-3 rounded-lg border border-line-200 bg-surface text-ink-700 text-sm hover:border-brand-400 inline-flex items-center gap-2">
              <Download className="h-4 w-4" /> Exportar
            </button>
            <button data-tour="pacientes-new" onClick={() => setCreateOpen(true)} className="h-10 px-4 rounded-lg bg-brand-700 text-primary-foreground text-sm font-medium hover:bg-brand-800 inline-flex items-center gap-2">
              <Plus className="h-4 w-4" /> Nuevo paciente
            </button>
          </div>
        </header>

        <div className="rounded-xl border border-line-200 bg-surface" data-tour="pacientes-list">
          {/* Buscador siempre full width en mobile, filtros agrupados debajo */}
          <div className="p-3 sm:p-4 space-y-2 border-b border-line-100">
            <div data-tour="pacientes-search" className="flex items-center gap-2 h-10 px-3 rounded-md border border-line-200 bg-bg-100/50">
              <Search className="h-4 w-4 text-ink-400 shrink-0" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar nombre, documento o motivo…"
                className="flex-1 bg-transparent text-sm text-ink-900 placeholder:text-ink-400 outline-none min-w-0"
              />
            </div>
            {/* Botón colapsable solo en mobile. En sm+ los filtros
                se muestran siempre como antes. */}
            {(() => {
              const activeCount = [
                status !== "todos",
                modality !== "todas",
                riskFilter !== "todos",
                tagFilter !== "todos",
              ].filter(Boolean).length;
              return (
                <button
                  type="button"
                  onClick={() => setFiltersOpenMobile((v) => !v)}
                  className="sm:hidden w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-xs text-ink-700 hover:border-brand-400 inline-flex items-center justify-between gap-2"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Filter className="h-3.5 w-3.5 text-ink-400" /> Filtros
                    {activeCount > 0 && (
                      <span className="ml-1 inline-flex items-center justify-center h-4 min-w-4 px-1 text-[10px] rounded-full bg-brand-700 text-white font-medium">
                        {activeCount}
                      </span>
                    )}
                  </span>
                  <span className="text-ink-400">{filtersOpenMobile ? "▲" : "▼"}</span>
                </button>
              );
            })()}
            {/* Filtros: el icon (Filter/Tag) ya no se renderiza junto al
                trigger — AppSelect tiene su propio chevron y el icono visual
                redundante en cada uno saturaba. Si extrañas el icono, lo
                ponemos como prefix del Trigger en el wrapper. */}
            <div data-tour="pacientes-filters" className={cn("grid grid-cols-2 sm:grid-cols-4 gap-2", !filtersOpenMobile && "hidden sm:grid")}>
              <AppSelect
                value={status}
                onChange={(v) => setStatus(v as PatientStatus | "todos")}
                options={[
                  { value: "todos", label: "Estado: todos" },
                  { value: "activo", label: "Activo" },
                  { value: "pausa", label: "Pausa" },
                  { value: "alta", label: "Alta" },
                  { value: "derivado", label: "Derivado" },
                ]}
              />
              <AppSelect
                value={modality}
                onChange={(v) => setModality(v as Modality | "todas")}
                options={[
                  { value: "todas", label: "Modalidad: todas" },
                  { value: "individual", label: "Individual" },
                  { value: "pareja", label: "Pareja" },
                  { value: "familiar", label: "Familiar" },
                  { value: "grupal", label: "Grupal" },
                  { value: "tele", label: "Tele" },
                ]}
              />
              <AppSelect
                value={riskFilter}
                onChange={(v) => setRiskFilter(v as Risk | "todos")}
                options={[
                  { value: "todos", label: "Bandera: todas" },
                  { value: "none", label: "Sin bandera" },
                  { value: "low", label: "Bajo" },
                  { value: "moderate", label: "Moderado" },
                  { value: "high", label: "Alto" },
                  { value: "critical", label: "Crítico" },
                ]}
              />
              <AppSelect
                value={tagFilter}
                onChange={setTagFilter}
                disabled={allTags.length === 0}
                options={[
                  { value: "todos", label: allTags.length === 0 ? "Sin etiquetas" : "Etiqueta: todas" },
                  ...allTags.map((t) => ({ value: t, label: t })),
                ]}
              />
            </div>
            <div className="flex items-center justify-between gap-2 pt-1">
              <span className="text-[11px] text-ink-500 tabular">{filtered.length} paciente{filtered.length === 1 ? "" : "s"}</span>
              <ViewToggle value={viewMode} onChange={setViewMode} modes={["list", "cards"]} />
            </div>
          </div>

          {viewMode === "list" ? (
            <>
          {/* Vista de cards en mobile */}
          <ul className="md:hidden divide-y divide-line-100">
            {filtered.map((p, i) => (
              <li
                key={p.id}
                className="relative animate-in fade-in slide-in-from-left-3 duration-400 fill-mode-backwards"
                style={{ animationDelay: `${Math.min(i * 25, 500)}ms` }}
              >
                <Link to="/pacientes/$id" params={{ id: p.id }} className="flex items-start gap-3 p-3 hover:bg-brand-50/60 transition-colors">
                  <div className={`h-10 w-10 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${avatarTone(p.name)}`}>
                    {initials(displayPatientName(p))}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-ink-900 truncate">
                        {p.name}{p.preferredName ? ` · ${p.preferredName}` : ""}
                      </span>
                    </div>
                    <div className="text-[11px] text-ink-500 truncate tabular mt-0.5">{p.doc} · {p.id}</div>
                    <div className="text-xs text-ink-700 truncate mt-1">{p.reason}</div>
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium capitalize ${STATUS_STYLE[p.status]}`}>
                        {p.status}
                      </span>
                      <RiskBadge risk={p.risk} types={p.riskTypes} compact />
                      <PortalStatusBadge patient={p} size="sm" />
                      <span className="text-[10px] text-ink-400">· {MODALITY_LABEL[p.modality]}</span>
                    </div>
                    {p.nextSession && (
                      <div className="text-[11px] text-brand-700 mt-1 tabular">Próxima: {p.nextSession}</div>
                    )}
                  </div>
                  <button
                    onClick={(e) => {
                      e.preventDefault(); e.stopPropagation();
                      const rect = e.currentTarget.getBoundingClientRect();
                      setMenuOpen(menuOpen?.id === p.id ? null : { id: p.id, rect });
                    }}
                    className="h-8 w-8 rounded-md text-ink-500 hover:bg-bg-100 inline-flex items-center justify-center shrink-0"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </button>
                </Link>
                {menuOpen?.id === p.id && (
                  <PortaledActionsMenu
                    patient={p}
                    rect={menuOpen.rect}
                    onClose={() => setMenuOpen(null)}
                    onEdit={() => setEditing(p)}
                    onAppointment={() => setApptFor(p)}
                    onRemove={() => setRemoving(p)}
                  />
                )}
              </li>
            ))}
          </ul>

          {/* Vista de tabla solo en desktop */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-[0.08em] text-ink-500 bg-bg-100/50 border-b border-line-100">
                  <th className="px-5 py-3 font-medium">Paciente</th>
                  <th className="px-3 py-3 font-medium">Edad</th>
                  <th className="px-3 py-3 font-medium">Motivo</th>
                  {isOrg && <th className="px-3 py-3 font-medium">Profesional</th>}
                  <th className="px-3 py-3 font-medium">Modalidad</th>
                  <th className="px-3 py-3 font-medium">Estado</th>
                  <th className="px-3 py-3 font-medium">Bandera</th>
                  <th className="px-3 py-3 font-medium">Próxima sesión</th>
                  <th className="px-3 py-3 font-medium w-10"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p, i) => (
                  <tr
                    key={p.id}
                    onClick={() => navigate({ to: "/pacientes/$id", params: { id: p.id } })}
                    className="border-b border-line-100 last:border-0 hover:bg-brand-50/60 transition-colors group cursor-pointer animate-in fade-in slide-in-from-left-3 duration-400 fill-mode-backwards"
                    style={{ animationDelay: `${Math.min(i * 25, 500)}ms` }}
                  >
                    <td className="px-5 py-3.5">
                      <Link to="/pacientes/$id" params={{ id: p.id }} className="flex items-center gap-3">
                        <div className={`h-9 w-9 rounded-full flex items-center justify-center text-xs font-semibold ${avatarTone(p.name)}`}>
                          {initials(displayPatientName(p))}
                        </div>
                        <div className="min-w-0">
                          <div className="text-ink-900 font-medium truncate flex items-center gap-1.5">
                            {p.name}{p.preferredName ? ` · ${p.preferredName}` : ""}
                            {p.pronouns && p.pronouns !== "—" && <span className="text-[10px] text-ink-400 font-normal">({p.pronouns})</span>}
                          </div>
                          <div className="text-[11px] text-ink-500 truncate tabular flex items-center gap-2">
                            <span>{p.doc} · {p.id}</span>
                            <PortalStatusBadge patient={p} size="sm" />
                          </div>
                        </div>
                      </Link>
                    </td>
                    <td className="px-3 py-3.5 text-ink-700 tabular">{p.age || "—"}</td>
                    <td className="px-3 py-3.5 text-ink-700 max-w-[220px] truncate">{p.reason}</td>
                    {isOrg && <td className="px-3 py-3.5 text-ink-700">{p.professional}</td>}
                    <td className="px-3 py-3.5 text-ink-700">{MODALITY_LABEL[p.modality]}</td>
                    <td className="px-3 py-3.5">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium capitalize ${STATUS_STYLE[p.status]}`}>
                        {p.status}
                      </span>
                    </td>
                    {/* Bandera: en la tabla mostramos solo el nivel de riesgo
                        (sin la lista de tipos) para que no se desborde. Los
                        tipos completos aparecen en la vista de tarjetas y en
                        la ficha del paciente, además del title del propio badge. */}
                    <td className="px-3 py-3.5"><RiskBadge risk={p.risk} compact /></td>
                    <td className="px-3 py-3.5 text-ink-700 tabular">{p.nextSession ?? <span className="text-ink-400">—</span>}</td>
                    <td className="px-3 py-3.5 relative" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-0.5">
                        {(() => {
                          const wa = whatsappUrl(p.phone);
                          return wa ? (
                            <a
                              href={wa} target="_blank" rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              title={`WhatsApp ${p.phone}`}
                              className="h-7 w-7 rounded-md hover:bg-sage-200/30 text-sage-500 hover:text-sage-700 inline-flex items-center justify-center"
                            >
                              <FaWhatsapp className="h-3.5 w-3.5" />
                            </a>
                          ) : null;
                        })()}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const rect = e.currentTarget.getBoundingClientRect();
                            setMenuOpen(menuOpen?.id === p.id ? null : { id: p.id, rect });
                          }}
                          className="h-7 w-7 rounded-md hover:bg-bg-100 text-ink-500 inline-flex items-center justify-center"
                          aria-label="Acciones"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>
                      </div>
                      {menuOpen?.id === p.id && (
                        <PortaledActionsMenu
                          patient={p}
                          rect={menuOpen.rect}
                          onClose={() => setMenuOpen(null)}
                          onEdit={() => setEditing(p)}
                          onAppointment={() => setApptFor(p)}
                          onRemove={() => setRemoving(p)}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
            </>
          ) : (
            /* viewMode === "cards": grid de tarjetas grandes en cualquier viewport */
            <div className="p-3 sm:p-4">
              {filtered.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                  {filtered.map((p, i) => (
                    <div
                      key={p.id}
                      className="animate-in fade-in slide-in-from-left-3 duration-400 fill-mode-backwards"
                      style={{ animationDelay: `${Math.min(i * 30, 500)}ms` }}
                    >
                      <PatientCard
                        patient={p}
                        onEdit={() => setEditing(p)}
                        onRemove={() => setRemoving(p)}
                        onSchedule={() => setApptFor(p)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="p-10 text-center">
              <AlertCircle className="h-6 w-6 text-risk-high mx-auto mb-2" />
              <p className="text-sm text-ink-700">No se pudo cargar desde el backend.</p>
              <p className="text-xs text-ink-500 mt-1">¿Está corriendo el servidor en <code className="font-mono">{api.base}</code>?</p>
            </div>
          )}
          {!isLoading && !error && filtered.length === 0 && patients.length === 0 && (
            // Empty state grande para cuentas nuevas — primer onboarding.
            // Distinto del "sin coincidencias por filtros" porque para una
            // cuenta sin nada el mensaje "filtros" confunde.
            <div className="px-6 py-12 sm:py-16 text-center">
              <div className="h-16 w-16 mx-auto rounded-full bg-brand-50 flex items-center justify-center mb-5 border-2 border-brand-100">
                <Plus className="h-7 w-7 text-brand-700" />
              </div>
              <h3 className="font-serif text-xl text-ink-900 mb-2">
                Aún no tienes pacientes registrados
              </h3>
              <p className="text-sm text-ink-500 max-w-md mx-auto mb-6 leading-relaxed">
                Crea tu primer paciente para empezar a agendar citas, registrar sesiones, aplicar tests y enviar documentos para firma. Toma menos de un minuto.
              </p>
              <button
                onClick={() => setCreateOpen(true)}
                className="h-11 px-5 rounded-lg bg-brand-700 text-white text-sm font-medium hover:bg-brand-800 inline-flex items-center gap-2"
              >
                <Plus className="h-4 w-4" /> Crear mi primer paciente
              </button>
            </div>
          )}
          {!isLoading && !error && filtered.length === 0 && patients.length > 0 && (
            <div className="p-10 text-center text-sm text-ink-500">Sin pacientes que coincidan con los filtros aplicados.</div>
          )}

          <div className="px-5 py-3 flex items-center justify-between text-xs text-ink-500 border-t border-line-100">
            <div className="flex items-center gap-2">
              <Tag className="h-3.5 w-3.5" />
              Mostrando {filtered.length} de {patients.length}
            </div>
            <div className="flex items-center gap-1">
              <button className="px-2 py-1 rounded hover:bg-bg-100">Anterior</button>
              <span className="px-2 py-1 rounded bg-brand-100 text-brand-800 font-medium tabular">1</span>
              <button className="px-2 py-1 rounded hover:bg-bg-100">Siguiente</button>
            </div>
          </div>
        </div>
      </div>

      {createOpen && <NewPatientModal onClose={() => setCreateOpen(false)} />}
      {editing && <EditPatientModal patient={editing} onClose={() => setEditing(null)} />}
      {removing && <ArchiveOrDeleteModal patient={removing} onClose={() => setRemoving(null)} />}
      {apptFor && <NewAppointmentModal patients={patients as any} prefilledPatient={apptFor as any} onClose={() => setApptFor(null)} />}
    </AppShell>
  );
}

// ─── Vista de tarjetas: PatientCard ─────────────────────────────────────────
function PatientCard({ patient: p, onEdit, onRemove, onSchedule }: {
  patient: Patient;
  onEdit: () => void;
  onRemove: () => void;
  onSchedule: () => void;
}) {
  // Estado del menú: guarda el rect del botón para que el menú portaleado
  // pueda posicionarse junto a él. Si está cerrado, null.
  const [menu, setMenu] = useState<{ rect: DOMRect } | null>(null);
  const wa = whatsappUrl(p.phone);

  // Cerrar el menú si la página hace scroll o cambia de tamaño — el menú
  // es position fixed, no se reposicionará junto con el botón.
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [menu]);
  return (
    <div className="rounded-xl border border-line-200 bg-surface p-4 hover:border-brand-400/60 hover:shadow-sm transition-all relative group">
      <Link to="/pacientes/$id" params={{ id: p.id }} className="block">
        <div className="flex items-start gap-3">
          <div className={`h-12 w-12 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 ${avatarTone(p.name)}`}>
            {initials(displayPatientName(p))}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-ink-900 truncate">
              {p.name}{p.preferredName ? ` · ${p.preferredName}` : ""}
            </div>
            <div className="text-[11px] text-ink-500 tabular truncate">{p.doc} · {p.id}</div>
          </div>
        </div>
        <div className="mt-3 text-xs text-ink-700 line-clamp-2">{p.reason || <span className="text-ink-400">Sin motivo registrado</span>}</div>
        <div className="mt-3 flex items-center gap-1.5 flex-wrap">
          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium capitalize ${STATUS_STYLE[p.status]}`}>
            {p.status}
          </span>
          <RiskBadge risk={p.risk} types={p.riskTypes} compact />
          <span className="text-[10px] text-ink-500">· {MODALITY_LABEL[p.modality]}</span>
        </div>
        <div className="mt-3 pt-3 border-t border-line-100 text-[11px] flex items-center justify-between gap-2">
          <span className="text-ink-500 truncate">{p.professional}</span>
          <span className="tabular shrink-0 text-brand-700">{p.nextSession ?? <span className="text-ink-400">—</span>}</span>
        </div>
      </Link>
      <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {wa && (
          <a href={wa} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
            className="h-7 w-7 rounded-md bg-surface border border-line-200 text-ink-500 hover:border-brand-400 flex items-center justify-center"
            title="WhatsApp"
          >
            <FaWhatsapp className="h-3.5 w-3.5" />
          </a>
        )}
        <button
          onClick={(e) => {
            e.preventDefault(); e.stopPropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            setMenu(menu ? null : { rect });
          }}
          className="h-7 w-7 rounded-md bg-surface border border-line-200 text-ink-500 hover:border-brand-400 flex items-center justify-center"
          title="Más"
        >
          <MoreVertical className="h-3.5 w-3.5" />
        </button>
        {menu && (
          <PortaledActionsMenu
            patient={p}
            rect={menu.rect}
            onClose={() => setMenu(null)}
            onEdit={onEdit}
            onAppointment={onSchedule}
            onRemove={onRemove}
          />
        )}
      </div>
    </div>
  );
}

function ArchiveOrDeleteModal({ patient, onClose }: { patient: Patient; onClose: () => void }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<"archive" | "delete">("archive");
  const [confirmText, setConfirmText] = useState("");

  const archiveMu = useMutation({
    mutationFn: () => api.archivePatient(patient.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["patients"] });
      qc.invalidateQueries({ queryKey: ["workspace"] });
      onClose();
    },
  });
  const deleteMu = useMutation({
    mutationFn: () => api.deletePatient(patient.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["patients"] });
      qc.invalidateQueries({ queryKey: ["workspace"] });
      onClose();
    },
  });

  const expectedConfirmation = displayPatientName(patient);
  const canDelete = confirmText.trim() === expectedConfirmation;
  const isPending = archiveMu.isPending || deleteMu.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-surface shadow-modal overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <header className="p-5 border-b border-line-100 flex items-start justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-risk-high font-medium">Acción destructiva</p>
            <h3 className="font-serif text-xl text-ink-900 mt-0.5">Archivar o eliminar · {displayPatientName(patient)}</h3>
            <p className="text-xs text-ink-500 mt-1">Las historias clínicas deben conservarse mínimo 15 años (Res. 1995/1999). Se recomienda archivar.</p>
          </div>
          <button onClick={onClose} className="h-9 w-9 rounded-md border border-line-200 text-ink-500 hover:border-brand-400 flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="p-5 space-y-3">
          <button
            onClick={() => setMode("archive")}
            className={
              "w-full text-left p-4 rounded-lg border-2 transition-colors " +
              (mode === "archive" ? "border-brand-700 bg-brand-50/60" : "border-line-200 hover:border-brand-400")
            }
          >
            <div className="flex items-start gap-3">
              <div className={"h-9 w-9 rounded-lg flex items-center justify-center shrink-0 " + (mode === "archive" ? "bg-brand-700 text-primary-foreground" : "bg-bg-100 text-ink-500")}>
                <Tag className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-medium text-ink-900">Archivar (recomendado)</div>
                <p className="text-xs text-ink-500 mt-1">
                  El paciente deja de aparecer en listados activos pero su historia clínica, notas, tests, documentos y
                  facturas se conservan. Se puede restaurar en cualquier momento. Cumple con la normativa colombiana.
                </p>
              </div>
            </div>
          </button>

          <button
            onClick={() => setMode("delete")}
            className={
              "w-full text-left p-4 rounded-lg border-2 transition-colors " +
              (mode === "delete" ? "border-risk-high bg-error-soft/40" : "border-line-200 hover:border-risk-high/40")
            }
          >
            <div className="flex items-start gap-3">
              <div className={"h-9 w-9 rounded-lg flex items-center justify-center shrink-0 " + (mode === "delete" ? "bg-risk-high text-primary-foreground" : "bg-bg-100 text-ink-500")}>
                <Trash2 className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-medium text-ink-900">Eliminar permanentemente</div>
                <p className="text-xs text-ink-500 mt-1">
                  Elimina al paciente y toda su información clínica asociada (tests, tareas, documentos, historia).
                  Esta acción no se puede deshacer y puede tener implicaciones legales.
                </p>
              </div>
            </div>
          </button>

          {mode === "delete" && (
            <div className="rounded-lg border border-risk-high/30 bg-error-soft p-3">
              <p className="text-xs text-ink-700 mb-2">
                Para confirmar, escribe <strong className="text-risk-high">{expectedConfirmation}</strong> abajo:
              </p>
              <input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={expectedConfirmation}
                className="w-full h-10 px-3 rounded-md border border-risk-high/40 bg-surface text-sm outline-none focus:border-risk-high"
              />
            </div>
          )}
        </div>

        <footer className="p-4 border-t border-line-100 bg-bg-100/30 flex justify-end gap-2">
          <button onClick={onClose} className="h-9 px-3 rounded-md border border-line-200 text-sm text-ink-700 hover:border-brand-400">Cancelar</button>
          {mode === "archive" ? (
            <button
              onClick={() => archiveMu.mutate()}
              disabled={isPending}
              className="h-9 px-4 rounded-md bg-brand-700 text-primary-foreground text-sm font-medium hover:bg-brand-800 disabled:opacity-60 inline-flex items-center gap-2"
            >
              {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Archivar paciente
            </button>
          ) : (
            <button
              onClick={() => deleteMu.mutate()}
              disabled={isPending || !canDelete}
              className="h-9 px-4 rounded-md bg-risk-high text-primary-foreground text-sm font-medium hover:bg-risk-critical disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
            >
              {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Eliminar permanentemente
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

function EditPatientModal({ patient, onClose }: { patient: Patient; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<Partial<Patient> & { sex?: "" | "M" | "F" }>({
    name: patient.name,
    preferredName: patient.preferredName,
    pronouns: patient.pronouns,
    doc: patient.doc,
    age: patient.age,
    phone: patient.phone,
    email: patient.email,
    address: patient.address ?? "",
    sex: ((patient as any).sex ?? "") as "" | "M" | "F",
    professional: patient.professional,
    modality: patient.modality,
    status: patient.status,
    reason: patient.reason,
    risk: patient.risk,
    riskTypes: patient.riskTypes ?? [],
    tags: patient.tags ?? [],
  });
  const [err, setErr] = useState<string | null>(null);

  // Sugerencias: tags ya usadas en cualquier paciente del workspace.
  const { data: allPatients = [] } = useQuery({ queryKey: ["patients"], queryFn: () => api.listPatients() });
  const tagSuggestions = useMemo(() => {
    const set = new Set<string>();
    for (const p of allPatients) (p.tags ?? []).forEach((t) => set.add(t));
    return Array.from(set).sort();
  }, [allPatients]);

  const mu = useMutation({
    mutationFn: (body: Partial<Patient>) => api.updatePatient(patient.id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["patients"] });
      qc.invalidateQueries({ queryKey: ["patient", patient.id] });
      onClose();
    },
    onError: (e: Error) => setErr(e.message),
  });

  function update<K extends keyof Patient>(k: K, v: Patient[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink-900/40 backdrop-blur-sm pt-16 p-4 overflow-y-auto" onClick={onClose}>
      <form
        onSubmit={(e) => { e.preventDefault(); setErr(null); mu.mutate({ ...form, sex: form.sex || undefined } as any); }}
        className="w-full max-w-xl rounded-2xl bg-surface shadow-modal overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="p-5 border-b border-line-100 flex items-start justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-brand-800 font-medium">Pacientes · {patient.id}</p>
            <h3 className="font-serif text-xl text-ink-900 mt-0.5">Editar paciente</h3>
          </div>
          <button type="button" onClick={onClose} className="h-9 w-9 rounded-md border border-line-200 text-ink-500 hover:border-brand-400 flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="p-5 space-y-3">
          <Labeled label="Nombre completo">
            <input value={form.name ?? ""} onChange={(e) => update("name", e.target.value)} className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700" />
          </Labeled>
          <div className="grid grid-cols-2 gap-3">
            <Labeled label="Nombre preferido">
              <input value={form.preferredName ?? ""} onChange={(e) => update("preferredName", e.target.value)} className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700" />
            </Labeled>
            <Labeled label="Pronombres">
              <AppSelect
                value={form.pronouns ?? "ella"}
                onChange={(v) => update("pronouns", v)}
                className="mt-1"
                options={[
                  { value: "ella", label: "ella" },
                  { value: "él", label: "él" },
                  { value: "elle", label: "elle" },
                  { value: "—", label: "—" },
                ]}
              />
            </Labeled>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Labeled label="Documento">
              <input value={form.doc ?? ""} onChange={(e) => update("doc", e.target.value)} className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700 tabular" />
            </Labeled>
            <Labeled label="Edad">
              <input type="number" value={form.age ?? 0} onChange={(e) => update("age", Number(e.target.value))} className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700 tabular" />
            </Labeled>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Labeled label="Teléfono">
              <input value={form.phone ?? ""} onChange={(e) => update("phone", e.target.value)} className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700" />
            </Labeled>
            <Labeled label="Correo">
              <input type="email" value={form.email ?? ""} onChange={(e) => update("email", e.target.value)} className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700" />
            </Labeled>
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <Labeled label="Dirección">
              <input value={form.address ?? ""} onChange={(e) => update("address", e.target.value)} placeholder="Cra 11 # 82-32, Chapinero, Bogotá" className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700" />
            </Labeled>
            <Labeled label="Sexo al nacer">
              <AppSelect
                value={form.sex ?? ""}
                onChange={(v) => setForm((p) => ({ ...p, sex: v as "" | "M" | "F" }))}
                className="mt-1"
                aria-label="Sexo al nacer — dato clínico separado de pronombres"
                options={[
                  { value: "", label: "—" },
                  { value: "F", label: "Femenino" },
                  { value: "M", label: "Masculino" },
                ]}
              />
            </Labeled>
          </div>
          <Labeled label="Motivo de consulta">
            <textarea rows={2} value={form.reason ?? ""} onChange={(e) => update("reason", e.target.value)} className="mt-1 w-full px-3 py-2 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700" />
          </Labeled>
          <div className="grid grid-cols-2 gap-3">
            <Labeled label="Modalidad">
              <AppSelect
                value={form.modality ?? "individual"}
                onChange={(v) => update("modality", v as Modality)}
                className="mt-1"
                options={[
                  { value: "individual", label: "Individual" },
                  { value: "pareja", label: "Pareja" },
                  { value: "familiar", label: "Familiar" },
                  { value: "grupal", label: "Grupal" },
                  { value: "tele", label: "Telepsicología" },
                ]}
              />
            </Labeled>
            <Labeled label="Estado">
              <AppSelect
                value={form.status ?? "activo"}
                onChange={(v) => update("status", v as PatientStatus)}
                className="mt-1"
                options={[
                  { value: "activo", label: "Activo" },
                  { value: "pausa", label: "Pausa" },
                  { value: "alta", label: "Alta" },
                  { value: "derivado", label: "Derivado" },
                ]}
              />
            </Labeled>
          </div>

          <div className="rounded-lg border border-line-200 bg-bg-100/30 p-3.5">
            <RiskPicker
              level={(form.risk ?? "none") as Risk}
              types={(form.riskTypes ?? []) as RiskType[]}
              onLevelChange={(r) => update("risk", r)}
              onTypesChange={(t) => update("riskTypes", t as Patient["riskTypes"])}
            />
          </div>

          <Labeled label="Etiquetas">
            <div className="mt-1">
              <TagEditor
                value={form.tags ?? []}
                onChange={(t) => update("tags", t as Patient["tags"])}
                suggestions={tagSuggestions}
              />
            </div>
          </Labeled>
        </div>

        {err && (
          <div className="mx-5 mb-3 rounded-md border border-risk-high/30 bg-error-soft p-3 text-xs text-ink-700 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-risk-high shrink-0 mt-0.5" /> {err}
          </div>
        )}

        <footer className="p-4 border-t border-line-100 bg-bg-100/30 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-9 px-3 rounded-md border border-line-200 text-sm text-ink-700 hover:border-brand-400">Cancelar</button>
          <button type="submit" disabled={mu.isPending} className="h-9 px-4 rounded-md bg-brand-700 text-primary-foreground text-sm font-medium hover:bg-brand-800 disabled:opacity-60 inline-flex items-center gap-2">
            {mu.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Guardar cambios
          </button>
        </footer>
      </form>
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">{label}</span>
      {children}
    </label>
  );
}
