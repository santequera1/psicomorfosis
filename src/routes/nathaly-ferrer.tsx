import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  ArrowRight, ArrowDown, Brain, Heart, Footprints, Leaf, Hourglass,
  MessageCircle, Video, MapPin, GraduationCap, Sparkles, Quote,
} from "lucide-react";
import { easeOutExpo, fadeUp, staggerParent } from "@/components/landing/motion";

/**
 * Landing personal de la Psic. Nathaly Ferrer Pacheco.
 *
 * Hereda el lenguaje visual de la landing de Psicomorfosis (Fraunces +
 * Inter, teal clínico, easeOutExpo, reveals con blur) y le suma scroll
 * storytelling con GSAP ScrollTrigger:
 *   - Sección PINNEADA del triángulo TCC (pensamiento→emoción→conducta),
 *     el modelo que define su enfoque. El scroll ilumina cada vértice.
 *   - Línea de proceso que se dibuja con scrub.
 *   - Parallax sutil en la foto de la sección "Sobre mí".
 * Cierra con un fullscreen oscuro con video de fondo y liquid glass
 * (referencia flowpath) como CTA final.
 */

const WHATSAPP = "https://wa.me/573042190650?text=Hola%20Nathaly%2C%20me%20gustar%C3%ADa%20agendar%20una%20consulta";
const FOTO = "/landing/nathaly-ferrer.jpg";
const VIDEO_FINAL = "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260703_053131_1ec3dd1c-d627-44fb-ab20-6e1fce41b0d5.mp4";

export const Route = createFileRoute("/nathaly-ferrer")({
  head: () => ({
    meta: [
      { title: "Nathaly Ferrer · Psicóloga Clínica — Terapia Cognitivo-Conductual" },
      {
        name: "description",
        content:
          "Psicóloga clínica, Mg. en Terapia Cognitivo-Conductual. Acompaño procesos de ansiedad, depresión y duelo. Consulta online y presencial.",
      },
      { property: "og:title", content: "Nathaly Ferrer · Psicóloga Clínica" },
      {
        property: "og:description",
        content: "Terapia cognitivo-conductual para ansiedad, depresión y duelo. Consulta online y presencial.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://psico.wailus.co/nathaly-ferrer" },
      { property: "og:image", content: "https://psico.wailus.co/landing/nathaly-ferrer.jpg" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: NathalyPage,
});

/* ─── CSS propio de la página: liquid glass (referencia flowpath) ───────── */
const PAGE_CSS = `
.nf-liquid-glass {
  background: rgba(255, 255, 255, 0.01);
  background-blend-mode: luminosity;
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  border: none;
  box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.1);
  position: relative;
  overflow: hidden;
}
.nf-liquid-glass::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 1.4px;
  background: linear-gradient(180deg,
    rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.15) 20%,
    rgba(255,255,255,0) 40%, rgba(255,255,255,0) 60%,
    rgba(255,255,255,0.15) 80%, rgba(255,255,255,0.45) 100%);
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  pointer-events: none;
}
`;

function NathalyPage() {
  // Igual que /inicio: la página vive SIEMPRE en tema claro clínico,
  // sin importar cómo tenga la app quien la visite.
  useEffect(() => {
    const root = document.documentElement;
    const prev = {
      dark: root.classList.contains("dark"),
      mode: root.getAttribute("data-mode"),
      theme: root.getAttribute("data-theme"),
      scrollBehavior: root.style.scrollBehavior,
    };
    root.classList.remove("dark");
    root.setAttribute("data-mode", "light");
    root.setAttribute("data-theme", "clinico");
    root.style.scrollBehavior = "smooth";
    return () => {
      if (prev.dark) root.classList.add("dark");
      if (prev.mode) root.setAttribute("data-mode", prev.mode);
      else root.removeAttribute("data-mode");
      if (prev.theme) root.setAttribute("data-theme", prev.theme);
      else root.removeAttribute("data-theme");
      root.style.scrollBehavior = prev.scrollBehavior;
    };
  }, []);

  return (
    <div className="min-h-screen bg-bg-50 text-ink-900 overflow-x-clip">
      <style dangerouslySetInnerHTML={{ __html: PAGE_CSS }} />
      <Nav />
      <main>
        <Hero />
        <TrianguloTCC />
        <Areas />
        <Proceso />
        <SobreMi />
        <CierreFullscreen />
      </main>
      <footer className="bg-[#0c1418] text-white/40 text-xs text-center py-6">
        Psic. Nathaly Ferrer Pacheco · Terapia cognitivo-conductual ·{" "}
        <a href="https://psico.wailus.co/inicio" className="hover:text-white/70 underline underline-offset-2">
          con tecnología de Psicomorfosis
        </a>
      </footer>
    </div>
  );
}

/* ─── Nav: pill flotante minimalista ────────────────────────────────────── */
function Nav() {
  return (
    <motion.header
      initial={{ opacity: 0, y: -14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: easeOutExpo }}
      className="fixed top-3 sm:top-5 inset-x-0 z-50 flex justify-center px-4"
    >
      <div className="flex items-center gap-3 sm:gap-6 rounded-full border border-line-200/80 bg-surface/80 backdrop-blur-xl shadow-soft pl-4 sm:pl-5 pr-1.5 py-1.5">
        <a href="#top" className="font-serif text-sm sm:text-base text-ink-900 tracking-tight whitespace-nowrap">
          Nathaly Ferrer
          <span className="hidden sm:inline text-ink-400 font-sans text-xs ml-2">Psicóloga clínica</span>
        </a>
        <nav className="hidden md:flex items-center gap-4 text-[13px] text-ink-500">
          <a href="#enfoque" className="hover:text-ink-900 transition-colors">Enfoque</a>
          <a href="#areas" className="hover:text-ink-900 transition-colors">Áreas</a>
          <a href="#proceso" className="hover:text-ink-900 transition-colors">Proceso</a>
          <a href="#sobre-mi" className="hover:text-ink-900 transition-colors">Sobre mí</a>
        </nav>
        <a
          href={WHATSAPP}
          target="_blank"
          rel="noreferrer"
          className="h-9 px-3.5 sm:px-4 rounded-full bg-brand-700 text-white text-xs sm:text-[13px] font-medium hover:bg-brand-800 inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"
        >
          <MessageCircle className="h-3.5 w-3.5" /> Agendar
        </a>
      </div>
    </motion.header>
  );
}

/* ─── Hero ──────────────────────────────────────────────────────────────── */
const H1_L1 = ["Tu", "mente", "puede"];
const H1_L2 = ["aprender", "otro", "camino."];

function Hero() {
  return (
    <section id="top" className="relative min-h-screen flex items-center overflow-hidden pt-24 pb-16">
      {/* Fondo: wash radial teal muy suave, mismo espíritu del backdrop de /inicio */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(900px 600px at 80% 10%, oklch(0.93 0.018 200 / 0.9), transparent 60%)," +
            "radial-gradient(700px 500px at 5% 90%, oklch(0.96 0.012 150 / 0.8), transparent 60%)",
        }}
      />
      <div className="max-w-6xl mx-auto px-5 sm:px-8 grid lg:grid-cols-[1.15fr_0.85fr] gap-10 lg:gap-16 items-center w-full">
        <div>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: easeOutExpo, delay: 0.1 }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-50 border border-brand-100 text-xs text-brand-800 font-medium"
          >
            <GraduationCap className="h-3.5 w-3.5" />
            Mg. en Terapia Cognitivo-Conductual
          </motion.div>

          <h1 className="mt-5 font-serif text-4xl sm:text-6xl lg:text-7xl leading-[1.04] tracking-tight">
            <span className="block overflow-hidden">
              {H1_L1.map((w, i) => (
                <motion.span
                  key={w}
                  initial={{ opacity: 0, y: "100%" }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8, ease: easeOutExpo, delay: 0.25 + i * 0.08 }}
                  className="inline-block mr-3"
                >
                  {w}
                </motion.span>
              ))}
            </span>
            <span className="block overflow-hidden">
              {H1_L2.map((w, i) => (
                <motion.span
                  key={w}
                  initial={{ opacity: 0, y: "100%" }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8, ease: easeOutExpo, delay: 0.55 + i * 0.08 }}
                  className="inline-block mr-3 text-brand-700"
                >
                  {w}
                </motion.span>
              ))}
            </span>
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: easeOutExpo, delay: 0.95 }}
            className="mt-5 max-w-xl text-sm sm:text-lg text-ink-500 leading-relaxed"
          >
            Soy Nathaly, psicóloga clínica. Acompaño procesos de{" "}
            <strong className="text-ink-700 font-medium">ansiedad, depresión y duelo</strong>{" "}
            con terapia cognitivo-conductual: un enfoque práctico, con evidencia,
            donde aprendes herramientas que te sirven dentro y fuera de sesión.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: easeOutExpo, delay: 1.1 }}
            className="mt-8 flex flex-wrap items-center gap-3"
          >
            <motion.a
              href={WHATSAPP}
              target="_blank"
              rel="noreferrer"
              whileHover={{ y: -2, scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              transition={{ duration: 0.3, ease: easeOutExpo }}
              className="h-12 px-6 rounded-lg bg-brand-700 text-white text-sm font-medium hover:bg-brand-800 inline-flex items-center gap-2 shadow-lg shadow-brand-700/20"
            >
              Agenda tu consulta <ArrowRight className="h-4 w-4" />
            </motion.a>
            <motion.a
              href="#enfoque"
              whileHover={{ y: -2 }}
              transition={{ duration: 0.3, ease: easeOutExpo }}
              className="h-12 px-6 rounded-lg border border-line-200 bg-surface text-ink-700 text-sm font-medium hover:border-brand-400 inline-flex items-center gap-2"
            >
              <ArrowDown className="h-4 w-4" /> Conoce mi enfoque
            </motion.a>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 1.35 }}
            className="mt-6 flex items-center gap-4 text-xs text-ink-400"
          >
            <span className="inline-flex items-center gap-1.5"><Video className="h-3.5 w-3.5" /> Consulta online</span>
            <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> Presencial</span>
          </motion.div>
        </div>

        {/* Foto con badges flotantes de sus tres áreas */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, filter: "blur(12px)" }}
          animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
          transition={{ duration: 1.1, ease: easeOutExpo, delay: 0.7 }}
          className="relative max-w-sm mx-auto lg:max-w-none"
        >
          <div
            aria-hidden
            className="absolute -inset-10 -z-10 blur-3xl opacity-60"
            style={{ background: "radial-gradient(ellipse at center, oklch(0.7 0.12 175 / 0.35), transparent 65%)" }}
          />
          <motion.div
            animate={{ y: [-6, 6, -6] }}
            transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
            className="relative rounded-[2rem] overflow-hidden border border-line-200 shadow-card"
          >
            <img src={FOTO} alt="Psic. Nathaly Ferrer Pacheco" className="w-full h-auto block" />
            <div aria-hidden className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-ink-900/30 to-transparent" />
            <div className="absolute bottom-4 left-5 text-white">
              <div className="font-serif text-lg leading-none">Nathaly Ferrer</div>
              <div className="text-[11px] text-white/80 mt-1">Psicóloga clínica · TCC</div>
            </div>
          </motion.div>
          <HeroChip icon={Leaf} label="Ansiedad" style={{ top: "8%", left: "-1.5rem" }} delay={1.5} />
          <HeroChip icon={Footprints} label="Depresión" style={{ top: "42%", right: "-2rem" }} delay={1.75} />
          <HeroChip icon={Hourglass} label="Duelo" style={{ bottom: "12%", left: "-2rem" }} delay={2.0} />
        </motion.div>
      </div>
    </section>
  );
}

function HeroChip({ icon: Icon, label, style, delay }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  style: React.CSSProperties;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.6, ease: easeOutExpo, delay }}
      className="absolute hidden sm:flex items-center gap-2 rounded-full bg-surface/95 backdrop-blur border border-line-200 shadow-soft px-3.5 py-2"
      style={style}
    >
      <motion.span
        animate={{ y: [-3, 3, -3] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay }}
        className="flex items-center gap-2"
      >
        <Icon className="h-3.5 w-3.5 text-brand-700" />
        <span className="text-xs font-medium text-ink-700">{label}</span>
      </motion.span>
    </motion.div>
  );
}

/* ─── Triángulo TCC — sección PINNEADA con GSAP ─────────────────────────── */
const VERTICES = [
  {
    key: "pensamiento", Icon: Brain, titulo: "Lo que piensas",
    texto: "“Seguro sale mal”, “no soy capaz”. Los pensamientos automáticos aparecen sin invitación — y les creemos sin revisarlos.",
    // posición del nodo en el SVG 400x360
    cx: 200, cy: 60,
  },
  {
    key: "emocion", Icon: Heart, titulo: "Lo que sientes",
    texto: "Ese pensamiento dispara ansiedad, tristeza o culpa. La emoción se siente como verdad absoluta, aunque nació de una idea no examinada.",
    cx: 60, cy: 300,
  },
  {
    key: "conducta", Icon: Footprints, titulo: "Lo que haces",
    texto: "Y entonces evitas, pospones, te aíslas. La conducta alivia un momento… y confirma el pensamiento inicial. El ciclo se cierra.",
    cx: 340, cy: 300,
  },
];

function TrianguloTCC() {
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const ctx = gsap.context(() => {
      const steps = gsap.utils.toArray<HTMLElement>("[data-tcc-step]");
      const nodes = gsap.utils.toArray<HTMLElement>("[data-tcc-node]");
      const lines = gsap.utils.toArray<SVGLineElement>("[data-tcc-line]");
      const finale = sectionRef.current?.querySelector("[data-tcc-finale]");

      // Timeline pinneada: la sección se queda fija mientras el scroll
      // recorre 3 pasos (uno por vértice) + el cierre.
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: sectionRef.current,
          start: "top top",
          end: "+=2600",
          pin: true,
          scrub: 0.6,
        },
      });

      steps.forEach((step, i) => {
        const node = nodes[i];
        const line = lines[i];
        // Entra el texto del paso + se ilumina el vértice
        tl.fromTo(step, { autoAlpha: 0, y: 40 }, { autoAlpha: 1, y: 0, duration: 1 }, i * 3);
        tl.fromTo(node, { scale: 0.7, autoAlpha: 0.25 }, { scale: 1, autoAlpha: 1, duration: 0.8 }, i * 3 + 0.2);
        // Se dibuja la arista hacia el siguiente vértice
        if (line) {
          const len = line.getTotalLength();
          gsap.set(line, { strokeDasharray: len, strokeDashoffset: len });
          tl.to(line, { strokeDashoffset: 0, duration: 1 }, i * 3 + 0.8);
        }
        // Sale el texto (menos el último, que respira hasta el cierre)
        if (i < steps.length - 1) {
          tl.to(step, { autoAlpha: 0, y: -30, duration: 0.8 }, i * 3 + 2.2);
        }
      });

      // Cierre: el triángulo completo pulsa y entra el mensaje de la TCC
      tl.to(steps[steps.length - 1], { autoAlpha: 0, y: -30, duration: 0.8 }, 9);
      if (finale) {
        tl.fromTo(finale, { autoAlpha: 0, y: 40 }, { autoAlpha: 1, y: 0, duration: 1.2 }, 9.5);
      }
      tl.to("[data-tcc-svg]", { scale: 1.06, duration: 1.4, ease: "power1.inOut" }, 9.5);
    }, sectionRef);
    return () => ctx.revert();
  }, []);

  return (
    <section id="enfoque" ref={sectionRef} className="relative h-screen overflow-hidden bg-[#0e181d] text-white">
      {/* Glow ambiental */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{ background: "radial-gradient(800px 500px at 50% 45%, oklch(0.45 0.07 200 / 0.35), transparent 70%)" }}
      />
      <div className="relative h-full max-w-6xl mx-auto px-5 sm:px-8 grid lg:grid-cols-2 gap-8 items-center">
        {/* Columna izquierda: pasos que se intercambian */}
        <div className="relative h-64 sm:h-72 order-2 lg:order-1">
          <div className="absolute -top-14 left-0 text-[11px] uppercase tracking-[0.2em] text-white/40 font-medium">
            El ciclo que la TCC interrumpe
          </div>
          {VERTICES.map((v) => (
            <div key={v.key} data-tcc-step className="absolute inset-0 opacity-0 flex flex-col justify-center">
              <div className="flex items-center gap-3">
                <span className="h-10 w-10 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center">
                  <v.Icon className="h-5 w-5 text-brand-400" />
                </span>
                <h3 className="font-serif text-3xl sm:text-4xl">{v.titulo}</h3>
              </div>
              <p className="mt-4 text-white/70 text-sm sm:text-base leading-relaxed max-w-md">{v.texto}</p>
            </div>
          ))}
          <div data-tcc-finale className="absolute inset-0 opacity-0 flex flex-col justify-center">
            <h3 className="font-serif text-3xl sm:text-5xl leading-tight">
              La terapia trabaja <span className="text-brand-400">las tres puntas.</span>
            </h3>
            <p className="mt-4 text-white/70 text-sm sm:text-base leading-relaxed max-w-md">
              En sesión aprendes a detectar el pensamiento, regular la emoción y
              cambiar la conducta — hasta que el ciclo gire a tu favor.
            </p>
            <a
              href={WHATSAPP}
              target="_blank"
              rel="noreferrer"
              className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-brand-400 hover:text-brand-100 transition-colors w-fit"
            >
              Empezar mi proceso <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>

        {/* Columna derecha: el triángulo SVG */}
        <div className="order-1 lg:order-2 flex justify-center">
          <svg data-tcc-svg viewBox="0 0 400 360" className="w-64 sm:w-80 lg:w-[26rem] h-auto" fill="none" aria-hidden>
            {/* Aristas (se dibujan con scrub): pensamiento→emoción→conducta→pensamiento */}
            <line data-tcc-line x1="200" y1="60" x2="60" y2="300" stroke="oklch(0.76 0.035 200)" strokeWidth="2" strokeLinecap="round" />
            <line data-tcc-line x1="60" y1="300" x2="340" y2="300" stroke="oklch(0.76 0.035 200)" strokeWidth="2" strokeLinecap="round" />
            <line data-tcc-line x1="340" y1="300" x2="200" y2="60" stroke="oklch(0.76 0.035 200)" strokeWidth="2" strokeLinecap="round" />
            {VERTICES.map((v) => (
              <g key={v.key} data-tcc-node style={{ transformOrigin: `${v.cx}px ${v.cy}px` }}>
                <circle cx={v.cx} cy={v.cy} r="34" fill="oklch(0.2 0.03 210)" stroke="oklch(0.76 0.035 200 / 0.5)" strokeWidth="1.5" />
                <circle cx={v.cx} cy={v.cy} r="46" fill="none" stroke="oklch(0.76 0.035 200 / 0.15)" strokeWidth="1" />
                <v.Icon x={v.cx - 12} y={v.cy - 12} width={24} height={24} color="oklch(0.85 0.05 195)" />
              </g>
            ))}
          </svg>
        </div>
      </div>
      {/* Hint de scroll */}
      <div className="absolute bottom-6 inset-x-0 flex justify-center text-white/30">
        <motion.div animate={{ y: [0, 6, 0] }} transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}>
          <ArrowDown className="h-4 w-4" />
        </motion.div>
      </div>
    </section>
  );
}

/* ─── Áreas de acompañamiento ───────────────────────────────────────────── */
const AREAS = [
  {
    Icon: Leaf, titulo: "Ansiedad",
    texto: "Cuando la mente se adelanta a catástrofes que no llegan: preocupación constante, tensión física, noches sin dormir. Trabajamos exposición gradual, reestructuración de pensamientos y regulación fisiológica.",
    tags: ["Crisis de pánico", "Preocupación excesiva", "Ansiedad social"],
  },
  {
    Icon: Footprints, titulo: "Depresión",
    texto: "Cuando todo pesa y nada motiva: apatía, autocrítica, aislamiento. Usamos activación conductual — recuperar el movimiento primero, para que la motivación llegue después — y trabajo profundo con creencias.",
    tags: ["Desánimo persistente", "Autoexigencia", "Aislamiento"],
  },
  {
    Icon: Hourglass, titulo: "Duelo",
    texto: "Perder a alguien — o algo — cambia el mapa completo. El duelo no se “supera”: se integra. Acompaño ese proceso a tu ritmo, honrando lo perdido mientras reconstruyes lo que sigue.",
    tags: ["Pérdidas", "Rupturas", "Cambios vitales"],
  },
];

function Areas() {
  return (
    <section id="areas" className="py-20 sm:py-28">
      <div className="max-w-6xl mx-auto px-5 sm:px-8">
        <motion.div
          variants={staggerParent}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.3 }}
          className="text-center max-w-2xl mx-auto"
        >
          <motion.div variants={fadeUp} className="text-[11px] uppercase tracking-[0.2em] text-brand-700 font-semibold">
            Áreas de acompañamiento
          </motion.div>
          <motion.h2 variants={fadeUp} className="mt-3 font-serif text-3xl sm:text-5xl tracking-tight">
            Tres procesos, un mismo método
          </motion.h2>
        </motion.div>

        <motion.div
          variants={staggerParent}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.2 }}
          className="mt-12 grid md:grid-cols-3 gap-5"
        >
          {AREAS.map((a) => (
            <motion.article
              key={a.titulo}
              variants={fadeUp}
              whileHover={{ y: -6 }}
              transition={{ duration: 0.4, ease: easeOutExpo }}
              className="rounded-2xl border border-line-200 bg-surface p-6 sm:p-7 shadow-xs hover:shadow-card transition-shadow"
            >
              <span className="h-11 w-11 rounded-xl bg-brand-50 text-brand-700 flex items-center justify-center">
                <a.Icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 font-serif text-2xl">{a.titulo}</h3>
              <p className="mt-3 text-sm text-ink-500 leading-relaxed">{a.texto}</p>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {a.tags.map((t) => (
                  <span key={t} className="text-[11px] px-2 py-0.5 rounded-full bg-bg-100 text-ink-500">{t}</span>
                ))}
              </div>
            </motion.article>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

/* ─── Proceso — línea que se dibuja con scrub ───────────────────────────── */
const PASOS = [
  { n: "01", t: "Primera consulta", d: "Nos conocemos. Me cuentas qué te trae y evaluamos juntas por dónde empezar. Sin compromiso de continuar." },
  { n: "02", t: "Plan de trabajo", d: "Definimos objetivos concretos y medibles. Sabrás siempre qué estamos trabajando y para qué." },
  { n: "03", t: "Sesiones + herramientas", d: "Cada sesión deja técnicas aplicables: registros, experimentos conductuales, ejercicios entre sesiones." },
  { n: "04", t: "Cierre con autonomía", d: "El objetivo es que no me necesites: terminas con un plan de prevención de recaídas y tus propias herramientas." },
];

function Proceso() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const ctx = gsap.context(() => {
      const path = ref.current?.querySelector<SVGPathElement>("[data-proceso-path]");
      if (path) {
        const len = path.getTotalLength();
        gsap.set(path, { strokeDasharray: len, strokeDashoffset: len });
        gsap.to(path, {
          strokeDashoffset: 0,
          ease: "none",
          scrollTrigger: { trigger: ref.current, start: "top 70%", end: "bottom 55%", scrub: 0.8 },
        });
      }
      gsap.utils.toArray<HTMLElement>("[data-proceso-paso]").forEach((el, i) => {
        gsap.fromTo(el, { autoAlpha: 0, y: 36 }, {
          autoAlpha: 1, y: 0, duration: 0.7, ease: "power3.out",
          scrollTrigger: { trigger: el, start: "top 80%" }, delay: (i % 2) * 0.1,
        });
      });
    }, ref);
    return () => ctx.revert();
  }, []);

  return (
    <section id="proceso" ref={ref} className="relative py-20 sm:py-28 bg-bg-100/60">
      <div className="max-w-4xl mx-auto px-5 sm:px-8">
        <div className="text-center">
          <div className="text-[11px] uppercase tracking-[0.2em] text-brand-700 font-semibold">Cómo trabajamos</div>
          <h2 className="mt-3 font-serif text-3xl sm:text-5xl tracking-tight">Un proceso con principio y fin</h2>
          <p className="mt-4 text-sm sm:text-base text-ink-500 max-w-lg mx-auto">
            La TCC es una terapia estructurada: no vienes “para siempre”, vienes a
            aprender lo que necesitas para seguir sin mí.
          </p>
        </div>

        <div className="relative mt-14">
          {/* Línea vertical que se dibuja al scrollear */}
          <svg aria-hidden className="absolute left-5 sm:left-1/2 top-0 h-full w-px overflow-visible" viewBox="0 0 2 1000" preserveAspectRatio="none">
            <path data-proceso-path d="M1 0 V1000" stroke="oklch(0.53 0.045 200)" strokeWidth="2" fill="none" />
          </svg>
          <div className="space-y-10 sm:space-y-14">
            {PASOS.map((p, i) => (
              <div
                key={p.n}
                data-proceso-paso
                className={`relative pl-14 sm:pl-0 sm:w-[calc(50%-2rem)] ${i % 2 === 1 ? "sm:ml-auto" : ""}`}
              >
                <span className={`absolute left-2.5 sm:left-auto top-1 h-5 w-5 rounded-full bg-brand-700 border-4 border-bg-100 ${i % 2 === 1 ? "sm:-left-[2.6rem]" : "sm:-right-[2.6rem]"}`} />
                <div className="rounded-2xl border border-line-200 bg-surface p-5 sm:p-6 shadow-xs">
                  <div className="font-serif text-brand-400 text-3xl">{p.n}</div>
                  <h3 className="mt-1 font-medium text-ink-900">{p.t}</h3>
                  <p className="mt-2 text-sm text-ink-500 leading-relaxed">{p.d}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Sobre mí — parallax en la foto ────────────────────────────────────── */
function SobreMi() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const ctx = gsap.context(() => {
      gsap.to("[data-sobre-foto]", {
        yPercent: -12,
        ease: "none",
        scrollTrigger: { trigger: ref.current, start: "top bottom", end: "bottom top", scrub: 1 },
      });
    }, ref);
    return () => ctx.revert();
  }, []);

  return (
    <section id="sobre-mi" ref={ref} className="py-20 sm:py-28 overflow-hidden">
      <div className="max-w-5xl mx-auto px-5 sm:px-8 grid lg:grid-cols-[0.9fr_1.1fr] gap-10 lg:gap-16 items-center">
        <motion.div
          initial={{ opacity: 0, x: -24 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.9, ease: easeOutExpo }}
          className="relative rounded-[2rem] overflow-hidden border border-line-200 shadow-card"
        >
          <img data-sobre-foto src={FOTO} alt="Nathaly Ferrer" className="w-full h-auto block scale-[1.15]" />
        </motion.div>
        <motion.div
          variants={staggerParent}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.3 }}
        >
          <motion.div variants={fadeUp} className="text-[11px] uppercase tracking-[0.2em] text-brand-700 font-semibold">
            Sobre mí
          </motion.div>
          <motion.h2 variants={fadeUp} className="mt-3 font-serif text-3xl sm:text-4xl tracking-tight">
            Terapia con estructura,<br />trato con calidez
          </motion.h2>
          <motion.p variants={fadeUp} className="mt-5 text-sm sm:text-base text-ink-500 leading-relaxed">
            Soy psicóloga clínica con maestría en Terapia Cognitivo-Conductual.
            Creo en una terapia donde sabes qué estamos haciendo y por qué:
            objetivos claros, técnicas con respaldo científico y un espacio
            donde puedas hablar sin sentirte evaluada.
          </motion.p>
          <motion.div variants={fadeUp} className="mt-6 rounded-2xl bg-brand-50 border border-brand-100 p-5 flex gap-3">
            <Quote className="h-5 w-5 text-brand-700 shrink-0 mt-0.5" />
            <p className="text-sm text-brand-900 leading-relaxed italic">
              No se trata de “pensar positivo”. Se trata de aprender a mirar tus
              pensamientos en vez de mirar el mundo a través de ellos.
            </p>
          </motion.div>
          <motion.ul variants={fadeUp} className="mt-6 space-y-2.5 text-sm text-ink-700">
            {[
              "Mg. en Terapia Cognitivo-Conductual",
              "Consulta online (cualquier país) y presencial",
              "Atención a adolescentes y adultos",
            ].map((item) => (
              <li key={item} className="flex items-center gap-2.5">
                <Sparkles className="h-4 w-4 text-brand-700 shrink-0" /> {item}
              </li>
            ))}
          </motion.ul>
        </motion.div>
      </div>
    </section>
  );
}

/* ─── Cierre fullscreen — video + liquid glass (referencia flowpath) ────── */
function CierreFullscreen() {
  return (
    <section className="relative h-screen w-full overflow-hidden bg-[#0c1418]">
      {/* Video de fondo con fallback de gradiente si no carga */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{ background: "radial-gradient(900px 600px at 50% 60%, oklch(0.4 0.06 200 / 0.6), #0c1418 75%)" }}
      />
      <video
        src={VIDEO_FINAL}
        autoPlay
        loop
        muted
        playsInline
        preload="metadata"
        className="absolute inset-0 h-full w-full object-cover"
        aria-hidden
      />
      <div className="absolute inset-0 bg-black/25" aria-hidden />

      <div className="relative h-full flex flex-col items-center justify-center text-center px-5">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, ease: easeOutExpo }}
          className="nf-liquid-glass rounded-full px-4 py-1.5 text-white/90 text-xs font-medium"
        >
          Consulta online y presencial · 📲 304 219 0650
        </motion.div>

        <motion.h2
          initial={{ opacity: 0, y: 24, filter: "blur(10px)" }}
          whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ duration: 0.9, ease: easeOutExpo, delay: 0.15 }}
          className="mt-7 font-serif text-white text-4xl sm:text-6xl lg:text-7xl leading-[1.05] tracking-[-0.02em] max-w-3xl"
        >
          El primer paso<br />
          <span className="text-white/60">también cuenta</span><br />
          como avance.
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, ease: easeOutExpo, delay: 0.35 }}
          className="mt-6 text-white/80 text-sm sm:text-base leading-relaxed max-w-md"
        >
          Escríbeme y agendamos una primera consulta. Sin fórmulas mágicas —
          un proceso serio, a tu ritmo, con herramientas que se quedan contigo.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, ease: easeOutExpo, delay: 0.5 }}
          className="mt-8 flex flex-wrap items-center justify-center gap-3 sm:gap-4"
        >
          <a
            href={WHATSAPP}
            target="_blank"
            rel="noreferrer"
            className="px-6 py-3 bg-white text-gray-900 text-sm font-semibold rounded-full hover:bg-white/90 transition-colors inline-flex items-center gap-2"
          >
            <MessageCircle className="h-4 w-4" /> Agendar por WhatsApp
          </a>
          <a
            href="#enfoque"
            className="nf-liquid-glass px-6 py-3 rounded-full text-white text-sm font-semibold hover:bg-white/10 transition-colors"
          >
            Volver a mi enfoque
          </a>
        </motion.div>
      </div>
    </section>
  );
}
