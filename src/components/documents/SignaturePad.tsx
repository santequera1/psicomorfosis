import { useEffect, useRef, useState } from "react";
import { Eraser } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Pad de firma con canvas. Captura trazos por puntero (mouse/táctil) y
 * emite un PNG data URL en `onChange` cada vez que el usuario levanta el
 * dedo. `defaultDataUrl` permite precargar una firma guardada para que el
 * paciente solo confirme — útil en el flujo de "usar firma guardada".
 */
export function SignaturePad({
  onChange,
  defaultDataUrl,
  height = 220,
}: {
  onChange: (dataUrl: string | null) => void;
  defaultDataUrl?: string | null;
  height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);
  const [hasStrokes, setHasStrokes] = useState(!!defaultDataUrl);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#1f2937";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (defaultDataUrl) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        // Re-emitimos el dataUrl para que el padre tenga el blob actual.
        onChange(canvas.toDataURL("image/png"));
      };
      img.src = defaultDataUrl;
    }
    // Eslint-disable: el efecto debe correr una sola vez al montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function getPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * e.currentTarget.width,
      y: ((e.clientY - rect.top) / rect.height) * e.currentTarget.height,
    };
  }
  function onDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    lastPosRef.current = getPos(e);
  }
  function onMove(e: React.PointerEvent<HTMLCanvasElement>) {
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
    setHasStrokes(true);
  }
  function onUp() {
    drawingRef.current = false;
    lastPosRef.current = null;
    onChange(canvasRef.current?.toDataURL("image/png") ?? null);
  }
  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHasStrokes(false);
    onChange(null);
  }

  return (
    <div>
      <div className={cn(
        "rounded-lg border-2 bg-white transition-colors",
        hasStrokes ? "border-brand-400" : "border-dashed border-line-200"
      )}>
        <canvas
          ref={canvasRef}
          width={600}
          height={height}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          className="w-full cursor-crosshair touch-none"
          style={{ aspectRatio: `3 / ${(height / 600) * 3}` }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between text-xs">
        <button type="button" onClick={clear} className="text-ink-500 hover:text-rose-700 inline-flex items-center gap-1">
          <Eraser className="h-3 w-3" /> Borrar y volver a firmar
        </button>
        <span className={hasStrokes ? "text-sage-700" : "text-ink-400"}>
          {hasStrokes ? "Firma capturada ✓" : "Aún sin firmar"}
        </span>
      </div>
    </div>
  );
}
