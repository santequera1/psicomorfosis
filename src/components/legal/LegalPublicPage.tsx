/**
 * Página pública de un documento legal.
 *
 * Carga la última versión publicada del slug indicado vía
 * `/api/legal/public/<slug>`. Renderiza el HTML con el mismo styling
 * que el editor TipTap (clase `psm-editor-content`) para que la
 * vista coincida con la previsualización del asesor legal.
 *
 * Mejoras visuales sobre la versión anterior hardcodeada:
 *   - Banner superior "Vigente desde DD/MM/AAAA · 2026-vN".
 *   - Tabla de contenidos lateral sticky generada a partir de los <h2>
 *     del HTML. Cada heading recibe un `id` slugificado y la TOC apunta
 *     ahí con scroll suave.
 *   - Estado de carga / error / "no publicado" claros.
 *
 * Si el endpoint falla (sin red, doc no publicado), mostramos un
 * mensaje útil y un link al inicio. Nunca un placeholder genérico.
 */

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, AlertCircle, Clock } from "lucide-react";
import { api } from "@/lib/api";
import { PortalCanvas } from "@/routes/p_.activar.$token";

interface Heading {
  id: string;
  text: string;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function LegalPublicPage({ slug, fallbackTitle }: { slug: string; fallbackTitle: string }) {
  // staleTime 0 + refetch on focus/mount: la página legal es pública y la
  // asesor puede publicar una nueva versión en cualquier momento. Si
  // dejábamos cache largo en el cliente, después de publicar el redactor
  // veía la versión vieja al recargar. El backend ya tiene Cache-Control
  // max-age=30 must-revalidate + ETag, así que un revalidate solo
  // descarga el body cuando cambió de verdad.
  const { data, isLoading, isError } = useQuery({
    queryKey: ["legal-public", slug],
    queryFn: () => api.legalGetPublic(slug),
    retry: 1,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  // Inyectamos id slugificado y scroll-margin-top a cada h2 del HTML
  // para anclar la TOC y para que al hacer click en el ancla el heading
  // no quede pegado al borde superior de la ventana (queda con un offset).
  // Memoizado por bodyHtml.
  const { html, headings } = useMemo(() => {
    if (!data?.bodyHtml) return { html: "", headings: [] as Heading[] };
    const out: Heading[] = [];
    const used = new Set<string>();
    const withIds = data.bodyHtml.replace(
      /<h2(\s[^>]*)?>([\s\S]*?)<\/h2>/gi,
      (_m, attrs, inner) => {
        const text = inner.replace(/<[^>]+>/g, "").trim();
        let id = slugify(text);
        let attempt = 1;
        while (used.has(id)) id = `${slugify(text)}-${++attempt}`;
        used.add(id);
        out.push({ id, text });
        return `<h2 id="${id}" style="scroll-margin-top:96px"${attrs ?? ""}>${inner}</h2>`;
      },
    );
    return { html: withIds, headings: out };
  }, [data?.bodyHtml]);

  // Highlight activo del TOC. Estrategia simple: en cada scroll buscamos
  // el último heading cuyo top esté por encima de un umbral fijo (100px
  // del viewport top). Es más predecible que IntersectionObserver para
  // documentos largos donde múltiples headings caben en el viewport.
  const [activeId, setActiveId] = useState<string | null>(null);
  const articleRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!html || headings.length === 0) return;
    const THRESHOLD = 110; // pixels desde el top del viewport
    function pickActive() {
      const root = articleRef.current;
      if (!root) return;
      let candidate: string | null = null;
      for (const h of headings) {
        const el = root.querySelector(`#${CSS.escape(h.id)}`);
        if (!el) continue;
        const top = el.getBoundingClientRect().top;
        if (top - THRESHOLD <= 0) candidate = h.id;
        else break;
      }
      // Si todos están por debajo del umbral (estamos arriba del todo),
      // marcamos el primero como activo para que el TOC no quede vacío.
      setActiveId(candidate ?? headings[0].id);
    }
    pickActive();
    const onScroll = () => pickActive();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [html, headings]);

  return (
    <PortalCanvas width="wide">
      <div className="max-w-5xl mx-auto">
        {isLoading && (
          <div className="flex items-center justify-center py-20 text-ink-400">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}

        {isError && !isLoading && (
          <div className="rounded-xl border border-warning/30 bg-warning-soft p-8 text-center">
            <AlertCircle className="h-10 w-10 text-warning mx-auto mb-3" />
            <h2 className="font-serif text-xl text-ink-900">{fallbackTitle}</h2>
            <p className="text-sm text-ink-700 mt-2 max-w-md mx-auto">
              El documento aún no se ha publicado. Si crees que esto es un error,
              contacta a <a href="mailto:santequera@wailus.co" className="text-brand-700 underline">santequera@wailus.co</a>.
            </p>
            <div className="mt-5">
              <Link to="/login" className="text-sm text-brand-700 underline">Volver al inicio</Link>
            </div>
          </div>
        )}

        {data && !isLoading && !isError && (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_240px] gap-8">
            <article ref={articleRef}>
              <header className="mb-7 pb-6 border-b border-line-200">
                <p className="text-xs uppercase tracking-widest text-brand-700 font-medium">
                  Documento legal
                </p>
                <h1 className="font-serif text-3xl sm:text-4xl text-ink-900 mt-2 leading-tight">
                  {data.title}
                </h1>
                <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-ink-500">
                  <span className="inline-flex items-center gap-1.5 bg-success-soft text-success border border-success/20 px-2 py-1 rounded-md">
                    <Clock className="h-3 w-3" />
                    Vigente desde {formatDate(data.publishedAt)}
                  </span>
                  <span className="font-mono text-ink-500">Versión {data.versionLabel}</span>
                </div>
                {/* Solo mostramos el "Cambios respecto a la versión anterior"
                    cuando efectivamente hay una versión anterior archivada.
                    En la primera publicación de un documento el summary
                    suele ser metadato técnico ("Importación inicial…") que
                    no aporta al lector externo. */}
                {data.hasPreviousVersion && data.summaryOfChanges && (
                  <p className="text-xs text-ink-500 mt-3 italic max-w-2xl">
                    Cambios respecto a la versión anterior: {data.summaryOfChanges}
                  </p>
                )}
              </header>

              <div
                className="psm-editor-content max-w-none"
                // eslint-disable-next-line react/no-danger
                dangerouslySetInnerHTML={{ __html: html }}
              />

              <footer className="mt-12 pt-6 border-t border-line-200 text-sm text-ink-500">
                <Link to="/privacidad" className="text-brand-700 hover:underline">Aviso de privacidad</Link>
                {" · "}
                <Link to="/terminos" className="text-brand-700 hover:underline">Términos y condiciones</Link>
                {" · "}
                <Link to="/login" className="text-brand-700 hover:underline">Volver al inicio</Link>
              </footer>
            </article>

            {headings.length > 0 && (
              <aside className="hidden lg:block">
                <nav className="sticky top-24">
                  <div className="text-[11px] uppercase tracking-wider text-ink-400 font-semibold mb-3">
                    En esta página
                  </div>
                  <ul className="space-y-1.5 text-sm border-l border-line-200">
                    {headings.map((h) => (
                      <li key={h.id}>
                        <a
                          href={`#${h.id}`}
                          className={`block pl-4 -ml-px border-l-2 transition-colors ${
                            activeId === h.id
                              ? "border-brand-700 text-brand-800 font-medium"
                              : "border-transparent text-ink-500 hover:text-ink-900"
                          }`}
                        >
                          {h.text}
                        </a>
                      </li>
                    ))}
                  </ul>
                </nav>
              </aside>
            )}
          </div>
        )}
      </div>
    </PortalCanvas>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}
