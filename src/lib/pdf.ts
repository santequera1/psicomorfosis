/**
 * Generación de PDF del lado del cliente para documentos clínicos.
 * Usa html2pdf.js (html2canvas + jsPDF) para producir un archivo descargable
 * con membrete + cuerpo del editor, sin depender del diálogo de impresión
 * del navegador.
 */
// @ts-expect-error — html2pdf.js no trae tipos oficiales
import html2pdf from "html2pdf.js";

export interface PdfHeaderInfo {
  clinicName: string;
  professional?: string | null;
  dateLabel?: string | null;
  documentName: string;
  patientName?: string | null;
  patientId?: string | null;
}

/**
 * Genera y descarga un PDF a partir del contenido del editor.
 *
 * - `editorContentEl`: el nodo `.psm-editor-content` del editor (ProseMirror).
 *    Se clona para no afectar el DOM en vivo.
 * - El render se hace en un contenedor offscreen con estilos pensados para
 *    impresión: márgenes A4, tipografía serif, color de marca en title.
 *
 * Notas: html2pdf rasteriza el DOM, así que el texto resultante NO es
 * seleccionable en lectores de PDF. Es trade-off aceptable a cambio de
 * fidelidad visual y no necesitar infra de PDF en el server.
 */
export async function downloadDocPdf(
  editorContentEl: HTMLElement,
  header: PdfHeaderInfo,
  filename: string,
): Promise<void> {
  const container = document.createElement("div");
  container.style.cssText = [
    "position: fixed",
    "left: -10000px",
    "top: 0",
    "width: 794px", // A4 a 96dpi
    "background: white",
    "color: #1f1f1f",
    "font-family: 'Inter', system-ui, sans-serif",
    "font-size: 11pt",
    "line-height: 1.55",
    "padding: 0",
  ].join(";");

  const headerHtml = `
    <div style="border-bottom: 1px solid #e5e5e5; padding-bottom: 12px; margin-bottom: 18px;">
      <h1 style="font-family: 'Fraunces', Georgia, serif; font-size: 22pt; margin: 0; color: #4a3a8c; font-weight: 600;">
        ${escapeHtml(header.clinicName)}
      </h1>
      <p style="margin: 4px 0 0 0; font-size: 10pt; color: #6b6b6b;">
        ${header.professional ? escapeHtml(header.professional) : ""}${
          header.professional && header.dateLabel ? " · " : ""
        }${header.dateLabel ? escapeHtml(header.dateLabel) : ""}
      </p>
      <p style="margin: 8px 0 0 0; font-size: 11pt; color: #1f1f1f;">
        <strong>${escapeHtml(header.documentName)}</strong>${
          header.patientName ? ` · Paciente: ${escapeHtml(header.patientName)}` : ""
        }${header.patientId ? ` (${escapeHtml(header.patientId)})` : ""}
      </p>
    </div>
  `;

  const bodyClone = editorContentEl.cloneNode(true) as HTMLElement;
  // Resolver imágenes a URL absoluta para que html2canvas las pueda traer
  bodyClone.querySelectorAll("img").forEach((img) => {
    const src = img.getAttribute("src") || "";
    if (src.startsWith("/")) img.setAttribute("src", window.location.origin + src);
  });
  // Convertir variables ya resueltas (chips visuales) a texto plano —
  // los NodeViews de TipTap se renderean como chips, pero al clonar el
  // span data-variable contiene su texto resuelto (o el {{key}} si no había
  // contexto). html2canvas los pinta tal cual.

  const wrapper = document.createElement("div");
  wrapper.style.cssText = "padding: 18mm 15mm; min-height: 100vh;";
  wrapper.innerHTML = headerHtml;
  wrapper.appendChild(bodyClone);
  container.appendChild(wrapper);
  document.body.appendChild(container);

  try {
    await html2pdf()
      .from(container)
      .set({
        margin: 0,
        filename,
        image: { type: "jpeg", quality: 0.95 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          letterRendering: true,
          backgroundColor: "#ffffff",
        },
        jsPDF: {
          unit: "mm",
          format: "a4",
          orientation: "portrait",
        },
        pagebreak: { mode: ["avoid-all", "css", "legacy"] },
      })
      .save();
  } finally {
    document.body.removeChild(container);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
  }[c]!));
}
