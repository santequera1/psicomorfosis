import { cn } from "@/lib/utils";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

interface KpiCardProps {
  label: string;
  value: string;
  delta?: { value: string; positive?: boolean; neutral?: boolean };
  hint?: string;
  emphasis?: "default" | "risk";
  icon?: React.ReactNode;
}

export function KpiCard({ label, value, delta, hint, emphasis = "default", icon }: KpiCardProps) {
  const isRisk = emphasis === "risk";
  return (
    <div
      className={cn(
        "rounded-xl border bg-surface px-3 py-3 sm:px-5 sm:py-4 shadow-xs hover:shadow-soft transition-shadow min-w-0",
        isRisk ? "border-risk-high/30 bg-error-soft/40" : "border-line-200"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-[10px] sm:text-[12px] uppercase tracking-[0.08em] text-ink-500 font-medium leading-tight">{label}</div>
        {icon && <div className={cn("h-7 w-7 rounded-md flex items-center justify-center shrink-0", isRisk ? "bg-risk-high/10 text-risk-high" : "bg-brand-50 text-brand-700")}>{icon}</div>}
      </div>
      <div className={cn(
        "mt-2 font-serif leading-none tabular truncate",
        // Texto del valor escalado: en mobile más pequeño para que números como
        // "$ 900.000" o "$ 1.234.567" no rompan la card.
        "text-xl sm:text-2xl md:text-[28px]",
        isRisk ? "text-risk-high" : "text-ink-900"
      )} title={value}>
        {value}
      </div>
      <div className="mt-2 flex items-center gap-2 text-[11px] sm:text-xs flex-wrap">
        {delta && !delta.neutral && (
          <span className={cn(
            "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md font-medium tabular",
            delta.positive ? "bg-success-soft text-success" : "bg-error-soft text-error"
          )}>
            {delta.positive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {delta.value}
          </span>
        )}
        {hint && <span className="text-ink-500 truncate">{hint}</span>}
      </div>
    </div>
  );
}
