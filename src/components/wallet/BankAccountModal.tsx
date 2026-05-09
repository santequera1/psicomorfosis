/**
 * Modal para crear o editar una cuenta bancaria del wallet del psicólogo.
 *
 * Pantallas:
 *   - Si no se le pasa `account`: modo crear, formulario en blanco con
 *     bankId="bancolombia" por default.
 *   - Si recibe `account`: modo editar, pre-rellena los campos.
 *
 * Diseño: a la izquierda los campos del form, a la derecha un preview
 * en vivo de la BankCard tal como quedará. Esto hace evidente el
 * impacto visual de cada cambio (banco, label, last4, brand).
 */

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { X, Loader2, Trash2 } from "lucide-react";
import { api, type BankAccount, type BankAccountInput } from "@/lib/api";
import { BANK_CHOICES, ACCOUNT_TYPE_LABEL, type BankBrand, type AccountType, type CardBrand } from "@/lib/banks";
import { BankCard } from "./BankCard";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";

interface Props {
  account?: BankAccount;
  onClose: () => void;
}

export function BankAccountModal({ account, onClose }: Props) {
  const isEditing = !!account;
  const qc = useQueryClient();

  const [bankId, setBankId] = useState<BankBrand>(
    (account?.bankId as BankBrand) ?? "bancolombia",
  );
  const [label, setLabel] = useState(account?.label ?? "");
  const [accountType, setAccountType] = useState<AccountType | "">(
    (account?.accountType as AccountType) ?? "ahorros",
  );
  const [last4, setLast4] = useState(account?.last4 ?? "");
  const [holderName, setHolderName] = useState(account?.holderName ?? "");
  const [brand, setBrand] = useState<CardBrand>(account?.brand ?? "none");
  const [isDefault, setIsDefault] = useState<boolean>(account?.isDefault ?? false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const saveMut = useMutation({
    mutationFn: () => {
      const payload: BankAccountInput = {
        bankId,
        label: label.trim() || BANK_CHOICES.find((b) => b.id === bankId)?.name || "Cuenta",
        accountType: accountType || null,
        last4: last4.trim() || null,
        holderName: holderName.trim() || null,
        brand,
        isDefault,
      };
      return account
        ? api.updateBankAccount(account.id, payload)
        : api.createBankAccount(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bank-accounts"] });
      toast.success(isEditing ? "Cuenta actualizada" : "Cuenta agregada");
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo guardar la cuenta"),
  });

  const deleteMut = useMutation({
    mutationFn: () => api.deleteBankAccount(account!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bank-accounts"] });
      toast.success("Cuenta eliminada");
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo eliminar la cuenta"),
  });

  const canSubmit = !!bankId && !saveMut.isPending;

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-ink-900/50 backdrop-blur-sm flex items-center justify-center px-4"
        onClick={onClose}
      >
        <div
          className="w-full max-w-3xl bg-surface rounded-xl border border-line-200 shadow-modal max-h-[92vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <header className="px-5 py-4 border-b border-line-200 flex items-center justify-between gap-3 shrink-0">
            <div>
              <h3 className="font-serif text-lg text-ink-900">
                {isEditing ? "Editar cuenta" : "Agregar cuenta"}
              </h3>
              <p className="text-xs text-ink-500">
                Las cuentas aparecen al registrar pagos y en tu wallet.
              </p>
            </div>
            <button
              onClick={onClose}
              className="h-8 w-8 rounded-md text-ink-500 hover:bg-bg-100 flex items-center justify-center"
              aria-label="Cerrar"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <div className="flex-1 overflow-y-auto px-5 py-4 grid grid-cols-1 md:grid-cols-[1fr_320px] gap-6">
            {/* Form */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-ink-700 mb-1.5">Banco</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {BANK_CHOICES.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => setBankId(b.id)}
                      className={`h-10 px-2 rounded-md text-xs font-medium border transition-colors ${
                        bankId === b.id
                          ? "border-brand-700 bg-brand-50 text-brand-800"
                          : "border-line-200 bg-surface text-ink-700 hover:border-brand-400"
                      }`}
                    >
                      {b.name}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-ink-700 mb-1.5">
                  Nombre <span className="text-ink-400 font-normal">(cómo la llamas)</span>
                </label>
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Ej: Cuenta principal"
                  className="w-full h-11 rounded-lg border border-line-200 bg-surface px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-ink-700 mb-1.5">Tipo</label>
                  <select
                    value={accountType}
                    onChange={(e) => setAccountType(e.target.value as AccountType)}
                    className="w-full h-11 rounded-lg border border-line-200 bg-surface px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                  >
                    {(["ahorros", "corriente", "nequi", "daviplata", "otra"] as const).map((t) => (
                      <option key={t} value={t}>{ACCOUNT_TYPE_LABEL[t]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-ink-700 mb-1.5">
                    Últimos 4 <span className="text-ink-400 font-normal">(opcional)</span>
                  </label>
                  <input
                    type="text"
                    value={last4}
                    onChange={(e) => setLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    placeholder="0000"
                    inputMode="numeric"
                    pattern="\d{4}"
                    className="w-full h-11 rounded-lg border border-line-200 bg-surface px-3 text-sm tabular focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-ink-700 mb-1.5">
                  Titular <span className="text-ink-400 font-normal">(opcional)</span>
                </label>
                <input
                  type="text"
                  value={holderName}
                  onChange={(e) => setHolderName(e.target.value)}
                  placeholder="Si difiere de tu nombre"
                  className="w-full h-11 rounded-lg border border-line-200 bg-surface px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-ink-700 mb-1.5">
                  Tipo de tarjeta <span className="text-ink-400 font-normal">(opcional)</span>
                </label>
                <div className="flex gap-2">
                  {(["none", "mastercard", "visa", "amex"] as const).map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => setBrand(b)}
                      className={`h-10 px-3 rounded-md text-xs font-medium border transition-colors ${
                        brand === b
                          ? "border-brand-700 bg-brand-50 text-brand-800"
                          : "border-line-200 bg-surface text-ink-700 hover:border-brand-400"
                      }`}
                    >
                      {b === "none" ? "Sin marca" : b === "mastercard" ? "Mastercard" : b === "visa" ? "Visa" : "Amex"}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isDefault}
                  onChange={(e) => setIsDefault(e.target.checked)}
                  className="h-4 w-4 rounded border-line-200"
                />
                <span className="text-sm text-ink-700">
                  Cuenta predeterminada — se preselecciona en nuevos recibos
                </span>
              </label>
            </div>

            {/* Preview */}
            <div className="space-y-2">
              <div className="text-xs font-medium text-ink-500 uppercase tracking-wider">Vista previa</div>
              <BankCard
                bankId={bankId}
                label={label || BANK_CHOICES.find((b) => b.id === bankId)?.name || "Cuenta"}
                last4={last4 || null}
                holderName={holderName || null}
                accountType={accountType || null}
                brand={brand}
              />
              <p className="text-[11px] text-ink-500 leading-relaxed">
                Se mostrará así en tu wallet de la sección Recibos.
              </p>
            </div>
          </div>

          <footer className="px-5 py-4 border-t border-line-200 flex items-center gap-2 shrink-0">
            {isEditing && (
              <button
                onClick={() => setConfirmDelete(true)}
                disabled={saveMut.isPending || deleteMut.isPending}
                className="h-10 px-3 rounded-lg text-sm text-error hover:bg-error-soft inline-flex items-center gap-2 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" /> Eliminar
              </button>
            )}
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={onClose}
                disabled={saveMut.isPending}
                className="h-10 px-4 rounded-lg text-sm text-ink-700 hover:bg-bg-100 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => saveMut.mutate()}
                disabled={!canSubmit}
                className="h-10 px-4 rounded-lg bg-brand-700 text-white text-sm font-medium hover:bg-brand-800 disabled:opacity-50 inline-flex items-center gap-2"
              >
                {saveMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {isEditing ? "Guardar cambios" : "Agregar cuenta"}
              </button>
            </div>
          </footer>
        </div>
      </div>

      {confirmDelete && account && (
        <ConfirmDialog
          title="Eliminar cuenta"
          message={`Vas a eliminar "${account.label}". Los recibos vinculados a esta cuenta conservarán la referencia (la cuenta queda archivada). ¿Confirmas?`}
          confirmLabel="Sí, eliminar"
          cancelLabel="Cancelar"
          danger
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            setConfirmDelete(false);
            deleteMut.mutate();
          }}
        />
      )}
    </>
  );
}
