import { useEffect, useState } from "react";
import { AppSidebar } from "./AppSidebar";
import { Topbar } from "./Topbar";
import { SidebarProvider } from "./SidebarContext";
import { Fab } from "./Fab";
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
// Cache a nivel de módulo: una vez que un AppShell ha confirmado la sesión en
// el primer render del cliente, los siguientes remounts (cambio de ruta —
// cada page envuelve su propio AppShell) parten ya en `true` y evitan el
// flash de pantalla en blanco entre navegaciones.
let SESSION_CONFIRMED = false;

export function AppShell({ children }: { children: React.ReactNode }) {
  // El estado inicial DEBE ser el mismo en SSR y en el primer render del cliente
  // para evitar React #418 (hydration mismatch). En SSR `SESSION_CONFIRMED`
  // siempre es false (módulo recién cargado), igual que en el cliente la
  // primera vez. A partir de ahí queda en true y los remounts no pestañean.
  const [checked, setChecked] = useState<boolean>(SESSION_CONFIRMED);

  useEffect(() => {
    if (!getToken()) {
      window.location.replace("/login");
      return;
    }
    SESSION_CONFIRMED = true;
    setChecked(true);
  }, []);

  if (!checked) {
    // Pantalla vacía durante la transición SSR → hidratación.
    // El script de __root.tsx ya redirigió si no había token, así que esto
    // solo lo ven usuarios válidos durante unos milisegundos.
    return <div className="min-h-screen bg-bg-50" aria-hidden />;
  }

  return (
    <SidebarProvider>
      <div className="flex w-full min-h-screen bg-bg-50 text-ink-900">
        <AppSidebar />
        <div className="flex-1 min-w-0 flex flex-col">
          <Topbar />
          {/* pb-24 reserva espacio para que el FAB (bottom-5 right-5, h-14)
              no tape los últimos elementos de la página al scrollear hasta abajo. */}
          <main className="flex-1 px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 pb-24">
            {children}
          </main>
        </div>
        <Fab />
      </div>
    </SidebarProvider>
  );
}
