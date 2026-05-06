import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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
function avatarTone(name: string) {
  const tones = ["bg-brand-100 text-brand-800", "bg-sage-200 text-sage-700", "bg-lavender-100 text-lavender-500", "bg-warning-soft text-risk-moderate"];
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % tones.length;
  return tones[h];
}

function PatientsPage() {
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
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Patient | null>(null);
  const [apptFor, setApptFor] = useState<Patient | null>(null);
  const [viewMode, setViewMode] = usePersistedViewMode("psm.patients.view", "list");

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
            <h1 className="font-serif text-2xl md:text-[32px] leading-tight text-ink-900 mt-1">Pacientes</h1>
          </div>
          <div className="flex gap-2">
            <button onClick={exportCSV} className="h-10 px-3 rounded-lg border border-line-200 bg-surface text-ink-700 text-sm hover:border-brand-400 inline-flex items-center gap-2">
              <Download className="h-4 w-4" /> Exportar
            </button>
            <button onClick={() => setCreateOpen(true)} className="h-10 px-4 rounded-lg bg-brand-700 text-primary-foreground text-sm font-medium hover:bg-brand-800 inline-flex items-center gap-2">
              <Plus className="h-4 w-4" /> Nuevo paciente
            </button>
          </div>
        </header>

        <div className="rounded-xl border border-line-200 bg-surface">
          {/* Buscador siempre full width en mobile, filtros agrupados debajo */}
          <div className="p-3 sm:p-4 space-y-2 border-b border-line-100">
            <div className="flex items-center gap-2 h-10 px-3 rounded-md border border-line-200 bg-bg-100/50">
              <Search className="h-4 w-4 text-ink-400 shrink-0" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar nombre, documento o motivo…"
                className="flex-1 bg-transparent text-sm text-ink-900 placeholder:text-ink-400 outline-none min-w-0"
              />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="relative flex items-center gap-1.5 h-10 px-2 sm:px-3 rounded-md border border-line-200 bg-surface text-xs text-ink-700 hover:border-brand-400 min-w-0">
                <Filter className="h-3.5 w-3.5 text-ink-400 shrink-0" />
                <select value={status} onChange={(e) => setStatus(e.target.value as PatientStatus | "todos")} className="bg-transparent outline-none cursor-pointer capitalize min-w-0 flex-1">
                  <option value="todos">Estado</option>
                  <option value="activo">Activo</option>
                  <option value="pausa">Pausa</option>
                  <option value="alta">Alta</option>
                  <option value="derivado">Derivado</option>
                </select>
              </div>
              <div className="relative flex items-center gap-1.5 h-10 px-2 sm:px-3 rounded-md border border-line-200 bg-surface text-xs text-ink-700 hover:border-brand-400 min-w-0">
                <Filter className="h-3.5 w-3.5 text-ink-400 shrink-0" />
                <select value={modality} onChange={(e) => setModality(e.target.value as Modality | "todas")} className="bg-transparent outline-none cursor-pointer capitalize min-w-0 flex-1">
                  <option value="todas">Modalidad</option>
                  <option value="individual">Individual</option>
                  <option value="pareja">Pareja</option>
                  <option value="familiar">Familiar</option>
                  <option value="grupal">Grupal</option>
                  <option value="tele">Tele</option>
                </select>
              </div>
              <div className="relative flex items-center gap-1.5 h-10 px-2 sm:px-3 rounded-md border border-line-200 bg-surface text-xs text-ink-700 hover:border-brand-400 min-w-0">
                <Filter className="h-3.5 w-3.5 text-ink-400 shrink-0" />
                <select value={riskFilter} onChange={(e) => setRiskFilter(e.target.value as Risk | "todos")} className="bg-transparent outline-none cursor-pointer capitalize min-w-0 flex-1">
                  <option value="todos">Bandera</option>
                  <option value="none">Sin bandera</option>
                  <option value="low">Bajo</option>
                  <option value="moderate">Moderado</option>
                  <option value="high">Alto</option>
                  <option value="critical">Crítico</option>
                </select>
              </div>
              <div className="relative flex items-center gap-1.5 h-10 px-2 sm:px-3 rounded-md border border-line-200 bg-surface text-xs text-ink-700 hover:border-brand-400 min-w-0">
                <Tag className="h-3.5 w-3.5 text-ink-400 shrink-0" />
                <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} className="bg-transparent outline-none cursor-pointer min-w-0 flex-1" disabled={allTags.length === 0}>
                  <option value="todos">{allTags.length === 0 ? "Sin etiquetas" : "Etiqueta"}</option>
                  {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
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
            {filtered.map((p) => (
              <li key={p.id} className="relative">
                <Link to="/pacientes/$id" params={{ id: p.id }} className="flex items-start gap-3 p-3 hover:bg-brand-50/60 transition-colors">
                  <div className={`h-10 w-10 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${avatarTone(p.name)}`}>
                    {initials(p.preferredName ?? p.name)}
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
                      <span className="text-[10px] text-ink-400">· {MODALITY_LABEL[p.modality]}</span>
                    </div>
                    {p.nextSession && (
                      <div className="text-[11px] text-brand-700 mt-1 tabular">Próxima: {p.nextSession}</div>
                    )}
                  </div>
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpen(menuOpen === p.id ? null : p.id); }}
                    className="h-8 w-8 rounded-md text-ink-500 hover:bg-bg-100 inline-flex items-center justify-center shrink-0"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </button>
                </Link>
                {menuOpen === p.id && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={(e) => { e.stopPropagation(); setMenuOpen(null); }} />
                    <div className="absolute right-3 top-10 z-40 w-48 rounded-lg border border-line-200 bg-surface shadow-modal py-1">
                      <Link to="/pacientes/$id" params={{ id: p.id }} className="flex items-center gap-2 px-3 py-2 text-sm text-ink-700 hover:bg-bg-100" onClick={() => setMenuOpen(null)}>
                        <Eye className="h-3.5 w-3.5 text-ink-400" /> Ver ficha
                      </Link>
                      <button onClick={(e) => { e.stopPropagation(); setEditing(p); setMenuOpen(null); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-ink-700 hover:bg-bg-100 text-left">
                        <Edit3 className="h-3.5 w-3.5 text-ink-400" /> Editar
                      </button>
                      <Link to="/historia" search={{ id: p.id }} className="flex items-center gap-2 px-3 py-2 text-sm text-ink-700 hover:bg-bg-100" onClick={() => setMenuOpen(null)}>
                        <Tag className="h-3.5 w-3.5 text-ink-400" /> Historia
                      </Link>
                      <button onClick={(e) => { e.stopPropagation(); setApptFor(p); setMenuOpen(null); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-ink-700 hover:bg-bg-100 text-left">
                        <Calendar className="h-3.5 w-3.5 text-ink-400" /> Agendar cita
                      </button>
                      <div className="my-1 h-px bg-line-100" />
                      <button onClick={(e) => { e.stopPropagation(); setRemoving(p); setMenuOpen(null); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-risk-high hover:bg-error-soft text-left">
                        <Trash2 className="h-3.5 w-3.5" /> Archivar o eliminar
                      </button>
                    </div>
                  </>
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
                {filtered.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => navigate({ to: "/pacientes/$id", params: { id: p.id } })}
                    className="border-b border-line-100 last:border-0 hover:bg-brand-50/60 transition-colors group cursor-pointer"
                  >
                    <td className="px-5 py-3.5">
                      <Link to="/pacientes/$id" params={{ id: p.id }} className="flex items-center gap-3">
                        <div className={`h-9 w-9 rounded-full flex items-center justify-center text-xs font-semibold ${avatarTone(p.name)}`}>
                          {initials(p.preferredName ?? p.name)}
                        </div>
                        <div className="min-w-0">
                          <div className="text-ink-900 font-medium truncate flex items-center gap-1.5">
                            {p.name}{p.preferredName ? ` · ${p.preferredName}` : ""}
                            {p.pronouns && p.pronouns !== "—" && <span className="text-[10px] text-ink-400 font-normal">({p.pronouns})</span>}
                          </div>
                          <div className="text-[11px] text-ink-500 truncate tabular">{p.doc} · {p.id}</div>
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
                          onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === p.id ? null : p.id); }}
                          className="h-7 w-7 rounded-md hover:bg-bg-100 text-ink-500 inline-flex items-center justify-center"
                          aria-label="Acciones"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>
                      </div>
                      {menuOpen === p.id && (
                        <>
                          <div className="fixed inset-0 z-30" onClick={(e) => { e.stopPropagation(); setMenuOpen(null); }} />
                          <div className="absolute right-2 top-10 z-40 w-48 rounded-lg border border-line-200 bg-surface shadow-modal py-1">
                            <Link
                              to="/pacientes/$id"
                              params={{ id: p.id }}
                              className="flex items-center gap-2 px-3 py-2 text-sm text-ink-700 hover:bg-bg-100"
                              onClick={() => setMenuOpen(null)}
                            >
                              <Eye className="h-3.5 w-3.5 text-ink-400" /> Ver ficha completa
                            </Link>
                            <button
                              onClick={(e) => { e.stopPropagation(); setEditing(p); setMenuOpen(null); }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-ink-700 hover:bg-bg-100 text-left"
                            >
                              <Edit3 className="h-3.5 w-3.5 text-ink-400" /> Editar paciente
                            </button>
                            <Link
                              to="/historia"
                              search={{ id: p.id }}
                              className="flex items-center gap-2 px-3 py-2 text-sm text-ink-700 hover:bg-bg-100"
                              onClick={() => setMenuOpen(null)}
                            >
                              <Tag className="h-3.5 w-3.5 text-ink-400" /> Historia clínica
                            </Link>
                            <button
                              onClick={(e) => { e.stopPropagation(); setApptFor(p); setMenuOpen(null); }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-ink-700 hover:bg-bg-100 text-left"
                            >
                              <Calendar className="h-3.5 w-3.5 text-ink-400" /> Agendar cita
                            </button>
                            <div className="my-1 h-px bg-line-100" />
                            <button
                              onClick={(e) => { e.stopPropagation(); setRemoving(p); setMenuOpen(null); }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-risk-high hover:bg-error-soft text-left"
                            >
                              <Trash2 className="h-3.5 w-3.5" /> Archivar o eliminar
                            </button>
                          </div>
                        </>
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
                  {filtered.map((p) => (
                    <PatientCard
                      key={p.id}
                      patient={p}
                      onEdit={() => setEditing(p)}
                      onRemove={() => setRemoving(p)}
                      onSchedule={() => setApptFor(p)}
                    />
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
          {!isLoading && !error && filtered.length === 0 && (
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
  const [menu, setMenu] = useState(false);
  const wa = whatsappUrl(p.phone);
  return (
    <div className="rounded-xl border border-line-200 bg-surface p-4 hover:border-brand-400/60 hover:shadow-sm transition-all relative group">
      <Link to="/pacientes/$id" params={{ id: p.id }} className="block">
        <div className="flex items-start gap-3">
          <div className={`h-12 w-12 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 ${avatarTone(p.name)}`}>
            {initials(p.preferredName ?? p.name)}
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
        <div className="relative">
          <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenu((v) => !v); }}
            className="h-7 w-7 rounded-md bg-surface border border-line-200 text-ink-500 hover:border-brand-400 flex items-center justify-center"
            title="Más"
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </button>
          {menu && (
            <>
              <div className="fixed inset-0 z-30" onClick={(e) => { e.stopPropagation(); setMenu(false); }} />
              <div className="absolute right-0 top-full mt-1 z-40 w-44 rounded-lg border border-line-200 bg-surface shadow-modal py-1"
                onClick={(e) => e.stopPropagation()}>
                <Link to="/pacientes/$id" params={{ id: p.id }} className="flex items-center gap-2 px-3 py-2 text-sm text-ink-700 hover:bg-bg-100" onClick={() => setMenu(false)}>
                  <Eye className="h-3.5 w-3.5 text-ink-400" /> Ver ficha
                </Link>
                <button onClick={() => { setMenu(false); onEdit(); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-ink-700 hover:bg-bg-100 text-left">
                  <Edit3 className="h-3.5 w-3.5 text-ink-400" /> Editar
                </button>
                <Link to="/historia" search={{ id: p.id }} className="flex items-center gap-2 px-3 py-2 text-sm text-ink-700 hover:bg-bg-100" onClick={() => setMenu(false)}>
                  <Tag className="h-3.5 w-3.5 text-ink-400" /> Historia
                </Link>
                <button onClick={() => { setMenu(false); onSchedule(); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-ink-700 hover:bg-bg-100 text-left">
                  <Calendar className="h-3.5 w-3.5 text-ink-400" /> Agendar cita
                </button>
                <div className="my-1 h-px bg-line-100" />
                <button onClick={() => { setMenu(false); onRemove(); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-risk-high hover:bg-error-soft text-left">
                  <Trash2 className="h-3.5 w-3.5" /> Archivar o eliminar
                </button>
              </div>
            </>
          )}
        </div>
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

  const expectedConfirmation = patient.preferredName ?? patient.name;
  const canDelete = confirmText.trim() === expectedConfirmation;
  const isPending = archiveMu.isPending || deleteMu.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-surface shadow-modal" onClick={(e) => e.stopPropagation()}>
        <header className="p-5 border-b border-line-100 flex items-start justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-risk-high font-medium">Acción destructiva</p>
            <h3 className="font-serif text-xl text-ink-900 mt-0.5">Archivar o eliminar · {patient.preferredName ?? patient.name}</h3>
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
        className="w-full max-w-xl rounded-2xl bg-surface shadow-modal"
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
              <select value={form.pronouns ?? ""} onChange={(e) => update("pronouns", e.target.value)} className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none hover:border-brand-400">
                <option>ella</option><option>él</option><option>elle</option><option>—</option>
              </select>
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
              <select
                value={form.sex ?? ""}
                onChange={(e) => setForm((p) => ({ ...p, sex: e.target.value as "" | "M" | "F" }))}
                className="mt-1 h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none hover:border-brand-400"
                title="Dato clínico — separado de pronombres."
              >
                <option value="">—</option>
                <option value="F">Femenino</option>
                <option value="M">Masculino</option>
              </select>
            </Labeled>
          </div>
          <Labeled label="Motivo de consulta">
            <textarea rows={2} value={form.reason ?? ""} onChange={(e) => update("reason", e.target.value)} className="mt-1 w-full px-3 py-2 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700" />
          </Labeled>
          <div className="grid grid-cols-2 gap-3">
            <Labeled label="Modalidad">
              <select value={form.modality ?? "individual"} onChange={(e) => update("modality", e.target.value as Modality)} className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none hover:border-brand-400">
                <option value="individual">Individual</option><option value="pareja">Pareja</option><option value="familiar">Familiar</option><option value="grupal">Grupal</option><option value="tele">Telepsicología</option>
              </select>
            </Labeled>
            <Labeled label="Estado">
              <select value={form.status ?? "activo"} onChange={(e) => update("status", e.target.value as PatientStatus)} className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none hover:border-brand-400">
                <option value="activo">Activo</option><option value="pausa">Pausa</option><option value="alta">Alta</option><option value="derivado">Derivado</option>
              </select>
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
