import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

import appCss from "../styles.css?url";

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
      { name: "color-scheme", content: "light dark" },
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
 *  1) Aplica .dark al <html> según preferencia guardada (claro/oscuro/auto)
 *     ANTES del primer paint, eliminando el flash de tema claro al entrar
 *     en una página oscura.
 *  2) Redirige a /login si no hay token y la ruta actual no es pública.
 *     Elimina el flash de "Verificando sesión…" entre SSR e hidratación.
 */
const BOOTSTRAP_SCRIPT = `
(function(){
  try {
    var pref = localStorage.getItem('psm.theme') || 'claro';
    var dark = pref === 'oscuro' ||
      (pref === 'auto' && window.matchMedia &&
        window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
  } catch(e) {}
  try {
    var token = localStorage.getItem('psm.token');
    var user = JSON.parse(localStorage.getItem('psm.user') || 'null');
    var path = location.pathname;
    // Las rutas /p/* son del portal del paciente — viven con sus propias reglas.
    // Las páginas públicas (/login y /p/activar/* y /p/login) no requieren token.
    var isPatientPortal = path === '/p' || path.indexOf('/p/') === 0;
    var publicPaths = ['/login', '/p/login'];
    var isPublic = publicPaths.indexOf(path) !== -1
      || path.indexOf('/p/activar/') === 0
      || path.indexOf('/firmar/') === 0;
    if (isPatientPortal) {
      // Portal del paciente: si requiere auth y no hay token o el token no es de paciente → /p/login
      var needsAuth = !isPublic;
      var isPatient = user && user.role === 'paciente';
      if (needsAuth && (!token || !isPatient)) location.replace('/p/login');
      else if (token && isPatient && path === '/p/login') location.replace('/p/inicio');
    } else {
      // Staff: token de paciente entra al portal, no al staff
      if (token && user && user.role === 'paciente' && !isPublic) {
        location.replace('/p/inicio');
      } else if (!token && !isPublic) {
        location.replace('/login');
      } else if (token && user && user.role !== 'paciente' && path === '/login') {
        location.replace('/');
      }
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
        <script dangerouslySetInnerHTML={{ __html: BOOTSTRAP_SCRIPT }} />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
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
