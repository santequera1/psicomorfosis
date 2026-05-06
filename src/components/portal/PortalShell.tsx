import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Home, Calendar, ListChecks, FileText, User, LogOut, Heart, Brain } from "lucide-react";
import { Logo } from "@/components/app/Logo";
import { api, clearSession, getStoredUser, type ApiUser } from "@/lib/api";
import { cn } from "@/lib/utils";

type TabKey = "inicio" | "citas" | "tareas" | "tests" | "documentos" | "perfil";

const TABS: { key: TabKey; to: string; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "inicio",     to: "/p/inicio",     label: "Inicio",     icon: Home },
  { key: "citas",      to: "/p/citas",      label: "Mis citas",  icon: Calendar },
  { key: "tareas",     to: "/p/tareas",     label: "Tareas",     icon: ListChecks },
  { key: "tests",      to: "/p/tests",      label: "Tests",      icon: Brain },
  { key: "documentos", to: "/p/documentos", label: "Documentos", icon: FileText },
  { key: "perfil",     to: "/p/perfil",     label: "Perfil",     icon: User },
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

  // Tests pendientes/en curso → badge en la pestaña "Tests" para que el
  // paciente sepa que tiene algo asignado sin tener que entrar a revisar.
  // Polling cada 60s mientras el portal esté abierto, para captar
  // asignaciones nuevas hechas por el psicólogo durante la sesión.
  const { data: tests = [] } = useQuery({
    queryKey: ["portal-tests"],
    queryFn: () => api.portalTests(),
    refetchInterval: 60_000,
    enabled: !!user,
  });
  const badges: Partial<Record<TabKey, number>> = {
    tests: tests.filter((t) => t.status === "pendiente" || t.status === "en_curso").length,
  };

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
              const badge = badges[t.key];
              return (
                <Link
                  key={t.to}
                  to={t.to}
                  className={cn(
                    "relative px-3 sm:px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap inline-flex items-center gap-1.5",
                    active
                      ? "border-brand-700 text-brand-700"
                      : "border-transparent text-ink-500 hover:text-ink-900"
                  )}
                >
                  <Icon className="h-4 w-4" /> {t.label}
                  {badge != null && badge > 0 && (
                    <span
                      title={`${badge} ${badge === 1 ? "pendiente" : "pendientes"}`}
                      className="ml-0.5 inline-flex items-center justify-center min-w-4.5 h-4.5 px-1 rounded-full bg-brand-700 text-white text-[10px] font-semibold tabular leading-none"
                    >
                      {badge > 9 ? "9+" : badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-10">
        {children}
      </main>

      <footer className="px-6 py-6 text-center text-xs text-ink-400 space-y-2">
        <div>
          <span className="inline-flex items-center gap-1.5"><Heart className="h-3 w-3 text-brand-400" /> Tu espacio seguro · Psicomorfosis</span>
        </div>
        <div>
          <Link to="/privacidad" className="hover:text-brand-700 hover:underline">Aviso de privacidad</Link>
          {" · "}
          <Link to="/terminos" className="hover:text-brand-700 hover:underline">Términos</Link>
        </div>
      </footer>
    </div>
  );
}
