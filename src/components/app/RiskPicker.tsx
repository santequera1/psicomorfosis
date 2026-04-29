import {
  type Risk,
  type RiskType,
  RISK_LABEL_SHORT,
  RISK_TYPE_LABEL,
  RISK_TYPE_DESCRIPTION,
  riskHint,
} from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { AlertTriangle, Info } from "lucide-react";

const LEVELS: { value: Risk; label: string; dot: string; ring: string; bg: string; text: string }[] = [
  { value: "none",     label: RISK_LABEL_SHORT.none,     dot: "bg-ink-300",         ring: "ring-line-300",                bg: "bg-bg-100",       text: "text-ink-700"        },
  { value: "low",      label: RISK_LABEL_SHORT.low,      dot: "bg-success",         ring: "ring-success/40",              bg: "bg-success-soft", text: "text-success"        },
  { value: "moderate", label: RISK_LABEL_SHORT.moderate, dot: "bg-risk-moderate",   ring: "ring-risk-moderate/40",        bg: "bg-warning-soft", text: "text-risk-moderate"  },
  { value: "high",     label: RISK_LABEL_SHORT.high,     dot: "bg-risk-high",       ring: "ring-risk-high/40",            bg: "bg-error-soft",   text: "text-risk-high"      },
  { value: "critical", label: RISK_LABEL_SHORT.critical, dot: "bg-risk-critical",   ring: "ring-risk-critical/50",        bg: "bg-error-soft",   text: "text-risk-critical"  },
];

const TYPES: RiskType[] = [
  "suicida", "autolesion", "heteroagresion", "abandono_tto", "reagudizacion", "descompensacion",
];

export function RiskPicker({
  level,
  types,
  onLevelChange,
  onTypesChange,
}: {
  level: Risk;
  types: RiskType[];
  onLevelChange: (r: Risk) => void;
  onTypesChange: (t: RiskType[]) => void;
}) {
  const hint = riskHint(level, types);
  const incoherent = level !== "none" && types.length === 0;

  function toggleType(t: RiskType) {
    if (types.includes(t)) onTypesChange(types.filter((x) => x !== t));
    else onTypesChange([...types, t]);
  }

  return (
    <div className="space-y-3">
      {/* Tipos de riesgo (multi-select de chips) */}
      <div>
        <label className="text-xs uppercase tracking-widest text-ink-500 font-medium">
          Tipo de riesgo <span className="text-ink-400 normal-case tracking-normal">(opcional, multi)</span>
        </label>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {TYPES.map((t) => {
            const active = types.includes(t);
            return (
              <button
                key={t}
                type="button"
                onClick={() => toggleType(t)}
                title={RISK_TYPE_DESCRIPTION[t]}
                className={cn(
                  "h-8 px-3 rounded-full text-xs font-medium transition-colors border",
                  active
                    ? "bg-brand-700 text-primary-foreground border-brand-700"
                    : "bg-surface text-ink-700 border-line-200 hover:border-brand-400",
                )}
              >
                {RISK_TYPE_LABEL[t]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Nivel de riesgo (radio coloreado) */}
      <div>
        <label className="text-xs uppercase tracking-widest text-ink-500 font-medium">Nivel</label>
        <div className="mt-1.5 grid grid-cols-5 gap-1.5">
          {LEVELS.map((l) => {
            const active = level === l.value;
            return (
              <button
                key={l.value}
                type="button"
                onClick={() => onLevelChange(l.value)}
                aria-pressed={active}
                className={cn(
                  "h-10 rounded-md border text-xs font-medium transition-all flex items-center justify-center gap-1.5",
                  active
                    ? cn(l.bg, l.text, "ring-2", l.ring, "border-transparent")
                    : "bg-surface text-ink-700 border-line-200 hover:border-brand-400",
                )}
              >
                <span
                  className={cn(
                    "h-2.5 w-2.5 rounded-full shrink-0",
                    l.dot,
                    l.value === "critical" && active && "ring-2 ring-risk-critical/40 animate-pulse",
                  )}
                />
                {l.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Hint contextual */}
      {hint && (
        <div className={cn(
          "rounded-md p-3 text-xs flex items-start gap-2",
          level === "critical"
            ? "bg-error-soft text-risk-critical border border-risk-critical/30"
            : "bg-brand-50/60 text-ink-700 border border-brand-700/15",
        )}>
          {level === "critical"
            ? <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            : <Info className="h-4 w-4 shrink-0 mt-0.5 text-brand-700" />}
          <span>{hint}</span>
        </div>
      )}

      {incoherent && (
        <div className="rounded-md p-3 text-xs flex items-start gap-2 bg-warning-soft text-risk-moderate border border-risk-moderate/25">
          <Info className="h-4 w-4 shrink-0 mt-0.5" />
          <span>Si marcaste un nivel de riesgo, indica al menos un <strong>tipo</strong> para que quede claro de qué riesgo se trata.</span>
        </div>
      )}
    </div>
  );
}
