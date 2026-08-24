import { createRouter, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { submitErrorReport } from "@/lib/error-reporter";
import { routeTree } from "./routeTree.gen";

function DefaultErrorComponent({ error, reset, info }: { error: Error; reset: () => void; info?: { componentStack?: string } }) {
  const router = useRouter();

  // Antes este boundary se tragaba el error: en producción no se veía ni
  // se registraba, y "Something went wrong" no decía nada útil (caso de
  // Nathaly en iPhone, 24/8). Ahora se reporta solo al servidor (con el
  // stack y el árbol de componentes) y se muestra el mensaje en pantalla.
  useEffect(() => {
    try {
      console.error("[boundary]", error);
      submitErrorReport({
        kind: "auto",
        message: `[boundary] ${error?.name ?? "Error"}: ${error?.message ?? String(error)}`,
        stack: [error?.stack ?? "", info?.componentStack ? `
--- components ---${info.componentStack}` : ""].join("").slice(0, 8000),
      }).catch(() => { /* si el reporte falla, no hay nada más que hacer */ });
    } catch { /* noop */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error?.message]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-8 w-8 text-destructive"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Algo salió mal</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Ya nos llegó el aviso. Prueba de nuevo; si sigue igual, mándanos una captura de esta pantalla.
        </p>
        {error?.message && (
          <pre className="mt-4 max-h-40 overflow-auto rounded-md bg-muted p-3 text-left font-mono text-[11px] text-destructive whitespace-pre-wrap break-words">
            {error.name}: {error.message}
          </pre>
        )}
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Reintentar
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Ir al inicio
          </a>
        </div>
      </div>
    </div>
  );
}

export const getRouter = () => {
  // Tras cada deploy los chunks cambian de nombre. Un navegador con el
  // HTML o el chunk de entrada en caché pide chunks que ya no existen,
  // el servidor responde 404 (HTML) y el módulo falla con "disallowed
  // MIME type" — la app queda en blanco (visto en Firefox). Vite emite
  // `vite:preloadError` justo en ese caso: recargamos UNA vez para que
  // el navegador traiga el HTML nuevo con los nombres correctos.
  if (typeof window !== "undefined") {
    window.addEventListener("vite:preloadError", (event) => {
      const KEY = "psm.reload-after-preload-error";
      try {
        if (sessionStorage.getItem(KEY) === "1") return; // ya lo intentamos: no entrar en bucle
        sessionStorage.setItem(KEY, "1");
      } catch { /* noop */ }
      event.preventDefault();
      window.location.reload();
    });
    // Si la carga fue bien, liberamos la marca para el próximo deploy.
    window.addEventListener("load", () => { try { sessionStorage.removeItem("psm.reload-after-preload-error"); } catch { /* noop */ } });
  }

  const router = createRouter({
    routeTree,
    context: {},
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: DefaultErrorComponent,
  });

  return router;
};
