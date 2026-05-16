import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, Users, CalendarDays, ClipboardList, Brain,
  Folder, Receipt, BarChart3, Settings, ListTodo,
  PanelLeftClose, PanelLeftOpen, X, Shield, LogOut, Bug,
  Scale, FileText, ClipboardCheck,
} from "lucide-react";
import { useEffect, useState } from "react";
import { cn, roleLabel } from "@/lib/utils";
import { Logo } from "./Logo";
import { api, getStoredUser, setSession, logoutEverywhere, type ApiUser, getToken } from "@/lib/api";
import { useSidebar } from "./SidebarContext";
import { ReportProblemModal } from "./ReportProblemModal";

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

export function AppSidebar({ animateEntrance = false }: { animateEntrance?: boolean }) {
  const { open, setOpen, collapsed, setCollapsed } = useSidebar();
  const { location } = useRouterState();
  const path = location.pathname;
  // Lazy initializer: leemos getStoredUser sincrónico en el primer
  // render del cliente para no ver el flash "Cargando…" → nombre.
  // En SSR window no existe y getStoredUser cae a null, igual que antes.
  const [user, setUser] = useState<ApiUser | null>(() =>
    typeof window === "undefined" ? null : getStoredUser(),
  );
  const [reportOpen, setReportOpen] = useState(false);
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


  // Sidebar exclusivo para platform admin. Su trabajo es administrar
  // cuentas y monitorear uso, NO atender pacientes — entonces ocultamos
  // las vistas clínicas (Inicio dashboard, Agenda, Pacientes, Historia
  // clínica, Tests psicométricos, Documentos, Reportes clínicos) y solo
  // mostramos lo que necesita: cuentas, reportes de bugs, tareas
  // administrativas, recibos del SaaS y configuración.
  const platformAdminGroups: typeof groups = [
    {
      label: "Plataforma",
      items: [
        { to: "/platform", label: "Cuentas y uso", icon: Shield },
        { to: "/platform/reportes", label: "Reportes", icon: Bug },
      ],
    },
    {
      label: "Operación",
      items: [
        { to: "/tareas", label: "Tareas", icon: ListTodo },
      ],
    },
    {
      label: "Gestión",
      items: [
        { to: "/facturacion", label: "Recibos", icon: Receipt },
        { to: "/configuracion", label: "Configuración", icon: Settings },
      ],
    },
  ];

  // Sidebar exclusivo del asesor legal: solo documentos legales,
  // aceptaciones (audit log) y configuración personal. Sin nada
  // clínico — su rol es transversal y no maneja pacientes.
  const legalAdminGroups: typeof groups = [
    {
      label: "Asesoría legal",
      items: [
        { to: "/legal-admin", label: "Documentos", icon: FileText },
        { to: "/legal-admin/aceptaciones", label: "Aceptaciones", icon: ClipboardCheck },
      ],
    },
    {
      label: "Cuenta",
      items: [
        { to: "/configuracion", label: "Configuración", icon: Settings },
      ],
    },
  ];

  const visibleGroups = user?.isLegalAdmin
    ? legalAdminGroups
    : user?.isPlatformAdmin
      ? platformAdminGroups
      : groups;

  // Pre-calculamos el offset acumulado de items por grupo, para que el
  // stagger sea consecutivo a través de los grupos (no se reinicia en
  // cada uno). Operación 4 → offset 0..3, Clínico 2 → offset 4..5, etc.
  const groupOffsets = visibleGroups.reduce<number[]>((acc, _g, i) => {
    acc.push(i === 0 ? 0 : acc[i - 1] + visibleGroups[i - 1].items.length);
    return acc;
  }, []);
  // Total de items navegables, usado para calcular el delay del footer
  // (user pill, reportar, cerrar sesión, colapsar) que arranca después
  // del último item de navegación.
  const totalNavItems = visibleGroups.reduce((sum, g) => sum + g.items.length, 0);
  // Última delay de un item de nav: 120 + (n-1)*45. Footer arranca ~80ms
  // después para que se sienta como una segunda "ola" tras el menú.
  const footerStart = 120 + Math.max(0, totalNavItems - 1) * 45 + 80;

  // Eventos custom para que código fuera de React (ej: el tour de
  // TourGuideJS) pueda abrir/cerrar el drawer en mobile sin acoplarse
  // al SidebarContext. Lo dispara lib/tour.ts en los pasos del tour
  // que apuntan al sidebar — así en mobile el drawer aparece cuando
  // hace falta y se cierra después.
  useEffect(() => {
    function onOpen() { setOpen(true); }
    function onClose() { setOpen(false); }
    // psm:open-report lo dispara el menú de usuario del topbar
    // ("Reportar problema") para abrir el ReportProblemModal sin
    // duplicar el componente en cada lugar que lo necesite.
    function onReport() { setReportOpen(true); }
    window.addEventListener("psm:sidebar:open", onOpen);
    window.addEventListener("psm:sidebar:close", onClose);
    window.addEventListener("psm:open-report", onReport);
    return () => {
      window.removeEventListener("psm:sidebar:open", onOpen);
      window.removeEventListener("psm:sidebar:close", onClose);
      window.removeEventListener("psm:open-report", onReport);
    };
  }, [setOpen]);

  return (
    <>
      {/* Overlay solo en mobile cuando el drawer está abierto */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-ink-900/50 backdrop-blur-sm sm:hidden"
          aria-hidden
        />
      )}

      <aside
        className={cn(
          // Mobile: fixed drawer con transform
          "fixed sm:sticky top-0 z-50 bg-sidebar text-sidebar-foreground flex flex-col border-r border-sidebar-border",
          // Altura: en mobile usamos h-dvh (dynamic viewport height) que
          // sí descuenta las barras de address/tabs del browser. h-screen
          // (100vh) las incluye, así el footer (avatar + reportar +
          // cerrar sesión) quedaba fuera del viewport en algunos
          // celulares y no se podía hacer scroll para verlo.
          "h-dvh sm:h-screen",
          "transition-transform duration-250 ease-out sm:transition-[width] sm:transform-none",
          // Desktop: shrink-0 para que no se achique en flex
          "shrink-0",
          // Ancho mobile (drawer): 280px fijo
          "w-[280px]",
          // Ancho desktop: 268px o 72px según collapsed
          collapsed ? "sm:w-18" : "sm:w-67",
          // Mobile: visible con translate-x
          open ? "translate-x-0" : "-translate-x-full sm:translate-x-0",
        )}
        aria-label="Navegación principal"
      >
        <div className={cn(
          "flex items-center gap-3 px-4 h-16 border-b border-sidebar-border",
          collapsed && "sm:justify-center sm:px-0",
          // Header del sidebar entra primero en la secuencia (delay 0).
          animateEntrance && "animate-in slide-in-from-left-3 fade-in duration-400 fill-mode-backwards",
        )}>
          <Logo className="h-7 w-7 shrink-0 text-brand-400" />
          {/* Texto del brand: visible siempre en mobile, depende de collapsed en desktop.
              Subtítulo viene del workspace activo del user. Como inicializamos
              user con getStoredUser() lazy, ya tenemos workspaceName en el
              primer paint — no hay flash "Cargando…" → nombre. */}
          <div className={cn("flex flex-col leading-tight min-w-0", collapsed && "sm:hidden")}>
            <span className="font-serif text-[17px] font-medium text-sidebar-accent-foreground">Psicomorfosis</span>
            <span className="text-[11px] text-sidebar-foreground/70 tracking-wide truncate">
              {user?.workspaceName ?? ""}
            </span>
          </div>
          {/* Cerrar drawer en mobile */}
          <button
            onClick={() => setOpen(false)}
            className="ml-auto sm:hidden h-9 w-9 rounded-md text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex items-center justify-center"
            aria-label="Cerrar menú"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-4" data-tour="sidebar-nav">
          {visibleGroups.map((g, gIdx) => {
            // El primer item del grupo arranca 60ms después del label.
            // Item i dentro del grupo: groupOffset+i, separado 45ms.
            const labelDelay = animateEntrance ? `${60 + groupOffsets[gIdx] * 45}ms` : undefined;
            return (
              <div key={g.label} className="mb-5">
                <div
                  className={cn(
                    "px-5 mb-2 text-[11px] uppercase tracking-[0.12em] text-sidebar-foreground/55 font-medium",
                    collapsed && "sm:hidden",
                    animateEntrance && "animate-in slide-in-from-left-3 fade-in duration-400 fill-mode-backwards",
                  )}
                  style={labelDelay ? { animationDelay: labelDelay } : undefined}
                >
                  {g.label}
                </div>
                <ul className="space-y-0.5 px-2">
                  {g.items.map((it, iIdx) => {
                    const active = it.to === "/" ? path === "/" : path.startsWith(it.to);
                    const Icon = it.icon;
                    // data-tour para que los tours puedan apuntar a links
                    // específicos del sidebar. Convertimos "/agenda" → "agenda".
                    const tourKey = it.to === "/" ? "inicio" : it.to.replace(/^\//, "").replace(/\//g, "-");
                    const flatIdx = groupOffsets[gIdx] + iIdx;
                    const itemDelay = animateEntrance ? `${120 + flatIdx * 45}ms` : undefined;
                    return (
                      <li
                        key={it.to}
                        className={cn(
                          animateEntrance && "animate-in slide-in-from-left-4 fade-in duration-400 fill-mode-backwards",
                        )}
                        style={itemDelay ? { animationDelay: itemDelay } : undefined}
                      >
                        <Link
                          to={it.to}
                          data-tour={`sidebar-link-${tourKey}`}
                          onClick={() => setOpen(false)}
                          className={cn(
                            "relative flex items-center gap-3 rounded-md px-3 text-sm transition-all duration-200 ease-out",
                            // Touch target ≥44px en mobile, 40px en desktop
                            "min-h-11 sm:min-h-10 py-2.5",
                            // Hover: bg-accent + leve translate del ícono para feedback claro.
                            "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:pl-4",
                            // Barra vertical activa (::before). Siempre presente
                            // en el DOM para poder transicionar — antes solo se
                            // creaba al activar y aparecía con un "pop" abrupto.
                            // Crece desde la izquierda y hace fade en 250ms.
                            "before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-[3px] before:rounded-r before:bg-brand-400",
                            "before:origin-left before:transition-all before:duration-250 before:ease-out",
                            active
                              ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium before:opacity-100 before:scale-x-100"
                              : "text-sidebar-foreground/85 before:opacity-0 before:scale-x-0",
                            collapsed && "sm:justify-center sm:px-0 sm:hover:pl-0"
                          )}
                          title={collapsed ? it.label : undefined}
                        >
                          <Icon className="h-[18px] w-[18px] shrink-0 transition-transform duration-200" />
                          <span className={cn(collapsed && "sm:hidden")}>{it.label}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border p-3 space-y-2">
          {/* Footer del sidebar: 4 piezas (user pill, reportar, cerrar
              sesión, colapsar) que continúan el stagger del menú —
              arrancan ~80ms después del último item de navegación y
              cada una se separa 50ms. */}
          {user && (
            <div
              className={cn(
                "flex items-center gap-3 rounded-md px-2 py-2",
                collapsed && "sm:hidden",
                animateEntrance && "animate-in slide-in-from-left-4 fade-in duration-400 fill-mode-backwards",
              )}
              style={animateEntrance ? { animationDelay: `${footerStart}ms` } : undefined}
            >
              <div className="h-9 w-9 rounded-full bg-brand-400/30 text-sidebar-accent-foreground flex items-center justify-center text-xs font-semibold shrink-0">
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-sidebar-accent-foreground truncate">{user.name}</div>
                <div className="text-[11px] text-sidebar-foreground/65 truncate">{roleLabel(user)}</div>
              </div>
            </div>
          )}
          {/* Reportar problema — visible para todos los usuarios staff;
              ayuda a recolectar feedback durante la beta privada. */}
          <button
            onClick={() => setReportOpen(true)}
            data-tour="report-problem"
            className={cn(
              "w-full flex items-center gap-2 text-sidebar-foreground/75 hover:text-sidebar-accent-foreground hover:bg-sidebar-accent rounded-md px-3 py-2 text-xs transition-colors",
              collapsed && "sm:justify-center sm:px-0",
              animateEntrance && "animate-in slide-in-from-left-4 fade-in duration-400 fill-mode-backwards",
            )}
            style={animateEntrance ? { animationDelay: `${footerStart + 50}ms` } : undefined}
            title="Reportar problema"
          >
            <Bug className="h-4 w-4 shrink-0" />
            <span className={cn(collapsed && "sm:hidden")}>Reportar problema</span>
          </button>
          {/* Cerrar sesión */}
          <button
            onClick={() => {
              void logoutEverywhere();
              window.location.replace("/login");
            }}
            className={cn(
              "w-full flex items-center gap-2 text-sidebar-foreground/85 hover:text-sidebar-accent-foreground hover:bg-sidebar-accent rounded-md px-3 py-2 text-xs transition-colors",
              collapsed && "sm:justify-center sm:px-0",
              animateEntrance && "animate-in slide-in-from-left-4 fade-in duration-400 fill-mode-backwards",
            )}
            style={animateEntrance ? { animationDelay: `${footerStart + 100}ms` } : undefined}
            title="Cerrar sesión"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <span className={cn(collapsed && "sm:hidden")}>Cerrar sesión</span>
          </button>
          {/* Botón colapsar solo en desktop */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className={cn(
              "hidden sm:flex w-full items-center gap-2 text-sidebar-foreground/70 hover:text-sidebar-accent-foreground hover:bg-sidebar-accent rounded-md px-3 py-2 text-xs transition-colors",
              collapsed && "justify-center",
              animateEntrance && "animate-in slide-in-from-left-4 fade-in duration-400 fill-mode-backwards",
            )}
            style={animateEntrance ? { animationDelay: `${footerStart + 150}ms` } : undefined}
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <><PanelLeftClose className="h-4 w-4" /> Colapsar</>}
          </button>
        </div>
      </aside>

      {reportOpen && <ReportProblemModal onClose={() => setReportOpen(false)} />}
    </>
  );
}
