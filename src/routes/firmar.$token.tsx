import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CheckCircle2, Loader2, AlertCircle, FileText, Pen, Eraser, ShieldCheck,
  MapPin, Lock,
} from "lucide-react";
import { api } from "@/lib/api";
import { Logo } from "@/components/app/Logo";
import { DocumentEditor } from "@/components/documents/DocumentEditor";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/firmar/$token")({
  head: () => ({ meta: [{ title: "Firmar documento — Psicomorfosis" }] }),
  component: SignPage,
});

function SignPage() {
  const { token } = Route.useParams();
  const [agreed, setAgreed] = useState(false);
  const [stage, setStage] = useState<"reading" | "signing" | "done">("reading");
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [includeGeo, setIncludeGeo] = useState(false);
  const [geo, setGeo] = useState<{ lat: number; lng: number; accuracy?: number } | null>(null);
  const [result, setResult] = useState<{ signed_at: string; cert_sha256: string; cert_data: any } | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["sign-request", token],
    queryFn: () => api.validateSignToken(token),
    retry: false,
  });

  // Forzar light theme — el firmante no debe heredar dark mode del staff
  useEffect(() => {
    const wasDark = document.documentElement.classList.contains("dark");
    document.documentElement.classList.remove("dark");
    return () => { if (wasDark) document.documentElement.classList.add("dark"); };
  }, []);

  const submitMu = useMutation({
    mutationFn: (body: { signature_data_url: string; geolocation?: { lat: number; lng: number; accuracy?: number } }) =>
      api.submitSignature(token, body),
    onSuccess: (res) => {
      setResult(res);
      setStage("done");
    },
    onError: (e: Error) => toast.error(e.message ?? "No se pudo enviar la firma"),
  });

  function requestGeo() {
    if (!navigator.geolocation) {
      toast.error("Tu navegador no soporta geolocalización");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeo({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
        setIncludeGeo(true);
        toast.success("Ubicación capturada");
      },
      () => toast.error("No se pudo obtener tu ubicación. Continúa sin ella si prefieres."),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  function submit() {
    if (!signatureDataUrl) {
      toast.error("Por favor dibuja tu firma antes de enviar");
      return;
    }
    submitMu.mutate({
      signature_data_url: signatureDataUrl,
      geolocation: includeGeo && geo ? geo : undefined,
    });
  }

  if (isLoading) {
    return <SignCanvas><div className="text-center py-20 text-ink-500"><Loader2 className="h-6 w-6 mx-auto mb-3 animate-spin" /> Verificando documento…</div></SignCanvas>;
  }

  if (error) {
    const msg = (error as any)?.message ?? "El enlace no es válido.";
    const expired = msg.toLowerCase().includes("expir");
    const signed = msg.toLowerCase().includes("firmado");
    return (
      <SignCanvas>
        <div className="text-center py-12 max-w-sm mx-auto">
          <div className="h-14 w-14 mx-auto rounded-full bg-amber-50 flex items-center justify-center mb-4">
            <AlertCircle className="h-7 w-7 text-amber-700" />
          </div>
          <h1 className="font-serif text-2xl text-ink-900 mb-2">
            {expired ? "Este enlace expiró" : signed ? "Documento ya firmado" : "Enlace no válido"}
          </h1>
          <p className="text-sm text-ink-500">
            {expired
              ? "Pide a tu psicóloga un enlace nuevo."
              : signed
                ? "Este documento ya fue firmado anteriormente."
                : "Verifica el enlace que recibiste."}
          </p>
        </div>
      </SignCanvas>
    );
  }

  if (!data) return null;
  const doc = data.document;

  if (stage === "done" && result) {
    return (
      <SignCanvas>
        <div className="max-w-md mx-auto text-center py-10">
          <div className="h-20 w-20 mx-auto rounded-full bg-sage-200/40 flex items-center justify-center mb-5">
            <CheckCircle2 className="h-10 w-10 text-sage-700" />
          </div>
          <h1 className="font-serif text-3xl text-ink-900">¡Firmado!</h1>
          <p className="text-base text-ink-500 mt-2">
            Has firmado el documento. Tu psicóloga ya recibió la notificación.
          </p>

          <div className="mt-6 rounded-xl border border-line-200 bg-surface p-5 text-left">
            <p className="text-[11px] uppercase tracking-widest text-brand-700 font-semibold inline-flex items-center gap-1.5 mb-2">
              <ShieldCheck className="h-3 w-3" /> Constancia de firma
            </p>
            <dl className="text-xs text-ink-700 space-y-1.5">
              <div className="flex justify-between gap-3">
                <dt className="text-ink-500">Documento:</dt>
                <dd className="font-medium text-right">{doc.name}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-500">Firmado:</dt>
                <dd className="text-right">{new Date(result.signed_at).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-500">Hash de certificado:</dt>
                <dd className="font-mono text-[10px] text-ink-700 break-all text-right">{result.cert_sha256.slice(0, 32)}…</dd>
              </div>
            </dl>
          </div>

          <p className="text-xs text-ink-500 mt-6 leading-relaxed">
            Esta constancia incluye tu IP, navegador y huella criptográfica del documento al momento de firmar.
            Conforma una auditoría legal de tu firma electrónica.
          </p>
        </div>
      </SignCanvas>
    );
  }

  return (
    <SignCanvas>
      <div className="max-w-3xl mx-auto">
        {/* Banner explicativo */}
        <div className="mb-6 rounded-2xl bg-linear-to-br from-brand-700 to-brand-600 p-6 text-white shadow-card">
          <div className="flex items-start gap-3">
            <FileText className="h-6 w-6 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-xs uppercase tracking-widest text-white/70 font-medium">Documento para firmar</p>
              <h1 className="font-serif text-2xl mt-1 leading-tight">{doc.name}</h1>
              <p className="text-sm text-white/85 mt-2">
                {doc.professional ? `Compartido por ${doc.professional}` : ""}
                {data.clinic.name ? ` · ${data.clinic.name}` : ""}
              </p>
            </div>
          </div>
        </div>

        {/* Documento renderizado en read-only */}
        <section className="mb-6">
          <p className="text-xs uppercase tracking-widest text-ink-500 font-medium mb-2">Lee el documento completo</p>
          <DocumentEditor initialDoc={doc.body_json ?? null} editable={false} />
        </section>

        {/* Aceptación */}
        {stage === "reading" && (
          <section className="rounded-xl border border-line-200 bg-surface p-5 mb-6">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-line-200 accent-brand-700"
              />
              <span className="text-sm text-ink-700 leading-relaxed">
                He leído el documento completo y entiendo su contenido. Comprendo que mi firma electrónica
                tiene validez legal según la Ley 527 de 1999 sobre comercio electrónico y firmas digitales.
              </span>
            </label>
            <button
              onClick={() => setStage("signing")}
              disabled={!agreed}
              className="mt-4 w-full h-11 rounded-lg bg-brand-700 text-white text-sm font-medium hover:bg-brand-800 disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              <Pen className="h-4 w-4" /> Continuar a firmar
            </button>
          </section>
        )}

        {/* Canvas de firma */}
        {stage === "signing" && (
          <section className="rounded-xl border border-line-200 bg-surface p-5 mb-6">
            <h2 className="font-serif text-lg text-ink-900 mb-2">Firma aquí</h2>
            <p className="text-xs text-ink-500 mb-4">Dibuja tu firma como en papel. Toca y arrastra el dedo (o el mouse).</p>

            <SignaturePad onChange={setSignatureDataUrl} />

            <div className="mt-4 rounded-md border border-line-100 bg-bg-100/50 p-3 space-y-2">
              <div className="flex items-start gap-2">
                <ShieldCheck className="h-4 w-4 text-sage-500 shrink-0 mt-0.5" />
                <p className="text-xs text-ink-500 leading-relaxed">
                  Al firmar, registramos: tu IP, navegador, fecha y hora exactas, y un hash criptográfico (SHA-256)
                  del documento. Esto da validez legal a tu firma.
                </p>
              </div>
              {!includeGeo ? (
                <button onClick={requestGeo} className="text-xs text-brand-700 hover:underline inline-flex items-center gap-1.5">
                  <MapPin className="h-3 w-3" /> Agregar ubicación opcional (mejor evidencia legal)
                </button>
              ) : (
                <p className="text-xs text-sage-700 inline-flex items-center gap-1.5">
                  <MapPin className="h-3 w-3" /> Ubicación capturada · {geo?.lat.toFixed(4)}, {geo?.lng.toFixed(4)}
                </p>
              )}
            </div>

            <button
              onClick={submit}
              disabled={!signatureDataUrl || submitMu.isPending}
              className="mt-4 w-full h-11 rounded-lg bg-brand-700 text-white text-sm font-medium hover:bg-brand-800 disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              {submitMu.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
              Firmar documento
            </button>
          </section>
        )}
      </div>
    </SignCanvas>
  );
}

// ─── Componente: pad de firma con canvas ────────────────────────────────────
function SignaturePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);
  const [hasStrokes, setHasStrokes] = useState(false);

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
          height={220}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          className="w-full cursor-crosshair touch-none"
          style={{ aspectRatio: "3 / 1.1" }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between text-xs">
        <button onClick={clear} className="text-ink-500 hover:text-rose-700 inline-flex items-center gap-1">
          <Eraser className="h-3 w-3" /> Borrar y volver a firmar
        </button>
        <span className={hasStrokes ? "text-sage-700" : "text-ink-400"}>
          {hasStrokes ? "Firma capturada ✓" : "Aún sin firmar"}
        </span>
      </div>
    </div>
  );
}

/** Lienzo cálido para la página pública de firma. Mismo estilo que /p/activar. */
function SignCanvas({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <header className="px-6 py-5 max-w-3xl mx-auto w-full flex items-center justify-between">
        <div className="inline-flex items-center gap-2.5 text-ink-900">
          <Logo className="h-7 w-7 text-brand-700" />
          <span className="font-serif text-lg">Psicomorfosis</span>
        </div>
        <span className="text-xs text-ink-500 inline-flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-sage-500" /> Firma legal
        </span>
      </header>
      <main className="flex-1 px-6 pb-12 pt-2">{children}</main>
      <footer className="px-6 py-6 text-center text-xs text-ink-400">
        © Psicomorfosis · Firma electrónica con validez según Ley 527/1999
      </footer>
    </div>
  );
}
