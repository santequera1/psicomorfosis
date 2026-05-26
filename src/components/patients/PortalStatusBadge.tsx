import { CheckCircle2, Clock, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ApiPatient } from "@/lib/api";

/**
 * Badge compacto que muestra si el paciente ya activó su cuenta del portal,
 * si tiene una invitación pendiente, o si todavía no se le ha enviado.
 *
 * Usado en la lista de pacientes y en la ficha individual para que el
 * psicólogo sepa de un vistazo si el paciente tiene acceso a sus
 * documentos / tareas / tests desde el portal.
 *
 * Tres estados visuales (diferencia por color + ícono):
 *   - "active":      verde, con CheckCircle. Tooltip incluye último login si lo hay.
 *   - "invited":     ámbar, con Clock. Tooltip incluye días que quedan de la invitación.
 *   - "not_invited": gris, con UserPlus. Tooltip invita a invitarlo.
 */
export function PortalStatusBadge({
  patient,
  size = "md",
  className,
}: {
  patient: Pick<ApiPatient, "portalStatus" | "portalActivatedAt" | "portalLastLoginAt" | "portalInviteExpiresAt">;
  size?: "sm" | "md";
  className?: string;
}) {
  const status = patient.portalStatus ?? "not_invited";

  const base = "inline-flex items-center gap-1 rounded-full font-medium border";
  const sizing = size === "sm"
    ? "text-[10px] uppercase tracking-[0.06em] px-1.5 py-0.5"
    : "text-xs px-2 py-1";

  if (status === "active") {
    // Última entrada visible inline (no solo en tooltip). El psicólogo
    // quiere ver de un vistazo si el paciente está usando el portal o
    // no, sin tener que pasar el mouse encima. Si nunca entró, mostramos
    // un sutil "sin entrar aún". Tooltip se mantiene para más contexto.
    const lastLoginRel = patient.portalLastLoginAt
      ? formatRelative(patient.portalLastLoginAt)
      : null;
    const tooltip = patient.portalLastLoginAt
      ? `Portal activo. Última entrada: ${lastLoginRel}`
      : "Portal activo. Aún no ha entrado desde que activó la cuenta.";
    return (
      <span className={cn(base, sizing, "bg-success-soft text-success border-success/20", className)} title={tooltip}>
        <CheckCircle2 className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} />
        {size === "sm"
          ? (lastLoginRel ? `Activo · ${lastLoginRel}` : "Activo")
          : (lastLoginRel ? `Portal activo · ${lastLoginRel}` : "Portal activo · sin entrar")}
      </span>
    );
  }

  if (status === "invited") {
    const daysLeft = patient.portalInviteExpiresAt
      ? Math.max(0, Math.ceil((new Date(patient.portalInviteExpiresAt).getTime() - Date.now()) / 86400000))
      : null;
    const tooltip = daysLeft != null
      ? `Invitación enviada, esperando activación. Vence en ${daysLeft} día${daysLeft === 1 ? "" : "s"}.`
      : "Invitación enviada, esperando que el paciente active su cuenta.";
    return (
      <span className={cn(base, sizing, "bg-warning-soft text-risk-moderate border-risk-moderate/20", className)} title={tooltip}>
        <Clock className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} />
        {size === "sm" ? "Pendiente" : "Invitación pendiente"}
      </span>
    );
  }

  return (
    <span className={cn(base, sizing, "bg-bg-100 text-ink-500 border-line-200", className)} title="Aún no se ha enviado invitación al portal.">
      <UserPlus className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} />
      {size === "sm" ? "Sin invitar" : "Sin invitación"}
    </span>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const diffMs = Date.now() - then;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "hace un momento";
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `hace ${diffHr} h`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `hace ${diffDay} d`;
  return new Date(iso).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
}
