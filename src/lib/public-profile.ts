/**
 * Perfil público (linktree): catálogo de fondos y redes.
 *
 * Compartido entre Configuración → Perfil público (donde se elige) y la
 * página /perfil/<slug> (donde se pinta). Una sola fuente: si se añade un
 * fondo aquí, aparece en ambos lados.
 *
 * Los fondos son CSS puro (gradientes), no fotos: pesan cero, no hay que
 * subir ni optimizar nada, y sobre todo no compiten con la foto de la
 * persona, que es lo que debe destacar en un linktree. Todos son claros
 * para que el texto ink-900 siga leyéndose.
 */

export type ProfileBg = {
  key: string;
  label: string;
  /** Valor CSS para `background`. */
  css: string;
};

export const PROFILE_BGS: ProfileBg[] = [
  {
    key: "marca",
    label: "Marca",
    css:
      "radial-gradient(600px 400px at 85% 0%, oklch(0.93 0.018 200 / 0.8), transparent 60%)," +
      "radial-gradient(500px 400px at 0% 100%, oklch(0.96 0.012 150 / 0.9), transparent 60%)," +
      "oklch(0.985 0.004 150)",
  },
  {
    key: "bruma",
    label: "Bruma",
    css:
      "radial-gradient(700px 500px at 20% 0%, oklch(0.92 0.03 210 / 0.9), transparent 65%)," +
      "radial-gradient(600px 500px at 100% 80%, oklch(0.94 0.025 190 / 0.9), transparent 60%)," +
      "oklch(0.98 0.008 200)",
  },
  {
    key: "salvia",
    label: "Salvia",
    css:
      "radial-gradient(700px 500px at 100% 0%, oklch(0.92 0.04 150 / 0.9), transparent 60%)," +
      "radial-gradient(600px 600px at 0% 100%, oklch(0.95 0.03 130 / 0.9), transparent 60%)," +
      "oklch(0.98 0.01 140)",
  },
  {
    key: "arena",
    label: "Arena",
    css:
      "radial-gradient(700px 500px at 0% 0%, oklch(0.95 0.035 80 / 0.95), transparent 60%)," +
      "radial-gradient(600px 500px at 100% 100%, oklch(0.93 0.04 60 / 0.8), transparent 60%)," +
      "oklch(0.985 0.012 80)",
  },
  {
    key: "lavanda",
    label: "Lavanda",
    css:
      "radial-gradient(700px 500px at 90% 0%, oklch(0.92 0.05 300 / 0.9), transparent 60%)," +
      "radial-gradient(600px 600px at 0% 100%, oklch(0.95 0.03 330 / 0.9), transparent 60%)," +
      "oklch(0.98 0.01 310)",
  },
  {
    key: "oceano",
    label: "Océano",
    css:
      "radial-gradient(700px 500px at 0% 0%, oklch(0.9 0.06 240 / 0.85), transparent 60%)," +
      "radial-gradient(700px 500px at 100% 100%, oklch(0.93 0.04 220 / 0.9), transparent 60%)," +
      "oklch(0.975 0.012 235)",
  },
  {
    key: "terracota",
    label: "Terracota",
    css:
      "radial-gradient(700px 500px at 100% 0%, oklch(0.92 0.06 40 / 0.85), transparent 60%)," +
      "radial-gradient(600px 500px at 0% 100%, oklch(0.95 0.04 25 / 0.9), transparent 60%)," +
      "oklch(0.98 0.012 40)",
  },
  {
    key: "aurora",
    label: "Aurora",
    css:
      "radial-gradient(600px 400px at 10% 10%, oklch(0.92 0.06 160 / 0.9), transparent 60%)," +
      "radial-gradient(600px 400px at 90% 30%, oklch(0.92 0.06 290 / 0.8), transparent 60%)," +
      "radial-gradient(700px 500px at 50% 100%, oklch(0.93 0.05 220 / 0.9), transparent 60%)," +
      "oklch(0.98 0.008 240)",
  },
  {
    key: "papel",
    label: "Papel",
    css:
      "repeating-linear-gradient(0deg, oklch(0.95 0.004 90 / 0.5) 0 1px, transparent 1px 28px)," +
      "oklch(0.985 0.005 90)",
  },
];

export const DEFAULT_BG = "marca";

export function bgByKey(key: string | null | undefined): ProfileBg {
  return PROFILE_BGS.find((b) => b.key === key) ?? PROFILE_BGS[0];
}

/** Redes predeterminadas, en el orden en que se muestran. */
export const SOCIAL_KEYS = ["instagram", "tiktok", "facebook", "youtube", "linkedin", "whatsapp"] as const;
export type SocialKey = (typeof SOCIAL_KEYS)[number];
export type Socials = Partial<Record<SocialKey, string>>;

export const SOCIAL_META: Record<SocialKey, { label: string; placeholder: string; hint: string }> = {
  instagram: { label: "Instagram", placeholder: "@usuario", hint: "Usuario o enlace" },
  tiktok: { label: "TikTok", placeholder: "@usuario", hint: "Usuario o enlace" },
  facebook: { label: "Facebook", placeholder: "facebook.com/tu-pagina", hint: "Enlace de tu página o perfil" },
  youtube: { label: "YouTube", placeholder: "youtube.com/@canal", hint: "Enlace de tu canal" },
  linkedin: { label: "LinkedIn", placeholder: "linkedin.com/in/tu-nombre", hint: "Enlace de tu perfil" },
  whatsapp: { label: "WhatsApp", placeholder: "300 123 4567", hint: "Si lo dejas vacío se usa el teléfono de tu perfil" },
};
