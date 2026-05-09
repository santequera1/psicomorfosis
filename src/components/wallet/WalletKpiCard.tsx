/**
 * Card "Mis cuentas" como un 5to KPI del mismo tamaño que los otros
 * (Recaudado, Por cobrar, Vencidos, Total).
 *
 * En lugar del stack apilado vertical (que crecía mucho la altura del
 * card), usamos un carrusel horizontal: solo UNA tarjeta visible a la
 * vez, con flechas ‹ › y dots paginadores para navegar entre cuentas.
 * Mismo tamaño visual que los otros KpiCard, mismo comportamiento en
 * desktop y mobile.
 *
 * Click en la tarjeta visible → abre el editor de esa cuenta.
 * "+ Agregar" en el header → modal de nueva cuenta.
 *
 * Bug histórico (z-index): antes las tarjetas usaban z-index 100+ en
 * el stack y se veían a través del modal de "Nuevo recibo" (z-50).
 * Ahora todo el carrusel queda por debajo de z-50.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CreditCard, Plus, ChevronLeft, ChevronRight } from "lucide-react";
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
  const [activeIdx, setActiveIdx] = useState(0);

  // Si las cuentas cambian (se borra una), mantenemos el index dentro
  // del rango. Si quedaba en idx=2 y ahora hay 2 cuentas (max idx=1),
  // volvemos al inicio.
  const safeIdx = accounts.length > 0
    ? Math.min(activeIdx, accounts.length - 1)
    : 0;
  const current = accounts[safeIdx];

  const goPrev = () => setActiveIdx((i) =>
    accounts.length === 0 ? 0 : (i - 1 + accounts.length) % accounts.length,
  );
  const goNext = () => setActiveIdx((i) =>
    accounts.length === 0 ? 0 : (i + 1) % accounts.length,
  );

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
        ) : (
          <>
            {/* Track horizontal: una tarjeta visible, transición suave
                con translateX. Carrusel sin overflow horizontal — el
                container clipea las hermanas y solo se ve la activa. */}
            <div className="relative overflow-hidden rounded-lg">
              <div
                className="flex transition-transform duration-300 ease-out"
                style={{ transform: `translateX(-${safeIdx * 100}%)` }}
              >
                {accounts.map((acc) => (
                  <div key={acc.id} className="w-full shrink-0">
                    <BankCard
                      size="mini"
                      bankId={acc.bankId}
                      label={acc.label}
                      last4={acc.last4}
                      holderName={acc.holderName}
                      accountType={acc.accountType}
                      brand={acc.brand}
                      onClick={() => setEditing(acc)}
                      className="shadow-card hover:shadow-modal transition-shadow"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Navegación: flechas a los lados + dots paginadores en el
                centro. Solo cuando hay >1 cuenta. */}
            {accounts.length > 1 && (
              <div className="flex items-center justify-between gap-1.5 -mt-0.5">
                <button
                  onClick={goPrev}
                  className="h-6 w-6 rounded-md text-ink-500 hover:bg-bg-100 hover:text-ink-900 inline-flex items-center justify-center shrink-0"
                  aria-label="Cuenta anterior"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <div className="flex items-center gap-1">
                  {accounts.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setActiveIdx(idx)}
                      className={cn(
                        "h-1.5 rounded-full transition-all duration-200",
                        idx === safeIdx
                          ? "w-4 bg-brand-700"
                          : "w-1.5 bg-line-200 hover:bg-ink-300",
                      )}
                      aria-label={`Cuenta ${idx + 1}`}
                    />
                  ))}
                </div>
                <button
                  onClick={goNext}
                  className="h-6 w-6 rounded-md text-ink-500 hover:bg-bg-100 hover:text-ink-900 inline-flex items-center justify-center shrink-0"
                  aria-label="Cuenta siguiente"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {creating && <BankAccountModal onClose={() => setCreating(false)} />}
      {editing && <BankAccountModal account={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
