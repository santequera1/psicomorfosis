import { useEffect, useState } from "react";
import { LauraChat } from "./LauraChat";
import { cn } from "@/lib/utils";

/**
 * Botón flotante global de Laura. Vive encima del Fab "+" existente
 * (bottom-24 vs bottom-5). Al hacer click abre/cierra el drawer
 * <LauraChat>.
 *
 * Persiste el estado abierto/cerrado en sessionStorage para que
 * navegar entre rutas no cierre el chat (cada AppShell hace remount).
 */

const STORAGE_KEY = "laura.fab.open";
const AVATAR_INITIAL = "/laura/laura-profile-1.svg";
const AVATAR_ACTIVE = "/laura/laura-profile-2.svg";

export function LauraFab() {
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.sessionStorage.getItem(STORAGE_KEY) === "1";
  });
  const [hasSpoken, setHasSpoken] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.sessionStorage.getItem("laura.spoken") === "1";
  });

  // Re-leer "spoken" cuando el chat se cierre, por si el usuario habló
  // y queremos que el FAB también cambie de avatar.
  useEffect(() => {
    const onStorage = () => {
      setHasSpoken(window.sessionStorage.getItem("laura.spoken") === "1");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Sincronizar open con sessionStorage
  useEffect(() => {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, open ? "1" : "0");
    } catch { /* SSR / quota / private mode */ }
    if (!open) {
      // Refresh spoken al cerrar
      setHasSpoken(window.sessionStorage.getItem("laura.spoken") === "1");
    }
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Cerrar Laura" : "Abrir asistente Laura"}
        title="Laura — asistente clínica"
        className={cn(
          "fixed right-5 bottom-24 z-30 h-14 w-14 rounded-full shadow-soft-lg",
          "bg-surface border-2 border-brand-700",
          "hover:scale-105 active:scale-95 transition-transform",
          "flex items-center justify-center overflow-hidden",
          open && "ring-4 ring-brand-400/30",
        )}
      >
        <img
          src={hasSpoken ? AVATAR_ACTIVE : AVATAR_INITIAL}
          alt=""
          className="h-full w-full object-cover"
        />
        {/* Dot indicador "beta" */}
        <span
          aria-hidden
          className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-amber-400 border-2 border-surface"
          title="Beta"
        />
      </button>

      <LauraChat open={open} onClose={() => setOpen(false)} />
    </>
  );
}
