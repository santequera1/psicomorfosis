import { Node, mergeAttributes } from "@tiptap/core";

/**
 * Bloque de firma: imagen de firma + nombre + tarjeta + fecha. Atom (no editable
 * inline). Se inserta con el slash menu o con el botón "Firma" del toolbar.
 * Cuando el documento se firma con "Firmar", el bloque queda inmutable junto al
 * resto del contenido.
 */
export const Signature = Node.create({
  name: "signature",
  group: "block",
  atom: true,
  draggable: false,

  addAttributes() {
    return {
      url:                  { default: "" },   // URL pública de la imagen de firma
      name:                 { default: "" },
      tarjetaProfesional:   { default: "" },
      signedAt:             { default: "" },   // ISO timestamp
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-signature="1"]' }];
  },

  renderHTML({ HTMLAttributes, node }) {
    const { url, name, tarjetaProfesional, signedAt } = node.attrs;
    const fecha = signedAt
      ? new Date(signedAt).toLocaleString("es-CO", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })
      : "";
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-signature": "1", class: "psm-signature", contenteditable: "false" }),
      url ? ["img", { src: url, alt: `Firma de ${name}` }] : ["div", { class: "text-ink-400 italic" }, "[Firma del profesional]"],
      ["div", { class: "psm-signature-meta" },
        ["strong", {}, name || "Profesional"],
        ...(tarjetaProfesional ? [" — ", tarjetaProfesional] : []),
        ...(fecha ? [" · ", fecha] : []),
      ],
    ];
  },

  addCommands() {
    return {
      setSignature:
        (attrs: { url: string; name: string; tarjetaProfesional?: string; signedAt?: string }) =>
        ({ commands }: any) => {
          return commands.insertContent({
            type: this.name,
            attrs: {
              url: attrs.url,
              name: attrs.name,
              tarjetaProfesional: attrs.tarjetaProfesional ?? "",
              signedAt: attrs.signedAt ?? new Date().toISOString(),
            },
          });
        },
    } as any;
  },
});
