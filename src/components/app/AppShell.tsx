import { useEffect, useState } from "react";
import { AppSidebar } from "./AppSidebar";
import { Topbar } from "./Topbar";
import { SidebarProvider } from "./SidebarContext";
import { getToken } from "@/lib/api";

/**
 * Guard de autenticación que envuelve a cada ruta protegida.
 *
 * Dos optimizaciones clave de UX:
 * 1. El estado `checked` se inicializa de forma sincrónica leyendo localStorage.
 *    En cliente, si hay token, la app se renderiza directamente sin mostrar
 *    la pantalla "Verificando sesión…".
 * 2. Si no hay token, hacemos `window.location.replace("/login")` en vez de
 *    navigate() de TanStack Router. El hard redirect evita loops entre rutas
 *    causados por la hidratación de SSR, y no deja entrada en el history
 *    (el usuario no puede "back" y caer otra vez en el estado sin sesión).
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const [checked, setChecked] = useState<boolean>(() => {
    if (typeof window === "undefined") return false; // SSR
    return getToken() !== null;
  });

  useEffect(() => {
    if (!getToken()) {
      window.location.replace("/login");
      return;
    }
    setChecked(true);
  }, []);

  if (!checked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-50">
        <div className="text-sm text-ink-500">Verificando sesión…</div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex w-full min-h-screen bg-bg-50 text-ink-900">
        <AppSidebar />
        <div className="flex-1 min-w-0 flex flex-col">
          <Topbar />
          <main className="flex-1 px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
