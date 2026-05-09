/**
 * Catálogo de bancos para el wallet del psicólogo.
 *
 * Cada entrada define la identidad visual de la tarjeta (color de fondo,
 * gradiente, color de texto, tipografía). Cuando el usuario crea una
 * cuenta seleccionando un banco del catálogo, el componente BankCard
 * renderiza la tarjeta con esos parámetros — sin necesidad de subir
 * logos exclusivos (que tienen consideraciones de licencia de marca).
 *
 * Para bancos no listados, el catálogo "otra" da una tarjeta neutra.
 * "efectivo" es un caso especial — no es banco, pero aparece como
 * opción al registrar pagos para mantener el wallet como único punto
 * de entrada.
 *
 * Convención de colores: el `cardBg` reproduce el fondo característico
 * de cada marca (Bancolombia amarillo plata, Nequi violeta, etc.) y
 * `accentColor` se usa para detalles secundarios (chip / strip).
 */

export type BankBrand =
  | "bancolombia"
  | "nequi"
  | "daviplata"
  | "bbva"
  | "davivienda"
  | "banco-bogota"
  | "scotiabank"
  | "av-villas"
  | "nu"
  | "otra"
  | "efectivo";

export interface BankBrandStyle {
  /** Identificador en DB. */
  id: BankBrand;
  /** Nombre legible. */
  name: string;
  /** Gradiente / color del fondo de la tarjeta. */
  cardBg: string;
  /** Color del texto del logo y datos. */
  textColor: string;
  /** Color secundario para detalles (chip, lineas, etc). */
  accentColor: string;
  /** Familia tipográfica del logo (sans / serif / mono). */
  logoFont: "sans" | "serif" | "rounded";
  /** Estilo del logo: 'word' = texto del nombre, 'mark' = letra/símbolo. */
  logoStyle: "word" | "mark";
  /** Texto/letra que aparece como logo grande. */
  logoText: string;
  /** Tamaño del logo en clase Tailwind. */
  logoSize: string;
  /** Si true, la tarjeta tiene ondas decorativas (estilo Bancolombia plata). */
  decorative: boolean;
  /** Color de las ondas decorativas. */
  decorativeStrokes?: string[];
  /** Si la tarjeta es no-banco (efectivo, otra). */
  special?: boolean;
}

export const BANK_CATALOG: Record<BankBrand, BankBrandStyle> = {
  bancolombia: {
    id: "bancolombia",
    name: "Bancolombia",
    // Gradiente sutil amarillo (top-left más claro, bottom-right más
    // saturado). Antes tenía ondas multicolor estilo "Plata" pero el
    // resultado se sentía recargado en formato compacto. Ahora es un
    // gradient limpio que conserva el amarillo como signo de marca.
    cardBg: "bg-gradient-to-br from-[#FFEE6E] via-[#FAE85B] to-[#E8C826]",
    textColor: "text-black",
    accentColor: "text-[#3a2a00]",
    logoFont: "sans",
    logoStyle: "word",
    logoText: "Bancolombia",
    logoSize: "text-2xl",
    decorative: false,
  },
  nequi: {
    id: "nequi",
    name: "Nequi",
    cardBg: "bg-gradient-to-br from-[#210049] via-[#3a0d6f] to-[#7C19E0]",
    textColor: "text-white",
    accentColor: "text-fuchsia-300",
    logoFont: "rounded",
    logoStyle: "word",
    logoText: "nequi",
    logoSize: "text-3xl",
    decorative: false,
  },
  daviplata: {
    id: "daviplata",
    name: "Daviplata",
    cardBg: "bg-gradient-to-br from-[#E10A1A] via-[#C21221] to-[#7B0E16]",
    textColor: "text-white",
    accentColor: "text-red-200",
    logoFont: "sans",
    logoStyle: "word",
    logoText: "daviplata",
    logoSize: "text-2xl",
    decorative: false,
  },
  bbva: {
    id: "bbva",
    name: "BBVA",
    cardBg: "bg-gradient-to-br from-[#004481] via-[#0A4F92] to-[#072146]",
    textColor: "text-white",
    accentColor: "text-blue-200",
    logoFont: "sans",
    logoStyle: "word",
    logoText: "BBVA",
    logoSize: "text-3xl",
    decorative: false,
  },
  davivienda: {
    id: "davivienda",
    name: "Davivienda",
    cardBg: "bg-gradient-to-br from-[#A60E18] via-[#810C13] to-[#5E0810]",
    textColor: "text-white",
    accentColor: "text-red-200",
    logoFont: "serif",
    logoStyle: "word",
    logoText: "Davivienda",
    logoSize: "text-2xl",
    decorative: false,
  },
  "banco-bogota": {
    id: "banco-bogota",
    name: "Banco de Bogotá",
    cardBg: "bg-gradient-to-br from-[#0033A0] via-[#0747B5] to-[#001F66]",
    textColor: "text-white",
    accentColor: "text-blue-200",
    logoFont: "serif",
    logoStyle: "word",
    logoText: "Banco de Bogotá",
    logoSize: "text-xl",
    decorative: false,
  },
  scotiabank: {
    id: "scotiabank",
    name: "Scotiabank Colpatria",
    cardBg: "bg-gradient-to-br from-[#EC1B24] via-[#C81620] to-[#7B0E16]",
    textColor: "text-white",
    accentColor: "text-red-200",
    logoFont: "sans",
    logoStyle: "word",
    logoText: "Scotiabank",
    logoSize: "text-2xl",
    decorative: false,
  },
  "av-villas": {
    id: "av-villas",
    name: "AV Villas",
    cardBg: "bg-gradient-to-br from-[#117D2E] via-[#0F6B27] to-[#08471A]",
    textColor: "text-white",
    accentColor: "text-emerald-200",
    logoFont: "sans",
    logoStyle: "word",
    logoText: "AV Villas",
    logoSize: "text-2xl",
    decorative: false,
  },
  nu: {
    id: "nu",
    name: "Nu",
    cardBg: "bg-gradient-to-br from-[#820AD1] via-[#6E07B0] to-[#3D0660]",
    textColor: "text-white",
    accentColor: "text-fuchsia-200",
    logoFont: "sans",
    logoStyle: "mark",
    // Solo "Nu" como en su branding.
    logoText: "Nu",
    logoSize: "text-4xl",
    decorative: false,
  },
  otra: {
    id: "otra",
    name: "Otra cuenta",
    cardBg: "bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900",
    textColor: "text-white",
    accentColor: "text-slate-300",
    logoFont: "sans",
    logoStyle: "mark",
    logoText: "$",
    logoSize: "text-3xl",
    decorative: false,
  },
  efectivo: {
    id: "efectivo",
    name: "Efectivo",
    cardBg: "bg-gradient-to-br from-emerald-500 via-emerald-600 to-emerald-800",
    textColor: "text-white",
    accentColor: "text-emerald-100",
    logoFont: "sans",
    logoStyle: "mark",
    logoText: "💵",
    logoSize: "text-3xl",
    decorative: false,
    special: true,
  },
};

/** Obtiene el estilo de un banco. Cae a "otra" si el id no existe. */
export function getBankStyle(id: string | null | undefined): BankBrandStyle {
  if (!id) return BANK_CATALOG.otra;
  return BANK_CATALOG[id as BankBrand] ?? BANK_CATALOG.otra;
}

/** Listado para selectores; "efectivo" se trata aparte en el form de recibo. */
export const BANK_CHOICES: BankBrandStyle[] = [
  BANK_CATALOG.bancolombia,
  BANK_CATALOG.nequi,
  BANK_CATALOG.daviplata,
  BANK_CATALOG.bbva,
  BANK_CATALOG.davivienda,
  BANK_CATALOG["banco-bogota"],
  BANK_CATALOG.scotiabank,
  BANK_CATALOG["av-villas"],
  BANK_CATALOG.nu,
  BANK_CATALOG.otra,
];

export type AccountType = "ahorros" | "corriente" | "nequi" | "daviplata" | "otra";

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  ahorros: "Cuenta de ahorros",
  corriente: "Cuenta corriente",
  nequi: "Nequi",
  daviplata: "Daviplata",
  otra: "Otra",
};

export type CardBrand = "mastercard" | "visa" | "amex" | "none";
