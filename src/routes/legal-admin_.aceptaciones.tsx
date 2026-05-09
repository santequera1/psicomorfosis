/**
 * /legal-admin/aceptaciones — audit log de aceptaciones legales.
 *
 * Lista paginada de las aceptaciones registradas (cuándo, quién, qué
 * versión, IP, user-agent). Sirve como prueba ante SIC si hay un
 * reclamo. Filtro opcional por documento.
 */

import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, ClipboardCheck, User, FileText, Filter } from "lucide-react";
import { api, getStoredUser } from "@/lib/api";
import { LegalAdminShell } from "./legal-admin";

export const Route = createFileRoute("/legal-admin_/aceptaciones")({
  head: () => ({ meta: [{ title: "Aceptaciones · Asesoría legal" }] }),
  validateSearch: (s): { slug?: string } => {
    const v = s.slug;
    return typeof v === "string" && v ? { slug: v } : {};
  },
  component: AceptacionesPage,
});

function AceptacionesPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [allowed, setAllowed] = useState(false);
  const [slug, setSlug] = useState<string>(search.slug ?? "");
  const [offset, setOffset] = useState(0);
  const limit = 50;

  useEffect(() => {
    const u = getStoredUser();
    if (!u || !u.isLegalAdmin) {
      navigate({ to: "/" });
      return;
    }
    setAllowed(true);
  }, [navigate]);

  const { data: docs } = useQuery({
    queryKey: ["legal-admin-docs"],
    queryFn: () => api.legalAdminListDocuments(),
    enabled: allowed,
  });
  const { data, isLoading } = useQuery({
    queryKey: ["legal-acceptances", slug, offset],
    queryFn: () => api.legalAdminListAcceptances({ slug: slug || undefined, limit, offset }),
    enabled: allowed,
  });

  if (!allowed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-50">
        <Loader2 className="h-5 w-5 animate-spin text-ink-400" />
      </div>
    );
  }

  const total = data?.total ?? 0;
  const rows = data?.rows ?? [];
  const showing = `${offset + 1}–${Math.min(offset + limit, total)} de ${total}`;

  return (
    <LegalAdminShell
      title="Aceptaciones registradas"
      subtitle="Cada vez que un usuario acepta un documento legal queda registrado aquí. Sirve como prueba ante la SIC."
    >
      {/* Filtro */}
      <div className="rounded-xl border border-line-200 bg-surface p-4 mb-5 flex flex-wrap items-center gap-3">
        <Filter className="h-4 w-4 text-ink-500" />
        <span className="text-sm text-ink-700">Documento:</span>
        <select
          value={slug}
          onChange={(e) => { setSlug(e.target.value); setOffset(0); }}
          className="h-9 rounded-md border border-line-200 bg-surface px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
        >
          <option value="">Todos</option>
          {docs?.map((d) => (
            <option key={d.id} value={d.slug}>{d.title}</option>
          ))}
        </select>
        {total > 0 && (
          <span className="ml-auto text-xs text-ink-500">{showing}</span>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-ink-400">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line-200 bg-bg-50 p-12 text-center">
          <ClipboardCheck className="h-10 w-10 text-ink-300 mx-auto mb-3" />
          <p className="text-sm text-ink-500">No hay aceptaciones registradas todavía.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-line-200 bg-surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-bg-50 text-xs uppercase tracking-wide text-ink-500">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Cuándo</th>
                  <th className="text-left px-4 py-3 font-medium">Quién</th>
                  <th className="text-left px-4 py-3 font-medium">Documento</th>
                  <th className="text-left px-4 py-3 font-medium">Versión</th>
                  <th className="text-left px-4 py-3 font-medium">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-100">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-bg-50">
                    <td className="px-4 py-3 text-ink-700 tabular">
                      <div>{formatDate(r.accepted_at)}</div>
                      <div className="text-[11px] text-ink-500">{formatTime(r.accepted_at)}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-[10px] font-semibold shrink-0">
                          {(r.user_name ?? r.patient_name ?? "?").split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="text-ink-900 truncate">{r.user_name ?? r.patient_name ?? "—"}</div>
                          <div className="text-[11px] text-ink-500 truncate">
                            {r.patient_id ? "Paciente" : (r.user_email ?? "Staff")}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        to="/legal-admin/$slug"
                        params={{ slug: r.document_slug }}
                        className="text-ink-700 hover:text-brand-700"
                      >
                        {r.document_title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-ink-700 tabular">{r.version_label}</td>
                    <td className="px-4 py-3 text-ink-500 tabular text-xs">{r.ip ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Paginación */}
          {total > limit && (
            <div className="border-t border-line-100 px-4 py-3 flex items-center justify-between text-xs text-ink-500">
              <button
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - limit))}
                className="px-3 py-1.5 rounded-md hover:bg-bg-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ← Anterior
              </button>
              <span>{showing}</span>
              <button
                disabled={offset + limit >= total}
                onClick={() => setOffset(offset + limit)}
                className="px-3 py-1.5 rounded-md hover:bg-bg-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Siguiente →
              </button>
            </div>
          )}
        </div>
      )}
    </LegalAdminShell>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
}
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
}
