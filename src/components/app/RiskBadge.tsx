import { cn } from "@/lib/utils";
import type { Risk, RiskType } from "@/lib/mock-data";
import { RISK_LABEL, RISK_LABEL_SHORT, RISK_TYPE_LABEL } from "@/lib/mock-data";

const STYLES: Record<Risk, { bg: string; text: string; ring: string; dot: string }> = {
  none:     { bg: "bg-bg-100",       text: "text-ink-500",       ring: "ring-line-200",         dot: "bg-ink-300" },
  low:      { bg: "bg-success-soft", text: "text-success",       ring: "ring-success/20",       dot: "bg-success" },
  moderate: { bg: "bg-warning-soft", text: "text-risk-moderate", ring: "ring-risk-moderate/25", dot: "bg-risk-moderate" },
  high:     { bg: "bg-error-soft",   text: "text-risk-high",     ring: "ring-risk-high/30",     dot: "bg-risk-high" },
  critical: { bg: "bg-error-soft",   text: "text-risk-critical", ring: "ring-risk-critical/40", dot: "bg-risk-critical" },
};

export function RiskBadge({
  risk,
  types,
  compact = false,
}: {
  risk: Risk;
  types?: RiskType[];
  compact?: boolean;
}) {
  const s = STYLES[risk];
  const typeLabels = (types ?? []).map((t) => RISK_TYPE_LABEL[t]).filter(Boolean);
  const label = typeLabels.length > 0
    ? `${typeLabels.join(" · ")} · ${RISK_LABEL_SHORT[risk]}`
    : RISK_LABEL[risk];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full ring-1 font-medium",
        s.bg, s.text, s.ring,
        compact ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
      )}
      aria-label={label}
    >
      <span
        className={cn(
          "rounded-full shrink-0",
          s.dot,
          risk === "critical" && "ring-2 ring-risk-critical/40 animate-pulse",
          compact ? "h-2 w-2" : "h-2.5 w-2.5",
        )}
      />
      {label}
    </span>
  );
}

/** Dot solo, sin texto. Útil para celdas estrechas o iconos inline. */
export function RiskDot({ risk, className }: { risk: Risk; className?: string }) {
  const s = STYLES[risk];
  return (
    <span
      aria-label={RISK_LABEL[risk]}
      title={RISK_LABEL[risk]}
      className={cn(
        "inline-block h-2.5 w-2.5 rounded-full shrink-0",
        s.dot,
        risk === "critical" && "ring-2 ring-risk-critical/40 animate-pulse",
        className,
      )}
    />
  );
}
