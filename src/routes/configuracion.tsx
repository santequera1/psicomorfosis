import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { LegalAdminShell } from "./legal-admin";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  User, Bell, Shield, Palette, Building2, Users2, Globe, ChevronRight,
  Check, X, Plus, MapPin,
  Circle, Home, Loader2, Trash2, Edit3, AlertCircle, GraduationCap, RotateCcw,
  ShieldAlert, Clock, ArrowLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api, type Sede, type Professional, type WorkspaceMode, getStoredUser, setSession, getToken, clearSession } from "@/lib/api";
import { useWorkspace } from "@/lib/workspace";
import { resetAllTours } from "@/lib/tour";
import {
  applyTheme,
  getTheme as getThemeMode,
  setTheme as setThemeMode,
  getThemeFamily,
  setThemeFamily,
  getFontFamily,
  setFontFamily,
  THEME_FAMILIES,
  FONT_FAMILIES,
  type ThemePreference,
  type ThemeFamily,
  type FontFamily,
} from "@/lib/theme";

export const Route = createFileRoute("/configuracion")({
  head: () => ({ meta: [{ title: "Configuración — Psicomorfosis" }] }),
  component: ConfiguracionPage,
});

const SECCIONES = [
  { id: "perfil",       label: "Perfil profesional", icon: User,         desc: "Datos personales y credenciales" },
  { id: "horario",      label: "Horario de atención", icon: Clock,       desc: "Días y horas en que atiendes pacientes" },
  { id: "workspace",    label: "Workspace",          icon: Home,         desc: "Modo individual u organización" },
  { id: "sedes",        label: "Sedes",              icon: Building2,    desc: "Consultorios y ubicaciones" },
  { id: "equipo",       label: "Equipo",             icon: Users2,       desc: "Profesionales del workspace" },
  { id: "notificaciones", label: "Notificaciones",   icon: Bell,         desc: "Canales y preferencias de aviso" },
  { id: "seguridad",    label: "Seguridad",          icon: Shield,       desc: "Contraseña, 2FA, sesiones activas" },
  { id: "apariencia",   label: "Apariencia",         icon: Palette,      desc: "Tema, densidad y tipografía" },
  { id: "integraciones",label: "Integraciones",      icon: Globe,        desc: "Calendario, video y mensajería" },
  { id: "tutoriales",   label: "Tutoriales",         icon: GraduationCap, desc: "Reiniciar los tours guiados" },
  { id: "cuenta",       label: "Mi cuenta",          icon: ShieldAlert,  desc: "Eliminar cuenta y exportar datos" },
];

function ConfiguracionPage() {
  const [user] = useState(() => getStoredUser());
  const isLegal = !!user?.isLegalAdmin;

  // Para la asesora legal mostramos solo lo que aplica a su rol:
  // apariencia (claro/oscuro/tipografía), seguridad (cambiar contraseña)
  // y mi cuenta (eliminar cuenta + derechos Habeas Data). Las pestañas
  // clínicas (Perfil profesional, Workspace, Sedes, Equipo, Notificaciones,
  // Integraciones, Tutoriales) no aplican porque su workspace es virtual
  // y no tiene pacientes.
  const SECCIONES_LEGAL_IDS = new Set(["apariencia", "seguridad", "cuenta"]);

  // Patrón "lista → detalle" inspirado en iOS/Android Settings:
  //   - Mobile (< md): `active === null` muestra la lista vertical de
  //     secciones. Tocar una pone su id en active y se ve solo el
  //     panel a pantalla completa con botón "← Configuración".
  //   - Desktop (md+): el sidebar siempre visible a la izquierda y el
  //     panel a la derecha. Si `active` es null, mostramos un panel
  //     por defecto (perfil para psicólogos, apariencia para legal).
  //
  // Reemplaza el scroll horizontal anterior, que era invisible para
  // muchos usuarios y dejaba opciones escondidas en mobile.
  const defaultActive = isLegal ? "apariencia" : "perfil";
  const [active, setActive] = useState<string | null>(null);
  const { data: workspace } = useWorkspace();
  const isOrg = workspace?.mode === "organization";

  // Filtrado:
  //   - legal_admin: solo apariencia/seguridad/cuenta
  //   - psicólogo modo individual: oculta Sedes (no aplica)
  const secciones = SECCIONES.filter((s) => {
    if (isLegal) return SECCIONES_LEGAL_IDS.has(s.id);
    if (s.id === "sedes" && !isOrg) return false;
    return true;
  });

  // Lo que efectivamente se renderiza en el panel principal. En mobile
  // sin selección, no hay panel (se ve la lista); en desktop sin
  // selección, fallback al default.
  const effectiveActive = active ?? defaultActive;
  const activeSection = secciones.find((s) => s.id === effectiveActive);

  // Map id → componente, para no repetir el switch entre mobile y desktop.
  const renderPanel = () => {
    switch (effectiveActive) {
      case "perfil":         return <PerfilPanel />;
      case "horario":        return <HorarioPanel />;
      case "workspace":      return <WorkspacePanel />;
      case "sedes":          return <SedesPanel />;
      case "equipo":         return <EquipoPanel />;
      case "notificaciones": return <NotifPanel />;
      case "seguridad":      return <SeguridadPanel />;
      case "apariencia":     return <AparienciaPanel />;
      case "integraciones":  return <IntegracionesPanel />;
      case "tutoriales":     return <TutorialesPanel />;
      case "cuenta":         return <CuentaPanel />;
      default:               return null;
    }
  };

  const body = (
    <div className={isLegal ? "" : "max-w-[1180px] mx-auto"}>
      {/* Botón "Volver" solo en mobile cuando hay sección activa.
          En desktop el sidebar siempre está, no hace falta. Le damos
          peso visual (chip con borde + bg + texto medio) porque era
          fácil pasarlo por alto cuando se camuflaba con el título. */}
      {active && (
        <button
          onClick={() => setActive(null)}
          className="md:hidden inline-flex items-center gap-2 text-sm font-medium text-ink-900 mb-4 px-3 py-2 rounded-lg border border-line-200 bg-surface shadow-xs hover:border-brand-400 hover:bg-brand-50/40 hover:text-brand-800 active:scale-95 transition-all"
        >
          <ArrowLeft className="h-4 w-4" />
          Configuración
        </button>
      )}

      {!isLegal && (
        <header className="mb-5 sm:mb-7">
          {/* Eyebrow: oculto en mobile cuando hay sección activa
              (ya tienes el botón Volver arriba y el contexto está claro). */}
          <div className={cn(
            "text-xs uppercase tracking-[0.14em] text-brand-700 font-semibold",
            active && "hidden md:block",
          )}>
            Ajustes · {workspace?.name ?? "Workspace"}
          </div>
          <h1 className="font-serif text-2xl md:text-3xl text-ink-900 mt-1">
            {/* En mobile con sección activa muestra el nombre de la sección;
                en desktop o sin sección activa, "Configuración". */}
            <span className="md:hidden">{active ? activeSection?.label ?? "Configuración" : "Configuración"}</span>
            <span className="hidden md:inline">Configuración</span>
          </h1>
          <p className={cn(
            "text-sm text-ink-500 mt-1",
            active && "hidden md:block",
          )}>
            Modo <span className="font-medium text-ink-900">{isOrg ? "Organización" : "Individual"}</span>
          </p>
        </header>
      )}

      {/* ── Vista mobile lista (solo cuando !active) ───────────────── */}
      {!active && (
        <div className="md:hidden flex flex-col gap-2">
          {secciones.map((s) => {
            const Icon = s.icon;
            return (
              <button
                key={s.id}
                onClick={() => setActive(s.id)}
                className="w-full bg-surface border border-line-200 rounded-xl p-4 flex items-center gap-3 hover:border-brand-400 transition-colors shadow-xs text-left active:scale-[0.99]"
              >
                <div className="h-10 w-10 rounded-lg bg-brand-100 text-brand-700 flex items-center justify-center shrink-0">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-ink-900 leading-tight">{s.label}</div>
                  <div className="text-xs text-ink-500 mt-0.5 truncate">{s.desc}</div>
                </div>
                <ChevronRight className="h-4 w-4 text-ink-400 shrink-0" />
              </button>
            );
          })}
        </div>
      )}

      {/* ── Vista detalle (mobile con active + siempre en desktop) ─── */}
      <div className={cn(
        "grid grid-cols-1 md:grid-cols-[260px_1fr] gap-4 md:gap-6",
        !active && "hidden md:grid",
      )}>
        {/* Sidebar: oculto en mobile (en mobile usa la vista lista).
            En desktop es sticky a la izquierda. */}
        <aside className="hidden md:block md:rounded-xl md:bg-surface md:border md:border-line-200 md:shadow-soft md:p-2 md:h-fit md:sticky md:top-20">
          <div className="flex flex-col gap-0.5">
            {secciones.map((s) => {
              const Icon = s.icon;
              const isActive = effectiveActive === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => setActive(s.id)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors w-full text-left",
                    isActive ? "bg-brand-100 text-brand-800" : "text-ink-700 hover:bg-bg-100",
                  )}
                >
                  <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-brand-700" : "text-ink-400")} />
                  <span className="flex-1">{s.label}</span>
                  {isActive && <ChevronRight className="h-4 w-4 text-brand-700" />}
                </button>
              );
            })}
          </div>
        </aside>

        <main className="rounded-xl bg-surface border border-line-200 shadow-soft p-4 sm:p-6 md:p-7">
          {renderPanel()}
        </main>
      </div>
    </div>
  );

  // La asesora legal ve la configuración dentro de SU shell (sin sidebar
  // clínico ni topbar de pacientes). El resto de los usuarios usa AppShell.
  if (isLegal) {
    return (
      <LegalAdminShell title="Configuración" subtitle="Personaliza apariencia, seguridad y datos de tu cuenta.">
        {body}
      </LegalAdminShell>
    );
  }

  return <AppShell>{body}</AppShell>;
}


function PerfilPanel() {
  const qc = useQueryClient();
  const { data: workspace } = useWorkspace();
  const isOrg = workspace?.mode === "organization";

  // El profesional "principal" del workspace individual es el primero
  const mainProf = workspace?.professionals?.[0];

  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: () => api.getSettings() });

  const [profForm, setProfForm] = useState<{ name: string; title: string; email: string; phone: string; approach: string }>({
    name: "", title: "", email: "", phone: "", approach: "",
  });
  const [consultorio, setConsultorio] = useState<{ consultorio_name: string; address: string; phone: string; city: string; tarifa_sesion: string }>({
    consultorio_name: "", address: "", phone: "", city: "", tarifa_sesion: "",
  });
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Cargar del backend una vez
  useEffect(() => {
    if (mainProf && !loaded) {
      setProfForm({
        name: mainProf.name ?? "",
        title: mainProf.title ?? "",
        email: mainProf.email ?? "",
        phone: mainProf.phone ?? "",
        approach: mainProf.approach ?? "",
      });
    }
    if (settings && !loaded) {
      setConsultorio({
        consultorio_name: settings.consultorio_name ?? "",
        address: settings.address ?? "",
        phone: settings.phone ?? "",
        city: settings.city ?? "Bogotá",
        tarifa_sesion: settings.tarifa_sesion ?? "",
      });
      setLoaded(true);
    }
  }, [mainProf, settings, loaded]);

  const profMu = useMutation({
    mutationFn: async () => {
      if (!mainProf) throw new Error("Sin profesional principal");
      return api.updateProfessional(mainProf.id, profForm);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workspace"] });
      qc.invalidateQueries({ queryKey: ["professionals"] });
      setSavedAt(new Date().toLocaleTimeString("es-CO"));
    },
  });

  const consMu = useMutation({
    mutationFn: () => api.updateSettings(consultorio),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] });
      setSavedAt(new Date().toLocaleTimeString("es-CO"));
    },
  });

  const initials = profForm.name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase() || "?";

  return (
    <>
      <SectionHeader title="Perfil profesional" desc="Información visible para pacientes y colegas." />
      <div className="flex items-center gap-5 mb-7 pb-7 border-b border-line-100">
        <div className="h-20 w-20 rounded-2xl bg-brand-100 text-brand-800 flex items-center justify-center text-2xl font-serif">{initials}</div>
        <div>
          <p className="text-sm text-ink-700 font-medium">{initials !== "—" ? "Tus iniciales" : "Sin foto de perfil"}</p>
          <p className="text-xs text-ink-500 mt-1">Por ahora se muestran tus iniciales en lugar de una foto.</p>
        </div>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); profMu.mutate(); }}
        className="space-y-5"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
          <LabeledInput label="Nombre completo" value={profForm.name} onChange={(v) => setProfForm((p) => ({ ...p, name: v }))} />
          <LabeledInput label="Título profesional" value={profForm.title} onChange={(v) => setProfForm((p) => ({ ...p, title: v }))} />
          <LabeledInput label="Enfoque terapéutico" value={profForm.approach} onChange={(v) => setProfForm((p) => ({ ...p, approach: v }))} />
          <LabeledInput label="Correo profesional" type="email" value={profForm.email} onChange={(v) => setProfForm((p) => ({ ...p, email: v }))} />
          <LabeledInput label="Teléfono" value={profForm.phone} onChange={(v) => setProfForm((p) => ({ ...p, phone: v }))} />
        </div>
        <div className="flex justify-end gap-3">
          <button type="submit" disabled={profMu.isPending} className="h-10 px-5 rounded-lg bg-brand-700 text-primary-foreground text-sm hover:bg-brand-800 disabled:opacity-60 inline-flex items-center gap-2">
            {profMu.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Guardar perfil
          </button>
        </div>
      </form>

      {!isOrg && (
        <>
          <div className="mt-10 pt-8 border-t border-line-100">
            <SectionHeader title="Mi consultorio" desc="Datos del lugar donde atiendes. Aparecerán en la agenda, documentos y facturas." />
            <form
              onSubmit={(e) => { e.preventDefault(); consMu.mutate(); }}
              className="space-y-5"
            >
              <LabeledInput label="Nombre del consultorio" placeholder="Consultorio Psic. Nathaly Ferrer" value={consultorio.consultorio_name} onChange={(v) => setConsultorio((p) => ({ ...p, consultorio_name: v }))} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
                <LabeledInput label="Dirección" placeholder="Cra 15 # 93-10, Oficina 402" value={consultorio.address} onChange={(v) => setConsultorio((p) => ({ ...p, address: v }))} />
                <LabeledInput label="Ciudad" placeholder="Bogotá" value={consultorio.city} onChange={(v) => setConsultorio((p) => ({ ...p, city: v }))} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
                <LabeledInput label="Teléfono del consultorio" placeholder="+57 1 555 1200" value={consultorio.phone} onChange={(v) => setConsultorio((p) => ({ ...p, phone: v }))} />
                {/* Tarifa por sesión: la usan las plantillas de "Contrato terapéutico"
                    como {{clinica.tarifa}}. Si queda vacía, las plantillas muestran
                    el chip amarillo (variable sin valor). */}
                <LabeledInput label="Tarifa por sesión (COP)" placeholder="120000" value={consultorio.tarifa_sesion} onChange={(v) => setConsultorio((p) => ({ ...p, tarifa_sesion: v }))} />
              </div>
              <div className="flex justify-end">
                <button type="submit" disabled={consMu.isPending} className="h-10 px-5 rounded-lg bg-brand-700 text-primary-foreground text-sm hover:bg-brand-800 disabled:opacity-60 inline-flex items-center gap-2">
                  {consMu.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Guardar consultorio
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {savedAt && (
        <p className="mt-4 text-xs text-success flex items-center gap-1"><Check className="h-3.5 w-3.5" /> Guardado a las {savedAt}</p>
      )}
    </>
  );
}

function LabeledInput({ label, value, onChange, type = "text", placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <label className="block">
      <div className="text-xs font-medium text-ink-700 mb-1.5">{label}</div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-10 px-3.5 rounded-lg border border-line-200 bg-bg-50 text-sm text-ink-900 focus:outline-none focus:border-brand-400 focus:bg-surface"
      />
    </label>
  );
}

function Toggle({ label, desc, on = false, comingSoon = false }: {
  label: string; desc: string; on?: boolean; comingSoon?: boolean;
}) {
  const [v, setV] = useState(on);
  return (
    <div className="flex items-start justify-between gap-3 py-4 border-b border-line-100 last:border-0">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-ink-900">{label}</div>
        <div className="text-xs text-ink-500 mt-0.5">{desc}</div>
      </div>
      {comingSoon ? (
        <span className="shrink-0 mt-0.5 inline-flex items-center gap-1 text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full font-medium bg-brand-50 text-brand-800">
          <Circle className="h-2.5 w-2.5" /> Próximamente
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setV(!v)}
          aria-checked={v}
          role="switch"
          className={cn(
            "shrink-0 mt-0.5 relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
            v ? "bg-brand-700" : "bg-line-200"
          )}
        >
          <span className={cn(
            "inline-block h-5 w-5 rounded-full bg-surface shadow-soft transition-transform",
            v ? "translate-x-5" : "translate-x-0.5"
          )} />
        </button>
      )}
    </div>
  );
}

function NotifPanel() {
  // Por ahora todas las notificaciones se muestran como "Próximamente" — la
  // infraestructura de envío (email/WhatsApp/push) aún no está cableada al
  // backend. Se quitó "Mensajes de pacientes" porque la app no tiene chat.
  return (
    <>
      <SectionHeader title="Notificaciones" desc="Elige qué eventos quieres recibir y por qué canal." />
      <Toggle label="Recordatorio de citas" desc="Recibirás un aviso 1h antes de cada sesión." comingSoon />
      <Toggle label="Alertas de riesgo clínico" desc="Notificación inmediata ante banderas críticas." comingSoon />
      <Toggle label="Resumen diario" desc="Cada mañana, panorama de tu agenda." comingSoon />
      <Toggle label="Pagos recibidos" desc="Avisos cuando un paciente confirma pago." comingSoon />
    </>
  );
}

function SeguridadPanel() {
  const [pwOpen, setPwOpen] = useState(false);
  const [credsOpen, setCredsOpen] = useState(false);
  const me = getStoredUser();
  return (
    <>
      <SectionHeader title="Seguridad" desc="Cuida el acceso a información clínica protegida." />

      {/* Datos de acceso: username + email del login */}
      <div className="rounded-xl border border-line-200 bg-surface p-5 mb-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-medium text-ink-900">Datos de acceso</h3>
            <p className="text-xs text-ink-500 mt-1">
              Tu usuario y correo de inicio de sesión. Puedes ingresar con cualquiera de los dos.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCredsOpen(true)}
            className="h-9 px-3 rounded-lg border border-line-200 text-ink-700 text-xs hover:border-brand-400 inline-flex items-center gap-1.5"
          >
            <Edit3 className="h-3.5 w-3.5" /> Cambiar
          </button>
        </div>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-ink-500 font-medium mb-0.5">Usuario</div>
            <div className="text-ink-900 font-mono text-xs">{me?.username ?? "—"}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-ink-500 font-medium mb-0.5">Correo</div>
            <div className="text-ink-900 break-all">{me?.email ?? "—"}</div>
          </div>
        </div>
      </div>

      <Toggle label="Autenticación de dos factores (2FA)" desc="Recomendado para roles clínicos y administrativos." comingSoon />
      <Toggle label="Cierre automático de sesión" desc="Tras 30 min de inactividad." comingSoon />
      <Toggle label="Notificar nuevos inicios de sesión" desc="Recibe correo si se accede desde un dispositivo nuevo." comingSoon />
      <div className="mt-6">
        <button
          type="button"
          onClick={() => setPwOpen(true)}
          className="h-10 px-5 rounded-lg border border-line-200 bg-surface text-sm text-ink-700 hover:border-brand-400"
        >
          Cambiar contraseña
        </button>
      </div>
      {pwOpen && <ChangePasswordModal onClose={() => setPwOpen(false)} />}
      {credsOpen && <ChangeCredentialsModal onClose={() => setCredsOpen(false)} />}
    </>
  );
}

/**
 * Modal para que el psicólogo cambie su username y/o correo de login.
 * Diseño en dos pasos visuales (no separados, solo organizados):
 *  1) Edita los campos. Disponibilidad se valida con debounce (350ms)
 *     contra GET /api/auth/check-availability — feedback en línea.
 *  2) Confirma con su contraseña actual antes de guardar (mismo
 *     razonamiento de seguridad que change-password).
 *
 * Tras guardar, refresca el localStorage con el user nuevo Y el token
 * (porque el JWT carga username); las próximas requests usan el JWT
 * actualizado sin re-login.
 */
function ChangeCredentialsModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const me = getStoredUser();
  const [username, setUsername] = useState(me?.username ?? "");
  const [email, setEmail] = useState(me?.email ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Disponibilidad con debounce. Solo verificamos si el valor cambió
  // respecto al que ya tiene el user — evita marcar su propio username
  // como "ya en uso".
  const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "available" | "taken" | "invalid">("idle");
  const [emailStatus, setEmailStatus] = useState<"idle" | "checking" | "available" | "taken" | "invalid">("idle");

  useEffect(() => {
    const trimmed = username.trim();
    if (!trimmed || trimmed.toLowerCase() === (me?.username ?? "").toLowerCase()) {
      setUsernameStatus("idle"); return;
    }
    setUsernameStatus("checking");
    const t = setTimeout(async () => {
      try {
        const r = await api.checkAvailability({ username: trimmed, excludeId: me?.id });
        if (r.usernameError) setUsernameStatus("invalid");
        else setUsernameStatus(r.usernameAvailable ? "available" : "taken");
      } catch { setUsernameStatus("idle"); }
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  useEffect(() => {
    const trimmed = email.trim();
    if (!trimmed || trimmed.toLowerCase() === (me?.email ?? "").toLowerCase()) {
      setEmailStatus("idle"); return;
    }
    setEmailStatus("checking");
    const t = setTimeout(async () => {
      try {
        const r = await api.checkAvailability({ email: trimmed, excludeId: me?.id });
        if (r.emailError) setEmailStatus("invalid");
        else setEmailStatus(r.emailAvailable ? "available" : "taken");
      } catch { setEmailStatus("idle"); }
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email]);

  const usernameChanged = username.trim() !== (me?.username ?? "");
  const emailChanged = email.trim() !== (me?.email ?? "");
  const hasChanges = usernameChanged || emailChanged;
  const usernameOk = !usernameChanged || usernameStatus === "available" || usernameStatus === "idle";
  const emailOk = !emailChanged || emailStatus === "available" || emailStatus === "idle";
  const canSubmit = hasChanges && usernameOk && emailOk && currentPassword.length > 0 && !submitting;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.updateCredentials({
        current_password: currentPassword,
        username: usernameChanged ? username.trim() : undefined,
        email: emailChanged ? email.trim() : undefined,
      });
      if (res.token && res.user) {
        // Refrescar token + user en localStorage. El JWT viejo
        // contenía el username anterior; el backend acaba de emitir
        // uno nuevo con el username actualizado.
        setSession(res.token, res.user);
      } else {
        // Sin cambios efectivos en BD pero la respuesta es OK —
        // refresca /me por si cambió algo ortogonal.
        const tok = getToken();
        if (tok) {
          const fresh = await api.me().catch(() => null);
          if (fresh?.user) setSession(tok, fresh.user);
        }
      }
      qc.invalidateQueries();
      toast.success("Datos de acceso actualizados");
      onClose();
    } catch (err: any) {
      setError(err?.message ?? "No se pudo actualizar");
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 backdrop-blur-sm p-4" onClick={onClose}>
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-2xl bg-surface shadow-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="p-5 border-b border-line-100 flex items-start justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-brand-700 font-medium">Datos de acceso</p>
            <h3 className="font-serif text-xl text-ink-900 mt-0.5">Cambiar usuario o correo</h3>
            <p className="text-xs text-ink-500 mt-1">Confirma con tu contraseña actual al final.</p>
          </div>
          <button type="button" onClick={onClose} className="h-9 w-9 rounded-md border border-line-200 text-ink-500 hover:border-brand-400 flex items-center justify-center" disabled={submitting}>
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="p-5 space-y-4">
          <CredentialField
            label="Usuario"
            hint="3-50 caracteres. Letras, números, punto, guion bajo y guion. Empieza con letra."
            value={username}
            onChange={setUsername}
            status={usernameStatus}
            takenMessage="Ese usuario ya está en uso."
            invalidMessage="Formato no válido."
          />
          <CredentialField
            label="Correo"
            hint="Lo puedes usar también para iniciar sesión."
            type="email"
            value={email}
            onChange={setEmail}
            status={emailStatus}
            takenMessage="Ese correo ya está en uso por otra cuenta."
            invalidMessage="Correo no válido."
          />
          <div className="pt-2 border-t border-line-100">
            <label className="block">
              <span className="text-xs font-medium text-ink-700">Tu contraseña actual</span>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="••••••••"
                className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700"
              />
            </label>
          </div>
          {error && (
            <div className="rounded-md bg-error-soft text-risk-high text-xs p-2.5 inline-flex items-start gap-2">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> <span>{error}</span>
            </div>
          )}
        </div>

        <footer className="p-5 border-t border-line-100 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} disabled={submitting} className="h-10 px-4 rounded-lg border border-line-200 text-ink-700 text-sm hover:border-brand-400">
            Cancelar
          </button>
          <button type="submit" disabled={!canSubmit} className="h-10 px-4 rounded-lg bg-brand-700 text-white text-sm font-medium hover:bg-brand-800 disabled:opacity-50 inline-flex items-center gap-2">
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Guardar cambios
          </button>
        </footer>
      </form>
    </div>
  );
}

/** Campo con feedback en vivo de disponibilidad. */
function CredentialField({
  label, hint, type = "text", value, onChange, status, takenMessage, invalidMessage,
}: {
  label: string;
  hint?: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  status: "idle" | "checking" | "available" | "taken" | "invalid";
  takenMessage: string;
  invalidMessage: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-ink-700">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "mt-1 w-full h-10 px-3 rounded-md border bg-surface text-sm outline-none focus:border-brand-700",
          status === "taken" || status === "invalid" ? "border-rose-400" : "border-line-200",
        )}
      />
      <div className="mt-1 text-[11px] flex items-center gap-1.5 min-h-4">
        {status === "checking" && <span className="text-ink-400">Verificando…</span>}
        {status === "available" && <span className="text-success inline-flex items-center gap-1"><Check className="h-3 w-3" /> Disponible</span>}
        {status === "taken" && <span className="text-risk-high">{takenMessage}</span>}
        {status === "invalid" && <span className="text-risk-high">{invalidMessage}</span>}
        {status === "idle" && hint && <span className="text-ink-400">{hint}</span>}
      </div>
    </label>
  );
}

/**
 * Modal autogestionado de cambio de contraseña. Pide contraseña actual,
 * nueva (con confirmación visual de "mostrar"), valida mínimo 8 caracteres
 * y que coincidan; el backend valida que la actual sea correcta.
 */
function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  // Errores cliente-side (validación local). Los del servidor llegan via mu.error.
  const [localError, setLocalError] = useState<string | null>(null);

  const mu = useMutation({
    mutationFn: () => api.changePassword({ current_password: current, new_password: next }),
    onSuccess: () => {
      toast.success("Contraseña actualizada");
      onClose();
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);
    if (next.length < 8) {
      setLocalError("La nueva contraseña debe tener al menos 8 caracteres");
      return;
    }
    if (next !== confirm) {
      setLocalError("La confirmación no coincide");
      return;
    }
    if (next === current) {
      setLocalError("La nueva contraseña debe ser distinta de la actual");
      return;
    }
    mu.mutate();
  }

  const errorMessage = localError ?? (mu.error as Error | null)?.message ?? null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink-900/40 backdrop-blur-sm p-0 sm:p-4" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md bg-surface rounded-t-2xl sm:rounded-2xl shadow-modal"
      >
        <header className="px-5 py-4 border-b border-line-100 flex items-start justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-brand-700 font-medium">Seguridad</p>
            <h3 className="font-serif text-lg text-ink-900 mt-0.5">Cambiar contraseña</h3>
          </div>
          <button type="button" onClick={onClose} className="h-9 w-9 rounded-md border border-line-200 flex items-center justify-center text-ink-500 hover:border-brand-400">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="p-5 space-y-3">
          <label className="block">
            <span className="block text-xs font-medium text-ink-700 mb-1.5">Contraseña actual</span>
            <input
              type={show ? "text" : "password"}
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoFocus
              required
              className="w-full h-10 px-3 rounded-lg border border-line-200 bg-bg text-sm text-ink-900 focus:outline-none focus:border-brand-400"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-ink-700 mb-1.5">Nueva contraseña <span className="text-ink-400 font-normal">(mín 8 caracteres)</span></span>
            <input
              type={show ? "text" : "password"}
              value={next}
              onChange={(e) => setNext(e.target.value)}
              required
              minLength={8}
              className="w-full h-10 px-3 rounded-lg border border-line-200 bg-bg text-sm text-ink-900 focus:outline-none focus:border-brand-400"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-ink-700 mb-1.5">Confirma la nueva contraseña</span>
            <input
              type={show ? "text" : "password"}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              className="w-full h-10 px-3 rounded-lg border border-line-200 bg-bg text-sm text-ink-900 focus:outline-none focus:border-brand-400"
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-ink-700 cursor-pointer">
            <input
              type="checkbox"
              checked={show}
              onChange={(e) => setShow(e.target.checked)}
              className="h-3.5 w-3.5 accent-brand-700"
            />
            Mostrar contraseñas
          </label>
          {errorMessage && (
            <div className="rounded-md border border-rose-300/50 bg-rose-500/5 p-2.5 text-xs text-rose-700 flex items-start gap-2">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>
        <footer className="px-5 py-4 border-t border-line-100 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-10 px-4 rounded-lg border border-line-200 text-sm text-ink-700 hover:border-brand-400"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={mu.isPending}
            className="h-10 px-4 rounded-lg bg-brand-700 text-white text-sm font-medium hover:bg-brand-800 disabled:opacity-60 inline-flex items-center gap-2"
          >
            {mu.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Actualizar contraseña
          </button>
        </footer>
      </form>
    </div>
  );
}

function AparienciaPanel() {
  const [mode, setMode] = useState<ThemePreference>(() => getThemeMode());
  const [family, setFamily] = useState<ThemeFamily>(() => getThemeFamily());
  const [font, setFont] = useState<FontFamily>(() => getFontFamily());

  // Aplicar al cambiar cualquiera de los 3. lib/theme.ts persiste en
  // localStorage y aplica los atributos data-* al <html>.
  useEffect(() => {
    setThemeMode(mode);
  }, [mode]);
  useEffect(() => {
    setThemeFamily(family);
    // Aurora es dark-only — si lo eligen, fuerzo el mode a oscuro en
    // el state local también para que el toggle de modo refleje la
    // realidad. setThemeMode lo aplica.
    if (family === "aurora" && mode !== "oscuro") {
      setMode("oscuro");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [family]);
  useEffect(() => {
    setFontFamily(font);
  }, [font]);

  // En modo auto, reaccionar a cambios del SO.
  useEffect(() => {
    if (mode !== "auto") return;
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme();
    mq.addEventListener?.("change", handler);
    return () => mq.removeEventListener?.("change", handler);
  }, [mode]);

  const familyEntries = Object.entries(THEME_FAMILIES) as Array<[ThemeFamily, typeof THEME_FAMILIES[ThemeFamily]]>;
  const fontEntries = Object.entries(FONT_FAMILIES) as Array<[FontFamily, typeof FONT_FAMILIES[FontFamily]]>;

  return (
    <>
      <SectionHeader title="Apariencia" desc="Adapta la interfaz a tu manera de trabajar. Los cambios son inmediatos y se guardan localmente." />

      {/* ─── Modo: claro/oscuro/auto ─── */}
      <div className="mb-6">
        <h4 className="text-sm font-medium text-ink-900 mb-2">Modo</h4>
        <p className="text-xs text-ink-500 mb-3">Claridad general de la paleta. "Auto" sigue tu sistema operativo.</p>
        <div className="grid grid-cols-3 gap-3">
          {(["claro", "oscuro", "auto"] as const).map((t) => {
            const disabled = family === "aurora" && t !== "oscuro";
            return (
              <button
                key={t}
                disabled={disabled}
                onClick={() => setMode(t)}
                className={cn(
                  "rounded-xl border-2 p-4 text-left capitalize transition-all",
                  mode === t ? "border-brand-700 bg-brand-50" : "border-line-200 bg-surface hover:border-brand-400",
                  disabled && "opacity-40 cursor-not-allowed",
                )}
                title={disabled ? "Aurora solo soporta modo oscuro" : undefined}
              >
                <div className={cn(
                  "h-12 rounded-lg mb-2",
                  t === "claro" ? "bg-bg-50 border border-line-200"
                    : t === "oscuro" ? "bg-ink-900"
                    : "bg-gradient-to-r from-bg-50 to-ink-900"
                )} />
                <div className="text-sm font-medium text-ink-900">{t}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── Tema: familia de color ─── */}
      <div className="mb-6">
        <h4 className="text-sm font-medium text-ink-900 mb-2">Tema</h4>
        <p className="text-xs text-ink-500 mb-3">Familia de color. El "Clínico" es el original; los demás se agregaron como alternativa.</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {familyEntries.map(([id, desc]) => (
            <button
              key={id}
              onClick={() => setFamily(id)}
              className={cn(
                "rounded-xl border-2 p-3 text-left transition-all",
                family === id ? "border-brand-700 bg-brand-50" : "border-line-200 bg-surface hover:border-brand-400",
              )}
            >
              <div
                className="h-10 rounded-lg mb-2 ring-1 ring-line-100"
                style={{ background: desc.swatch }}
              />
              <div className="text-sm font-medium text-ink-900">{desc.label}</div>
              <div className="text-[11px] text-ink-500 mt-0.5 line-clamp-2">{desc.description}</div>
              {desc.darkOnly && (
                <div className="text-[10px] uppercase tracking-wider text-ink-400 mt-1">Solo oscuro</div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Tipografía ─── */}
      <div>
        <h4 className="text-sm font-medium text-ink-900 mb-2">Tipografía</h4>
        <p className="text-xs text-ink-500 mb-3">Familia tipográfica para títulos (serif) y texto (sans). Se descarga la primera vez que la eliges.</p>
        <div className="space-y-2">
          {fontEntries.map(([id, desc]) => (
            <button
              key={id}
              onClick={() => setFont(id)}
              className={cn(
                "w-full rounded-xl border-2 p-3 text-left transition-all flex items-center gap-3",
                font === id ? "border-brand-700 bg-brand-50" : "border-line-200 bg-surface hover:border-brand-400",
              )}
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-ink-900 flex items-center gap-2">
                  {desc.label}
                  {font === id && <Check className="h-3.5 w-3.5 text-brand-700" />}
                </div>
                <div className="text-xs text-ink-500 mt-0.5">{desc.description}</div>
              </div>
              {/* Mini-preview del nombre con la fuente del set */}
              <div className="text-right shrink-0">
                <div className="text-base font-semibold text-ink-900" style={{ fontFamily: desc.serif }}>Aa</div>
                <div className="text-xs text-ink-500" style={{ fontFamily: desc.sans }}>Texto</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

// ─── Horario de atención ──────────────────────────────────────────────────
//
// El psicólogo elige hora de inicio, hora de fin y qué días trabaja.
// El mismo rango aplica a todos los días activos — es el modelo
// "un rango único + días" que el usuario eligió en feedback.
//
// Persistencia: 3 keys en la tabla settings (workspace_id, key, value):
//   - work_start_hour: "08" (string, hora 24h sin minutos por ahora)
//   - work_end_hour:   "18"
//   - work_days:       "monday,tuesday,wednesday,thursday,friday" (CSV)
//
// La agenda (WeekView) lee estos valores para renderizar la grilla
// y atenuar los días no laborables. Si el psicólogo crea una cita
// fuera de horario igual se permite — no bloqueamos, solo es la
// vista por defecto.

const DAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
type DayKey = typeof DAY_KEYS[number];

const DAY_LABELS: Record<DayKey, string> = {
  monday:    "Lunes",
  tuesday:   "Martes",
  wednesday: "Miércoles",
  thursday:  "Jueves",
  friday:    "Viernes",
  saturday:  "Sábado",
  sunday:    "Domingo",
};
const DAY_SHORT: Record<DayKey, string> = {
  monday: "Lun", tuesday: "Mar", wednesday: "Mié",
  thursday: "Jue", friday: "Vie", saturday: "Sáb", sunday: "Dom",
};

function HorarioPanel() {
  const qc = useQueryClient();
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.getSettings(),
  });

  // Estado local del form. Defaults razonables si el backend aún no
  // respondió o si el backfill no se ha ejecutado en este workspace.
  const [startHour, setStartHour] = useState<string>("08");
  const [endHour, setEndHour] = useState<string>("18");
  const [days, setDays] = useState<Set<DayKey>>(
    new Set(["monday", "tuesday", "wednesday", "thursday", "friday"]),
  );
  const [loaded, setLoaded] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  // Cuando llegan los settings los volcamos al state. `loaded` evita
  // pisar lo que el usuario está editando si el query refetch dispara.
  useEffect(() => {
    if (settings && !loaded) {
      if (settings.work_start_hour) setStartHour(String(settings.work_start_hour).padStart(2, "0"));
      if (settings.work_end_hour) setEndHour(String(settings.work_end_hour).padStart(2, "0"));
      if (settings.work_days) {
        const parsed = String(settings.work_days)
          .split(",")
          .map((s) => s.trim())
          .filter((s): s is DayKey => (DAY_KEYS as readonly string[]).includes(s));
        setDays(new Set(parsed));
      }
      setLoaded(true);
    }
  }, [settings, loaded]);

  const startNum = parseInt(startHour, 10);
  const endNum = parseInt(endHour, 10);
  const rangeOk = Number.isFinite(startNum) && Number.isFinite(endNum) && startNum < endNum;
  const daysOk = days.size > 0;
  const canSave = rangeOk && daysOk;

  const mu = useMutation({
    mutationFn: () => api.updateSettings({
      work_start_hour: startHour.padStart(2, "0"),
      work_end_hour: endHour.padStart(2, "0"),
      work_days: DAY_KEYS.filter((d) => days.has(d)).join(","),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] });
      setSavedAt(new Date().toLocaleTimeString("es-CO"));
      toast.success("Horario guardado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function toggleDay(d: DayKey) {
    setDays((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d); else next.add(d);
      return next;
    });
  }

  function applyPreset(preset: "lv" | "ls" | "ld") {
    if (preset === "lv") setDays(new Set(["monday","tuesday","wednesday","thursday","friday"]));
    else if (preset === "ls") setDays(new Set(["monday","tuesday","wednesday","thursday","friday","saturday"]));
    else setDays(new Set(DAY_KEYS));
  }

  // Genera opciones de hora 00-23 para los selectores.
  const hourOptions = Array.from({ length: 24 }, (_, h) => h.toString().padStart(2, "0"));

  return (
    <>
      <SectionHeader
        title="Horario de atención"
        desc="Define los días y las horas en las que normalmente atiendes. Tu agenda usará este rango como vista por defecto. Igual puedes crear citas fuera de horario si lo necesitas."
      />

      {/* Días de la semana */}
      <div className="rounded-xl border border-line-200 bg-surface p-4 sm:p-5 mb-4">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <h3 className="text-sm font-medium text-ink-900">Días que trabajas</h3>
          <div className="flex gap-1 text-[11px]">
            <button onClick={() => applyPreset("lv")} className="px-2 py-1 rounded-md border border-line-200 text-ink-700 hover:border-brand-400">L–V</button>
            <button onClick={() => applyPreset("ls")} className="px-2 py-1 rounded-md border border-line-200 text-ink-700 hover:border-brand-400">L–S</button>
            <button onClick={() => applyPreset("ld")} className="px-2 py-1 rounded-md border border-line-200 text-ink-700 hover:border-brand-400">L–D</button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {DAY_KEYS.map((d) => {
            const active = days.has(d);
            return (
              <button
                key={d}
                type="button"
                onClick={() => toggleDay(d)}
                className={cn(
                  "h-10 px-3 sm:px-4 rounded-lg text-sm border transition-colors min-w-[64px]",
                  active
                    ? "bg-brand-700 border-brand-700 text-white"
                    : "bg-surface border-line-200 text-ink-700 hover:border-brand-400",
                )}
              >
                <span className="sm:hidden">{DAY_SHORT[d]}</span>
                <span className="hidden sm:inline">{DAY_LABELS[d]}</span>
              </button>
            );
          })}
        </div>
        {!daysOk && (
          <p className="text-xs text-error mt-2 inline-flex items-center gap-1">
            <AlertCircle className="h-3 w-3" /> Selecciona al menos un día.
          </p>
        )}
      </div>

      {/* Horario */}
      <div className="rounded-xl border border-line-200 bg-surface p-4 sm:p-5 mb-4">
        <h3 className="text-sm font-medium text-ink-900 mb-3">Horario</h3>
        <div className="grid grid-cols-2 gap-3 max-w-md">
          <div>
            <label className="block text-xs font-medium text-ink-700 mb-1.5">Hora de inicio</label>
            <select
              value={startHour}
              onChange={(e) => setStartHour(e.target.value)}
              className="w-full h-11 rounded-lg border border-line-200 bg-surface px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
            >
              {hourOptions.map((h) => <option key={h} value={h}>{h}:00</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-700 mb-1.5">Hora de fin</label>
            <select
              value={endHour}
              onChange={(e) => setEndHour(e.target.value)}
              className="w-full h-11 rounded-lg border border-line-200 bg-surface px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
            >
              {hourOptions.map((h) => <option key={h} value={h}>{h}:00</option>)}
            </select>
          </div>
        </div>
        {!rangeOk && (
          <p className="text-xs text-error mt-2 inline-flex items-center gap-1">
            <AlertCircle className="h-3 w-3" /> La hora de fin debe ser mayor que la de inicio.
          </p>
        )}
        <p className="text-[11px] text-ink-500 mt-2">
          Vista previa: {DAY_KEYS.filter((d) => days.has(d)).map((d) => DAY_SHORT[d]).join(" · ") || "—"}{" "}
          de {startHour}:00 a {endHour}:00.
        </p>
      </div>

      {/* Footer guardar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-xs text-ink-500">
          {savedAt && <span className="inline-flex items-center gap-1"><Check className="h-3 w-3 text-success" /> Guardado a las {savedAt}</span>}
        </div>
        <button
          onClick={() => mu.mutate()}
          disabled={!canSave || mu.isPending}
          className="h-10 px-4 rounded-lg bg-brand-700 text-white text-sm font-medium hover:bg-brand-800 disabled:opacity-50 inline-flex items-center gap-2"
        >
          {mu.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Guardar horario
        </button>
      </div>
    </>
  );
}

// ─── Workspace panel: modo individual u organización ──────────────────────
function WorkspacePanel() {
  const { data: workspace } = useWorkspace();
  const qc = useQueryClient();
  const [name, setName] = useState<string>("");
  const [pendingMode, setPendingMode] = useState<WorkspaceMode | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  // Sync local state cuando cargue workspace
  if (workspace && name === "") setName(workspace.name);

  const updateMu = useMutation({
    mutationFn: (body: { name?: string; mode?: WorkspaceMode }) => api.updateWorkspace(body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["workspace"] }); setSavedAt(new Date().toLocaleTimeString("es-CO")); setPendingMode(null); },
  });

  if (!workspace) return <div className="text-sm text-ink-500">Cargando…</div>;

  const currentMode = pendingMode ?? workspace.mode;

  return (
    <>
      <SectionHeader title="Workspace" desc="Controla el alcance y nombre de tu espacio de trabajo." />

      <label className="block mb-6">
        <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">Nombre del workspace</span>
        <div className="mt-1 flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700"
          />
          <button
            onClick={() => updateMu.mutate({ name })}
            disabled={updateMu.isPending || name === workspace.name}
            className="h-10 px-4 rounded-md bg-brand-700 text-primary-foreground text-sm font-medium hover:bg-brand-800 disabled:opacity-50"
          >
            Guardar
          </button>
        </div>
      </label>

      <h4 className="text-xs uppercase tracking-widest text-brand-700 font-semibold mb-3">Modo de operación</h4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
        {([
          { id: "individual",   title: "Individual",   desc: "Un solo psicólogo atiende pacientes. Sin sedes ni equipo.",                                            bullets: ["1 profesional", "Sin concepto de sede", "Ideal para consulta privada"], disabled: false },
          { id: "organization", title: "Organización", desc: "Clínica con múltiples profesionales y sedes. Un profesional puede trabajar en varias sedes.",          bullets: ["Múltiples profesionales", "Múltiples sedes", "Asignaciones flexibles"], disabled: true },
        ] as Array<{ id: WorkspaceMode; title: string; desc: string; bullets: string[]; disabled: boolean }>).map((m) => (
          <button
            key={m.id}
            type="button"
            disabled={m.disabled}
            onClick={() => !m.disabled && setPendingMode(m.id === workspace.mode ? null : m.id)}
            className={cn(
              "text-left rounded-xl border p-5 transition-colors",
              m.disabled
                ? "border-line-200 opacity-70 cursor-not-allowed"
                : currentMode === m.id
                  ? "border-brand-700 bg-brand-50/50"
                  : "border-line-200 hover:border-brand-400"
            )}
          >
            <div className="flex items-center justify-between mb-1 gap-2 flex-wrap">
              <h5 className="font-serif text-lg text-ink-900">{m.title}</h5>
              {m.disabled
                ? <span className="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full font-medium bg-brand-50 text-brand-800">Próximamente</span>
                : workspace.mode === m.id
                  ? <span className="text-[10px] uppercase tracking-wider text-brand-700 font-medium">Actual</span>
                  : pendingMode === m.id
                    ? <span className="text-[10px] uppercase tracking-wider text-warning font-medium">Nuevo</span>
                    : null}
            </div>
            <p className="text-xs text-ink-700">{m.desc}</p>
            <ul className="mt-3 space-y-1">
              {m.bullets.map((b) => (
                <li key={b} className="text-[11px] text-ink-500 flex items-start gap-1.5">
                  <Check className="h-3 w-3 text-success mt-0.5 shrink-0" /> {b}
                </li>
              ))}
            </ul>
          </button>
        ))}
      </div>

      {pendingMode && (
        <div className="rounded-lg border border-warning/30 bg-warning-soft p-4 mb-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-4 w-4 text-risk-moderate shrink-0 mt-0.5" />
            <div className="flex-1 text-sm text-ink-700">
              Cambiarás el modo a <strong className="text-ink-900">{pendingMode === "organization" ? "Organización" : "Individual"}</strong>.
              {pendingMode === "individual" && " Las sedes y profesionales adicionales quedarán ocultos pero no se eliminarán."}
              {pendingMode === "organization" && " Podrás crear sedes y agregar más profesionales."}
            </div>
            <button
              onClick={() => updateMu.mutate({ mode: pendingMode })}
              disabled={updateMu.isPending}
              className="h-9 px-3 rounded-md bg-brand-700 text-primary-foreground text-xs font-medium hover:bg-brand-800 disabled:opacity-50"
            >
              {updateMu.isPending ? "Aplicando…" : "Confirmar cambio"}
            </button>
          </div>
        </div>
      )}

      {savedAt && !pendingMode && (
        <p className="text-xs text-success flex items-center gap-1"><Check className="h-3.5 w-3.5" /> Cambios guardados a las {savedAt}</p>
      )}
    </>
  );
}

// ─── Sedes panel ──────────────────────────────────────────────────────────
function SedesPanel() {
  const qc = useQueryClient();
  const { data: sedes = [], isLoading } = useQuery({ queryKey: ["sedes"], queryFn: () => api.listSedes() });
  const [editing, setEditing] = useState<Sede | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const delMu = useMutation({
    mutationFn: (id: number) => api.deleteSede(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["sedes"] }); qc.invalidateQueries({ queryKey: ["workspace"] }); },
  });

  return (
    <>
      <SectionHeader title="Sedes" desc="Consultorios físicos y modalidades remotas del workspace." />

      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-ink-500">{isLoading ? "Cargando…" : `${sedes.length} sedes registradas`}</p>
        <button
          onClick={() => setCreateOpen(true)}
          className="h-9 px-3 rounded-md bg-brand-700 text-primary-foreground text-xs font-medium hover:bg-brand-800 inline-flex items-center gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" /> Nueva sede
        </button>
      </div>

      {sedes.length === 0 && !isLoading && (
        <div className="rounded-lg border border-dashed border-line-200 p-10 text-center">
          <Building2 className="h-6 w-6 text-ink-400 mx-auto mb-2" />
          <p className="text-sm text-ink-500">Aún no hay sedes. Crea la primera para comenzar.</p>
        </div>
      )}

      <ul className="space-y-2">
        {sedes.map((s) => (
          <li key={s.id} className="rounded-lg border border-line-200 p-4 flex items-start gap-3 hover:border-brand-400 transition-colors">
            <div className="h-10 w-10 rounded-lg bg-brand-50 text-brand-800 flex items-center justify-center shrink-0">
              <Building2 className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-medium text-ink-900">{s.name}</h4>
                {s.active ? (
                  <span className="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full font-medium bg-success-soft text-success">Activa</span>
                ) : (
                  <span className="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full font-medium bg-bg-100 text-ink-500">Inactiva</span>
                )}
              </div>
              {s.address && <div className="text-xs text-ink-500 mt-0.5 inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {s.address}</div>}
              {s.phone && <div className="text-xs text-ink-500 tabular">{s.phone}</div>}
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setEditing(s)} className="h-8 w-8 rounded-md text-ink-500 hover:bg-bg-100 hover:text-ink-900 flex items-center justify-center" title="Editar">
                <Edit3 className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => { if (confirm(`¿Eliminar ${s.name}?`)) delMu.mutate(s.id); }} className="h-8 w-8 rounded-md text-ink-500 hover:bg-error-soft hover:text-risk-high flex items-center justify-center" title="Eliminar">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </li>
        ))}
      </ul>

      {(createOpen || editing) && (
        <SedeFormModal
          sede={editing}
          onClose={() => { setCreateOpen(false); setEditing(null); }}
          onSaved={() => { qc.invalidateQueries({ queryKey: ["sedes"] }); qc.invalidateQueries({ queryKey: ["workspace"] }); setCreateOpen(false); setEditing(null); }}
        />
      )}
    </>
  );
}

function SedeFormModal({ sede, onClose, onSaved }: { sede: Sede | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(sede?.name ?? "");
  const [address, setAddress] = useState(sede?.address ?? "");
  const [phone, setPhone] = useState(sede?.phone ?? "");
  const [active, setActive] = useState(sede ? !!sede.active : true);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (sede) await api.updateSede(sede.id, { name, address, phone, active });
      else await api.createSede({ name, address, phone });
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 backdrop-blur-sm p-4" onClick={onClose}>
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl bg-surface shadow-modal" onClick={(e) => e.stopPropagation()}>
        <header className="p-5 border-b border-line-100 flex items-start justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-brand-800 font-medium">Sedes</p>
            <h3 className="font-serif text-xl text-ink-900 mt-0.5">{sede ? "Editar sede" : "Nueva sede"}</h3>
          </div>
          <button type="button" onClick={onClose} className="h-9 w-9 rounded-md border border-line-200 text-ink-500 hover:border-brand-400 flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="p-5 space-y-3">
          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">Nombre</span>
            <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Sede Chapinero" className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700" />
          </label>
          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">Dirección</span>
            <input value={address ?? ""} onChange={(e) => setAddress(e.target.value)} placeholder="Calle 72 # 8-24" className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700" />
          </label>
          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">Teléfono</span>
            <input value={phone ?? ""} onChange={(e) => setPhone(e.target.value)} placeholder="+57 1 555 1200" className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700 tabular" />
          </label>
          {sede && (
            <label className="flex items-center gap-2 text-sm text-ink-700 cursor-pointer select-none">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="sr-only peer" />
              <span className="h-4.5 w-4.5 rounded-[5px] border border-line-200 bg-surface flex items-center justify-center peer-checked:bg-brand-700 peer-checked:border-brand-700">
                {active && <Check className="h-3 w-3 text-primary-foreground" strokeWidth={3} />}
              </span>
              Sede activa
            </label>
          )}
        </div>
        <footer className="p-4 border-t border-line-100 bg-bg-100/30 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-9 px-3 rounded-md border border-line-200 text-sm text-ink-700 hover:border-brand-400">Cancelar</button>
          <button type="submit" disabled={saving} className="h-9 px-4 rounded-md bg-brand-700 text-primary-foreground text-sm font-medium hover:bg-brand-800 disabled:opacity-50 inline-flex items-center gap-2">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {sede ? "Guardar cambios" : "Crear sede"}
          </button>
        </footer>
      </form>
    </div>
  );
}

// ─── Equipo panel: profesionales ──────────────────────────────────────────
function EquipoPanel() {
  const qc = useQueryClient();
  const { data: workspace } = useWorkspace();
  const { data: professionals = [], isLoading } = useQuery({ queryKey: ["professionals"], queryFn: () => api.listProfessionals() });
  const sedes = workspace?.sedes ?? [];
  const isOrg = workspace?.mode === "organization";
  const [editing, setEditing] = useState<Professional | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const delMu = useMutation({
    mutationFn: (id: number) => api.deleteProfessional(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["professionals"] }); qc.invalidateQueries({ queryKey: ["workspace"] }); },
  });

  return (
    <>
      <SectionHeader title="Equipo" desc={isOrg ? "Profesionales del workspace y sus sedes asignadas." : "Profesional a cargo del workspace."} />

      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-ink-500">{isLoading ? "Cargando…" : `${professionals.length} profesional${professionals.length === 1 ? "" : "es"}`}</p>
        {isOrg && (
          <button
            onClick={() => setCreateOpen(true)}
            className="h-9 px-3 rounded-md bg-brand-700 text-primary-foreground text-xs font-medium hover:bg-brand-800 inline-flex items-center gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" /> Nuevo profesional
          </button>
        )}
      </div>

      <ul className="rounded-lg border border-line-200 overflow-hidden divide-y divide-line-100">
        {professionals.map((p) => {
          const initials = p.name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase();
          const pSedes = sedes.filter((s) => p.sedeIds.includes(s.id));
          return (
            <li key={p.id} className="flex items-center gap-4 px-4 py-3 hover:bg-bg-100/40">
              <div className="h-10 w-10 rounded-full bg-brand-100 text-brand-800 flex items-center justify-center text-xs font-semibold shrink-0">
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-ink-900">{p.name}</div>
                <div className="text-xs text-ink-500 truncate">{p.title} · {p.email}</div>
                {isOrg && pSedes.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {pSedes.map((s) => (
                      <span key={s.id} className="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full font-medium bg-lavender-100 text-lavender-500 inline-flex items-center gap-1">
                        <Building2 className="h-2.5 w-2.5" /> {s.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <span className={cn(
                "text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full font-medium",
                p.active ? "bg-success-soft text-success" : "bg-bg-100 text-ink-500"
              )}>{p.active ? "Activo" : "Inactivo"}</span>
              <button onClick={() => setEditing(p)} className="h-8 w-8 rounded-md text-ink-500 hover:bg-bg-100 flex items-center justify-center" title="Editar">
                <Edit3 className="h-3.5 w-3.5" />
              </button>
              {isOrg && professionals.length > 1 && (
                <button onClick={() => { if (confirm(`¿Eliminar a ${p.name}?`)) delMu.mutate(p.id); }} className="h-8 w-8 rounded-md text-ink-500 hover:bg-error-soft hover:text-risk-high flex items-center justify-center" title="Eliminar">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {(createOpen || editing) && (
        <ProfessionalFormModal
          professional={editing}
          sedes={sedes}
          isOrg={!!isOrg}
          onClose={() => { setCreateOpen(false); setEditing(null); }}
          onSaved={() => { qc.invalidateQueries({ queryKey: ["professionals"] }); qc.invalidateQueries({ queryKey: ["workspace"] }); setCreateOpen(false); setEditing(null); }}
        />
      )}
    </>
  );
}

function ProfessionalFormModal({ professional, sedes, isOrg, onClose, onSaved }: {
  professional: Professional | null;
  sedes: Sede[];
  isOrg: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(professional?.name ?? "");
  const [title, setTitle] = useState(professional?.title ?? "");
  const [email, setEmail] = useState(professional?.email ?? "");
  const [phone, setPhone] = useState(professional?.phone ?? "");
  const [approach, setApproach] = useState(professional?.approach ?? "");
  const [sedeIds, setSedeIds] = useState<number[]>(professional?.sedeIds ?? []);
  const [active, setActive] = useState(professional ? !!professional.active : true);
  const [saving, setSaving] = useState(false);

  function toggleSede(id: number) {
    setSedeIds((ids) => ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id]);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body = { name, title, email, phone, approach, sedeIds, active };
      if (professional) await api.updateProfessional(professional.id, body);
      else await api.createProfessional(body);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 backdrop-blur-sm p-4" onClick={onClose}>
      <form onSubmit={submit} className="w-full max-w-lg rounded-2xl bg-surface shadow-modal max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <header className="p-5 border-b border-line-100 flex items-start justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-brand-800 font-medium">Equipo</p>
            <h3 className="font-serif text-xl text-ink-900 mt-0.5">{professional ? "Editar profesional" : "Nuevo profesional"}</h3>
          </div>
          <button type="button" onClick={onClose} className="h-9 w-9 rounded-md border border-line-200 text-ink-500 hover:border-brand-400 flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="p-5 space-y-3 overflow-y-auto">
          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">Nombre completo</span>
            <input required value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">Título</span>
              <input value={title ?? ""} onChange={(e) => setTitle(e.target.value)} placeholder="Psicóloga clínica" className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700" />
            </label>
            <label className="block">
              <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">Enfoque</span>
              <input value={approach ?? ""} onChange={(e) => setApproach(e.target.value)} placeholder="TCC" className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700" />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">Correo</span>
              <input type="email" value={email ?? ""} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700" />
            </label>
            <label className="block">
              <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">Teléfono</span>
              <input value={phone ?? ""} onChange={(e) => setPhone(e.target.value)} className="mt-1 w-full h-10 px-3 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700 tabular" />
            </label>
          </div>

          {isOrg && sedes.length > 0 && (
            <div>
              <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">Sedes asignadas</span>
              <div className="mt-1 grid grid-cols-2 gap-2">
                {sedes.map((s) => {
                  const checked = sedeIds.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => toggleSede(s.id)}
                      className={cn(
                        "flex items-center gap-2 rounded-md border p-2.5 text-sm text-left transition-colors",
                        checked ? "border-brand-700 bg-brand-50/50" : "border-line-200 hover:border-brand-400"
                      )}
                    >
                      <span className={cn(
                        "h-4 w-4 rounded-[4px] border flex items-center justify-center shrink-0",
                        checked ? "bg-brand-700 border-brand-700" : "border-line-200 bg-surface"
                      )}>
                        {checked && <Check className="h-3 w-3 text-primary-foreground" strokeWidth={3} />}
                      </span>
                      <Building2 className="h-3.5 w-3.5 text-ink-400" />
                      <span className="truncate">{s.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {professional && (
            <label className="flex items-center gap-2 text-sm text-ink-700 cursor-pointer select-none">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="sr-only peer" />
              <span className="h-4.5 w-4.5 rounded-[5px] border border-line-200 bg-surface flex items-center justify-center peer-checked:bg-brand-700 peer-checked:border-brand-700">
                {active && <Check className="h-3 w-3 text-primary-foreground" strokeWidth={3} />}
              </span>
              Profesional activo
            </label>
          )}
        </div>
        <footer className="p-4 border-t border-line-100 bg-bg-100/30 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-9 px-3 rounded-md border border-line-200 text-sm text-ink-700 hover:border-brand-400">Cancelar</button>
          <button type="submit" disabled={saving} className="h-9 px-4 rounded-md bg-brand-700 text-primary-foreground text-sm font-medium hover:bg-brand-800 disabled:opacity-50 inline-flex items-center gap-2">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {professional ? "Guardar cambios" : "Crear profesional"}
          </button>
        </footer>
      </form>
    </div>
  );
}

function IntegracionesPanel() {
  // Catálogo de integraciones futuras. Todas marcadas como "Próximamente"
  // hasta que cada una se implemente. Los logos vienen de Simple Icons
  // (CDN público, licencia CC0) — si quisiéramos self-host después, basta
  // con descargar los SVG y servirlos desde /public.
  //
  // El color hex es el oficial de cada marca:
  //   - Google Calendar: 4285F4 (Google blue)
  //   - Zoom: 0B5CFF
  //   - Google Meet: 00897B (teal)
  //   - WhatsApp: 25D366
  //   - Calendly: 006BFF
  const integrations = [
    { id: "gcal",     name: "Google Calendar",   slug: "googlecalendar", color: "4285F4", desc: "Sincroniza tu agenda con Google Calendar en dos sentidos." },
    { id: "zoom",     name: "Zoom",              slug: "zoom",           color: "0B5CFF", desc: "Genera automáticamente salas de Zoom para sesiones de telepsicología." },
    { id: "gmeet",    name: "Google Meet",       slug: "googlemeet",     color: "00897B", desc: "Crea enlaces de Google Meet asociados a cada cita virtual." },
    { id: "wa",       name: "WhatsApp Business", slug: "whatsapp",       color: "25D366", desc: "Recordatorios de cita y mensajería con pacientes por WhatsApp." },
    { id: "calendly", name: "Calendly",          slug: "calendly",       color: "006BFF", desc: "Recibe reservas de pacientes desde tu enlace público de Calendly." },
  ];

  return (
    <>
      <SectionHeader title="Integraciones" desc="Conecta Psicomorfosis con tus herramientas favoritas. Todas en desarrollo." />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {integrations.map((it) => (
          <article key={it.id} className="rounded-xl border border-line-200 p-4 flex items-start gap-3 opacity-90">
            <div className="h-10 w-10 rounded-lg bg-white border border-line-100 flex items-center justify-center shrink-0 overflow-hidden">
              <img
                src={`https://cdn.simpleicons.org/${it.slug}/${it.color}`}
                alt={`Logo de ${it.name}`}
                width={22}
                height={22}
                loading="lazy"
                className="h-[22px] w-[22px] object-contain"
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="text-sm font-medium text-ink-900">{it.name}</h4>
                <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full font-medium bg-brand-50 text-brand-800">
                  <Circle className="h-3 w-3" /> Próximamente
                </span>
              </div>
              <p className="text-xs text-ink-500 mt-1">{it.desc}</p>
              <button
                type="button"
                disabled
                className="mt-3 h-8 px-3 rounded-md text-xs font-medium border border-line-200 text-ink-400 cursor-not-allowed"
                title="Esta integración está en desarrollo"
              >
                En desarrollo
              </button>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

function SectionHeader({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="mb-6">
      <h2 className="font-serif text-xl text-ink-900">{title}</h2>
      <p className="text-sm text-ink-500 mt-1">{desc}</p>
    </div>
  );
}

/**
 * Panel "Tutoriales" — escape hatch para volver a ver los tours guiados.
 * Borra los flags `psm.tour.*.completed` de localStorage; al recargar
 * cualquier página los tours se vuelven a disparar como si fuera la
 * primera vez. Con un reload sugerido para que el dashboard reanude.
 */
function TutorialesPanel() {
  function reset() {
    const n = resetAllTours();
    if (n === 0) {
      toast.message("No hay tutoriales completados para reiniciar.");
      return;
    }
    toast.success(
      `Listo. ${n} ${n === 1 ? "tutorial reiniciado" : "tutoriales reiniciados"}. Vuelve a entrar a cada página para verlos.`,
    );
  }

  return (
    <>
      <SectionHeader
        title="Tutoriales"
        desc="Los tours guiados aparecen una sola vez la primera vez que entras a cada sección. Si quieres volver a verlos, reinícialos aquí."
      />
      <div className="rounded-xl border border-line-200 bg-bg-50/50 p-5 sm:p-6 max-w-xl">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center shrink-0">
            <GraduationCap className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium text-ink-900">Volver a ver los tours</h3>
            <p className="text-xs text-ink-500 mt-1 leading-relaxed">
              Te recordamos lo importante de cada sección al entrar por primera vez (Inicio, Pacientes, Historia, Tests, Recibos). Si saliste sin querer o quieres repasar, reinicia desde aquí.
            </p>
            <button
              onClick={reset}
              className="mt-4 h-10 px-4 rounded-lg bg-brand-700 text-white text-sm font-medium hover:bg-brand-800 inline-flex items-center gap-2"
            >
              <RotateCcw className="h-4 w-4" /> Reiniciar tutoriales
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Mi cuenta panel: zona peligrosa (eliminar cuenta + sus datos) ────────
//
// Este panel implementa el **derecho de supresión** del art. 8 lit. e) de
// la Ley 1581/2012 colombiana (Habeas Data) y la cláusula octava del
// Acuerdo de Beta. La eliminación es total: workspace + pacientes +
// historia clínica + tests + recibos + documentos. No reversible.
//
// Flujo de doble confirmación:
//   1. Click en "Eliminar mi cuenta" → abre modal.
//   2. Modal pide escribir literalmente "ELIMINAR" + reingresar contraseña.
//   3. Backend valida ambos antes de ejecutar el DELETE FROM workspaces.
//   4. Tras éxito, se cierra sesión y se redirige a /login con un toast.
//
// Solo lo ve el super_admin del workspace; los miembros normales del
// equipo no pueden borrar la cuenta entera y verán un mensaje informativo.

function CuentaPanel() {
  const [user] = useState(() => getStoredUser());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const isOwner = user?.role === "super_admin";
  const isPlatformAdmin = !!user?.isPlatformAdmin;

  return (
    <>
      <SectionHeader
        title="Mi cuenta"
        desc="Datos sobre tu cuenta y herramientas para ejercer tus derechos de protección de datos personales (Ley 1581/2012)."
      />

      {/* Información de la cuenta */}
      <div className="rounded-xl border border-line-200 bg-bg-50 p-4 mb-6">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg bg-brand-100 text-brand-700 flex items-center justify-center shrink-0">
            <User className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0 text-sm">
            <div className="text-ink-900 font-medium">{user?.name ?? "—"}</div>
            <div className="text-ink-500 mt-0.5 text-xs">
              {user?.email ?? "—"} · Rol: {user?.role ?? "—"}
              {isPlatformAdmin && " · Administrador de plataforma"}
            </div>
          </div>
        </div>
      </div>

      {/* Sección informativa: tus derechos */}
      <div className="rounded-xl border border-line-200 bg-surface p-4 sm:p-5 mb-4">
        <h3 className="text-sm font-medium text-ink-900 mb-2">Tus derechos sobre tus datos</h3>
        <p className="text-xs text-ink-500 leading-relaxed mb-3">
          Como titular de tus datos personales, en cualquier momento puedes
          ejercer los derechos del artículo 8 de la Ley 1581 de 2012:
        </p>
        <ul className="text-xs text-ink-700 space-y-1.5 list-disc pl-5">
          <li>Conocer, actualizar o rectificar tus datos.</li>
          <li>Solicitar prueba de la autorización otorgada para el tratamiento.</li>
          <li>Ser informado sobre el uso que se da a tus datos.</li>
          <li>
            Revocar la autorización y solicitar la <strong>supresión total</strong> de tus datos.
          </li>
          <li>Presentar quejas ante la Superintendencia de Industria y Comercio (SIC).</li>
        </ul>
        <p className="text-xs text-ink-500 leading-relaxed mt-3">
          Para consultas o reclamos sobre tu información, escríbenos a{" "}
          <a href="mailto:santequera@wailus.co" className="text-brand-700 underline">santequera@wailus.co</a>.
        </p>
      </div>

      {/* Zona peligrosa */}
      <div className="rounded-xl border-2 border-error/30 bg-error-soft p-4 sm:p-5">
        <div className="flex items-start gap-3 mb-3">
          <div className="h-10 w-10 rounded-lg bg-error/15 text-error flex items-center justify-center shrink-0">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-ink-900">Zona peligrosa</h3>
            <p className="text-xs text-ink-700 mt-0.5">Acciones irreversibles. Léelas con calma antes de actuar.</p>
          </div>
        </div>

        <div className="rounded-lg bg-surface border border-line-200 p-4">
          <h4 className="text-sm font-medium text-ink-900">Eliminar mi cuenta y todos mis datos</h4>
          <p className="text-xs text-ink-700 mt-1.5 leading-relaxed">
            Borra <strong>de forma permanente</strong> tu workspace y toda su
            información asociada: pacientes, historia clínica, evoluciones,
            tests aplicados, recibos, documentos, tareas y cualquier archivo
            adjunto. Los respaldos que aún contengan información se
            sobrescribirán en máximo 14 días.
          </p>
          <p className="text-xs text-ink-700 mt-2 leading-relaxed">
            <strong className="text-ink-900">Antes de eliminar</strong>: si estás obligado a conservar
            la historia clínica por la Resolución 1995 de 1999, exporta tu
            información primero. La función de exportación estará disponible
            próximamente; si la necesitas ahora, escríbenos.
          </p>

          {!isOwner && (
            <p className="mt-4 text-xs text-warning bg-warning-soft border border-warning/30 rounded-md px-3 py-2">
              Solo el propietario de la cuenta (super admin) puede eliminar el
              workspace completo.
            </p>
          )}
          {isPlatformAdmin && (
            <p className="mt-4 text-xs text-warning bg-warning-soft border border-warning/30 rounded-md px-3 py-2">
              Las cuentas de administración de plataforma no se eliminan por
              esta vía. Contacta al equipo técnico.
            </p>
          )}

          <button
            onClick={() => setConfirmOpen(true)}
            disabled={!isOwner || isPlatformAdmin}
            className="mt-4 h-10 px-4 rounded-lg bg-error text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
          >
            <Trash2 className="h-4 w-4" /> Eliminar mi cuenta
          </button>
        </div>
      </div>

      {confirmOpen && <DeleteAccountModal onClose={() => setConfirmOpen(false)} />}
    </>
  );
}

/**
 * Modal de doble confirmación para eliminar la cuenta.
 *
 * Exige dos pruebas independientes:
 *   - Tipear literal "ELIMINAR" (evita clicks accidentales / muscle memory).
 *   - Reingresar la contraseña actual (evita que un atacante con sesión
 *     viva pero sin password destruya el workspace).
 *
 * Tras éxito muestra un comprobante con timestamp; al cerrar se hace
 * logout y redirect a /login.
 */
function DeleteAccountModal({ onClose }: { onClose: () => void }) {
  const [confirmText, setConfirmText] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{
    workspaceName: string;
    deletedAt: string;
    message: string;
  } | null>(null);

  const canSubmit = confirmText === "ELIMINAR" && password.length > 0 && !submitting;

  async function handleDelete() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await api.deleteAccount({ confirmText, currentPassword: password });
      setDone({
        workspaceName: result.workspaceName,
        deletedAt: result.deletedAt,
        message: result.message,
      });
    } catch (e: any) {
      setError(e?.message ?? "No fue posible eliminar la cuenta.");
      setSubmitting(false);
    }
  }

  function handleFinish() {
    clearSession();
    // Hard redirect: garantiza limpieza completa de estado en memoria
    // (router cache, queries, contexts) que podrían referenciar el
    // workspace eliminado y romper la pantalla siguiente.
    window.location.replace("/login");
  }

  // Una vez eliminada, el modal se transforma en comprobante.
  if (done) {
    return (
      <div className="fixed inset-0 z-50 bg-ink-900/60 backdrop-blur-sm flex items-center justify-center px-4">
        <div className="w-full max-w-md bg-surface rounded-xl border border-line-200 shadow-modal p-6">
          <div className="h-12 w-12 rounded-full bg-success-soft text-success flex items-center justify-center mx-auto mb-4">
            <Check className="h-6 w-6" />
          </div>
          <h3 className="font-serif text-xl text-ink-900 text-center mb-2">
            Cuenta eliminada
          </h3>
          <p className="text-sm text-ink-700 text-center leading-relaxed mb-4">
            Workspace <strong>{done.workspaceName}</strong> eliminado el{" "}
            {new Date(done.deletedAt).toLocaleString("es-CO", {
              dateStyle: "long",
              timeStyle: "short",
            })}.
          </p>
          <p className="text-xs text-ink-500 leading-relaxed bg-bg-100 rounded-md p-3 mb-4">
            {done.message}
          </p>
          <p className="text-xs text-ink-500 text-center mb-4">
            Guarda este comprobante (captura de pantalla) si lo necesitas
            como soporte de la solicitud.
          </p>
          <button
            onClick={handleFinish}
            className="w-full h-11 rounded-lg bg-brand-700 text-white text-sm font-medium hover:bg-brand-800"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-ink-900/60 backdrop-blur-sm flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-surface rounded-xl border border-line-200 shadow-modal">
        <header className="px-5 py-4 border-b border-line-200 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-error/15 text-error flex items-center justify-center shrink-0">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-serif text-lg text-ink-900">Eliminar cuenta</h3>
            <p className="text-xs text-ink-500">Esta acción es irreversible</p>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-md text-ink-500 hover:bg-bg-100 flex items-center justify-center"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="px-5 py-4 space-y-4">
          <div className="rounded-md bg-error-soft border border-error/30 p-3 text-xs text-ink-900 leading-relaxed">
            <strong className="block text-error mb-1">¿Estás seguro?</strong>
            Se eliminarán de forma <strong>permanente</strong>: tu workspace,
            todos los pacientes, su historia clínica, tests aplicados,
            recibos, documentos y archivos. Esta acción no puede deshacerse.
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-700 mb-1.5">
              Para confirmar, escribe <code className="px-1 py-0.5 bg-bg-100 rounded text-error font-mono">ELIMINAR</code>
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoFocus
              placeholder="ELIMINAR"
              className="w-full h-11 rounded-lg border border-line-200 bg-surface px-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-error focus:border-error"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-700 mb-1.5">
              Reingresa tu contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full h-11 rounded-lg border border-line-200 bg-surface px-3 text-sm focus:outline-none focus:ring-2 focus:ring-error focus:border-error"
            />
          </div>

          {error && (
            <div className="rounded-md bg-error-soft border border-error/30 px-3 py-2 text-xs text-error flex items-start gap-2">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <footer className="px-5 py-4 border-t border-line-200 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={submitting}
            className="h-10 px-4 rounded-lg text-sm font-medium text-ink-700 hover:bg-bg-100 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleDelete}
            disabled={!canSubmit}
            className="h-10 px-4 rounded-lg bg-error text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Eliminar permanentemente
          </button>
        </footer>
      </div>
    </div>
  );
}
