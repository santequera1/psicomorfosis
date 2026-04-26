import { Extension } from "@tiptap/core";
import { ReactRenderer, type Editor } from "@tiptap/react";
import Suggestion, { type SuggestionOptions } from "@tiptap/suggestion";
import {
  Heading1, Heading2, Heading3, List, ListOrdered, CheckSquare,
  Quote, Code, Minus, Type, Image as ImageIcon, Table as TableIcon,
} from "lucide-react";
import { forwardRef, useEffect, useImperativeHandle, useState } from "react";

export interface SlashItem {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  keywords: string[];
  command: ({ editor, range }: { editor: Editor; range: { from: number; to: number } }) => void;
}

export const SLASH_ITEMS: SlashItem[] = [
  {
    title: "Texto",
    description: "Empezar a escribir en texto plano",
    icon: Type,
    keywords: ["texto", "parrafo", "paragraph", "p"],
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setNode("paragraph").run(),
  },
  {
    title: "Título 1",
    description: "Sección principal",
    icon: Heading1,
    keywords: ["h1", "titulo", "heading"],
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setNode("heading", { level: 1 }).run(),
  },
  {
    title: "Título 2",
    description: "Subsección",
    icon: Heading2,
    keywords: ["h2", "subtitulo"],
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setNode("heading", { level: 2 }).run(),
  },
  {
    title: "Título 3",
    description: "Apartado pequeño",
    icon: Heading3,
    keywords: ["h3"],
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setNode("heading", { level: 3 }).run(),
  },
  {
    title: "Lista",
    description: "Lista con viñetas",
    icon: List,
    keywords: ["lista", "bullet", "ul", "viñeta"],
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    title: "Lista numerada",
    description: "Lista 1, 2, 3…",
    icon: ListOrdered,
    keywords: ["numerada", "ordered", "ol", "numbered"],
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    title: "Tareas",
    description: "Checkboxes para marcar",
    icon: CheckSquare,
    keywords: ["task", "todo", "checkbox", "tarea"],
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleTaskList().run(),
  },
  {
    title: "Cita",
    description: "Bloque de cita o destacado",
    icon: Quote,
    keywords: ["cita", "quote", "blockquote"],
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
  },
  {
    title: "Código",
    description: "Bloque monoespaciado",
    icon: Code,
    keywords: ["codigo", "code", "pre"],
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
  },
  {
    title: "Separador",
    description: "Línea horizontal",
    icon: Minus,
    keywords: ["hr", "divider", "separador", "linea"],
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
  },
  {
    title: "Tabla 3×3",
    description: "Insertar tabla",
    icon: TableIcon,
    keywords: ["tabla", "table"],
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  },
  {
    title: "Imagen (URL)",
    description: "Insertar por URL",
    icon: ImageIcon,
    keywords: ["imagen", "image", "img", "foto"],
    command: ({ editor, range }) => {
      const url = window.prompt("URL de la imagen:");
      if (!url) return;
      editor.chain().focus().deleteRange(range).setImage({ src: url }).run();
    },
  },
];

export type SlashListRef = {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
};

interface SlashListProps {
  items: SlashItem[];
  command: (item: SlashItem) => void;
}

export const SlashList = forwardRef<SlashListRef, SlashListProps>(({ items, command }, ref) => {
  const [selected, setSelected] = useState(0);

  useEffect(() => setSelected(0), [items]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === "ArrowUp") {
        setSelected((s) => (s + items.length - 1) % items.length);
        return true;
      }
      if (event.key === "ArrowDown") {
        setSelected((s) => (s + 1) % items.length);
        return true;
      }
      if (event.key === "Enter") {
        const item = items[selected];
        if (item) command(item);
        return true;
      }
      return false;
    },
  }));

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-line-200 bg-surface shadow-card p-2 text-xs text-ink-500">
        Sin coincidencias
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-line-200 bg-surface shadow-card max-h-72 overflow-y-auto w-72 p-1">
      {items.map((it, i) => {
        const Icon = it.icon;
        return (
          <button
            key={it.title}
            type="button"
            onClick={() => command(it)}
            className={
              "w-full flex items-start gap-3 px-2 py-2 rounded-md text-left transition-colors " +
              (i === selected ? "bg-brand-50" : "hover:bg-bg-100")
            }
          >
            <span className="h-8 w-8 rounded-md bg-bg flex items-center justify-center shrink-0 mt-0.5">
              <Icon className="h-4 w-4 text-ink-700" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm text-ink-900 font-medium">{it.title}</span>
              <span className="block text-xs text-ink-500 truncate">{it.description}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
});
SlashList.displayName = "SlashList";

/** Minimal floating-element holder used by TipTap suggestion render. No tippy.js. */
function makePopover() {
  const el = document.createElement("div");
  el.style.cssText = "position:fixed;z-index:9999;display:none;";
  document.body.appendChild(el);
  return {
    el,
    show: (rect: DOMRect) => {
      el.style.display = "block";
      el.style.left = `${rect.left}px`;
      el.style.top = `${rect.bottom + 6}px`;
    },
    hide: () => { el.style.display = "none"; },
    destroy: () => { el.remove(); },
  };
}

export const SlashCommand = Extension.create({
  name: "slashCommand",
  addOptions(): { suggestion: Partial<SuggestionOptions> } {
    return {
      suggestion: {
        char: "/",
        startOfLine: false,
        command: ({ editor, range, props }) => {
          (props as SlashItem).command({ editor, range });
        },
      },
    };
  },
  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
        items: ({ query }) => {
          const q = query.toLowerCase().trim();
          if (!q) return SLASH_ITEMS.slice(0, 8);
          return SLASH_ITEMS.filter((it) =>
            it.title.toLowerCase().includes(q) || it.keywords.some((k) => k.includes(q))
          ).slice(0, 8);
        },
        render: () => {
          let component: ReactRenderer<SlashListRef, SlashListProps> | null = null;
          let popover: ReturnType<typeof makePopover> | null = null;

          return {
            onStart: (props) => {
              popover = makePopover();
              component = new ReactRenderer(SlashList, {
                props: { items: props.items, command: props.command },
                editor: props.editor,
              });
              if (component.element) popover.el.appendChild(component.element);
              const rect = props.clientRect?.();
              if (rect) popover.show(rect as DOMRect);
            },
            onUpdate: (props) => {
              component?.updateProps({ items: props.items, command: props.command });
              const rect = props.clientRect?.();
              if (rect && popover) popover.show(rect as DOMRect);
            },
            onKeyDown: (props) => {
              if (props.event.key === "Escape") {
                popover?.hide();
                return true;
              }
              return component?.ref?.onKeyDown({ event: props.event }) ?? false;
            },
            onExit: () => {
              popover?.destroy();
              component?.destroy();
              popover = null;
              component = null;
            },
          };
        },
      }),
    ];
  },
});
