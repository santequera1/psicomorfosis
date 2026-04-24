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

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const { location } = useRouterState();

  const toggle = useCallback(() => setOpen((v) => !v), []);

  // Cerrar drawer al navegar (mobile)
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
