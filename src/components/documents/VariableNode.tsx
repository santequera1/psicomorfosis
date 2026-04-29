import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper } from "@tiptap/react";
import { createContext, useContext, type ReactNode } from "react";

export type VariableContextValue = Record<string, Record<string, string>>;

const VariableContextReact = createContext<VariableContextValue | null>(null);

export function VariableContextProvider({ value, children }: { value: VariableContextValue | null; children: ReactNode }) {
  return <VariableContextReact.Provider value={value}>{children}</VariableContextReact.Provider>;
}

function useVariableContext() {
  return useContext(VariableContextReact);
}

/** Resuelve una llave dotted ("paciente.nombre") en el contexto. */
export function resolveVariable(key: string, ctx: VariableContextValue | null): string | null {
  if (!ctx) return null;
  const parts = key.split(".");
  let val: any = ctx;
  for (const p of parts) {
    if (val == null) return null;
    val = val[p];
  }
  if (val == null) return null;
  const s = String(val);
  if (!s.trim() || /^_+$/.test(s.trim())) return null; // backend devuelve "________________" cuando no hay dato
  return s;
}

/**
 * VariableNode: nodo inline atómico que representa un placeholder {{key}}.
 * Renderiza el VALOR REAL (resuelto desde el contexto) en el editor; al
 * serializar a HTML/texto vuelve a `{{key}}` para preservar la plantilla.
 */
export const VariableNode = Node.create({
  name: "variable",
  inline: true,
  group: "inline",
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      key: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-variable") ?? "",
        renderHTML: (attrs) => ({ "data-variable": attrs.key }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-variable]" }];
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { class: "psm-variable-static" }),
      `{{${node.attrs.key}}}`,
    ];
  },

  renderText({ node }) {
    return `{{${node.attrs.key}}}`;
  },

  addNodeView() {
    return ReactNodeViewRenderer(VariableNodeView);
  },
});

function VariableNodeView({ node }: any) {
  const ctx = useVariableContext();
  const key = node.attrs.key as string;
  const resolved = resolveVariable(key, ctx);
  const hasValue = resolved !== null;

  return (
    <NodeViewWrapper
      as="span"
      data-variable={key}
      className={
        "psm-variable inline-block rounded px-1 py-0.5 text-sm transition-colors " +
        (hasValue
          ? "bg-brand-50 text-brand-800 ring-1 ring-brand-700/20"
          : "bg-warning-soft text-risk-moderate ring-1 ring-risk-moderate/30")
      }
      title={hasValue ? `${key} = ${resolved}` : `${key} (sin valor en este documento)`}
      contentEditable={false}
    >
      {hasValue ? resolved : `{{${key}}}`}
    </NodeViewWrapper>
  );
}

/**
 * Migración: convierte texto literal `{{paciente.nombre}}` en VariableNodes
 * dentro de un documento TipTap JSON. Útil para que documentos antiguos
 * (sin nodes) muestren los valores resueltos al abrirse.
 */
const VAR_PATTERN = /\{\{\s*([\w]+(?:\.[\w]+)+)\s*\}\}/g;

export function migrateVariablesInDoc(input: any): any {
  if (!input || typeof input !== "object") return input;
  if (Array.isArray(input)) return input.map((c: any) => migrateVariablesInDoc(c));
  const node = input as { type?: string; content?: any[]; text?: string; marks?: any[] };
  if (node.type === "text" && typeof node.text === "string" && VAR_PATTERN.test(node.text)) {
    VAR_PATTERN.lastIndex = 0;
    const parts: any[] = [];
    let lastIdx = 0;
    let m: RegExpExecArray | null;
    while ((m = VAR_PATTERN.exec(node.text)) !== null) {
      const [full, key] = m;
      const before = node.text.slice(lastIdx, m.index);
      if (before) parts.push({ type: "text", text: before, ...(node.marks ? { marks: node.marks } : {}) });
      parts.push({ type: "variable", attrs: { key } });
      lastIdx = m.index + full.length;
    }
    const tail = node.text.slice(lastIdx);
    if (tail) parts.push({ type: "text", text: tail, ...(node.marks ? { marks: node.marks } : {}) });
    return parts;
  }
  if (Array.isArray(node.content)) {
    const newContent: any[] = [];
    for (const child of node.content) {
      const migrated = migrateVariablesInDoc(child);
      if (Array.isArray(migrated)) newContent.push(...migrated);
      else newContent.push(migrated);
    }
    return { ...node, content: newContent };
  }
  return input;
}
