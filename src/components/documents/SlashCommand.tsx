import { Extension } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import { ReactRenderer, type Editor } from "@tiptap/react";
import Suggestion, { type SuggestionOptions } from "@tiptap/suggestion";

/** PluginKey único — sin esto, dos extensiones que usan @tiptap/suggestion
 *  crashean con "Adding different instances of a keyed plugin (suggestion$)". */
const slashKey = new PluginKey("psm-slash-suggestion");
import {
  Heading1, Heading2, Heading3, List, ListOrdered, CheckSquare,
  Quote, Code, Minus, Type, Image as ImageIcon, Table as TableIcon,
  Brain, ClipboardList, Stethoscope, ShieldAlert, Users,
  Info, AlertTriangle, AlertOctagon, CheckCircle2, Paperclip, FileSignature,
} from "lucide-react";
import { forwardRef, useEffect, useImperativeHandle, useState } from "react";

export interface SlashItem {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  keywords: string[];
  group?: string;
  command: ({ editor, range }: { editor: Editor; range: { from: number; to: number } }) => void;
}

// ─── Helpers para construir bloques TipTap ─────────────────────────────────
const h2 = (text: string) => ({ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text }] });
const h3 = (text: string) => ({ type: "heading", attrs: { level: 3 }, content: [{ type: "text", text }] });
const p = (text?: string) => text
  ? { type: "paragraph", content: [{ type: "text", text }] }
  : { type: "paragraph" };

/** Construye un párrafo "Etiqueta: " con la etiqueta en negrita y el resto vacío para llenar. */
const labeledP = (label: string) => ({
  type: "paragraph",
  content: [
    { type: "text", text: label, marks: [{ type: "bold" }] },
    { type: "text", text: " " },
  ],
});
const ulItems = (items: string[]) => ({
  type: "bulletList",
  content: items.map((t) => ({
    type: "listItem",
    content: [labeledP(t)],
  })),
});

/**
 * Inserta un fragmento de bloques TipTap reemplazando el rango del slash
 * command. Usado por todos los bloques clínicos prearmados.
 */
function insertFragment(editor: Editor, range: { from: number; to: number }, content: any[]) {
  editor.chain().focus().deleteRange(range).insertContent(content).run();
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

  // ───────────────── Bloques clínicos prearmados ─────────────────
  {
    title: "Examen mental",
    description: "Apariencia, conducta, lenguaje, afecto, pensamiento, percepción, juicio, insight",
    icon: Brain,
    keywords: ["examen", "mental", "clinico", "psicopatologia", "psp"],
    group: "Clínico",
    command: ({ editor, range }) => insertFragment(editor, range, [
      h2("Examen mental"),
      ulItems([
        "Apariencia:",
        "Conducta:",
        "Lenguaje:",
        "Afecto:",
        "Pensamiento (curso, contenido):",
        "Percepción:",
        "Juicio y prueba de realidad:",
        "Insight:",
        "Memoria y atención:",
        "Riesgo auto/heterolesivo:",
      ]),
      p(),
    ]),
  },
  {
    title: "Anamnesis",
    description: "Antecedentes personales, familiares, médicos, sustancias y sociales",
    icon: ClipboardList,
    keywords: ["anamnesis", "antecedentes", "historia"],
    group: "Clínico",
    command: ({ editor, range }) => insertFragment(editor, range, [
      h2("Anamnesis"),
      h3("Antecedentes personales"),
      p(),
      h3("Antecedentes familiares (psiquiátricos / médicos)"),
      p(),
      h3("Antecedentes médicos"),
      p(),
      h3("Consumo de sustancias"),
      ulItems([
        "Tabaco:",
        "Alcohol:",
        "Otras sustancias:",
      ]),
      h3("Antecedentes psicoterapéuticos"),
      p(),
      h3("Red de apoyo y contexto social"),
      p(),
    ]),
  },
  {
    title: "Plan terapéutico TCC",
    description: "Objetivos, técnicas, frecuencia y metas",
    icon: Stethoscope,
    keywords: ["plan", "tratamiento", "tcc", "terapia", "objetivos"],
    group: "Clínico",
    command: ({ editor, range }) => insertFragment(editor, range, [
      h2("Plan terapéutico"),
      h3("Objetivos terapéuticos"),
      ulItems([
        "Corto plazo (4-6 sesiones):",
        "Mediano plazo (8-12 sesiones):",
        "Largo plazo:",
      ]),
      h3("Enfoque y técnicas"),
      ulItems([
        "Modelo:",
        "Técnicas a implementar:",
        "Tareas terapéuticas previstas:",
      ]),
      h3("Frecuencia y duración"),
      labeledP("Frecuencia de sesiones:"),
      labeledP("Duración estimada del proceso:"),
      h3("Indicadores de progreso"),
      ulItems([
        "Escalas de medición:",
        "Hitos clínicos:",
      ]),
      h3("Criterios de revisión / alta"),
      p(),
    ]),
  },
  {
    title: "Riesgo / Protocolo de crisis",
    description: "Evaluación de riesgo + plan de seguridad",
    icon: ShieldAlert,
    keywords: ["riesgo", "crisis", "suicida", "autolesion", "protocolo", "seguridad"],
    group: "Clínico",
    command: ({ editor, range }) => insertFragment(editor, range, [
      h2("Evaluación de riesgo"),
      labeledP("Nivel de riesgo (sin riesgo / bajo / moderado / alto / crítico):"),
      h3("Factores de riesgo"),
      ulItems([
        "Ideación (frecuencia, intensidad, plan, método):",
        "Antecedentes de intentos:",
        "Síntomas activos:",
        "Estresores recientes:",
        "Aislamiento social:",
      ]),
      h3("Factores protectores"),
      ulItems([
        "Red de apoyo:",
        "Razones para vivir:",
        "Adherencia al tratamiento:",
        "Acceso a medios:",
      ]),
      h3("Plan de seguridad"),
      ulItems([
        "Señales de alerta tempranas:",
        "Estrategias de afrontamiento internas:",
        "Personas de contacto en crisis:",
        "Profesionales / servicios disponibles:",
        "Líneas oficiales: 106 Bogotá, 123 emergencias, 192 MinSalud",
        "Limitación de medios letales:",
      ]),
      h3("Compromiso terapéutico"),
      p(),
    ]),
  },
  // ───────────────── Callouts ─────────────────
  {
    title: "Nota informativa",
    description: "Bloque azul para información de contexto",
    icon: Info,
    keywords: ["callout", "info", "nota", "informativa"],
    group: "Avisos",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertContent({
        type: "callout",
        attrs: { type: "info" },
        content: [{ type: "paragraph", content: [{ type: "text", text: "Información a destacar…" }] }],
      }).run();
    },
  },
  {
    title: "Aviso importante",
    description: "Bloque amarillo para advertencias",
    icon: AlertTriangle,
    keywords: ["callout", "warning", "aviso", "importante", "atencion"],
    group: "Avisos",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertContent({
        type: "callout",
        attrs: { type: "warning" },
        content: [{ type: "paragraph", content: [{ type: "text", text: "Tomar en cuenta que…" }] }],
      }).run();
    },
  },
  {
    title: "Riesgo / Alerta clínica",
    description: "Bloque rojo para riesgo o crisis",
    icon: AlertOctagon,
    keywords: ["callout", "riesgo", "alerta", "danger", "crisis", "suicida"],
    group: "Avisos",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertContent({
        type: "callout",
        attrs: { type: "danger" },
        content: [{ type: "paragraph", content: [{ type: "text", text: "Riesgo identificado:" }] }],
      }).run();
    },
  },
  {
    title: "Observación clínica",
    description: "Bloque verde para hallazgos positivos",
    icon: CheckCircle2,
    keywords: ["callout", "observacion", "success", "logro", "hallazgo"],
    group: "Avisos",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertContent({
        type: "callout",
        attrs: { type: "success" },
        content: [{ type: "paragraph", content: [{ type: "text", text: "Observación:" }] }],
      }).run();
    },
  },

  // ───────────────── Adjuntos / Firma ─────────────────
  {
    title: "Adjuntar archivo",
    description: "PDF, Word, Excel, ZIP… inline en el documento",
    icon: Paperclip,
    keywords: ["adjunto", "archivo", "pdf", "word", "attachment", "subir"],
    group: "Insertar",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run();
      // Disparamos un evento custom que el componente DocumentEditor escucha
      // y abre el file picker. La inserción la hace cuando el upload termina.
      window.dispatchEvent(new CustomEvent("psm:editor:pick-attachment"));
    },
  },
  {
    title: "Firma del profesional",
    description: "Insertar tu firma digital con sello de fecha",
    icon: FileSignature,
    keywords: ["firma", "signature", "sello", "rubrica"],
    group: "Insertar",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run();
      window.dispatchEvent(new CustomEvent("psm:editor:insert-signature"));
    },
  },

  {
    title: "Genograma · datos familiares",
    description: "Composición familiar y dinámica",
    icon: Users,
    keywords: ["genograma", "familia", "familiar", "sistemico"],
    group: "Clínico",
    command: ({ editor, range }) => insertFragment(editor, range, [
      h2("Composición familiar y genograma"),
      h3("Núcleo familiar"),
      ulItems([
        "Padre:",
        "Madre:",
        "Hermanos/as:",
        "Pareja actual:",
        "Hijos/as:",
      ]),
      h3("Familia extensa relevante"),
      p(),
      h3("Dinámica familiar"),
      ulItems([
        "Estilo de comunicación:",
        "Roles y jerarquías:",
        "Conflictos significativos:",
        "Antecedentes de salud mental en la familia:",
      ]),
      h3("Hechos vitales relevantes"),
      ulItems([
        "Pérdidas / duelos:",
        "Cambios de domicilio:",
        "Eventos traumáticos:",
      ]),
      p("💡 Si tienes el genograma dibujado, súbelo como imagen con el slash menu."),
    ]),
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

  // Agrupar por sección. Items sin grupo van a "Bloques básicos".
  const groups: Record<string, { items: SlashItem[]; firstIndex: number }> = {};
  items.forEach((it, idx) => {
    const g = it.group ?? "Bloques básicos";
    if (!groups[g]) groups[g] = { items: [], firstIndex: idx };
    groups[g].items.push(it);
  });
  // Mantener el orden de inserción de grupos (Bloques básicos primero, después
  // Clínico si es que aparece): ordenar por firstIndex.
  const orderedGroups = Object.entries(groups).sort((a, b) => a[1].firstIndex - b[1].firstIndex);

  let runningIdx = 0;
  return (
    <div className="rounded-lg border border-line-200 bg-surface shadow-card max-h-96 overflow-y-auto w-80 p-1">
      {orderedGroups.map(([groupName, { items: groupItems }]) => (
        <div key={groupName}>
          <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-[0.08em] text-ink-500 font-medium">
            {groupName}
          </div>
          {groupItems.map((it) => {
            const myIdx = runningIdx++;
            const Icon = it.icon;
            const isClinical = it.group === "Clínico";
            return (
              <button
                key={it.title}
                type="button"
                onClick={() => command(it)}
                className={
                  "w-full flex items-start gap-3 px-2 py-2 rounded-md text-left transition-colors " +
                  (myIdx === selected ? "bg-brand-50" : "hover:bg-bg-100")
                }
              >
                <span className={
                  "h-8 w-8 rounded-md flex items-center justify-center shrink-0 mt-0.5 " +
                  (isClinical ? "bg-lavender-100 text-lavender-500" : "bg-bg text-ink-700")
                }>
                  <Icon className="h-4 w-4" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm text-ink-900 font-medium">{it.title}</span>
                  <span className="block text-xs text-ink-500 truncate">{it.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
});
SlashList.displayName = "SlashList";

/**
 * Floating-element holder usado por la suggestion de TipTap. Sin tippy.js.
 * Decide flip arriba/abajo según el espacio disponible — importante cerca del
 * borde inferior (taskbar Windows, barra Safari mobile, etc).
 */
function makePopover() {
  const el = document.createElement("div");
  el.style.cssText = "position:fixed;z-index:9999;display:none;visibility:hidden;overflow:auto;";
  document.body.appendChild(el);
  return {
    el,
    show: (rect: DOMRect) => {
      el.style.display = "block";
      el.style.visibility = "hidden";
      // Limitamos left a viewport
      el.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 320))}px`;
      el.style.top = "0";
      requestAnimationFrame(() => {
        const menuH = el.offsetHeight;
        const viewH = window.innerHeight;
        const spaceBelow = viewH - rect.bottom;
        const spaceAbove = rect.top;
        const goUp = spaceBelow < menuH + 16 && spaceAbove > spaceBelow;
        const top = goUp ? Math.max(8, rect.top - menuH - 6) : rect.bottom + 6;
        el.style.top = `${top}px`;
        el.style.maxHeight = `${Math.max(160, (goUp ? spaceAbove : spaceBelow) - 16)}px`;
        el.style.visibility = "visible";
      });
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
        pluginKey: slashKey,
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
