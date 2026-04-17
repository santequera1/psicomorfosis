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
        "rounded-xl border bg-surface px-5 py-4 shadow-xs hover:shadow-soft transition-shadow",
        isRisk ? "border-risk-high/30 bg-error-soft/40" : "border-line-200"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-[12px] uppercase tracking-[0.08em] text-ink-500 font-medium">{label}</div>
        {icon && <div className={cn("h-7 w-7 rounded-md flex items-center justify-center", isRisk ? "bg-risk-high/10 text-risk-high" : "bg-brand-50 text-brand-700")}>{icon}</div>}
      </div>
      <div className={cn("mt-2 font-serif text-[28px] leading-none tabular", isRisk ? "text-risk-high" : "text-ink-900")}>
        {value}
      </div>
      <div className="mt-2 flex items-center gap-2 text-xs">
        {delta && !delta.neutral && (
          <span className={cn(
            "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md font-medium tabular",
            delta.positive ? "bg-success-soft text-success" : "bg-error-soft text-error"
          )}>
            {delta.positive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {delta.value}
          </span>
        )}
        {hint && <span className="text-ink-500">{hint}</span>}
      </div>
    </div>
  );
}
