import { motion } from "framer-motion";
import { ArrowRight, MessageCircle } from "lucide-react";
import { easeOutExpo, fadeUp, staggerParent } from "./motion";

/**
 * Cierre cinematográfico. Va después de WhyUs y antes del DemoForm.
 * Cambia el tono visual (panel oscuro orgánico) para crear contraste
 * con la calma del resto y dar peso al momento de decisión.
 *
 * Background con glow respirante. Tipografía editorial grande.
 */
export function FinalCTA() {
  return (
    <section id="cierre" className="py-24 sm:py-36 relative">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 40, filter: "blur(12px)" }}
          whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 1, ease: easeOutExpo }}
          className="relative rounded-3xl overflow-hidden border border-brand-900/20 bg-gradient-to-br from-[oklch(0.28_0.04_175)] via-[oklch(0.32_0.05_175)] to-[oklch(0.25_0.05_185)] px-6 sm:px-12 lg:px-20 py-20 sm:py-28 text-center"
        >
          {/* Glow respirante */}
          <motion.div
            className="absolute -inset-x-32 -top-32 -bottom-32 pointer-events-none blur-3xl"
            style={{
              background:
                "radial-gradient(ellipse at center, oklch(0.7 0.15 175 / 0.5), transparent 60%)",
            }}
            animate={{ opacity: [0.4, 0.7, 0.4], scale: [1, 1.05, 1] }}
            transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
            aria-hidden
          />

          {/* Ruido sutil con dots — pattern muy discreto */}
          <div
            className="absolute inset-0 opacity-[0.06] pointer-events-none"
            style={{
              backgroundImage:
                "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
              backgroundSize: "32px 32px",
            }}
            aria-hidden
          />

          <motion.div
            variants={staggerParent}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            className="relative max-w-3xl mx-auto"
          >
            <motion.p
              variants={fadeUp}
              className="text-xs uppercase tracking-widest text-brand-200 font-semibold"
            >
              Es momento
            </motion.p>
            <motion.h2
              variants={fadeUp}
              className="mt-4 font-serif text-4xl sm:text-5xl lg:text-6xl text-white leading-[1.05] tracking-tight"
            >
              Deja de atender entre chats, papeles y hojas de cálculo.
            </motion.h2>
            <motion.p
              variants={fadeUp}
              className="mt-6 text-base sm:text-lg text-brand-50/80 leading-relaxed max-w-2xl mx-auto"
            >
              Tus pacientes merecen una experiencia profesional. Tú mereces tu tiempo
              de vuelta. Empieza con tu propio workspace en menos de 24 horas.
            </motion.p>

            <motion.div
              variants={fadeUp}
              className="mt-10 flex items-center justify-center gap-3 flex-wrap"
            >
              <motion.a
                href="#demo"
                whileHover={{ y: -2, scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                transition={{ duration: 0.3, ease: easeOutExpo }}
                className="h-12 px-7 rounded-lg bg-white text-ink-900 text-sm font-medium inline-flex items-center gap-2 shadow-2xl shadow-black/20"
              >
                Quiero acceso <ArrowRight className="h-4 w-4" />
              </motion.a>
              <motion.a
                href="mailto:stivenantequera@gmail.com"
                whileHover={{ y: -2 }}
                transition={{ duration: 0.3, ease: easeOutExpo }}
                className="h-12 px-6 rounded-lg border border-white/20 bg-white/5 text-white text-sm font-medium inline-flex items-center gap-2 hover:bg-white/10 transition-colors"
              >
                <MessageCircle className="h-4 w-4" /> Hablar con un humano
              </motion.a>
            </motion.div>

            <motion.p
              variants={fadeUp}
              className="mt-8 text-xs text-brand-100/70"
            >
              Sin tarjeta · Sin compromiso · Soporte directo por WhatsApp
            </motion.p>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
