import { motion } from "framer-motion";

/**
 * Fondo global de la landing: tres blobs de gradiente radial muy
 * desaturado (verde marca, gris cálido, beige). Cada uno se mueve
 * lentamente en órbitas distintas — el ojo no detecta el movimiento
 * directamente, solo siente que la página "respira".
 *
 * Cubre todo el viewport vía position fixed con pointer-events-none
 * para no robar interacción a ninguna sección.
 */
export function LandingBackdrop() {
  return (
    <div
      aria-hidden
      className="fixed inset-0 -z-10 pointer-events-none overflow-hidden"
      // Color literal en hex que coincide EXACTO con el fondo del video del
      // hero. El video se exportó con #F8F7F2 pero el codec yuv420p con
      // color_range=tv lo decodifica como #F7F5F1 en el browser. Usar este
      // hex literal (en vez de bg-bg / --bg-50) garantiza que el frame del
      // video se funda sin borde visible con la página.
      style={{ backgroundColor: "#F7F5F1" }}
    >
      {/* Blob 1 — verde marca desaturado, esquina superior izquierda */}
      <motion.div
        className="absolute h-[60vmax] w-[60vmax] rounded-full blur-[120px]"
        style={{
          top: "-15%",
          left: "-10%",
          background:
            "radial-gradient(circle, oklch(0.86 0.05 175 / 0.45), transparent 70%)",
        }}
        animate={{ x: [0, 40, -20, 0], y: [0, 30, -10, 0] }}
        transition={{ duration: 24, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Blob 2 — beige cálido, derecha-centro */}
      <motion.div
        className="absolute h-[55vmax] w-[55vmax] rounded-full blur-[120px]"
        style={{
          top: "30%",
          right: "-15%",
          background:
            "radial-gradient(circle, oklch(0.93 0.025 80 / 0.5), transparent 70%)",
        }}
        animate={{ x: [0, -30, 20, 0], y: [0, -20, 30, 0] }}
        transition={{ duration: 28, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Blob 3 — gris-violeta muy tenue, fondo abajo */}
      <motion.div
        className="absolute h-[50vmax] w-[50vmax] rounded-full blur-[120px]"
        style={{
          bottom: "-10%",
          left: "20%",
          background:
            "radial-gradient(circle, oklch(0.9 0.02 280 / 0.35), transparent 70%)",
        }}
        animate={{ x: [0, 50, -30, 0], y: [0, -25, 15, 0] }}
        transition={{ duration: 32, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}
