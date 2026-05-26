import { motion } from "framer-motion";
import { Instagram, Github } from "lucide-react";
import { cn } from "@/lib/utils";
import { easeOutExpo, fadeUp, staggerParent } from "./motion";
import { SectionHeader } from "./Features";
import { WhatsAppIcon } from "./BrandIcons";

/**
 * Sección "Detrás de Psicomorfosis" — pone cara a la plataforma.
 * Ambos firmamos como Co-Desarrollador (full-stack) porque, en la
 * práctica, los dos tocamos frontend y backend. Las skills están
 * alineadas con el stack real:
 *   Frontend: React + TS + Tailwind v4 + Framer Motion + TanStack
 *   Backend:  Node + Express + better-sqlite3 + JWT + nodemailer + pdfkit
 *   Deploy:   PM2 + nginx + VPS Ubuntu + Cloudflare
 */
interface SkillBar {
  label: string;
  value: number;
}

interface Developer {
  name: string;
  role: string;
  bio: string;
  photo: string;
  skills: SkillBar[];
  tags: string[];
  socials: {
    instagram: string;
    whatsapp: string;
    github: string;
  };
}

const DEVELOPERS: Developer[] = [
  {
    name: "Edgardo Meza",
    role: "Co-Desarrollador · Full-Stack & UI",
    bio: "Apasionado por transformar ideas complejas en experiencias digitales intuitivas. En Psicomorfosis lideró el diseño de interfaz, las animaciones, el sistema de diseño y la experiencia del usuario clínico. Le obsesiona el código limpio y que cada interacción se sienta natural.",
    photo: "/landing/edgardo.png",
    skills: [
      { label: "React / TypeScript", value: 90 },
      { label: "Tailwind / UI / Animaciones", value: 88 },
      { label: "Node.js / Express", value: 82 },
      { label: "DevOps / Deploy", value: 78 },
    ],
    tags: ["React", "TypeScript", "Tailwind", "Framer Motion", "Node.js", "Express", "Vite", "Nginx", "PM2"],
    socials: {
      instagram: "https://www.instagram.com/saint.lakki/",
      whatsapp: "https://wa.me/573116123189",
      github: "https://github.com/RealLakki",
    },
  },
  {
    name: "Stiven Antequera",
    role: "Co-Desarrollador · Backend & Arquitectura",
    bio: "Enfocado en digitalizar procesos complejos con software intuitivo y seguro. En Psicomorfosis diseñó la arquitectura clínica, el motor de evaluaciones psicométricas, la generación de documentos, la firma digital y toda la lógica de negocio que hace que la plataforma funcione en producción.",
    photo: "/landing/stiven.png",
    skills: [
      { label: "Node.js / Express", value: 90 },
      { label: "React / Frontend", value: 88 },
      { label: "SQLite / Bases de datos", value: 85 },
      { label: "Seguridad / APIs / JWT", value: 82 },
    ],
    tags: ["React", "Node.js", "SQLite", "Express", "JWT", "PDF Gen", "SMTP", "TypeScript"],
    socials: {
      instagram: "https://www.instagram.com/stivenantequera/",
      whatsapp: "https://wa.me/573026444564",
      github: "https://github.com/santequera1",
    },
  },
];

export function Developers() {
  return (
    <section id="developers" className="py-20 sm:py-28 relative">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader
          eyebrow="Detrás de Psicomorfosis"
          title="Las personas que la construyen"
          subtitle="Una plataforma clínica no es solo software. Son las personas que entienden el problema y se obsesionan con resolverlo bien. Contáctanos cuando quieras."
        />

        <motion.div
          variants={staggerParent}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
          className="mt-16 grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8"
        >
          {DEVELOPERS.map((dev) => (
            <DeveloperCard key={dev.name} dev={dev} />
          ))}
        </motion.div>
      </div>
    </section>
  );
}

function DeveloperCard({ dev }: { dev: Developer }) {
  return (
    <motion.div
      variants={fadeUp}
      whileHover={{ y: -4 }}
      transition={{ duration: 0.5, ease: easeOutExpo }}
      className="rounded-2xl border border-line-200 bg-surface/80 backdrop-blur-sm p-6 sm:p-8 relative overflow-hidden shadow-lg shadow-brand-700/5"
    >
      {/* Glow muy sutil que respira */}
      <motion.div
        className="absolute -top-20 -right-20 h-48 w-48 rounded-full blur-2xl pointer-events-none"
        style={{
          background: "radial-gradient(circle, oklch(0.7 0.12 175 / 0.25), transparent 70%)",
        }}
        animate={{ opacity: [0.4, 0.7, 0.4] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        aria-hidden
      />

      <div className="relative">
        {/* Foto + nombre */}
        <div className="flex items-start gap-5">
          <div className="relative shrink-0">
            <div
              className="absolute -inset-1 rounded-full blur-md opacity-50"
              style={{
                background: "radial-gradient(circle, oklch(0.7 0.12 175 / 0.6), transparent 70%)",
              }}
              aria-hidden
            />
            <img
              src={dev.photo}
              alt={`Foto de ${dev.name}`}
              loading="lazy"
              className="relative h-24 w-24 sm:h-28 sm:w-28 rounded-full object-cover border-2 border-surface shadow-lg"
            />
          </div>
          <div className="min-w-0 pt-1">
            <h3 className="font-serif text-2xl sm:text-3xl text-ink-900 leading-tight tracking-tight">
              {dev.name}
            </h3>
            <p className="mt-1.5 text-xs sm:text-sm text-brand-700 font-medium">
              {dev.role}
            </p>
          </div>
        </div>

        {/* Bio */}
        <p className="mt-5 text-sm text-ink-700 leading-relaxed">{dev.bio}</p>

        {/* Skills con barras */}
        <div className="mt-7 space-y-3.5">
          {dev.skills.map((s, i) => (
            <SkillRow key={s.label} skill={s} delay={i * 0.08} />
          ))}
        </div>

        {/* Tags */}
        <div className="mt-7 flex flex-wrap gap-1.5">
          {dev.tags.map((t) => (
            <span
              key={t}
              className="inline-flex items-center h-7 px-3 rounded-full bg-bg-50 border border-line-200 text-xs text-ink-700 font-medium"
            >
              {t}
            </span>
          ))}
        </div>

        {/* Social */}
        <div className="mt-7 pt-5 border-t border-line-100 flex items-center gap-3">
          <SocialLink href={dev.socials.instagram} label={`Instagram de ${dev.name}`}>
            <Instagram className="h-4 w-4" />
          </SocialLink>
          <SocialLink href={dev.socials.whatsapp} label={`WhatsApp de ${dev.name}`}>
            <WhatsAppIcon className="h-4 w-4" />
          </SocialLink>
          <SocialLink href={dev.socials.github} label={`GitHub de ${dev.name}`}>
            <Github className="h-4 w-4" />
          </SocialLink>
        </div>
      </div>
    </motion.div>
  );
}

function SkillRow({ skill, delay }: { skill: SkillBar; delay: number }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-ink-700 font-medium">{skill.label}</span>
        <span className="text-ink-500 tabular-nums">{skill.value}%</span>
      </div>
      <div className="mt-1.5 h-1.5 w-full rounded-full bg-bg-50 overflow-hidden">
        <motion.div
          className="h-full rounded-full bg-brand-700"
          initial={{ width: 0 }}
          whileInView={{ width: `${skill.value}%` }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 1.2, ease: easeOutExpo, delay }}
        />
      </div>
    </div>
  );
}

function SocialLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <motion.a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      whileHover={{ y: -2, scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      transition={{ duration: 0.25, ease: easeOutExpo }}
      className={cn(
        "h-10 w-10 rounded-full border border-line-200 bg-surface text-ink-700 inline-flex items-center justify-center",
        "hover:border-brand-400 hover:text-brand-700 transition-colors",
      )}
    >
      {children}
    </motion.a>
  );
}
