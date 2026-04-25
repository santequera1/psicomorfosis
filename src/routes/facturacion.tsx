import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app/AppShell";
import { KpiCard } from "@/components/app/KpiCard";
import { Receipt, TrendingUp, Wallet, AlertCircle, Download, Plus, X, Search, FileText, CheckCircle2, Send, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { api, type Invoice } from "@/lib/api";

export const Route = createFileRoute("/facturacion")({
  head: () => ({ meta: [{ title: "Facturación — Psicomorfosis" }] }),
  component: FacturacionPage,
});

type Estado = "pagada" | "pendiente" | "vencida" | "borrador";
type Filter = "Todas" | "Pagadas" | "Pendientes" | "Vencidas";

const ESTADO_STYLE: Record<Estado, string> = {
  pagada:    "bg-success-soft text-success border border-success/20",
  pendiente: "bg-warning-soft text-risk-moderate border border-warning/20",
  vencida:   "bg-error-soft text-risk-high border border-error/20",
  borrador:  "bg-bg-100 text-ink-500 border border-line-200",
};

const fmt = (n: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

function FacturacionPage() {
  const [filter, setFilter] = useState<Filter>("Todas");
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<Invoice | null>(null);

  const { data: invoices = [], isLoading, error } = useQuery({
    queryKey: ["invoices"],
    queryFn: () => api.listInvoices(),
  });
  const { data: summary } = useQuery({ queryKey: ["invoices-summary"], queryFn: () => api.invoicesSummary() });

  const filtered = useMemo(() => invoices.filter((f) => {
    if (filter === "Pagadas" && f.status !== "pagada") return false;
    if (filter === "Pendientes" && f.status !== "pendiente") return false;
    if (filter === "Vencidas" && f.status !== "vencida") return false;
    if (query.trim()) {
      const q = query.toLowerCase();
      if (!f.patient_name.toLowerCase().includes(q) && !f.id.toLowerCase().includes(q) && !f.concept.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [invoices, filter, query]);

  const recaudado = summary?.paid ?? 0;
  const porCobrar = summary?.pending ?? 0;
  const vencidas = summary?.overdue ?? 0;

  function exportCSV() {
    const rows: string[][] = [["ID", "Paciente", "Concepto", "Fecha", "Método", "Valor", "Estado"], ...filtered.map((f) => [f.id, f.patient_name, f.concept, f.date, f.method, String(f.amount), f.status])];
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `facturacion-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto">
        <header className="flex items-end justify-between mb-5 sm:mb-6 flex-wrap gap-3">
          <div>
            <div className="text-xs uppercase tracking-widest text-brand-700 font-semibold">Gestión financiera</div>
            <h1 className="font-serif text-2xl md:text-3xl text-ink-900 mt-1">Facturación</h1>
            <p className="text-sm text-ink-500 mt-1">Movimientos del mes en curso</p>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <button onClick={exportCSV} className="flex-1 sm:flex-none h-10 px-3 sm:px-4 rounded-lg border border-line-200 bg-surface text-xs sm:text-sm text-ink-700 hover:border-brand-400 flex items-center justify-center gap-2">
              <Download className="h-4 w-4" /> <span className="hidden sm:inline">Exportar CSV</span><span className="sm:hidden">CSV</span>
            </button>
            <button onClick={() => setCreateOpen(true)} className="flex-1 sm:flex-none h-10 px-3 sm:px-4 rounded-lg bg-brand-700 text-primary-foreground text-xs sm:text-sm hover:bg-brand-800 flex items-center justify-center gap-2">
              <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Nueva factura</span><span className="sm:hidden">Nueva</span>
            </button>
          </div>
        </header>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
          <KpiCard icon={<Wallet className="h-4 w-4" />} label="Recaudado" value={fmt(recaudado)} delta={{ value: "+12.4%", positive: true }} />
          <KpiCard icon={<TrendingUp className="h-4 w-4" />} label="Por cobrar" value={fmt(porCobrar)} hint={`${invoices.filter((f) => f.status === "pendiente").length} facturas`} />
          <KpiCard icon={<AlertCircle className="h-4 w-4" />} label="Vencidas" value={fmt(vencidas)} hint={`${invoices.filter((f) => f.status === "vencida").length} factura(s)`} emphasis={vencidas > 0 ? "risk" : "default"} />
          <KpiCard icon={<Receipt className="h-4 w-4" />} label="Emitidas" value={String(summary?.total ?? invoices.length)} hint="en total" />
        </div>

        <section className="rounded-xl bg-surface border border-line-200 shadow-soft overflow-hidden">
          <div className="px-3 sm:px-5 py-3 sm:py-4 border-b border-line-100 space-y-2 sm:space-y-0 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
            <h2 className="font-serif text-base sm:text-lg text-ink-900 sm:mr-auto">Movimientos recientes</h2>
            <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-line-200 bg-bg-100/40 sm:w-64">
              <Search className="h-3.5 w-3.5 text-ink-400 shrink-0" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar factura o paciente…"
                className="flex-1 bg-transparent text-sm text-ink-900 placeholder:text-ink-400 outline-none min-w-0"
              />
            </div>
            <div className="flex gap-1 p-1 rounded-md bg-bg-100 text-xs overflow-x-auto no-scrollbar">
              {(["Todas", "Pagadas", "Pendientes", "Vencidas"] as Filter[]).map((t) => (
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
                  <th className="text-left font-medium px-5 py-3">Factura</th>
                  <th className="text-left font-medium px-5 py-3">Paciente</th>
                  <th className="text-left font-medium px-5 py-3">Concepto</th>
                  <th className="text-left font-medium px-5 py-3">Fecha</th>
                  <th className="text-left font-medium px-5 py-3">Método</th>
                  <th className="text-right font-medium px-5 py-3">Valor</th>
                  <th className="text-left font-medium px-5 py-3">Estado</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((f) => (
                  <tr key={f.id} onClick={() => setDetail(f)} className="border-t border-line-100 hover:bg-brand-50/40 cursor-pointer transition-colors">
                    <td className="px-5 py-3.5 font-mono text-xs text-ink-700">{f.id}</td>
                    <td className="px-5 py-3.5 text-ink-900">{f.patient_name}</td>
                    <td className="px-5 py-3.5 text-ink-500">{f.concept}</td>
                    <td className="px-5 py-3.5 text-ink-500 tabular">{f.date}</td>
                    <td className="px-5 py-3.5 text-ink-500">{f.method}</td>
                    <td className="px-5 py-3.5 text-right tabular text-ink-900 font-medium">{fmt(f.amount)}</td>
                    <td className="px-5 py-3.5">
                      <span className={cn("text-[11px] px-2.5 py-1 rounded-full capitalize", ESTADO_STYLE[f.status])}>{f.status}</span>
                    </td>
                  </tr>
                ))}
                {isLoading && (
                  <tr><td colSpan={7} className="px-5 py-10 text-center text-sm text-ink-500"><Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Cargando…</td></tr>
                )}
                {!isLoading && !error && filtered.length === 0 && (
                  <tr><td colSpan={7} className="px-5 py-10 text-center text-sm text-ink-500">Sin facturas en este filtro.</td></tr>
                )}
                {error && (
                  <tr><td colSpan={7} className="px-5 py-10 text-center text-sm text-risk-high">No se pudo cargar desde el backend.</td></tr>
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

      {createOpen && <NewFacturaModal onClose={() => setCreateOpen(false)} />}
      {detail && <FacturaDetailModal factura={detail} onClose={() => setDetail(null)} />}
    </AppShell>
  );
}

function NewFacturaModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { data: patients = [] } = useQuery({ queryKey: ["patients"], queryFn: () => api.listPatients() });
  const [patientId, setPatientId] = useState("");
  const [concept, setConcept] = useState("Sesión individual TCC");
  const [amount, setAmount] = useState(180000);
  const [method, setMethod] = useState("Tarjeta");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  const mu = useMutation({
    mutationFn: () => {
      const p = patients.find((x) => x.id === patientId);
      return api.createInvoice({
        patient_id: patientId || null,
        patient_name: p?.name ?? "",
        professional: p?.professional ?? "",
        concept,
        amount,
        method,
        date,
        status: "pendiente",
      } as any);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["invoices-summary"] });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 backdrop-blur-sm p-4" onClick={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); mu.mutate(); }} className="w-full max-w-lg rounded-2xl bg-surface shadow-modal" onClick={(e) => e.stopPropagation()}>
        <header className="p-5 border-b border-line-100 flex items-start justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-brand-800 font-medium">Facturación</p>
            <h3 className="font-serif text-xl text-ink-900 mt-0.5">Nueva factura electrónica</h3>
            <p className="text-xs text-ink-500 mt-1">Se emitirá con formato DIAN compatible.</p>
          </div>
          <button type="button" onClick={onClose} className="h-9 w-9 rounded-md border border-line-200 text-ink-500 hover:border-brand-400 flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="p-5 space-y-3">
          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">Paciente</span>
            <select required value={patientId} onChange={(e) => setPatientId(e.target.value)} className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none hover:border-brand-400">
              <option value="">Selecciona un paciente…</option>
              {patients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">Concepto</span>
            <input value={concept} onChange={(e) => setConcept(e.target.value)} className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none hover:border-brand-400 focus:border-brand-700" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">Valor (COP)</span>
              <input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none hover:border-brand-400 focus:border-brand-700 tabular" />
              <p className="text-[11px] text-ink-500 mt-1">Total: {fmt(amount)}</p>
            </label>
            <label className="block">
              <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">Método</span>
              <select value={method} onChange={(e) => setMethod(e.target.value)} className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none hover:border-brand-400">
                <option>Tarjeta</option><option>PSE</option><option>Transferencia</option><option>Efectivo</option><option>Convenio EPS</option>
              </select>
            </label>
          </div>
          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">Fecha</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none hover:border-brand-400" />
          </label>
        </div>
        <footer className="p-4 border-t border-line-100 bg-bg-100/30 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-9 px-3 rounded-md border border-line-200 text-sm text-ink-700 hover:border-brand-400">Cancelar</button>
          <button type="submit" disabled={mu.isPending || !patientId} className="h-9 px-4 rounded-md bg-brand-700 text-primary-foreground text-sm font-medium hover:bg-brand-800 disabled:opacity-60 inline-flex items-center gap-2">
            {mu.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Emitir factura
          </button>
        </footer>
      </form>
    </div>
  );
}

function FacturaDetailModal({ factura, onClose }: { factura: Invoice; onClose: () => void }) {
  const [payOpen, setPayOpen] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-surface shadow-modal" onClick={(e) => e.stopPropagation()}>
        <header className="p-5 border-b border-line-100 flex items-start justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-brand-800 font-medium font-mono">{factura.id}</p>
            <h3 className="font-serif text-xl text-ink-900 mt-0.5">{factura.concept}</h3>
            <p className="text-xs text-ink-500 mt-1">{factura.patient_name} · {factura.date}</p>
          </div>
          <button onClick={onClose} className="h-9 w-9 rounded-md border border-line-200 text-ink-500 hover:border-brand-400 flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="p-5 space-y-3">
          <div className="rounded-lg border border-line-200 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-ink-500 uppercase tracking-wider">Total</span>
              <span className={cn("text-[11px] px-2.5 py-1 rounded-full capitalize", ESTADO_STYLE[factura.status])}>{factura.status}</span>
            </div>
            <div className="font-serif text-3xl text-ink-900 tabular mt-2">{fmt(factura.amount)}</div>
            <div className="text-xs text-ink-500 mt-1">Método: {factura.method}</div>
          </div>
          <div className="rounded-lg border border-line-200 p-3 text-xs space-y-1.5">
            <div className="flex justify-between"><span className="text-ink-500">Subtotal</span><span className="tabular text-ink-900">{fmt(Math.round(factura.amount / 1.19))}</span></div>
            <div className="flex justify-between"><span className="text-ink-500">IVA 19%</span><span className="tabular text-ink-900">{fmt(factura.amount - Math.round(factura.amount / 1.19))}</span></div>
            <div className="flex justify-between pt-1.5 border-t border-line-100"><span className="text-ink-700 font-medium">Total</span><span className="tabular text-ink-900 font-medium">{fmt(factura.amount)}</span></div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button className="h-10 rounded-md border border-line-200 text-xs text-ink-700 hover:border-brand-400 inline-flex items-center justify-center gap-1.5">
              <FileText className="h-3.5 w-3.5" /> PDF
            </button>
            <button className="h-10 rounded-md border border-line-200 text-xs text-ink-700 hover:border-brand-400 inline-flex items-center justify-center gap-1.5">
              <Send className="h-3.5 w-3.5" /> Reenviar
            </button>
            {factura.status !== "pagada" && (
              <button
                onClick={() => setPayOpen(true)}
                className="h-10 rounded-md bg-brand-700 text-primary-foreground text-xs font-medium hover:bg-brand-800 inline-flex items-center justify-center gap-1.5"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Marcar pagada
              </button>
            )}
          </div>
        </div>

        {payOpen && <MarkPaidModal factura={factura} onClose={() => setPayOpen(false)} onSaved={() => { setPayOpen(false); onClose(); }} />}
      </div>
    </div>
  );
}

function MarkPaidModal({ factura, onClose, onSaved }: { factura: Invoice; onClose: () => void; onSaved: () => void }) {
  const qc = useQueryClient();
  const [method, setMethod] = useState(factura.method || "Tarjeta");
  const [paidDate, setPaidDate] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  const mu = useMutation({
    mutationFn: () => api.updateInvoice(factura.id, {
      status: "pagada",
      method,
      // La referencia/fecha de pago/notas las agrupamos en el campo method por ahora (schema no expone campos dedicados)
      concept: reference ? `${factura.concept} · Ref: ${reference}${notes ? ` · ${notes}` : ""} · Pagada ${paidDate}` : factura.concept,
    } as any),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["invoices-summary"] });
      onSaved();
    },
  });

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink-900/50 backdrop-blur-sm p-4" onClick={onClose}>
      <form
        onSubmit={(e) => { e.preventDefault(); mu.mutate(); }}
        className="w-full max-w-md rounded-2xl bg-surface shadow-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="p-5 border-b border-line-100 flex items-start justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-brand-800 font-medium">Registrar pago</p>
            <h3 className="font-serif text-xl text-ink-900 mt-0.5">Marcar factura {factura.id} como pagada</h3>
            <p className="text-xs text-ink-500 mt-1">{factura.patient_name} · {fmt(factura.amount)}</p>
          </div>
          <button type="button" onClick={onClose} className="h-9 w-9 rounded-md border border-line-200 text-ink-500 hover:border-brand-400 flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="p-5 space-y-3">
          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">Método de pago real</span>
            <select required value={method} onChange={(e) => setMethod(e.target.value)} className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none hover:border-brand-400">
              <option>Tarjeta</option>
              <option>PSE</option>
              <option>Transferencia</option>
              <option>Efectivo</option>
              <option>Nequi</option>
              <option>Daviplata</option>
              <option>Bancolombia</option>
              <option>Convenio EPS</option>
            </select>
          </label>
          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">Fecha de pago</span>
            <input type="date" required value={paidDate} onChange={(e) => setPaidDate(e.target.value)} className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none hover:border-brand-400" />
          </label>
          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">Referencia / Número de aprobación</span>
            <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Ej. ABC12345 o últimos 4 de tarjeta" className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700 tabular" />
          </label>
          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">Notas internas</span>
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional: comentarios del cobro…" className="mt-1 w-full px-3 py-2 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700" />
          </label>
        </div>
        <footer className="p-4 border-t border-line-100 bg-bg-100/30 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-9 px-3 rounded-md border border-line-200 text-sm text-ink-700 hover:border-brand-400">Cancelar</button>
          <button type="submit" disabled={mu.isPending} className="h-9 px-4 rounded-md bg-brand-700 text-primary-foreground text-sm font-medium hover:bg-brand-800 disabled:opacity-60 inline-flex items-center gap-2">
            {mu.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Confirmar pago
          </button>
        </footer>
      </form>
    </div>
  );
}
