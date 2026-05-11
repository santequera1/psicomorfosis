/**
 * Editor TipTap simplificado para documentos legales.
 *
 * El editor clínico (`components/documents/DocumentEditor`) trae
 * extensiones específicas (firmas, callouts, adjuntos, variables {{}})
 * que no aplican a una política de privacidad o un Acuerdo Beta.
 * Aquí dejamos solo lo necesario para redactar prosa legal:
 *
 *   - StarterKit (headings, párrafos, listas, blockquote, link, bold/italic).
 *   - Typography (autoescape de comillas tipográficas, em-dash, etc).
 *   - TextAlign (aunque rara vez se justifica un párrafo legal,
 *     el equipo legal lo puede pedir para encabezados centrados).
 *
 * El editor trabaja en HTML (no en TipTapDoc JSON) porque el backend
 * persiste `body_html` y las páginas públicas lo renderizan con
 * dangerouslySetInnerHTML. La idempotencia entre el HTML que TipTap
 * exporta y el que recibe está garantizada por su parser interno.
 */

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Typography } from "@tiptap/extension-typography";
import { TextAlign } from "@tiptap/extension-text-align";
import { Placeholder } from "@tiptap/extension-placeholder";
import { useEffect, useState } from "react";
import {
  Bold, Italic, Heading1, Heading2, Heading3, List, ListOrdered,
  Quote, Link2, Undo, Redo, AlignLeft, AlignCenter, AlignRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  /** HTML inicial. Si vacío, el editor parte con un párrafo en blanco. */
  initialHtml: string;
  onChange?: (html: string) => void;
  editable?: boolean;
  placeholder?: string;
}

export function LegalDocumentEditor({
  initialHtml,
  onChange,
  editable = true,
  placeholder,
}: Props) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        link: {
          openOnClick: false,
          autolink: false,
          HTMLAttributes: { class: "text-brand-700 underline" },
        },
      }),
      Typography,
      TextAlign.configure({
        types: ["heading", "paragraph"],
        alignments: ["left", "center", "right", "justify"],
        defaultAlignment: "left",
      }),
      Placeholder.configure({
        placeholder: placeholder ?? "Escribe el contenido del documento…",
      }),
    ],
    content: initialHtml || "<p></p>",
    editable,
    editorProps: {
      attributes: {
        class: "psm-editor-content focus:outline-none min-h-[60vh] py-6 max-w-none",
      },
    },
    onUpdate: ({ editor }) => {
      onChange?.(editor.getHTML());
    },
  });

  // Si el HTML inicial cambia (al cargar otra versión), refrescar el contenido.
  // Solo si el editor existe y el HTML es realmente distinto, para no perder
  // el cursor ni hacer un setContent en cada keystroke.
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if (initialHtml && initialHtml !== current) {
      editor.commands.setContent(initialHtml, { emitUpdate: false });
    }
  }, [initialHtml, editor]);

  if (!editor) {
    return (
      <div className="rounded-xl border border-line-200 bg-bg-50 p-6 text-sm text-ink-500">
        Cargando editor…
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-line-200 bg-surface overflow-hidden">
      {editable && <Toolbar editor={editor} />}
      <div className="px-5 sm:px-7">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

function Toolbar({ editor }: { editor: ReturnType<typeof useEditor> }) {
  const [linkOpen, setLinkOpen] = useState(false);
  if (!editor) return null;

  const Btn = ({
    onClick, active, disabled, title, children,
  }: {
    onClick: () => void;
    active?: boolean;
    disabled?: boolean;
    title: string;
    children: React.ReactNode;
  }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={cn(
        "h-9 w-9 rounded-md text-ink-700 hover:bg-bg-100 inline-flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed shrink-0",
        active && "bg-brand-100 text-brand-800",
      )}
    >
      {children}
    </button>
  );

  return (
    <div className="border-b border-line-200 bg-bg-50 px-2 py-1.5 flex flex-wrap items-center gap-0.5">
      <Btn title="Deshacer" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}>
        <Undo className="h-4 w-4" />
      </Btn>
      <Btn title="Rehacer" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}>
        <Redo className="h-4 w-4" />
      </Btn>
      <Sep />
      <Btn title="Título 1"
        active={editor.isActive("heading", { level: 1 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
        <Heading1 className="h-4 w-4" />
      </Btn>
      <Btn title="Título 2"
        active={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
        <Heading2 className="h-4 w-4" />
      </Btn>
      <Btn title="Título 3"
        active={editor.isActive("heading", { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
        <Heading3 className="h-4 w-4" />
      </Btn>
      <Sep />
      <Btn title="Negrita"
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}>
        <Bold className="h-4 w-4" />
      </Btn>
      <Btn title="Cursiva"
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}>
        <Italic className="h-4 w-4" />
      </Btn>
      <Sep />
      <Btn title="Lista con viñetas"
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <List className="h-4 w-4" />
      </Btn>
      <Btn title="Lista numerada"
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        <ListOrdered className="h-4 w-4" />
      </Btn>
      <Btn title="Cita"
        active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}>
        <Quote className="h-4 w-4" />
      </Btn>
      <Sep />
      <Btn title="Alinear izquierda"
        active={editor.isActive({ textAlign: "left" })}
        onClick={() => editor.chain().focus().setTextAlign("left").run()}>
        <AlignLeft className="h-4 w-4" />
      </Btn>
      <Btn title="Alinear centro"
        active={editor.isActive({ textAlign: "center" })}
        onClick={() => editor.chain().focus().setTextAlign("center").run()}>
        <AlignCenter className="h-4 w-4" />
      </Btn>
      <Btn title="Alinear derecha"
        active={editor.isActive({ textAlign: "right" })}
        onClick={() => editor.chain().focus().setTextAlign("right").run()}>
        <AlignRight className="h-4 w-4" />
      </Btn>
      <Sep />
      <Btn title="Insertar enlace"
        active={editor.isActive("link")}
        onClick={() => setLinkOpen(true)}>
        <Link2 className="h-4 w-4" />
      </Btn>

      {linkOpen && (
        <LinkPrompt
          initial={editor.getAttributes("link").href ?? ""}
          onClose={() => setLinkOpen(false)}
          onApply={(href) => {
            if (!href) {
              editor.chain().focus().unsetLink().run();
            } else {
              editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
            }
            setLinkOpen(false);
          }}
        />
      )}
    </div>
  );
}

function Sep() {
  return <span className="mx-1 h-5 w-px bg-line-200" aria-hidden />;
}

/** Diálogo simple para pedir/editar la URL de un enlace. */
function LinkPrompt({
  initial, onClose, onApply,
}: {
  initial: string;
  onClose: () => void;
  onApply: (href: string) => void;
}) {
  const [href, setHref] = useState(initial);
  return (
    <div
      className="fixed inset-0 z-50 bg-ink-900/40 backdrop-blur-sm flex items-center justify-center px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-surface rounded-xl border border-line-200 shadow-modal p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-medium text-ink-900 mb-2">Insertar enlace</h3>
        <input
          type="url"
          autoFocus
          value={href}
          onChange={(e) => setHref(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onApply(href.trim());
            if (e.key === "Escape") onClose();
          }}
          placeholder="https://ejemplo.com o /ruta"
          className="w-full h-11 rounded-lg border border-line-200 bg-surface px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
        />
        <div className="mt-4 flex items-center justify-end gap-2">
          {initial && (
            <button
              onClick={() => onApply("")}
              className="h-9 px-3 rounded-lg text-sm text-error hover:bg-error-soft"
            >
              Quitar enlace
            </button>
          )}
          <button onClick={onClose} className="h-9 px-3 rounded-lg text-sm text-ink-700 hover:bg-bg-100">
            Cancelar
          </button>
          <button
            onClick={() => onApply(href.trim())}
            className="h-9 px-3 rounded-lg bg-brand-700 text-white text-sm font-medium hover:bg-brand-800"
          >
            Aplicar
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Renderizador de solo lectura: usa el mismo CSS `psm-editor-content`
 * que el editor para que el resultado sea visualmente idéntico al de
 * la previsualización en /legal-admin.
 */
export function LegalDocumentView({ html }: { html: string }) {
  return (
    <div
      className="psm-editor-content max-w-none"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
