import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/components/app/AppShell";
import { KpiCard } from "@/components/app/KpiCard";
import { PatientPicker } from "@/components/app/PatientPicker";
import {
  Receipt, TrendingUp, Wallet, AlertCircle, Plus, X, Search,
  Download, CheckCircle2, Loader2, Pencil, Trash2, Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api, type Invoice } from "@/lib/api";

export const Route = createFileRoute("/facturacion")({
  head: () => ({ meta: [{ title: "Recibos — Psicomorfosis" }] }),
  component: FacturacionPage,
});

type Estado = "pagada" | "pendiente" | "vencida" | "borrador";
type Filter = "Todos" | "Pagados" | "Pendientes" | "Vencidos";

const ESTADO_STYLE: Record<Estado, string> = {
  pagada:    "bg-success-soft text-success border border-success/20",
  pendiente: "bg-warning-soft text-risk-moderate border border-warning/20",
  vencida:   "bg-error-soft text-risk-high border border-error/20",
  borrador:  "bg-bg-100 text-ink-500 border border-line-200",
};

const ESTADO_LABEL: Record<Estado, string> = {
  pagada: "Pagado",
  pendiente: "Pendiente",
  vencida: "Vencido",
  borrador: "Borrador",
};

const PAYMENT_METHODS = ["Efectivo", "Tarjeta", "PSE", "Transferencia", "Convenio"] as const;
const COMMON_BANKS = [
  "Bancolombia", "Davivienda", "BBVA", "Banco de Bogotá", "Banco Popular",
  "Banco Caja Social", "AV Villas", "Nequi", "Daviplata", "Banco Falabella",
  "Banco GNB Sudameris", "Itaú", "Scotiabank Colpatria", "Otro",
];
const COMMON_EPS = [
  "Sura EPS", "Sanitas EPS", "Compensar", "Famisanar", "Salud Total",
  "Coomeva", "Nueva EPS", "Mutual Ser", "Aliansalud", "SOS", "Otro",
];

const fmt = (n: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

function FacturacionPage() {
  const [filter, setFilter] = useState<Filter>("Todos");
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [detail, setDetail] = useState<Invoice | null>(null);
  const [editing, setEditing] = useState<Invoice | null>(null);

  const { data: invoices = [], isLoading, error } = useQuery({
    queryKey: ["invoices"],
    queryFn: () => api.listInvoices(),
  });
  const { data: summary } = useQuery({
    queryKey: ["invoices-summary"],
    queryFn: () => api.invoicesSummary(),
  });

  const filtered = useMemo(() => invoices.filter((f) => {
    if (filter === "Pagados" && f.status !== "pagada") return false;
    if (filter === "Pendientes" && f.status !== "pendiente") return false;
    if (filter === "Vencidos" && f.status !== "vencida") return false;
    if (query.trim()) {
      const q = query.toLowerCase();
      if (!f.patient_name.toLowerCase().includes(q) &&
          !f.id.toLowerCase().includes(q) &&
          !f.concept.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [invoices, filter, query]);

  const recaudado = summary?.paid ?? 0;
  const porCobrar = summary?.pending ?? 0;
  const vencidas = summary?.overdue ?? 0;

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto">
        <header className="flex items-end justify-between mb-5 sm:mb-6 flex-wrap gap-3">
          <div>
            <div className="text-xs uppercase tracking-widest text-brand-700 font-semibold">Gestión financiera</div>
            <h1 className="font-serif text-2xl md:text-3xl text-ink-900 mt-1">Recibos</h1>
            <p className="text-sm text-ink-500 mt-1">Comprobantes de pago de las sesiones</p>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <button
              onClick={() => setCustomizeOpen(true)}
              className="flex-1 sm:flex-none h-10 px-3 sm:px-4 rounded-lg border border-line-200 bg-surface text-ink-700 text-xs sm:text-sm hover:border-brand-400 inline-flex items-center justify-center gap-2"
              title="Personalizar el aspecto del PDF de los recibos"
            >
              <Settings className="h-4 w-4" /> <span className="hidden sm:inline">Personalizar</span>
            </button>
            <button
              onClick={() => setCreateOpen(true)}
              className="flex-1 sm:flex-none h-10 px-3 sm:px-4 rounded-lg bg-brand-700 text-primary-foreground text-xs sm:text-sm hover:bg-brand-800 flex items-center justify-center gap-2"
            >
              <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Nuevo recibo</span><span className="sm:hidden">Nuevo</span>
            </button>
          </div>
        </header>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
          <KpiCard icon={<Wallet className="h-4 w-4" />} label="Recaudado" value={fmt(recaudado)} hint="pagados" delta={{ neutral: true, value: "" }} />
          <KpiCard icon={<TrendingUp className="h-4 w-4" />} label="Por cobrar" value={fmt(porCobrar)} hint={`${invoices.filter((f) => f.status === "pendiente").length} recibos`} delta={{ neutral: true, value: "" }} />
          <KpiCard icon={<AlertCircle className="h-4 w-4" />} label="Vencidos" value={fmt(vencidas)} hint={`${invoices.filter((f) => f.status === "vencida").length} recibo(s)`} emphasis={vencidas > 0 ? "risk" : "default"} delta={{ neutral: true, value: "" }} />
          <KpiCard icon={<Receipt className="h-4 w-4" />} label="Total" value={String(summary?.total ?? invoices.length)} hint="emitidos" delta={{ neutral: true, value: "" }} />
        </div>

        <section className="rounded-xl bg-surface border border-line-200 shadow-soft overflow-hidden">
          <div className="px-3 sm:px-5 py-3 sm:py-4 border-b border-line-100 space-y-2 sm:space-y-0 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
            <h2 className="font-serif text-base sm:text-lg text-ink-900 sm:mr-auto">Movimientos recientes</h2>
            <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-line-200 bg-bg-100/40 sm:w-64">
              <Search className="h-3.5 w-3.5 text-ink-400 shrink-0" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar paciente, ID o concepto…"
                className="flex-1 bg-transparent text-sm text-ink-900 placeholder:text-ink-400 outline-none min-w-0"
              />
            </div>
            <div className="flex gap-1 p-1 rounded-md bg-bg-100 text-xs overflow-x-auto no-scrollbar">
              {(["Todos", "Pagados", "Pendientes", "Vencidos"] as Filter[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setFilter(t)}
                  className={cn("px-3 py-1.5 rounded transition-colors shrink-0", filter === t ? "bg-surface text-ink-900 font-medium shadow-xs" : "text-ink-500 hover:text-ink-900")}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-bg-100 text-ink-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left font-medium px-5 py-3">Recibo</th>
                  <th className="text-left font-medium px-5 py-3">Paciente</th>
                  <th className="text-left font-medium px-5 py-3">Concepto</th>
                  <th className="text-left font-medium px-5 py-3">Fecha</th>
                  <th className="text-left font-medium px-5 py-3">Método</th>
                  <th className="text-right font-medium px-5 py-3">Valor</th>
                  <th className="text-left font-medium px-5 py-3">Estado</th>
                  <th className="text-right font-medium px-5 py-3 w-1">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((f) => (
                  <tr key={f.id} onClick={() => setDetail(f)} className="border-t border-line-100 hover:bg-brand-50/40 cursor-pointer transition-colors group">
                    <td className="px-5 py-3.5 font-mono text-xs text-ink-700">{f.id}</td>
                    <td className="px-5 py-3.5 text-ink-900">
                      {f.patient_name || <span className="text-ink-400 italic">Sin paciente</span>}
                    </td>
                    <td className="px-5 py-3.5 text-ink-500">{f.concept}</td>
                    <td className="px-5 py-3.5 text-ink-500 tabular">{f.date}</td>
                    <td className="px-5 py-3.5 text-ink-500">
                      {f.method}
                      {f.bank && <span className="text-ink-400"> · {f.bank}</span>}
                      {f.eps && <span className="text-ink-400"> · {f.eps}</span>}
                    </td>
                    <td className="px-5 py-3.5 text-right tabular text-ink-900 font-medium">{fmt(f.amount)}</td>
                    <td className="px-5 py-3.5">
                      <span className={cn("text-[11px] px-2.5 py-1 rounded-full", ESTADO_STYLE[f.status])}>
                        {ESTADO_LABEL[f.status]}
                      </span>
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap text-right">
                      <InlineActions invoice={f} onEdit={() => setEditing(f)} />
                    </td>
                  </tr>
                ))}
                {isLoading && (
                  <tr><td colSpan={8} className="px-5 py-10 text-center text-sm text-ink-500"><Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Cargando…</td></tr>
                )}
                {!isLoading && !error && filtered.length === 0 && (
                  <tr><td colSpan={8} className="px-5 py-10 text-center text-sm text-ink-500">Sin recibos en este filtro.</td></tr>
                )}
                {error && (
                  <tr><td colSpan={8} className="px-5 py-10 text-center text-sm text-risk-high">No se pudo cargar desde el backend.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-3 border-t border-line-100 flex items-center justify-between text-xs text-ink-500">
            <div>Mostrando {filtered.length} de {invoices.length}</div>
            <div>Subtotal filtrado · <span className="tabular text-ink-900 font-medium">{fmt(filtered.reduce((a, b) => a + b.amount, 0))}</span></div>
          </div>
        </section>
      </div>

      {createOpen && <ReceiptFormModal mode="create" onClose={() => setCreateOpen(false)} />}
      {editing && <ReceiptFormModal mode="edit" invoice={editing} onClose={() => setEditing(null)} />}
      {customizeOpen && <CustomizeReceiptsModal onClose={() => setCustomizeOpen(false)} />}
      {detail && (
        <ReceiptDetailModal
          factura={detail}
          onClose={() => setDetail(null)}
          onEdit={() => { setEditing(detail); setDetail(null); }}
        />
      )}
    </AppShell>
  );
}

// ─── Acciones inline en cada fila ─────────────────────────────────────────
function InlineActions({ invoice, onEdit }: { invoice: Invoice; onEdit: () => void }) {
  const qc = useQueryClient();
  const [downloading, setDownloading] = useState(false);

  const markPaidMu = useMutation({
    mutationFn: () => api.updateInvoice(invoice.id, { status: "pagada" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["invoices-summary"] });
      toast.success("Marcado como pagado");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteMu = useMutation({
    mutationFn: () => api.deleteInvoice(invoice.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["invoices-summary"] });
      toast.success("Recibo eliminado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function downloadPdf(e: React.MouseEvent) {
    e.stopPropagation();
    setDownloading(true);
    try {
      const blob = await api.downloadInvoicePdf(invoice.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${invoice.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err: any) {
      toast.error("No se pudo generar el PDF: " + (err?.message ?? err));
    } finally {
      setDownloading(false);
    }
  }

  const stop = (e: React.MouseEvent) => e.stopPropagation();
  const isPaid = invoice.status === "pagada";

  return (
    <div className="inline-flex items-center gap-0.5" onClick={stop}>
      <button
        onClick={downloadPdf}
        disabled={downloading}
        title="Descargar PDF"
        className="h-8 w-8 rounded-md text-ink-500 hover:bg-bg-100 hover:text-ink-700 inline-flex items-center justify-center disabled:opacity-50"
      >
        {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
      </button>
      {!isPaid && (
        <button
          onClick={(e) => { stop(e); markPaidMu.mutate(); }}
          disabled={markPaidMu.isPending}
          title="Marcar como pagado"
          className="h-8 w-8 rounded-md text-success hover:bg-success-soft inline-flex items-center justify-center disabled:opacity-50"
        >
          {markPaidMu.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
        </button>
      )}
      <button
        onClick={(e) => { stop(e); onEdit(); }}
        title="Editar"
        className="h-8 w-8 rounded-md text-ink-500 hover:bg-bg-100 hover:text-ink-700 inline-flex items-center justify-center"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={(e) => {
          stop(e);
          if (confirm(`¿Eliminar el recibo ${invoice.id}?`)) deleteMu.mutate();
        }}
        disabled={deleteMu.isPending}
        title="Eliminar"
        className="h-8 w-8 rounded-md text-rose-700 hover:bg-rose-500/10 inline-flex items-center justify-center disabled:opacity-50"
      >
        {deleteMu.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

// ─── Modal form (crear / editar) ──────────────────────────────────────────
function ReceiptFormModal({
  mode, invoice, onClose,
}: {
  mode: "create" | "edit";
  invoice?: Invoice;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [patientId, setPatientId] = useState<string | null>(invoice?.patient_id ?? null);
  const [patientName, setPatientName] = useState<string>(invoice?.patient_name ?? "");
  const [concept, setConcept] = useState(invoice?.concept ?? "Sesión individual");
  const [amount, setAmount] = useState(invoice?.amount ?? 80000);
  const [method, setMethod] = useState<typeof PAYMENT_METHODS[number]>(
    (PAYMENT_METHODS as readonly string[]).includes(invoice?.method ?? "")
      ? (invoice!.method as typeof PAYMENT_METHODS[number])
      : "Efectivo"
  );
  const [bank, setBank] = useState(invoice?.bank ?? "");
  const [eps, setEps] = useState(invoice?.eps ?? "");
  const [reference, setReference] = useState(invoice?.payment_reference ?? "");
  const [notes, setNotes] = useState(invoice?.payment_notes ?? "");
  const [status, setStatus] = useState<Estado>(invoice?.status ?? "pagada");
  const [date, setDate] = useState(invoice?.date ?? new Date().toISOString().slice(0, 10));

  const mu = useMutation({
    mutationFn: () => {
      const body: Partial<Invoice> = {
        patient_id: patientId || null,
        patient_name: patientName,
        concept,
        amount: Math.max(0, Math.round(amount)),
        method,
        bank: method === "Transferencia" ? (bank || null) : null,
        eps: method === "Convenio" ? (eps || null) : null,
        payment_reference: reference || null,
        payment_notes: notes || null,
        status,
        date,
      };
      return mode === "create"
        ? api.createInvoice(body)
        : api.updateInvoice(invoice!.id, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["invoices-summary"] });
      toast.success(mode === "create" ? "Recibo creado" : "Recibo actualizado");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const isMethodTransfer = method === "Transferencia";
  const isMethodConvenio = method === "Convenio";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink-900/40 backdrop-blur-sm p-4 pt-16 overflow-y-auto" onClick={onClose}>
      <form
        onSubmit={(e) => { e.preventDefault(); mu.mutate(); }}
        className="w-full max-w-lg rounded-2xl bg-surface shadow-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="p-5 border-b border-line-100 flex items-start justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-brand-800 font-medium">Recibos</p>
            <h3 className="font-serif text-xl text-ink-900 mt-0.5">
              {mode === "create" ? "Nuevo recibo" : `Editar recibo ${invoice?.id}`}
            </h3>
            <p className="text-xs text-ink-500 mt-1">Comprobante de pago — no es factura electrónica DIAN.</p>
          </div>
          <button type="button" onClick={onClose} className="h-9 w-9 rounded-md border border-line-200 text-ink-500 hover:border-brand-400 flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="p-5 space-y-3">
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-ink-500 font-medium mb-1.5">Paciente</label>
            <PatientPicker
              value={patientId}
              onChange={(id, name) => { setPatientId(id); setPatientName(name ?? ""); }}
              allowEmpty
            />
          </div>
          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">Concepto</span>
            <input
              required
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
              placeholder="Sesión individual · Pareja · Familiar…"
              className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">Valor (COP)</span>
              <input
                type="number"
                min={0}
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700 tabular"
              />
              <p className="text-[11px] text-ink-500 mt-1">{fmt(amount)}</p>
            </label>
            <label className="block">
              <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">Fecha</span>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none hover:border-brand-400"
              />
            </label>
          </div>
          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">Método de pago</span>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as typeof PAYMENT_METHODS[number])}
              className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none hover:border-brand-400"
            >
              {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>

          {/* Campos condicionales */}
          {isMethodTransfer && (
            <label className="block animate-in fade-in slide-in-from-top-1 duration-200">
              <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">Banco</span>
              <input
                list="psm-banks"
                value={bank}
                onChange={(e) => setBank(e.target.value)}
                placeholder="Bancolombia, Davivienda, Nequi…"
                className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700"
              />
              <datalist id="psm-banks">
                {COMMON_BANKS.map((b) => <option key={b} value={b} />)}
              </datalist>
            </label>
          )}
          {isMethodConvenio && (
            <label className="block animate-in fade-in slide-in-from-top-1 duration-200">
              <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">EPS / Convenio</span>
              <input
                list="psm-eps"
                value={eps}
                onChange={(e) => setEps(e.target.value)}
                placeholder="Sura EPS, Sanitas, Compensar…"
                className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700"
              />
              <datalist id="psm-eps">
                {COMMON_EPS.map((e) => <option key={e} value={e} />)}
              </datalist>
            </label>
          )}

          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">
              Referencia / Comprobante <span className="text-ink-400 normal-case tracking-normal">(opcional)</span>
            </span>
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Nº de aprobación, últimos 4 de tarjeta, etc."
              className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700 tabular"
            />
          </label>
          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">
              Notas <span className="text-ink-400 normal-case tracking-normal">(opcional)</span>
            </span>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700"
            />
          </label>
          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">Estado</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as Estado)}
              className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none hover:border-brand-400"
            >
              <option value="pagada">Pagado</option>
              <option value="pendiente">Pendiente</option>
              <option value="vencida">Vencido</option>
              <option value="borrador">Borrador</option>
            </select>
          </label>
        </div>

        <footer className="p-4 border-t border-line-100 bg-bg-100/30 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-9 px-3 rounded-md border border-line-200 text-sm text-ink-700 hover:border-brand-400">
            Cancelar
          </button>
          <button type="submit" disabled={mu.isPending} className="h-9 px-4 rounded-md bg-brand-700 text-primary-foreground text-sm font-medium hover:bg-brand-800 disabled:opacity-60 inline-flex items-center gap-2">
            {mu.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {mode === "create" ? "Generar recibo" : "Guardar cambios"}
          </button>
        </footer>
      </form>
    </div>
  );
}

// ─── Modal detalle (PDF + marcar pagada + editar + eliminar) ──────────────
function ReceiptDetailModal({
  factura, onClose, onEdit,
}: {
  factura: Invoice;
  onClose: () => void;
  onEdit: () => void;
}) {
  const qc = useQueryClient();
  const [downloading, setDownloading] = useState(false);
  const isPaid = factura.status === "pagada";

  const markPaidMu = useMutation({
    mutationFn: () => api.updateInvoice(factura.id, { status: "pagada" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["invoices-summary"] });
      toast.success("Marcado como pagado");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteMu = useMutation({
    mutationFn: () => api.deleteInvoice(factura.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["invoices-summary"] });
      toast.success("Recibo eliminado");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function downloadPdf() {
    setDownloading(true);
    try {
      const blob = await api.downloadInvoicePdf(factura.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${factura.id}_${(factura.patient_name || "recibo").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "_").slice(0, 50)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success("PDF descargado");
    } catch (e: any) {
      toast.error("No se pudo generar el PDF: " + (e?.message ?? e));
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-surface shadow-modal max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <header className="p-5 border-b border-line-100 flex items-start justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-brand-800 font-medium font-mono">{factura.id}</p>
            <h3 className="font-serif text-xl text-ink-900 mt-0.5">{factura.concept}</h3>
            <p className="text-xs text-ink-500 mt-1">{factura.patient_name || "Sin paciente"} · {factura.date}</p>
          </div>
          <button onClick={onClose} className="h-9 w-9 rounded-md border border-line-200 text-ink-500 hover:border-brand-400 flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="p-5 space-y-3">
          <div className="rounded-lg border border-line-200 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-ink-500 uppercase tracking-wider">Total</span>
              <span className={cn("text-[11px] px-2.5 py-1 rounded-full", ESTADO_STYLE[factura.status])}>
                {ESTADO_LABEL[factura.status]}
              </span>
            </div>
            <div className="font-serif text-3xl text-ink-900 tabular mt-2">{fmt(factura.amount)}</div>
            <div className="text-xs text-ink-500 mt-1">
              Método: {factura.method}
              {factura.bank && ` · ${factura.bank}`}
              {factura.eps && ` · ${factura.eps}`}
            </div>
            {factura.payment_reference && (
              <div className="text-xs text-ink-500 mt-1 tabular">Ref: {factura.payment_reference}</div>
            )}
            {factura.paid_at && (
              <div className="text-xs text-ink-500 mt-1">Pagado el {new Date(factura.paid_at).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" })}</div>
            )}
            {factura.payment_notes && (
              <div className="text-xs text-ink-700 mt-2 italic">"{factura.payment_notes}"</div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={downloadPdf}
              disabled={downloading}
              className="h-10 rounded-md border border-line-200 text-xs text-ink-700 hover:border-brand-400 inline-flex items-center justify-center gap-1.5 disabled:opacity-60"
            >
              {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              {downloading ? "Generando…" : "Descargar PDF"}
            </button>
            <button
              onClick={onEdit}
              className="h-10 rounded-md border border-line-200 text-xs text-ink-700 hover:border-brand-400 inline-flex items-center justify-center gap-1.5"
            >
              <Pencil className="h-3.5 w-3.5" /> Editar
            </button>
          </div>

          {!isPaid && (
            <button
              onClick={() => markPaidMu.mutate()}
              disabled={markPaidMu.isPending}
              className="w-full h-10 rounded-md bg-brand-700 text-primary-foreground text-sm font-medium hover:bg-brand-800 inline-flex items-center justify-center gap-1.5 disabled:opacity-60"
            >
              {markPaidMu.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              Marcar como pagado
            </button>
          )}

          <button
            onClick={() => {
              if (confirm(`¿Eliminar el recibo ${factura.id} definitivamente?`)) {
                deleteMu.mutate();
              }
            }}
            disabled={deleteMu.isPending}
            className="w-full h-9 rounded-md border border-rose-300/50 text-xs text-rose-700 hover:bg-rose-500/5 inline-flex items-center justify-center gap-1.5 disabled:opacity-60"
          >
            {deleteMu.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            Eliminar recibo
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal: personalizar recibos (logo, nombre, plantilla, orientación) ───
type ReceiptTemplate = "minimal" | "esquina_verde";
type LogoOrientation = "horizontal" | "vertical" | "square";

const TEMPLATE_OPTIONS: { value: ReceiptTemplate; label: string; desc: string }[] = [
  { value: "minimal", label: "Minimal", desc: "Limpio y profesional, fondo blanco con acento violeta." },
  { value: "esquina_verde", label: "Esquina verde", desc: "Header verde-teal oscuro, paciente y terapeuta con avatares." },
];

function CustomizeReceiptsModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { data: settings = {}, isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.getSettings(),
  });

  const [template, setTemplate] = useState<ReceiptTemplate>(
    (settings.receipt_template as ReceiptTemplate) ?? "minimal",
  );
  const [showLogo, setShowLogo] = useState<boolean>(settings.receipt_show_logo !== "0");
  const [showName, setShowName] = useState<boolean>(settings.receipt_show_name !== "0");
  const [orientation, setOrientation] = useState<LogoOrientation>(
    (settings.receipt_logo_orientation as LogoOrientation) ?? "horizontal",
  );
  const [logoUrl, setLogoUrl] = useState<string>(settings.receipt_logo_url ?? "");
  const [logoPending, setLogoPending] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Sincronizar form con datos al cargar
  useEffect(() => {
    if (isLoading) return;
    setTemplate((settings.receipt_template as ReceiptTemplate) ?? "minimal");
    setShowLogo(settings.receipt_show_logo !== "0");
    setShowName(settings.receipt_show_name !== "0");
    setOrientation((settings.receipt_logo_orientation as LogoOrientation) ?? "horizontal");
    setLogoUrl(settings.receipt_logo_url ?? "");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  const saveMu = useMutation({
    mutationFn: () => api.updateSettings({
      receipt_template: template,
      receipt_show_logo: showLogo ? "1" : "0",
      receipt_show_name: showName ? "1" : "0",
      receipt_logo_orientation: orientation,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] });
      toast.success("Personalización guardada");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function onPickLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 1024 * 1024) {
      toast.error("Archivo demasiado grande (máx 1MB)");
      return;
    }
    setLogoPending(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      const resp = await api.uploadReceiptLogo(dataUrl);
      setLogoUrl(resp.receipt_logo_url ?? "");
      qc.invalidateQueries({ queryKey: ["settings"] });
      toast.success("Logo cargado");
    } catch (err: any) {
      toast.error("No se pudo cargar el logo: " + (err?.message ?? err));
    } finally {
      setLogoPending(false);
    }
  }

  async function clearLogo() {
    if (!confirm("¿Quitar el logo actual?")) return;
    setLogoPending(true);
    try {
      await api.uploadReceiptLogo(null);
      setLogoUrl("");
      qc.invalidateQueries({ queryKey: ["settings"] });
      toast.success("Logo eliminado");
    } catch (err: any) {
      toast.error("No se pudo quitar el logo: " + (err?.message ?? err));
    } finally {
      setLogoPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink-900/40 backdrop-blur-sm pt-12 p-4 overflow-y-auto" onClick={onClose}>
      <form
        onSubmit={(e) => { e.preventDefault(); saveMu.mutate(); }}
        className="w-full max-w-xl rounded-2xl bg-surface shadow-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="p-5 border-b border-line-100 flex items-start justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-brand-800 font-medium">Recibos</p>
            <h3 className="font-serif text-xl text-ink-900 mt-0.5">Personalizar recibos</h3>
            <p className="text-xs text-ink-500 mt-1">Cambios aplican a todos los PDFs que generes desde ahora.</p>
          </div>
          <button type="button" onClick={onClose} className="h-9 w-9 rounded-md border border-line-200 text-ink-500 hover:border-brand-400 flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="p-5 space-y-5">
          {/* Plantilla */}
          <section>
            <label className="block text-[11px] uppercase tracking-wider text-ink-500 font-medium mb-2">Plantilla</label>
            <div className="grid grid-cols-2 gap-2">
              {TEMPLATE_OPTIONS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setTemplate(t.value)}
                  className={cn(
                    "rounded-lg border p-3 text-left transition-all",
                    template === t.value
                      ? "border-brand-700 bg-brand-50/50 ring-1 ring-brand-700"
                      : "border-line-200 hover:border-brand-400",
                  )}
                >
                  <div className="text-sm font-medium text-ink-900">{t.label}</div>
                  <div className="text-[11px] text-ink-500 mt-0.5 leading-snug">{t.desc}</div>
                </button>
              ))}
            </div>
          </section>

          {/* Membrete: logo + nombre */}
          <section className="rounded-lg border border-line-200 p-4 space-y-3">
            <h4 className="text-sm font-medium text-ink-900">Membrete</h4>

            {/* Toggles */}
            <div className="flex items-center gap-4 flex-wrap">
              <label className="inline-flex items-center gap-2 text-sm text-ink-700">
                <input type="checkbox" checked={showLogo} onChange={(e) => setShowLogo(e.target.checked)} />
                Mostrar logo
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-ink-700">
                <input type="checkbox" checked={showName} onChange={(e) => setShowName(e.target.checked)} />
                Mostrar nombre
              </label>
            </div>

            {/* Logo upload */}
            {showLogo && (
              <div className="rounded-md border border-dashed border-line-300 p-3 flex items-center gap-3">
                <div className="h-14 w-20 rounded bg-bg-100 flex items-center justify-center overflow-hidden shrink-0">
                  {logoUrl ? (
                    <img src={logoUrl} alt="logo" className="max-h-12 max-w-16 object-contain" />
                  ) : (
                    <span className="text-[10px] text-ink-400 text-center px-1">Sin logo</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-ink-700">PNG, JPG o WebP, máx 1 MB.</p>
                  <p className="text-[11px] text-ink-500 mt-0.5">Recomendado: 400×120 px (horizontal) o 200×200 (cuadrado).</p>
                  <div className="flex gap-2 mt-2">
                    <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={onPickLogo} />
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      disabled={logoPending}
                      className="h-8 px-3 rounded-md border border-line-200 text-xs text-ink-700 hover:border-brand-400 inline-flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {logoPending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                      {logoUrl ? "Cambiar" : "Subir logo"}
                    </button>
                    {logoUrl && (
                      <button
                        type="button"
                        onClick={clearLogo}
                        disabled={logoPending}
                        className="h-8 px-3 rounded-md border border-line-200 text-xs text-rose-700 hover:border-rose-300 inline-flex items-center gap-1.5 disabled:opacity-50"
                      >
                        Quitar
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Orientación del logo (solo si lo va a mostrar) */}
            {showLogo && logoUrl && (
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-ink-500 font-medium mb-1.5">Orientación del logo</label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { v: "horizontal", label: "Horizontal", help: "Largo · 90×28" },
                    { v: "square",     label: "Cuadrado",   help: "44×44" },
                    { v: "vertical",   label: "Vertical",   help: "Alto · 38×56" },
                  ] as const).map((o) => (
                    <button
                      key={o.v}
                      type="button"
                      onClick={() => setOrientation(o.v)}
                      className={cn(
                        "rounded-md border p-2 text-xs",
                        orientation === o.v ? "border-brand-700 bg-brand-50/50 text-brand-800 font-medium" : "border-line-200 text-ink-700 hover:border-brand-400",
                      )}
                    >
                      <div>{o.label}</div>
                      <div className="text-[10px] text-ink-500 mt-0.5">{o.help}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Datos automáticos (lectura) */}
          <section className="rounded-lg border border-line-200 bg-bg-100/30 p-4">
            <h4 className="text-sm font-medium text-ink-900 mb-1">Datos del recibo</h4>
            <p className="text-xs text-ink-500 mb-3">Se rellenan automáticamente con la información de tu workspace y el recibo. Para cambiar nombre, dirección o teléfono, ve a Configuración.</p>
            <ul className="text-xs text-ink-700 space-y-1">
              <li>• <strong>Paciente</strong> — del recibo (nombre, ID).</li>
              <li>• <strong>Profesional</strong> — del recibo (nombre, título, tarjeta).</li>
              <li>• <strong>Clínica</strong> — del workspace (nombre, dirección, teléfono, ciudad).</li>
              <li>• <strong>Servicio</strong> — concepto, fecha, valor, método de pago.</li>
              <li>• <strong>Pago</strong> — método, banco/EPS si aplica, referencia, fecha de pago.</li>
            </ul>
          </section>
        </div>

        <footer className="p-4 border-t border-line-100 bg-bg-100/30 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-9 px-3 rounded-md border border-line-200 text-sm text-ink-700 hover:border-brand-400">Cancelar</button>
          <button type="submit" disabled={saveMu.isPending} className="h-9 px-4 rounded-md bg-brand-700 text-primary-foreground text-sm font-medium hover:bg-brand-800 disabled:opacity-60 inline-flex items-center gap-2">
            {saveMu.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Guardar cambios
          </button>
        </footer>
      </form>
    </div>
  );
}
