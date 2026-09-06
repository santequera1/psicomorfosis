import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X, Bug, FileText, Megaphone, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { api, getStoredUser } from "@/lib/api";
import { hasCompletedTour } from "@/lib/tour";
import { TOUR_NAMES } from "@/lib/tours";

/**
 * Botón "Novedades" en el Topbar: icono Sparkles con badge de no
 * leídas. Al hacer click abre el modal con la lista de anuncios.
 *
 * Auto-show: si el user tiene anuncios RECIENTES sin leer y no los ha
 * visto en esta sesión del browser, el modal se abre automáticamente.
 * Usamos sessionStorage (no localStorage) para que abra UNA vez por
 * pestaña — si el user cierra y vuelve, los ve de nuevo si todavía no
 * marcó leído. Para no abrir en cada navegación dentro de la sesión.
 *
 * Tres condiciones frenan el auto-show, y las tres existen por la misma
 * razón: no apilar ventanas encima del usuario que acaba de entrar.
 *
 *   1. Antigüedad. Una cuenta nueva tiene TODO sin leer, incluidos
 *      anuncios de hace meses. Abrirle "Dictado por voz disponible"
 *      (mayo) como si fuera noticia es ruido. Solo auto-abrimos lo
 *      publicado en los últimos 30 días; lo viejo sigue en la lista,
 *      accesible desde el botón, pero no interrumpe.
 *   2. Términos pendientes. El gate legal es bloqueante; un modal
 *      encima de otro es inusable.
 *   3. Tour de bienvenida sin completar. Quien entra por primera vez
 *      está haciendo el tour — las novedades esperan a la próxima.
 *
 * El estado isRead lo persiste el backend (tabla announcement_reads).
 */
const SESSION_AUTOSHOW_KEY = "psm.announcements.shownThisSession";

/** Ventana de "esto todavía es noticia". */
const AUTOSHOW_MAX_AGE_DAYS = 30;

export function AnnouncementsButton() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  // staleTime 60s — no necesitamos polling agresivo. refetchOnMount=false
  // para que navegar entre rutas no re-pida.
  const { data } = useQuery({
    queryKey: ["announcements"],
    queryFn: () => api.listAnnouncements(),
    staleTime: 60_000,
    refetchOnMount: false,
  });
  const unreadCount = data?.unreadCount ?? 0;
  const items = data?.items ?? [];

  // Mismo queryKey que PendingLegalGate → sale de caché, sin request extra.
  const user = getStoredUser();
  const { data: legal, isLoading: legalLoading } = useQuery({
    queryKey: ["legal-pending", user?.id],
    queryFn: () => api.legalMyPending(),
    enabled: !!user && !user.isLegalAdmin,
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  });
  const hasPendingLegal = (legal?.pending ?? []).length > 0;

  const hasFreshUnread = items.some(
    (a) => !a.isRead && Date.now() - new Date(a.publishedAt).getTime()
      < AUTOSHOW_MAX_AGE_DAYS * 24 * 60 * 60 * 1000,
  );

  // Auto-show la primera vez en la sesión, si nada más está ocupando
  // la pantalla y hay algo que de verdad sea nuevo.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!hasFreshUnread) return;
    if (legalLoading || hasPendingLegal) return;
    // La asesora legal aterriza en /legal-admin, donde el tour de
    // bienvenida no corre nunca — si la condicionáramos a completarlo,
    // no vería jamás un anuncio.
    if (!user?.isLegalAdmin && !hasCompletedTour(TOUR_NAMES.welcome)) return;
    if (sessionStorage.getItem(SESSION_AUTOSHOW_KEY) === "1") return;
    setOpen(true);
    sessionStorage.setItem(SESSION_AUTOSHOW_KEY, "1");
  }, [hasFreshUnread, legalLoading, hasPendingLegal, user?.isLegalAdmin]);

  const markAllRead = useMutation({
    mutationFn: async () => {
      const unread = items.filter((a) => !a.isRead);
      await Promise.all(unread.map((a) => api.markAnnouncementRead(a.id)));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["announcements"] });
    },
  });

  function handleClose() {
    // Cerrar el modal marca todo como leído. El user vio la lista,
    // no necesita seguir viendo el badge.
    if (unreadCount > 0) markAllRead.mutate();
    setOpen(false);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title={unreadCount > 0 ? `${unreadCount} novedades` : "Novedades"}
        aria-label="Novedades"
        className="relative h-10 w-10 rounded-lg border border-line-200 bg-surface text-ink-700 hover:border-brand-400 transition-colors flex items-center justify-center"
      >
        <Megaphone className="h-4 w-4" />
        {unreadCount > 0 && (
          <span
            className="absolute top-1.5 right-1.5 h-4 min-w-4 px-1 rounded-full bg-brand-700 text-white text-[10px] font-semibold flex items-center justify-center ring-2 ring-surface tabular"
            aria-label={`${unreadCount} sin leer`}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && <AnnouncementsModal items={items} onClose={handleClose} />}
    </>
  );
}

interface Announcement {
  id: number;
  title: string;
  body: string;
  category: "feature" | "fix" | "note";
  imageUrl: string | null;
  publishedAt: string;
  isRead: boolean;
}

/** Máximo de tarjetas en el slider — lo más viejo deja de ser "novedad". */
const MAX_SLIDES = 10;

/**
 * Modal de novedades en formato SLIDER (rediseño 6 sep 2026): una
 * tarjeta grande por anuncio en vez de una lista — se navega con
 * swipe (scroll-snap nativo), flechas, puntos o ← →. Motivo: al
 * publicar varios estrenos a la vez, la lista se leía como changelog;
 * el slider los presenta uno a uno sin apilar cinco modales.
 */
function AnnouncementsModal({ items, onClose }: { items: Announcement[]; onClose: () => void }) {
  const slides = items.slice(0, MAX_SLIDES);
  const trackRef = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState(0);
  const isLast = idx >= slides.length - 1;

  function goTo(i: number) {
    const el = trackRef.current;
    if (!el) return;
    const clamped = Math.max(0, Math.min(i, slides.length - 1));
    el.scrollTo({ left: clamped * el.clientWidth, behavior: "smooth" });
  }

  // Esc cierra; ← → navegan. Click outside también cierra — los
  // anuncios son informativos, no hay progreso que perder.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") goTo((trackRef.current ? Math.round(trackRef.current.scrollLeft / trackRef.current.clientWidth) : 0) + 1);
      if (e.key === "ArrowLeft") goTo((trackRef.current ? Math.round(trackRef.current.scrollLeft / trackRef.current.clientWidth) : 0) - 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, slides.length]);

  // Portal al body — el modal se renderiza desde un botón en el Topbar
  // que está cerca de elementos con backdrop-blur (Topbar mismo,
  // headers sticky). backdrop-blur crea stacking context aislado y
  // el modal con z-50 queda atrapado debajo. Portal lo saca al raíz.
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-ink-900/40 backdrop-blur-sm pt-10 sm:pt-4 p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-surface shadow-modal overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-3.5 flex items-center justify-between gap-3 border-b border-line-100">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-widest text-brand-700 font-medium">Novedades</p>
            {slides.length > 1 && (
              <p className="text-xs text-ink-500 mt-0.5 tabular-nums">{idx + 1} de {slides.length}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="h-9 w-9 rounded-md border border-line-200 text-ink-500 hover:border-brand-400 flex items-center justify-center shrink-0"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {slides.length === 0 ? (
          <div className="px-5 py-14 text-center text-sm text-ink-500">
            Por ahora todo está al día — aquí verás lo nuevo cuando llegue.
          </div>
        ) : (
          <div className="relative">
            {/* Pista con scroll-snap: swipe nativo en táctil. */}
            <div
              ref={trackRef}
              onScroll={() => {
                const el = trackRef.current;
                if (!el) return;
                setIdx(Math.max(0, Math.min(slides.length - 1, Math.round(el.scrollLeft / el.clientWidth))));
              }}
              className="flex overflow-x-auto snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {slides.map((a) => (
                <AnnouncementSlide key={a.id} item={a} />
              ))}
            </div>

            {/* Flechas — solo desktop; en móvil se desliza con el dedo. */}
            {slides.length > 1 && idx > 0 && (
              <button
                onClick={() => goTo(idx - 1)}
                aria-label="Anterior"
                className="hidden sm:flex absolute left-2 top-24 h-9 w-9 rounded-full bg-surface/90 border border-line-200 shadow-sm text-ink-700 hover:border-brand-400 items-center justify-center"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}
            {slides.length > 1 && !isLast && (
              <button
                onClick={() => goTo(idx + 1)}
                aria-label="Siguiente"
                className="hidden sm:flex absolute right-2 top-24 h-9 w-9 rounded-full bg-surface/90 border border-line-200 shadow-sm text-ink-700 hover:border-brand-400 items-center justify-center"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            )}
          </div>
        )}

        <footer className="px-5 py-3.5 border-t border-line-100 flex items-center justify-between gap-3">
          {/* Puntos de progreso */}
          <div className="flex items-center gap-1.5">
            {slides.length > 1 && slides.map((s, i) => (
              <button
                key={s.id}
                onClick={() => goTo(i)}
                aria-label={`Ir a la novedad ${i + 1}`}
                className={cn(
                  "h-2 rounded-full transition-all duration-300",
                  i === idx ? "w-5 bg-brand-700" : "w-2 bg-line-200 hover:bg-brand-300",
                )}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {slides.length > 1 && !isLast && (
              <button onClick={onClose} className="h-9 px-3 rounded-md text-xs text-ink-500 hover:text-ink-700">
                Saltar
              </button>
            )}
            <button
              onClick={() => (isLast || slides.length <= 1 ? onClose() : goTo(idx + 1))}
              className="h-9 px-4 rounded-md bg-brand-700 text-white text-xs font-medium hover:bg-brand-800 inline-flex items-center gap-1.5"
            >
              {isLast || slides.length <= 1 ? "Entendido" : (<>Siguiente <ChevronRight className="h-3.5 w-3.5" /></>)}
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

const CATEGORY_META: Record<Announcement["category"], { label: string; icon: typeof Megaphone; chip: string; panel: string; icoBg: string }> = {
  // Megaphone para 'feature' también — antes Sparkles que el user
  // asocia con IA. Megaphone refuerza la lectura 'anuncio'.
  feature: {
    label: "Nuevo", icon: Megaphone,
    chip: "bg-brand-700 text-white",
    panel: "from-brand-50 via-brand-100/60 to-bg-50",
    icoBg: "bg-brand-700 text-white",
  },
  fix: {
    label: "Mejora", icon: Bug,
    chip: "bg-amber-600 text-white",
    panel: "from-amber-50 via-amber-100/50 to-bg-50",
    icoBg: "bg-amber-600 text-white",
  },
  note: {
    label: "Aviso", icon: FileText,
    chip: "bg-ink-700 text-white",
    panel: "from-bg-100 via-bg-50 to-bg-50",
    icoBg: "bg-ink-700 text-white",
  },
};

/** Una tarjeta del slider: panel visual arriba (imagen o icono decorativo) + texto. */
function AnnouncementSlide({ item }: { item: Announcement }) {
  const meta = CATEGORY_META[item.category] ?? CATEGORY_META.note;
  const Icon = meta.icon;
  return (
    <div className="w-full shrink-0 snap-center">
      {/* Panel visual */}
      {item.imageUrl ? (
        <div className="h-44 bg-bg-50 border-b border-line-100 overflow-hidden">
          <img src={item.imageUrl} alt={`Captura: ${item.title}`} loading="lazy" className="w-full h-full object-cover object-top" />
        </div>
      ) : (
        <div className={cn("relative h-36 bg-linear-to-br border-b border-line-100 overflow-hidden", meta.panel)}>
          {/* Aros decorativos */}
          <div className="absolute -right-8 -top-10 h-40 w-40 rounded-full border-10 border-brand-700/10" />
          <div className="absolute right-14 top-14 h-24 w-24 rounded-full border-8 border-brand-700/10" />
          <span className={cn("absolute left-5 bottom-5 h-12 w-12 rounded-xl shadow-lg flex items-center justify-center", meta.icoBg)}>
            <Icon className="h-5 w-5" />
          </span>
          <span className={cn("absolute right-4 top-4 px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wide font-semibold", meta.chip)}>
            {meta.label}
          </span>
        </div>
      )}
      {/* Contenido */}
      <div className="px-5 sm:px-6 pt-4 pb-5 min-h-40 max-h-72 overflow-y-auto">
        <div className="flex items-center gap-2 flex-wrap">
          <h4 className="font-serif text-xl text-ink-900 leading-tight">{item.title}</h4>
          {!item.isRead && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-brand-700 text-white text-[9px] uppercase tracking-wide font-semibold">
              Nuevo
            </span>
          )}
        </div>
        <p className="mt-2.5 text-sm text-ink-700 leading-relaxed whitespace-pre-wrap">{item.body}</p>
        <p className="mt-3 text-[11px] text-ink-400">{formatDate(item.publishedAt)}</p>
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  // El backend devuelve "YYYY-MM-DD HH:MM:SS" (SQLite default).
  // Convertimos a "30 may 2026" — fecha corta, sin hora, en español.
  try {
    const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
    return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", year: "numeric" }).format(d);
  } catch {
    return iso;
  }
}
