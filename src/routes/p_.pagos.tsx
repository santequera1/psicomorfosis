import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Receipt, Download, Loader2, AlertCircle, RefreshCw } from "lucide-react";
import { PortalShell } from "@/components/portal/PortalShell";
import { api } from "@/lib/api";

export const Route = createFileRoute("/p_/pagos")({
  head: () => ({ meta: [{ title: "Pagos · Mi portal" }] }),
  component: PortalPayments,
});

const STATUS_STYLE: Record<string, { label: string; bg: string }> = {
  pagada:    { label: "Pagada",    bg: "bg-sage-200/40 text-sage-700" },
  pendiente: { label: "Pendiente", bg: "bg-warning-soft text-risk-moderate" },
  vencida:   { label: "Vencida",   bg: "bg-rose-500/10 text-rose-700" },
};

const fmtCOP = (n: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n ?? 0);

function fmtFecha(iso: string | null | undefined) {
  if (!iso) return "";
  try {
    return new Date(`${String(iso).slice(0, 10)}T12:00:00`).toLocaleDateString("es-CO", {
      day: "numeric", month: "long", year: "numeric",
    });
  } catch {
    return String(iso);
  }
}

function PortalPayments() {
  const { data: invoices = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["portal-invoices"],
    queryFn: () => api.portalInvoices(),
  });
  const [downloading, setDownloading] = useState<string | null>(null);

  async function download(inv: Record<string, any>) {
    setDownloading(inv.id);
    try {
      const blob = await api.portalInvoicePdf(inv.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `recibo-${inv.id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("No pudimos generar el PDF. Intenta de nuevo en un momento.");
    } finally {
      setDownloading(null);
    }
  }

  const totalPagado = invoices
    .filter((i) => i.status === "pagada")
    .reduce((sum, i) => sum + (Number(i.amount) || 0), 0);

  return (
    <PortalShell>
      <header className="mb-8">
        <p className="text-xs uppercase tracking-widest text-brand-700 font-semibold">Tus pagos</p>
        <h1 className="font-serif text-3xl text-ink-900 mt-1">Pagos</h1>
        <p className="text-sm text-ink-500 mt-2">
          Los recibos de pago que tu consultorio ha registrado. Puedes descargar cada uno en PDF.
        </p>
      </header>

      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-ink-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : isError ? (
        <div className="rounded-2xl border border-line-200 bg-surface p-8 text-center">
          <AlertCircle className="h-8 w-8 text-rose-600 mx-auto" />
          <p className="mt-3 text-sm text-ink-700">No pudimos cargar tus recibos.</p>
          <button
            onClick={() => refetch()}
            className="mt-4 inline-flex items-center gap-2 h-10 px-4 rounded-xl border border-line-200 text-sm text-ink-700 hover:border-brand-400"
          >
            <RefreshCw className="h-4 w-4" /> Reintentar
          </button>
        </div>
      ) : invoices.length === 0 ? (
        <div className="rounded-2xl border border-line-200 bg-surface p-10 text-center">
          <Receipt className="h-8 w-8 text-ink-300 mx-auto" />
          <p className="mt-3 text-sm text-ink-500">Aún no tienes recibos registrados.</p>
        </div>
      ) : (
        <>
          {totalPagado > 0 && (
            <p className="mb-4 text-sm text-ink-500">
              Total pagado: <span className="font-semibold text-ink-900 tabular">{fmtCOP(totalPagado)}</span>
              {" · "}{invoices.filter((i) => i.status === "pagada").length} recibo(s)
            </p>
          )}
          <ul className="space-y-3">
            {invoices.map((inv) => {
              const st = STATUS_STYLE[inv.status] ?? { label: inv.status, bg: "bg-bg-100 text-ink-500" };
              return (
                <li key={inv.id} className="rounded-2xl border border-line-200 bg-surface p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex items-center text-[10px] uppercase tracking-[0.06em] px-2 py-0.5 rounded-full font-medium ${st.bg}`}>
                          {st.label}
                        </span>
                        <span className="text-[11px] text-ink-400 tabular">{inv.id}</span>
                      </div>
                      <p className="mt-1.5 text-sm font-semibold text-ink-900 truncate">
                        {inv.concept || "Sesión de psicoterapia"}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-500">
                        {fmtFecha(inv.date)}
                        {inv.professional ? ` · ${inv.professional}` : ""}
                        {inv.method ? ` · ${String(inv.method).charAt(0).toUpperCase()}${String(inv.method).slice(1)}` : ""}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-base font-semibold text-ink-900 tabular">{fmtCOP(Number(inv.amount) || 0)}</p>
                      <button
                        onClick={() => download(inv)}
                        disabled={downloading === inv.id}
                        className="mt-2 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-line-200 text-xs text-ink-700 hover:border-brand-400 disabled:opacity-50"
                      >
                        {downloading === inv.id
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Download className="h-3.5 w-3.5" />}
                        PDF
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </PortalShell>
  );
}
