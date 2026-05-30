/**
 * Card "Mis cuentas" — versión minimalista.
 *
 * Solo muestra el contador de cuentas activas y los botones para
 * agregar nueva o ver el listado. Click en el número abre un modal
 * de gestión con la lista de cuentas (cada una editable). Antes la
 * card listaba todas las cuentas inline como franjas — visualmente
 * pesado, sobre todo cuando hay 3-4 cuentas con colores distintos.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CreditCard, Plus, X } from "lucide-react";
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
  const [listOpen, setListOpen] = useState(false);

  const total = accounts.length;
  const totalLabel = total === 1 ? "cuenta activa" : "cuentas activas";

  return (
    <>
      <div className={cn(
        "rounded-xl border border-line-200 bg-surface px-4 py-3 shadow-xs flex flex-col gap-2",
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
          <div className="h-14 rounded-lg bg-bg-100 animate-pulse" />
        ) : total === 0 ? (
          <button
            onClick={() => setCreating(true)}
            className="rounded-lg border border-dashed border-line-200 bg-bg-50 hover:bg-bg-100 hover:border-brand-400 py-3 px-3 w-full flex items-center justify-center gap-1.5 text-ink-500 transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span className="text-[11px] font-medium">Agrega tu primera cuenta</span>
          </button>
        ) : (
          // Contador grande, todo el ancho. Click → abre modal con la
          // lista de cuentas (cada una editable). No mostrar las cuentas
          // inline: en pantallas pequeñas era un muro de bloques de color
          // que rompía la estética calmada del resto del KPI grid.
          <button
            onClick={() => setListOpen(true)}
            className="text-left rounded-lg hover:bg-bg-100/60 px-1 py-1 -mx-1 transition-colors"
            title="Ver y editar tus cuentas"
          >
            <div className="text-2xl font-serif tabular text-ink-900 leading-tight">
              {total}
            </div>
            <div className="text-[11px] text-ink-500 mt-0.5">
              {totalLabel} <span className="text-brand-700">· ver lista</span>
            </div>
          </button>
        )}
      </div>

      {creating && <BankAccountModal onClose={() => setCreating(false)} />}
      {editing && <BankAccountModal account={editing} onClose={() => setEditing(null)} />}
      {listOpen && (
        <AccountsListModal
          accounts={accounts}
          onClose={() => setListOpen(false)}
          onEdit={(acc) => { setListOpen(false); setEditing(acc); }}
          onAdd={() => { setListOpen(false); setCreating(true); }}
        />
      )}
    </>
  );
}

function AccountsListModal({
  accounts, onClose, onEdit, onAdd,
}: {
  accounts: BankAccount[];
  onClose: () => void;
  onEdit: (acc: BankAccount) => void;
  onAdd: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink-900/40 backdrop-blur-sm pt-16 p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-surface shadow-modal overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-4 border-b border-line-100 flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-brand-700 font-medium">
              Wallet
            </p>
            <h3 className="font-serif text-xl text-ink-900 mt-0.5">Mis cuentas</h3>
            <p className="text-xs text-ink-500 mt-1">
              Click en una cuenta para editar. Las cuentas archivadas no aparecen aquí.
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

        <div className="p-4 space-y-2 max-h-96 overflow-y-auto">
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
              onClick={() => onEdit(acc)}
            />
          ))}
        </div>

        <footer className="px-5 py-3 border-t border-line-100 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="h-9 px-3 rounded-md border border-line-200 text-sm text-ink-700 hover:border-brand-400"
          >
            Cerrar
          </button>
          <button
            onClick={onAdd}
            className="h-9 px-3 rounded-md bg-brand-700 text-white text-sm font-medium hover:bg-brand-800 inline-flex items-center gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" /> Agregar cuenta
          </button>
        </footer>
      </div>
    </div>
  );
}
