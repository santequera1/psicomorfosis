/**
 * Pila de tarjetas estilo Apple Wallet.
 *
 * Las tarjetas se renderizan absolutamente posicionadas dentro de un
 * contenedor con altura fija. La activa se ve completa en el top; las
 * demás "asoman" debajo apilándose con un offset incremental — exacto
 * el patrón de Wallet en iOS donde alcanzas a leer la cabecera de las
 * tarjetas que están detrás.
 *
 * Click en una tarjeta de la pila → se vuelve activa con animación.
 * Click en la activa → ejecuta `onCardEdit(account)` (abrir editor).
 *
 * Diseño:
 *   - Altura del contenedor: alto de la activa (md ≈ 192px) + N-1
 *     "asomas" de PEEK_HEIGHT cada una (~44px). Así con 3 tarjetas
 *     ocupa ~280px, suficiente para verlas todas sin scroll.
 *   - Para 5+ tarjetas, dejamos el contenedor con altura fija máxima
 *     y las del fondo se condensan más juntas.
 *   - Transición spring-like con `transition-all duration-300 ease-out`.
 */

import { useState } from "react";
import { Plus } from "lucide-react";
import { BankCard } from "./BankCard";
import type { BankAccount } from "@/lib/api";
import { cn } from "@/lib/utils";

interface Props {
  accounts: BankAccount[];
  /** Callback al click en la tarjeta activa (top de la pila). */
  onCardEdit: (account: BankAccount) => void;
  /** Callback al click en el botón "agregar" del fondo de la pila. */
  onAdd: () => void;
}

const CARD_HEIGHT = 192; // h-48 en md aprox
const PEEK_HEIGHT = 50;  // cuánto asoma cada tarjeta detrás

export function WalletStack({ accounts, onCardEdit, onAdd }: Props) {
  const [activeIdx, setActiveIdx] = useState(0);

  if (accounts.length === 0) return null;

  // Cuando el usuario presiona una tarjeta del fondo, la traemos al top
  // y "rotamos" el orden visual: la que estaba arriba pasa al fondo.
  // De esa forma la pila siempre crece "hacia abajo".
  const orderedIndices = (() => {
    const arr: number[] = [];
    for (let i = 0; i < accounts.length; i++) {
      arr.push((activeIdx + i) % accounts.length);
    }
    return arr;
  })();

  const totalHeight = CARD_HEIGHT + Math.max(0, accounts.length - 1) * PEEK_HEIGHT;

  return (
    <div
      className="relative w-full max-w-md mx-auto"
      style={{ height: totalHeight }}
    >
      {orderedIndices.map((accIdx, slot) => {
        const acc = accounts[accIdx];
        const isActive = slot === 0;
        const top = slot * PEEK_HEIGHT;
        return (
          <div
            key={acc.id}
            className={cn(
              "absolute left-0 right-0 transition-all duration-300 ease-out",
            )}
            style={{
              top,
              // Z-index local al stack (max 10) — no compite con topbar
              // (z-30) ni con modales (z-50). El active queda al frente
              // dentro de la pila, las que asoman atrás siguen detrás.
              zIndex: 10 - slot,
              transform: isActive ? "scale(1)" : `scale(${1 - slot * 0.02})`,
            }}
          >
            <BankCard
              bankId={acc.bankId}
              label={acc.label}
              last4={acc.last4}
              holderName={acc.holderName}
              accountType={acc.accountType}
              brand={acc.brand}
              size="md"
              onClick={() => {
                if (isActive) {
                  onCardEdit(acc);
                } else {
                  setActiveIdx(accIdx);
                }
              }}
              className={cn(
                "shadow-card",
                !isActive && "shadow-soft",
              )}
            />
          </div>
        );
      })}
    </div>
  );
}

/**
 * Variante sin tarjetas: muestra el placeholder grande para invitar a
 * agregar la primera. Se usa cuando `accounts` está vacío y la
 * `WalletStack` no tendría qué pintar.
 */
export function WalletEmpty({ onAdd }: { onAdd: () => void }) {
  return (
    <button
      onClick={onAdd}
      className="w-full max-w-md mx-auto rounded-2xl border-2 border-dashed border-line-200 bg-bg-50 hover:bg-bg-100 hover:border-brand-400 px-6 py-10 text-center transition-colors group"
    >
      <div className="mx-auto h-10 w-10 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
        <Plus className="h-5 w-5" />
      </div>
      <div className="font-medium text-sm text-ink-900">Agrega tu primera cuenta</div>
      <p className="text-xs text-ink-500 mt-1 max-w-md mx-auto">
        Registra Bancolombia, Nequi, Daviplata o cualquier otra. Al cobrar
        podrás elegir a cuál te transfirieron y los reportes te mostrarán
        cuánto entró por cada cuenta.
      </p>
    </button>
  );
}
