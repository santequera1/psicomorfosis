/**
 * Tarjeta visual del wallet bancario.
 *
 * Replica el aspecto general de una tarjeta de débito física (chip EMV
 * con símbolo NFC, brand mastercard/visa esquina inferior derecha,
 * label arriba a la izquierda, logo del banco grande). El color y la
 * decoración vienen del catálogo en lib/banks.ts según el bankId.
 *
 * Tiene tres tamaños:
 *   - sm: para listas comprimidas y selector en modal de recibo
 *   - md (default): para vista wallet en /facturacion
 *   - xs: chip para lista de recibos (sin chip ni brand, solo cabecera)
 *
 * No usamos logos comerciales reales — usamos texto estilizado con la
 * tipografía y color característicos de cada banco. Es suficiente para
 * que el usuario reconozca de un vistazo a qué cuenta corresponde la
 * tarjeta, y evita problemas de marca registrada al usar logos.
 */

import { cn } from "@/lib/utils";
import { getBankStyle, type BankBrand, type CardBrand } from "@/lib/banks";

export interface BankCardProps {
  bankId: string;
  label: string;
  last4?: string | null;
  holderName?: string | null;
  accountType?: string | null;
  brand?: CardBrand | null;
  size?: "xs" | "strip" | "mini" | "sm" | "md";
  /** Click sobre la tarjeta entera. */
  onClick?: () => void;
  /** Slot superior derecho — para acciones (editar/eliminar) sobre la tarjeta. */
  actionsSlot?: React.ReactNode;
  /** Resalta la tarjeta como seleccionada. */
  selected?: boolean;
  className?: string;
}

// Bordes y proporciones por tamaño. Las tarjetas físicas tienen ratio
// 1.585:1 (85.6mm × 53.98mm). Usamos aspect-video (1.78) — más
// alargado que el ratio real para que dentro del KPI estrecho del
// grid se vea como rectángulo de tarjeta y no como cuadrado. El
// border-radius se reduce a rounded (4px), más cercano al radio
// físico real (~8px) escalado a la baja resolución del mini.
const SIZE_CLASS = {
  xs: "h-10 px-3 py-1.5 rounded text-[11px]",
  // mini: aspect-ratio garantizado, ancho controlado por el padre.
  // Ej: padre w-[120px] → tarjeta 120×68. Padre 220px → 220×124.
  mini: "aspect-video px-3 py-2 rounded",
  sm: "aspect-video p-4 rounded-md",
  md: "aspect-video p-5 rounded-md",
};

export function BankCard({
  bankId, label, last4, holderName, accountType, brand,
  size = "md", onClick, actionsSlot, selected, className,
}: BankCardProps) {
  const s = getBankStyle(bankId);
  const isXs = size === "xs";

  // Variante chip pequeño: solo color de fondo + texto, sin chip EMV
  // ni decoración. Se usa en la lista de recibos para indicar
  // "este recibo se cobró en X cuenta".
  if (isXs) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 font-medium shrink-0 max-w-full",
          s.cardBg, s.textColor, SIZE_CLASS.xs,
          className,
        )}
        title={`${s.name} · ${label}`}
      >
        <span className={cn("font-semibold tracking-tight", logoFontClass(s.logoFont))}>
          {s.logoText}
        </span>
        <span className="opacity-80 truncate">·</span>
        <span className="truncate opacity-90">{label}</span>
        {last4 && <span className="opacity-70 tabular ml-1">··{last4}</span>}
      </span>
    );
  }

  // Variante strip: franja horizontal minimalista (full-width, ~44px alto).
  // Sin colores extravagantes, sin gradientes, sin decoración SVG —
  // estética neutra que combina con el resto del UI. El color del banco
  // queda solo como un pequeño dot a la izquierda (acento sutil).
  if (size === "strip") {
    const Comp = (onClick ? "button" : "div") as "button" | "div";
    return (
      <Comp
        type={onClick ? "button" : undefined}
        onClick={onClick}
        className={cn(
          "w-full text-left flex items-center gap-2.5 h-11 px-3 rounded-lg border border-line-200 bg-surface",
          onClick && "hover:border-brand-400 hover:bg-bg-50/60 cursor-pointer transition-colors",
          selected && "border-brand-700 bg-brand-50/40",
          className,
        )}
        title={`${s.name} · ${label}`}
      >
        {/* Dot del color del banco — único acento de color */}
        <span
          className={cn("h-2 w-2 rounded-full shrink-0", s.cardBg)}
          aria-hidden
        />
        <span className="text-sm font-medium text-ink-900 shrink-0">{s.name}</span>
        <span className="text-ink-300 shrink-0">·</span>
        <span className="text-sm text-ink-500 truncate flex-1 min-w-0">{label}</span>
        {last4 && (
          <span className="tabular text-xs font-medium text-ink-500 shrink-0">··{last4}</span>
        )}
        {actionsSlot && <span className="shrink-0">{actionsSlot}</span>}
      </Comp>
    );
  }

  // Variante mini: compacta para listas / KPI cards. Banco arriba,
  // chip EMV pequeño en el centro (le da la lectura de "tarjeta
  // física" — sin él se sentía más como un pin de aplicación que
  // como una tarjeta), holder + last4 abajo izquierda, brand abajo
  // derecha.
  if (size === "mini") {
    const Comp = (onClick ? "button" : "div") as "button" | "div";
    return (
      <Comp
        type={onClick ? "button" : undefined}
        onClick={onClick}
        className={cn(
          "relative w-full text-left overflow-hidden flex flex-col justify-between",
          SIZE_CLASS.mini,
          s.cardBg, s.textColor,
          onClick && "hover:shadow-card cursor-pointer transition-shadow",
          selected && "ring-2 ring-offset-1 ring-brand-700",
          className,
        )}
      >
        {s.decorative && s.decorativeStrokes && (
          <DecoStrokes colors={s.decorativeStrokes} />
        )}
        <div className="relative flex items-start justify-between gap-2 leading-none">
          <div className={cn("text-[10px] font-bold tracking-widest uppercase", s.accentColor)}>
            {s.logoText.toUpperCase()}
          </div>
          {actionsSlot}
        </div>
        {/* Chip EMV mini — apenas un poco más pequeño que el chip real,
            le da la lectura inmediata de "tarjeta de débito" sin robar
            espacio al holder/last4 de abajo. */}
        <div className="relative">
          <ChipIcon className={cn("h-4 w-6", s.textColor)} />
        </div>
        <div className="relative flex items-end justify-between gap-2">
          <div className="flex flex-col gap-0.5 min-w-0">
            {holderName && (
              <span className="text-[11px] font-medium truncate opacity-90">{holderName}</span>
            )}
            {last4 ? (
              <span className="text-xs font-semibold tabular tracking-wider">
                ●●●● {last4}
              </span>
            ) : (
              <span className="text-[11px] truncate opacity-80">{label}</span>
            )}
          </div>
          {brand && brand !== "none" && (
            <div className="shrink-0 scale-75 origin-bottom-right">
              <BrandMark brand={brand} />
            </div>
          )}
        </div>
      </Comp>
    );
  }

  // Variante tarjeta visual completa.
  const Comp = (onClick ? "button" : "div") as "button" | "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "relative w-full text-left overflow-hidden shadow-card transition-shadow",
        SIZE_CLASS[size],
        s.cardBg, s.textColor,
        onClick && "hover:shadow-modal cursor-pointer",
        selected && "ring-2 ring-offset-2 ring-brand-700",
        className,
      )}
    >
      {/* Decoración de ondas estilo "Bancolombia plata" — solo cuando
          el banco lo declara en el catálogo. SVG inline para no depender
          de assets externos. */}
      {s.decorative && s.decorativeStrokes && (
        <DecoStrokes colors={s.decorativeStrokes} />
      )}

      {/* Esquina superior — label de la cuenta. */}
      <div className="relative flex items-start justify-between gap-2">
        <div className="flex flex-col min-w-0">
          <span className={cn("text-[11px] uppercase tracking-widest opacity-70", s.accentColor)}>
            {accountType ? formatAccountType(accountType) : "débito"}
          </span>
          <span className={cn("text-sm font-medium truncate", s.textColor)}>{label}</span>
        </div>
        {actionsSlot}
      </div>

      {/* Chip EMV + NFC. SVG simple que evoca un chip. */}
      <div className="relative mt-3 flex items-center gap-2">
        <ChipIcon className={cn("h-7 w-9", s.textColor)} />
        <NFCIcon className={cn("h-4 w-4 opacity-80", s.textColor)} />
      </div>

      {/* Logo grande del banco. Uso text-shadow muy sutil para que se
          lea bien sobre los gradientes. */}
      <div className="relative mt-2 flex items-end justify-end">
        <span
          className={cn(
            "font-bold leading-none drop-shadow-sm",
            s.logoSize, logoFontClass(s.logoFont),
          )}
        >
          {s.logoText}
        </span>
      </div>

      {/* Pie: titular + últimos 4 + brand de tarjeta. */}
      <div className="relative mt-auto pt-2 flex items-end justify-between gap-2 absolute-bottom">
        <div className="text-[11px] opacity-80 truncate flex-1">
          {holderName ?? ""}
        </div>
        {last4 && (
          <span className={cn("tabular text-xs font-semibold", s.textColor)}>
            ··{last4}
          </span>
        )}
        {brand && brand !== "none" && <BrandMark brand={brand} />}
      </div>
    </Comp>
  );
}

function logoFontClass(f: "sans" | "serif" | "rounded"): string {
  if (f === "serif") return "font-serif tracking-tight";
  if (f === "rounded") return "font-sans lowercase tracking-tight";
  return "font-sans tracking-tight";
}

function formatAccountType(t: string): string {
  if (t === "ahorros") return "Ahorros";
  if (t === "corriente") return "Corriente";
  if (t === "nequi") return "Nequi";
  if (t === "daviplata") return "Daviplata";
  return "débito";
}

/**
 * Ondas decorativas estilo Bancolombia plata: 4 bandas curvas que
 * cruzan la tarjeta. Generadas con SVG path para que escalen bien sin
 * jaggies. Cada banda usa uno de los `colors` del catálogo del banco.
 */
function DecoStrokes({ colors }: { colors: string[] }) {
  return (
    <svg
      viewBox="0 0 320 200"
      // pointer-events: none + style explícito evita que el SVG
      // capture clicks aunque se renderice por encima de hermanos.
      // z-0 mantiene las decoraciones detrás del contenido interactivo
      // de la tarjeta (chip, label, logo).
      className="absolute inset-0 w-full h-full pointer-events-none z-0"
      style={{ pointerEvents: "none" }}
      preserveAspectRatio="none"
      aria-hidden
      focusable={false}
    >
      {/* Líneas curvas en distintas posiciones para emular el patrón
          de la tarjeta plata real. Stroke gordito y opacidad controlada. */}
      <path d="M -40 110 Q 20 60, 140 100 T 360 60" fill="none" stroke={colors[0] ?? "#A461D0"} strokeWidth="14" opacity="0.85" strokeLinecap="round"/>
      <path d="M -40 150 Q 60 100, 180 140 T 360 100" fill="none" stroke={colors[1] ?? "#2EA098"} strokeWidth="14" opacity="0.85" strokeLinecap="round"/>
      <path d="M -40 70 Q 80 40, 200 80 T 360 110" fill="none" stroke={colors[2] ?? "#F08A2E"} strokeWidth="10" opacity="0.7" strokeLinecap="round"/>
      <path d="M -40 180 Q 60 160, 180 190 T 360 170" fill="none" stroke={colors[3] ?? "#F4A8B5"} strokeWidth="10" opacity="0.85" strokeLinecap="round"/>
    </svg>
  );
}

function ChipIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 36 28" className={className} fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <rect x="2" y="2" width="32" height="24" rx="4" fill="#C9A95E" />
      <rect x="2" y="2" width="32" height="24" rx="4" fill="url(#chipShine)" />
      <path d="M 14 2 v 8 M 22 2 v 8 M 2 14 h 32 M 14 18 v 8 M 22 18 v 8" stroke="#7A6535" strokeWidth="0.6" />
      <rect x="13" y="10" width="10" height="8" rx="1.5" fill="#B79141" stroke="#7A6535" strokeWidth="0.5"/>
      <defs>
        <linearGradient id="chipShine" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#FFE9A8" stopOpacity="0.6"/>
          <stop offset="1" stopColor="#7A6535" stopOpacity="0"/>
        </linearGradient>
      </defs>
    </svg>
  );
}

function NFCIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path d="M 5 7 Q 9 12 5 17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
      <path d="M 9 5 Q 16 12 9 19" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
      <path d="M 13 3 Q 22 12 13 21" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  );
}

/**
 * Marca de la tarjeta (Mastercard / Visa / Amex). Versión simplificada
 * que evoca al original sin copiar los logos al pie de la letra:
 *   - mastercard: dos círculos solapados rojo + amarillo.
 *   - visa: texto "VISA" estilizado.
 *   - amex: cuadrado azul con "AE".
 */
function BrandMark({ brand }: { brand: CardBrand }) {
  if (brand === "mastercard") {
    return (
      <div className="relative flex items-center" aria-label="Mastercard">
        <span className="block h-6 w-6 rounded-full bg-[#EB001B]" />
        <span className="block h-6 w-6 rounded-full bg-[#F79E1B] -ml-2.5 mix-blend-multiply" />
      </div>
    );
  }
  if (brand === "visa") {
    return (
      <span className="text-base font-extrabold italic tracking-tight text-white drop-shadow-sm" aria-label="Visa">
        VISA
      </span>
    );
  }
  if (brand === "amex") {
    return (
      <span className="text-[10px] font-bold tracking-widest bg-blue-700 text-white rounded px-1.5 py-0.5" aria-label="American Express">
        AMEX
      </span>
    );
  }
  return null;
}
