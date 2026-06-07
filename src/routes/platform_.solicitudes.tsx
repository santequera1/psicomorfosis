import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CheckCircle2, Clock, Loader2, RotateCw, UserPlus, XCircle,
  Mail, Phone, Calendar, User as UserIcon, Hash, X, AlertCircle, ChevronRight,
} from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { api, getStoredUser } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * Vista admin para gestionar solicitudes de cuentas que llegaron desde
 * el form de la landing. El platform admin puede aprobarlas (crea
 * workspace + user + professional + envía email de bienvenida) o
 * rechazarlas (envía email cordial).
 *
 * Vive en /platform/solicitudes, solo accesible para platform admin.
 */
export const Route = createFileRoute("/platform_/solicitudes")({
  head: () => ({ meta: [{ title: "Solicitudes de cuenta · Plataforma" }] }),
  component: PlatformAccountRequestsPage,
});

type StatusFilter = "pending" | "approved" | "rejected" | "all";

function PlatformAccountRequestsPage() {
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
  return <RequestsView />;
}

type Req = Awaited<ReturnType<typeof api.listAccountRequests>>["items"][number];

function RequestsView() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<StatusFilter>("pending");
  const [selected, setSelected] = useState<Req | null>(null);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["platform-account-requests", filter],
    queryFn: () => api.listAccountRequests(
      filter === "all" ? undefined : { status: filter },
    ),
  });
  const items = data?.items ?? [];
  const counts = data?.counts ?? { pending: 0, approved: 0, rejected: 0 };

  const approve = useMutation({
    mutationFn: (id: number) => api.approveAccountRequest(id),
    onSuccess: (res, id) => {
      toast.success(
        res.alreadyApproved
          ? "Esta solicitud ya estaba aprobada."
          : `Cuenta creada: ${res.username}. Enviamos email de bienvenida.`,
      );
      qc.invalidateQueries({ queryKey: ["platform-account-requests"] });
      qc.invalidateQueries({ queryKey: ["platform-workspaces"] });
      if (selected?.id === id) setSelected(null);
    },
    onError: (e: Error) => toast.error(e?.message ?? "No se pudo aprobar"),
  });

  const reject = useMutation({
    mutationFn: (args: { id: number; reason?: string }) =>
      api.rejectAccountRequest(args.id, args.reason ? { reason: args.reason } : undefined),
    onSuccess: (res, args) => {
      toast.success(res.alreadyRejected ? "Ya estaba rechazada." : "Solicitud rechazada. Enviamos email.");
      qc.invalidateQueries({ queryKey: ["platform-account-requests"] });
      if (selected?.id === args.id) setSelected(null);
    },
    onError: (e: Error) => toast.error(e?.message ?? "No se pudo rechazar"),
  });

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <button
              type="button"
              onClick={() => navigate({ to: "/platform" })}
              className="text-xs text-ink-500 hover:text-ink-700 mb-1 inline-flex items-center gap-1"
            >
              ← Plataforma
            </button>
            <h1 className="font-serif text-2xl text-ink-900">Solicitudes de cuenta</h1>
            <p className="text-sm text-ink-500 mt-1">
              Registros que llegaron desde el formulario de la landing.
            </p>
          </div>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg border border-line-200 bg-surface text-sm text-ink-700 hover:bg-bg-50 disabled:opacity-60"
          >
            <RotateCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
            Actualizar
          </button>
        </div>

        {/* Filtros */}
        <div className="flex items-center gap-1.5 mb-6 flex-wrap">
          <FilterPill
            label={`Pendientes · ${counts.pending}`}
            active={filter === "pending"}
            onClick={() => setFilter("pending")}
            tone="brand"
          />
          <FilterPill
            label={`Aprobadas · ${counts.approved}`}
            active={filter === "approved"}
            onClick={() => setFilter("approved")}
            tone="success"
          />
          <FilterPill
            label={`Rechazadas · ${counts.rejected}`}
            active={filter === "rejected"}
            onClick={() => setFilter("rejected")}
            tone="neutral"
          />
          <FilterPill
            label="Todas"
            active={filter === "all"}
            onClick={() => setFilter("all")}
            tone="neutral"
          />
        </div>

        {/* Lista */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-ink-500">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState filter={filter} />
        ) : (
          <ul className="space-y-2">
            {items.map((r) => (
              <RequestRow
                key={r.id}
                req={r}
                onOpen={() => setSelected(r)}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Drawer de detalle */}
      {selected && (
        <RequestDrawer
          req={selected}
          onClose={() => setSelected(null)}
          onApprove={() => approve.mutate(selected.id)}
          onReject={(reason) => reject.mutate({ id: selected.id, reason })}
          isApproving={approve.isPending}
          isRejecting={reject.isPending}
        />
      )}
    </AppShell>
  );
}

function FilterPill({
  label, active, onClick, tone,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  tone: "brand" | "success" | "neutral";
}) {
  const activeStyle = {
    brand: "bg-brand-100 text-brand-800 border-brand-300",
    success: "bg-emerald-100 text-emerald-800 border-emerald-300",
    neutral: "bg-ink-100 text-ink-800 border-ink-300",
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-3 h-8 rounded-full border text-xs font-medium transition-colors",
        active ? activeStyle : "bg-surface border-line-200 text-ink-700 hover:bg-bg-50",
      )}
    >
      {label}
    </button>
  );
}

function RequestRow({ req, onOpen }: { req: Req; onOpen: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="w-full text-left rounded-xl border border-line-200 bg-surface hover:border-brand-300 hover:shadow-sm transition-all p-4 flex items-center gap-4"
      >
        <StatusBadge status={req.status} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-ink-900 text-sm truncate">{req.full_name}</span>
            <span className="text-xs text-ink-500 font-mono">@{req.username}</span>
          </div>
          <div className="mt-1 flex items-center gap-3 flex-wrap text-xs text-ink-500">
            <span className="inline-flex items-center gap-1">
              <Mail className="h-3 w-3" />
              {req.email}
            </span>
            {req.phone && (
              <span className="inline-flex items-center gap-1">
                <Phone className="h-3 w-3" />
                {req.phone}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {humanDate(req.created_at)}
            </span>
          </div>
          {req.message && (
            <p className="mt-2 text-xs text-ink-600 line-clamp-1">{req.message}</p>
          )}
        </div>
        <ChevronRight className="h-4 w-4 text-ink-400 shrink-0" />
      </button>
    </li>
  );
}

function StatusBadge({ status }: { status: Req["status"] }) {
  if (status === "pending") {
    return (
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 text-brand-700 border border-brand-200/70 shrink-0">
        <Clock className="h-4 w-4" />
      </span>
    );
  }
  if (status === "approved") {
    return (
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/70 shrink-0">
        <CheckCircle2 className="h-4 w-4" />
      </span>
    );
  }
  return (
    <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-ink-100 text-ink-600 border border-ink-200 shrink-0">
      <XCircle className="h-4 w-4" />
    </span>
  );
}

function EmptyState({ filter }: { filter: StatusFilter }) {
  const messages: Record<StatusFilter, string> = {
    pending: "No hay solicitudes pendientes.",
    approved: "No hay solicitudes aprobadas todavía.",
    rejected: "No hay solicitudes rechazadas.",
    all: "Nadie se ha registrado todavía.",
  };
  return (
    <div className="text-center py-16 text-ink-500">
      <div className="inline-flex h-12 w-12 rounded-full bg-bg-50 items-center justify-center mb-3">
        <UserPlus className="h-5 w-5 text-ink-400" />
      </div>
      <p className="text-sm">{messages[filter]}</p>
    </div>
  );
}

function RequestDrawer({
  req, onClose, onApprove, onReject, isApproving, isRejecting,
}: {
  req: Req;
  onClose: () => void;
  onApprove: () => void;
  onReject: (reason?: string) => void;
  isApproving: boolean;
  isRejecting: boolean;
}) {
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [reason, setReason] = useState("");
  const busy = isApproving || isRejecting;

  const firstName = useMemo(() => req.full_name.split(/\s+/)[0], [req.full_name]);

  return (
    <div className="fixed inset-0 z-50 flex">
      <button
        type="button"
        aria-label="Cerrar"
        onClick={busy ? undefined : onClose}
        className="absolute inset-0 bg-ink-900/40 backdrop-blur-sm"
        disabled={busy}
      />
      <div className="relative ml-auto w-full max-w-md h-full bg-surface shadow-2xl flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-line-200">
          <h2 className="font-serif text-lg text-ink-900">Detalle de la solicitud</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-ink-500 hover:bg-bg-50 disabled:opacity-40"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div className="flex items-center gap-3">
            <StatusBadge status={req.status} />
            <div>
              <p className="text-sm font-medium text-ink-900">{statusLabel(req.status)}</p>
              <p className="text-xs text-ink-500">
                Recibida {humanDateTime(req.created_at)}
              </p>
            </div>
          </div>

          <DetailRow icon={UserIcon} label="Nombre" value={req.full_name} />
          <DetailRow icon={Mail} label="Correo" value={req.email} link={`mailto:${req.email}`} />
          <DetailRow icon={Hash} label="Usuario" value={`@${req.username}`} mono />
          {req.phone && (
            <DetailRow icon={Phone} label="Teléfono" value={req.phone} link={`tel:${req.phone}`} />
          )}

          {req.message && (
            <div className="rounded-lg bg-bg-50 border border-line-100 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500 mb-1">Mensaje</p>
              <p className="text-sm text-ink-800 whitespace-pre-wrap leading-relaxed">{req.message}</p>
            </div>
          )}

          {req.status === "pending" && (
            <div className="rounded-lg border border-brand-200/60 bg-brand-50/40 p-3">
              <p className="text-xs text-brand-800 leading-relaxed">
                Al aprobar se creará un workspace llamado{" "}
                <span className="font-medium">“Consulta de {firstName}”</span>, un usuario{" "}
                <span className="font-mono">@{req.username}</span> con rol super_admin y se le
                enviará el email de bienvenida.
              </p>
            </div>
          )}

          {req.status === "rejected" && req.rejection_reason && (
            <div className="rounded-lg bg-rose-50 border border-rose-200 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-700 mb-1">
                Motivo del rechazo
              </p>
              <p className="text-sm text-rose-900">{req.rejection_reason}</p>
            </div>
          )}

          {req.status === "approved" && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3">
              <p className="text-xs text-emerald-800">
                Workspace #{req.approved_workspace_id} · Usuario #{req.approved_user_id}
              </p>
            </div>
          )}
        </div>

        {req.status === "pending" && (
          <div className="border-t border-line-200 p-4 space-y-3">
            {showRejectForm ? (
              <div className="space-y-2">
                <label className="block text-xs font-medium text-ink-700">
                  Motivo (opcional, se incluye en el email)
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder="Por ahora no abrimos cupos en tu zona…"
                  className="w-full px-3 py-2 rounded-lg border border-line-200 bg-bg text-sm text-ink-900 focus:outline-none focus:border-brand-400 resize-y"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onReject(reason.trim() || undefined)}
                    disabled={busy}
                    className="flex-1 h-10 rounded-lg bg-rose-700 text-white text-sm font-medium hover:bg-rose-800 disabled:opacity-60 inline-flex items-center justify-center gap-2"
                  >
                    {isRejecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                    Confirmar rechazo
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowRejectForm(false)}
                    disabled={busy}
                    className="px-4 h-10 rounded-lg border border-line-200 text-sm text-ink-700 hover:bg-bg-50 disabled:opacity-60"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setShowRejectForm(true)}
                  disabled={busy}
                  className="h-10 rounded-lg border border-line-200 text-sm text-ink-700 hover:bg-bg-50 disabled:opacity-60 inline-flex items-center justify-center gap-2"
                >
                  <XCircle className="h-4 w-4" />
                  Rechazar
                </button>
                <button
                  type="button"
                  onClick={onApprove}
                  disabled={busy}
                  className="h-10 rounded-lg bg-brand-700 text-white text-sm font-medium hover:bg-brand-800 disabled:opacity-60 inline-flex items-center justify-center gap-2"
                >
                  {isApproving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Aprobar
                </button>
              </div>
            )}
            <p className="text-[11px] text-ink-500 text-center inline-flex items-center justify-center gap-1 w-full">
              <AlertCircle className="h-3 w-3" />
              Acción irreversible: aprobar crea la cuenta y envía el email.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function DetailRow({
  icon: Icon, label, value, link, mono,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  link?: string;
  mono?: boolean;
}) {
  const content = (
    <span className={cn("text-sm text-ink-900", mono && "font-mono")}>{value}</span>
  );
  return (
    <div className="flex items-start gap-3">
      <Icon className="h-4 w-4 text-ink-400 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">{label}</p>
        {link ? <a href={link} className="text-brand-700 hover:underline">{content}</a> : content}
      </div>
    </div>
  );
}

function statusLabel(s: Req["status"]) {
  if (s === "pending") return "Pendiente de revisión";
  if (s === "approved") return "Aprobada";
  return "Rechazada";
}

function humanDate(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-CO", { day: "numeric", month: "short" });
}
function humanDateTime(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("es-CO", {
    day: "numeric", month: "short", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}
