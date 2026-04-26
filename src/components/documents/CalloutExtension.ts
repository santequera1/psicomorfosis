import { Node, mergeAttributes } from "@tiptap/core";

export type CalloutType = "info" | "warning" | "danger" | "success";

/**
 * Callout: bloque destacado con icono y color para resaltar notas, advertencias,
 * riesgos clínicos u observaciones. Renderiza como <div data-callout="info">…</div>
 * y permite contenido inline (párrafos, listas, etc.).
 *
 * Estilos en src/styles.css bajo .psm-editor-content [data-callout].
 */
export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
      type: {
        default: "info" as CalloutType,
        parseHTML: (el) => (el.getAttribute("data-callout") || "info") as CalloutType,
        renderHTML: (attrs) => ({ "data-callout": attrs.type }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-callout]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { class: "psm-callout" }), 0];
  },

  addCommands() {
    return {
      setCallout:
        (type: CalloutType = "info") =>
        ({ commands }: any) => {
          return commands.wrapIn(this.name, { type });
        },
      toggleCallout:
        (type: CalloutType = "info") =>
        ({ commands }: any) => {
          return commands.toggleWrap(this.name, { type });
        },
      unsetCallout:
        () =>
        ({ commands }: any) => {
          return commands.lift(this.name);
        },
    } as any;
  },
});
