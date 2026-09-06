/**
 * Detección automática de variables en plantillas de documentos.
 *
 * Problema que resuelve: cuando el psicólogo trae un documento propio
 * (pegado de Word o subido como .docx), los espacios para rellenar vienen
 * como texto plano — "Yo, ______________, identificado con C.C. ______" —
 * y le tocaba insertar cada variable a mano en el lugar correcto.
 *
 * `detectVariablesInDoc` recorre los nodos de texto del documento TipTap
 * y reemplaza los espacios en blanco reconocibles (rayas "___" precedidas
 * de una etiqueta conocida) por VariableNodes reales, que luego se
 * resuelven con los datos del paciente/profesional al crear el documento.
 *
 * Filosofía conservadora: solo se reemplaza cuando hay una etiqueta que
 * identifica el dato SIN ambigüedad. Una raya suelta sin contexto se deja
 * intacta — mejor no poner una variable que poner la equivocada.
 */

import type { TipTapDoc } from "@/lib/api";

type DetectRule = {
  /** Regex sobre el texto plano. Grupo 1 = etiqueta+separador que se conserva; el tramo de rayas se reemplaza. */
  pattern: RegExp;
  key: string;
  label: string;
};

// Separador tolerante entre la etiqueta y las rayas: espacios, dos puntos,
// puntos, "No.", "Nº", "#"… (máx. 10 chars para no cruzar media frase).
const SEP = String.raw`(?:\s|:|\.|,|#|N[°º]|[Nn]o\.?|[Nn][uú]mero)*`;
const BLANK = String.raw`(_{3,}|…{2,}|\.{6,})`; // rayas, elipsis largas o puntos de guía

const esc = (s: string) => `(?:${s})`;

/**
 * Orden IMPORTANTE: de más específica a más genérica. La primera regla que
 * matchea un tramo gana (p. ej. "tarjeta profesional ___" debe ganarle a
 * "profesional ___", y "nombre del paciente" a "paciente").
 */
const RULES: DetectRule[] = [
  { key: "profesional.tarjeta_profesional", label: "Tarjeta profesional",
    pattern: new RegExp(String.raw`((?:tarjeta\s+profesional|t\.?\s*p\.?)${SEP})${BLANK}`, "i") },
  { key: "profesional.nombre", label: "Nombre del profesional",
    pattern: new RegExp(String.raw`((?:psic[oó]log[oa]|profesional|terapeuta)(?:\s+tratante)?${SEP})${BLANK}`, "i") },
  { key: "paciente.nombre", label: "Nombre del paciente",
    pattern: new RegExp(String.raw`((?:nombre(?:\s+completo)?(?:\s+del?\s+(?:la\s+)?paciente)?|paciente|consultante|usuari[oa])${SEP})${BLANK}`, "i") },
  // "Yo, ______" — apertura clásica de consentimientos. El que firma es el paciente.
  { key: "paciente.nombre", label: "Nombre del paciente",
    pattern: new RegExp(String.raw`(\byo\s*,?\s*)${BLANK}`, "i") },
  { key: "paciente.documento", label: "Documento del paciente",
    pattern: new RegExp(String.raw`((?:c\.?\s*c\.?|c[eé]dula(?:\s+de\s+ciudadan[ií]a)?|documento(?:\s+de\s+identidad)?|identificaci[oó]n|identificad[oa]\s+con|t\.?\s*i\.?)${SEP})${BLANK}`, "i") },
  { key: "paciente.edad", label: "Edad",
    pattern: new RegExp(String.raw`(edad${SEP})${BLANK}`, "i") },
  { key: "paciente.telefono", label: "Teléfono del paciente",
    pattern: new RegExp(String.raw`((?:tel[eé]fono|celular|m[oó]vil)${SEP})${BLANK}`, "i") },
  { key: "paciente.email", label: "Correo del paciente",
    pattern: new RegExp(String.raw`((?:correo(?:\s+electr[oó]nico)?|e-?mail)${SEP})${BLANK}`, "i") },
  { key: "clinica.ciudad", label: "Ciudad",
    pattern: new RegExp(String.raw`((?:ciudad|en\s+la\s+ciudad\s+de)${SEP})${BLANK}`, "i") },
  { key: "fecha.larga", label: "Fecha",
    pattern: new RegExp(String.raw`((?:fecha|a\s+los?)${SEP})${BLANK}`, "i") },
];

type Textish = { type?: string; text?: string; marks?: unknown[]; content?: unknown[] };

/** Divide un nodo de texto en [texto, variable, texto, …] según las reglas. */
function splitTextNode(node: Textish, found: Map<string, number>): unknown[] | null {
  let text = node.text ?? "";
  if (!text || !/_{3,}|…{2,}|\.{6,}/.test(text)) return null;

  const parts: unknown[] = [];
  let changed = false;

  // Bucle: buscar el match MÁS TEMPRANO entre todas las reglas, cortar, repetir.
  for (let guard = 0; guard < 30 && text.length > 0; guard++) {
    let best: { idx: number; rule: DetectRule; m: RegExpExecArray } | null = null;
    for (const rule of RULES) {
      const m = rule.pattern.exec(text);
      if (m && (best === null || m.index < best.idx)) best = { idx: m.index, rule, m };
    }
    if (!best) break;

    const { rule, m } = best;
    const labelPart = m[1] ?? "";
    const before = text.slice(0, m.index) + labelPart;
    if (before) parts.push({ type: "text", text: before, ...(node.marks ? { marks: node.marks } : {}) });
    parts.push({ type: "variable", attrs: { key: rule.key } });
    found.set(rule.label, (found.get(rule.label) ?? 0) + 1);
    changed = true;
    text = text.slice(m.index + m[0].length);
  }

  if (!changed) return null;
  if (text) parts.push({ type: "text", text, ...(node.marks ? { marks: node.marks } : {}) });
  return parts;
}

function walk(input: unknown, found: Map<string, number>): unknown {
  if (!input || typeof input !== "object") return input;
  if (Array.isArray(input)) return input.map((c) => walk(c, found));
  const node = input as Textish;
  if (node.type === "text") {
    const split = splitTextNode(node, found);
    return split ?? input; // si devolvió array, el padre lo aplana
  }
  if (Array.isArray(node.content)) {
    const content: unknown[] = [];
    for (const child of node.content) {
      const out = walk(child, found);
      if (Array.isArray(out)) content.push(...out);
      else content.push(out);
    }
    return { ...node, content };
  }
  return input;
}

export function detectVariablesInDoc(doc: TipTapDoc): {
  doc: TipTapDoc;
  total: number;
  summary: string;
} {
  const found = new Map<string, number>();
  const out = walk(doc, found) as TipTapDoc;
  const total = [...found.values()].reduce((a, b) => a + b, 0);
  const summary = [...found.entries()]
    .map(([label, n]) => (n > 1 ? `${label} ×${n}` : label))
    .join(", ");
  return { doc: out, total, summary };
}
