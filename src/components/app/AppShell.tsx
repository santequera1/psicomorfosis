import { useEffect, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { AppSidebar } from "./AppSidebar";
import { Topbar } from "./Topbar";
import { SidebarProvider } from "./SidebarContext";
import { getToken } from "@/lib/api";

export function AppShell({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const { location } = useRouterState();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      navigate({ to: "/login", search: { redirect: location.pathname } as any });
      return;
    }
    setChecked(true);
  }, [navigate, location.pathname]);

  if (!checked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-50">
        <div className="text-sm text-ink-500">Verificando sesión…</div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex w-full min-h-screen bg-bg-50 text-ink-900">
        <AppSidebar />
        <div className="flex-1 min-w-0 flex flex-col">
          <Topbar />
          <main className="flex-1 px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
