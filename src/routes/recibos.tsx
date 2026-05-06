import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * /recibos → /facturacion. La ruta canónica es /facturacion (es lo que el
 * sidebar usa internamente), pero el módulo se llama "Recibos" en la UI,
 * así que es natural que un usuario tipee /recibos en la URL. Este redirect
 * evita el 404.
 */
export const Route = createFileRoute("/recibos")({
  beforeLoad: () => {
    throw redirect({ to: "/facturacion" });
  },
});
