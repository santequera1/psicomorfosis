/**
 * Card "Mis cuentas" con apariencia de KpiCard.
 *
 * Vive en la fila de KPIs de /facturacion como 5to elemento. Layout
 * responsive según el ancho del card:
 *
 *   - Mobile / tablet (col-span ancho): tarjetas en fila horizontal
 *     con scroll si no caben. Caben varias a la vez.
 *
 *   - Desktop (col-span-1 estrecho): stack apilado tipo Apple Wallet.
 *     Solo la tarjeta del frente se ve completa; las demás asoman ~14
 *     pixels por la parte superior. Click en una de atrás la trae al
 *     frente con animación. Click en la del frente abre el editor.
 *
 * En ambos casos hay botón "Ver todas (N)" cuando hay más de 1 cuenta
 * y botón "Colapsar" para volver al estado de 1 visible. La vista
 * expandida muestra todas las tarjetas separadas verticalmente.
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

// Cuánto asoma cada tarjeta detrás (px) en el stack vertical.
const PEEK = 22;
// Altura aprox de la tarjeta mini en el componente BankCard (h-20).
const CARD_H = 80;

export function WalletKpiCard({ className }: Props) {
  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["bank-accounts"],
    queryFn: () => api.listBankAccounts(),
  });
  const [expanded, setExpanded] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<BankAccount | null>(null);
  // Índice de la tarjeta al frente del stack. Por default la default
  // del workspace (o la primera). Si el usuario hace click en una
  // asomando, esa pasa al frente.
  const [topId, setTopId] = useState<number | null>(null);

  // Ordenamos: las inactivas primero (más atrás) y la "topId" al final
  // (visualmente al frente). Si topId es null, usamos la default.
  const effectiveTopId = topId ?? accounts.find((a) => a.isDefault)?.id ?? accounts[0]?.id ?? null;
  const stackOrder = (() => {
    if (effectiveTopId == null) return accounts;
    const top = accounts.find((a) => a.id === effectiveTopId);
    if (!top) return accounts;
    return [...accounts.filter((a) => a.id !== top.id), top];
  })();

  const stackHeight = CARD_H + Math.max(0, accounts.length - 1) * PEEK;

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
          <div className="rounded-lg bg-bg-100 h-20 animate-pulse" />
        ) : accounts.length === 0 ? (
          <button
            onClick={() => setCreating(true)}
            className="rounded-lg border border-dashed border-line-200 bg-bg-50 hover:bg-bg-100 hover:border-brand-400 h-20 flex flex-col items-center justify-center gap-1 text-ink-500 transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span className="text-[11px] font-medium">Agrega tu primera cuenta</span>
          </button>
        ) : expanded ? (
          /* ── Modo expandido: lista vertical compacta con todas ── */
          <>
            <div className="flex flex-col gap-2 animate-in fade-in duration-200">
              {accounts.map((acc) => (
                <BankCard
                  key={acc.id}
                  size="mini"
                  bankId={acc.bankId}
                  label={acc.label}
                  last4={acc.last4}
                  holderName={acc.holderName}
                  accountType={acc.accountType}
                  brand={acc.brand}
                  onClick={() => setEditing(acc)}
                />
              ))}
            </div>
            <button
              onClick={() => setExpanded(false)}
              className="text-[11px] text-ink-500 hover:text-ink-900 text-center inline-flex items-center justify-center gap-1 mt-0.5"
            >
              <ChevronUp className="h-3 w-3" /> Colapsar
            </button>
          </>
        ) : (
          /* ── Modo colapsado: layout responsive ── */
          <>
            {/* Mobile/tablet: fila horizontal con scroll si no caben.
                Visible cuando el card ocupa más de 1 columna. */}
            <div className="flex lg:hidden gap-2 overflow-x-auto -mx-1 px-1 pb-1 snap-x snap-mandatory">
              {accounts.map((acc) => (
                <div key={acc.id} className="snap-center min-w-[200px] max-w-[260px] flex-1">
                  <BankCard
                    size="mini"
                    bankId={acc.bankId}
                    label={acc.label}
                    last4={acc.last4}
                    holderName={acc.holderName}
                    accountType={acc.accountType}
                    brand={acc.brand}
                    onClick={() => setEditing(acc)}
                  />
                </div>
              ))}
            </div>

            {/* Desktop col-span-1: pila apilada estilo Apple Wallet.
                Solo la del frente se ve completa; las demás asoman
                arriba. Click en una asomando la trae al frente. */}
            <div className="hidden lg:block relative" style={{ height: stackHeight }}>
              {stackOrder.map((acc, slot) => {
                const isFront = slot === stackOrder.length - 1;
                return (
                  <div
                    key={acc.id}
                    className="absolute left-0 right-0 transition-all duration-300 ease-out"
                    style={{
                      top: slot * PEEK,
                      zIndex: 10 + slot,
                      transform: isFront ? "scale(1)" : "scale(0.99)",
                    }}
                  >
                    <BankCard
                      size="mini"
                      bankId={acc.bankId}
                      label={acc.label}
                      last4={acc.last4}
                      holderName={acc.holderName}
                      accountType={acc.accountType}
                      brand={acc.brand}
                      onClick={() => {
                        if (isFront) {
                          setEditing(acc);
                        } else {
                          setTopId(acc.id);
                        }
                      }}
                      className={!isFront ? "shadow-soft" : "shadow-card"}
                    />
                  </div>
                );
              })}
            </div>

            {accounts.length > 1 && (
              <button
                onClick={() => setExpanded(true)}
                className="text-[11px] text-brand-700 hover:underline text-center inline-flex items-center justify-center gap-1 mt-0.5"
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
