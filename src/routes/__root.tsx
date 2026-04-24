import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import appCss from "../styles.css?url";

/** Aplica el tema guardado antes del primer render para evitar flash de tema claro. */
function useAppliedTheme() {
  useEffect(() => {
    const pref = (window.localStorage.getItem("psm.theme") as "claro" | "oscuro" | "auto" | null) ?? "claro";
    const shouldDark =
      pref === "oscuro" ||
      (pref === "auto" && window.matchMedia?.("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", shouldDark);
  }, []);
}

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Psicomorfosis" },
      { name: "description", content: "App para gestión de pacientes" },
      { name: "author", content: "Lovable" },
      { property: "og:title", content: "Psicomorfosis" },
      { property: "og:description", content: "App para gestión de pacientes" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@Lovable" },
      { name: "twitter:title", content: "Psicomorfosis" },
      { name: "twitter:description", content: "App para gestión de pacientes" },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/oCUtea0FP6ZFARffyd2m1qWiCKF2/social-images/social-1776401942633-nathy-psicomorfos.webp" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/oCUtea0FP6ZFARffyd2m1qWiCKF2/social-images/social-1776401942633-nathy-psicomorfos.webp" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

/**
 * Script de pre-hidratación que corre ANTES de que React se ejecute.
 * Redirige a /login si no hay token y la ruta actual no es pública.
 * Esto elimina el flash de "Verificando sesión…" entre el SSR y la
 * hidratación del cliente: si no hay sesión, el browser cancela el parse
 * del HTML y navega a /login antes de renderizar la página protegida.
 */
const AUTH_BOOTSTRAP_SCRIPT = `
(function(){
  try {
    var token = localStorage.getItem('psm.token');
    var path = location.pathname;
    // Rutas que NO requieren autenticación
    var publicPaths = ['/login'];
    var isPublic = publicPaths.indexOf(path) !== -1;
    if (!token && !isPublic) {
      location.replace('/login');
    } else if (token && path === '/login') {
      // Ya autenticado entrando a /login → saltar al home
      location.replace('/');
    }
  } catch(e) {}
})();
`;

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <HeadContent />
        {/* Debe ir antes que <Scripts /> para correr primero */}
        <script dangerouslySetInnerHTML={{ __html: AUTH_BOOTSTRAP_SCRIPT }} />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  useAppliedTheme();
  const [client] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5_000,
        retry: 1,
        refetchOnWindowFocus: true,
        refetchOnMount: true,
      },
    },
  }));
  return (
    <QueryClientProvider client={client}>
      <Outlet />
    </QueryClientProvider>
  );
}
