import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";

interface SidebarCtx {
  /** Estado del drawer mobile (siempre visible en desktop). */
  open: boolean;
  setOpen: (v: boolean) => void;
  toggle: () => void;
  /** Sidebar colapsado (solo iconos) en desktop. */
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
}

const Ctx = createContext<SidebarCtx>({
  open: false, setOpen: () => {}, toggle: () => {},
  collapsed: false, setCollapsed: () => {},
});

// ─── Persistencia del estado collapsed ─────────────────────────────────
//
// Cada ruta envuelve su propio <AppShell>, lo que monta un SidebarProvider
// nuevo en cada navegación. Sin persistencia, el estado React se resetearía
// (collapsed=false) y la sidebar se "abriría" sola al cambiar de vista.
// Guardamos en localStorage + cache de módulo para que sobreviva al
// remount sin lectura sincrona desde el provider.
//
// SSR-safe: SidebarProvider solo se renderiza después de hidratación
// (AppShell devuelve div vacío hasta confirmar token), así que el lazy
// initializer corre en cliente y no genera mismatch.

const KEY_COLLAPSED = "psm.sidebar.collapsed";
let cachedCollapsed: boolean | null = null;

function readInitialCollapsed(): boolean {
  if (cachedCollapsed !== null) return cachedCollapsed;
  if (typeof window === "undefined") return false;
  const v = window.localStorage.getItem(KEY_COLLAPSED) === "1";
  cachedCollapsed = v;
  return v;
}

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsedState] = useState<boolean>(() => readInitialCollapsed());
  const { location } = useRouterState();

  const toggle = useCallback(() => setOpen((v) => !v), []);

  const setCollapsed = useCallback((v: boolean) => {
    setCollapsedState(v);
    cachedCollapsed = v;
    if (typeof window !== "undefined") {
      window.localStorage.setItem(KEY_COLLAPSED, v ? "1" : "0");
    }
  }, []);

  // Cerrar drawer al navegar (mobile). Solo afecta `open`, no `collapsed`,
  // que ahora se persiste para que la preferencia desktop sobreviva.
  useEffect(() => { setOpen(false); }, [location.pathname]);

  // Cerrar con Escape
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open]);

  // Bloquear scroll del body cuando el drawer está abierto
  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = prev; };
    }
  }, [open]);

  return (
    <Ctx.Provider value={{ open, setOpen, toggle, collapsed, setCollapsed }}>
      {children}
    </Ctx.Provider>
  );
}

export function useSidebar() {
  return useContext(Ctx);
}
