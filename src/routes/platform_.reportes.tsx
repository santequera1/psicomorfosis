import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft, Bug, CheckCircle2, Clock, Loader2, RotateCw, X, Paperclip,
} from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { api, getStoredUser } from "@/lib/api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/platform_/reportes")({
  head: () => ({ meta: [{ title: "Reportes de problemas · Plataforma" }] }),
  component: PlatformReportsPage,
});

type StatusFilter = "open" | "resolved" | "all";

function PlatformReportsPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);

  // Gate: solo platform admins.
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
  return <ReportsView />;
}

function ReportsView() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<StatusFilter>("open");
  const [openId, setOpenId] = useState<number | null>(null);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["platform-error-reports", filter],
    queryFn: () => api.platformListErrorReports(filter),
  });

  const resolveMu = useMutation({
    mutationFn: ({ id, status }: { id: number; status: "open" | "resolved" }) =>
      api.platformResolveErrorReport(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["platform-error-reports"] });
      toast.success("Estado actualizado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const items = data?.items ?? [];
  const counts = data?.counts;

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-2 mb-2 text-xs text-ink-500">
          <Link to="/platform" className="hover:text-brand-700 inline-flex items-center gap-1">
            <ArrowLeft className="h-3 w-3" /> Plataforma
          </Link>
        </div>
        <header className="flex items-start justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h1 className="font-serif text-2xl sm:text-3xl text-ink-900">Reportes de problemas</h1>
            <p className="text-sm text-ink-500 mt-1">
              Bugs y feedback enviados desde el botón "Reportar problema" de la app.
            </p>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-10 px-3 rounded-lg border border-line-200 text-ink-700 hover:border-brand-400 inline-flex items-center gap-2 text-sm"
          >
            <RotateCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
            Recargar
          </button>
        </header>

        {/* Tabs de filtro */}
        <div className="flex gap-1 mb-5 bg-bg-100 p-1 rounded-lg w-fit">
          {([
            ["open", "Abiertos", counts?.open_count],
            ["resolved", "Resueltos", counts?.resolved_count],
            ["all", "Todos", counts?.total_count],
          ] as const).map(([k, label, count]) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={cn(
                "px-3 h-8 rounded-md text-xs font-medium transition-colors inline-flex items-center gap-1.5",
                filter === k
                  ? "bg-surface text-ink-900 shadow-soft"
                  : "text-ink-500 hover:text-ink-700",
              )}
            >
              {label}
              {typeof count === "number" && (
                <span className="text-[10px] text-ink-500">({count})</span>
              )}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="text-center py-16 text-ink-500">
            <Loader2 className="h-5 w-5 mx-auto animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16">
            <div className="h-14 w-14 mx-auto rounded-full bg-sage-100 text-sage-700 flex items-center justify-center mb-3">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <p className="text-sm text-ink-700 font-medium">
              {filter === "open" ? "Sin reportes abiertos" : "Sin reportes"}
            </p>
            <p className="text-xs text-ink-500 mt-1">
              {filter === "open"
                ? "Todo bajo control. Cuando alguien reporte algo aparecerá aquí."
                : "Aún nadie ha enviado un reporte con este filtro."}
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-line-200 bg-surface overflow-hidden">
            <ul className="divide-y divide-line-100">
              {items.map((r) => (
                <li key={r.id}>
                  <button
                    onClick={() => setOpenId(r.id)}
                    className="w-full text-left px-4 py-3.5 hover:bg-brand-50/40 flex items-start gap-3"
                  >
                    <div className={cn(
                      "h-8 w-8 rounded-full flex items-center justify-center shrink-0 mt-0.5",
                      r.status === "resolved"
                        ? "bg-sage-100 text-sage-700"
                        : "bg-warning-soft text-risk-moderate",
                    )}>
                      {r.status === "resolved" ? <CheckCircle2 className="h-4 w-4" /> : <Bug className="h-4 w-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-ink-900 truncate max-w-md">
                          {r.user_description ?? r.message ?? "(sin descripción)"}
                        </span>
                        {r.kind === "auto" && (
                          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-bg-100 text-ink-500">auto</span>
                        )}
                        {r.attachments_count > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] text-ink-500" title={`${r.attachments_count} adjunto${r.attachments_count === 1 ? "" : "s"}`}>
                            <Paperclip className="h-3 w-3" /> {r.attachments_count}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-ink-500 mt-0.5 flex items-center gap-2 flex-wrap">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" /> {fmtDate(r.created_at)}
                        </span>
                        {r.user_name && (
                          <>
                            <span>·</span>
                            <span>{r.user_name} ({r.user_role ?? "?"})</span>
                          </>
                        )}
                        {r.workspace_name && (
                          <>
                            <span>·</span>
                            <span className="truncate max-w-45">{r.workspace_name}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {openId !== null && (
        <ReportDetail
          id={openId}
          onClose={() => setOpenId(null)}
          onToggleStatus={(id, currentStatus) => {
            const next = currentStatus === "resolved" ? "open" : "resolved";
            resolveMu.mutate({ id, status: next });
          }}
          isResolving={resolveMu.isPending}
        />
      )}
    </AppShell>
  );
}

function ReportDetail({
  id, onClose, onToggleStatus, isResolving,
}: {
  id: number;
  onClose: () => void;
  onToggleStatus: (id: number, currentStatus: string) => void;
  isResolving: boolean;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["platform-error-report", id],
    queryFn: () => api.platformGetErrorReport(id),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl bg-surface shadow-modal max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <header className="p-5 border-b border-line-100 flex items-start justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-brand-700 font-medium">Reporte #{id}</p>
            <h3 className="font-serif text-lg text-ink-900 mt-0.5">Detalle</h3>
          </div>
          <button
            onClick={onClose}
            className="h-9 w-9 rounded-md border border-line-200 text-ink-500 hover:border-brand-400 flex items-center justify-center"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-sm">
          {isLoading || !data ? (
            <div className="py-8 text-center text-ink-500">
              <Loader2 className="h-5 w-5 mx-auto animate-spin" />
            </div>
          ) : (
            <>
              <Field label="Descripción del usuario">
                {data.user_description ? (
                  <p className="whitespace-pre-wrap">{data.user_description}</p>
                ) : (
                  <span className="text-ink-400 italic">(sin descripción)</span>
                )}
              </Field>

              {data.attachments && data.attachments.length > 0 && (
                <Field label={`Capturas adjuntas (${data.attachments.length})`}>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {data.attachments.map((a) => (
                      <a
                        key={a.id}
                        href={a.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block group"
                        title={a.original_name ?? `Adjunto #${a.id}`}
                      >
                        <img
                          src={a.url}
                          alt={a.original_name ?? `Adjunto #${a.id}`}
                          className="w-full h-28 object-cover rounded-lg border border-line-200 group-hover:border-brand-400 transition-colors"
                        />
                        <div className="text-[10px] text-ink-500 mt-1 truncate">
                          {a.original_name ?? `#${a.id}`}
                        </div>
                      </a>
                    ))}
                  </div>
                  <p className="text-[11px] text-ink-400 mt-1">Click para abrir en tamaño original.</p>
                </Field>
              )}

              {data.message && (
                <Field label="Mensaje de error capturado">
                  <p className="font-mono text-xs bg-bg-50 p-2 rounded break-all">{data.message}</p>
                </Field>
              )}

              {data.stack && (
                <Field label="Stack trace">
                  <pre className="font-mono text-[11px] bg-bg-50 p-2 rounded overflow-x-auto whitespace-pre">{data.stack}</pre>
                </Field>
              )}

              <div className="grid grid-cols-2 gap-3">
                <Field label="Fecha"><span>{fmtDate(data.created_at)}</span></Field>
                <Field label="Tipo"><span className="capitalize">{data.kind}</span></Field>
                <Field label="Usuario">
                  <span>{data.user_name ?? <span className="text-ink-400 italic">(anónimo)</span>}</span>
                  {data.user_role && <span className="text-ink-500"> · {data.user_role}</span>}
                </Field>
                <Field label="Workspace">
                  <span>{data.workspace_name ?? <span className="text-ink-400 italic">—</span>}</span>
                </Field>
                <Field label="URL"><span className="break-all text-xs">{data.url ?? "—"}</span></Field>
                <Field label="User-Agent"><span className="break-all text-xs">{data.user_agent ?? "—"}</span></Field>
              </div>

              {data.status === "resolved" && data.resolved_at && (
                <Field label="Resuelto">
                  <span>{fmtDate(data.resolved_at)}</span>
                  {data.resolved_by_name && <span className="text-ink-500"> · por {data.resolved_by_name}</span>}
                </Field>
              )}
            </>
          )}
        </div>

        {data && (
          <footer className="p-5 border-t border-line-100 flex items-center justify-end gap-2">
            <button
              onClick={() => onToggleStatus(id, data.status)}
              disabled={isResolving}
              className={cn(
                "h-10 px-4 rounded-lg text-sm font-medium inline-flex items-center gap-2",
                data.status === "resolved"
                  ? "border border-line-200 text-ink-700 hover:border-brand-400"
                  : "bg-brand-700 text-white hover:bg-brand-800",
                isResolving && "opacity-60",
              )}
            >
              {isResolving && <Loader2 className="h-4 w-4 animate-spin" />}
              {data.status === "resolved" ? "Reabrir" : "Marcar como resuelto"}
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-ink-500 font-medium mb-1">{label}</div>
      <div className="text-sm text-ink-900">{children}</div>
    </div>
  );
}

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}
