import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Brain, CheckCircle2, Clock, Loader2, RotateCw, Building2, Mail,
} from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { api, getStoredUser } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * Vista admin para gestionar solicitudes de tests psicométricos que
 * los psicólogos hacen desde la app (RequestTestModal). El equipo
 * Psicomorfosis las recibe acá para luego implementarlas como tests
 * validados (Goldberg, GADS, etc.) y publicarlos en el catálogo.
 *
 * Vive en /platform/test-requests, solo accesible para platform admin.
 */
export const Route = createFileRoute("/platform_/test-requests")({
  head: () => ({ meta: [{ title: "Solicitudes de tests · Plataforma" }] }),
  component: PlatformTestRequestsPage,
});

type StatusFilter = "open" | "closed" | "all";

function PlatformTestRequestsPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const u = getStoredUser();
    if (!u || !u.isPlatformAdmin) {
      navigate({ to: "/" });
      return;
    }
    setReady(true);
  }, [navigate]);

  if (!ready) {
    return (
      <AppShell>
        <div className="flex items-center justify-center min-h-[60vh] text-ink-500">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      </AppShell>
    );
  }
  return <TestRequestsView />;
}

function TestRequestsView() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<StatusFilter>("open");

  const { data: items = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ["platform-test-requests", filter],
    queryFn: () => api.platformListTestRequests(filter),
  });

  const resolveMu = useMutation({
    mutationFn: ({ id, status }: { id: number; status: "open" | "closed" }) =>
      api.platformResolveTestRequest(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["platform-test-requests"] });
      toast.success("Estado actualizado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <p className="text-xs uppercase tracking-widest text-brand-700 font-semibold inline-flex items-center gap-1.5">
              <Brain className="h-3.5 w-3.5" /> Plataforma
            </p>
            <h1 className="font-serif text-2xl md:text-3xl text-ink-900 mt-1">
              Solicitudes de tests
            </h1>
            <p className="text-sm text-ink-500 mt-1 max-w-xl">
              Tests que los psicólogos solicitan desde la app cuando no los
              encuentran en el catálogo. El equipo los implementa y publica
              como instrumentos validados.
            </p>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-9 px-3 rounded-md border border-line-200 text-sm text-ink-700 hover:border-brand-400 inline-flex items-center gap-1.5 disabled:opacity-50"
            title="Refrescar"
          >
            <RotateCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} /> Refrescar
          </button>
        </header>

        {/* Tabs de filtro por estado */}
        <div className="flex gap-1 p-1 rounded-md bg-bg-100 w-fit text-xs">
          {([
            { v: "open", label: "Abiertas" },
            { v: "closed", label: "Cerradas" },
            { v: "all", label: "Todas" },
          ] as const).map((t) => (
            <button
              key={t.v}
              onClick={() => setFilter(t.v)}
              className={cn(
                "px-3 py-1.5 rounded transition-colors",
                filter === t.v
                  ? "bg-surface text-ink-900 font-medium shadow-xs"
                  : "text-ink-500 hover:text-ink-900",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Listado */}
        {isLoading ? (
          <div className="py-12 text-center text-ink-500">
            <Loader2 className="h-5 w-5 mx-auto animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line-200 bg-surface p-12 text-center">
            <Brain className="h-8 w-8 mx-auto text-ink-300 mb-3" />
            <p className="text-sm text-ink-500">
              {filter === "open"
                ? "No hay solicitudes abiertas."
                : filter === "closed"
                  ? "No hay solicitudes cerradas."
                  : "Aún no hay solicitudes."}
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {items.map((r, i) => (
              <li
                key={r.id}
                className="rounded-xl border border-line-200 bg-surface p-5 animate-in fade-in slide-in-from-bottom-1 duration-400 fill-mode-backwards"
                style={{ animationDelay: `${Math.min(i * 30, 400)}ms` }}
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="font-semibold text-ink-900 tracking-tight">
                        {r.test_name}
                      </h3>
                      <span className={cn(
                        "inline-flex items-center gap-1 text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full font-medium",
                        r.status === "open"
                          ? "bg-warning-soft text-risk-moderate"
                          : "bg-success-soft text-success",
                      )}>
                        {r.status === "open"
                          ? (<><Clock className="h-3 w-3" /> Abierta</>)
                          : (<><CheckCircle2 className="h-3 w-3" /> Cerrada</>)}
                      </span>
                    </div>
                    <div className="text-xs text-ink-500 flex items-center gap-x-3 gap-y-1 flex-wrap">
                      <span className="inline-flex items-center gap-1">
                        <Building2 className="h-3 w-3 text-ink-400" />
                        {r.workspace_name ?? `Workspace ${r.workspace_id}`}
                      </span>
                      {r.requester_name && (
                        <span className="text-ink-700">{r.requester_name}</span>
                      )}
                      {r.requester_email && (
                        <span className="inline-flex items-center gap-1 truncate">
                          <Mail className="h-3 w-3 text-ink-400" />
                          {r.requester_email}
                        </span>
                      )}
                      <span className="tabular">
                        {new Date(r.created_at).toLocaleString("es-CO", {
                          timeZone: "America/Bogota",
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </span>
                    </div>
                    {r.reason && (
                      <p className="mt-3 text-sm text-ink-700 leading-relaxed whitespace-pre-wrap">
                        {r.reason}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {r.status === "open" ? (
                      <button
                        onClick={() => resolveMu.mutate({ id: r.id, status: "closed" })}
                        disabled={resolveMu.isPending}
                        className="h-8 px-3 rounded-md bg-brand-700 text-white text-xs font-medium hover:bg-brand-800 inline-flex items-center gap-1.5 disabled:opacity-50"
                        title="Marcar como cerrada"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" /> Cerrar
                      </button>
                    ) : (
                      <button
                        onClick={() => resolveMu.mutate({ id: r.id, status: "open" })}
                        disabled={resolveMu.isPending}
                        className="h-8 px-3 rounded-md border border-line-200 text-xs text-ink-700 hover:border-brand-400 inline-flex items-center gap-1.5 disabled:opacity-50"
                        title="Reabrir solicitud"
                      >
                        <RotateCw className="h-3.5 w-3.5" /> Reabrir
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
