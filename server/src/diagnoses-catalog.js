/**
 * Catálogo mínimo curado de diagnósticos para el bloque "Impresión
 * diagnóstica" de la historia clínica.
 *
 * Diseño:
 *  - Cada entrada representa UN concepto clínico (ej. "Trastorno de
 *    ansiedad generalizada") con códigos paralelos en los dos sistemas
 *    más usados: CIE-11 (OMS) y DSM-5-TR (APA, código ICD-10-CM).
 *  - El psicólogo elige el sistema en la UI; el catálogo le devuelve
 *    los conceptos disponibles y al seleccionar uno se persiste con
 *    el código del sistema elegido.
 *  - Categorías inspiradas en la frecuencia real de uso en clínica
 *    privada colombiana (ansiedad y estado de ánimo son ~60% de los
 *    casos típicos).
 *  - "keywords" son sinónimos coloquiales para mejorar el autocomplete
 *    cuando la psicóloga teclea términos no formales ("preocupación"
 *    encuentra TAG, "duelo" encuentra el código relacional).
 *
 * NO REPRODUCIMOS texto descriptivo del manual DSM-5-TR (copyright
 * APA). Los códigos en sí son ICD-10-CM, dominio público. Los nombres
 * que usamos son denominaciones genéricas en español, no transcripción
 * del manual.
 *
 * El catálogo es intencionalmente PEQUEÑO (~30 entradas). Si una
 * psicóloga necesita un dx que no está, escribe el texto libre y
 * elige "Otro" como sistema. En el futuro la IA o un autocomplete
 * conectado a OMS puede expandirlo.
 */

export const DIAGNOSIS_CATEGORIES = [
  "Ansiedad",
  "Estado de ánimo",
  "Trauma y estrés",
  "Neurodesarrollo",
  "Sueño",
  "Alimentación",
  "Personalidad",
  "Adicciones",
  "Relacionales y situacionales",
];

/**
 * Entradas del catálogo. Estructura:
 *  - id: slug estable interno (no se muestra)
 *  - category: agrupación visual en la UI
 *  - name: denominación principal en español
 *  - codes: códigos por sistema diagnóstico
 *  - keywords: sinónimos/términos para mejorar la búsqueda
 */
export const DIAGNOSIS_CATALOG = [
  // ─── Ansiedad ──────────────────────────────────────────────────────
  {
    id: "tag",
    category: "Ansiedad",
    name: "Trastorno de ansiedad generalizada",
    codes: { "CIE-11": "6B00", "DSM-5-TR": "F41.1" },
    keywords: ["tag", "ansiedad", "preocupación", "ansiedad generalizada", "preocupado"],
  },
  {
    id: "panico",
    category: "Ansiedad",
    name: "Trastorno de pánico",
    codes: { "CIE-11": "6B01", "DSM-5-TR": "F41.0" },
    keywords: ["pánico", "panico", "ataques de pánico", "crisis"],
  },
  {
    id: "fobia-social",
    category: "Ansiedad",
    name: "Trastorno de ansiedad social",
    codes: { "CIE-11": "6B04", "DSM-5-TR": "F40.10" },
    keywords: ["fobia social", "ansiedad social", "timidez", "social"],
  },
  {
    id: "agorafobia",
    category: "Ansiedad",
    name: "Agorafobia",
    codes: { "CIE-11": "6B02", "DSM-5-TR": "F40.00" },
    keywords: ["agorafobia", "espacios abiertos", "salir de casa"],
  },
  {
    id: "toc",
    category: "Ansiedad",
    name: "Trastorno obsesivo-compulsivo",
    codes: { "CIE-11": "6B20", "DSM-5-TR": "F42.2" },
    keywords: ["toc", "obsesivo", "compulsivo", "obsesiones", "compulsiones", "rituales"],
  },

  // ─── Estado de ánimo ───────────────────────────────────────────────
  {
    id: "dep-leve",
    category: "Estado de ánimo",
    name: "Episodio depresivo, leve",
    codes: { "CIE-11": "6A70.0", "DSM-5-TR": "F32.0" },
    keywords: ["depresión leve", "tristeza", "ánimo bajo"],
  },
  {
    id: "dep-moderado",
    category: "Estado de ánimo",
    name: "Episodio depresivo, moderado",
    codes: { "CIE-11": "6A70.1", "DSM-5-TR": "F32.1" },
    keywords: ["depresión", "depresión moderada", "depresivo"],
  },
  {
    id: "dep-grave",
    category: "Estado de ánimo",
    name: "Episodio depresivo, grave",
    codes: { "CIE-11": "6A70.2", "DSM-5-TR": "F32.2" },
    keywords: ["depresión grave", "depresión severa", "depresión mayor"],
  },
  {
    id: "dep-recurrente",
    category: "Estado de ánimo",
    name: "Trastorno depresivo recurrente",
    codes: { "CIE-11": "6A71", "DSM-5-TR": "F33.1" },
    keywords: ["depresión recurrente", "depresivo recurrente"],
  },
  {
    id: "distimia",
    category: "Estado de ánimo",
    name: "Trastorno depresivo persistente (distimia)",
    codes: { "CIE-11": "6A72", "DSM-5-TR": "F34.1" },
    keywords: ["distimia", "depresión crónica", "persistente"],
  },
  {
    id: "bipolar-i",
    category: "Estado de ánimo",
    name: "Trastorno bipolar tipo I",
    codes: { "CIE-11": "6A60", "DSM-5-TR": "F31.9" },
    keywords: ["bipolar", "maníaco", "manía", "bipolar i"],
  },
  {
    id: "bipolar-ii",
    category: "Estado de ánimo",
    name: "Trastorno bipolar tipo II",
    codes: { "CIE-11": "6A61", "DSM-5-TR": "F31.81" },
    keywords: ["bipolar ii", "hipomanía", "hipomania"],
  },

  // ─── Trauma y estrés ───────────────────────────────────────────────
  {
    id: "tept",
    category: "Trauma y estrés",
    name: "Trastorno por estrés postraumático",
    codes: { "CIE-11": "6B40", "DSM-5-TR": "F43.10" },
    keywords: ["tept", "estrés postraumático", "ptsd", "trauma", "flashback"],
  },
  {
    id: "tept-c",
    category: "Trauma y estrés",
    name: "Trastorno por estrés postraumático complejo",
    codes: { "CIE-11": "6B41", "DSM-5-TR": null },
    keywords: ["tept complejo", "trauma complejo", "trauma crónico"],
  },
  {
    id: "trastorno-adaptacion",
    category: "Trauma y estrés",
    name: "Trastorno de adaptación",
    codes: { "CIE-11": "6B43", "DSM-5-TR": "F43.20" },
    keywords: ["adaptación", "adaptacion", "ajuste"],
  },
  {
    id: "estres-agudo",
    category: "Trauma y estrés",
    name: "Reacción a estrés agudo",
    codes: { "CIE-11": "QE84", "DSM-5-TR": "F43.0" },
    keywords: ["estrés agudo", "reacción aguda", "shock"],
  },

  // ─── Neurodesarrollo ───────────────────────────────────────────────
  {
    id: "tdah",
    category: "Neurodesarrollo",
    name: "Trastorno por déficit de atención e hiperactividad",
    codes: { "CIE-11": "6A05", "DSM-5-TR": "F90.9" },
    keywords: ["tdah", "déficit de atención", "deficit atencion", "hiperactividad", "adhd"],
  },
  {
    id: "tea",
    category: "Neurodesarrollo",
    name: "Trastorno del espectro autista",
    codes: { "CIE-11": "6A02", "DSM-5-TR": "F84.0" },
    keywords: ["tea", "autismo", "espectro autista", "asperger"],
  },
  {
    id: "dificultades-aprendizaje",
    category: "Neurodesarrollo",
    name: "Trastorno del aprendizaje",
    codes: { "CIE-11": "6A03", "DSM-5-TR": "F81.9" },
    keywords: ["aprendizaje", "dislexia", "discalculia", "lectura"],
  },

  // ─── Sueño ─────────────────────────────────────────────────────────
  {
    id: "insomnio",
    category: "Sueño",
    name: "Trastorno de insomnio",
    codes: { "CIE-11": "7A00", "DSM-5-TR": "F51.01" },
    keywords: ["insomnio", "no duermo", "dormir", "sueño"],
  },

  // ─── Alimentación ──────────────────────────────────────────────────
  {
    id: "anorexia",
    category: "Alimentación",
    name: "Anorexia nerviosa",
    codes: { "CIE-11": "6B80", "DSM-5-TR": "F50.0" },
    keywords: ["anorexia", "no come", "alimentación restrictiva"],
  },
  {
    id: "bulimia",
    category: "Alimentación",
    name: "Bulimia nerviosa",
    codes: { "CIE-11": "6B81", "DSM-5-TR": "F50.2" },
    keywords: ["bulimia", "atracón vómito", "purgativo"],
  },
  {
    id: "atracon",
    category: "Alimentación",
    name: "Trastorno por atracón",
    codes: { "CIE-11": "6B82", "DSM-5-TR": "F50.81" },
    keywords: ["atracón", "atracon", "comer compulsivo", "binge"],
  },

  // ─── Personalidad ──────────────────────────────────────────────────
  {
    id: "tlp",
    category: "Personalidad",
    name: "Trastorno límite de personalidad",
    codes: { "CIE-11": "6D10.5", "DSM-5-TR": "F60.3" },
    keywords: ["tlp", "límite", "borderline", "limite", "inestabilidad"],
  },
  {
    id: "evitativo",
    category: "Personalidad",
    name: "Trastorno de la personalidad de patrón ansioso/evitativo",
    codes: { "CIE-11": "6D11.4", "DSM-5-TR": "F60.6" },
    keywords: ["evitativo", "ansioso evitativo", "evitación"],
  },

  // ─── Adicciones ────────────────────────────────────────────────────
  {
    id: "alcohol",
    category: "Adicciones",
    name: "Trastorno por consumo de alcohol",
    codes: { "CIE-11": "6C40", "DSM-5-TR": "F10.20" },
    keywords: ["alcohol", "alcoholismo", "bebe", "dependencia alcohol"],
  },
  {
    id: "sustancias",
    category: "Adicciones",
    name: "Trastorno por consumo de sustancias",
    codes: { "CIE-11": "6C4A", "DSM-5-TR": "F19.20" },
    keywords: ["sustancias", "drogas", "adicción", "cannabis", "cocaína"],
  },

  // ─── Relacionales y situacionales (códigos Z / Q) ──────────────────
  // En CIE-11 muchos códigos QExx son "factores que influyen en el
  // estado de salud" — equivalentes a los Z en CIE-10. NO son
  // trastornos diagnósticos formales sino "razones de consulta" que
  // las psicólogas registran cuando no hay psicopatología.
  {
    id: "problema-pareja",
    category: "Relacionales y situacionales",
    name: "Problemas en relación de pareja",
    codes: { "CIE-11": "QE51.0", "DSM-5-TR": "Z63.0" },
    keywords: ["pareja", "matrimonio", "relación", "ruptura", "infidelidad"],
  },
  {
    id: "duelo",
    category: "Relacionales y situacionales",
    name: "Reacción de duelo (no patológica)",
    codes: { "CIE-11": "QE62", "DSM-5-TR": "Z63.4" },
    keywords: ["duelo", "muerte", "pérdida", "fallecimiento"],
  },
  {
    id: "conflictos-familia",
    category: "Relacionales y situacionales",
    name: "Problemas familiares",
    codes: { "CIE-11": "QE52", "DSM-5-TR": "Z63.7" },
    keywords: ["familia", "familiar", "padres", "hijos", "conflicto familiar"],
  },
  {
    id: "burnout",
    category: "Relacionales y situacionales",
    name: "Síndrome de desgaste profesional (burnout)",
    codes: { "CIE-11": "QD85", "DSM-5-TR": null },
    keywords: ["burnout", "desgaste", "agotamiento", "fatiga laboral"],
  },
  {
    id: "estres-laboral",
    category: "Relacionales y situacionales",
    name: "Estrés laboral",
    codes: { "CIE-11": "QD81", "DSM-5-TR": "Z56.6" },
    keywords: ["estrés laboral", "trabajo", "estres trabajo", "presión laboral"],
  },
];

/**
 * Devuelve solo las entradas que tienen código para el sistema pedido.
 * Útil para filtrar el catálogo según el sistema diagnóstico que la
 * psicóloga eligió en la UI.
 */
export function filterCatalogBySystem(system) {
  return DIAGNOSIS_CATALOG
    .filter((d) => d.codes[system] != null)
    .map((d) => ({
      id: d.id,
      category: d.category,
      name: d.name,
      code: d.codes[system],
      keywords: d.keywords,
    }));
}
