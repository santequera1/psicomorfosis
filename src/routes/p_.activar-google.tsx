import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Heart, AlertCircle } from "lucide-react";
import { api, setSession } from "@/lib/api";
import { PortalCanvas } from "./p_.activar.$token";

/**
 * Activación del portal para un paciente que entró con Google y aún no
 * tenía cuenta. Google ya confirmó su correo; aquí solo falta el
 * consentimiento informado (Ley 1581/2012) — el mismo check que la
 * activación por invitación — y se crea la cuenta sin contraseña.
 *
 * La "prueba" llega en el fragmento (#p=…): no viaja al servidor en la
 * URL ni queda en logs. Vive 15 minutos.
 */
export const Route = createFileRoute("/p_/activar-google")({
  head: () => ({ meta: [{ title: "Activa tu portal — Psicomorfosis" }] }),
  component: ActivateWithGooglePage,
});

// Mantener sincronizado con ULTIMA_ACTUALIZACION en /privacidad y con
// la activación por invitación (p_.activar.$token.tsx).
const LEGAL_VERSION = "2026-05-06";

function ActivateWithGooglePage() {
  const navigate = useNavigate();
  const [proof, setProof] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [acceptedLegal, setAcceptedLegal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const p = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("p");
    if (!p) { setMissing(true); return; }
    setProof(p);
    // Fuera del historial: si vuelve atrás no debe reaparecer la prueba.
    window.history.replaceState({}, "", "/p/activar-google");
  }, []);

  const { data, isLoading, error } = useQuery({
    queryKey: ["portal-google-pending", proof],
    queryFn: () => api.portalGooglePending(proof as string),
    enabled: !!proof,
    retry: false,
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!proof || !acceptedLegal) return;
    setSubmitting(true);
    try {
      const res = await api.portalGoogleActivate(proof, { acceptedLegal, legalVersion: LEGAL_VERSION });
      setSession(res.token, res.user as any);
      toast.success(`¡Bienvenido/a, ${res.user.name.split(" ")[0]}!`);
      navigate({ to: "/p/inicio" });
    } catch (err: any) {
      toast.error(err?.message ?? "No pudimos activar tu cuenta.");
      setSubmitting(false);
    }
  }

  const firstName = data?.patient?.preferred_name || data?.patient?.name?.split(" ")[0] || "";

  return (
    <PortalCanvas>
      <div className="max-w-sm mx-auto">
        <div className="text-center mb-8">
          <div className="h-14 w-14 mx-auto rounded-full bg-brand-50 flex items-center justify-center mb-4 border-2 border-brand-100">
            <Heart className="h-6 w-6 text-brand-700" />
          </div>
          <h1 className="font-serif text-2xl text-ink-900">
            {firstName ? `Hola, ${firstName}` : "Activa tu portal"}
          </h1>
          <p className="text-sm text-ink-500 mt-1.5">Un último paso para entrar a tu espacio.</p>
        </div>

        {missing || error ? (
          <div className="bg-surface rounded-2xl border border-line-200 shadow-soft p-6 text-center space-y-4">
            <div className="h-10 w-10 mx-auto rounded-full bg-error-soft text-error flex items-center justify-center">
              <AlertCircle className="h-5 w-5" />
            </div>
            <p className="text-sm text-ink-700">
              {(error as any)?.message ?? "El ingreso con Google expiró o el enlace no es válido."}
            </p>
            <Link to="/p/login" className="inline-flex h-11 px-6 rounded-full bg-brand-700 text-white text-sm font-medium items-center hover:bg-brand-800">
              Volver a intentarlo
            </Link>
          </div>
        ) : isLoading || !data ? (
          <div className="flex items-center justify-center gap-2 text-sm text-ink-500 py-10">
            <Loader2 className="h-4 w-4 animate-spin" /> Comprobando tu ficha…
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4 bg-surface rounded-2xl border border-line-200 shadow-soft p-6">
            <div className="rounded-xl bg-bg-50 border border-line-100 p-4 text-sm text-ink-700 leading-relaxed">
              Entrarás con la cuenta de Google <span className="font-medium text-ink-900">{data.email}</span>
              {data.professional?.name && (
                <> al espacio de <span className="font-medium text-ink-900">{data.professional.name}</span>
                  {data.clinic?.name ? ` (${data.clinic.name})` : ""}</>
              )}
              . No necesitas contraseña: cada vez entras con «Continuar con Google».
            </div>

            {/* Consentimiento informado para tratamiento de datos sensibles
                (Ley 1581/2012 + Decreto 1377/2013). Idéntico al de la
                activación por invitación; sin el check no se crea la cuenta. */}
            <label className="flex items-start gap-2.5 text-xs text-ink-700 leading-relaxed cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={acceptedLegal}
                onChange={(e) => setAcceptedLegal(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-line-300 text-brand-700 focus:ring-brand-400 shrink-0"
              />
              <span>
                He leído y acepto el{" "}
                <Link to="/privacidad" target="_blank" className="text-brand-700 underline">
                  aviso de privacidad
                </Link>{" "}
                y los{" "}
                <Link to="/terminos" target="_blank" className="text-brand-700 underline">
                  términos y condiciones
                </Link>
                . Autorizo el tratamiento de mis datos personales y datos
                sensibles (historia clínica, tests, firma) por parte de
                Psicomorfosis y mi profesional tratante para los fines
                descritos en el aviso.
              </span>
            </label>

            <button
              type="submit"
              disabled={!acceptedLegal || submitting}
              className="w-full h-11 rounded-lg bg-brand-700 text-white text-sm font-medium hover:bg-brand-800 disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Activar mi portal
            </button>
            <p className="text-[11px] text-ink-400 text-center">
              ¿No eres tú?{" "}
              <Link to="/p/login" className="text-brand-700 underline">Volver</Link>
            </p>
          </form>
        )}
      </div>
    </PortalCanvas>
  );
}
