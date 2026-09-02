import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { ArrowRight, X } from "lucide-react";
import { easeOutExpo, fadeUpSubtle, staggerParent } from "./motion";

/**
 * Capacidades como lista editorial interactiva (experimento /inicio2,
 * 1 sep 2026 — referencia: interactive-hover-links de 21st.dev).
 * En desktop, cada fila revela un pantallazo real de la app que sigue
 * al mouse; en touch (sin hover) la miniatura va estática a la derecha.
 * Reemplaza a la sección Features de ~500 líneas para acortar la página.
 */

const LINKS = [
  {
    heading: "Agenda",
    subheading: "Citas con recordatorios automáticos y reservas en línea desde tu perfil público.",
    img: "/landing/agenda.webp",
  },
  {
    heading: "Historia clínica",
    subheading: "Notas de sesión, evolución, riesgo y toda la ficha del paciente en un solo expediente.",
    img: "/landing/perfil-paciente.webp",
  },
  {
    heading: "Documentos",
    subheading: "Consentimientos, plantillas y firma del paciente desde su celular.",
    img: "/landing/documentos.webp",
  },
  {
    heading: "Psicometría",
    subheading: "Tests aplicados, calificados e interpretados dentro de la plataforma.",
    img: "/landing/diagnostico-dsm5.webp",
  },
  {
    heading: "Portal del paciente",
    subheading: "Tus pacientes ven sus citas, tareas, tests, documentos y pagos.",
    img: "/landing/portal-paciente.webp",
  },
  {
    heading: "Reportes",
    subheading: "Cómo va tu consulta: sesiones, ingresos, retención y riesgo activo.",
    img: "/landing/reportes.webp",
  },
];

export function FeatureLinks() {
  // Lightbox: clic en el pantallazo flotante lo abre en grande.
  const [lightbox, setLightbox] = useState<(typeof LINKS)[number] | null>(null);
  return (
    <section className="pt-14 pb-8 sm:pt-24 sm:pb-10 relative hidden md:block">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          variants={staggerParent}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.4 }}
          className="mb-6 sm:mb-10"
        >
          <motion.p variants={fadeUpSubtle} className="text-xs uppercase tracking-widest text-brand-700 font-semibold">
            La plataforma
          </motion.p>
          <motion.h2 variants={fadeUpSubtle} className="mt-2 font-serif text-3xl sm:text-5xl text-ink-900 tracking-tight">
            Todo tu consultorio, una sola pestaña.
          </motion.h2>
          <motion.p variants={fadeUpSubtle} className="mt-3 text-sm sm:text-base text-ink-500 max-w-xl">
            Pasa el cursor por cada área para verla en la app real — y haz clic en la imagen para ampliarla.
          </motion.p>
        </motion.div>

        <div>
          {LINKS.map((link) => (
            <FeatureLink key={link.heading} {...link} onOpen={() => setLightbox(link)} />
          ))}
        </div>
      </div>

      <AnimatePresence>
        {lightbox && <Lightbox {...lightbox} onClose={() => setLightbox(null)} />}
      </AnimatePresence>
    </section>
  );
}

/** Pantallazo en grande con animación de spring; Escape o clic fuera cierran. */
function Lightbox({ heading, subheading, img, onClose }: {
  heading: string; subheading: string; img: string; onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      onClick={onClose}
      className="fixed inset-0 z-50 bg-ink-900/70 backdrop-blur-md flex items-center justify-center p-4 sm:p-8 cursor-zoom-out"
    >
      <motion.figure
        initial={{ opacity: 0, scale: 0.88, y: 24, filter: "blur(8px)" }}
        animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
        exit={{ opacity: 0, scale: 0.94, y: 12, filter: "blur(6px)" }}
        transition={{ type: "spring", stiffness: 260, damping: 26 }}
        onClick={(e) => e.stopPropagation()}
        className="relative max-w-6xl w-full cursor-default"
      >
        <img
          src={img}
          alt={`Pantalla de ${heading} en Psicomorfosis`}
          className="w-full h-auto rounded-2xl border border-white/10 shadow-2xl bg-white"
        />
        <figcaption className="mt-4 text-center">
          <p className="font-serif text-xl text-white">{heading}</p>
          <p className="mt-1 text-sm text-white/70">{subheading}</p>
        </figcaption>
        <button
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute -top-3 -right-3 h-10 w-10 rounded-full bg-white text-ink-900 shadow-xl flex items-center justify-center hover:scale-105 transition-transform"
        >
          <X className="h-5 w-5" />
        </button>
      </motion.figure>
    </motion.div>
  );
}

function FeatureLink({ heading, subheading, img, onOpen }: { heading: string; subheading: string; img: string; onOpen: () => void }) {
  const ref = useRef<HTMLAnchorElement | null>(null);

  // La imagen "persigue" suavemente al mouse dentro de la fila.
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const mouseXSpring = useSpring(x);
  const mouseYSpring = useSpring(y);
  const top = useTransform(mouseYSpring, [0.5, -0.5], ["40%", "60%"]);
  const left = useTransform(mouseXSpring, [0.5, -0.5], ["65%", "45%"]);

  function handleMouseMove(e: React.MouseEvent<HTMLAnchorElement>) {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    x.set((e.clientX - rect.left) / rect.width - 0.5);
    y.set((e.clientY - rect.top) / rect.height - 0.5);
  }

  return (
    <motion.a
      href="#demo"
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => { x.set(0); y.set(0); }}
      initial="initial"
      whileHover="whileHover"
      className="group relative flex items-center justify-between gap-4 border-b border-line-200 py-5 transition-colors duration-500 hover:border-brand-700 md:py-8"
    >
      <div className="min-w-0">
        <motion.span
          variants={{ initial: { x: 0 }, whileHover: { x: -16 } }}
          transition={{ type: "spring", staggerChildren: 0.06, delayChildren: 0.2 }}
          className="relative z-10 block font-serif text-3xl sm:text-4xl md:text-6xl tracking-tight text-ink-500 transition-colors duration-500 group-hover:text-ink-900"
        >
          {heading.split("").map((letter, i) => (
            <motion.span
              key={i}
              variants={{ initial: { x: 0 }, whileHover: { x: 16 } }}
              transition={{ type: "spring" }}
              className="inline-block"
            >
              {letter === " " ? " " : letter}
            </motion.span>
          ))}
        </motion.span>
        <span className="relative z-10 mt-2 block text-xs sm:text-base text-ink-500 transition-colors duration-500 group-hover:text-ink-800">
          {subheading}
        </span>
      </div>

      {/* Pantallazo flotante que sigue al mouse; clic → lightbox */}
      <motion.img
        style={{ top, left, translateX: "-10%", translateY: "-50%" }}
        variants={{
          initial: { scale: 0, rotate: "-10deg", opacity: 0 },
          whileHover: { scale: 1, rotate: "6deg", opacity: 1 },
        }}
        transition={{ type: "spring", stiffness: 260, damping: 24 }}
        src={img}
        loading="lazy"
        alt={`Pantalla de ${heading} en Psicomorfosis`}
        title="Ver en grande"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onOpen(); }}
        className="hidden md:block absolute z-20 h-44 w-72 lg:h-56 lg:w-96 rounded-xl border border-line-200 bg-white object-cover object-left-top shadow-2xl cursor-zoom-in"
      />

      <div className="overflow-hidden hidden md:block shrink-0">
        <motion.div
          variants={{
            initial: { x: "100%", opacity: 0 },
            whileHover: { x: "0%", opacity: 1 },
          }}
          transition={{ type: "spring" }}
          className="relative z-10 p-4"
        >
          <ArrowRight className="h-8 w-8 md:h-10 md:w-10 text-brand-700" />
        </motion.div>
      </div>
    </motion.a>
  );
}
