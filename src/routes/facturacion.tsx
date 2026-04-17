import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { KpiCard } from "@/components/app/KpiCard";
import { Receipt, TrendingUp, Wallet, AlertCircle, Download, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/facturacion")({
  head: () => ({ meta: [{ title: "Facturación — Psicomorfosis" }] }),
  component: FacturacionPage,
});

type Estado = "pagada" | "pendiente" | "vencida" | "borrador";

const FACTURAS: Array<{ id: string; paciente: string; fecha: string; concepto: string; valor: number; estado: Estado; metodo: string }> = [
  { id: "F-2025-0184", paciente: "María Camila Rondón",   fecha: "12 abr 2025", concepto: "Sesión individual TCC",     valor: 180000, estado: "pagada",    metodo: "Tarjeta" },
  { id: "F-2025-0183", paciente: "Andrés F. Galeano",     fecha: "11 abr 2025", concepto: "Sesión individual + valoración", valor: 240000, estado: "pendiente", metodo: "PSE" },
  { id: "F-2025-0182", paciente: "Familia Ortega-Pinilla",fecha: "10 abr 2025", concepto: "Sesión familiar",            valor: 260000, estado: "pagada",    metodo: "Transferencia" },
  { id: "F-2025-0181", paciente: "Sara Liliana Beltrán",  fecha: "09 abr 2025", concepto: "Paquete 4 sesiones",         valor: 640000, estado: "pendiente", metodo: "Convenio" },
  { id: "F-2025-0180", paciente: "Jorge & Patricia Lemus",fecha: "05 abr 2025", concepto: "Sesión de pareja",           valor: 220000, estado: "vencida",   metodo: "Tarjeta" },
  { id: "F-2025-0179", paciente: "Laura Restrepo Vélez",  fecha: "03 abr 2025", concepto: "Telepsicología",             valor: 160000, estado: "pagada",    metodo: "PSE" },
  { id: "F-2025-0178", paciente: "Tomás Aristizábal",     fecha: "01 abr 2025", concepto: "Sesión individual",          valor: 180000, estado: "borrador",  metodo: "—" },
];

const ESTADO_STYLE: Record<Estado, string> = {
  pagada:    "bg-success-soft text-success border border-success/20",
  pendiente: "bg-warning-soft text-warning border border-warning/20",
  vencida:   "bg-error-soft text-error border border-error/20",
  borrador:  "bg-bg-100 text-ink-500 border border-line-200",
};

const fmt = (n: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

function FacturacionPage() {
  return (
    <AppShell>
      <div className="px-8 py-8 max-w-[1280px] mx-auto">
        <header className="flex items-end justify-between mb-6">
          <div>
            <div className="text-xs uppercase tracking-[0.14em] text-brand-700 font-semibold">Gestión financiera</div>
            <h1 className="font-serif text-3xl text-ink-900 mt-1">Facturación</h1>
            <p className="text-sm text-ink-500 mt-1">Movimientos del mes en curso · Abril 2025</p>
          </div>
          <div className="flex gap-2">
            <button className="h-10 px-4 rounded-lg border border-line-200 bg-surface text-sm text-ink-700 hover:border-brand-400 flex items-center gap-2">
              <Download className="h-4 w-4" /> Exportar
            </button>
            <button className="h-10 px-4 rounded-lg bg-brand-700 text-primary-foreground text-sm hover:bg-brand-800 flex items-center gap-2">
              <Plus className="h-4 w-4" /> Nueva factura
            </button>
          </div>
        </header>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <KpiCard icon={<Wallet className="h-4 w-4" />} label="Recaudado mes" value={fmt(18420000)} delta={{ value: "+12.4%", positive: true }} />
          <KpiCard icon={<TrendingUp className="h-4 w-4" />} label="Por cobrar" value={fmt(2880000)} hint="6 facturas" />
          <KpiCard icon={<AlertCircle className="h-4 w-4" />} label="Vencidas" value={fmt(220000)} hint="1 factura" emphasis="risk" />
          <KpiCard icon={<Receipt className="h-4 w-4" />} label="Emitidas" value="184" hint="este mes" />
        </div>

        <section className="rounded-xl bg-surface border border-line-200 shadow-soft overflow-hidden">
          <div className="px-5 py-4 border-b border-line-100 flex items-center justify-between">
            <h2 className="font-serif text-lg text-ink-900">Movimientos recientes</h2>
            <div className="flex gap-1.5 text-xs">
              {(["Todas", "Pagadas", "Pendientes", "Vencidas"] as const).map((t, i) => (
                <button key={t} className={cn("px-3 py-1.5 rounded-md", i === 0 ? "bg-brand-100 text-brand-800" : "text-ink-500 hover:text-ink-900")}>{t}</button>
              ))}
            </div>
          </div>
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
              {FACTURAS.map((f) => (
                <tr key={f.id} className="border-t border-line-100 hover:bg-bg-50">
                  <td className="px-5 py-3.5 font-mono text-xs text-ink-700">{f.id}</td>
                  <td className="px-5 py-3.5 text-ink-900">{f.paciente}</td>
                  <td className="px-5 py-3.5 text-ink-500">{f.concepto}</td>
                  <td className="px-5 py-3.5 text-ink-500">{f.fecha}</td>
                  <td className="px-5 py-3.5 text-ink-500">{f.metodo}</td>
                  <td className="px-5 py-3.5 text-right tabular text-ink-900 font-medium">{fmt(f.valor)}</td>
                  <td className="px-5 py-3.5">
                    <span className={cn("text-[11px] px-2.5 py-1 rounded-full capitalize", ESTADO_STYLE[f.estado])}>{f.estado}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </AppShell>
  );
}
