/**
 * /legal-admin — dashboard exclusivo de la asesora legal.
 *
 * Lista los documentos legales del sistema con su estado:
 *  - Última versión publicada (con label y fecha).
 *  - Borrador pendiente (si lo hay) con resumen de cambios.
 *  - Cantidad de aceptaciones registradas (audit).
 *
 * Click en una tarjeta → /legal-admin/<slug> para editar.
 *
 * Acceso restringido: el JWT debe tener is_legal_admin=1. Si entra
 * un usuario distinto, lo devolvemos al / (lo demás los maneja el
 * bootstrap script de __root.tsx).
 */

import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Scale, FileText, ChevronRight, Loader2, Globe, Lock, Edit3,
  CheckCircle2, Clock, ClipboardCheck, LogOut, PanelLeftClose, PanelLeftOpen,
  Settings, Sun, Moon, ArrowLeft,
} from "lucide-react";
import { api, getStoredUser, clearSession } from "@/lib/api";
import { cn } from "@/lib/utils";
import { getTheme, toggleTheme, type ThemePreference } from "@/lib/theme";

// ─── Persistencia del collapsed (mismo patrón que AppSidebar) ──────────
const KEY_LEGAL_COLLAPSED = "psm.legal-sidebar.collapsed";
function readCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(KEY_LEGAL_COLLAPSED) === "1";
}
function writeCollapsed(v: boolean) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(KEY_LEGAL_COLLAPSED, v ? "1" : "0");
  }
}

export const Route = createFileRoute("/legal-admin")({
  head: () => ({ meta: [{ title: "Asesoría legal · Psicomorfosis" }] }),
  component: LegalAdminPage,
});

function LegalAdminPage() {
  const navigate = useNavigate();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    const u = getStoredUser();
    if (!u || !u.isLegalAdmin) {
      navigate({ to: "/" });
      return;
    }
    setAllowed(true);
  }, [navigate]);

  if (!allowed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-50">
        <Loader2 className="h-5 w-5 animate-spin text-ink-400" />
      </div>
    );
  }

  return (
    <LegalAdminShell title="Documentos legales" subtitle="Crea borradores, edita y publica las versiones vigentes.">
      <DocumentsList />
    </LegalAdminShell>
  );
}

function DocumentsList() {
  const { data: docs, isLoading } = useQuery({
    queryKey: ["legal-admin-docs"],
    queryFn: () => api.legalAdminListDocuments(),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-ink-400">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!docs || docs.length === 0) {
    return (
      <div className="rounded-xl border border-line-200 bg-surface p-8 text-center text-sm text-ink-500">
        No hay documentos cargados todavía.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {docs.map((d) => (
        <Link
          key={d.id}
          to="/legal-admin/$slug"
          params={{ slug: d.slug }}
          className="group rounded-xl border border-line-200 bg-surface hover:border-brand-400 hover:shadow-card transition-all p-5 flex items-start gap-3"
        >
          <div className="h-10 w-10 rounded-lg bg-brand-100 text-brand-700 flex items-center justify-center shrink-0">
            <FileText className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-serif text-lg text-ink-900 leading-tight">{d.title}</h3>
              <ChevronRight className="h-4 w-4 text-ink-400 group-hover:text-brand-700 mt-1 shrink-0" />
            </div>
            {d.description && (
              <p className="text-xs text-ink-500 mt-1 leading-relaxed">{d.description}</p>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {d.publicPath ? (
                <Tag icon={Globe} label={`Pública · ${d.publicPath}`} tone="info" />
              ) : (
                <Tag icon={Lock} label="Interno" tone="muted" />
              )}
              {d.requiresAcceptance && (
                <Tag icon={CheckCircle2} label={`Acepta: ${audienceLabel(d.acceptanceAudience)}`} tone="success" />
              )}
              {d.acceptancesCount > 0 && (
                <Tag icon={ClipboardCheck} label={`${d.acceptancesCount} aceptación${d.acceptancesCount === 1 ? "" : "es"}`} tone="muted" />
              )}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
              <Status
                title="Vigente"
                value={d.latestPublished ? d.latestPublished.version_label : "Sin publicar"}
                hint={d.latestPublished ? formatDate(d.latestPublished.published_at) : "Aún no se ha publicado"}
                ok={!!d.latestPublished}
              />
              <Status
                title="Borrador"
                value={d.pendingDraft ? d.pendingDraft.version_label : "Ninguno"}
                hint={d.pendingDraft ? "Pendiente de publicar" : "Sin cambios pendientes"}
                pending={!!d.pendingDraft}
              />
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

function audienceLabel(a: string) {
  if (a === "staff") return "psicólogos";
  if (a === "patient") return "pacientes";
  if (a === "both") return "ambos";
  return "ninguno";
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
}

function Tag({
  icon: Icon, label, tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  tone: "info" | "success" | "muted";
}) {
  const styles = {
    info: "bg-info-soft text-info border-info/20",
    success: "bg-success-soft text-success border-success/20",
    muted: "bg-bg-100 text-ink-500 border-line-200",
  }[tone];
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px]", styles)}>
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

function Status({
  title, value, hint, ok, pending,
}: {
  title: string;
  value: string;
  hint?: string;
  ok?: boolean;
  pending?: boolean;
}) {
  return (
    <div className="rounded-md bg-bg-50 border border-line-100 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-ink-400 font-medium">{title}</div>
      <div className={cn(
        "text-sm font-medium mt-0.5",
        ok && "text-success",
        pending && "text-warning",
        !ok && !pending && "text-ink-700",
      )}>
        {value}
      </div>
      {hint && <div className="text-[11px] text-ink-500 mt-0.5">{hint}</div>}
    </div>
  );
}

// ─── Shell común para todas las vistas /legal-admin/* ────────────────
//
// Sidebar minimal con tres acciones (Documentos, Aceptaciones, Cerrar
// sesión) y barra superior con el nombre de la asesora. Es un layout
// dedicado distinto del AppShell clínico — la asesora no tiene
// pacientes, agenda ni nada operacional.

export function LegalAdminShell({
  title,
  subtitle,
  children,
  fullWidth = false,
  backTo,
  backLabel = "Volver",
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  /** Si true, el contenido principal usa todo el ancho disponible (sin
   *  max-width). Útil para el editor cuando se quiere ganar espacio
   *  con el sidebar colapsado. */
  fullWidth?: boolean;
  /** Cuando se entrega, muestra un botón "← Volver" en el header del
   *  shell. Útil para vistas anidadas (editor de un documento) donde
   *  hay un destino natural al que regresar. */
  backTo?: string;
  backLabel?: string;
}) {
  const [user] = useState(() => getStoredUser());
  const [collapsed, setCollapsedState] = useState<boolean>(() => readCollapsed());
  function setCollapsed(v: boolean) {
    setCollapsedState(v);
    writeCollapsed(v);
  }
  // Estado del tema, igual que en el Topbar clínico — el toggle
  // alterna claro/oscuro y persiste; aquí mantenemos solo el state
  // local para forzar el re-render del icono Sun/Moon.
  const [themePref, setThemePref] = useState<ThemePreference>(() => getTheme());
  const isDark = themePref === "oscuro" ||
    (themePref === "auto" && typeof window !== "undefined"
      && window.matchMedia?.("(prefers-color-scheme: dark)").matches);

  return (
    <div className="min-h-screen bg-bg-50 text-ink-900 flex">
      <aside
        className={cn(
          "hidden md:flex shrink-0 sticky top-0 h-screen border-r border-line-200 bg-surface flex-col transition-[width] duration-200 ease-out",
          collapsed ? "w-16" : "w-64",
        )}
      >
        <div className={cn(
          "h-16 border-b border-line-200 flex items-center gap-3",
          collapsed ? "px-3 justify-center" : "px-5",
        )}>
          <div className="h-9 w-9 rounded-lg bg-brand-100 text-brand-700 flex items-center justify-center shrink-0">
            <Scale className="h-5 w-5" />
          </div>
          {!collapsed && (
            <div className="leading-tight min-w-0">
              <div className="font-serif text-[16px] text-ink-900">Psicomorfosis</div>
              <div className="text-[11px] text-ink-500 tracking-wide">Asesoría legal</div>
            </div>
          )}
        </div>

        <nav className="flex-1 p-3 space-y-0.5">
          <SideLink to="/legal-admin" icon={FileText} label="Documentos" exact collapsed={collapsed} />
          <SideLink to="/legal-admin/aceptaciones" icon={ClipboardCheck} label="Aceptaciones" collapsed={collapsed} />
          <SideLink to="/configuracion" icon={Settings} label="Configuración" collapsed={collapsed} />
        </nav>

        <div className="border-t border-line-200 p-3 space-y-2">
          {user && !collapsed && (
            <div className="flex items-center gap-3 px-2 py-2">
              <div className="h-9 w-9 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-semibold shrink-0">
                {(user.name ?? "?").split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase()}
              </div>
              <div className="flex-1 min-w-0 text-sm">
                <div className="text-ink-900 truncate">{user.name}</div>
                <div className="text-[11px] text-ink-500 truncate">Asesora legal</div>
              </div>
            </div>
          )}
          <button
            onClick={() => {
              clearSession();
              window.location.replace("/login");
            }}
            title="Cerrar sesión"
            className={cn(
              "w-full inline-flex items-center gap-2 text-ink-500 hover:text-ink-900 hover:bg-bg-100 rounded-md px-3 py-2 text-xs",
              collapsed && "justify-center",
            )}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            {!collapsed && <span>Cerrar sesión</span>}
          </button>
          <button
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? "Expandir" : "Colapsar"}
            className={cn(
              "w-full inline-flex items-center gap-2 text-ink-500 hover:text-ink-900 hover:bg-bg-100 rounded-md px-3 py-2 text-xs",
              collapsed && "justify-center",
            )}
          >
            {collapsed
              ? <PanelLeftOpen className="h-4 w-4 shrink-0" />
              : <><PanelLeftClose className="h-4 w-4 shrink-0" /> <span>Colapsar</span></>}
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 bg-surface/80 backdrop-blur border-b border-line-200 h-16 flex items-center gap-3 px-4 sm:px-8">
          {backTo && (
            <Link
              to={backTo}
              className="h-10 px-3 rounded-lg border border-line-200 bg-surface text-ink-700 hover:border-brand-400 transition-colors flex items-center gap-1.5 text-sm shrink-0"
              aria-label={backLabel}
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">{backLabel}</span>
            </Link>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-xs uppercase tracking-[0.14em] text-brand-700 font-semibold">Asesoría legal</div>
            <div className="font-serif text-lg text-ink-900 leading-tight truncate">{title}</div>
          </div>
          <button
            onClick={() => setThemePref(toggleTheme())}
            className="h-10 w-10 rounded-lg border border-line-200 bg-surface text-ink-700 hover:border-brand-400 transition-colors flex items-center justify-center shrink-0"
            aria-label={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
            title={isDark ? "Modo claro" : "Modo oscuro"}
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </header>
        <main className={cn(
          "flex-1 px-4 sm:px-8 py-6 sm:py-8 w-full",
          fullWidth ? "" : "max-w-[1180px] mx-auto",
        )}>
          {subtitle && <p className="text-sm text-ink-500 mb-5 max-w-2xl">{subtitle}</p>}
          {children}
        </main>
      </div>
    </div>
  );
}

function SideLink({
  to, icon: Icon, label, exact = false, collapsed = false,
}: {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  exact?: boolean;
  collapsed?: boolean;
}) {
  return (
    <Link
      to={to}
      activeOptions={{ exact }}
      title={collapsed ? label : undefined}
      className={cn(
        "group flex items-center gap-3 rounded-md py-2.5 text-sm text-ink-700 hover:bg-bg-100",
        collapsed ? "justify-center px-0" : "px-3",
      )}
      activeProps={{
        className: "bg-brand-100 text-brand-800 font-medium",
      }}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed && <span>{label}</span>}
    </Link>
  );
}
