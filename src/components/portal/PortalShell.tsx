import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Home, Calendar, ListChecks, FileText, User, LogOut, Heart } from "lucide-react";
import { Logo } from "@/components/app/Logo";
import { clearSession, getStoredUser, type ApiUser } from "@/lib/api";
import { cn } from "@/lib/utils";

const TABS: { to: string; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { to: "/p/inicio",     label: "Inicio",     icon: Home },
  { to: "/p/citas",      label: "Mis citas",  icon: Calendar },
  { to: "/p/tareas",     label: "Tareas",     icon: ListChecks },
  { to: "/p/documentos", label: "Documentos", icon: FileText },
  { to: "/p/perfil",     label: "Perfil",     icon: User },
];

/**
 * Shell del portal del paciente. Más cálido y espacioso que el del staff:
 * sin sidebar, navegación top con tabs grandes, fondo más claro, tipografía
 * que respira. Inspira calma.
 */
export function PortalShell({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const { location } = useRouterState();
  const path = location.pathname;
  const [user, setUser] = useState<ApiUser | null>(null);

  // Forzar light theme en el portal — la versión "cálida" es siempre clara
  useEffect(() => {
    const wasDark = document.documentElement.classList.contains("dark");
    document.documentElement.classList.remove("dark");
    setUser(getStoredUser());
    return () => { if (wasDark) document.documentElement.classList.add("dark"); };
  }, []);

  function logout() {
    clearSession();
    navigate({ to: "/p/login" });
  }

  const initials = (user?.name ?? "?").split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase();
  const firstName = user?.name?.split(" ")[0] ?? "";

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      {/* Header simple con brand + saludo + perfil */}
      <header className="bg-surface border-b border-line-100 sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="h-14 flex items-center justify-between">
            <Link to="/p/inicio" className="inline-flex items-center gap-2 text-ink-900">
              <Logo className="h-6 w-6 text-brand-700" />
              <span className="font-serif text-base sm:text-lg">Mi portal</span>
              <span className="hidden sm:inline text-xs text-ink-400 ml-1">· Psicomorfosis</span>
            </Link>
            <div className="flex items-center gap-2">
              <span className="text-sm text-ink-500 hidden sm:inline">Hola, {firstName}</span>
              <button
                onClick={logout}
                className="h-9 w-9 rounded-md text-ink-500 hover:text-ink-900 hover:bg-bg-100 inline-flex items-center justify-center"
                title="Cerrar sesión"
              >
                <LogOut className="h-4 w-4" />
              </button>
              <div className="h-9 w-9 rounded-full bg-brand-50 text-brand-700 text-xs font-semibold flex items-center justify-center border border-brand-100">
                {initials}
              </div>
            </div>
          </div>
          {/* Tabs */}
          <nav className="flex gap-1 overflow-x-auto no-scrollbar -mb-px">
            {TABS.map((t) => {
              const active = path === t.to || path.startsWith(t.to + "/");
              const Icon = t.icon;
              return (
                <Link
                  key={t.to}
                  to={t.to}
                  className={cn(
                    "px-3 sm:px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap inline-flex items-center gap-1.5",
                    active
                      ? "border-brand-700 text-brand-700"
                      : "border-transparent text-ink-500 hover:text-ink-900"
                  )}
                >
                  <Icon className="h-4 w-4" /> {t.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-10">
        {children}
      </main>

      <footer className="px-6 py-6 text-center text-xs text-ink-400">
        <span className="inline-flex items-center gap-1.5"><Heart className="h-3 w-3 text-brand-400" /> Tu espacio seguro · Psicomorfosis</span>
      </footer>
    </div>
  );
}
