/**
 * Card "Mis cuentas" como 5to KPI compacto.
 *
 * Layout responsive con dos comportamientos distintos según breakpoint:
 *
 *   - Desktop (lg+): carrusel de UNA tarjeta con flechas ‹ › y dots.
 *     Padding mínimo en el card padre para que la tarjeta interior
 *     ocupe casi todo el ancho del KPI (~220px), dando aspect-ratio
 *     real de tarjeta de débito (8:5 = 1.6) sin verse cuadrada.
 *
 *   - Mobile / tablet (< lg): grid horizontal scrolleable con varias
 *     tarjetas pequeñitas lado a lado (auto-cols 120px). El wallet
 *     NO debe robar protagonismo al feed de recibos en mobile — es
 *     un complemento, no la pieza principal de la pantalla.
 *
 * Click en una tarjeta: abre editor.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CreditCard, Plus } from "lucide-react";
import { api, type BankAccount } from "@/lib/api";
import { BankCard } from "./BankCard";
import { BankAccountModal } from "./BankAccountModal";
import { cn } from "@/lib/utils";

interface Props {
  className?: string;
}

export function WalletKpiCard({ className }: Props) {
  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["bank-accounts", "active"],
    queryFn: () => api.listBankAccounts(),
    refetchOnMount: "always",
  });
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<BankAccount | null>(null);

  return (
    <>
      <div className={cn(
        // Padding ajustado: sm=2.5/2 para que en desktop la tarjeta
        // interior aproveche casi todo el ancho del KPI, dando una
        // proporción real de tarjeta y no un cuadrado.
        "rounded-xl border border-line-200 bg-surface px-2.5 py-2 shadow-xs flex flex-col gap-1.5",
        className,
      )}>
        <div className="flex items-center justify-between gap-2 px-0.5">
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
          <div className="space-y-1.5">
            <div className="h-12 rounded-lg bg-bg-100 w-full animate-pulse" />
            <div className="h-12 rounded-lg bg-bg-100 w-full animate-pulse" />
          </div>
        ) : accounts.length === 0 ? (
          <button
            onClick={() => setCreating(true)}
            className="rounded-lg border border-dashed border-line-200 bg-bg-50 hover:bg-bg-100 hover:border-brand-400 h-12 w-full flex items-center justify-center gap-1.5 text-ink-500 transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span className="text-[11px] font-medium">Agrega tu primera cuenta</span>
          </button>
        ) : (
          // Lista de franjas horizontales. Más compacta que el carrusel
          // de tarjeta visual: cada cuenta ocupa ~48px en vez de ~124px.
          // max-h con scroll por si hay muchas cuentas (raro, pero no
          // queremos que el KPI crezca sin límite).
          <div className="flex flex-col gap-1.5 max-h-44 overflow-y-auto -mr-1 pr-1">
            {accounts.map((acc) => (
              <BankCard
                key={acc.id}
                size="strip"
                bankId={acc.bankId}
                label={acc.label}
                last4={acc.last4}
                holderName={acc.holderName}
                accountType={acc.accountType}
                brand={acc.brand}
                onClick={() => setEditing(acc)}
                className="shadow-xs"
              />
            ))}
          </div>
        )}
      </div>

      {creating && <BankAccountModal onClose={() => setCreating(false)} />}
      {editing && <BankAccountModal account={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
