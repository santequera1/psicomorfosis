import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { RiskBadge } from "@/components/app/RiskBadge";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  User, Phone, Mail, IdCard, MapPin, Stethoscope, Brain, Pill, FileText,
  ClipboardList, MessageSquareText, MessageCircle, Sparkles,
  ChevronDown, ChevronRight, Edit3, Plus, X, ExternalLink, Loader2, Check, Lock, History, AlertCircle, Trash2,
  Search,
} from "lucide-react";
import { cn, displayPatientName, displayPatientShortName } from "@/lib/utils";
import { api, type ApiPatient, type ClinicalNote, type NoteKind, type DocumentTemplate, BLOCK_LABELS, type SoapContent } from "@/lib/api";
import { useWorkspace } from "@/lib/workspace";
import { whatsappUrl } from "@/lib/display";
import { NewAppointmentModal } from "@/components/app/NewAppointmentModal";

type Patient = ApiPatient;

const BLOCK_ICONS: Record<keyof typeof BLOCK_LABELS, React.ComponentType<{ className?: string }>> = {
  motivo: ClipboardList,
  antecedentes: User,
  examen_mental: Brain,
  cie11: Stethoscope,
  plan: Pill,
};

function formatDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });
  } catch { return iso; }
}

function parseSoap(content: string): SoapContent | null {
  try {
    const p = JSON.parse(content);
    if (p && typeof p === "object" && "s" in p && "o" in p && "a" in p && "p" in p) return p as SoapContent;
  } catch { /* not SOAP */ }
  return null;
}

type HistoriaSearch = { id?: string };

export const Route = createFileRoute("/historia")({
  head: () => ({
    meta: [
      { title: "Historia clínica — Psicomorfosis" },
      { name: "description", content: "Historia clínica integral del paciente con seguimiento longitudinal." },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): HistoriaSearch => ({
    id: typeof search.id === "string" ? search.id : undefined,
  }),
  component: HistoriaPage,
});

function HistoriaPage() {
  const search = useSearch({ from: "/historia" });
  const navigate = useNavigate();
  const { data: workspace } = useWorkspace();
  const isOrg = workspace?.mode === "organization";

  const { data: patients = [] } = useQuery({ queryKey: ["patients"], queryFn: () => api.listPatients() });

  const [patientId, setPatientId] = useState<string | null>(search.id ?? null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [noteEditorOpen, setNoteEditorOpen] = useState(false);
  const [apptOpen, setApptOpen] = useState(false);

  // Si llega un id nuevo en la URL (navegación desde otra página), respetarlo.
  // Antes había auto-selección del primer paciente, lo que confundía: parecía
  // que un paciente nuevo "ya tenía" notas que en realidad eran de otro.
  useEffect(() => {
    if (search.id && search.id !== patientId) setPatientId(search.id);
  }, [search.id, patientId]);

  // Cuando el state cambia (ej. seleccionado desde empty state o picker) y la
  // URL no lo refleja, sincronizamos. Así el link queda compartible y el
  // botón Atrás del navegador funciona correctamente.
  function selectPatient(id: string) {
    setPatientId(id);
    if (search.id !== id) {
      navigate({ to: "/historia", search: { id }, replace: true });
    }
  }

  const { data: patient, isLoading } = useQuery({
    queryKey: ["patient", patientId],
    queryFn: () => api.getPatient(patientId!),
    enabled: !!patientId,
  });

  // Atajo "N" para abrir el editor de nueva nota cuando hay paciente activo.
  useEffect(() => {
    if (!patient) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "n" && e.key !== "N") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      e.preventDefault();
      setNoteEditorOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [patient]);

  // Sin paciente seleccionado: empty state con buscador. Esto reemplazó el
  // auto-select del primer paciente que confundía a los usuarios.
  if (!patientId) {
    return (
      <AppShell>
        <NoPatientSelected patients={patients} onPick={selectPatient} />
      </AppShell>
    );
  }

  if (isLoading || !patient) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-20 text-sm text-ink-500">
          <Loader2 className="h-4 w-4 animate-spin mr-2" /> Cargando historia clínica…
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="px-2 lg:px-0 max-w-7xl mx-auto">
        <div className="mb-5 flex items-center gap-2 text-xs flex-wrap">
          <Link to="/pacientes" className="text-ink-500 hover:text-brand-700">Pacientes</Link>
          <span className="text-ink-300">/</span>
          <span className="text-ink-700">Historia clínica</span>
          <span className="text-ink-300">·</span>
          <button
            onClick={() => setPickerOpen(true)}
            className="inline-flex items-center gap-1 px-2 h-6 rounded-md text-ink-700 hover:bg-bg-100 hover:text-brand-700 transition-colors"
            title="Cambiar paciente"
          >
            {displayPatientShortName(patient)} <ChevronDown className="h-3 w-3" />
          </button>
        </div>

        <PatientHeader patient={patient} isOrg={isOrg} patients={patients} onOpenNote={() => setNoteEditorOpen(true)} onOpenAppt={() => setApptOpen(true)} />
        <ClinicalBlocks patientId={patient.id} />
        <SessionNotes
          patient={patient}
          editorOpen={noteEditorOpen}
          onOpenEditor={() => setNoteEditorOpen(true)}
          onCloseEditor={() => setNoteEditorOpen(false)}
        />
      </div>

      {pickerOpen && <PatientPickerModal patients={patients} currentId={patient.id} onPick={(id) => { selectPatient(id); setPickerOpen(false); }} onClose={() => setPickerOpen(false)} />}
      {apptOpen && <NewAppointmentModal patients={patients} prefilledPatient={patient} onClose={() => setApptOpen(false)} />}
    </AppShell>
  );
}

/** Pantalla de bienvenida cuando no hay paciente seleccionado en /historia. */
function NoPatientSelected({ patients, onPick }: { patients: Patient[]; onPick: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? patients.filter((p) =>
          p.name.toLowerCase().includes(q) ||
          (p.preferredName ?? "").toLowerCase().includes(q) ||
          p.doc.toLowerCase().includes(q) ||
          p.id.toLowerCase().includes(q)
        )
      : patients;
    return list.slice(0, 12);
  }, [patients, query]);

  return (
    <div className="max-w-2xl mx-auto py-12 sm:py-20 text-center">
      <div className="inline-flex h-14 w-14 rounded-2xl bg-brand-50 text-brand-700 items-center justify-center mb-4">
        <FileText className="h-6 w-6" />
      </div>
      <h1 className="font-serif text-2xl text-ink-900">Selecciona un paciente</h1>
      <p className="text-sm text-ink-500 mt-1.5 mb-6">
        Busca por nombre, documento o ID y abre su historia clínica.
      </p>
      <div className="relative max-w-md mx-auto">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
          placeholder="Buscar paciente…"
          className="w-full h-12 pl-11 pr-4 rounded-xl border border-line-200 bg-surface text-sm shadow-sm focus:border-brand-700 focus:outline-none"
        />
      </div>
      <ul className="mt-3 max-w-md mx-auto rounded-xl border border-line-200 bg-surface overflow-hidden divide-y divide-line-100">
        {filtered.length === 0 ? (
          <li className="p-4 text-sm text-ink-500 text-center">Sin coincidencias.</li>
        ) : (
          filtered.map((p) => (
            <li key={p.id}>
              <button
                onClick={() => onPick(p.id)}
                className="w-full text-left px-4 py-3 hover:bg-brand-50/50 flex items-center justify-between gap-3"
              >
                <span className="min-w-0">
                  <span className="block text-sm text-ink-900 font-medium truncate">
                    {p.name}{p.preferredName ? ` · ${p.preferredName}` : ""}
                  </span>
                  <span className="block text-[11px] text-ink-500 truncate tabular">{p.doc} · {p.id}</span>
                </span>
                <ChevronRight className="h-4 w-4 text-ink-300 shrink-0" />
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

function PatientHeader({ patient, isOrg, onOpenNote, onOpenAppt }: { patient: Patient; isOrg: boolean; patients: Patient[]; onOpenNote: () => void; onOpenAppt: () => void }) {
  const initialsLetters = displayPatientName(patient).split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase();
  const wa = whatsappUrl(patient.phone);
  return (
    <section className="rounded-2xl bg-surface border border-line-200 shadow-soft overflow-hidden mb-6 sm:mb-8">
      <div className="px-5 sm:px-7 py-5 sm:py-6">
        {/* Fila 1: avatar + nombre + acciones */}
        <div className="flex items-start gap-4 flex-wrap">
          <div className="h-14 w-14 sm:h-16 sm:w-16 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center text-base sm:text-lg font-serif text-brand-800 shrink-0">
            {initialsLetters}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg sm:text-xl font-serif text-ink-900 leading-tight">
                {patient.name}
              </h1>
              <RiskBadge risk={patient.risk} types={patient.riskTypes} compact />
            </div>
            <p className="mt-0.5 text-xs sm:text-sm text-ink-500">
              {patient.preferredName ? <>"{patient.preferredName}" · </> : null}
              {patient.pronouns ? `${patient.pronouns} · ` : ""}
              {patient.age ? `${patient.age} años · ` : ""}
              {patient.doc}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <Link
              to="/pacientes/$id" params={{ id: patient.id }}
              className="h-9 px-3 rounded-md border border-line-200 bg-surface text-xs sm:text-sm text-ink-700 hover:border-brand-400 inline-flex items-center justify-center gap-1.5"
            >
              <ExternalLink className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Ver ficha</span>
            </Link>
            <Link
              to="/documentos" search={{ paciente: patient.id }}
              className="h-9 px-3 rounded-md border border-line-200 bg-surface text-xs sm:text-sm text-ink-700 hover:border-brand-400 inline-flex items-center justify-center gap-1.5"
            >
              <FileText className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Documentos</span>
            </Link>
            <button
              onClick={onOpenNote}
              className="h-9 px-3 rounded-md border border-line-200 bg-surface text-xs sm:text-sm text-ink-700 hover:border-brand-400 inline-flex items-center justify-center gap-1.5"
            >
              <Edit3 className="h-3.5 w-3.5" /> Nota
            </button>
            <button
              onClick={onOpenAppt}
              className="h-9 px-3 rounded-md bg-brand-700 text-white text-xs sm:text-sm hover:bg-brand-800 inline-flex items-center justify-center gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" /> Agendar
            </button>
          </div>
        </div>

        {/* Fila 2: contacto compacto */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-3 mt-5 pt-5 border-t border-line-100 text-xs sm:text-sm">
          <ContactItem
            icon={Phone}
            label="Teléfono"
            value={patient.phone}
            actions={
              patient.phone ? (
                <>
                  <a href={`tel:${patient.phone.replace(/\s/g, "")}`} title="Llamar"
                    className="h-6 w-6 rounded text-ink-500 hover:text-brand-700 hover:bg-bg-100 inline-flex items-center justify-center">
                    <Phone className="h-3 w-3" />
                  </a>
                  {wa && (
                    <a href={wa} target="_blank" rel="noopener noreferrer" title="Abrir WhatsApp"
                      className="h-6 w-6 rounded text-sage-500 hover:text-sage-700 hover:bg-sage-200/30 inline-flex items-center justify-center">
                      <MessageCircle className="h-3.5 w-3.5" />
                    </a>
                  )}
                </>
              ) : null
            }
          />
          <ContactItem
            icon={Mail} label="Correo" value={patient.email}
            actions={patient.email ? (
              <a href={`mailto:${patient.email}`} title="Enviar correo"
                className="h-6 w-6 rounded text-ink-500 hover:text-brand-700 hover:bg-bg-100 inline-flex items-center justify-center">
                <Mail className="h-3 w-3" />
              </a>
            ) : null}
          />
          <ContactItem icon={MapPin} label="Dirección" value={patient.address ?? "Sin dirección"} />
          <ContactItem icon={IdCard} label="Identificación" value={patient.doc} />
        </div>

        {/* Fila 3: stats clínicas */}
        <div className={cn("grid gap-2 mt-4", isOrg ? "grid-cols-2 md:grid-cols-4" : "grid-cols-1 sm:grid-cols-3")}>
          {isOrg && <Stat label="Profesional" value={patient.professional} />}
          <Stat label="Modalidad" value={patient.modality} />
          <Stat label="Último contacto" value={patient.lastContact ?? "Sin registro"} />
          <Stat label="Próxima sesión" value={patient.nextSession ?? "Sin agendar"} highlight={!!patient.nextSession} />
        </div>
      </div>
    </section>
  );
}

function ContactItem({ icon: Icon, label, value, actions }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="min-w-0 group">
      <div className="text-[10px] uppercase tracking-[0.08em] text-ink-500 inline-flex items-center gap-1.5">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className="mt-0.5 flex items-center gap-1.5">
        <span className="text-ink-900 truncate">{value || <span className="text-ink-400">—</span>}</span>
        {actions && <span className="inline-flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">{actions}</span>}
      </div>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={cn(
      "rounded-lg border px-3 py-2 transition-colors",
      highlight ? "bg-sage-50 border-sage-200" : "bg-bg-100 border-line-100"
    )}>
      <div className="text-[10px] uppercase tracking-[0.08em] text-ink-500">{label}</div>
      <div className={cn(
        "text-sm font-medium mt-0.5 capitalize",
        highlight ? "text-sage-700" : "text-ink-900"
      )}>{value}</div>
    </div>
  );
}

/**
 * Los 5 bloques de historia clínica (motivo, antecedentes, examen_mental, cie11, plan).
 * Cada bloque muestra la nota vigente (no superseded). Editable inline:
 *  - si está en borrador → PATCH
 *  - si está firmada → supersede (crea nueva versión, la vieja queda como historial)
 */
function ClinicalBlocks({ patientId }: { patientId: string }) {
  const { data: notes = [], isLoading } = useQuery({
    queryKey: ["notes", patientId],
    queryFn: () => api.listNotes(patientId),
  });

  return (
    <section className="mb-12">
      <h2 className="text-xs uppercase tracking-widest text-brand-700 font-semibold mb-4">Historia clínica</h2>
      {isLoading && (
        <div className="rounded-xl border border-line-200 bg-surface p-6 text-sm text-ink-500 inline-flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
        </div>
      )}
      <div className="grid md:grid-cols-2 gap-4">
        {(Object.keys(BLOCK_LABELS) as (keyof typeof BLOCK_LABELS)[]).map((kind) => {
          const note = notes.find((n) => n.kind === kind && !n.isSuperseded);
          return <ClinicalBlock key={kind} kind={kind} note={note ?? null} patientId={patientId} />;
        })}
      </div>
    </section>
  );
}

function ClinicalBlock({ kind, note, patientId }: { kind: keyof typeof BLOCK_LABELS; note: ClinicalNote | null; patientId: string }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note?.content ?? "");
  const [showHistory, setShowHistory] = useState(false);
  const Icon = BLOCK_ICONS[kind];
  const title = BLOCK_LABELS[kind];

  const patchMu = useMutation({
    mutationFn: (content: string) => api.updateNote(note!.id, { content }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["notes", patientId] }); setEditing(false); },
  });
  const supersedeMu = useMutation({
    mutationFn: (content: string) => api.supersedeNote(note!.id, { content, sign: true }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["notes", patientId] }); setEditing(false); },
  });
  const createMu = useMutation({
    mutationFn: (content: string) => api.createNote(patientId, { kind, content }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["notes", patientId] }); setEditing(false); },
  });
  const signMu = useMutation({
    mutationFn: () => api.signNote(note!.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["notes", patientId] }); },
  });

  function startEdit() {
    setDraft(note?.content ?? "");
    setEditing(true);
  }

  function save() {
    if (!note) return createMu.mutate(draft);
    if (note.isDraft) return patchMu.mutate(draft);
    // firmada → supersede (crea versión nueva, queda firmada por defecto)
    return supersedeMu.mutate(draft);
  }

  const isPending = patchMu.isPending || supersedeMu.isPending || createMu.isPending;

  // Bloque sin contenido y sin estar editándose: render compacto clickeable
  // tipo "+ Agregar X" para no saturar la vista de un paciente nuevo.
  if (!note && !editing) {
    return (
      <button
        onClick={startEdit}
        className="rounded-xl bg-surface border border-dashed border-line-200 p-4 text-left hover:border-brand-400 hover:bg-brand-50/30 transition-colors flex items-center gap-3 group"
      >
        <div className="h-8 w-8 rounded-lg bg-bg-100 text-ink-400 group-hover:bg-brand-100 group-hover:text-brand-700 flex items-center justify-center transition-colors">
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-serif text-[15px] text-ink-700 group-hover:text-ink-900">{title}</div>
          <div className="text-xs text-ink-400 group-hover:text-ink-500">Sin contenido — click para agregar</div>
        </div>
        <Plus className="h-4 w-4 text-ink-400 group-hover:text-brand-700" />
      </button>
    );
  }

  return (
    <article className="rounded-xl bg-surface border border-line-200 p-5 shadow-xs hover:shadow-soft transition-shadow">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-brand-100 text-brand-700 flex items-center justify-center">
            <Icon className="h-4 w-4" />
          </div>
          <h3 className="font-serif text-[17px] text-ink-900">{title}</h3>
        </div>
        {!editing && (
          <div className="flex items-center gap-1">
            {note?.signedAt && (
              <span className="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full bg-success-soft text-success font-medium inline-flex items-center gap-1">
                <Lock className="h-2.5 w-2.5" /> Firmado
              </span>
            )}
            {note?.isDraft && (
              <span className="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full bg-warning-soft text-risk-moderate font-medium">
                Borrador
              </span>
            )}
            <button
              onClick={startEdit}
              className="h-8 w-8 rounded-md text-ink-500 hover:bg-bg-100 hover:text-ink-900 flex items-center justify-center"
              title={note?.signedAt ? "Crear nueva versión" : "Editar"}
            >
              <Edit3 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {editing ? (
        <>
          <textarea
            rows={6}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`Escribe el ${title.toLowerCase()}…`}
            className="w-full px-3 py-2 rounded-md border border-line-200 bg-surface text-sm text-ink-900 outline-none focus:border-brand-700"
            autoFocus
          />
          {note?.signedAt && (
            <div className="mt-2 rounded-md border border-warning/30 bg-warning-soft p-2 text-xs text-ink-700 flex items-start gap-2">
              <AlertCircle className="h-3.5 w-3.5 text-risk-moderate shrink-0 mt-0.5" />
              La versión actual está firmada. Al guardar se creará una nueva versión y la anterior quedará en el historial (Res. 1995/1999).
            </div>
          )}
          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              onClick={() => setEditing(false)}
              disabled={isPending}
              className="h-8 px-3 rounded-md border border-line-200 text-xs text-ink-700 hover:border-brand-400"
            >
              Cancelar
            </button>
            <button
              onClick={save}
              disabled={isPending || draft.trim() === ""}
              className="h-8 px-3 rounded-md bg-brand-700 text-primary-foreground text-xs font-medium hover:bg-brand-800 disabled:opacity-60 inline-flex items-center gap-1.5"
            >
              {isPending && <Loader2 className="h-3 w-3 animate-spin" />}
              {!note ? "Crear" : note.isDraft ? "Guardar" : "Guardar nueva versión"}
            </button>
          </div>
        </>
      ) : note ? (
        <>
          <p className="text-sm text-ink-700 leading-relaxed whitespace-pre-wrap">{note.content}</p>
          <div className="mt-3 flex items-center justify-between text-[11px] text-ink-500">
            <span>
              {note.authorName ?? "Autor desconocido"} · {formatDateTime(note.signedAt ?? note.updatedAt)}
            </span>
            <div className="flex items-center gap-2">
              {note.isDraft && (
                <button
                  onClick={() => signMu.mutate()}
                  disabled={signMu.isPending}
                  className="text-brand-700 hover:underline font-medium disabled:opacity-60 inline-flex items-center gap-1"
                >
                  {signMu.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Firmar
                </button>
              )}
              <button
                onClick={() => setShowHistory((v) => !v)}
                className="h-7 px-2 rounded-md border border-line-200 text-[11px] text-ink-700 hover:border-brand-400 hover:bg-brand-50/50 inline-flex items-center gap-1.5"
                title="Ver versiones anteriores firmadas"
              >
                <History className="h-3 w-3" /> {showHistory ? "Ocultar historial" : "Ver historial"}
              </button>
            </div>
          </div>
          {showHistory && <BlockHistory patientId={patientId} kind={kind} />}
        </>
      ) : (
        <p className="text-sm text-ink-400 italic">Sin contenido. Haz clic en ✏ para comenzar.</p>
      )}
    </article>
  );
}

function BlockHistory({ patientId, kind }: { patientId: string; kind: keyof typeof BLOCK_LABELS }) {
  const { data: history = [], isLoading } = useQuery({
    queryKey: ["notes-history", patientId, kind],
    queryFn: () => api.listNotes(patientId, { kind, include_superseded: true }),
  });
  const versions = history.filter((n) => n.isSuperseded);
  if (isLoading) return <div className="mt-3 text-xs text-ink-500">Cargando historial…</div>;
  if (versions.length === 0) return <div className="mt-3 text-xs text-ink-500">Sin versiones anteriores.</div>;
  return (
    <ol className="mt-3 space-y-2 pl-4 border-l border-line-200">
      {versions.map((v) => (
        <li key={v.id} className="text-xs text-ink-500">
          <div className="font-medium text-ink-700">{formatDateTime(v.signedAt ?? v.updatedAt)} — {v.authorName ?? "Autor"}</div>
          <p className="text-ink-500 whitespace-pre-wrap mt-0.5">{v.content}</p>
        </li>
      ))}
    </ol>
  );
}

/**
 * Lista de notas de sesión con formato SOAP. Permite firmar borradores,
 * crear nueva versión de firmadas, y crear nuevas con un editor inline.
 */
function SessionNotes({
  patient, editorOpen, onOpenEditor, onCloseEditor,
}: {
  patient: Patient;
  editorOpen: boolean;
  onOpenEditor: () => void;
  onCloseEditor: () => void;
}) {
  const { data: notes = [], isLoading } = useQuery({
    queryKey: ["notes", patient.id],
    queryFn: () => api.listNotes(patient.id),
  });
  const sessionNotes = notes.filter((n) => n.kind === "sesion" || n.kind === "evolucion" || n.kind === "privada");

  // Buscador local: filtra por contenido (texto plano de SOAP o libre).
  const [search, setSearch] = useState("");
  const visibleNotes = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sessionNotes;
    return sessionNotes.filter((n) => {
      const txt = (n.content || "").toLowerCase();
      const author = (n.authorName || "").toLowerCase();
      return txt.includes(q) || author.includes(q);
    });
  }, [sessionNotes, search]);

  return (
    <section className="mb-8">
      <div className="flex items-end justify-between mb-5 gap-3 flex-wrap">
        <div>
          <div className="text-xs uppercase tracking-widest text-brand-700 font-semibold">Trayectoria terapéutica</div>
          <h2 className="font-serif text-2xl text-ink-900 mt-1">Notas de sesión</h2>
          <p className="text-sm text-ink-500 mt-1.5 max-w-xl">
            Las notas firmadas son inmodificables; puedes crear una nueva versión y la anterior queda en el historial.
          </p>
        </div>
        <button
          onClick={onOpenEditor}
          disabled={editorOpen}
          title="Atajo: N"
          className="h-10 px-4 rounded-lg bg-brand-700 text-primary-foreground text-sm font-medium hover:bg-brand-800 inline-flex items-center gap-2 shrink-0 disabled:opacity-60"
        >
          <Plus className="h-4 w-4" /> Nueva nota
          <kbd className="ml-1 hidden sm:inline-block px-1.5 rounded bg-white/20 text-[10px] font-mono">N</kbd>
        </button>
      </div>

      {sessionNotes.length > 0 && (
        <div className="mb-4 relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar en las notas (texto o autor)…"
            className="w-full h-9 pl-9 pr-3 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700"
          />
        </div>
      )}

      {/* Editor inline arriba de la lista. Reemplaza el modal anterior. */}
      {editorOpen && (
        <div className="mb-4">
          <NoteEditor
            patientId={patient.id}
            patientName={displayPatientName(patient)}
            onClose={onCloseEditor}
          />
        </div>
      )}

      {isLoading && (
        <div className="rounded-xl border border-line-200 bg-surface p-6 text-sm text-ink-500 inline-flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
        </div>
      )}

      {!isLoading && sessionNotes.length === 0 && !editorOpen && (
        <div className="rounded-xl border border-dashed border-line-200 bg-surface p-10 text-center">
          <MessageSquareText className="h-6 w-6 text-ink-400 mx-auto mb-2" />
          <p className="text-sm text-ink-500">Aún no hay notas de sesión para este paciente.</p>
          <button
            onClick={onOpenEditor}
            className="mt-3 h-9 px-3 rounded-md bg-brand-700 text-primary-foreground text-xs font-medium hover:bg-brand-800 inline-flex items-center gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" /> Crear la primera nota
          </button>
        </div>
      )}

      {!isLoading && sessionNotes.length > 0 && visibleNotes.length === 0 && (
        <div className="text-sm text-ink-500 italic">Ninguna nota coincide con "{search}".</div>
      )}

      <div className="space-y-3">
        {visibleNotes.map((n) => (
          <SessionNoteCard key={n.id} note={n} patientId={patient.id} />
        ))}
      </div>
    </section>
  );
}

function SessionNoteCard({ note, patientId }: { note: ClinicalNote; patientId: string }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [supersedeOpen, setSupersedeOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const soap = parseSoap(note.content);

  const KIND_STYLE: Record<string, { label: string; bg: string }> = {
    sesion: { label: "Sesión · SOAP", bg: "bg-brand-50 text-brand-800" },
    evolucion: { label: "Evolución", bg: "bg-sage-200 text-sage-700" },
    privada: { label: "Nota privada", bg: "bg-lavender-100 text-lavender-500" },
  };
  const style = KIND_STYLE[note.kind] ?? KIND_STYLE.sesion;

  const signMu = useMutation({
    mutationFn: () => api.signNote(note.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notes", patientId] }),
  });
  const deleteMu = useMutation({
    mutationFn: () => api.deleteNote(note.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notes", patientId] }),
    onError: (e: Error) => alert(e.message),
  });

  return (
    <article className="rounded-xl bg-surface border border-line-200 shadow-xs hover:shadow-soft transition-shadow">
      <header className="px-5 py-3 border-b border-line-100 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={"text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full font-medium " + style.bg}>{style.label}</span>
          {note.signedAt ? (
            <span className="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full bg-success-soft text-success font-medium inline-flex items-center gap-1">
              <Lock className="h-2.5 w-2.5" /> Firmada
            </span>
          ) : (
            <span className="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full bg-warning-soft text-risk-moderate font-medium">
              Borrador
            </span>
          )}
        </div>
        <div className="text-xs text-ink-500 tabular">
          {note.authorName ?? "Autor"} · {formatDateTime(note.signedAt ?? note.updatedAt)}
        </div>
      </header>

      <div className="p-5">
        {editing ? (
          <InlineSoapEditor
            note={note}
            patientId={patientId}
            onClose={() => setEditing(false)}
          />
        ) : soap ? (
          <dl className="grid md:grid-cols-2 gap-4 text-sm">
            <SoapField letter="S" title="Subjetivo" text={soap.s} />
            <SoapField letter="O" title="Objetivo" text={soap.o} />
            <SoapField letter="A" title="Análisis" text={soap.a} />
            <SoapField letter="P" title="Plan" text={soap.p} />
          </dl>
        ) : (
          <p className="text-sm text-ink-700 whitespace-pre-wrap leading-relaxed">{note.content}</p>
        )}

        {!editing && !supersedeOpen && (
          <div className="mt-4 flex items-center justify-between gap-2 flex-wrap">
            <button
              onClick={() => setPickerOpen(true)}
              className="h-8 px-3 rounded-md border border-line-200 text-xs text-ink-700 hover:border-brand-400 inline-flex items-center gap-1.5"
              title="Generar un documento (informe, certificado, etc) usando los datos de esta nota"
            >
              <Sparkles className="h-3 w-3 text-brand-700" /> Generar documento
            </button>

            {note.isDraft ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (confirm("¿Eliminar esta nota borrador? Esta acción no se puede deshacer.")) {
                      deleteMu.mutate();
                    }
                  }}
                  disabled={deleteMu.isPending}
                  className="h-8 px-3 rounded-md border border-line-200 text-xs text-rose-700 hover:border-rose-400 hover:bg-rose-500/5 disabled:opacity-50 inline-flex items-center gap-1.5"
                  title="Eliminar borrador"
                >
                  <Trash2 className="h-3 w-3" /> Eliminar
                </button>
                <button
                  onClick={() => setEditing(true)}
                  className="h-8 px-3 rounded-md border border-line-200 text-xs text-ink-700 hover:border-brand-400 inline-flex items-center gap-1.5"
                >
                  <Edit3 className="h-3 w-3" /> Editar
                </button>
                <button
                  onClick={() => signMu.mutate()}
                  disabled={signMu.isPending}
                  className="h-8 px-3 rounded-md bg-brand-700 text-primary-foreground text-xs font-medium hover:bg-brand-800 disabled:opacity-60 inline-flex items-center gap-1.5"
                >
                  {signMu.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                  Firmar
                </button>
              </div>
            ) : (
              // Nota firmada: no se puede editar pero sí crear nueva versión.
              <button
                onClick={() => setSupersedeOpen(true)}
                title="La nota original queda en el historial firmado. Se crea una versión nueva con el contenido actualizado."
                className="h-8 px-3 rounded-md border border-line-200 text-xs text-ink-700 hover:border-brand-400 inline-flex items-center gap-1.5"
              >
                <History className="h-3 w-3" /> Crear nueva versión
              </button>
            )}
          </div>
        )}

        {supersedeOpen && (
          <SupersedeNoteEditor
            note={note}
            patientId={patientId}
            onClose={() => setSupersedeOpen(false)}
          />
        )}
      </div>

      {pickerOpen && (
        <GenerateDocFromNoteModal
          note={note}
          patientId={patientId}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </article>
  );
}

/**
 * Modal de selección de plantilla para generar un documento desde una nota.
 * El backend rellena las {{sesion.*}}, {{paciente.*}}, etc. con datos reales
 * de la nota y el paciente, deja un borrador y abrimos el editor.
 */
function GenerateDocFromNoteModal({ note, patientId, onClose }: { note: ClinicalNote; patientId: string; onClose: () => void }) {
  const navigate = useNavigate();
  const [creating, setCreating] = useState<number | null>(null);
  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["document-templates"],
    queryFn: () => api.listDocumentTemplates(),
  });

  // Cerrar con Esc.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Agrupar por categoría para presentar de forma ordenada.
  const grouped = useMemo(() => {
    const order = ["informe", "certificado", "consentimiento", "remision", "contrato", "otro"];
    const map: Record<string, DocumentTemplate[]> = {};
    for (const t of templates) (map[t.category] ??= []).push(t);
    return order.filter((c) => map[c]?.length).map((c) => ({ category: c, items: map[c] }));
  }, [templates]);

  async function pick(t: DocumentTemplate) {
    setCreating(t.id);
    try {
      const created = await api.createDocument({
        name: `${t.name} — sesión ${note.id}`,
        type: t.category,
        patient_id: patientId,
        template_id: t.id,
        note_id: note.id,
      });
      toast.success("Documento creado");
      onClose();
      navigate({ to: "/documentos/$id", params: { id: created.id } });
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo crear el documento");
      setCreating(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink-900/40 backdrop-blur-sm pt-12 p-4 overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl bg-surface shadow-modal" onClick={(e) => e.stopPropagation()}>
        <header className="p-5 border-b border-line-100 flex items-start justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-brand-700 font-medium inline-flex items-center gap-1">
              <Sparkles className="h-3 w-3" /> Generar documento
            </p>
            <h3 className="font-serif text-xl text-ink-900 mt-0.5">Selecciona una plantilla</h3>
            <p className="text-xs text-ink-500 mt-1">
              Las variables <code className="text-brand-700">{"{{sesion.*}}"}</code> y <code className="text-brand-700">{"{{paciente.*}}"}</code> se rellenan con datos reales de esta nota.
            </p>
          </div>
          <button onClick={onClose} className="h-9 w-9 rounded-md border border-line-200 text-ink-500 hover:border-brand-400 flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="p-5 max-h-[60vh] overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-10 text-sm text-ink-500">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Cargando plantillas…
            </div>
          ) : templates.length === 0 ? (
            <div className="text-center py-10 text-sm text-ink-500">
              No hay plantillas disponibles. <Link to="/documentos" className="text-brand-700 hover:underline">Creá una primero</Link>.
            </div>
          ) : (
            <div className="space-y-5">
              {grouped.map((g) => (
                <div key={g.category}>
                  <div className="text-[10px] uppercase tracking-[0.08em] text-ink-500 font-medium mb-2">{g.category}</div>
                  <ul className="space-y-1.5">
                    {g.items.map((t) => (
                      <li key={t.id}>
                        <button
                          onClick={() => pick(t)}
                          disabled={creating !== null}
                          className="w-full text-left rounded-lg border border-line-200 p-3 hover:border-brand-400 hover:bg-brand-50/40 transition-colors flex items-start gap-3 disabled:opacity-50 disabled:cursor-wait"
                        >
                          <FileText className="h-4 w-4 text-brand-700 shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-ink-900 font-medium flex items-center gap-2">
                              {t.name}
                              {t.scope === "system" && (
                                <span className="text-[10px] uppercase tracking-wider text-ink-400">Sistema</span>
                              )}
                            </div>
                            {t.description && (
                              <div className="text-xs text-ink-500 mt-0.5 line-clamp-2">{t.description}</div>
                            )}
                          </div>
                          {creating === t.id && <Loader2 className="h-4 w-4 animate-spin text-brand-700 shrink-0 mt-0.5" />}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>

        <footer className="p-4 border-t border-line-100 bg-bg-100/30 flex justify-end">
          <button onClick={onClose} className="h-9 px-3 rounded-md border border-line-200 text-sm text-ink-700 hover:border-brand-400">Cancelar</button>
        </footer>
      </div>
    </div>
  );
}

function SoapField({ letter, title, text }: { letter: string; title: string; text: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-widest text-brand-700 font-semibold mb-1 inline-flex items-center gap-2">
        <span className="h-5 w-5 rounded-full bg-brand-100 text-brand-800 inline-flex items-center justify-center text-[10px] font-serif">{letter}</span>
        {title}
      </dt>
      <dd className="text-sm text-ink-700 whitespace-pre-wrap leading-relaxed">{text || <span className="text-ink-400 italic">sin contenido</span>}</dd>
    </div>
  );
}

function InlineSoapEditor({ note, patientId, onClose }: { note: ClinicalNote; patientId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const initial = parseSoap(note.content) ?? { s: "", o: "", a: "", p: "" };
  const [soap, setSoap] = useState<SoapContent>(initial);

  const mu = useMutation({
    mutationFn: () => api.updateNote(note.id, { content: JSON.stringify(soap) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["notes", patientId] }); onClose(); },
  });

  return (
    <div className="space-y-3">
      {(["s", "o", "a", "p"] as const).map((k) => (
        <label key={k} className="block">
          <span className="text-[11px] uppercase tracking-widest text-brand-700 font-semibold">
            {k.toUpperCase()} · {({ s: "Subjetivo", o: "Objetivo", a: "Análisis", p: "Plan" } as const)[k]}
          </span>
          <textarea
            rows={2}
            value={soap[k]}
            onChange={(e) => setSoap((p) => ({ ...p, [k]: e.target.value }))}
            className="mt-1 w-full px-3 py-2 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700"
          />
        </label>
      ))}
      <div className="flex items-center justify-end gap-2">
        <button onClick={onClose} disabled={mu.isPending} className="h-8 px-3 rounded-md border border-line-200 text-xs text-ink-700 hover:border-brand-400">Cancelar</button>
        <button
          onClick={() => mu.mutate()}
          disabled={mu.isPending}
          className="h-8 px-3 rounded-md bg-brand-700 text-primary-foreground text-xs font-medium hover:bg-brand-800 disabled:opacity-60 inline-flex items-center gap-1.5"
        >
          {mu.isPending && <Loader2 className="h-3 w-3 animate-spin" />} Guardar
        </button>
      </div>
    </div>
  );
}

function PatientPickerModal({ patients, currentId, onPick, onClose }: { patients: Patient[]; currentId: string; onPick: (id: string) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const filtered = patients.filter((p) =>
    !q || p.name.toLowerCase().includes(q.toLowerCase()) || p.id.toLowerCase().includes(q.toLowerCase())
  );

  // Esc cierra el picker; Enter selecciona el primer match.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
      else if (e.key === "Enter" && filtered[0]) { e.preventDefault(); onPick(filtered[0].id); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filtered, onClose, onPick]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink-900/40 backdrop-blur-sm pt-24 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-surface shadow-modal overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-line-100">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar paciente por nombre o ID…"
            className="w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm text-ink-900 placeholder:text-ink-400 outline-none focus:border-brand-700"
          />
        </div>
        <ul className="max-h-80 overflow-y-auto py-1">
          {filtered.map((p) => (
            <li key={p.id}>
              <button
                onClick={() => onPick(p.id)}
                className={
                  "w-full flex items-center justify-between gap-2 px-4 py-2.5 text-left transition-colors " +
                  (p.id === currentId ? "bg-brand-50" : "hover:bg-bg-100")
                }
              >
                <div className="min-w-0">
                  <div className="text-sm text-ink-900 truncate">{p.name}</div>
                  <div className="text-[11px] text-ink-500 truncate tabular">{p.id} · {p.doc}</div>
                </div>
                <RiskBadge risk={p.risk} types={p.riskTypes} compact />
              </button>
            </li>
          ))}
          {filtered.length === 0 && <li className="px-4 py-6 text-center text-sm text-ink-500">Sin resultados</li>}
        </ul>
      </div>
    </div>
  );
}

/**
 * Editor inline de nueva nota. Reemplaza al modal anterior — ahora vive
 * directamente dentro del flujo de SessionNotes, sin abrir backdrop ni
 * desconectar al psicólogo de la lista de notas existentes.
 */
function NoteEditor({ patientId, patientName, onClose }: { patientId: string; patientName: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [kind, setKind] = useState<NoteKind>("sesion");
  const [soap, setSoap] = useState<SoapContent>({ s: "", o: "", a: "", p: "" });
  const [freeText, setFreeText] = useState("");
  const [signNow, setSignNow] = useState(false);
  const useSoap = kind === "sesion";

  // Esc cierra el editor (siempre que no estemos en un input/textarea con
  // contenido — el usuario puede esperar que Esc le saque del input primero,
  // pero como cerramos el editor entero igual, va directo).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const createMu = useMutation({
    mutationFn: async () => {
      const content = useSoap ? JSON.stringify(soap) : freeText;
      const note = await api.createNote(patientId, { kind, content });
      if (signNow) await api.signNote(note.id);
      return note;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notes", patientId] });
      toast.success(signNow ? "Nota creada y firmada" : "Borrador guardado");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canSubmit = useSoap
    ? !!(soap.s.trim() || soap.o.trim() || soap.a.trim() || soap.p.trim())
    : freeText.trim().length > 0;

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (canSubmit) createMu.mutate(); }}
      className="rounded-xl border border-brand-700/40 bg-surface shadow-soft"
    >
      <div className="px-5 py-3 border-b border-line-100 flex items-center justify-between gap-3">
        <p className="text-sm text-ink-900 font-medium">
          Nueva nota · <span className="text-ink-500">{patientName}</span>
        </p>
        <button
          type="button"
          onClick={onClose}
          title="Cerrar (Esc)"
          className="h-8 w-8 rounded-md text-ink-500 hover:bg-bg-100 inline-flex items-center justify-center"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="p-5 space-y-5">
        <div className="grid grid-cols-3 gap-2">
          {([
            { id: "sesion", label: "Sesión · SOAP", hint: "4 campos estructurados" },
            { id: "evolucion", label: "Evolución", hint: "texto libre" },
            { id: "privada", label: "Nota privada", hint: "solo para ti" },
          ] as const).map((k) => (
            <button
              key={k.id}
              type="button"
              onClick={() => setKind(k.id)}
              className={
                "p-3 rounded-lg border text-center transition-colors " +
                (kind === k.id ? "border-brand-700 bg-brand-50" : "border-line-200 hover:border-brand-400")
              }
            >
              <div className="text-xs font-medium text-ink-900">{k.label}</div>
              <div className="text-[10px] text-ink-500 mt-0.5">{k.hint}</div>
            </button>
          ))}
        </div>

        {useSoap ? (
          <div className="space-y-3">
            {(["s", "o", "a", "p"] as const).map((k, i) => (
              <label key={k} className="block">
                <span className="text-[11px] uppercase tracking-widest text-brand-700 font-semibold inline-flex items-center gap-2">
                  <span className="h-5 w-5 rounded-full bg-brand-100 text-brand-800 inline-flex items-center justify-center text-[10px] font-serif">{k.toUpperCase()}</span>
                  {({ s: "Subjetivo — lo que reporta el paciente", o: "Objetivo — observaciones del terapeuta / escalas", a: "Análisis — interpretación clínica / progreso", p: "Plan — técnicas, tareas, próxima sesión" } as const)[k]}
                </span>
                <textarea
                  rows={2}
                  value={soap[k]}
                  onChange={(e) => setSoap((p) => ({ ...p, [k]: e.target.value }))}
                  autoFocus={i === 0}
                  className="mt-1 w-full px-3 py-2 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700"
                />
              </label>
            ))}
          </div>
        ) : (
          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">Contenido</span>
            <textarea
              rows={8}
              autoFocus
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              placeholder={kind === "privada" ? "Hipótesis de conceptualización, proceso, impresiones…" : "Resumen de la evolución del caso…"}
              className="mt-1 w-full px-3 py-2 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700"
            />
          </label>
        )}

        <label className="flex items-center gap-2 text-sm text-ink-700 cursor-pointer select-none">
          <input type="checkbox" checked={signNow} onChange={(e) => setSignNow(e.target.checked)} className="sr-only peer" />
          <span className="h-[18px] w-[18px] rounded-[5px] border border-line-200 bg-surface flex items-center justify-center peer-checked:bg-brand-700 peer-checked:border-brand-700">
            {signNow && <Check className="h-3 w-3 text-primary-foreground" strokeWidth={3} />}
          </span>
          Firmar inmediatamente <span className="text-[11px] text-ink-500">(no se podrá editar; Res. 1995/1999)</span>
        </label>
      </div>

      <footer className="p-4 border-t border-line-100 bg-bg-100/30 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="h-9 px-3 rounded-md border border-line-200 text-sm text-ink-700 hover:border-brand-400">
          Cancelar <kbd className="ml-1 hidden sm:inline-block px-1 rounded bg-bg-100 text-[10px] font-mono">Esc</kbd>
        </button>
        <button
          type="submit"
          disabled={!canSubmit || createMu.isPending}
          className="h-9 px-4 rounded-md bg-brand-700 text-primary-foreground text-sm font-medium hover:bg-brand-800 disabled:opacity-60 inline-flex items-center gap-2"
        >
          {createMu.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {signNow ? "Crear y firmar" : "Guardar borrador"}
        </button>
      </footer>
    </form>
  );
}

/**
 * Editor inline para crear una nueva versión de una nota firmada (supersede).
 * La nota original queda en el historial como superseded; la nueva queda
 * firmada con el contenido editado.
 */
function SupersedeNoteEditor({ note, patientId, onClose }: { note: ClinicalNote; patientId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const initialSoap = parseSoap(note.content) ?? { s: "", o: "", a: "", p: "" };
  const isSoap = note.kind === "sesion";
  const [soap, setSoap] = useState<SoapContent>(initialSoap);
  const [freeText, setFreeText] = useState(isSoap ? "" : note.content);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const supersedeMu = useMutation({
    mutationFn: () => api.supersedeNote(note.id, {
      content: isSoap ? JSON.stringify(soap) : freeText,
      sign: true,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notes", patientId] });
      toast.success("Nueva versión firmada");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); supersedeMu.mutate(); }}
      className="mt-4 rounded-lg border border-warning/40 bg-warning-soft/30 p-4 space-y-3"
    >
      <div className="flex items-start gap-2 text-xs text-ink-700">
        <AlertCircle className="h-4 w-4 text-risk-moderate shrink-0 mt-0.5" />
        <span>
          La versión actual está firmada y queda intacta en el historial. Vas a crear una <strong>nueva versión firmada</strong> con el contenido editado.
        </span>
      </div>
      {isSoap ? (
        <div className="space-y-2">
          {(["s", "o", "a", "p"] as const).map((k) => (
            <label key={k} className="block">
              <span className="text-[11px] uppercase tracking-widest text-brand-700 font-semibold">{k.toUpperCase()}</span>
              <textarea
                rows={2}
                value={soap[k]}
                onChange={(e) => setSoap((p) => ({ ...p, [k]: e.target.value }))}
                className="mt-1 w-full px-3 py-2 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700"
              />
            </label>
          ))}
        </div>
      ) : (
        <textarea
          rows={6}
          value={freeText}
          onChange={(e) => setFreeText(e.target.value)}
          autoFocus
          className="w-full px-3 py-2 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700"
        />
      )}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          disabled={supersedeMu.isPending}
          className="h-8 px-3 rounded-md border border-line-200 text-xs text-ink-700 hover:border-brand-400 disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={supersedeMu.isPending}
          className="h-8 px-3 rounded-md bg-brand-700 text-primary-foreground text-xs font-medium hover:bg-brand-800 disabled:opacity-60 inline-flex items-center gap-1.5"
        >
          {supersedeMu.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
          Guardar nueva versión
        </button>
      </div>
    </form>
  );
}
