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
      // hero. ffmpeg extrae el pixel raw como #F7F5F1 pero al renderizar
      // el browser aplica color profile del display y se ve como #F9F7F3
      // (verificado con eyedropper en Illustrator sobre captura real).
      // Usar este hex literal (en vez de bg-bg / --bg-50) garantiza que
      // el frame del video se funda sin borde visible con la página.
      style={{ backgroundColor: "#F9F7F3" }}
    >
      {/* Blobs muy sutiles — solo dan vida al fondo. Opacity baja
          (0.12-0.15) y empujados a los bordes con top/left negativos
          para que el centro del viewport (donde vive el video del hero
          y los screenshots) quede con el #F9F7F3 casi puro. */}
      {/* Blob 1 — verde marca, esquina superior izquierda */}
      <motion.div
        className="absolute h-[50vmax] w-[50vmax] rounded-full blur-[140px]"
        style={{
          top: "-25%",
          left: "-20%",
          background:
            "radial-gradient(circle, oklch(0.86 0.04 175 / 0.15), transparent 65%)",
        }}
        animate={{ x: [0, 40, -20, 0], y: [0, 30, -10, 0] }}
        transition={{ duration: 24, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Blob 2 — beige cálido, derecha-centro */}
      <motion.div
        className="absolute h-[50vmax] w-[50vmax] rounded-full blur-[140px]"
        style={{
          top: "40%",
          right: "-25%",
          background:
            "radial-gradient(circle, oklch(0.93 0.02 80 / 0.18), transparent 65%)",
        }}
        animate={{ x: [0, -30, 20, 0], y: [0, -20, 30, 0] }}
        transition={{ duration: 28, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Blob 3 — gris-violeta muy tenue, fondo abajo */}
      <motion.div
        className="absolute h-[45vmax] w-[45vmax] rounded-full blur-[140px]"
        style={{
          bottom: "-20%",
          left: "10%",
          background:
            "radial-gradient(circle, oklch(0.9 0.015 280 / 0.12), transparent 65%)",
        }}
        animate={{ x: [0, 50, -30, 0], y: [0, -25, 15, 0] }}
        transition={{ duration: 32, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}
