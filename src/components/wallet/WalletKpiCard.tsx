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

  const safeIdx = accounts.length > 0
    ? Math.min(activeIdx, accounts.length - 1)
    : 0;

  const goPrev = () => setActiveIdx((i) =>
    accounts.length === 0 ? 0 : (i - 1 + accounts.length) % accounts.length,
  );
  const goNext = () => setActiveIdx((i) =>
    accounts.length === 0 ? 0 : (i + 1) % accounts.length,
  );

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
          <div className="rounded-lg bg-bg-100 aspect-[8/5] w-full animate-pulse" />
        ) : accounts.length === 0 ? (
          <button
            onClick={() => setCreating(true)}
            className="rounded-lg border border-dashed border-line-200 bg-bg-50 hover:bg-bg-100 hover:border-brand-400 aspect-[8/5] w-full flex flex-col items-center justify-center gap-1 text-ink-500 transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span className="text-[11px] font-medium text-center px-3">Agrega tu primera cuenta</span>
          </button>
        ) : (
          <>
            {/* ── Mobile/tablet: grid horizontal con tarjetas pequeñas
                (~120px ancho). El wallet no debe ser protagonista en
                mobile — los recibos son lo principal. snap-mandatory
                para que el scroll quede limpio. */}
            <div className="lg:hidden grid grid-flow-col auto-cols-[120px] gap-2 overflow-x-auto -mx-1 px-1 pb-1 snap-x snap-mandatory">
              {accounts.map((acc) => (
                <div key={acc.id} className="snap-start">
                  <BankCard
                    size="mini"
                    bankId={acc.bankId}
                    label={acc.label}
                    last4={acc.last4}
                    holderName={acc.holderName}
                    accountType={acc.accountType}
                    brand={acc.brand}
                    onClick={() => setEditing(acc)}
                    className="shadow-card"
                  />
                </div>
              ))}
            </div>

            {/* ── Desktop: carrusel de una sola tarjeta con flechas y
                dots. La tarjeta tiene aspect 8/5 (~1.6) — un poco más
                rectangular que el ratio físico real (1.585) para
                contrarrestar la sensación visual "cuadrada" en cards
                estrechos del KPI grid. */}
            <div className="hidden lg:block">
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
            </div>

            {accounts.length > 1 && (
              <div className="hidden lg:flex items-center justify-between gap-1.5">
                <button
                  onClick={goPrev}
                  className="h-5 w-5 rounded-md text-ink-500 hover:bg-bg-100 hover:text-ink-900 inline-flex items-center justify-center shrink-0"
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
                  className="h-5 w-5 rounded-md text-ink-500 hover:bg-bg-100 hover:text-ink-900 inline-flex items-center justify-center shrink-0"
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
