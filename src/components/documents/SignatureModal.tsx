import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { X, Upload, Pen, Type as TypeIcon, Trash2, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

type Tab = "draw" | "upload" | "typed";

interface Props {
  initialDataUrl?: string | null;
  /** Cuando se guarda exitosamente, devuelve la URL pública servida por el backend. */
  onSaved: (signatureUrl: string) => void;
  onClose: () => void;
}

/**
 * Modal con 3 modos para capturar firma del profesional:
 * - Dibujar: canvas con mouse/touch
 * - Subir imagen: file input (.png/.jpg/.svg)
 * - Tipográfica: nombre del profesional renderizado como SVG cursiva
 *
 * El resultado se guarda en /api/workspace/me/signature (PUT con dataUrl).
 */
export function SignatureModal({ initialDataUrl, onSaved, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("draw");
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(initialDataUrl ?? null);

  const saveMu = useMutation({
    mutationFn: async (dataUrl: string) => {
      const res = await api.setMySignature(dataUrl);
      return res.signature_url;
    },
    onSuccess: (url) => {
      toast.success("Firma guardada");
      onSaved(url);
    },
    onError: (e: Error) => toast.error(e.message ?? "No se pudo guardar la firma"),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink-900/50 backdrop-blur-sm p-0 sm:p-4" onClick={onClose}>
      <div
        className="w-full sm:max-w-lg bg-surface rounded-t-2xl sm:rounded-2xl shadow-modal max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-4 border-b border-line-100 flex items-start justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-brand-700 font-medium">Firma del profesional</p>
            <h3 className="font-serif text-xl text-ink-900 mt-0.5">Mi firma</h3>
            <p className="text-xs text-ink-500 mt-1">Se guarda en tu perfil y queda disponible para insertarla en cualquier documento.</p>
          </div>
          <button onClick={onClose} className="h-9 w-9 rounded-md border border-line-200 flex items-center justify-center text-ink-500 hover:border-brand-400">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="px-5 pt-4">
          <div className="flex gap-1 border-b border-line-100">
            <TabBtn active={tab === "draw"} onClick={() => setTab("draw")} icon={<Pen className="h-3.5 w-3.5" />}>Dibujar</TabBtn>
            <TabBtn active={tab === "upload"} onClick={() => setTab("upload")} icon={<Upload className="h-3.5 w-3.5" />}>Subir imagen</TabBtn>
            <TabBtn active={tab === "typed"} onClick={() => setTab("typed")} icon={<TypeIcon className="h-3.5 w-3.5" />}>Tipográfica</TabBtn>
          </div>
        </div>

        <div className="p-5">
          {tab === "draw" && <DrawTab onChange={setPreviewDataUrl} initial={initialDataUrl} />}
          {tab === "upload" && <UploadTab onChange={setPreviewDataUrl} />}
          {tab === "typed" && <TypedTab onChange={setPreviewDataUrl} />}
        </div>

        {previewDataUrl && (
          <div className="px-5 pb-3">
            <p className="text-[11px] uppercase tracking-wider text-ink-500 mb-1.5">Vista previa</p>
            <div className="rounded-md border border-line-200 bg-bg-100 p-2 inline-flex items-center justify-center">
              <img src={previewDataUrl} alt="Vista previa de firma" className="max-h-24" />
            </div>
          </div>
        )}

        <footer className="px-5 py-4 border-t border-line-100 flex items-center justify-between gap-2">
          {initialDataUrl && (
            <button
              type="button"
              onClick={async () => {
                if (!confirm("¿Eliminar la firma guardada?")) return;
                try {
                  await api.clearMySignature();
                  toast.success("Firma eliminada");
                  onSaved("");
                } catch (e: any) { toast.error(e.message); }
              }}
              className="text-xs text-rose-700 hover:underline inline-flex items-center gap-1"
            >
              <Trash2 className="h-3 w-3" /> Eliminar firma guardada
            </button>
          )}
          <div className="ml-auto flex gap-2">
            <button onClick={onClose} className="h-10 px-4 rounded-lg border border-line-200 bg-bg text-sm text-ink-700 hover:border-brand-400">
              Cancelar
            </button>
            <button
              onClick={() => previewDataUrl && saveMu.mutate(previewDataUrl)}
              disabled={!previewDataUrl || saveMu.isPending}
              className="h-10 px-4 rounded-lg bg-brand-700 text-white text-sm font-medium hover:bg-brand-800 disabled:opacity-50 inline-flex items-center gap-2"
            >
              {saveMu.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Guardar firma
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-3 py-2 text-xs sm:text-sm font-medium border-b-2 transition-colors -mb-px inline-flex items-center gap-1.5",
        active ? "border-brand-700 text-brand-700" : "border-transparent text-ink-500 hover:text-ink-700"
      )}
    >
      {icon} {children}
    </button>
  );
}

// ─── Draw tab: canvas con mouse/touch ───────────────────────────────────────
function DrawTab({ onChange, initial }: { onChange: (dataUrl: string | null) => void; initial?: string | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Fondo blanco para que la imagen final tenga contraste
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#1f2937";
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Cargar firma inicial si existe
    if (initial) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const ratio = Math.min(canvas.width / img.width, canvas.height / img.height);
        const w = img.width * ratio;
        const h = img.height * ratio;
        ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
        onChange(canvas.toDataURL("image/png"));
      };
      img.onerror = () => {/* ignorar (CORS posible) */};
      img.src = initial;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function getPos(e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * e.currentTarget.width,
      y: ((e.clientY - rect.top) / rect.height) * e.currentTarget.height,
    };
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    lastPosRef.current = getPos(e);
  }
  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e);
    const last = lastPosRef.current;
    if (last) {
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    }
    lastPosRef.current = pos;
  }
  function onPointerUp() {
    drawingRef.current = false;
    lastPosRef.current = null;
    const url = canvasRef.current?.toDataURL("image/png");
    onChange(url ?? null);
  }
  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    onChange(null);
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-ink-500">Dibuja tu firma con mouse o trackpad. Toca y arrastra.</p>
      <div className="rounded-lg border border-line-200 bg-white">
        <canvas
          ref={canvasRef}
          width={600}
          height={200}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="w-full cursor-crosshair touch-none"
          style={{ aspectRatio: "3 / 1" }}
        />
      </div>
      <button onClick={clear} className="text-xs text-ink-500 hover:text-rose-700 inline-flex items-center gap-1">
        <Trash2 className="h-3 w-3" /> Limpiar
      </button>
    </div>
  );
}

// ─── Upload tab: file input ─────────────────────────────────────────────────
function UploadTab({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/")) { toast.error("Solo imágenes"); return; }
    const reader = new FileReader();
    reader.onload = () => onChange(reader.result as string);
    reader.readAsDataURL(f);
  }
  return (
    <div className="space-y-2">
      <p className="text-xs text-ink-500">Sube una imagen de tu firma (PNG, JPG o SVG con fondo claro).</p>
      <label className="block border-2 border-dashed border-line-200 rounded-lg p-6 text-center cursor-pointer hover:border-brand-400 hover:bg-bg-100/50">
        <Upload className="h-7 w-7 mx-auto text-ink-400 mb-2" />
        <p className="text-sm text-ink-700 font-medium">Click para elegir archivo</p>
        <p className="text-xs text-ink-500 mt-0.5">PNG / JPG / SVG · máx 1 MB</p>
        <input type="file" accept="image/png,image/jpeg,image/svg+xml" hidden onChange={onFile} />
      </label>
    </div>
  );
}

// ─── Typed tab: texto a SVG ─────────────────────────────────────────────────
function TypedTab({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const [text, setText] = useState("");
  const [font, setFont] = useState<"cursive" | "serif" | "italic">("cursive");

  useEffect(() => {
    if (!text.trim()) { onChange(null); return; }
    const fontFamily = font === "cursive"
      ? "'Brush Script MT', 'Lucida Handwriting', cursive"
      : font === "italic"
        ? "'Fraunces', Georgia, serif"
        : "'Fraunces', Georgia, serif";
    const fontStyle = font === "italic" ? "italic" : "normal";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="180" viewBox="0 0 600 180">
  <rect width="600" height="180" fill="#ffffff"/>
  <text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle"
        font-family="${fontFamily}" font-style="${fontStyle}" font-size="56" fill="#1f2937">${escapeXml(text.trim())}</text>
</svg>`;
    const dataUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
    onChange(dataUrl);
  }, [text, font, onChange]);

  return (
    <div className="space-y-3">
      <p className="text-xs text-ink-500">Escribe tu nombre completo y elige el estilo de letra.</p>
      <input
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Ej: Nathaly Ferrer Pacheco"
        className="w-full h-10 px-3 rounded-md border border-line-200 bg-bg text-sm focus:outline-none focus:border-brand-400"
      />
      <div className="flex gap-2">
        {(["cursive", "italic", "serif"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFont(f)}
            className={cn(
              "h-9 px-3 rounded-md text-xs font-medium border transition-colors",
              font === f ? "border-brand-700 bg-brand-50 text-brand-700" : "border-line-200 text-ink-700 hover:border-brand-400"
            )}
          >
            {f === "cursive" ? "Cursiva" : f === "italic" ? "Serif itálica" : "Serif"}
          </button>
        ))}
      </div>
    </div>
  );
}

function escapeXml(s: string) {
  return s.replace(/[<>&'"]/g, (c) =>
    c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === "&" ? "&amp;" : c === "'" ? "&apos;" : "&quot;"
  );
}
