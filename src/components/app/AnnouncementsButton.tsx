import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles, X, Bug, FileText, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

/**
 * Botón "Novedades" en el Topbar: icono Sparkles con badge de no
 * leídas. Al hacer click abre el modal con la lista de anuncios.
 *
 * Auto-show: si el user tiene anuncios sin leer y no los ha visto en
 * esta sesión del browser, el modal se abre automáticamente al cargar.
 * Usamos sessionStorage (no localStorage) para que abra UNA vez por
 * pestaña — si el user cierra y vuelve, los ve de nuevo si todavía no
 * marcó leído. Para no abrir en cada navegación dentro de la sesión.
 *
 * El estado isRead lo persiste el backend (tabla announcement_reads).
 */
const SESSION_AUTOSHOW_KEY = "psm.announcements.shownThisSession";

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

  // Auto-show la primera vez en la sesión si hay no leídas.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (unreadCount === 0) return;
    if (sessionStorage.getItem(SESSION_AUTOSHOW_KEY) === "1") return;
    setOpen(true);
    sessionStorage.setItem(SESSION_AUTOSHOW_KEY, "1");
  }, [unreadCount]);

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
        <Sparkles className="h-4 w-4" />
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
  publishedAt: string;
  isRead: boolean;
}

function AnnouncementsModal({ items, onClose }: { items: Announcement[]; onClose: () => void }) {
  // Esc para cerrar. Click outside también — los anuncios son
  // informativos, no hay progreso que perder.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink-900/40 backdrop-blur-sm pt-16 p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-surface shadow-modal overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-4 border-b border-line-100 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-widest text-brand-700 font-medium">Novedades</p>
            <h3 className="font-serif text-xl text-ink-900 mt-0.5">¿Qué hay de nuevo en Psicomorfosis?</h3>
            <p className="text-xs text-ink-500 mt-1">
              {items.length === 0
                ? "Por ahora todo está al día."
                : "Estamos construyendo activamente con las psicólogas que la usan."}
            </p>
          </div>
          <button
            onClick={onClose}
            className="h-9 w-9 rounded-md border border-line-200 text-ink-500 hover:border-brand-400 flex items-center justify-center shrink-0"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="max-h-[60vh] overflow-y-auto">
          {items.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-ink-500">
              Aún no hay anuncios publicados.
            </div>
          ) : (
            <ul className="divide-y divide-line-100">
              {items.map((a) => (
                <AnnouncementItem key={a.id} item={a} />
              ))}
            </ul>
          )}
        </div>

        <footer className="px-5 py-3 border-t border-line-100 flex items-center justify-between gap-3 text-xs text-ink-500">
          <span>Tu opinión cuenta — escríbenos por el botón de soporte.</span>
          <button
            onClick={onClose}
            className="h-8 px-3 rounded-md bg-brand-700 text-white text-xs font-medium hover:bg-brand-800"
          >
            Entendido
          </button>
        </footer>
      </div>
    </div>
  );
}

const CATEGORY_META: Record<Announcement["category"], { label: string; icon: typeof Sparkles; bg: string; fg: string }> = {
  feature: { label: "Nuevo", icon: Sparkles, bg: "bg-brand-50 border-brand-200", fg: "text-brand-800" },
  fix: { label: "Mejora", icon: Bug, bg: "bg-amber-50 border-amber-200", fg: "text-amber-800" },
  note: { label: "Aviso", icon: FileText, bg: "bg-bg-100 border-line-200", fg: "text-ink-700" },
};

function AnnouncementItem({ item }: { item: Announcement }) {
  const meta = CATEGORY_META[item.category] ?? CATEGORY_META.note;
  const Icon = meta.icon;
  const date = formatDate(item.publishedAt);
  return (
    <li className={cn("px-5 py-4 transition-colors", !item.isRead && "bg-brand-50/30")}>
      <div className="flex items-start gap-3">
        <span className={cn(
          "h-8 w-8 rounded-lg border inline-flex items-center justify-center shrink-0",
          meta.bg, meta.fg,
        )}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-serif text-base text-ink-900 leading-tight">{item.title}</h4>
            {!item.isRead && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-brand-700 text-white text-[9px] uppercase tracking-wide font-semibold">
                Nuevo
              </span>
            )}
          </div>
          <p className="mt-1.5 text-sm text-ink-700 leading-relaxed whitespace-pre-wrap">{item.body}</p>
          <p className="mt-2 text-[11px] text-ink-400 inline-flex items-center gap-1.5">
            <MessageCircle className="h-3 w-3" />
            <span>{meta.label}</span>
            <span className="text-ink-300">·</span>
            <span>{date}</span>
          </p>
        </div>
      </div>
    </li>
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
