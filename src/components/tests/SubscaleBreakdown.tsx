import { cn } from "@/lib/utils";

/**
 * Muestra el breakdown del score total por subescala. Lo usan tests
 * como BIS-11 que tienen un score total + sub-scores por dimensión
 * (atencional, motora, no planeada). El score por subescala es la
 * suma de los ítems de esa subescala respetando la regla de reverse
 * del test (calculado en backend, llega en alerts_json.subscales).
 *
 * Cada barra muestra valor + máximo teórico para dar contexto sin
 * tener que conocer las tablas del test.
 */
export interface SubscaleItem {
  key: string;
  label: string;
  score: number;
  items_count: number;
  answered_count: number;
}

export function SubscaleBreakdown({
  subscales,
  scaleMax,
}: {
  subscales: SubscaleItem[];
  /** Valor máximo de un ítem en la escala (ej. 4 para Likert 1-4).
   *  Usado para calcular el máximo teórico de cada subescala
   *  (items_count * scaleMax) y dibujar la barra de progreso. */
  scaleMax: number;
}) {
  if (!subscales || subscales.length === 0) return null;
  return (
    <div className="mt-5 rounded-lg border border-line-200 bg-bg-50/40 p-4">
      <h4 className="text-[11px] uppercase tracking-widest text-ink-500 font-medium mb-3">
        Resultado por subescala
      </h4>
      <ul className="space-y-2.5">
        {subscales.map((s) => {
          const max = s.items_count * scaleMax;
          // Mínimo teórico = items_count * 1 (no 0 — la escala parte en 1)
          // Pero para la barra de "% relativo" usamos rango completo 0..max
          // para que se entienda visualmente.
          const pct = max > 0 ? Math.round((s.score / max) * 100) : 0;
          // Tono de la barra: bajo/medio/alto según pct. Estos cortes son
          // sólo visuales (no clínicos) — la interpretación real vive en
          // las tablas del test.
          const tone = pct < 50
            ? "bg-sage-500"
            : pct < 75
            ? "bg-warning"
            : "bg-risk-high";
          return (
            <li key={s.key}>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-ink-900 font-medium">{s.label}</span>
                <span className="tabular text-ink-700">
                  <span className="font-semibold">{s.score}</span>
                  <span className="text-ink-400"> / {max}</span>
                </span>
              </div>
              <div className="h-2 bg-line-100 rounded-full overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all", tone)}
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              </div>
              {s.answered_count < s.items_count && (
                <p className="text-[11px] text-ink-400 mt-1">
                  {s.answered_count} de {s.items_count} ítems respondidos
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
