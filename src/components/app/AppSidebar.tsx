import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, Users, CalendarDays, ClipboardList, Brain,
  Folder, Receipt, BarChart3, Settings, ListTodo,
  ChevronsLeft, ChevronsRight, X, Shield, LogOut,
} from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Logo } from "./Logo";
import { api, getStoredUser, setSession, clearSession, type ApiUser, getToken } from "@/lib/api";
import { useSidebar } from "./SidebarContext";

const groups: Array<{
  label: string;
  items: Array<{ to: string; label: string; icon: React.ComponentType<{ className?: string }> }>;
}> = [
  {
    label: "Operación",
    items: [
      { to: "/", label: "Inicio", icon: LayoutDashboard },
      { to: "/agenda", label: "Agenda", icon: CalendarDays },
      { to: "/pacientes", label: "Pacientes", icon: Users },
      { to: "/tareas", label: "Tareas", icon: ListTodo },
    ],
  },
  {
    label: "Clínico",
    items: [
      { to: "/historia", label: "Historia clínica", icon: ClipboardList },
      { to: "/tests", label: "Tests psicométricos", icon: Brain },
      // Prescripción oculta del sidebar (módulo legacy de psiquiatría que el
      // equipo no usa por ahora). La ruta sigue activa en /prescripcion para
      // no romper enlaces, pero no se navega desde aquí.
      { to: "/documentos", label: "Documentos", icon: Folder },
    ],
  },
  {
    label: "Gestión",
    items: [
      { to: "/facturacion", label: "Recibos", icon: Receipt },
      { to: "/reportes", label: "Reportes", icon: BarChart3 },
      { to: "/configuracion", label: "Configuración", icon: Settings },
    ],
  },
];

export function AppSidebar() {
  const { open, setOpen, collapsed, setCollapsed } = useSidebar();
  const { location } = useRouterState();
  const path = location.pathname;
  const [user, setUser] = useState<ApiUser | null>(null);
  useEffect(() => {
    const stored = getStoredUser();
    setUser(stored);
    // Refrescamos contra /me al cargar para captar flags nuevos (ej:
    // isPlatformAdmin que se otorgó después del último login). Si /me
    // devuelve algo distinto, actualizamos localStorage. No mostramos
    // errores: si falla, seguimos con lo que hay en cache.
    const token = getToken();
    if (!token) return;
    api.me()
      .then((resp) => {
        const fresh = resp.user;
        if (JSON.stringify(fresh) !== JSON.stringify(stored)) {
          setSession(token, fresh);
          setUser(fresh);
        }
      })
      .catch(() => { /* silent */ });
  }, []);

  const initials = (user?.name ?? "?").split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase();

  // El grupo "Plataforma" solo se inserta si el user es admin de plataforma.
  // No tocar el array `groups` global para no afectar otros renders.
  const visibleGroups = user?.isPlatformAdmin
    ? [...groups, {
        label: "Plataforma",
        items: [{ to: "/platform", label: "Cuentas y uso", icon: Shield }],
      }]
    : groups;

  return (
    <>
      {/* Overlay solo en mobile cuando el drawer está abierto */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-ink-900/50 backdrop-blur-sm md:hidden"
          aria-hidden
        />
      )}

      <aside
        className={cn(
          // Mobile: fixed drawer con transform
          "fixed md:sticky top-0 z-50 h-screen bg-sidebar text-sidebar-foreground flex flex-col border-r border-sidebar-border",
          "transition-transform duration-250 ease-out md:transition-[width] md:transform-none",
          // Desktop: shrink-0 para que no se achique en flex
          "shrink-0",
          // Ancho mobile (drawer): 280px fijo
          "w-[280px]",
          // Ancho desktop: 268px o 72px según collapsed
          collapsed ? "md:w-[72px]" : "md:w-[268px]",
          // Mobile: visible con translate-x
          open ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
        aria-label="Navegación principal"
      >
        <div className={cn("flex items-center gap-3 px-4 h-16 border-b border-sidebar-border", collapsed && "md:justify-center md:px-0")}>
          <Logo className="h-7 w-7 shrink-0 text-brand-400" />
          {/* Texto del brand: visible siempre en mobile, depende de collapsed en desktop.
              Subtítulo viene del workspace activo del user (fallback al nombre del user
              o al texto de marca si aún no cargó). */}
          <div className={cn("flex flex-col leading-tight min-w-0", collapsed && "md:hidden")}>
            <span className="font-serif text-[17px] font-medium text-sidebar-accent-foreground">Psicomorfosis</span>
            <span className="text-[11px] text-sidebar-foreground/70 tracking-wide truncate">
              {user?.workspaceName ?? "Cargando…"}
            </span>
          </div>
          {/* Cerrar drawer en mobile */}
          <button
            onClick={() => setOpen(false)}
            className="ml-auto md:hidden h-9 w-9 rounded-md text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex items-center justify-center"
            aria-label="Cerrar menú"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-4">
          {visibleGroups.map((g) => (
            <div key={g.label} className="mb-5">
              <div className={cn(
                "px-5 mb-2 text-[11px] uppercase tracking-[0.12em] text-sidebar-foreground/55 font-medium",
                collapsed && "md:hidden"
              )}>
                {g.label}
              </div>
              <ul className="space-y-0.5 px-2">
                {g.items.map((it) => {
                  const active = it.to === "/" ? path === "/" : path.startsWith(it.to);
                  const Icon = it.icon;
                  return (
                    <li key={it.to}>
                      <Link
                        to={it.to}
                        onClick={() => setOpen(false)}
                        className={cn(
                          "relative flex items-center gap-3 rounded-md px-3 text-sm transition-all duration-200 ease-out",
                          // Touch target ≥44px en mobile, 40px en desktop
                          "min-h-[44px] md:min-h-[40px] py-2.5",
                          // Hover: bg-accent + leve translate del ícono para feedback claro.
                          "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:pl-4",
                          active
                            ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-[3px] before:rounded-r before:bg-brand-400"
                            : "text-sidebar-foreground/85",
                          collapsed && "md:justify-center md:px-0 md:hover:pl-0"
                        )}
                        title={collapsed ? it.label : undefined}
                      >
                        <Icon className="h-[18px] w-[18px] shrink-0 transition-transform duration-200" />
                        <span className={cn(collapsed && "md:hidden")}>{it.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-sidebar-border p-3 space-y-2">
          {user && (
            <div className={cn(
              "flex items-center gap-3 rounded-md px-2 py-2",
              collapsed && "md:hidden"
            )}>
              <div className="h-9 w-9 rounded-full bg-brand-400/30 text-sidebar-accent-foreground flex items-center justify-center text-xs font-semibold shrink-0">
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-sidebar-accent-foreground truncate">{user.name}</div>
                <div className="text-[11px] text-sidebar-foreground/65 truncate capitalize">{user.role.replace("_", " ")}</div>
              </div>
            </div>
          )}
          {/* Cerrar sesión */}
          <button
            onClick={() => {
              clearSession();
              window.location.replace("/login");
            }}
            className={cn(
              "w-full flex items-center gap-2 text-sidebar-foreground/85 hover:text-sidebar-accent-foreground hover:bg-sidebar-accent rounded-md px-3 py-2 text-xs transition-colors",
              collapsed && "md:justify-center md:px-0",
            )}
            title="Cerrar sesión"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <span className={cn(collapsed && "md:hidden")}>Cerrar sesión</span>
          </button>
          {/* Botón colapsar solo en desktop */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className={cn(
              "hidden md:flex w-full items-center gap-2 text-sidebar-foreground/70 hover:text-sidebar-accent-foreground hover:bg-sidebar-accent rounded-md px-3 py-2 text-xs transition-colors",
              collapsed && "justify-center"
            )}
          >
            {collapsed ? <ChevronsRight className="h-4 w-4" /> : <><ChevronsLeft className="h-4 w-4" /> Colapsar</>}
          </button>
        </div>
      </aside>
    </>
  );
}
