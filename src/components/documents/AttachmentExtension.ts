import { Node, mergeAttributes } from "@tiptap/core";

/**
 * Adjunto inline: bloque visual tipo "tarjeta" para PDF, Word, Excel, etc.
 * Renderiza como <a class="psm-attachment" href="..." target="_blank">.
 * Los estilos están en src/styles.css (.psm-attachment).
 */
export const Attachment = Node.create({
  name: "attachment",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      url:        { default: null },
      name:       { default: "Archivo" },
      mime:       { default: "" },
      sizeBytes:  { default: 0, parseHTML: (el) => Number(el.getAttribute("data-size")) || 0, renderHTML: (a) => ({ "data-size": String(a.sizeBytes ?? 0) }) },
    };
  },

  parseHTML() {
    return [{ tag: 'a[data-attachment="1"]' }];
  },

  renderHTML({ HTMLAttributes, node }) {
    const { url, name, mime, sizeBytes } = node.attrs;
    const ext = (name?.split(".").pop() || "FILE").toUpperCase().slice(0, 5);
    const kb = sizeBytes ? Math.round(sizeBytes / 1024) : null;
    return [
      "a",
      mergeAttributes(HTMLAttributes, {
        "data-attachment": "1",
        href: url,
        target: "_blank",
        rel: "noopener noreferrer",
        class: "psm-attachment",
        contenteditable: "false",
      }),
      ["span", { class: "psm-attachment-icon" }, ext.slice(0, 4)],
      ["span", { class: "psm-attachment-info" },
        ["span", { class: "psm-attachment-name" }, name],
        ["span", { class: "psm-attachment-meta" }, [mime, kb ? `${kb} KB` : null].filter(Boolean).join(" · ")],
      ],
    ];
  },

  addCommands() {
    return {
      setAttachment:
        (attrs: { url: string; name: string; mime?: string; sizeBytes?: number }) =>
        ({ commands }: any) => {
          return commands.insertContent({
            type: this.name,
            attrs: { url: attrs.url, name: attrs.name, mime: attrs.mime ?? "", sizeBytes: attrs.sizeBytes ?? 0 },
          });
        },
    } as any;
  },
});
