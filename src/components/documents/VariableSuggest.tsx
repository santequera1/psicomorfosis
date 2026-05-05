import { Extension } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import { ReactRenderer, type Editor } from "@tiptap/react";
import Suggestion, { type SuggestionOptions } from "@tiptap/suggestion";

/** PluginKey único — sin esto, dos extensiones que usan @tiptap/suggestion
 *  crashean con "Adding different instances of a keyed plugin (suggestion$)". */
const variableKey = new PluginKey("psm-variable-suggestion");
import { forwardRef, useEffect, useImperativeHandle, useState } from "react";

/**
 * Variables disponibles en plantillas y documentos. Se reemplazan por los
 * valores reales al CREAR un documento desde una plantilla. En el editor
 * aparecen como texto plano `{{ruta}}`.
 */
export interface Variable {
  key: string;
  label: string;
  example: string;
  group: string;
}

export const VARIABLES: Variable[] = [
  { key: "paciente.nombre",                label: "Nombre del paciente",            example: "Andrés Felipe Galeano", group: "Paciente" },
  { key: "paciente.documento",             label: "Documento del paciente",         example: "CC 79.554.012",          group: "Paciente" },
  { key: "paciente.edad",                  label: "Edad del paciente",              example: "41",                     group: "Paciente" },
  { key: "paciente.telefono",              label: "Teléfono del paciente",          example: "+57 312 998 0021",       group: "Paciente" },
  { key: "paciente.email",                 label: "Correo del paciente",            example: "afgaleano@correo.co",    group: "Paciente" },
  { key: "paciente.modalidad",             label: "Modalidad",                      example: "individual",             group: "Paciente" },
  { key: "profesional.nombre",             label: "Nombre del profesional",         example: "Nathaly Ferrer Pacheco", group: "Profesional" },
  { key: "profesional.tarjeta_profesional",label: "Tarjeta profesional",            example: "TP 12345-2018",          group: "Profesional" },
  { key: "profesional.email",              label: "Correo del profesional",         example: "nathaly@psicomorfosis.co", group: "Profesional" },
  { key: "profesional.telefono",           label: "Teléfono del profesional",       example: "+57 304 219 0650",       group: "Profesional" },
  { key: "profesional.enfoque",            label: "Enfoque terapéutico",            example: "TCC",                    group: "Profesional" },
  { key: "clinica.razon_social",           label: "Razón social",                   example: "Consulta Psic. Nathaly", group: "Clínica" },
  { key: "clinica.direccion",              label: "Dirección",                      example: "Cartagena · Torices",    group: "Clínica" },
  { key: "clinica.telefono",               label: "Teléfono",                       example: "+57 304 219 0650",       group: "Clínica" },
  { key: "clinica.ciudad",                 label: "Ciudad",                         example: "Cartagena",              group: "Clínica" },
  { key: "clinica.consultorio",            label: "Nombre del consultorio",         example: "Consultorio en Torices", group: "Clínica" },
  { key: "fecha.hoy",                      label: "Fecha (YYYY-MM-DD)",             example: "2026-04-26",             group: "Fecha" },
  { key: "fecha.larga",                    label: "Fecha (humana)",                 example: "26 de abril de 2026",    group: "Fecha" },
  { key: "sesion.fecha",                   label: "Fecha de sesión",                example: "2026-04-26",             group: "Sesión" },
  { key: "sesion.fecha_larga",             label: "Fecha de sesión (humana)",       example: "26 de abril de 2026",    group: "Sesión" },
  { key: "sesion.numero",                  label: "Número de sesión",               example: "12",                     group: "Sesión" },
  { key: "sesion.tipo",                    label: "Tipo de nota",                   example: "sesion",                 group: "Sesión" },
  { key: "sesion.autor",                   label: "Autor de la nota",               example: "Nathaly Ferrer Pacheco", group: "Sesión" },
  { key: "sesion.s",                       label: "Subjetivo (S)",                  example: "Reporta mejor sueño…",   group: "Sesión" },
  { key: "sesion.o",                       label: "Objetivo (O)",                   example: "Afecto eutímico…",       group: "Sesión" },
  { key: "sesion.a",                       label: "Análisis (A)",                   example: "Reducción de síntomas…", group: "Sesión" },
  { key: "sesion.p",                       label: "Plan (P)",                       example: "Continuar TCC…",         group: "Sesión" },
  { key: "sesion.contenido",               label: "Contenido completo",             example: "S: …\nO: …\nA: …\nP: …", group: "Sesión" },
];

export type VariableListRef = {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
};

interface VariableListProps {
  items: Variable[];
  command: (item: Variable) => void;
}

export const VariableList = forwardRef<VariableListRef, VariableListProps>(({ items, command }, ref) => {
  const [selected, setSelected] = useState(0);
  useEffect(() => setSelected(0), [items]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === "ArrowUp")   { setSelected((s) => (s + items.length - 1) % items.length); return true; }
      if (event.key === "ArrowDown") { setSelected((s) => (s + 1) % items.length);                 return true; }
      if (event.key === "Enter" || event.key === "Tab") {
        const it = items[selected]; if (it) command(it); return true;
      }
      return false;
    },
  }));

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-line-200 bg-surface shadow-card p-3 text-xs text-ink-500 w-72">
        Sin variables que coincidan
      </div>
    );
  }

  // Agrupar por sección visual
  const grouped: Record<string, Variable[]> = {};
  items.forEach((it) => { (grouped[it.group] ??= []).push(it); });

  let runningIdx = 0;
  return (
    <div className="rounded-lg border border-line-200 bg-surface shadow-card w-80 p-1 overflow-y-auto" style={{ maxHeight: "inherit" }}>
      {Object.entries(grouped).map(([group, vars]) => (
        <div key={group}>
          <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-[0.08em] text-ink-500 font-medium">{group}</div>
          {vars.map((v) => {
            const myIdx = runningIdx++;
            return (
              <button
                key={v.key}
                type="button"
                onClick={() => command(v)}
                className={
                  "w-full flex items-start gap-2 px-3 py-1.5 rounded-md text-left transition-colors " +
                  (myIdx === selected ? "bg-brand-50" : "hover:bg-bg-100")
                }
              >
                <span className="flex-1 min-w-0">
                  <span className="block text-sm text-ink-900 font-medium truncate">{v.label}</span>
                  <span className="block text-[11px] text-ink-500 truncate font-mono">{`{{${v.key}}}`}</span>
                </span>
                <span className="text-[10px] text-ink-400 truncate max-w-32 mt-1">{v.example}</span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
});
VariableList.displayName = "VariableList";

function makeVarPopover() {
  const el = document.createElement("div");
  el.style.cssText = "position:fixed;z-index:9999;display:none;visibility:hidden;overflow:auto;";
  document.body.appendChild(el);
  return {
    el,
    show: (rect: DOMRect) => {
      el.style.display = "block";
      el.style.visibility = "hidden";
      el.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 340))}px`;
      el.style.top = "0";
      requestAnimationFrame(() => {
        const menuH = el.offsetHeight;
        const viewH = window.innerHeight;
        const spaceBelow = viewH - rect.bottom;
        const spaceAbove = rect.top;
        const goUp = spaceBelow < menuH + 16 && spaceAbove > spaceBelow;
        el.style.top = `${goUp ? Math.max(8, rect.top - menuH - 6) : rect.bottom + 6}px`;
        el.style.maxHeight = `${Math.max(160, (goUp ? spaceAbove : spaceBelow) - 16)}px`;
        el.style.visibility = "visible";
      });
    },
    hide: () => { el.style.display = "none"; },
    destroy: () => { el.remove(); },
  };
}

/**
 * Extensión TipTap que detecta `{{` como trigger y abre un menú con las
 * variables disponibles. Al elegir una, inserta `{{paciente.nombre}}`
 * (con dobles llaves de cierre) en el editor.
 */
export const VariableSuggest = Extension.create({
  name: "variableSuggest",
  addOptions(): { suggestion: Partial<SuggestionOptions> } {
    return {
      suggestion: {
        char: "{{",
        startOfLine: false,
        // Permitir queries con punto y guion (paciente.nombre)
        allowedPrefixes: null,
        command: ({ editor, range, props }) => {
          const v = props as Variable;
          // Insertar como node `variable` (inline atom) — renderiza el valor
          // resuelto en vivo y no se queda como texto literal.
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .insertContent([
              { type: "variable", attrs: { key: v.key } },
              { type: "text", text: " " },
            ])
            .run();
        },
      },
    };
  },
  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        pluginKey: variableKey,
        ...this.options.suggestion,
        items: ({ query }) => {
          const q = query.toLowerCase().trim();
          if (!q) return VARIABLES;
          return VARIABLES.filter((v) =>
            v.key.toLowerCase().includes(q) ||
            v.label.toLowerCase().includes(q) ||
            v.group.toLowerCase().includes(q)
          );
        },
        render: () => {
          let component: ReactRenderer<VariableListRef, VariableListProps> | null = null;
          let popover: ReturnType<typeof makeVarPopover> | null = null;

          return {
            onStart: (props) => {
              popover = makeVarPopover();
              component = new ReactRenderer(VariableList, {
                props: { items: props.items, command: props.command },
                editor: props.editor as Editor,
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
              if (props.event.key === "Escape") { popover?.hide(); return true; }
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
