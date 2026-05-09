/**
 * Card "Mis cuentas" con apariencia y tamaño de KpiCard.
 *
 * Vive en la fila de KPIs de /facturacion como 5to elemento. Muestra:
 *   - Header "MIS CUENTAS" + acción "+ Agregar".
 *   - 1 tarjeta colapsada (la default o la primera) cuando hay >1 cuenta.
 *     Botón inferior "+ Ver todas las cuentas (N)" para expandir.
 *   - Cuando se expande: stack de todas las tarjetas apiladas (con offset
 *     pequeño cada una), botón "Colapsar" al final.
 *   - Click en cualquier tarjeta abre el editor de esa cuenta.
 *   - Empty state con CTA "Agrega tu primera cuenta" si no hay ninguna.
 *
 * Diseño compacto: las tarjetas usan size="mini" (h-20, rounded-xl) para
 * que el card del KPI no crezca demasiado. Cuando expandido, el card
 * crece naturalmente hacia abajo y rompe la grid del KPI grid (el
 * contenedor padre ya está como `items-start` así que no se deforma
 * verticalmente con vecinos).
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CreditCard, Plus, ChevronDown, ChevronUp } from "lucide-react";
import { api, type BankAccount } from "@/lib/api";
import { BankCard } from "./BankCard";
import { BankAccountModal } from "./BankAccountModal";

export function WalletKpiCard() {
  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["bank-accounts"],
    queryFn: () => api.listBankAccounts(),
  });
  const [expanded, setExpanded] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<BankAccount | null>(null);

  // Cuenta destacada para vista colapsada: la default o la primera.
  const featured = accounts.find((a) => a.isDefault) ?? accounts[0] ?? null;

  return (
    <>
      <div className="rounded-xl border border-line-200 bg-surface px-2.5 py-2 sm:px-4 sm:py-3 shadow-xs flex flex-col gap-2">
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
          <div className="rounded-xl bg-bg-100 h-20 animate-pulse" />
        ) : accounts.length === 0 ? (
          <button
            onClick={() => setCreating(true)}
            className="rounded-xl border border-dashed border-line-200 bg-bg-50 hover:bg-bg-100 hover:border-brand-400 h-20 flex flex-col items-center justify-center gap-1 text-ink-500 transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span className="text-[11px] font-medium">Agrega tu primera cuenta</span>
          </button>
        ) : !expanded ? (
          <>
            {featured && (
              <BankCard
                size="mini"
                bankId={featured.bankId}
                label={featured.label}
                last4={featured.last4}
                holderName={featured.holderName}
                accountType={featured.accountType}
                brand={featured.brand}
                onClick={() => setEditing(featured)}
              />
            )}
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
        ) : (
          <>
            {/* Stack apilado vertical — cada tarjeta asoma -8px sobre la
                anterior para emular el efecto wallet sin ocupar tanto. */}
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
        )}
      </div>

      {creating && <BankAccountModal onClose={() => setCreating(false)} />}
      {editing && <BankAccountModal account={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
