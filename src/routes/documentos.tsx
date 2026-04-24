import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { AppShell } from "@/components/app/AppShell";
import { KpiCard } from "@/components/app/KpiCard";
import { type DocType, type DocStatus } from "@/lib/mock-data";
import { api } from "@/lib/api";
import {
  FileText, FileSignature, FilePlus, Upload, Download, Search,
  FileCheck2, FileClock, FileWarning, FileArchive, ArrowRight, ShieldCheck,
  MoreHorizontal, X, Eye, Loader2,
} from "lucide-react";

interface DocRow {
  id: string;
  name: string;
  type: DocType;
  patient_id?: string | null;
  patient_name?: string | null;
  created_at: string;
  updated_at: string;
  size_kb: number;
  status: DocStatus;
  professional: string;
  signed_at?: string | null;
}

export const Route = createFileRoute("/documentos")({
  head: () => ({
    meta: [
      { title: "Documentos · Psicomorfosis" },
      { name: "description", content: "Consentimientos, informes y gestión documental clínica." },
    ],
  }),
  component: DocumentosPage,
});

const TYPE_LABEL: Record<DocType, string> = {
  consentimiento: "Consentimiento",
  informe: "Informe",
  certificado: "Certificado",
  remision: "Remisión",
  cuestionario: "Cuestionario",
  factura: "Factura",
};

const STATUS_STYLE: Record<DocStatus, { bg: string; text: string; label: string; Icon: React.ComponentType<{ className?: string }> }> = {
  borrador:         { bg: "bg-bg-100",       text: "text-ink-500",        label: "Borrador",       Icon: FileText },
  pendiente_firma:  { bg: "bg-warning-soft", text: "text-risk-moderate",  label: "Pendiente firma",Icon: FileClock },
  firmado:          { bg: "bg-success-soft", text: "text-success",        label: "Firmado",        Icon: FileCheck2 },
  enviado:          { bg: "bg-brand-50",     text: "text-brand-800",      label: "Enviado",        Icon: FileSignature },
  archivado:        { bg: "bg-lavender-100", text: "text-lavender-500",   label: "Archivado",      Icon: FileArchive },
};

const TYPE_ICON: Record<DocType, React.ComponentType<{ className?: string }>> = {
  consentimiento: ShieldCheck,
  informe: FileText,
  certificado: FileCheck2,
  remision: ArrowRight,
  cuestionario: FileText,
  factura: FileText,
};

function DocumentosPage() {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<DocType | "todos">("todos");
  const [status, setStatus] = useState<DocStatus | "todos">("todos");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [signOpen, setSignOpen] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["documents"],
    queryFn: () => api.listDocuments() as Promise<any>,
  });
  const docs = (data ?? []) as DocRow[];

  const kpis = useMemo(() => {
    const pendingSign = docs.filter((d) => d.status === "pendiente_firma").length;
    const signed = docs.filter((d) => d.status === "firmado").length;
    const drafts = docs.filter((d) => d.status === "borrador").length;
    return { pendingSign, signed, drafts, total: docs.length };
  }, [docs]);

  const filtered = docs.filter((d) => {
    if (type !== "todos" && d.type !== type) return false;
    if (status !== "todos" && d.status !== status) return false;
    if (query.trim()) {
      const q = query.toLowerCase();
      if (!d.name.toLowerCase().includes(q) && !(d.patient_name ?? "").toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const templates = [
    { id: "t1", name: "Consentimiento informado · terapia individual", type: "consentimiento" as DocType, uses: 124 },
    { id: "t2", name: "Consentimiento · grabación telepsicología", type: "consentimiento" as DocType, uses: 41 },
    { id: "t3", name: "Informe psicológico · evaluación inicial", type: "informe" as DocType, uses: 38 },
    { id: "t4", name: "Certificado de asistencia laboral", type: "certificado" as DocType, uses: 67 },
    { id: "t5", name: "Remisión a psiquiatría", type: "remision" as DocType, uses: 22 },
  ];

  return (
    <AppShell>
      <div className="space-y-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-ink-500">Biblioteca documental · consentimientos, informes y certificados</p>
            <h1 className="font-serif text-2xl md:text-[32px] leading-tight text-ink-900 mt-1">Documentos clínicos</h1>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setUploadOpen(true)}
              className="h-10 px-4 rounded-lg border border-line-200 bg-surface text-ink-700 text-sm hover:border-brand-400 inline-flex items-center gap-2"
            >
              <Upload className="h-4 w-4" /> Subir archivo
            </button>
            <button className="h-10 px-4 rounded-lg bg-brand-700 text-primary-foreground text-sm font-medium hover:bg-brand-800 inline-flex items-center gap-2">
              <FilePlus className="h-4 w-4" /> Nuevo documento
            </button>
          </div>
        </header>

        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard label="Total de documentos" value={String(kpis.total)} hint="en la biblioteca" icon={<FileText className="h-4 w-4" />} delta={{ neutral: true, value: "" }} />
          <KpiCard label="Pendientes de firma" value={String(kpis.pendingSign)} emphasis={kpis.pendingSign > 0 ? "risk" : "default"} hint="requieren acción" icon={<FileClock className="h-4 w-4" />} delta={{ neutral: true, value: "" }} />
          <KpiCard label="Firmados este mes" value={String(kpis.signed)} hint="completados" icon={<FileCheck2 className="h-4 w-4" />} delta={{ value: "+8", positive: true }} />
          <KpiCard label="Borradores" value={String(kpis.drafts)} hint="sin finalizar" icon={<FileWarning className="h-4 w-4" />} delta={{ neutral: true, value: "" }} />
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <div className="xl:col-span-2 rounded-xl border border-line-200 bg-surface">
            <div className="p-4 border-b border-line-100 flex flex-wrap items-center gap-2">
              <div className="flex-1 min-w-[240px] flex items-center gap-2 h-10 px-3 rounded-md border border-line-200 bg-bg-100/40">
                <Search className="h-4 w-4 text-ink-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar por nombre o paciente…"
                  className="flex-1 bg-transparent text-sm text-ink-900 placeholder:text-ink-400 outline-none"
                />
              </div>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as DocType | "todos")}
                className="h-10 px-3 rounded-md border border-line-200 bg-surface text-xs text-ink-700 outline-none hover:border-brand-400"
              >
                <option value="todos">Todos los tipos</option>
                {(Object.keys(TYPE_LABEL) as DocType[]).map((k) => <option key={k} value={k}>{TYPE_LABEL[k]}</option>)}
              </select>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as DocStatus | "todos")}
                className="h-10 px-3 rounded-md border border-line-200 bg-surface text-xs text-ink-700 outline-none hover:border-brand-400"
              >
                <option value="todos">Todos los estados</option>
                {(Object.keys(STATUS_STYLE) as DocStatus[]).map((k) => <option key={k} value={k}>{STATUS_STYLE[k].label}</option>)}
              </select>
            </div>

            <ul className="divide-y divide-line-100">
              {filtered.map((d) => {
                const s = STATUS_STYLE[d.status];
                const TIcon = TYPE_ICON[d.type];
                return (
                  <li key={d.id} className="px-5 py-4 hover:bg-brand-50/40 transition-colors group">
                    <div className="flex items-start gap-4">
                      <div className="h-10 w-10 rounded-lg bg-brand-50 text-brand-800 flex items-center justify-center shrink-0">
                        <TIcon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="text-sm font-medium text-ink-900 truncate">{d.name}</div>
                          <span className={"inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.06em] px-2 py-0.5 rounded-full font-medium " + s.bg + " " + s.text}>
                            <s.Icon className="h-3 w-3" /> {s.label}
                          </span>
                        </div>
                        <div className="text-xs text-ink-500 mt-1 flex items-center gap-3 flex-wrap">
                          <span>{TYPE_LABEL[d.type]}</span>
                          {d.patient_name && <><span className="text-ink-300">·</span><span>{d.patient_name}</span></>}
                          <span className="text-ink-300">·</span>
                          <span className="tabular">{d.updated_at}</span>
                          <span className="text-ink-300">·</span>
                          <span className="tabular">{d.size_kb} KB</span>
                          <span className="text-ink-300">·</span>
                          <span>{d.professional}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        {d.status === "pendiente_firma" && (
                          <button
                            onClick={() => setSignOpen(d.id)}
                            className="h-8 px-3 rounded-md bg-brand-700 text-primary-foreground text-xs font-medium hover:bg-brand-800 inline-flex items-center gap-1.5"
                          >
                            <FileSignature className="h-3.5 w-3.5" /> Firmar
                          </button>
                        )}
                        <button className="h-8 w-8 rounded-md border border-line-200 text-ink-500 hover:border-brand-400 flex items-center justify-center" title="Ver">
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        <button className="h-8 w-8 rounded-md border border-line-200 text-ink-500 hover:border-brand-400 flex items-center justify-center" title="Descargar">
                          <Download className="h-3.5 w-3.5" />
                        </button>
                        <button className="h-8 w-8 rounded-md text-ink-500 hover:bg-bg-100 flex items-center justify-center">
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            {isLoading && (
              <div className="p-10 text-center text-sm text-ink-500">
                <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Cargando…
              </div>
            )}
            {!isLoading && filtered.length === 0 && (
              <div className="p-10 text-center text-sm text-ink-500">Sin documentos que coincidan con los filtros.</div>
            )}
          </div>

          <aside className="space-y-5">
            <div className="rounded-xl border border-line-200 bg-surface p-5">
              <h3 className="font-serif text-lg text-ink-900">Plantillas</h3>
              <p className="text-xs text-ink-500">Documentos base más usados</p>
              <ul className="mt-4 space-y-2">
                {templates.map((t) => {
                  const TIcon = TYPE_ICON[t.type];
                  return (
                    <li key={t.id}>
                      <button className="w-full flex items-center gap-3 p-3 rounded-lg border border-line-200 hover:border-brand-400 hover:bg-brand-50/40 text-left transition-colors group">
                        <div className="h-8 w-8 rounded-md bg-lavender-100 text-lavender-500 flex items-center justify-center shrink-0">
                          <TIcon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-ink-900 truncate">{t.name}</div>
                          <div className="text-[11px] text-ink-500 tabular">{t.uses} usos</div>
                        </div>
                        <ArrowRight className="h-4 w-4 text-ink-400 group-hover:text-brand-700 shrink-0" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="rounded-xl border border-brand-700/20 bg-brand-50/40 p-5">
              <div className="flex items-center gap-2 mb-2">
                <ShieldCheck className="h-4 w-4 text-brand-700" />
                <h3 className="font-serif text-base text-ink-900">Firma digital</h3>
              </div>
              <p className="text-xs text-ink-700">Los consentimientos firmados quedan vinculados a la historia clínica y conservan sello de tiempo certificado.</p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                <div className="rounded-md bg-surface px-3 py-2 border border-line-200">
                  <div className="text-ink-500 uppercase tracking-wider">Este mes</div>
                  <div className="font-serif text-lg text-ink-900 tabular">47</div>
                </div>
                <div className="rounded-md bg-surface px-3 py-2 border border-line-200">
                  <div className="text-ink-500 uppercase tracking-wider">Promedio</div>
                  <div className="font-serif text-lg text-ink-900 tabular">2.3 min</div>
                </div>
              </div>
            </div>
          </aside>
        </section>
      </div>

      {uploadOpen && <UploadModal onClose={() => setUploadOpen(false)} />}
      {signOpen && <SignModal docId={signOpen} onClose={() => setSignOpen(null)} />}
    </AppShell>
  );
}

function UploadModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl bg-surface shadow-modal">
        <header className="p-5 border-b border-line-100 flex items-start justify-between">
          <div>
            <h3 className="font-serif text-xl text-ink-900">Subir documento</h3>
            <p className="text-xs text-ink-500 mt-1">PDF, Word o imágenes hasta 10 MB</p>
          </div>
          <button onClick={onClose} className="h-9 w-9 rounded-md border border-line-200 flex items-center justify-center text-ink-500 hover:border-brand-400">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="p-5 space-y-4">
          <label className="block rounded-xl border-2 border-dashed border-line-200 p-10 text-center cursor-pointer hover:border-brand-400 hover:bg-brand-50/30 transition-colors">
            <Upload className="h-7 w-7 text-ink-400 mx-auto mb-2" />
            <p className="text-sm text-ink-700 font-medium">Arrastra un archivo o haz clic para seleccionar</p>
            <p className="text-xs text-ink-500 mt-1">Se cifra en tránsito y en reposo</p>
            <input type="file" className="hidden" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">Tipo</span>
              <select className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none hover:border-brand-400">
                <option>Consentimiento</option><option>Informe</option><option>Certificado</option><option>Remisión</option>
              </select>
            </label>
            <label className="block">
              <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">Paciente</span>
              <input placeholder="Buscar…" className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none hover:border-brand-400 focus:border-brand-700" />
            </label>
          </div>
        </div>
        <footer className="p-4 border-t border-line-100 bg-bg-100/30 flex justify-end gap-2">
          <button onClick={onClose} className="h-9 px-3 rounded-md border border-line-200 text-sm text-ink-700 hover:border-brand-400">Cancelar</button>
          <button onClick={onClose} className="h-9 px-4 rounded-md bg-brand-700 text-primary-foreground text-sm font-medium hover:bg-brand-800">Subir documento</button>
        </footer>
      </div>
    </div>
  );
}

function SignModal({ docId, onClose }: { docId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: allDocs = [] } = useQuery({ queryKey: ["documents"], queryFn: () => api.listDocuments() as Promise<any> });
  const doc = (allDocs as DocRow[]).find((d) => d.id === docId);
  const [signed, setSigned] = useState(false);

  const signMu = useMutation({
    mutationFn: () => api.signDocument(docId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["documents"] }); setSigned(true); },
  });

  function doSign() {
    signMu.mutate();
  }
  const signing = signMu.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl bg-surface shadow-modal">
        <header className="p-5 border-b border-line-100">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-lg bg-brand-50 text-brand-700 flex items-center justify-center">
              <FileSignature className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-serif text-lg text-ink-900">Firma digital</h3>
              <p className="text-xs text-ink-500 mt-0.5 truncate max-w-xs">{doc?.name}</p>
            </div>
          </div>
        </header>
        <div className="p-5 space-y-3">
          {signed ? (
            <div className="rounded-lg border border-success/30 bg-success-soft p-4 flex items-start gap-3">
              <FileCheck2 className="h-5 w-5 text-success mt-0.5" />
              <div>
                <p className="text-sm font-medium text-ink-900">Documento firmado</p>
                <p className="text-xs text-ink-500 mt-1 tabular">Hash SHA-256: 7f4a…e29b · {new Date().toLocaleString("es-CO")}</p>
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm text-ink-700">
                Firmando como <strong>Psic. Nathaly Ferrer Pacheco</strong>. El documento quedará sellado con tiempo certificado y vinculado a la historia.
              </p>
              <label className="block">
                <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">Código de verificación</span>
                <input placeholder="Ingresa el código enviado a tu correo" className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none hover:border-brand-400 focus:border-brand-700 tabular" />
              </label>
            </>
          )}
        </div>
        <footer className="p-4 border-t border-line-100 bg-bg-100/30 flex justify-end gap-2">
          <button onClick={onClose} className="h-9 px-3 rounded-md border border-line-200 text-sm text-ink-700 hover:border-brand-400">
            {signed ? "Cerrar" : "Cancelar"}
          </button>
          {!signed && (
            <button onClick={doSign} disabled={signing} className="h-9 px-4 rounded-md bg-brand-700 text-primary-foreground text-sm font-medium hover:bg-brand-800 disabled:opacity-60">
              {signing ? "Firmando…" : "Firmar ahora"}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
