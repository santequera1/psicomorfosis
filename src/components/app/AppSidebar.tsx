import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, Users, CalendarDays, ClipboardList, Brain,
  Pill, FileText, MessagesSquare, Receipt, BarChart3, Settings,
  ChevronsLeft, ChevronsRight, LifeBuoy,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Logo } from "./Logo";

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
    ],
  },
  {
    label: "Clínico",
    items: [
      { to: "/historia", label: "Historia clínica", icon: ClipboardList },
      { to: "/tests", label: "Tests psicométricos", icon: Brain },
      { to: "/prescripcion", label: "Prescripción", icon: Pill },
      { to: "/documentos", label: "Documentos", icon: FileText },
    ],
  },
  {
    label: "Gestión",
    items: [
      { to: "/mensajes", label: "Mensajes", icon: MessagesSquare },
      { to: "/facturacion", label: "Facturación", icon: Receipt },
      { to: "/reportes", label: "Reportes", icon: BarChart3 },
      { to: "/configuracion", label: "Configuración", icon: Settings },
    ],
  },
];

export function AppSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const { location } = useRouterState();
  const path = location.pathname;

  return (
    <aside
      className={cn(
        "sticky top-0 h-screen shrink-0 bg-sidebar text-sidebar-foreground flex flex-col transition-[width] duration-200 ease-out border-r border-sidebar-border",
        collapsed ? "w-[72px]" : "w-[268px]"
      )}
    >
      <div className={cn("flex items-center gap-3 px-4 h-16 border-b border-sidebar-border", collapsed && "justify-center px-0")}>
        <Logo className="h-7 w-7 shrink-0 text-brand-400" />
        {!collapsed && (
          <div className="flex flex-col leading-tight">
              <span className="font-serif text-[17px] font-medium text-sidebar-accent-foreground">Psicomorfosis</span>
              <span className="text-[11px] text-sidebar-foreground/70 tracking-wide">Psic. Nathaly Ferrer</span>
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto py-4">
        {groups.map((g) => (
          <div key={g.label} className="mb-5">
            {!collapsed && (
              <div className="px-5 mb-2 text-[11px] uppercase tracking-[0.12em] text-sidebar-foreground/55 font-medium">
                {g.label}
              </div>
            )}
            <ul className="space-y-0.5 px-2">
              {g.items.map((it) => {
                const active = it.to === "/" ? path === "/" : path.startsWith(it.to);
                const Icon = it.icon;
                return (
                  <li key={it.to}>
                    <Link
                      to={it.to}
                      className={cn(
                        "relative flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors",
                        "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                        active
                          ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-[3px] before:rounded-r before:bg-brand-400"
                          : "text-sidebar-foreground/85",
                        collapsed && "justify-center px-0"
                      )}
                      title={collapsed ? it.label : undefined}
                    >
                      <Icon className="h-[18px] w-[18px] shrink-0" />
                      {!collapsed && <span>{it.label}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-sidebar-border p-3 space-y-2">
        {!collapsed && (
          <div className="flex items-center gap-3 rounded-md px-2 py-2">
            <div className="h-9 w-9 rounded-full bg-brand-400/30 text-sidebar-accent-foreground flex items-center justify-center text-xs font-semibold">
              NF
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm text-sidebar-accent-foreground truncate">Psic. Nathaly Ferrer Pacheco</div>
              <div className="text-[11px] text-sidebar-foreground/65 truncate">Terapia cognitivo-conductual</div>
            </div>
            <button className="text-sidebar-foreground/60 hover:text-sidebar-accent-foreground" title="Soporte">
              <LifeBuoy className="h-4 w-4" />
            </button>
          </div>
        )}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className={cn(
            "w-full flex items-center gap-2 text-sidebar-foreground/70 hover:text-sidebar-accent-foreground hover:bg-sidebar-accent rounded-md px-3 py-2 text-xs transition-colors",
            collapsed && "justify-center"
          )}
        >
          {collapsed ? <ChevronsRight className="h-4 w-4" /> : <><ChevronsLeft className="h-4 w-4" /> Colapsar</>}
        </button>
      </div>
    </aside>
  );
}
