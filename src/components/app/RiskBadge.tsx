import { cn } from "@/lib/utils";
import type { Risk } from "@/lib/mock-data";
import { RISK_LABEL } from "@/lib/mock-data";
import { ShieldAlert, ShieldCheck, AlertTriangle, AlertOctagon, Shield } from "lucide-react";

const STYLES: Record<Risk, { bg: string; text: string; ring: string; Icon: React.ComponentType<{ className?: string }> }> = {
  none:     { bg: "bg-bg-100",       text: "text-ink-500",        ring: "ring-line-200",                Icon: Shield },
  low:      { bg: "bg-success-soft", text: "text-success",        ring: "ring-success/20",              Icon: ShieldCheck },
  moderate: { bg: "bg-warning-soft", text: "text-risk-moderate",  ring: "ring-risk-moderate/25",        Icon: AlertTriangle },
  high:     { bg: "bg-error-soft",   text: "text-risk-high",      ring: "ring-risk-high/30",            Icon: ShieldAlert },
  critical: { bg: "bg-error-soft",   text: "text-risk-critical",  ring: "ring-risk-critical/40",        Icon: AlertOctagon },
};

export function RiskBadge({ risk, compact = false }: { risk: Risk; compact?: boolean }) {
  const s = STYLES[risk];
  const I = s.Icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full ring-1 font-medium",
        s.bg, s.text, s.ring,
        compact ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs"
      )}
      aria-label={RISK_LABEL[risk]}
    >
      <I className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
      {RISK_LABEL[risk]}
    </span>
  );
}
