import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useWorkspace } from "@/lib/workspace";
import { api, type ApiPatient } from "@/lib/api";
import { displayPatientName } from "@/lib/utils";
import { type Modality } from "@/lib/mock-data";
import { RiskBadge } from "@/components/app/RiskBadge";
import { AlertTriangle, Search, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AppSelect } from "@/components/app/AppSelect";
import { AppDatePicker } from "@/components/app/AppDatePicker";

/**
 * Datos opcionales para pre-llenar el modal. Lo usa Laura cuando
 * propone una cita: en vez de solo navegar a la agenda, abrimos el
 * modal con los campos ya rellenos para que el psicólogo solo
 * revise y confirme.
 */
export type AppointmentPrefill = {
  patientId?: string;
  date?: string; // yyyy-mm-dd
  time?: string; // HH:mm
  duration?: number; // minutos
  modality?: Modality;
  notes?: string;
};

type Props = {
  patients: ApiPatient[];
  /** Si está, se preselecciona y se oculta el buscador (modal contextual). */
  prefilledPatient?: ApiPatient | null;
  /** Pre-llenado adicional de campos (fecha/hora/duración/etc). */
  prefill?: AppointmentPrefill;
  onClose: () => void;
  /** Llamado tras crear; útil para invalidar queries específicas de la página. */
  onCreated?: () => void;
};

export function NewAppointmentModal({ patients, prefilledPatient = null, prefill, onClose, onCreated }: Props) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: workspace } = useWorkspace();
  const isOrg = workspace?.mode === "organization";

  // Resolución del paciente inicial: prefilledPatient gana; si no, lo
  // buscamos en la lista por id de Laura.
  const initialPatient: ApiPatient | null =
    prefilledPatient ??
    (prefill?.patientId ? patients.find((p) => p.id === prefill.patientId) ?? null : null);

  const [query, setQuery] = useState(initialPatient ? displayPatientName(initialPatient) : "");
  const [selected, setSelected] = useState<ApiPatient | null>(initialPatient);
  const [showResults, setShowResults] = useState(false);
  const [date, setDate] = useState(() => {
    if (prefill?.date) return prefill.date;
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [time, setTime] = useState(prefill?.time ?? "10:30");
  const [modality, setModality] = useState<Modality>(
    prefill?.modality ?? initialPatient?.modality ?? "individual",
  );
  const [duration, setDuration] = useState(prefill?.duration ?? 50);
  const [notes, setNotes] = useState(prefill?.notes ?? "");

  // Settings del workspace: horario configurado + datos del consultorio
  // principal. Lo usamos para (a) ofrecer el consultorio principal como
  // opción en el selector "Lugar" y (b) advertir si la hora cae fuera
  // del horario habitual del psicólogo.
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: () => api.getSettings() });

  // Selección de "Lugar". Distinguimos entre opciones predefinidas
  // (principal, sede, tele, sin lugar) y libre ("otro lugar"), porque
  // determinan qué se manda al backend: sede_id resuelta vs room texto.
  type LugarKind = "principal" | "sede" | "tele" | "custom" | "none";
  const sedes = workspace?.sedes ?? [];
  const hasPrincipal = Boolean(settings?.consultorio_name);
  const initialLugar: { kind: LugarKind; sedeId?: number } =
    modality === "tele" ? { kind: "tele" }
    : hasPrincipal ? { kind: "principal" }
    : sedes[0] ? { kind: "sede", sedeId: sedes[0].id }
    : { kind: "none" };
  const [lugar, setLugar] = useState(initialLugar);
  const [customRoom, setCustomRoom] = useState("");

  // Aviso "cita fuera del horario establecido". Se calcula contra
  // settings.work_start_hour / work_end_hour / work_days. Solo muestra
  // banner amarillo — nunca bloquea (el psicólogo conoce su agenda
  // mejor que nosotros y a veces atiende fuera del horario base).
  const outOfHoursMsg = useMemo(() => {
    if (!settings || !date || !time) return null;
    const wStart = Number(settings.work_start_hour ?? 8);
    const wEnd = Number(settings.work_end_hour ?? 18);
    const workDaysCsv = String(settings.work_days ?? "monday,tuesday,wednesday,thursday,friday");
    const workDays = new Set(workDaysCsv.split(",").map((d) => d.trim()).filter(Boolean));
    const dayNames = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
    const dayLabelsEs: Record<string, string> = {
      sunday: "domingo", monday: "lunes", tuesday: "martes", wednesday: "miércoles",
      thursday: "jueves", friday: "viernes", saturday: "sábado",
    };
    // new Date("2026-06-13T00:00:00") respeta la zona local — no usamos
    // new Date("YYYY-MM-DD") solo, porque ese se parsea como UTC y rota
    // un día atrás en zonas como Bogotá.
    const dt = new Date(date + "T00:00:00");
    if (isNaN(dt.getTime())) return null;
    const dayName = dayNames[dt.getDay()];
    if (!workDays.has(dayName)) {
      const labels = Array.from(workDays).map((d) => dayLabelsEs[d]?.slice(0, 3)).filter(Boolean).join(", ");
      return `Estás agendando en ${dayLabelsEs[dayName]}, que no es parte de tu horario habitual (${labels}).`;
    }
    const [hStr, mStr] = String(time).split(":");
    const h = Number(hStr);
    const m = Number(mStr ?? 0);
    if (!Number.isFinite(h)) return null;
    const minutes = h * 60 + m;
    const startMin = wStart * 60;
    const endMin = wEnd * 60;
    if (minutes < startMin || minutes >= endMin) {
      const fmt = (n: number) => `${String(n).padStart(2, "0")}:00`;
      return `${time} está fuera de tu horario habitual (${fmt(wStart)}–${fmt(wEnd)}).`;
    }
    return null;
  }, [date, time, settings]);

  // Resuelve qué mandar al backend según la opción de Lugar elegida.
  // Tele siempre pisa: la modalidad gobierna sobre el lugar.
  function resolveLugarApi(): { sede_id: number | null; room: string } {
    if (modality === "tele") return { sede_id: null, room: "Telepsicología" };
    switch (lugar.kind) {
      case "principal": return { sede_id: null, room: settings?.consultorio_name ?? "" };
      case "sede":      return { sede_id: lugar.sedeId ?? null, room: sedes.find((s) => s.id === lugar.sedeId)?.name ?? "" };
      case "tele":      return { sede_id: null, room: "Telepsicología" };
      case "custom":    return { sede_id: null, room: customRoom.trim() };
      case "none":
      default:          return { sede_id: null, room: "" };
    }
  }

  const filtered = query.trim()
    ? patients.filter((p) => {
        const q = query.toLowerCase();
        return p.name.toLowerCase().includes(q) || (p.preferredName ?? "").toLowerCase().includes(q) || p.doc.toLowerCase().includes(q) || p.id.toLowerCase().includes(q);
      }).slice(0, 6)
    : [];

  const mu = useMutation({
    mutationFn: (): Promise<{ id?: number }> => {
      const { sede_id, room } = resolveLugarApi();
      return api.createAppointment({
        patient_id: selected?.id ?? null,
        patient_name: selected?.name ?? "",
        professional: selected?.professional ?? "",
        professional_id: selected?.professionalId ?? null,
        sede_id,
        date,
        time,
        duration_min: duration,
        modality,
        room,
        status: "confirmada",
        notes,
      } as any) as Promise<{ id?: number }>;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["appointments"] });
      qc.invalidateQueries({ queryKey: ["all-appointments"] });
      qc.invalidateQueries({ queryKey: ["patients"] });
      // Toast con botón "Ver" que lleva a la cita recién creada en
      // /agenda. Útil cuando el psicólogo agenda desde otro lugar
      // (FAB, ficha del paciente, comando rápido) y quiere ir al
      // contexto de la cita sin tener que navegar manualmente.
      const apptId = data?.id;
      toast.success("Cita agendada", apptId ? {
        action: {
          label: "Ver",
          onClick: () => navigate({ to: "/agenda", search: { appt: apptId } as any }),
        },
      } : undefined);
      onCreated?.();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function pick(p: ApiPatient) {
    setSelected(p);
    setQuery(displayPatientName(p));
    setShowResults(false);
    if (p.modality) setModality(p.modality);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 backdrop-blur-sm p-4" onClick={onClose}>
      <form
        onSubmit={(e) => { e.preventDefault(); if (selected) mu.mutate(); }}
        className="w-full max-w-lg rounded-2xl bg-surface shadow-modal overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="p-5 border-b border-line-100 flex items-start justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-brand-800 font-medium">Nueva cita</p>
            <h3 className="font-serif text-xl text-ink-900 mt-0.5">
              {prefilledPatient ? `Agendar con ${displayPatientName(prefilledPatient)}` : "Crear cita"}
            </h3>
          </div>
          <button type="button" onClick={onClose} className="h-9 w-9 rounded-md border border-line-200 text-ink-500 hover:border-brand-400 flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="p-5 space-y-3">
          {!prefilledPatient && (
            <label className="block relative">
              <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">Paciente</span>
              <div className="mt-1 flex items-center gap-2 h-10 px-3 rounded-md border border-line-200 bg-surface focus-within:border-brand-700">
                <Search className="h-4 w-4 text-ink-400" />
                <input
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setSelected(null); setShowResults(true); }}
                  onFocus={() => setShowResults(true)}
                  placeholder="Escribe el nombre, documento o ID…"
                  className="flex-1 bg-transparent text-sm outline-none text-ink-900"
                  required
                />
                {selected && (
                  <button type="button" onClick={() => { setSelected(null); setQuery(""); }} className="text-ink-400 hover:text-ink-700">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {showResults && filtered.length > 0 && !selected && (
                <ul className="absolute z-20 mt-1 left-0 right-0 rounded-md border border-line-200 bg-surface shadow-modal max-h-64 overflow-y-auto">
                  {filtered.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => pick(p)}
                        className="w-full flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-brand-50/70 text-left"
                      >
                        <div className="min-w-0">
                          <div className="text-sm text-ink-900 truncate">{p.name}{p.preferredName ? ` · ${p.preferredName}` : ""}</div>
                          <div className="text-[11px] text-ink-500 truncate tabular">{p.doc} · {p.id}</div>
                        </div>
                        <RiskBadge risk={p.risk} types={p.riskTypes} compact />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {showResults && query.trim() && filtered.length === 0 && !selected && (
                <div className="absolute z-20 mt-1 left-0 right-0 rounded-md border border-line-200 bg-surface shadow-modal p-3 text-xs text-ink-500">
                  Sin coincidencias. Revisa el nombre o crea el paciente primero.
                </div>
              )}
            </label>
          )}

          <div className="grid grid-cols-2 gap-3">
            {/* Date/time pickers con icono visible y click area completa.
                showPicker() abre el picker nativo en cualquier click —
                soluciona el bug en mobile donde solo se abría tocando
                el icono pequeño del browser que a veces ni se ve.
                Soportado en Chrome 99+, Firefox 101+, Safari 16+. */}
            <label className="block">
              <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">Fecha</span>
              <AppDatePicker
                value={date}
                onChange={setDate}
                className="mt-1"
                aria-label="Fecha de la cita"
              />
            </label>
            <label className="block">
              <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">Hora</span>
              {/* Input nativo type=time para que la psicóloga escriba
                  cualquier hora (no solo múltiplos de 15min). step=60
                  permite minutos individuales. showPicker() en click
                  abre el picker nativo aunque haya hecho click fuera
                  del icono pequeño del browser. */}
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                step={60}
                aria-label="Hora de la cita"
                onClick={(e) => {
                  const el = e.currentTarget as HTMLInputElement & { showPicker?: () => void };
                  try { el.showPicker?.(); } catch { /* no-op si el browser no soporta */ }
                }}
                className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm text-ink-900 outline-none focus:border-brand-700"
              />
            </label>
          </div>

          {outOfHoursMsg && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs text-amber-800">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span className="leading-relaxed">
                <strong className="font-medium">Cita fuera del horario establecido.</strong>{" "}
                {outOfHoursMsg} La cita se crea igual.
              </span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">Modalidad</span>
              <AppSelect
                value={modality}
                onChange={(v) => setModality(v as Modality)}
                className="mt-1"
                options={[
                  { value: "individual", label: "Individual" },
                  { value: "pareja", label: "Pareja" },
                  { value: "familiar", label: "Familiar" },
                  { value: "grupal", label: "Grupal" },
                  { value: "tele", label: "Telepsicología" },
                ]}
              />
            </label>
            <label className="block">
              <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">Duración</span>
              <AppSelect
                value={String(duration)}
                onChange={(v) => setDuration(Number(v))}
                className="mt-1"
                options={[
                  { value: "50", label: "50 min" },
                  { value: "30", label: "30 min" },
                  { value: "60", label: "60 min" },
                  { value: "90", label: "90 min" },
                ]}
              />
            </label>
          </div>

          {/* Selector "Lugar". Visible siempre (no solo en organization).
              Construye opciones a partir de:
                - consultorio principal (settings.consultorio_name)
                - sedes adicionales del workspace
                - telepsicología (siempre disponible)
                - otro lugar (texto libre, p. ej. salida a domicilio)
                - sin lugar (queda vacío en la cita)
              Si la modalidad es 'tele' se fuerza visualmente a
              "Telepsicología" para no confundir a la psicóloga. */}
          {modality === "tele" ? (
            <div className="rounded-md border border-line-200 bg-bg-50 px-3 py-2 text-xs text-ink-600">
              Como la modalidad es <strong>telepsicología</strong>, la cita queda como videollamada.
              No necesitas elegir un consultorio.
            </div>
          ) : (
            <>
              <label className="block">
                <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">Lugar</span>
                <AppSelect
                  value={lugar.kind === "sede" ? `sede:${lugar.sedeId}` : lugar.kind}
                  onChange={(v) => {
                    if (v === "principal") setLugar({ kind: "principal" });
                    else if (v === "custom") setLugar({ kind: "custom" });
                    else if (v === "none") setLugar({ kind: "none" });
                    else if (v.startsWith("sede:")) setLugar({ kind: "sede", sedeId: Number(v.slice(5)) });
                  }}
                  className="mt-1"
                  options={[
                    ...(hasPrincipal
                      ? [{ value: "principal", label: settings?.consultorio_name ?? "Mi consultorio" }]
                      : []),
                    ...sedes.map((s) => ({ value: `sede:${s.id}`, label: s.name })),
                    { value: "custom", label: "Otro lugar (escribir)…" },
                    { value: "none", label: "(Sin lugar especificado)" },
                  ]}
                />
              </label>
              {lugar.kind === "custom" && (
                <label className="block">
                  <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">¿Dónde es?</span>
                  <input
                    type="text"
                    value={customRoom}
                    onChange={(e) => setCustomRoom(e.target.value)}
                    placeholder="Ej: domicilio del paciente, sala 3, café X…"
                    maxLength={120}
                    className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm text-ink-900 outline-none focus:border-brand-700"
                  />
                </label>
              )}
            </>
          )}

          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">Notas</span>
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observaciones internas…" className="mt-1 w-full px-3 py-2 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700" />
          </label>
        </div>
        <footer className="p-4 border-t border-line-100 bg-bg-100/30 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-9 px-3 rounded-md border border-line-200 text-sm text-ink-700 hover:border-brand-400">Cancelar</button>
          <button type="submit" disabled={!selected || mu.isPending} className="h-9 px-4 rounded-md bg-brand-700 text-primary-foreground text-sm font-medium hover:bg-brand-800 disabled:opacity-60 inline-flex items-center gap-2">
            {mu.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Crear cita
          </button>
        </footer>
      </form>
    </div>
  );
}
