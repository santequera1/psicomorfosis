import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CheckCircle2, Loader2, AlertCircle, FileText, Pen, ShieldCheck, ArrowLeft,
  MapPin, Lock, Save,
} from "lucide-react";
import { api } from "@/lib/api";
import { PortalShell } from "@/components/portal/PortalShell";
import { DocumentEditor } from "@/components/documents/DocumentEditor";
import { SignaturePad } from "@/components/documents/SignaturePad";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/p_/firmar/$docId")({
  head: () => ({ meta: [{ title: "Firmar documento · Mi portal" }] }),
  component: PortalSignPage,
});

/**
 * Página de firma de documento desde el portal del paciente. Equivalente a
 * `/firmar/$token` pero autenticada por sesión y con dos quality-of-life
 * extras:
 *   1. Si el paciente ya guardó su firma, ofrece reutilizarla.
 *   2. Al firmar, opcionalmente guarda la firma para próxima vez.
 *
 * El backend reutiliza el helper applyPatientSignature, así que la firma
 * que se aplica acá es legalmente equivalente a la del flujo por link.
 */
function PortalSignPage() {
  const { docId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [stage, setStage] = useState<"reading" | "signing" | "done">("reading");
  const [agreed, setAgreed] = useState(false);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [useSavedFirst, setUseSavedFirst] = useState(true); // si hay guardada, mostrarla precargada
  const [saveForLater, setSaveForLater] = useState(true);
  const [includeGeo, setIncludeGeo] = useState(false);
  const [geo, setGeo] = useState<{ lat: number; lng: number; accuracy?: number } | null>(null);
  const [result, setResult] = useState<{ signed_at: string; cert_sha256: string } | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["portal-doc-signing", docId],
    queryFn: () => api.portalGetDocumentForSigning(docId),
    retry: false,
  });

  const submitMu = useMutation({
    mutationFn: (body: { signature_data_url: string; geolocation?: { lat: number; lng: number; accuracy?: number }; save_signature?: boolean }) =>
      api.portalSignDocument(docId, body),
    onSuccess: (res) => {
      setResult({ signed_at: res.signed_at, cert_sha256: res.cert_sha256 });
      setStage("done");
      qc.invalidateQueries({ queryKey: ["portal-documents"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "No se pudo enviar la firma"),
  });

  // Si el paciente confirmó "no usar firma guardada", precargar pad vacío.
  useEffect(() => {
    if (!data) return;
    // Si NO quiere usar guardada, vaciamos el dataUrl actual para forzar
    // que firme de nuevo. Si SÍ quiere, el SignaturePad la precarga via
    // defaultDataUrl y emite el dataUrl actual al onChange.
    if (!useSavedFirst) setSignatureDataUrl(null);
  }, [useSavedFirst, data]);

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
      save_signature: saveForLater,
    });
  }

  if (isLoading) {
    return (
      <PortalShell>
        <div className="text-center py-20 text-ink-500">
          <Loader2 className="h-6 w-6 mx-auto mb-3 animate-spin" /> Verificando documento…
        </div>
      </PortalShell>
    );
  }

  if (error) {
    const msg = (error as any)?.message ?? "El documento no está disponible.";
    const signed = msg.toLowerCase().includes("firmado");
    return (
      <PortalShell>
        <div className="max-w-md mx-auto text-center py-12">
          <div className="h-14 w-14 mx-auto rounded-full bg-amber-50 flex items-center justify-center mb-4">
            <AlertCircle className="h-7 w-7 text-amber-700" />
          </div>
          <h1 className="font-serif text-2xl text-ink-900 mb-2">
            {signed ? "Documento ya firmado" : "Sin solicitud de firma"}
          </h1>
          <p className="text-sm text-ink-500">
            {signed
              ? "Este documento ya fue firmado anteriormente."
              : "No hay una solicitud de firma abierta para este documento. Pídele a tu psicóloga que reenvíe el documento."}
          </p>
          <Link to="/p/documentos" className="mt-6 inline-flex items-center gap-1.5 text-sm text-brand-700 hover:underline">
            <ArrowLeft className="h-4 w-4" /> Volver a mis documentos
          </Link>
        </div>
      </PortalShell>
    );
  }

  if (!data) return null;
  const doc = data.document;
  const hasSavedSig = !!data.saved_signature_url;

  if (stage === "done" && result) {
    return (
      <PortalShell>
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

          <Link to="/p/documentos" className="mt-6 inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-brand-700 text-white text-sm font-medium hover:bg-brand-800">
            Volver a mis documentos
          </Link>
        </div>
      </PortalShell>
    );
  }

  return (
    <PortalShell>
      <div className="max-w-3xl mx-auto">
        <Link to="/p/documentos" className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-brand-700 mb-4">
          <ArrowLeft className="h-4 w-4" /> Volver a mis documentos
        </Link>

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

        <section className="mb-6">
          <p className="text-xs uppercase tracking-widest text-ink-500 font-medium mb-2">Lee el documento completo</p>
          <DocumentEditor initialDoc={doc.body_json ?? null} editable={false} />
        </section>

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

        {stage === "signing" && (
          <section className="rounded-xl border border-line-200 bg-surface p-5 mb-6">
            <h2 className="font-serif text-lg text-ink-900 mb-2">Firma aquí</h2>
            <p className="text-xs text-ink-500 mb-4">
              {hasSavedSig && useSavedFirst
                ? "Esta es tu firma guardada. Si quieres dibujarla de nuevo, toca en \"Borrar y volver a firmar\"."
                : "Dibuja tu firma como en papel. Toca y arrastra el dedo (o el mouse)."}
            </p>

            {hasSavedSig && (
              <div className="mb-4 flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setUseSavedFirst(true)}
                  className={cn(
                    "h-8 px-3 rounded-full font-medium border transition-colors",
                    useSavedFirst ? "bg-brand-50 border-brand-700 text-brand-800" : "border-line-200 text-ink-700 hover:border-brand-400"
                  )}
                >
                  Usar firma guardada
                </button>
                <button
                  type="button"
                  onClick={() => setUseSavedFirst(false)}
                  className={cn(
                    "h-8 px-3 rounded-full font-medium border transition-colors",
                    !useSavedFirst ? "bg-brand-50 border-brand-700 text-brand-800" : "border-line-200 text-ink-700 hover:border-brand-400"
                  )}
                >
                  Dibujar nueva
                </button>
              </div>
            )}

            <SignaturePad
              key={useSavedFirst ? "saved" : "new"}
              onChange={setSignatureDataUrl}
              defaultDataUrl={useSavedFirst && hasSavedSig ? data.saved_signature_url : null}
            />

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

            <label className="mt-3 flex items-start gap-2 cursor-pointer text-xs text-ink-700">
              <input
                type="checkbox"
                checked={saveForLater}
                onChange={(e) => setSaveForLater(e.target.checked)}
                className="mt-0.5 h-3.5 w-3.5 rounded border-line-200 accent-brand-700"
              />
              <span className="inline-flex items-center gap-1.5">
                <Save className="h-3 w-3 text-ink-500" />
                Guardar esta firma para próximos documentos. Puedes borrarla cuando quieras desde tu perfil.
              </span>
            </label>

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
    </PortalShell>
  );
}
