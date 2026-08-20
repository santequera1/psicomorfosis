import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { setSession } from "@/lib/api";

/**
 * Aterrizaje del login con Google.
 *
 * El backend redirige aquí con la sesión en el FRAGMENTO de la URL
 * (`#s=<base64url>`). Usamos el fragmento y no la query porque el
 * fragmento nunca viaja al servidor: no queda en logs de nginx ni en
 * la cabecera Referer si la página cargara algo externo.
 *
 * Aquí solo decodificamos, guardamos la sesión y entramos.
 */
export const Route = createFileRoute("/auth_/google")({
  head: () => ({ meta: [{ title: "Entrando… · Psicomorfosis" }] }),
  component: GoogleLanding,
});

function GoogleLanding() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const hash = window.location.hash.replace(/^#/, "");
      const raw = new URLSearchParams(hash).get("s");
      if (!raw) {
        setError("No recibimos la sesión de Google.");
        return;
      }
      const json = decodeURIComponent(
        atob(raw.replace(/-/g, "+").replace(/_/g, "/"))
          .split("")
          .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
          .join(""),
      );
      const { token, user } = JSON.parse(json);
      if (!token || !user) throw new Error("payload incompleto");
      setSession(token, user);
      // Limpiamos el fragmento antes de navegar para que el token no
      // quede en el historial del navegador.
      window.location.replace("/");
    } catch {
      setError("No pudimos completar el ingreso con Google.");
    }
  }, []);

  if (error) {
    return (
      <div className="min-h-[100svh] bg-bg-50 flex flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="h-12 w-12 rounded-full bg-error-soft text-error flex items-center justify-center">
          <AlertCircle className="h-6 w-6" />
        </div>
        <p className="text-sm text-ink-700 max-w-xs">{error}</p>
        <a
          href="/login"
          className="h-11 px-6 rounded-full bg-brand-700 text-white text-sm font-medium inline-flex items-center hover:bg-brand-800"
        >
          Volver a ingresar
        </a>
      </div>
    );
  }

  return (
    <div className="min-h-[100svh] bg-bg-50 flex flex-col items-center justify-center gap-3">
      <Loader2 className="h-6 w-6 animate-spin text-brand-700" />
      <p className="text-sm text-ink-500">Entrando a tu consulta…</p>
    </div>
  );
}
