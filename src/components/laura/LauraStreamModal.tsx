import { useEffect, useRef, useState } from "react";
import type { LauraStreamEvent } from "@/lib/api";
import { X, AlertCircle, Sparkles } from "lucide-react";

/**
 * Modal genérico para streams one-shot de Laura — briefings, análisis
 * de progreso, y futuros derivados. Toma una función `start` que
 * recibe los callbacks de eventos y devuelve una Promise; el modal
 * acumula los `delta` text y los renderiza con un parser markdown
 * ligero (H2 + bullets + bold/italic/code).
 *
 * Acciones del footer las define el caller (botones contextuales:
 * "Tomar nota", "Abrir ficha", etc).
 */

type StreamStarter = (
  onEvent: (ev: LauraStreamEvent) => void,
  signal: AbortSignal,
) => Promise<void>;

type Props = {
  /** Etiqueta breve del tipo de output ("Briefing", "Análisis de progreso", etc). */
  kind: string;
  /** Título principal (nombre del paciente, generalmente). */
  title: string;
  /** Llamada al SDK que dispara el stream. */
  start: StreamStarter;
  /** Quick actions de pie de modal. */
  footer?: React.ReactNode;
  onClose: () => void;
};

export function LauraStreamModal({ kind, title, start, footer, onClose }: Props) {
  const [text, setText] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    const ctrl = new AbortController();
    (async () => {
      try {
        await start(
          (ev) => {
            if (ev.type === "delta") setText((p) => p + ev.text);
            else if (ev.type === "error") setError(ev.message);
            else if (ev.type === "done") setDone(true);
          },
          ctrl.signal,
        );
      } catch (err: unknown) {
        if (ctrl.signal.aborted) return;
        setError(err instanceof Error ? err.message : "No pude cargar el contenido");
        setDone(true);
      }
    })();
    return () => { ctrl.abort(); };
  }, [start]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-ink-900/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-2xl shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col border border-line-200 animate-in zoom-in-95 fade-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-3 p-4 border-b border-line-100 shrink-0">
          <img src="/laura/laura-profile-2.svg" alt="" className="h-10 w-10 rounded-full object-cover bg-brand-50" />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-widest text-brand-700 font-semibold inline-flex items-center gap-1.5">
              <Sparkles className="h-3 w-3" /> {kind}
            </p>
            <h3 className="font-serif text-base text-ink-900 truncate">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 rounded-md text-ink-500 hover:bg-bg-50 inline-flex items-center justify-center"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 text-sm text-ink-800 leading-relaxed">
          {!text && !error && (
            <div className="flex items-center gap-2 text-xs text-ink-500 py-6 justify-center">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-700 animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="h-1.5 w-1.5 rounded-full bg-brand-700 animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="h-1.5 w-1.5 rounded-full bg-brand-700 animate-bounce" style={{ animationDelay: "300ms" }} />
              <span className="ml-2">Laura está preparando el contenido…</span>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 inline-flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {text && <Markdown text={text} streaming={!done && !error} />}
        </div>

        {footer && (
          <footer className="border-t border-line-100 p-3 shrink-0 flex flex-wrap items-center gap-2 justify-end">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}

// ─── Markdown ligero ──────────────────────────────────────────────────

type Block =
  | { kind: "h2"; text: string }
  | { kind: "p"; text: string }
  | { kind: "list"; items: string[] };

function Markdown({ text, streaming }: { text: string; streaming?: boolean }) {
  const blocks = parseBlocks(text);
  return (
    <div className="space-y-3">
      {blocks.map((b, i) => <BlockRenderer key={i} block={b} />)}
      {streaming && <span className="inline-block w-1.5 h-3.5 bg-ink-400 align-text-bottom animate-pulse" />}
    </div>
  );
}

function parseBlocks(input: string): Block[] {
  const lines = input.split("\n");
  const out: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (line.startsWith("## ")) { out.push({ kind: "h2", text: line.slice(3).trim() }); i++; continue; }
    if (line.startsWith("# "))  { out.push({ kind: "h2", text: line.slice(2).trim() }); i++; continue; }
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s+/, "").trim());
        i++;
      }
      out.push({ kind: "list", items });
      continue;
    }
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].startsWith("# ") &&
      !lines[i].startsWith("## ") &&
      !/^[-*]\s+/.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length) out.push({ kind: "p", text: paraLines.join(" ") });
  }
  return out;
}

function BlockRenderer({ block }: { block: Block }) {
  if (block.kind === "h2") {
    return (
      <h4 className="text-[11px] uppercase tracking-widest text-brand-700 font-semibold mt-3 first:mt-0">
        {block.text}
      </h4>
    );
  }
  if (block.kind === "list") {
    return (
      <ul className="space-y-1.5 list-none">
        {block.items.map((it, i) => (
          <li key={i} className="flex gap-2 text-sm text-ink-800">
            <span className="text-brand-600 mt-1.5 shrink-0">•</span>
            <span className="flex-1"><InlineMarkdown text={it} /></span>
          </li>
        ))}
      </ul>
    );
  }
  return <p className="text-sm text-ink-800"><InlineMarkdown text={block.text} /></p>;
}

function InlineMarkdown({ text }: { text: string }) {
  const re = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`)/g;
  const out: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith("**"))      out.push(<strong key={k++} className="text-ink-900 font-semibold">{t.slice(2, -2)}</strong>);
    else if (t.startsWith("`"))  out.push(<code key={k++} className="px-1 py-0.5 rounded bg-bg-100 text-[11px] text-ink-900 font-mono">{t.slice(1, -1)}</code>);
    else                         out.push(<em key={k++} className="italic">{t.slice(1, -1)}</em>);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out.map((n, i) => <span key={i}>{n}</span>)}</>;
}
