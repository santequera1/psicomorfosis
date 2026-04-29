import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Shield, Users, FileText, CalendarCheck2, Activity, Plus, Power, PowerOff,
  Search, Loader2, X, AlertCircle, Copy, ChevronRight, ArrowLeft,
  CheckCircle2, Building2, User as UserIcon,
} from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { KpiCard } from "@/components/app/KpiCard";
import { api, getStoredUser, type PlatformWorkspace } from "@/lib/api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/platform")({
  head: () => ({ meta: [{ title: "Plataforma · Psicomorfosis" }] }),
  validateSearch: (s): { ws?: number } => {
    const v = s.ws;
    return typeof v === "number" && v > 0 ? { ws: v } : {};
  },
  component: PlatformPage,
});

function PlatformPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);

  // Gate: solo platform admins. Si no, devolvemos al home.
  useEffect(() => {
    const u = getStoredUser();
    if (!u || !u.isPlatformAdmin) {
      navigate({ to: "/" });
      return;
    }
    setAllowed(true);
    setReady(true);
  }, [navigate]);

  if (!ready || !allowed) {
    return (
      <AppShell>
        <div className="flex items-center justify-center min-h-[60vh] text-ink-500">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      </AppShell>
    );
  }

  if (search.ws) {
    return <WorkspaceDetailView wsId={search.ws} onBack={() => navigate({ to: "/platform" })} />;
  }

  return <PlatformDashboard />;
}

function PlatformDashboard() {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"todos" | "activo" | "deshabilitado">("todos");
  const [createOpen, setCreateOpen] = useState(false);
  const [disabling, setDisabling] = useState<PlatformWorkspace | null>(null);

  const { data: usage } = useQuery({
    queryKey: ["platform-usage"],
    queryFn: () => api.platformGetUsage(),
  });
  const { data: workspaces = [], isLoading } = useQuery({
    queryKey: ["platform-workspaces"],
    queryFn: () => api.platformListWorkspaces(),
  });

  const filtered = useMemo(() => workspaces.filter((w) => {
    if (statusFilter === "activo" && w.disabledAt) return false;
    if (statusFilter === "deshabilitado" && !w.disabledAt) return false;
    if (query.trim()) {
      const q = query.toLowerCase();
      const hay = (s: string | null) => (s ?? "").toLowerCase().includes(q);
      if (!hay(w.name) && !hay(w.ownerName) && !hay(w.ownerEmail) && !hay(w.ownerUsername)) return false;
    }
    return true;
  }), [workspaces, query, statusFilter]);

  return (
    <AppShell>
      <div className="space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm text-ink-500 inline-flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5" /> Administración de plataforma
            </p>
            <h1 className="font-serif text-2xl md:text-[32px] leading-tight text-ink-900 mt-1">
              Cuentas de psicólogos
            </h1>
            <p className="text-xs text-ink-500 mt-1">Visible solo para administradores de Psicomorfosis.</p>
          </div>
          <button
            onClick={() => setCreateOpen(true)}
            className="h-10 px-4 rounded-lg bg-brand-700 text-white text-sm font-medium hover:bg-brand-800 inline-flex items-center gap-2"
          >
            <Plus className="h-4 w-4" /> Crear cuenta
          </button>
        </header>

        {/* KPIs globales */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          <KpiCard
            label="Cuentas activas"
            value={String(usage?.workspaces_active ?? "—")}
            hint={`${usage?.workspaces_total ?? 0} totales`}
            icon={<Building2 className="h-4 w-4" />}
            delta={{ neutral: true, value: "" }}
          />
          <KpiCard
            label="Psicólogos activos 7d"
            value={String(usage?.active_staff_7d ?? "—")}
            hint={`${usage?.staff_users ?? 0} en total`}
            icon={<Activity className="h-4 w-4" />}
            delta={{ neutral: true, value: "" }}
          />
          <KpiCard
            label="Pacientes"
            value={String(usage?.patients_total ?? "—")}
            hint={`+ ${usage?.patient_users ?? 0} con portal`}
            icon={<Users className="h-4 w-4" />}
            delta={{ neutral: true, value: "" }}
          />
          <KpiCard
            label="Documentos 30d"
            value={String(usage?.docs_30d ?? "—")}
            hint={`${usage?.appts_30d ?? 0} citas en 30d`}
            icon={<FileText className="h-4 w-4" />}
            delta={{ neutral: true, value: "" }}
          />
        </section>

        {/* Listado */}
        <section className="rounded-xl border border-line-200 bg-surface">
          <div className="p-3 sm:p-4 border-b border-line-100 flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-2 h-10 px-3 rounded-md border border-line-200 bg-bg-100/40 flex-1 min-w-60">
              <Search className="h-4 w-4 text-ink-400 shrink-0" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por nombre, propietario, email, usuario…"
                className="flex-1 bg-transparent text-sm text-ink-900 placeholder:text-ink-400 outline-none min-w-0"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="h-10 px-3 rounded-md border border-line-200 bg-surface text-xs text-ink-700 outline-none hover:border-brand-400"
            >
              <option value="todos">Todas</option>
              <option value="activo">Activas</option>
              <option value="deshabilitado">Deshabilitadas</option>
            </select>
          </div>

          {isLoading ? (
            <div className="p-10 text-center text-sm text-ink-500"><Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Cargando…</div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-sm text-ink-500">
              {workspaces.length === 0
                ? "Aún no hay cuentas. Click en \"Crear cuenta\" para invitar al primer psicólogo."
                : "Sin coincidencias con los filtros."}
            </div>
          ) : (
            <ul className="divide-y divide-line-100">
              {filtered.map((w) => (
                <WorkspaceRow
                  key={w.id}
                  ws={w}
                  onDisable={() => setDisabling(w)}
                />
              ))}
            </ul>
          )}
        </section>
      </div>

      {createOpen && <CreateWorkspaceModal onClose={() => setCreateOpen(false)} />}
      {disabling && <DisableWorkspaceModal ws={disabling} onClose={() => setDisabling(null)} />}
    </AppShell>
  );
}

// ─── Fila por workspace ─────────────────────────────────────────────────────
function WorkspaceRow({ ws, onDisable }: { ws: PlatformWorkspace; onDisable: () => void }) {
  const qc = useQueryClient();
  const enableMu = useMutation({
    mutationFn: () => api.platformEnableWorkspace(ws.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["platform-workspaces"] });
      qc.invalidateQueries({ queryKey: ["platform-usage"] });
      toast.success("Cuenta reactivada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const isDisabled = !!ws.disabledAt;

  return (
    <li className="px-3 sm:px-5 py-3 sm:py-4 hover:bg-brand-50/40 transition-colors">
      <div className="flex items-start gap-3 sm:gap-4">
        <div className={cn(
          "h-10 w-10 rounded-lg flex items-center justify-center shrink-0",
          isDisabled ? "bg-bg-100 text-ink-400" : ws.mode === "organization" ? "bg-lavender-100 text-lavender-500" : "bg-brand-50 text-brand-800",
        )}>
          {ws.mode === "organization" ? <Building2 className="h-4 w-4" /> : <UserIcon className="h-4 w-4" />}
        </div>
        <Link to="/platform" search={{ ws: ws.id }} className="flex-1 min-w-0 cursor-pointer">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-ink-900 truncate">{ws.name}</span>
            {isDisabled ? (
              <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.06em] px-2 py-0.5 rounded-full font-medium bg-error-soft text-risk-high">
                <PowerOff className="h-3 w-3" /> Deshabilitada
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.06em] px-2 py-0.5 rounded-full font-medium bg-success-soft text-success">
                <Power className="h-3 w-3" /> Activa
              </span>
            )}
            <span className="inline-flex items-center text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-bg-100 text-ink-500">
              {ws.mode === "organization" ? "Clínica" : "Individual"}
            </span>
          </div>
          <div className="text-[11px] sm:text-xs text-ink-500 mt-1 flex items-center gap-x-2 sm:gap-x-3 gap-y-0.5 flex-wrap">
            {ws.ownerName && <span>{ws.ownerName}</span>}
            {ws.ownerEmail && <><span className="text-ink-300">·</span><span className="truncate">{ws.ownerEmail}</span></>}
            <span className="text-ink-300">·</span>
            <span className="tabular">{ws.patientsCount} pacientes</span>
            <span className="text-ink-300">·</span>
            <span className="tabular">{ws.documentsCount} docs</span>
            {ws.lastLoginAt && (
              <>
                <span className="text-ink-300 hidden sm:inline">·</span>
                <span className="tabular hidden sm:inline">Último login: {formatRelative(ws.lastLoginAt)}</span>
              </>
            )}
          </div>
          {isDisabled && ws.disabledReason && (
            <div className="text-[11px] text-risk-high mt-1 italic">Motivo: {ws.disabledReason}</div>
          )}
        </Link>
        <div className="flex items-center gap-1 shrink-0">
          {isDisabled ? (
            <button
              onClick={() => enableMu.mutate()}
              disabled={enableMu.isPending}
              className="h-8 px-3 rounded-md border border-line-200 text-xs text-success hover:border-success/50 inline-flex items-center gap-1.5"
              title="Reactivar cuenta"
            >
              {enableMu.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Power className="h-3 w-3" />}
              Reactivar
            </button>
          ) : (
            <button
              onClick={onDisable}
              className="h-8 px-3 rounded-md border border-line-200 text-xs text-risk-high hover:border-risk-high/50 inline-flex items-center gap-1.5"
              title="Deshabilitar cuenta"
            >
              <PowerOff className="h-3 w-3" />
              Deshabilitar
            </button>
          )}
          <Link
            to="/platform"
            search={{ ws: ws.id }}
            className="h-8 w-8 rounded-md border border-line-200 text-ink-500 hover:border-brand-400 flex items-center justify-center"
            title="Ver detalle"
          >
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </li>
  );
}

// ─── Modal: crear cuenta ───────────────────────────────────────────────────
function CreateWorkspaceModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    workspaceName: "",
    mode: "individual" as "individual" | "organization",
    ownerName: "",
    ownerEmail: "",
    username: "",
    password: "",
    professionalTitle: "",
    professionalPhone: "",
  });
  const [created, setCreated] = useState<{ username: string; password: string; workspaceId: number } | null>(null);

  const createMu = useMutation({
    mutationFn: () => api.platformCreateWorkspace(form),
    onSuccess: (resp) => {
      qc.invalidateQueries({ queryKey: ["platform-workspaces"] });
      qc.invalidateQueries({ queryKey: ["platform-usage"] });
      setCreated({ username: resp.username, password: form.password, workspaceId: resp.workspaceId });
      toast.success("Cuenta creada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function copy(text: string, label: string) {
    navigator.clipboard?.writeText(text).then(
      () => toast.success(`${label} copiado`),
      () => toast.error("No se pudo copiar"),
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink-900/40 backdrop-blur-sm pt-16 p-4 overflow-y-auto" onClick={onClose}>
      <form
        onSubmit={(e) => { e.preventDefault(); if (!created) createMu.mutate(); }}
        className="w-full max-w-lg rounded-2xl bg-surface shadow-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-4 border-b border-line-100 flex items-start justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-brand-700 font-medium">Plataforma</p>
            <h3 className="font-serif text-xl text-ink-900 mt-0.5">Crear cuenta de psicólogo</h3>
            <p className="text-xs text-ink-500 mt-1">Se crea un workspace nuevo, su primer usuario y un perfil profesional. Compártele las credenciales por WhatsApp o correo.</p>
          </div>
          <button type="button" onClick={onClose} className="h-9 w-9 rounded-md border border-line-200 text-ink-500 hover:border-brand-400 flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        </header>

        {created ? (
          <div className="p-5 space-y-4">
            <div className="rounded-lg border border-success/30 bg-success-soft p-4">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-5 w-5 text-success shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-success">Cuenta creada</p>
                  <p className="text-xs text-ink-700 mt-1">Comparte estas credenciales con el psicólogo. Pídele que cambie la contraseña al entrar.</p>
                </div>
              </div>
            </div>
            <Field label="Usuario">
              <div className="flex gap-2">
                <input readOnly value={created.username} className="flex-1 h-10 px-3 rounded-md border border-line-200 bg-bg text-sm font-mono text-ink-900" />
                <button type="button" onClick={() => copy(created.username, "Usuario")} className="h-10 px-3 rounded-md border border-line-200 text-ink-500 hover:border-brand-400 inline-flex items-center gap-1.5 text-xs">
                  <Copy className="h-3.5 w-3.5" /> Copiar
                </button>
              </div>
            </Field>
            <Field label="Contraseña">
              <div className="flex gap-2">
                <input readOnly value={created.password} className="flex-1 h-10 px-3 rounded-md border border-line-200 bg-bg text-sm font-mono text-ink-900" />
                <button type="button" onClick={() => copy(created.password, "Contraseña")} className="h-10 px-3 rounded-md border border-line-200 text-ink-500 hover:border-brand-400 inline-flex items-center gap-1.5 text-xs">
                  <Copy className="h-3.5 w-3.5" /> Copiar
                </button>
              </div>
            </Field>
            <Field label="Mensaje sugerido para WhatsApp">
              <textarea
                readOnly
                rows={5}
                value={`Hola ${form.ownerName.split(" ")[0]}, te creé tu cuenta en Psicomorfosis 🌱\n\nUsuario: ${created.username}\nContraseña: ${created.password}\nEntra en: https://psico.wailus.co/login\n\nCualquier duda, me cuentas.`}
                className="w-full px-3 py-2 rounded-md border border-line-200 bg-bg text-xs text-ink-700 font-mono resize-none"
              />
            </Field>
          </div>
        ) : (
          <div className="p-5 space-y-3">
            <Field label="Nombre del workspace" required>
              <input
                required
                value={form.workspaceName}
                onChange={(e) => setForm((f) => ({ ...f, workspaceName: e.target.value }))}
                placeholder='Ej: "Consulta Dra. Lucía Méndez" o "Clínica MentalCare"'
                className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Modo">
                <select
                  value={form.mode}
                  onChange={(e) => setForm((f) => ({ ...f, mode: e.target.value as any }))}
                  className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none hover:border-brand-400"
                >
                  <option value="individual">Individual (1 psicólogo/a)</option>
                  <option value="organization">Clínica (varios)</option>
                </select>
              </Field>
              <Field label="Tarjeta profesional / título">
                <input
                  value={form.professionalTitle}
                  onChange={(e) => setForm((f) => ({ ...f, professionalTitle: e.target.value }))}
                  placeholder="TP 12345-2018"
                  className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700"
                />
              </Field>
            </div>
            <hr className="border-line-100" />
            <Field label="Nombre del profesional" required>
              <input
                required
                value={form.ownerName}
                onChange={(e) => setForm((f) => ({ ...f, ownerName: e.target.value }))}
                placeholder="Lucía Méndez"
                className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Correo" required>
                <input
                  required
                  type="email"
                  value={form.ownerEmail}
                  onChange={(e) => setForm((f) => ({ ...f, ownerEmail: e.target.value }))}
                  placeholder="lucia@correo.co"
                  className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700"
                />
              </Field>
              <Field label="Teléfono">
                <input
                  value={form.professionalPhone}
                  onChange={(e) => setForm((f) => ({ ...f, professionalPhone: e.target.value }))}
                  placeholder="+57 310 000 0000"
                  className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700"
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Usuario (opcional)">
                <input
                  value={form.username}
                  onChange={(e) => setForm((f) => ({ ...f, username: e.target.value.toLowerCase() }))}
                  placeholder="Si vacío, lo derivamos del email"
                  className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700 font-mono"
                />
              </Field>
              <Field label="Contraseña" required>
                <input
                  required
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder="mín. 6 caracteres"
                  className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700 font-mono"
                />
              </Field>
            </div>
          </div>
        )}

        <footer className="p-4 border-t border-line-100 bg-bg-100/30 flex justify-end gap-2">
          {created ? (
            <button type="button" onClick={onClose} className="h-9 px-4 rounded-md bg-brand-700 text-primary-foreground text-sm font-medium hover:bg-brand-800">
              Listo
            </button>
          ) : (
            <>
              <button type="button" onClick={onClose} className="h-9 px-3 rounded-md border border-line-200 text-sm text-ink-700 hover:border-brand-400">Cancelar</button>
              <button type="submit" disabled={createMu.isPending} className="h-9 px-4 rounded-md bg-brand-700 text-primary-foreground text-sm font-medium hover:bg-brand-800 disabled:opacity-60 inline-flex items-center gap-2">
                {createMu.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Crear cuenta
              </button>
            </>
          )}
        </footer>
      </form>
    </div>
  );
}

// ─── Modal: deshabilitar ───────────────────────────────────────────────────
function DisableWorkspaceModal({ ws, onClose }: { ws: PlatformWorkspace; onClose: () => void }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const mu = useMutation({
    mutationFn: () => api.platformDisableWorkspace(ws.id, reason || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["platform-workspaces"] });
      qc.invalidateQueries({ queryKey: ["platform-usage"] });
      toast.success(`Cuenta "${ws.name}" deshabilitada`);
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink-900/40 backdrop-blur-sm pt-16 p-4" onClick={onClose}>
      <form
        onSubmit={(e) => { e.preventDefault(); mu.mutate(); }}
        className="w-full max-w-md rounded-2xl bg-surface shadow-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-4 border-b border-line-100">
          <p className="text-[11px] uppercase tracking-widest text-risk-high font-medium">Plataforma</p>
          <h3 className="font-serif text-xl text-ink-900 mt-0.5">Deshabilitar cuenta</h3>
          <p className="text-xs text-ink-500 mt-1">"{ws.name}" no podrá iniciar sesión hasta que la reactives. Los datos se conservan.</p>
        </header>
        <div className="p-5">
          <Field label="Motivo (opcional, se le muestra al usuario)">
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej: Período de prueba finalizado · Pago pendiente · A petición del titular"
              className="mt-1 w-full px-3 py-2 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700 resize-none"
            />
          </Field>
        </div>
        <footer className="p-4 border-t border-line-100 bg-bg-100/30 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-9 px-3 rounded-md border border-line-200 text-sm text-ink-700 hover:border-brand-400">Cancelar</button>
          <button type="submit" disabled={mu.isPending} className="h-9 px-4 rounded-md bg-risk-high text-primary-foreground text-sm font-medium hover:bg-risk-critical disabled:opacity-60 inline-flex items-center gap-2">
            {mu.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Deshabilitar
          </button>
        </footer>
      </form>
    </div>
  );
}

// ─── Detalle de un workspace ────────────────────────────────────────────────
function WorkspaceDetailView({ wsId, onBack }: { wsId: number; onBack: () => void }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["platform-workspace", wsId],
    queryFn: () => api.platformGetWorkspace(wsId),
  });

  return (
    <AppShell>
      <div className="space-y-6 max-w-4xl">
        <button onClick={onBack} className="text-sm text-brand-700 hover:underline inline-flex items-center gap-1">
          <ArrowLeft className="h-3.5 w-3.5" /> Volver al listado
        </button>

        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-ink-500"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : error || !data ? (
          <div className="text-center py-20"><AlertCircle className="h-8 w-8 mx-auto text-ink-400 mb-2" /><p className="text-ink-500">Workspace no encontrado.</p></div>
        ) : (
          <>
            <header>
              <p className="text-sm text-ink-500 inline-flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5" /> Plataforma
              </p>
              <h1 className="font-serif text-2xl md:text-[28px] leading-tight text-ink-900 mt-1 flex items-center gap-3 flex-wrap">
                {data.workspace.name}
                {data.workspace.disabledAt ? (
                  <span className="text-[11px] uppercase tracking-[0.06em] px-2 py-0.5 rounded-full font-medium bg-error-soft text-risk-high">Deshabilitada</span>
                ) : (
                  <span className="text-[11px] uppercase tracking-[0.06em] px-2 py-0.5 rounded-full font-medium bg-success-soft text-success">Activa</span>
                )}
              </h1>
              <p className="text-xs text-ink-500 mt-1">
                {data.workspace.mode === "organization" ? "Clínica con varios profesionales" : "Consulta individual"}
                {" · creada el "}{new Date(data.workspace.createdAt).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" })}
              </p>
            </header>

            <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard label="Pacientes activos" value={String(data.stats.patients_count)} hint={`${data.stats.patients_archived} archivados`} icon={<Users className="h-4 w-4" />} delta={{ neutral: true, value: "" }} />
              <KpiCard label="Documentos" value={String(data.stats.documents_count)} hint={`${data.stats.documents_signed} firmados`} icon={<FileText className="h-4 w-4" />} delta={{ neutral: true, value: "" }} />
              <KpiCard label="Citas totales" value={String(data.stats.appointments_total)} icon={<CalendarCheck2 className="h-4 w-4" />} delta={{ neutral: true, value: "" }} />
              <KpiCard label="Notas + tests" value={String(data.stats.notes_count + data.stats.tests_count)} hint={`${data.stats.tests_count} tests aplicados`} icon={<Activity className="h-4 w-4" />} delta={{ neutral: true, value: "" }} />
            </section>

            <section className="rounded-xl border border-line-200 bg-surface">
              <div className="px-5 py-3 border-b border-line-100">
                <h3 className="font-serif text-lg text-ink-900">Usuarios del workspace</h3>
              </div>
              <ul className="divide-y divide-line-100">
                {data.users.map((u) => (
                  <li key={u.id} className="px-5 py-3 flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-brand-50 text-brand-800 flex items-center justify-center text-xs font-semibold shrink-0">
                      {u.name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-ink-900 font-medium truncate">
                        {u.name}
                        {u.isPlatformAdmin && (
                          <span className="ml-2 text-[10px] uppercase tracking-[0.06em] px-1.5 py-0.5 rounded bg-lavender-100 text-lavender-500">Platform admin</span>
                        )}
                      </div>
                      <div className="text-[11px] text-ink-500 tabular truncate">
                        @{u.username} · {u.role} {u.email && `· ${u.email}`}
                      </div>
                    </div>
                    <div className="text-right text-[11px] text-ink-500 tabular shrink-0">
                      {u.lastLoginAt
                        ? <>Último login<br />{formatRelative(u.lastLoginAt)}</>
                        : <span className="text-ink-400">Nunca entró</span>}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-ink-700 mb-1.5">
        {label}{required && <span className="text-rose-700"> *</span>}
      </span>
      {children}
    </label>
  );
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return "ahora";
  if (diff < 3_600_000) return `hace ${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `hace ${Math.floor(diff / 3_600_000)}h`;
  if (diff < 7 * 86_400_000) return `hace ${Math.floor(diff / 86_400_000)}d`;
  return d.toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
}
