import { useRef, useState } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { ArrowRight } from "lucide-react";
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
    img: "/landing/agenda.png",
  },
  {
    heading: "Historia clínica",
    subheading: "Notas de sesión, evolución, riesgo y toda la ficha del paciente en un solo expediente.",
    img: "/landing/perfil-paciente.png",
  },
  {
    heading: "Documentos",
    subheading: "Consentimientos, plantillas y firma del paciente desde su celular.",
    img: "/landing/documentos.png",
  },
  {
    heading: "Psicometría",
    subheading: "Tests aplicados, calificados e interpretados dentro de la plataforma.",
    img: "/landing/diagnostico-dsm5.png",
  },
  {
    heading: "Portal del paciente",
    subheading: "Tus pacientes ven sus citas, tareas, tests, documentos y pagos.",
    img: "/landing/portal-paciente.png",
  },
  {
    heading: "Reportes",
    subheading: "Cómo va tu consulta: sesiones, ingresos, retención y riesgo activo.",
    img: "/landing/reportes.png",
  },
];

export function FeatureLinks() {
  return (
    <section id="capabilities" className="py-14 sm:py-24 relative">
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
            <span className="hidden md:inline">Pasa el cursor por cada área para verla en la app real.</span>
            <span className="md:hidden">Toca cada área para verla en la app real.</span>
          </motion.p>
        </motion.div>

        {/* Desktop: lista editorial con hover. */}
        <div className="hidden md:block">
          {LINKS.map((link) => (
            <FeatureLink key={link.heading} {...link} />
          ))}
        </div>

        {/* Móvil: tabs — cambia el contenido en el mismo bloque en vez
            de apilar seis filas (feedback 1 sep 2026: menos scroll). */}
        <FeatureTabs />
      </div>
    </section>
  );
}

function FeatureTabs() {
  const [active, setActive] = useState(0);
  const link = LINKS[active];
  return (
    <div className="md:hidden">
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 snap-x [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {LINKS.map((l, i) => (
          <button
            key={l.heading}
            onClick={() => setActive(i)}
            className={`shrink-0 snap-start h-9 px-3.5 rounded-full border text-xs font-medium transition-colors ${
              i === active
                ? "bg-brand-700 border-brand-700 text-white"
                : "bg-surface border-line-200 text-ink-600"
            }`}
          >
            {l.heading}
          </button>
        ))}
      </div>
      <motion.div
        key={active}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: easeOutExpo }}
        className="mt-3 rounded-2xl border border-line-200 bg-surface overflow-hidden shadow-soft"
      >
        <img
          src={link.img}
          alt={`Pantalla de ${link.heading} en Psicomorfosis`}
          loading="lazy"
          className="w-full aspect-[16/10] object-cover object-left-top border-b border-line-100 bg-white"
        />
        <div className="p-4">
          <h3 className="font-serif text-xl text-ink-900">{link.heading}</h3>
          <p className="mt-1 text-sm text-ink-500 leading-relaxed">{link.subheading}</p>
        </div>
      </motion.div>
    </div>
  );
}


function FeatureLink({ heading, subheading, img }: { heading: string; subheading: string; img: string }) {
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
          className="relative z-10 block font-serif text-3xl sm:text-4xl md:text-6xl tracking-tight text-ink-300 transition-colors duration-500 group-hover:text-ink-900"
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

      {/* Miniatura estática en touch (el hover no existe ahí) */}
      <img
        src={img}
        alt=""
        loading="lazy"
        aria-hidden
        className="md:hidden h-16 w-24 shrink-0 rounded-lg border border-line-200 object-cover object-left-top shadow-sm"
      />

      {/* Pantallazo flotante que sigue al mouse — solo desktop */}
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
        className="hidden md:block absolute z-20 h-44 w-72 lg:h-56 lg:w-96 rounded-xl border border-line-200 bg-white object-cover object-left-top shadow-2xl pointer-events-none"
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
