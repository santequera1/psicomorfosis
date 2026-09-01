import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Upload, FileSpreadsheet, Loader2, X, Download, CheckCircle2, AlertTriangle } from "lucide-react";
import { api } from "@/lib/api";

/**
 * Importador de pacientes desde Excel/CSV (pedido 1 sep 2026: "cada
 * psicólogo nuevo llega con su Excel"). Tres pasos: archivo → mapeo de
 * columnas con vista previa → resultado. El parseo ocurre en el
 * navegador; al servidor solo viajan filas ya mapeadas a campos.
 */

type FieldKey = "name" | "phone" | "email" | "doc" | "age" | "sex" | "address" | "reason" | "skip";

const FIELDS: Array<{ key: FieldKey; label: string }> = [
  { key: "skip", label: "No importar" },
  { key: "name", label: "Nombre *" },
  { key: "phone", label: "Teléfono / WhatsApp" },
  { key: "email", label: "Correo" },
  { key: "doc", label: "Documento" },
  { key: "age", label: "Edad" },
  { key: "sex", label: "Sexo" },
  { key: "address", label: "Dirección" },
  { key: "reason", label: "Motivo de consulta" },
];

/** Sin tildes, minúsculas — para comparar encabezados escritos de cualquier forma. */
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

function guessField(header: string): FieldKey {
  const h = norm(header);
  if (!h) return "skip";
  if (h.includes("nombre") || h === "name" || h === "paciente") return "name";
  if (h.includes("tel") || h.includes("cel") || h.includes("whatsapp") || h.includes("movil") || h.includes("phone")) return "phone";
  if (h.includes("correo") || h.includes("mail")) return "email";
  if (h.includes("docu") || h.includes("cedula") || h.includes("identifi") || h === "cc" || h === "dni" || h === "nit") return "doc";
  if (h.includes("edad") || h === "age") return "age";
  if (h.includes("sexo") || h.includes("genero") || h === "sex") return "sex";
  if (h.includes("direc") || h.includes("address")) return "address";
  if (h.includes("motivo") || h.includes("consulta") || h.includes("diagn")) return "reason";
  return "skip";
}

/** Parser CSV con comillas y detección de delimitador (Excel es-CO exporta con «;»). */
function parseCsv(text: string): string[][] {
  const nl = text.indexOf("\n");
  const firstLine = nl === -1 ? text : text.slice(0, nl);
  const delim = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; } else inQ = false;
      } else cur += ch;
    } else if (ch === '"') {
      inQ = true;
    } else if (ch === delim) {
      row.push(cur); cur = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cur); rows.push(row); row = []; cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur !== "" || row.length > 0) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ""));
}

/** Lee el archivo como texto probando UTF-8 y cayendo a Windows-1252 (Excel viejo). */
async function readTextSmart(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const utf8 = new TextDecoder("utf-8").decode(buf);
  if ((utf8.match(/�/g) ?? []).length > 0) {
    return new TextDecoder("windows-1252").decode(buf);
  }
  return utf8;
}

function downloadTemplate() {
  const rows = [
    ["Nombre", "Teléfono", "Correo", "Documento", "Edad", "Sexo", "Dirección", "Motivo de consulta"],
    ["María Pérez García", "300 123 4567", "maria@ejemplo.com", "1023456789", "29", "F", "Cra 10 #20-30, Bogotá", "Ansiedad"],
  ];
  const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const utf8 = new TextEncoder().encode(csv);
  const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
  const blob = new Blob([bom, utf8], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "plantilla-pacientes.csv";
  a.click();
  URL.revokeObjectURL(url);
}

type ImportResult = { total: number; created: number; skipped: Array<{ index: number; name: string; reason: string }> };

export function ImportPatientsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<"file" | "map" | "done">("file");
  const [fileName, setFileName] = useState("");
  const [matrix, setMatrix] = useState<string[][]>([]);
  const [hasHeader, setHasHeader] = useState(true);
  const [mapping, setMapping] = useState<FieldKey[]>([]);
  const [sendWelcome, setSendWelcome] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  if (!open) return null;

  function reset() {
    setStep("file"); setFileName(""); setMatrix([]); setMapping([]);
    setSendWelcome(false); setResult(null); setHasHeader(true);
  }

  function close() { reset(); onClose(); }

  async function handleFile(file: File) {
    setParsing(true);
    try {
      let rows: string[][];
      if (/\.(xlsx|xls)$/i.test(file.name)) {
        const XLSX = await import("xlsx");
        const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        rows = (XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" }) as string[][])
          .map((r) => r.map((c) => String(c ?? "")))
          .filter((r) => r.some((c) => c.trim() !== ""));
      } else {
        rows = parseCsv(await readTextSmart(file));
      }
      if (rows.length === 0) { toast.error("El archivo está vacío o no se pudo leer."); return; }
      const cols = Math.max(...rows.map((r) => r.length));
      const header = rows[0].map((c) => String(c));
      const guessed = Array.from({ length: cols }, (_, i) => guessField(header[i] ?? ""));
      const headerLooksReal = guessed.some((g) => g !== "skip");
      setFileName(file.name);
      setMatrix(rows);
      setHasHeader(headerLooksReal);
      setMapping(headerLooksReal ? guessed : Array.from({ length: cols }, () => "skip" as FieldKey));
      setStep("map");
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo leer el archivo. ¿Es un CSV o Excel válido?");
    } finally {
      setParsing(false);
    }
  }

  const dataRows = hasHeader ? matrix.slice(1) : matrix;
  const nameMapped = mapping.includes("name");

  function mappedRows() {
    return dataRows.map((r) => {
      const out: Record<string, string> = {};
      mapping.forEach((field, i) => {
        if (field === "skip") return;
        const v = String(r[i] ?? "").trim();
        if (v) out[field] = v;
      });
      return out;
    }).filter((r) => (r.name ?? "").trim() !== "");
  }

  async function doImport() {
    const rows = mappedRows();
    if (rows.length === 0) { toast.error("Ninguna fila tiene nombre. Revisa el mapeo de columnas."); return; }
    setImporting(true);
    try {
      const res = await api.importPatients({ rows, sendWelcome });
      setResult(res);
      setStep("done");
      queryClient.invalidateQueries({ queryKey: ["patients"] });
      if (res.created > 0) toast.success(`${res.created} paciente${res.created === 1 ? "" : "s"} importado${res.created === 1 ? "" : "s"}`);
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo importar. Intenta de nuevo.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink-900/50 backdrop-blur-sm p-0 sm:p-4">
      <div className="w-full sm:max-w-3xl bg-surface rounded-t-2xl sm:rounded-2xl border border-line-200 shadow-soft-lg max-h-[92svh] overflow-y-auto">
        <header className="sticky top-0 z-10 bg-surface border-b border-line-200 px-5 py-4 flex items-center justify-between">
          <div>
            <h2 className="font-serif text-lg text-ink-900">Importar pacientes</h2>
            <p className="text-xs text-ink-500 mt-0.5">
              {step === "file" && "Sube tu Excel o CSV — como lo tengas, sin formato especial."}
              {step === "map" && `${fileName} · ${dataRows.length} fila${dataRows.length === 1 ? "" : "s"}`}
              {step === "done" && "Resultado de la importación"}
            </p>
          </div>
          <button onClick={close} className="h-8 w-8 rounded-md hover:bg-bg-100 flex items-center justify-center text-ink-500" aria-label="Cerrar">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="p-5">
          {step === "file" && (
            <div className="space-y-4">
              <button
                onClick={() => inputRef.current?.click()}
                disabled={parsing}
                className="w-full rounded-2xl border-2 border-dashed border-line-200 hover:border-brand-400 bg-bg-50/50 py-12 flex flex-col items-center gap-3 text-ink-600 transition-colors disabled:opacity-60"
              >
                {parsing
                  ? <Loader2 className="h-8 w-8 animate-spin text-brand-700" />
                  : <FileSpreadsheet className="h-8 w-8 text-brand-700" />}
                <span className="text-sm font-medium text-ink-900">{parsing ? "Leyendo archivo…" : "Elegir archivo"}</span>
                <span className="text-xs text-ink-500">Excel (.xlsx, .xls) o CSV · máx. 500 pacientes por tanda</span>
              </button>
              <input
                ref={inputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
              />
              <div className="flex items-center justify-between text-xs text-ink-500">
                <p>La primera fila puede ser los títulos de columna (Nombre, Teléfono, Correo…) — se detectan solos.</p>
                <button onClick={downloadTemplate} className="inline-flex items-center gap-1.5 text-brand-700 hover:underline shrink-0 ml-3">
                  <Download className="h-3.5 w-3.5" /> Descargar plantilla
                </button>
              </div>
            </div>
          )}

          {step === "map" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-sm text-ink-700">Dile a qué campo corresponde cada columna. Solo <b>Nombre</b> es obligatorio.</p>
                <label className="inline-flex items-center gap-2 text-xs text-ink-600">
                  <input type="checkbox" checked={hasHeader} onChange={(e) => setHasHeader(e.target.checked)} className="accent-brand-700" />
                  La primera fila son títulos
                </label>
              </div>

              <div className="overflow-x-auto rounded-xl border border-line-200">
                <table className="text-xs min-w-full">
                  <thead>
                    <tr className="bg-bg-50">
                      {mapping.map((field, i) => (
                        <th key={i} className="p-2 text-left font-normal min-w-36">
                          <select
                            value={field}
                            onChange={(e) => {
                              const v = e.target.value as FieldKey;
                              setMapping((prev) => prev.map((f, j) =>
                                j === i ? v : (v !== "skip" && f === v ? "skip" : f)));
                            }}
                            className={`w-full h-8 px-2 rounded-md border text-xs bg-surface ${field === "skip" ? "border-line-200 text-ink-400" : "border-brand-400 text-brand-800 font-medium"}`}
                          >
                            {FIELDS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                          </select>
                          {hasHeader && <div className="mt-1 text-[10px] text-ink-400 truncate max-w-36">{matrix[0]?.[i] ?? ""}</div>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dataRows.slice(0, 5).map((r, ri) => (
                      <tr key={ri} className="border-t border-line-100">
                        {mapping.map((_, ci) => (
                          <td key={ci} className="p-2 text-ink-700 truncate max-w-44">{String(r[ci] ?? "")}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {dataRows.length > 5 && <p className="text-[11px] text-ink-400">Vista previa de 5 de {dataRows.length} filas.</p>}

              <label className="flex items-start gap-2.5 rounded-xl border border-line-200 bg-bg-50/50 p-3 text-xs text-ink-600 cursor-pointer">
                <input type="checkbox" checked={sendWelcome} onChange={(e) => setSendWelcome(e.target.checked)} className="accent-brand-700 mt-0.5" />
                <span>
                  <span className="font-medium text-ink-800">Enviar bienvenida de Laura por WhatsApp</span> a los pacientes importados que tengan número.
                  Apagado por defecto: al importar tu histórico normalmente no quieres escribirles a todos de una.
                </span>
              </label>

              <div className="flex items-center justify-between gap-2">
                <button onClick={() => setStep("file")} className="h-10 px-4 rounded-lg border border-line-200 text-sm text-ink-700 hover:border-brand-400">
                  Otro archivo
                </button>
                <button
                  onClick={doImport}
                  disabled={!nameMapped || importing}
                  className="h-10 px-5 rounded-lg bg-brand-700 text-white text-sm font-medium hover:bg-brand-800 disabled:opacity-50 inline-flex items-center gap-2"
                >
                  {importing ? <><Loader2 className="h-4 w-4 animate-spin" /> Importando…</> : <><Upload className="h-4 w-4" /> Importar {mappedRows().length || ""} paciente{mappedRows().length === 1 ? "" : "s"}</>}
                </button>
              </div>
              {!nameMapped && <p className="text-[11px] text-rose-700 text-right">Asigna una columna al campo Nombre para continuar.</p>}
            </div>
          )}

          {step === "done" && result && (
            <div className="space-y-4">
              <div className="rounded-xl border border-line-200 bg-bg-50/50 p-4 flex items-center gap-3">
                <CheckCircle2 className="h-6 w-6 text-success shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-ink-900">
                    {result.created} de {result.total} paciente{result.total === 1 ? "" : "s"} importado{result.created === 1 ? "" : "s"}
                  </p>
                  <p className="text-xs text-ink-500">Ya aparecen en tu lista de pacientes.</p>
                </div>
              </div>
              {result.skipped.length > 0 && (
                <div className="rounded-xl border border-line-200 p-4">
                  <p className="text-xs font-medium text-ink-800 flex items-center gap-1.5 mb-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-risk-moderate" />
                    {result.skipped.length} fila{result.skipped.length === 1 ? "" : "s"} no se importaron
                  </p>
                  <ul className="space-y-1 max-h-48 overflow-y-auto text-xs text-ink-600">
                    {result.skipped.map((s, i) => (
                      <li key={i}><span className="font-medium text-ink-800">{s.name}</span> — {s.reason}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex justify-end">
                <button onClick={close} className="h-10 px-5 rounded-lg bg-brand-700 text-white text-sm font-medium hover:bg-brand-800">
                  Listo
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
