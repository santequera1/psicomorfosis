import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * /inicio2 fue el laboratorio de la landing v2 (sep 2026). La v2 ya es
 * la oficial en /inicio — esto queda solo para que los enlaces viejos
 * no mueran.
 */
export const Route = createFileRoute("/inicio2")({
  beforeLoad: () => {
    throw redirect({ to: "/inicio" });
  },
});
