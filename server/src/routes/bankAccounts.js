/**
 * Wallet — cuentas bancarias del workspace.
 *
 * El psicólogo registra las cuentas a las que recibe pagos (Bancolombia,
 * Nequi, Daviplata, …) y luego las elige al crear un recibo. La UI
 * renderiza cada cuenta como tarjeta visual estilo banco (BankCard) en
 * /facturacion.
 *
 * Reglas:
 *   - Solo ve sus propias cuentas (filtradas por workspace_id).
 *   - is_default es exclusivo: marcar una desmarca las demás del workspace.
 *   - El borrado es lógico (archived_at) para no romper recibos previos.
 *     SET NULL en la FK invoices.bank_account_id manejaría el caso si
 *     forzamos DELETE, pero preferimos archivar para preservar contexto.
 */

import { Router } from "express";
import { db } from "../db.js";
import { requireAuth } from "../auth.js";

const router = Router();
router.use(requireAuth);

const ws = (req) => req.user.workspace_id;
const now = () => new Date().toISOString();

// Catálogo válido del frontend (lib/banks.ts). Cualquier otro valor
// se acepta pero se renderiza con el preset "otra" en el cliente.
const VALID_TYPES = new Set(["ahorros", "corriente", "nequi", "daviplata", "otra"]);
const VALID_BRANDS = new Set(["mastercard", "visa", "amex", "none"]);

function rowToAccount(r) {
  if (!r) return null;
  return {
    id: r.id,
    bankId: r.bank_id,
    label: r.label,
    accountType: r.account_type,
    last4: r.last4,
    holderName: r.holder_name,
    brand: r.brand ?? "none",
    isDefault: !!r.is_default,
    archivedAt: r.archived_at,
    createdAt: r.created_at,
  };
}

router.get("/", (req, res) => {
  const includeArchived = req.query.includeArchived === "true";
  const sql = includeArchived
    ? "SELECT * FROM bank_accounts WHERE workspace_id = ? ORDER BY is_default DESC, archived_at IS NOT NULL, created_at DESC"
    : "SELECT * FROM bank_accounts WHERE workspace_id = ? AND archived_at IS NULL ORDER BY is_default DESC, created_at DESC";
  const rows = db.prepare(sql).all(ws(req));
  res.json(rows.map(rowToAccount));
});

router.get("/:id", (req, res) => {
  const r = db.prepare("SELECT * FROM bank_accounts WHERE id = ? AND workspace_id = ?")
    .get(Number(req.params.id), ws(req));
  if (!r) return res.status(404).json({ error: "Cuenta no encontrada" });
  res.json(rowToAccount(r));
});

router.post("/", (req, res) => {
  const { bankId, label, accountType, last4, holderName, brand, isDefault } = req.body ?? {};
  if (!bankId || typeof bankId !== "string") {
    return res.status(400).json({ error: "bankId requerido" });
  }
  if (!label || typeof label !== "string" || !label.trim()) {
    return res.status(400).json({ error: "label requerido" });
  }
  if (accountType && !VALID_TYPES.has(accountType)) {
    return res.status(400).json({ error: "accountType inválido" });
  }
  if (last4 && !/^\d{4}$/.test(String(last4))) {
    return res.status(400).json({ error: "last4 debe tener exactamente 4 dígitos" });
  }
  const finalBrand = VALID_BRANDS.has(brand) ? brand : "none";

  // is_default exclusivo por workspace: si la nueva es default, las
  // demás se desmarcan en la misma transacción.
  const tx = db.transaction(() => {
    if (isDefault) {
      db.prepare("UPDATE bank_accounts SET is_default = 0 WHERE workspace_id = ?").run(ws(req));
    }
    return db.prepare(`
      INSERT INTO bank_accounts (
        workspace_id, bank_id, label, account_type, last4, holder_name,
        brand, is_default, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      ws(req), bankId, label.trim(),
      accountType ?? null,
      last4 ? String(last4) : null,
      holderName ?? null,
      finalBrand,
      isDefault ? 1 : 0,
      now(),
    ).lastInsertRowid;
  });

  const id = tx();
  const r = db.prepare("SELECT * FROM bank_accounts WHERE id = ?").get(id);
  res.status(201).json(rowToAccount(r));
});

router.patch("/:id", (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT * FROM bank_accounts WHERE id = ? AND workspace_id = ?")
    .get(id, ws(req));
  if (!existing) return res.status(404).json({ error: "Cuenta no encontrada" });

  const { bankId, label, accountType, last4, holderName, brand, isDefault } = req.body ?? {};
  const updates = [];
  const args = [];
  if (bankId !== undefined) { updates.push("bank_id = ?"); args.push(bankId); }
  if (label !== undefined) {
    if (!label || !String(label).trim()) {
      return res.status(400).json({ error: "label no puede ir vacío" });
    }
    updates.push("label = ?"); args.push(String(label).trim());
  }
  if (accountType !== undefined) {
    if (accountType !== null && !VALID_TYPES.has(accountType)) {
      return res.status(400).json({ error: "accountType inválido" });
    }
    updates.push("account_type = ?"); args.push(accountType ?? null);
  }
  if (last4 !== undefined) {
    if (last4 !== null && !/^\d{4}$/.test(String(last4))) {
      return res.status(400).json({ error: "last4 debe tener exactamente 4 dígitos" });
    }
    updates.push("last4 = ?"); args.push(last4 ? String(last4) : null);
  }
  if (holderName !== undefined) { updates.push("holder_name = ?"); args.push(holderName ?? null); }
  if (brand !== undefined) {
    updates.push("brand = ?");
    args.push(VALID_BRANDS.has(brand) ? brand : "none");
  }
  if (updates.length === 0 && isDefault === undefined) {
    return res.json(rowToAccount(existing));
  }

  const tx = db.transaction(() => {
    if (isDefault === true) {
      db.prepare("UPDATE bank_accounts SET is_default = 0 WHERE workspace_id = ? AND id != ?")
        .run(ws(req), id);
      updates.push("is_default = 1");
    } else if (isDefault === false) {
      updates.push("is_default = 0");
    }
    if (updates.length > 0) {
      args.push(id);
      db.prepare(`UPDATE bank_accounts SET ${updates.join(", ")} WHERE id = ?`).run(...args);
    }
  });
  tx();

  const r = db.prepare("SELECT * FROM bank_accounts WHERE id = ?").get(id);
  res.json(rowToAccount(r));
});

/**
 * DELETE archiva la cuenta (soft delete) en lugar de borrarla. Los
 * recibos vinculados conservan su bank_account_id apuntando a la
 * cuenta archivada — la UI sigue mostrándola como referencia
 * histórica, pero no aparece en los selectores ni en el wallet
 * activo. Si quieres cambio de estado activo/inactivo en la UI,
 * usa este DELETE; para recuperar, hay que tocar la DB manualmente
 * (no exponemos un "unarchive" porque no es un caso típico).
 */
router.delete("/:id", (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT * FROM bank_accounts WHERE id = ? AND workspace_id = ?")
    .get(id, ws(req));
  if (!existing) return res.status(404).json({ error: "Cuenta no encontrada" });
  if (existing.archived_at) {
    // Idempotente: ya estaba archivada.
    return res.json({ ok: true, alreadyArchived: true });
  }
  // Si era la default, simplemente la archivamos. La UI puede
  // proponer marcar otra como default si queda alguna activa.
  db.prepare("UPDATE bank_accounts SET archived_at = ?, is_default = 0 WHERE id = ?")
    .run(now(), id);
  res.json({ ok: true });
});

export default router;
