import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * /historia-clinica → /historia. La ruta canónica es /historia (más corta)
 * pero el sidebar muestra "Historia clínica" como label, por lo que es
 * intuitivo que un usuario tipee /historia-clinica. Este redirect evita
 * el 404.
 */
export const Route = createFileRoute("/historia-clinica")({
  beforeLoad: () => {
    throw redirect({ to: "/historia" });
  },
});
