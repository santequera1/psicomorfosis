import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { easeOutExpo } from "./motion";

/**
 * Píldora flotante con leve movimiento vertical. Se posiciona sobre
 * los screenshots para sugerir "actividad real" sin animar el
 * contenido de la screenshot misma (que es estática).
 *
 * Usa whileInView para entrar suavemente — no anima hasta que el
 * usuario llega a la sección. delay distinto por cada uno para crear
 * un staccato natural.
 */
export type FloatingBadgePosition = {
  top?: string;
  bottom?: string;
  left?: string;
  right?: string;
};

interface FloatingBadgeProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  tone?: "brand" | "success" | "neutral";
  /** Posición absolute respecto del wrapper relative del screenshot */
  position: FloatingBadgePosition;
  /** Delay en segundos para escalonar la aparición */
  delay?: number;
  /** Sutil flotación vertical infinita — diferente fase por badge */
  floatPhase?: number;
}

const TONE: Record<NonNullable<FloatingBadgeProps["tone"]>, string> = {
  brand: "bg-brand-50/95 text-brand-800 border-brand-200/70",
  success: "bg-emerald-50/95 text-emerald-800 border-emerald-200/70",
  neutral: "bg-surface/95 text-ink-700 border-line-200",
};

export function FloatingBadge({
  icon: Icon,
  label,
  tone = "brand",
  position,
  delay = 0,
  floatPhase = 0,
}: FloatingBadgeProps) {
  return (
    <motion.div
      className={cn(
        "absolute z-10 inline-flex items-center gap-2 px-3 py-2 rounded-full border backdrop-blur-md shadow-lg shadow-black/5 text-xs font-medium pointer-events-none",
        TONE[tone],
      )}
      style={position}
      initial={{ opacity: 0, y: 12, scale: 0.94 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.7, ease: easeOutExpo, delay }}
    >
      <motion.span
        className="inline-flex items-center gap-2"
        animate={{ y: [-2, 2, -2] }}
        transition={{
          duration: 4,
          repeat: Infinity,
          ease: "easeInOut",
          delay: floatPhase,
        }}
      >
        <Icon className="h-3.5 w-3.5" />
        {label}
      </motion.span>
    </motion.div>
  );
}
