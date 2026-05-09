/**
 * Card "Mis cuentas" estilo Apple Wallet.
 *
 * Layout responsive:
 *   - Mobile / tablet (col-span ancho): tarjetas en grid horizontal
 *     con auto-cols de ancho fijo + scroll snap. Caben varias a la
 *     vez con feel de carrusel.
 *   - Desktop (col-span-1 estrecho): stack apilado. La del frente
 *     se ve completa (en flow normal); las demás asoman con `top`
 *     absoluto sobre el padding-top del contenedor. Click en una
 *     atrás la trae al frente con animación.
 *
 * Diseño:
 *   - Las tarjetas usan aspect-[320/202] (ratio físico de tarjeta de
 *     débito) en vez de altura fija — el ancho lo dicta el padre y
 *     la altura sale proporcional, así nunca se ven "como pastilla".
 *   - Hover sobre cada tarjeta: lift -2px + sombra reforzada.
 *   - Transición entre vista colapsada y expandida: fade-in + slide.
 *
 * Bug histórico (a veces salían 3, a veces 4 cuentas):
 *   - WalletKpiCard usaba listBankAccounts() (solo activas).
 *   - La tabla de recibos usaba listBankAccounts({ includeArchived: true }).
 *   - Ambas compartían queryKey ["bank-accounts"], así que React
 *     Query servía la cache de quien hubiera montado primero,
 *     mostrando datos inconsistentes entre vistas.
 *   - Fix: queryKey diferenciada por modo ("active" vs "all").
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CreditCard, Plus, ChevronDown, ChevronUp } from "lucide-react";
import { api, type BankAccount } from "@/lib/api";
import { BankCard } from "./BankCard";
import { BankAccountModal } from "./BankAccountModal";
import { cn } from "@/lib/utils";

interface Props {
  className?: string;
}

// Cuánto asoma cada tarjeta detrás (px) en el stack vertical desktop.
const PEEK = 22;
// Ancho fijo de cada tarjeta en el carrusel horizontal mobile.
const MOBILE_CARD_W = 180;

export function WalletKpiCard({ className }: Props) {
  // queryKey "active" para distinguir de la tabla de recibos que pide
  // includeArchived=true. Antes ambas compartían cache y producía
  // conteos inestables al refrescar.
  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["bank-accounts", "active"],
    queryFn: () => api.listBankAccounts(),
    refetchOnMount: "always",
  });

  const [expanded, setExpanded] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<BankAccount | null>(null);
  const [topId, setTopId] = useState<number | null>(null);

  // La tarjeta del frente del stack: la elegida por click, o la default
  // del workspace, o la primera. effectiveTopId siempre apunta a una
  // cuenta existente (no se queda colgado en una eliminada).
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const fallbackTop = accounts.find((a) => a.isDefault)?.id ?? accounts[0]?.id ?? null;
  const effectiveTopId =
    (topId != null && accountById.has(topId) ? topId : null) ?? fallbackTop;

  // Orden visual del stack: tarjetas que asoman atrás primero, la del
  // frente al final del array (mayor z-index, en flow normal).
  const stackOrder = (() => {
    if (effectiveTopId == null) return accounts;
    const front = accounts.find((a) => a.id === effectiveTopId);
    if (!front) return accounts;
    return [...accounts.filter((a) => a.id !== front.id), front];
  })();

  const peeks = stackOrder.slice(0, -1);
  const front = stackOrder[stackOrder.length - 1];

  return (
    <>
      <div className={cn(
        "rounded-xl border border-line-200 bg-surface px-2.5 py-2 sm:px-4 sm:py-3 shadow-xs flex flex-col gap-2",
        className,
      )}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <CreditCard className="h-3.5 w-3.5 text-ink-400 shrink-0" />
            <span className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">
              Mis cuentas
            </span>
          </div>
          <button
            onClick={() => setCreating(true)}
            className="text-[11px] text-brand-700 hover:underline inline-flex items-center gap-0.5 shrink-0"
          >
            <Plus className="h-3 w-3" /> Agregar
          </button>
        </div>

        {isLoading ? (
          <div className="rounded-lg bg-bg-100 aspect-[320/202] w-full animate-pulse" />
        ) : accounts.length === 0 ? (
          <button
            onClick={() => setCreating(true)}
            className="rounded-lg border border-dashed border-line-200 bg-bg-50 hover:bg-bg-100 hover:border-brand-400 aspect-[320/202] w-full flex flex-col items-center justify-center gap-1 text-ink-500 transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span className="text-[11px] font-medium text-center px-3">Agrega tu primera cuenta</span>
          </button>
        ) : expanded ? (
          /* Modo expandido: lista vertical separada, sin apilamiento.
             Animado con fade + slide al entrar. */
          <>
            <div className="flex flex-col gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
              {accounts.map((acc) => (
                <CardSlot key={acc.id} acc={acc} onClick={() => setEditing(acc)} />
              ))}
            </div>
            <button
              onClick={() => setExpanded(false)}
              className="text-[11px] text-ink-500 hover:text-ink-900 text-center inline-flex items-center justify-center gap-1 mt-1"
            >
              <ChevronUp className="h-3 w-3" /> Colapsar
            </button>
          </>
        ) : (
          <>
            {/* ── Mobile/tablet: carrusel horizontal con scroll snap ──
                grid grid-flow-col + auto-cols-[180px] mantiene cada
                tarjeta a su ancho exacto y permite scroll horizontal
                sin que pelee con flex-1. */}
            <div className="lg:hidden grid grid-flow-col auto-cols-[180px] gap-3 overflow-x-auto -mx-1 px-1 pb-1 snap-x snap-mandatory">
              {accounts.map((acc) => (
                <div key={acc.id} className="snap-start">
                  <CardSlot acc={acc} onClick={() => setEditing(acc)} />
                </div>
              ))}
            </div>

            {/* ── Desktop col-span-1: stack apilado tipo Apple Wallet.
                padding-top reserva el espacio de los peeks; las tarjetas
                de atrás se posicionan absolutas dentro de ese padding,
                la del frente va en flow normal y define la altura
                final del contenedor (gracias a su aspect-ratio).
                Animación spring (300ms) al cambiar de tarjeta al frente. */}
            <div
              className="hidden lg:block relative animate-in fade-in duration-300"
              style={{ paddingTop: `${peeks.length * PEEK}px` }}
            >
              {peeks.map((acc, slot) => (
                <div
                  key={acc.id}
                  className="absolute left-0 right-0 transition-all duration-300 ease-out"
                  style={{ top: slot * PEEK, zIndex: 10 + slot }}
                >
                  <CardSlot
                    acc={acc}
                    onClick={() => setTopId(acc.id)}
                    subtle
                  />
                </div>
              ))}
              {front && (
                <div
                  key={front.id}
                  className="relative transition-all duration-300 ease-out"
                  style={{ zIndex: 100 }}
                >
                  <CardSlot acc={front} onClick={() => setEditing(front)} />
                </div>
              )}
            </div>

            {accounts.length > 1 && (
              <button
                onClick={() => setExpanded(true)}
                className="text-[11px] text-brand-700 hover:underline text-center inline-flex items-center justify-center gap-1 mt-1"
              >
                <ChevronDown className="h-3 w-3" />
                Ver todas las cuentas ({accounts.length})
              </button>
            )}
          </>
        )}
      </div>

      {creating && <BankAccountModal onClose={() => setCreating(false)} />}
      {editing && <BankAccountModal account={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

/**
 * Wrapper de BankCard con efecto hover (lift -2px + shadow). Lo
 * extraje para no repetir clases entre mobile/desktop/expandido.
 * `subtle=true` aplica una sombra menor (para las que están atrás
 * en el stack y no deben competir visualmente con la del frente).
 */
function CardSlot({
  acc, onClick, subtle,
}: {
  acc: BankAccount;
  onClick: () => void;
  subtle?: boolean;
}) {
  return (
    <BankCard
      size="mini"
      bankId={acc.bankId}
      label={acc.label}
      last4={acc.last4}
      holderName={acc.holderName}
      accountType={acc.accountType}
      brand={acc.brand}
      onClick={onClick}
      className={cn(
        "transition-all duration-200 ease-out hover:-translate-y-0.5",
        subtle ? "shadow-soft hover:shadow-card" : "shadow-card hover:shadow-modal",
      )}
    />
  );
}
