import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app/AppShell";
import { type Patient, type PatientStatus, type Modality, type Risk } from "@/lib/mock-data";
import { api } from "@/lib/api";
import { useWorkspace } from "@/lib/workspace";
import { RiskBadge } from "@/components/app/RiskBadge";
import { Search, Filter, Download, Plus, ChevronRight, Tag, X, Loader2, AlertCircle, MoreVertical, Edit3, Trash2, Eye } from "lucide-react";

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
  const { data: workspace } = useWorkspace();
  const isOrg = workspace?.mode === "organization";
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<PatientStatus | "todos">("todos");
  const [modality, setModality] = useState<Modality | "todas">("todas");
  const [riskFilter, setRiskFilter] = useState<Risk | "todos">("todos");
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Patient | null>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Patient | null>(null);

  const { data: patients = [], isLoading, error } = useQuery({
    queryKey: ["patients"],
    queryFn: () => api.listPatients(),
  });

  const filtered = useMemo(() => patients.filter((p) => {
    if (status !== "todos" && p.status !== status) return false;
    if (modality !== "todas" && p.modality !== modality) return false;
    if (riskFilter !== "todos" && p.risk !== riskFilter) return false;
    if (query.trim()) {
      const q = query.toLowerCase();
      if (!p.name.toLowerCase().includes(q) && !p.id.toLowerCase().includes(q) && !p.reason.toLowerCase().includes(q) && !p.doc.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [patients, query, status, modality, riskFilter]);

  function exportCSV() {
    const rows: string[][] = [["ID", "Nombre", "Edad", "Motivo", "Profesional", "Modalidad", "Estado", "Riesgo", "Próxima sesión"], ...filtered.map((p) => [p.id, p.name, String(p.age || ""), p.reason, p.professional, p.modality, p.status, p.risk, p.nextSession ?? ""])];
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `pacientes-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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
            <div className="grid grid-cols-3 gap-2">
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
            </div>
          </div>

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
                        {p.preferredName ? `${p.preferredName} · ${p.name}` : p.name}
                      </span>
                    </div>
                    <div className="text-[11px] text-ink-500 truncate tabular mt-0.5">{p.doc} · {p.id}</div>
                    <div className="text-xs text-ink-700 truncate mt-1">{p.reason}</div>
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium capitalize ${STATUS_STYLE[p.status]}`}>
                        {p.status}
                      </span>
                      <RiskBadge risk={p.risk} compact />
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
                  <tr key={p.id} className="border-b border-line-100 last:border-0 hover:bg-brand-50/60 transition-colors group cursor-pointer">
                    <td className="px-5 py-3.5">
                      <Link to="/pacientes/$id" params={{ id: p.id }} className="flex items-center gap-3">
                        <div className={`h-9 w-9 rounded-full flex items-center justify-center text-xs font-semibold ${avatarTone(p.name)}`}>
                          {initials(p.preferredName ?? p.name)}
                        </div>
                        <div className="min-w-0">
                          <div className="text-ink-900 font-medium truncate flex items-center gap-1.5">
                            {p.preferredName ? `${p.preferredName} · ${p.name}` : p.name}
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
                    <td className="px-3 py-3.5"><RiskBadge risk={p.risk} compact /></td>
                    <td className="px-3 py-3.5 text-ink-700 tabular">{p.nextSession ?? <span className="text-ink-400">—</span>}</td>
                    <td className="px-3 py-3.5 relative">
                      <button
                        onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === p.id ? null : p.id); }}
                        className="h-7 w-7 rounded-md hover:bg-bg-100 text-ink-500 inline-flex items-center justify-center"
                        aria-label="Acciones"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </button>
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
    </AppShell>
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
  const [form, setForm] = useState<Partial<Patient>>({
    name: patient.name,
    preferredName: patient.preferredName,
    pronouns: patient.pronouns,
    doc: patient.doc,
    age: patient.age,
    phone: patient.phone,
    email: patient.email,
    professional: patient.professional,
    modality: patient.modality,
    status: patient.status,
    reason: patient.reason,
    risk: patient.risk,
  });
  const [err, setErr] = useState<string | null>(null);

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
        onSubmit={(e) => { e.preventDefault(); setErr(null); mu.mutate(form); }}
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
          <Labeled label="Motivo de consulta">
            <textarea rows={2} value={form.reason ?? ""} onChange={(e) => update("reason", e.target.value)} className="mt-1 w-full px-3 py-2 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700" />
          </Labeled>
          <div className="grid grid-cols-3 gap-3">
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
            <Labeled label="Riesgo">
              <select value={form.risk ?? "none"} onChange={(e) => update("risk", e.target.value as Risk)} className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none hover:border-brand-400">
                <option value="none">Sin bandera</option><option value="low">Bajo</option><option value="moderate">Moderado</option><option value="high">Alto</option><option value="critical">Crítico</option>
              </select>
            </Labeled>
          </div>
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

function NewPatientModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { data: workspace } = useWorkspace();
  const isOrg = workspace?.mode === "organization";
  const professionals = workspace?.professionals ?? [];
  const mainProfessional = professionals[0];

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [form, setForm] = useState<Partial<Patient> & { professionalId?: number }>({ pronouns: "ella", modality: "individual", status: "activo", risk: "none" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (body: Partial<Patient> & { professionalId?: number }) => api.createPatient(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["patients"] });
      qc.invalidateQueries({ queryKey: ["workspace"] });
      qc.invalidateQueries({ queryKey: ["appointments"] });
      onClose();
    },
    onError: (e: Error) => { setErr(e.message); setSaving(false); },
  });

  function updateField<K extends keyof Patient>(k: K, v: Patient[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  function submit() {
    setSaving(true);
    setErr(null);

    // En modo individual usamos el único profesional automáticamente
    const professionalId = isOrg ? form.professionalId : mainProfessional?.id;
    const professionalName = isOrg
      ? professionals.find((p) => p.id === form.professionalId)?.name ?? ""
      : mainProfessional?.name ?? "";

    createMutation.mutate({
      name: `${(form as any).firstName ?? ""} ${(form as any).lastName ?? ""}`.trim() || "Sin nombre",
      pronouns: form.pronouns,
      doc: form.doc ?? "",
      age: form.age ?? 0,
      phone: form.phone ?? "",
      email: form.email ?? "",
      professional: professionalName,
      professionalId,
      modality: form.modality,
      status: form.status,
      reason: form.reason ?? "",
      lastContact: "Hoy",
      risk: form.risk,
    });
  }
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink-900/40 backdrop-blur-sm pt-16 p-4 overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-xl rounded-2xl bg-surface shadow-modal" onClick={(e) => e.stopPropagation()}>
        <header className="p-5 border-b border-line-100 flex items-start justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-brand-800 font-medium">Pacientes</p>
            <h3 className="font-serif text-xl text-ink-900 mt-0.5">Nuevo paciente</h3>
            <p className="text-xs text-ink-500 mt-1">Paso {step} de 3 · datos básicos · clínicos · consentimiento</p>
          </div>
          <button onClick={onClose} className="h-9 w-9 rounded-md border border-line-200 text-ink-500 hover:border-brand-400 flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="h-1 bg-bg-100">
          <div className="h-full bg-brand-700 transition-all" style={{ width: `${(step / 3) * 100}%` }} />
        </div>

        <div className="p-5 space-y-3">
          {step === 1 && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Labeled label="Nombres"><input onChange={(e) => setForm((p) => ({ ...p, ...(p as any), firstName: e.target.value } as any))} placeholder="Nombre(s)" className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700" /></Labeled>
                <Labeled label="Apellidos"><input onChange={(e) => setForm((p) => ({ ...p, ...(p as any), lastName: e.target.value } as any))} placeholder="Apellido(s)" className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700" /></Labeled>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Labeled label="Documento">
                  <input onChange={(e) => updateField("doc", e.target.value)} placeholder="CC 1.024.587.XXX" className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700 tabular" />
                </Labeled>
                <Labeled label="Edad"><input type="number" onChange={(e) => updateField("age", Number(e.target.value))} placeholder="28" className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700 tabular" /></Labeled>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Labeled label="Pronombres">
                  <select value={form.pronouns ?? "ella"} onChange={(e) => updateField("pronouns", e.target.value)} className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none hover:border-brand-400">
                    <option>ella</option><option>él</option><option>elle</option><option>prefiere no decir</option>
                  </select>
                </Labeled>
                <Labeled label="Teléfono"><input onChange={(e) => updateField("phone", e.target.value)} placeholder="+57 310 000 0000" className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700" /></Labeled>
              </div>
              <Labeled label="Correo"><input type="email" onChange={(e) => updateField("email", e.target.value)} placeholder="paciente@correo.co" className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700" /></Labeled>
            </>
          )}
          {step === 2 && (
            <>
              <Labeled label="Motivo de consulta">
                <textarea rows={3} onChange={(e) => updateField("reason", e.target.value)} placeholder="Describe brevemente el motivo principal…" className="mt-1 w-full px-3 py-2 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700" />
              </Labeled>
              <div className={"grid gap-3 " + (isOrg ? "grid-cols-2" : "grid-cols-1")}>
                {isOrg && (
                  <Labeled label="Profesional asignada/o">
                    <select
                      value={form.professionalId ?? ""}
                      onChange={(e) => setForm((p) => ({ ...p, professionalId: Number(e.target.value) }))}
                      className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none hover:border-brand-400"
                    >
                      <option value="">Selecciona…</option>
                      {professionals.map((prof) => (
                        <option key={prof.id} value={prof.id}>{prof.name}</option>
                      ))}
                    </select>
                  </Labeled>
                )}
                <Labeled label="Modalidad">
                  <select value={form.modality ?? "individual"} onChange={(e) => updateField("modality", e.target.value as Modality)} className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none hover:border-brand-400">
                    <option value="individual">Individual</option><option value="pareja">Pareja</option><option value="familiar">Familiar</option><option value="grupal">Grupal</option><option value="tele">Telepsicología</option>
                  </select>
                </Labeled>
              </div>
              {!isOrg && mainProfessional && (
                <div className="rounded-md bg-bg-100/60 border border-line-200 p-3 text-xs text-ink-500">
                  Profesional asignada: <span className="text-ink-900 font-medium">{mainProfessional.name}</span>
                </div>
              )}
              <Labeled label="Bandera de riesgo inicial">
                <select value={form.risk ?? "none"} onChange={(e) => updateField("risk", e.target.value as Risk)} className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none hover:border-brand-400">
                  <option value="none">Sin bandera</option><option value="low">Bajo</option><option value="moderate">Moderado</option><option value="high">Alto</option><option value="critical">Crítico</option>
                </select>
              </Labeled>
            </>
          )}
          {step === 3 && (
            <>
              <div className="rounded-lg border border-brand-700/20 bg-brand-50/40 p-4 text-sm text-ink-700">
                Se enviará por correo el consentimiento informado y el enlace del portal del paciente. Podrás firmar digitalmente en la siguiente sesión.
              </div>
              <label className="flex items-start gap-2 mt-3 text-sm text-ink-700">
                <input type="checkbox" defaultChecked className="mt-1" />
                <span>Enviar consentimiento informado por correo</span>
              </label>
              <label className="flex items-start gap-2 text-sm text-ink-700">
                <input type="checkbox" defaultChecked className="mt-1" />
                <span>Crear acceso al portal del paciente</span>
              </label>
              <label className="flex items-start gap-2 text-sm text-ink-700">
                <input type="checkbox" className="mt-1" />
                <span>Agendar primera cita inmediatamente</span>
              </label>
            </>
          )}
        </div>

        {err && (
          <div className="mx-5 mb-3 rounded-md border border-risk-high/30 bg-error-soft p-3 text-xs text-ink-700 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-risk-high shrink-0 mt-0.5" /> {err}
          </div>
        )}
        <footer className="p-4 border-t border-line-100 bg-bg-100/30 flex justify-between gap-2">
          <button
            onClick={() => (step > 1 ? setStep((step - 1) as 1 | 2) : onClose())}
            disabled={saving}
            className="h-9 px-3 rounded-md border border-line-200 text-sm text-ink-700 hover:border-brand-400 disabled:opacity-60"
          >
            {step === 1 ? "Cancelar" : "Atrás"}
          </button>
          <button
            onClick={() => (step < 3 ? setStep((step + 1) as 2 | 3) : submit())}
            disabled={saving}
            className="h-9 px-4 rounded-md bg-brand-700 text-primary-foreground text-sm font-medium hover:bg-brand-800 disabled:opacity-60 inline-flex items-center gap-2"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {step === 3 ? "Crear paciente" : "Continuar"}
          </button>
        </footer>
      </div>
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
