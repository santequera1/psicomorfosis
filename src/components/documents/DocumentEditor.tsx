import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { Image } from "@tiptap/extension-image";
import { Placeholder } from "@tiptap/extension-placeholder";
import { TaskList } from "@tiptap/extension-task-list";
import { TaskItem } from "@tiptap/extension-task-item";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { Typography } from "@tiptap/extension-typography";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bold, Italic, Underline, Strikethrough, Heading1, Heading2, Heading3,
  List, ListOrdered, CheckSquare, Quote, Code, Minus, Link2,
  Image as ImageIcon, Undo, Redo, Type,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SlashCommand } from "./SlashCommand";
import type { TipTapDoc } from "@/lib/api";

interface Props {
  initialDoc: TipTapDoc | null;
  onChange?: (doc: TipTapDoc, text: string) => void;
  editable?: boolean;
  placeholder?: string;
  /** Callback al subir imagen (devuelve URL). Si no se provee, el botón pide URL manualmente. */
  onUploadImage?: (file: File) => Promise<string>;
}

const EMPTY_DOC: TipTapDoc = { type: "doc", content: [{ type: "paragraph" }] };

export function DocumentEditor({ initialDoc, onChange, editable = true, placeholder, onUploadImage }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Mantener defaults del starter (heading, lists, blockquote, codeBlock, hr, etc.)
      }),
      Typography,
      Placeholder.configure({
        placeholder: placeholder ?? "Escribe \"/\" para insertar bloques o empieza a redactar…",
      }),
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { class: "text-brand-700 underline" } }),
      Image.configure({ HTMLAttributes: { class: "rounded-lg max-w-full" } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      SlashCommand,
    ],
    content: initialDoc ?? EMPTY_DOC,
    editable,
    editorProps: {
      attributes: {
        class: "psm-editor-content focus:outline-none min-h-[400px] py-6",
      },
    },
    onUpdate: ({ editor }) => {
      if (!onChange) return;
      onChange(editor.getJSON() as TipTapDoc, editor.getText());
    },
  });

  // Si cambia editable (ej: documento se firmó mientras editaba), aplicar al editor
  useEffect(() => {
    if (editor) editor.setEditable(editable);
  }, [editable, editor]);

  // Cuando initialDoc cambia (cambio de documento en la misma instancia), recargar
  useEffect(() => {
    if (editor && initialDoc) {
      const current = editor.getJSON();
      if (JSON.stringify(current) !== JSON.stringify(initialDoc)) {
        editor.commands.setContent(initialDoc, { emitUpdate: false });
      }
    }
  }, [initialDoc, editor]);

  if (!editor) return <div className="min-h-[400px] flex items-center justify-center text-sm text-ink-500">Cargando editor…</div>;

  async function pickAndUploadImage() {
    fileInputRef.current?.click();
  }

  async function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (onUploadImage) {
      try {
        const url = await onUploadImage(file);
        editor?.chain().focus().setImage({ src: url }).run();
      } catch (err: any) {
        alert("No se pudo subir la imagen: " + (err?.message ?? err));
      }
    } else {
      const url = window.prompt("URL de la imagen:");
      if (url) editor?.chain().focus().setImage({ src: url }).run();
    }
  }

  function setLink() {
    const prev = editor?.getAttributes("link").href as string | undefined;
    const url = window.prompt("URL del enlace:", prev ?? "https://");
    if (url === null) return;
    if (url === "") {
      editor?.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor?.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }

  return (
    <div className="bg-surface rounded-xl border border-line-200">
      {editable && <Toolbar editor={editor} onSetLink={setLink} onPickImage={pickAndUploadImage} />}
      <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={onFileChosen} />
      <div className="px-6 sm:px-10">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

function Toolbar({ editor, onSetLink, onPickImage }: { editor: Editor; onSetLink: () => void; onPickImage: () => void }) {
  return (
    <div className="sticky top-0 z-10 bg-surface/95 backdrop-blur border-b border-line-100 rounded-t-xl px-3 py-2 flex items-center gap-0.5 overflow-x-auto no-scrollbar">
      <BtnGroup>
        <Btn onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="Deshacer (⌘Z)">
          <Undo className="h-4 w-4" />
        </Btn>
        <Btn onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="Rehacer (⌘⇧Z)">
          <Redo className="h-4 w-4" />
        </Btn>
      </BtnGroup>
      <Sep />
      <BtnGroup>
        <Btn active={editor.isActive("paragraph")} onClick={() => editor.chain().focus().setParagraph().run()} title="Texto normal">
          <Type className="h-4 w-4" />
        </Btn>
        <Btn active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} title="Título 1">
          <Heading1 className="h-4 w-4" />
        </Btn>
        <Btn active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="Título 2">
          <Heading2 className="h-4 w-4" />
        </Btn>
        <Btn active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title="Título 3">
          <Heading3 className="h-4 w-4" />
        </Btn>
      </BtnGroup>
      <Sep />
      <BtnGroup>
        <Btn active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} title="Negrita (⌘B)">
          <Bold className="h-4 w-4" />
        </Btn>
        <Btn active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} title="Cursiva (⌘I)">
          <Italic className="h-4 w-4" />
        </Btn>
        <Btn active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleMark("underline" as any).run()} title="Subrayado">
          <Underline className="h-4 w-4" />
        </Btn>
        <Btn active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()} title="Tachado">
          <Strikethrough className="h-4 w-4" />
        </Btn>
      </BtnGroup>
      <Sep />
      <BtnGroup>
        <Btn active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Lista">
          <List className="h-4 w-4" />
        </Btn>
        <Btn active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Lista numerada">
          <ListOrdered className="h-4 w-4" />
        </Btn>
        <Btn active={editor.isActive("taskList")} onClick={() => editor.chain().focus().toggleTaskList().run()} title="Tareas">
          <CheckSquare className="h-4 w-4" />
        </Btn>
        <Btn active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="Cita">
          <Quote className="h-4 w-4" />
        </Btn>
        <Btn active={editor.isActive("codeBlock")} onClick={() => editor.chain().focus().toggleCodeBlock().run()} title="Código">
          <Code className="h-4 w-4" />
        </Btn>
      </BtnGroup>
      <Sep />
      <BtnGroup>
        <Btn onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Separador">
          <Minus className="h-4 w-4" />
        </Btn>
        <Btn active={editor.isActive("link")} onClick={onSetLink} title="Enlace">
          <Link2 className="h-4 w-4" />
        </Btn>
        <Btn onClick={onPickImage} title="Imagen">
          <ImageIcon className="h-4 w-4" />
        </Btn>
      </BtnGroup>
    </div>
  );
}

function Btn({ active, disabled, onClick, title, children }: { active?: boolean; disabled?: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "h-8 w-8 rounded-md inline-flex items-center justify-center transition-colors",
        active ? "bg-brand-50 text-brand-700" : "text-ink-700 hover:bg-bg-100 disabled:opacity-40 disabled:hover:bg-transparent"
      )}
    >
      {children}
    </button>
  );
}

function BtnGroup({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-0.5 shrink-0">{children}</div>;
}
function Sep() { return <div className="h-6 w-px bg-line-200 mx-1 shrink-0" />; }

/** Hook utilitario: debounce de un callback con cleanup. */
export function useDebouncedSave<T>(value: T, save: (v: T) => Promise<void> | void, delay = 1500) {
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);
  const skipFirstRef = useRef(true);

  useEffect(() => {
    if (skipFirstRef.current) { skipFirstRef.current = false; return; }
    const t = setTimeout(async () => {
      setSaving(true);
      try {
        await save(value);
        setSavedAt(new Date());
      } finally {
        setSaving(false);
      }
    }, delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const label = useMemo(() => {
    if (saving) return "Guardando…";
    if (!savedAt) return "Sin cambios";
    return `Guardado a las ${savedAt.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}`;
  }, [saving, savedAt]);

  return { label, saving, savedAt };
}
