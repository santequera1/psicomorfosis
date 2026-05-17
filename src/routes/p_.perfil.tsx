import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Phone, Mail, MapPin, ShieldCheck, Pen, Trash2, Download, AlertTriangle, X, KeyRound, Eye, EyeOff, CheckCircle2 } from "lucide-react";
import { PortalShell } from "@/components/portal/PortalShell";
import { api, clearSession, refreshToken } from "@/lib/api";
import { useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/p_/perfil")({
  head: () => ({ meta: [{ title: "Mi perfil · Mi portal" }] }),
  component: PortalProfile,
});

function PortalProfile() {
  const qc = useQueryClient();
  const { data: me, isLoading } = useQuery({ queryKey: ["portal-me"], queryFn: () => api.portalMe() });

  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [preferredName, setPreferredName] = useState("");
  const [pronouns, setPronouns] = useState("");

  useEffect(() => {
    if (me?.patient) {
      setPhone(me.patient.phone ?? "");
      setEmail(me.patient.email ?? "");
      setAddress((me.patient as any).address ?? "");
      setPreferredName(me.patient.preferredName ?? "");
      setPronouns(me.patient.pronouns ?? "");
    }
  }, [me?.patient?.id]);

  const saveMu = useMutation({
    mutationFn: () => api.portalUpdateMe({ phone, email, address, preferred_name: preferredName, pronouns }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portal-me"] });
      toast.success("Perfil actualizado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !me) {
    return <PortalShell><Loader2 className="h-6 w-6 mx-auto animate-spin text-ink-400" /></PortalShell>;
  }

  return (
    <PortalShell>
      <header className="mb-8">
        <p className="text-xs uppercase tracking-widest text-brand-700 font-semibold">Tus datos</p>
        <h1 className="font-serif text-3xl text-ink-900 mt-1">Mi perfil</h1>
        <p className="text-sm text-ink-500 mt-2 max-w-xl">
          Mantén tus datos de contacto al día para que tu psicóloga pueda comunicarse contigo.
        </p>
      </header>

      <form
        onSubmit={(e) => { e.preventDefault(); saveMu.mutate(); }}
        className="rounded-2xl border border-line-200 bg-surface p-6 space-y-5"
      >
        <div className="flex items-center gap-4 pb-4 border-b border-line-100">
          <div className="h-16 w-16 rounded-full bg-brand-50 text-brand-700 text-xl font-serif flex items-center justify-center border-2 border-brand-100">
            {me.patient.name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase()}
          </div>
          <div className="min-w-0">
            <h2 className="font-serif text-xl text-ink-900 leading-tight">{me.patient.name}</h2>
            <p className="text-xs text-ink-500 mt-0.5">{me.patient.doc} · {me.patient.age} años</p>
          </div>
        </div>

        <Field label="Cómo te gusta que te llamen">
          <input
            value={preferredName}
            onChange={(e) => setPreferredName(e.target.value)}
            placeholder="Ej: Cami, Andrés, etc."
            className="w-full h-11 px-3 rounded-lg border border-line-200 bg-bg text-sm text-ink-900 focus:outline-none focus:border-brand-400"
          />
        </Field>

        <Field label="Pronombres">
          <select
            value={pronouns}
            onChange={(e) => setPronouns(e.target.value)}
            className="w-full h-11 px-3 rounded-lg border border-line-200 bg-bg text-sm text-ink-900 focus:outline-none focus:border-brand-400"
          >
            <option value="">— No especificar —</option>
            <option value="ella">ella</option>
            <option value="él">él</option>
            <option value="elle">elle</option>
          </select>
        </Field>

        <Field label="Teléfono" icon={<Phone className="h-3.5 w-3.5" />}>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+57 300 000 0000"
            className="w-full h-11 px-3 rounded-lg border border-line-200 bg-bg text-sm text-ink-900 focus:outline-none focus:border-brand-400"
          />
        </Field>

        <Field label="Correo electrónico" icon={<Mail className="h-3.5 w-3.5" />}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full h-11 px-3 rounded-lg border border-line-200 bg-bg text-sm text-ink-900 focus:outline-none focus:border-brand-400"
          />
        </Field>

        <Field label="Dirección" icon={<MapPin className="h-3.5 w-3.5" />}>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Ciudad, barrio, calle"
            className="w-full h-11 px-3 rounded-lg border border-line-200 bg-bg text-sm text-ink-900 focus:outline-none focus:border-brand-400"
          />
        </Field>

        <button
          type="submit"
          disabled={saveMu.isPending}
          className="w-full h-11 rounded-lg bg-brand-700 text-white text-sm font-medium hover:bg-brand-800 disabled:opacity-50 inline-flex items-center justify-center gap-2"
        >
          {saveMu.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Guardar cambios
        </button>
      </form>

      <SignatureSection />

      <ChangePasswordSection />

      {me.professional && (
        <div className="mt-6 rounded-xl border border-line-200 bg-surface p-5">
          <p className="text-xs uppercase tracking-widest text-ink-500 font-medium">Tu psicóloga</p>
          <h3 className="font-serif text-lg text-ink-900 mt-1">{me.professional.name}</h3>
          {me.professional.title && <p className="text-sm text-ink-500">{me.professional.title}</p>}
        </div>
      )}

      <DataRightsSection />

      <div className="mt-6 rounded-xl border border-line-200 bg-surface p-5 flex items-start gap-3">
        <ShieldCheck className="h-5 w-5 text-sage-500 shrink-0 mt-0.5" />
        <p className="text-xs text-ink-500 leading-relaxed">
          Tu información está protegida según la Ley 1581/2012 de Habeas Data.
          Solo tú y tu psicóloga pueden ver estos datos.
        </p>
      </div>
    </PortalShell>
  );
}

/**
 * Sección "Tus derechos sobre tus datos" — implementa los derechos del
 * titular según Ley 1581/2012:
 *   - art. 8 lit. b: derecho de acceso → botón "Descargar mis datos"
 *   - art. 8 lit. e: derecho de supresión → botón "Eliminar mi cuenta"
 *
 * El derecho de supresión SOLO aplica a la cuenta de acceso al portal. La
 * historia clínica está sujeta a Resolución 1995/1999 (conservación 15
 * años obligatoria) y se solicita aparte a la psicóloga directamente.
 */
function DataRightsSection() {
  const navigate = useNavigate();
  const [exporting, setExporting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      await api.portalExportMyData();
      toast.success("Tus datos se descargaron como archivo JSON");
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo exportar");
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <div className="mt-6 rounded-xl border border-line-200 bg-surface p-5">
        <p className="text-xs uppercase tracking-widest text-ink-500 font-medium">Tus derechos</p>
        <h3 className="font-serif text-lg text-ink-900 mt-1">Sobre tus datos</h3>
        <p className="text-xs text-ink-500 mt-1 leading-relaxed">
          La Ley 1581/2012 de Habeas Data te garantiza acceso y control sobre tu información.
        </p>

        <div className="mt-4 space-y-3">
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="w-full inline-flex items-center justify-between gap-3 h-12 px-4 rounded-lg border border-line-200 bg-bg-50/30 hover:border-brand-400 disabled:opacity-50"
          >
            <span className="flex items-center gap-2 text-sm text-ink-900">
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4 text-brand-700" />}
              Descargar mis datos
            </span>
            <span className="text-[11px] text-ink-500">JSON</span>
          </button>

          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            className="w-full inline-flex items-center justify-between gap-3 h-12 px-4 rounded-lg border border-rose-200/60 bg-rose-50/40 hover:border-rose-400 text-rose-700"
          >
            <span className="flex items-center gap-2 text-sm">
              <Trash2 className="h-4 w-4" />
              Eliminar mi cuenta del portal
            </span>
            <span className="text-[11px] text-rose-700/70">Irreversible</span>
          </button>
        </div>
      </div>

      {deleteOpen && (
        <DeleteAccountModal
          onClose={() => setDeleteOpen(false)}
          onDeleted={() => {
            // Sesión muerta server-side; limpiamos local y navegamos al login.
            clearSession();
            navigate({ to: "/p/login", replace: true });
          }}
        />
      )}
    </>
  );
}

function DeleteAccountModal({ onClose, onDeleted }: { onClose: () => void; onDeleted: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const mu = useMutation({
    mutationFn: () => api.portalDeleteMyAccount({
      current_password: password,
      confirm_text: confirm,
    }),
    onSuccess: (res) => {
      toast.success(res.message ?? "Cuenta eliminada");
      onDeleted();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canSubmit = confirm === "ELIMINAR" && password.length > 0 && !mu.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink-900/50 backdrop-blur-sm p-0 sm:p-4" onClick={onClose}>
      <div
        className="w-full sm:max-w-md bg-surface rounded-t-2xl sm:rounded-2xl shadow-modal max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-4 border-b border-line-100 flex items-start justify-between">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-rose-700 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-serif text-lg text-ink-900">Eliminar mi cuenta del portal</h3>
              <p className="text-xs text-ink-500 mt-1">Esta acción es irreversible.</p>
            </div>
          </div>
          <button onClick={onClose} className="h-9 w-9 rounded-md hover:bg-bg-100 text-ink-500 flex items-center justify-center shrink-0">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="px-5 py-4 space-y-4">
          <div className="rounded-lg border border-rose-200/60 bg-rose-50/30 p-3 text-xs text-ink-700 leading-relaxed">
            <p className="font-medium text-rose-800 mb-1">Qué pasará si confirmas:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>Perderás acceso al portal — no podrás volver a iniciar sesión.</li>
              <li>Cualquier invitación pendiente quedará invalidada.</li>
              <li>Tu psicóloga será notificada de tu decisión.</li>
            </ul>
          </div>
          <div className="rounded-lg border border-line-200 bg-bg-50/40 p-3 text-xs text-ink-700 leading-relaxed">
            <p className="font-medium mb-1">Qué NO se elimina:</p>
            <p>
              Tu historia clínica (notas, diagnósticos, evaluaciones) permanece archivada con tu psicóloga por imperativo de la <strong>Resolución 1995/1999</strong> (mínimo 15 años de retención). Si quieres ejercer derecho de supresión sobre los datos clínicos también, pídeselo directamente a tu psicóloga.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-700 mb-1.5">Tu contraseña actual</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full h-11 px-3 rounded-lg border border-line-200 bg-bg text-sm text-ink-900 focus:outline-none focus:border-brand-400"
              placeholder="Para confirmar tu identidad"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-700 mb-1.5">
              Escribe <code className="font-mono px-1.5 py-0.5 rounded bg-bg-100 text-rose-700">ELIMINAR</code> para confirmar
            </label>
            <input
              type="text"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="off"
              className="w-full h-11 px-3 rounded-lg border border-line-200 bg-bg text-sm text-ink-900 font-mono focus:outline-none focus:border-rose-400"
              placeholder="ELIMINAR"
            />
          </div>
        </div>

        <footer className="px-5 py-4 border-t border-line-100 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-10 px-4 rounded-lg border border-line-200 text-sm text-ink-700 hover:border-brand-400"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => mu.mutate()}
            disabled={!canSubmit}
            className="h-10 px-4 rounded-lg bg-rose-600 text-white text-sm font-medium hover:bg-rose-700 disabled:opacity-50 inline-flex items-center gap-2"
          >
            {mu.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Eliminar mi cuenta
          </button>
        </footer>
      </div>
    </div>
  );
}

function Field({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-ink-700 mb-1.5 inline-flex items-center gap-1.5">
        {icon} {label}
      </span>
      {children}
    </label>
  );
}

/**
 * Sección "Cambiar contraseña": permite al paciente cambiar su propia
 * contraseña sin pasar por el flujo de reset del psicólogo. Requiere la
 * contraseña actual para evitar que un token comprometido la cambie sin
 * conocer la actual. El endpoint /api/auth/change-password ya soporta
 * pacientes (usa requireAuth genérico).
 *
 * Tras el cambio el backend invalida los tokens viejos y emite uno nuevo
 * para que el mismo browser no necesite re-login.
 */
function ChangePasswordSection() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [done, setDone] = useState(false);

  const matches = next.length > 0 && next === confirm;
  const canSubmit = current.length > 0 && next.length >= 8 && matches && next !== current;

  const mu = useMutation({
    mutationFn: () => api.changePassword({ current_password: current, new_password: next }),
    onSuccess: (res) => {
      if (res.token) refreshToken(res.token);
      setCurrent(""); setNext(""); setConfirm("");
      setDone(true);
      toast.success("Contraseña actualizada");
      setTimeout(() => setDone(false), 4000);
    },
    onError: (e: any) => {
      toast.error(e?.message ?? "No se pudo cambiar la contraseña");
    },
  });

  return (
    <div className="mt-6 rounded-xl border border-line-200 bg-surface p-5">
      <div className="flex items-start gap-3">
        <KeyRound className="h-5 w-5 text-brand-700 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <h3 className="font-serif text-lg text-ink-900">Cambiar contraseña</h3>
          <p className="text-xs text-ink-500 mt-0.5 leading-relaxed">
            Usa una contraseña que solo tú conozcas. Mínimo 8 caracteres.
          </p>

          <form
            onSubmit={(e) => { e.preventDefault(); if (canSubmit) mu.mutate(); }}
            className="mt-4 space-y-3"
          >
            <div>
              <label className="block text-xs font-medium text-ink-700 mb-1.5">Contraseña actual</label>
              <div className="relative">
                <input
                  type={showCurrent ? "text" : "password"}
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                  className="w-full h-10 px-3 pr-10 rounded-lg border border-line-200 bg-bg text-sm text-ink-900 focus:outline-none focus:border-brand-400"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 rounded text-ink-500 hover:bg-bg-100 inline-flex items-center justify-center"
                  tabIndex={-1}
                  aria-label={showCurrent ? "Ocultar contraseña" : "Mostrar contraseña"}
                >
                  {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-ink-700 mb-1.5">Contraseña nueva</label>
              <div className="relative">
                <input
                  type={showNext ? "text" : "password"}
                  value={next}
                  onChange={(e) => setNext(e.target.value)}
                  minLength={8}
                  placeholder="Mínimo 8 caracteres"
                  className="w-full h-10 px-3 pr-10 rounded-lg border border-line-200 bg-bg text-sm text-ink-900 focus:outline-none focus:border-brand-400"
                  required
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowNext((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 rounded text-ink-500 hover:bg-bg-100 inline-flex items-center justify-center"
                  tabIndex={-1}
                  aria-label={showNext ? "Ocultar contraseña" : "Mostrar contraseña"}
                >
                  {showNext ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-ink-700 mb-1.5">Confirma la nueva</label>
              <input
                type={showNext ? "text" : "password"}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                minLength={8}
                className={
                  "w-full h-10 px-3 rounded-lg border bg-bg text-sm text-ink-900 focus:outline-none " +
                  (confirm.length > 0 && !matches
                    ? "border-rose-400 focus:border-rose-500"
                    : "border-line-200 focus:border-brand-400")
                }
                required
                autoComplete="new-password"
              />
              {confirm.length > 0 && !matches && (
                <p className="text-xs text-rose-700 mt-1">Las contraseñas no coinciden.</p>
              )}
              {next.length > 0 && next === current && (
                <p className="text-xs text-rose-700 mt-1">La nueva debe ser distinta de la actual.</p>
              )}
            </div>

            <button
              type="submit"
              disabled={!canSubmit || mu.isPending}
              className="h-10 px-4 rounded-lg bg-brand-700 text-white text-sm font-medium hover:bg-brand-800 disabled:opacity-50 inline-flex items-center gap-2"
            >
              {mu.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Actualizar contraseña
            </button>

            {done && (
              <p className="inline-flex items-center gap-1.5 text-xs text-success font-medium mt-1">
                <CheckCircle2 className="h-3.5 w-3.5" /> Contraseña actualizada correctamente
              </p>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}

/**
 * Sección "Mi firma": muestra preview de la firma guardada (si existe) y
 * permite borrarla. Si no hay firma guardada, muestra mensaje informativo
 * — la firma se crea automáticamente la primera vez que el paciente firma
 * un documento desde el portal con el toggle "Guardar firma" activado.
 */
function SignatureSection() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["portal-my-signature"],
    queryFn: () => api.portalGetMySignature(),
  });

  const deleteMu = useMutation({
    mutationFn: () => api.portalDeleteMySignature(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portal-my-signature"] });
      toast.success("Firma eliminada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return null;
  const sig = data?.signature_url ?? null;

  return (
    <div className="mt-6 rounded-xl border border-line-200 bg-surface p-5">
      <div className="flex items-start gap-3">
        <Pen className="h-5 w-5 text-brand-700 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <h3 className="font-serif text-lg text-ink-900">Mi firma</h3>
          <p className="text-xs text-ink-500 mt-0.5 leading-relaxed">
            Cuando firmes un documento desde el portal, puedes guardar tu firma para no tener que dibujarla cada vez. La firma se aplica con la misma validez legal.
          </p>
          {sig ? (
            <div className="mt-4 space-y-3">
              <div className="rounded-lg border border-line-200 bg-white p-3 inline-block">
                <img src={sig} alt="Tu firma guardada" className="h-20 max-w-70 object-contain" />
              </div>
              <button
                type="button"
                onClick={() => {
                  if (confirm("¿Eliminar tu firma guardada? Tendrás que dibujarla la próxima vez que firmes un documento.")) {
                    deleteMu.mutate();
                  }
                }}
                disabled={deleteMu.isPending}
                className="h-9 px-3 rounded-md border border-line-200 text-xs text-ink-700 hover:border-rose-400 hover:text-rose-700 inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                {deleteMu.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                Eliminar firma guardada
              </button>
            </div>
          ) : (
            <p className="mt-3 text-xs text-ink-400 italic">
              Aún no tienes firma guardada. Aparecerá aquí la primera vez que firmes un documento con la opción de guardar activada.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
