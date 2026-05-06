/**
 * Definiciones completas de los tests psicométricos del catálogo.
 *
 * Cada test tiene:
 *  - id, code, name, short_name, items, minutes, category, description, age_range
 *  - scale: opciones de respuesta { value, label }
 *  - questions: array { id, text, reverse?: bool }  (reverse=true para ítems invertidos)
 *  - scoring: cómo calcular el score
 *  - ranges: niveles según puntaje { min, max, label, level: 'none'|'low'|'moderate'|'high'|'critical' }
 *  - alerts (opcional): { critical_question_id, critical_threshold } para alertas clínicas
 *  - instructions: texto motivacional/instructivo antes del test
 *
 * scoring.type:
 *  - 'sum'         → suma directa de los valores marcados
 *  - 'sum_reversed' → respeta atributo reverse en cada question
 *  - 'eat26'       → solo cuentan respuestas en los extremos (especial)
 *  - 'millon'      → suma por escala usando matriz V/F → escala+peso
 *                    (MCMI-II). Devuelve raw scores por escala, no BR.
 *
 * IMPORTANTE: las preguntas se guardan en 1ra persona singular cuando el
 * paciente contesta solo. Cuando el psicólogo aplica, igual se entiende bien.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname_psy = dirname(fileURLToPath(import.meta.url));
const MCMI2_QUESTIONS = JSON.parse(readFileSync(join(__dirname_psy, "data", "mcmi2-questions.json"), "utf8"));
const MCMI2_MATRIX = JSON.parse(readFileSync(join(__dirname_psy, "data", "mcmi2-scoring-matrix.json"), "utf8"));

// Escala V/F común para tests dicotómicos (MCMI-II).
const SCALE_VF = [
  { value: 1, label: "Verdadero" },
  { value: 2, label: "Falso" },
];

// Escalas comunes reusables
const LIKERT_PHQ = [
  { value: 0, label: "Para nada" },
  { value: 1, label: "Varios días" },
  { value: 2, label: "Más de la mitad de los días" },
  { value: 3, label: "Casi todos los días" },
];

const LIKERT_BDI = [
  { value: 0, label: "0" },
  { value: 1, label: "1" },
  { value: 2, label: "2" },
  { value: 3, label: "3" },
];

const LIKERT_BAI = [
  { value: 0, label: "Para nada" },
  { value: 1, label: "Levemente · Apenas me molestó" },
  { value: 2, label: "Moderadamente · Fue desagradable pero pude soportarlo" },
  { value: 3, label: "Severamente · Casi no podía soportarlo" },
];

const LIKERT_RSES = [
  { value: 1, label: "Muy en desacuerdo" },
  { value: 2, label: "En desacuerdo" },
  { value: 3, label: "De acuerdo" },
  { value: 4, label: "Muy de acuerdo" },
];

const LIKERT_PCL5 = [
  { value: 0, label: "Para nada" },
  { value: 1, label: "Un poco" },
  { value: 2, label: "Moderadamente" },
  { value: 3, label: "Bastante" },
  { value: 4, label: "Extremadamente" },
];

const LIKERT_EAT = [
  { value: 0, label: "Nunca" },
  { value: 0, label: "Raramente" },
  { value: 0, label: "Algunas veces" },
  { value: 1, label: "A menudo" },
  { value: 2, label: "Muy a menudo" },
  { value: 3, label: "Siempre" },
];

export const PSYCH_TEST_DEFINITIONS = [
  // ──────────────────────────────────────────────────────────────────────────
  {
    id: "phq9",
    code: "PHQ-9",
    name: "Patient Health Questionnaire",
    short_name: "PHQ-9",
    items: 9,
    minutes: 5,
    category: "Depresión",
    age_range: "≥ 12 años",
    description: "Tamizaje y medición de la severidad de síntomas depresivos en las últimas 2 semanas.",
    instructions: "Durante las últimas 2 semanas, ¿qué tan seguido le han molestado los siguientes problemas?",
    scale: LIKERT_PHQ,
    scoring: { type: "sum" },
    ranges: [
      { min: 0,  max: 4,  label: "Mínima",                 level: "none" },
      { min: 5,  max: 9,  label: "Leve",                   level: "low" },
      { min: 10, max: 14, label: "Moderada",               level: "moderate" },
      { min: 15, max: 19, label: "Moderadamente severa",   level: "high" },
      { min: 20, max: 27, label: "Severa",                 level: "critical" },
    ],
    alerts: { critical_question_id: "q9", critical_threshold: 1 },
    questions: [
      { id: "q1", text: "Poco interés o placer en hacer las cosas." },
      { id: "q2", text: "Sentirse decaído(a), deprimido(a) o sin esperanzas." },
      { id: "q3", text: "Dificultad para conciliar el sueño, mantenerse dormido(a) o dormir demasiado." },
      { id: "q4", text: "Sentirse cansado(a) o con poca energía." },
      { id: "q5", text: "Falta de apetito o comer en exceso." },
      { id: "q6", text: "Sentirse mal consigo mismo(a) — o sentir que es un fracaso o que ha decepcionado a su familia." },
      { id: "q7", text: "Dificultad para concentrarse en cosas como leer el periódico o ver televisión." },
      { id: "q8", text: "Moverse o hablar tan despacio que otros lo notan, o lo contrario: estar tan inquieto(a) que se mueve mucho más de lo normal." },
      { id: "q9", text: "Pensamientos de que estaría mejor muerto(a) o de hacerse daño de alguna manera." },
    ],
  },

  // ──────────────────────────────────────────────────────────────────────────
  {
    id: "gad7",
    code: "GAD-7",
    name: "Generalized Anxiety Disorder",
    short_name: "GAD-7",
    items: 7,
    minutes: 4,
    category: "Ansiedad",
    age_range: "≥ 12 años",
    description: "Evalúa la severidad de síntomas de ansiedad generalizada en las últimas 2 semanas.",
    instructions: "Durante las últimas 2 semanas, ¿qué tan seguido le han molestado los siguientes problemas?",
    scale: LIKERT_PHQ,
    scoring: { type: "sum" },
    ranges: [
      { min: 0,  max: 4,  label: "Mínima",   level: "none" },
      { min: 5,  max: 9,  label: "Leve",     level: "low" },
      { min: 10, max: 14, label: "Moderada", level: "moderate" },
      { min: 15, max: 21, label: "Severa",   level: "high" },
    ],
    questions: [
      { id: "q1", text: "Sentirse nervioso(a), ansioso(a) o muy alterado(a)." },
      { id: "q2", text: "No poder dejar de preocuparse o controlar la preocupación." },
      { id: "q3", text: "Preocuparse demasiado por diferentes cosas." },
      { id: "q4", text: "Dificultad para relajarse." },
      { id: "q5", text: "Estar tan inquieto(a) que es difícil quedarse quieto(a)." },
      { id: "q6", text: "Disgustarse o irritarse fácilmente." },
      { id: "q7", text: "Sentir miedo como si algo terrible pudiera pasar." },
    ],
  },

  // ──────────────────────────────────────────────────────────────────────────
  {
    id: "bdi2",
    code: "BDI-II",
    name: "Beck Depression Inventory",
    short_name: "BDI-II",
    items: 21,
    minutes: 10,
    category: "Depresión",
    age_range: "≥ 13 años",
    description: "Inventario de 21 ítems para evaluar la presencia y severidad de síntomas depresivos.",
    instructions: "Lea cada grupo y elija la opción que mejor describa cómo se ha sentido durante las últimas 2 semanas, incluyendo hoy.",
    scale: LIKERT_BDI,
    scoring: { type: "sum" },
    ranges: [
      { min: 0,  max: 13, label: "Mínima",   level: "none" },
      { min: 14, max: 19, label: "Leve",     level: "low" },
      { min: 20, max: 28, label: "Moderada", level: "moderate" },
      { min: 29, max: 63, label: "Severa",   level: "high" },
    ],
    alerts: { critical_question_id: "q9", critical_threshold: 1 },
    // BDI-II usa redacción específica por grupo, pero por simplicidad y para que el
    // paciente lo conteste solo, presentamos cada ítem como pregunta + escala 0-3.
    questions: [
      { id: "q1",  text: "Tristeza" },
      { id: "q2",  text: "Pesimismo" },
      { id: "q3",  text: "Sensación de fracaso" },
      { id: "q4",  text: "Pérdida de placer" },
      { id: "q5",  text: "Sentimientos de culpa" },
      { id: "q6",  text: "Sentimientos de castigo" },
      { id: "q7",  text: "Disconformidad con uno(a) mismo(a)" },
      { id: "q8",  text: "Autocrítica" },
      { id: "q9",  text: "Pensamientos o deseos suicidas" },
      { id: "q10", text: "Llanto" },
      { id: "q11", text: "Agitación" },
      { id: "q12", text: "Pérdida de interés" },
      { id: "q13", text: "Indecisión" },
      { id: "q14", text: "Desvalorización" },
      { id: "q15", text: "Pérdida de energía" },
      { id: "q16", text: "Cambios en patrones de sueño" },
      { id: "q17", text: "Irritabilidad" },
      { id: "q18", text: "Cambios en el apetito" },
      { id: "q19", text: "Dificultad de concentración" },
      { id: "q20", text: "Cansancio o fatiga" },
      { id: "q21", text: "Pérdida de interés en el sexo" },
    ],
  },

  // ──────────────────────────────────────────────────────────────────────────
  {
    id: "bai",
    code: "BAI",
    name: "Beck Anxiety Inventory",
    short_name: "Beck Ansiedad",
    items: 21,
    minutes: 8,
    category: "Ansiedad",
    age_range: "≥ 17 años",
    description: "Mide síntomas somáticos y cognitivos de ansiedad en la última semana.",
    instructions: "A continuación hay una lista de síntomas comunes de ansiedad. Indique en qué medida le ha molestado cada síntoma durante la última semana, incluyendo hoy.",
    scale: LIKERT_BAI,
    scoring: { type: "sum" },
    ranges: [
      { min: 0,  max: 7,  label: "Mínima",   level: "none" },
      { min: 8,  max: 15, label: "Leve",     level: "low" },
      { min: 16, max: 25, label: "Moderada", level: "moderate" },
      { min: 26, max: 63, label: "Severa",   level: "high" },
    ],
    questions: [
      { id: "q1",  text: "Hormigueo o adormecimiento" },
      { id: "q2",  text: "Sensación de calor" },
      { id: "q3",  text: "Temblor en las piernas" },
      { id: "q4",  text: "Incapacidad para relajarse" },
      { id: "q5",  text: "Miedo a que pase lo peor" },
      { id: "q6",  text: "Mareo o aturdimiento" },
      { id: "q7",  text: "Palpitaciones o taquicardia" },
      { id: "q8",  text: "Inestabilidad" },
      { id: "q9",  text: "Terror o pánico" },
      { id: "q10", text: "Nerviosismo" },
      { id: "q11", text: "Sensación de ahogo" },
      { id: "q12", text: "Temblor de manos" },
      { id: "q13", text: "Temblor en general" },
      { id: "q14", text: "Miedo a perder el control" },
      { id: "q15", text: "Dificultad para respirar" },
      { id: "q16", text: "Miedo a morir" },
      { id: "q17", text: "Estar asustado(a)" },
      { id: "q18", text: "Indigestión o malestar abdominal" },
      { id: "q19", text: "Sensación de desmayo" },
      { id: "q20", text: "Rubor o enrojecimiento facial" },
      { id: "q21", text: "Sudoración (no debido al calor)" },
    ],
  },

  // ──────────────────────────────────────────────────────────────────────────
  {
    id: "rosenberg",
    code: "RSES",
    name: "Rosenberg Self-Esteem Scale",
    short_name: "Rosenberg",
    items: 10,
    minutes: 5,
    category: "Autoestima",
    age_range: "≥ 14 años",
    description: "Escala unidimensional de 10 ítems para evaluar autoestima global.",
    instructions: "Marque la opción que mejor describa qué tan de acuerdo está con cada afirmación.",
    scale: LIKERT_RSES,
    scoring: { type: "sum_reversed" },
    ranges: [
      { min: 30, max: 40, label: "Autoestima alta",  level: "none" },
      { min: 26, max: 29, label: "Autoestima media", level: "low" },
      { min: 10, max: 25, label: "Autoestima baja",  level: "moderate" },
    ],
    questions: [
      { id: "q1",  text: "En general, estoy satisfecho(a) conmigo mismo(a)." },
      { id: "q2",  text: "A veces creo que no soy bueno(a) en absoluto.", reverse: true },
      { id: "q3",  text: "Siento que tengo varias cualidades buenas." },
      { id: "q4",  text: "Soy capaz de hacer las cosas tan bien como la mayoría de las personas." },
      { id: "q5",  text: "Siento que no tengo mucho de qué estar orgulloso(a).", reverse: true },
      { id: "q6",  text: "A veces me siento ciertamente inútil.", reverse: true },
      { id: "q7",  text: "Siento que soy una persona digna, al menos al mismo nivel que otros." },
      { id: "q8",  text: "Me gustaría tener más respeto por mí mismo(a).", reverse: true },
      { id: "q9",  text: "Considerándolo todo, me inclino a sentir que soy un(a) fracasado(a).", reverse: true },
      { id: "q10", text: "Tengo una actitud positiva hacia mí mismo(a)." },
    ],
  },

  // ──────────────────────────────────────────────────────────────────────────
  {
    id: "pcl5",
    code: "PCL-5",
    name: "PTSD Checklist DSM-5",
    short_name: "PCL-5",
    items: 20,
    minutes: 10,
    category: "TEPT",
    age_range: "≥ 18 años",
    description: "Mide presencia y severidad de síntomas de TEPT según DSM-5 en el último mes.",
    instructions: "Las siguientes son problemas que las personas a veces tienen como respuesta a una experiencia muy estresante. Indique cuánto le ha molestado cada uno en el último mes.",
    scale: LIKERT_PCL5,
    scoring: { type: "sum" },
    ranges: [
      { min: 0,  max: 32, label: "Bajo umbral",                 level: "low" },
      { min: 33, max: 80, label: "Clínicamente significativa",  level: "high" },
    ],
    questions: [
      { id: "q1",  text: "Recuerdos repetidos, perturbadores e involuntarios de la experiencia estresante." },
      { id: "q2",  text: "Sueños repetidos y perturbadores sobre la experiencia estresante." },
      { id: "q3",  text: "Sentir o actuar de repente como si la experiencia estresante volviera a ocurrir." },
      { id: "q4",  text: "Sentirse muy alterado(a) cuando algo le recuerda la experiencia." },
      { id: "q5",  text: "Tener reacciones físicas fuertes cuando algo le recuerda la experiencia (taquicardia, sudoración)." },
      { id: "q6",  text: "Evitar recuerdos, pensamientos o sentimientos relacionados con la experiencia." },
      { id: "q7",  text: "Evitar cosas externas que le recuerdan la experiencia (personas, lugares, conversaciones)." },
      { id: "q8",  text: "Dificultad para recordar partes importantes de la experiencia estresante." },
      { id: "q9",  text: "Tener creencias negativas fuertes sobre sí mismo(a), otras personas o el mundo." },
      { id: "q10", text: "Culparse a sí mismo(a) o a otros por la experiencia o lo que ocurrió después." },
      { id: "q11", text: "Tener sentimientos negativos fuertes como miedo, horror, ira, culpa, vergüenza." },
      { id: "q12", text: "Pérdida de interés en actividades que antes disfrutaba." },
      { id: "q13", text: "Sentirse distante o aislado(a) de otras personas." },
      { id: "q14", text: "Dificultad para experimentar sentimientos positivos." },
      { id: "q15", text: "Comportamiento irritable, arrebatos de ira o actuar agresivamente." },
      { id: "q16", text: "Asumir muchos riesgos o hacer cosas que pueden hacerse daño." },
      { id: "q17", text: "Estar 'super alerta', vigilante o en guardia." },
      { id: "q18", text: "Sentirse sobresaltado(a) o asustado(a) fácilmente." },
      { id: "q19", text: "Dificultad para concentrarse." },
      { id: "q20", text: "Dificultad para conciliar o mantener el sueño." },
    ],
  },

  // ──────────────────────────────────────────────────────────────────────────
  {
    id: "audit",
    code: "AUDIT",
    name: "Alcohol Use Disorders Identification Test",
    short_name: "AUDIT",
    items: 10,
    minutes: 5,
    category: "Adicciones",
    age_range: "≥ 15 años",
    description: "Identifica consumo de riesgo, perjudicial y dependencia de alcohol.",
    instructions: "Las siguientes preguntas son sobre su consumo de bebidas alcohólicas durante el último año. Una bebida estándar = una cerveza, una copa de vino o un trago de licor.",
    // AUDIT tiene escalas distintas por pregunta. Lo manejamos como ítem-por-ítem.
    scale: null,
    scoring: { type: "sum" },
    ranges: [
      { min: 0,  max: 7,  label: "Bajo riesgo",  level: "none" },
      { min: 8,  max: 15, label: "Riesgo",       level: "low" },
      { min: 16, max: 19, label: "Perjudicial",  level: "moderate" },
      { min: 20, max: 40, label: "Dependencia",  level: "high" },
    ],
    questions: [
      { id: "q1", text: "¿Con qué frecuencia consume alguna bebida alcohólica?",
        scale: [
          { value: 0, label: "Nunca" },
          { value: 1, label: "Una vez al mes o menos" },
          { value: 2, label: "2 a 4 veces al mes" },
          { value: 3, label: "2 a 3 veces por semana" },
          { value: 4, label: "4 o más veces por semana" },
        ] },
      { id: "q2", text: "¿Cuántas bebidas alcohólicas suele tomar en un día típico de los que bebe?",
        scale: [
          { value: 0, label: "1 o 2" },
          { value: 1, label: "3 o 4" },
          { value: 2, label: "5 o 6" },
          { value: 3, label: "7 a 9" },
          { value: 4, label: "10 o más" },
        ] },
      { id: "q3", text: "¿Con qué frecuencia toma 6 o más bebidas en una sola ocasión?",
        scale: [
          { value: 0, label: "Nunca" },
          { value: 1, label: "Menos de una vez al mes" },
          { value: 2, label: "Mensualmente" },
          { value: 3, label: "Semanalmente" },
          { value: 4, label: "Diaria o casi diariamente" },
        ] },
      { id: "q4", text: "¿En el último año, con qué frecuencia ha sentido que no podía parar de beber una vez había empezado?",
        scale: [
          { value: 0, label: "Nunca" },
          { value: 1, label: "Menos de una vez al mes" },
          { value: 2, label: "Mensualmente" },
          { value: 3, label: "Semanalmente" },
          { value: 4, label: "Diaria o casi diariamente" },
        ] },
      { id: "q5", text: "¿Con qué frecuencia, en el último año, dejó de cumplir con sus obligaciones por beber?",
        scale: [
          { value: 0, label: "Nunca" },
          { value: 1, label: "Menos de una vez al mes" },
          { value: 2, label: "Mensualmente" },
          { value: 3, label: "Semanalmente" },
          { value: 4, label: "Diaria o casi diariamente" },
        ] },
      { id: "q6", text: "¿Con qué frecuencia, en el último año, necesitó beber por la mañana para recuperarse de haber bebido el día anterior?",
        scale: [
          { value: 0, label: "Nunca" },
          { value: 1, label: "Menos de una vez al mes" },
          { value: 2, label: "Mensualmente" },
          { value: 3, label: "Semanalmente" },
          { value: 4, label: "Diaria o casi diariamente" },
        ] },
      { id: "q7", text: "¿Con qué frecuencia, en el último año, ha tenido remordimientos o sentimiento de culpa después de beber?",
        scale: [
          { value: 0, label: "Nunca" },
          { value: 1, label: "Menos de una vez al mes" },
          { value: 2, label: "Mensualmente" },
          { value: 3, label: "Semanalmente" },
          { value: 4, label: "Diaria o casi diariamente" },
        ] },
      { id: "q8", text: "¿Con qué frecuencia, en el último año, no pudo recordar lo que sucedió la noche anterior por haber bebido?",
        scale: [
          { value: 0, label: "Nunca" },
          { value: 1, label: "Menos de una vez al mes" },
          { value: 2, label: "Mensualmente" },
          { value: 3, label: "Semanalmente" },
          { value: 4, label: "Diaria o casi diariamente" },
        ] },
      { id: "q9", text: "¿Usted o alguna otra persona se ha lastimado como resultado de su consumo de alcohol?",
        scale: [
          { value: 0, label: "No" },
          { value: 2, label: "Sí, pero no en el último año" },
          { value: 4, label: "Sí, en el último año" },
        ] },
      { id: "q10", text: "¿Algún familiar, amigo, médico o profesional se ha preocupado por su forma de beber o le ha sugerido reducir el consumo?",
        scale: [
          { value: 0, label: "No" },
          { value: 2, label: "Sí, pero no en el último año" },
          { value: 4, label: "Sí, en el último año" },
        ] },
    ],
  },

  // ──────────────────────────────────────────────────────────────────────────
  {
    id: "eat26",
    code: "EAT-26",
    name: "Eating Attitudes Test",
    short_name: "EAT-26",
    items: 26,
    minutes: 8,
    category: "Alimentación",
    age_range: "≥ 13 años",
    description: "Tamizaje para actitudes relacionadas con trastornos de la conducta alimentaria.",
    instructions: "Marque la opción que mejor describa qué tan a menudo experimenta cada situación. Sea honesto(a) — esta información es confidencial.",
    scale: LIKERT_EAT,
    scoring: { type: "sum" },
    ranges: [
      { min: 0,  max: 19, label: "Riesgo bajo",           level: "low" },
      { min: 20, max: 78, label: "Riesgo significativo",  level: "high" },
    ],
    questions: [
      { id: "q1",  text: "Me asusta tener exceso de peso." },
      { id: "q2",  text: "Evito comer cuando tengo hambre." },
      { id: "q3",  text: "Pienso constantemente en comida." },
      { id: "q4",  text: "He tenido atracones donde sentía que no podía parar de comer." },
      { id: "q5",  text: "Corto mi comida en pedazos pequeños." },
      { id: "q6",  text: "Tengo conciencia del contenido calórico de los alimentos que como." },
      { id: "q7",  text: "Evito particularmente alimentos con alto contenido de carbohidratos (pan, papa, arroz)." },
      { id: "q8",  text: "Siento que otros preferirían que yo comiera más." },
      { id: "q9",  text: "Vomito después de comer." },
      { id: "q10", text: "Me siento extremadamente culpable después de comer." },
      { id: "q11", text: "Me preocupa el deseo de estar más delgado(a)." },
      { id: "q12", text: "Pienso en quemar calorías cuando hago ejercicio." },
      { id: "q13", text: "Otras personas piensan que estoy demasiado delgado(a)." },
      { id: "q14", text: "Me preocupa la idea de tener grasa en mi cuerpo." },
      { id: "q15", text: "Tardo más que otros en comer." },
      { id: "q16", text: "Evito comer alimentos con azúcar." },
      { id: "q17", text: "Como alimentos dietéticos." },
      { id: "q18", text: "Siento que la comida controla mi vida." },
      { id: "q19", text: "Tengo autocontrol con los alimentos." },
      { id: "q20", text: "Siento que otros me presionan para comer." },
      { id: "q21", text: "Le dedico demasiado tiempo y pensamiento a la comida." },
      { id: "q22", text: "Me siento incómodo(a) después de comer dulces." },
      { id: "q23", text: "Hago dieta." },
      { id: "q24", text: "Me gusta tener el estómago vacío." },
      { id: "q25", text: "Disfruto probar alimentos nuevos y deliciosos." },
      { id: "q26", text: "Tengo el impulso de vomitar después de las comidas." },
    ],
  },
  // ──────────────────────────────────────────────────────────────────────────
  {
    id: "mcmi2",
    code: "MCMI-II",
    name: "Inventario Multiaxial Clínico de Millon",
    short_name: "MCMI-II",
    items: 175,
    minutes: 30,
    category: "personalidad",
    description: "Cuestionario de 175 ítems (Verdadero/Falso) para evaluación de patrones de personalidad y síndromes clínicos. Devuelve puntuaciones brutas (PD) por escala — la conversión a Tasa Base (BR) e interpretación clínica las realiza el profesional con su Excel oficial.",
    age_range: "≥ 18",
    instructions: "Lee cada afirmación y marca Verdadero si la describe tu forma habitual de ser, sentir o actuar; Falso si no lo hace. No hay respuestas correctas o incorrectas. Si tenés dudas, marca lo que mejor te describe la mayoría del tiempo. Podés pausar y retomar en otro momento — el progreso se guarda automáticamente.",
    scale: SCALE_VF,
    questions: MCMI2_QUESTIONS,
    scoring: {
      type: "millon",
      // La matriz no se serializa al questions_json del paciente (~50KB)
      // — vive en `scoring.matrix_ref` y el backend la carga de MCMI2_MATRIX
      // al calcular. Esto mantiene la respuesta del catálogo liviana.
      matrix_ref: "mcmi2",
    },
    // No hay rangos de interpretación — el profesional usa el Excel oficial.
    // Mantenemos un único rango "no interpretado" para que el motor de scoring
    // no falle al buscar un nivel.
    ranges: [{ min: -1, max: 999999, label: "Ver detalle por escala", level: "none" }],
    alerts: null,
  },
];

/**
 * Catálogo de escalas del MCMI-II con nombres completos.
 * Se usa para renderizar la tabla de raw scores en el resultado.
 */
export const MCMI2_SCALES = MCMI2_MATRIX.scales;

/**
 * Calcula los raw scores por escala del MCMI-II usando la matriz.
 * answers: { "1": 1|2, "2": 1|2, ... }  (1=V, 2=F)
 */
function calculateMillonScores(answers) {
  const raw = {};
  for (const sc of MCMI2_MATRIX.scales) raw[sc.code] = 0;

  for (const itemId of Object.keys(MCMI2_MATRIX.matrix)) {
    const a = answers[itemId];
    if (a !== 1 && a !== 2) continue;
    const respKey = a === 1 ? "V" : "F";
    const entries = MCMI2_MATRIX.matrix[itemId][respKey] ?? [];
    for (const e of entries) {
      raw[e.scale] = (raw[e.scale] ?? 0) + e.weight;
    }
  }
  // Marcar X como no calculable linealmente (la fórmula real requiere
  // ajustes adicionales que dependen del Excel oficial).
  raw["X"] = null;
  return raw;
}

/**
 * Inserta o actualiza las definiciones en la tabla psych_tests.
 * Idempotente: si el test ya existe, solo actualiza questions_json.
 */
export function seedTestDefinitions(db) {
  const insert = db.prepare(`
    INSERT INTO psych_tests (id, code, name, short_name, items, minutes, category, description, age_range, scoring, questions_json)
    VALUES (@id, @code, @name, @short_name, @items, @minutes, @category, @description, @age_range, @scoring, @questions_json)
    ON CONFLICT(id) DO UPDATE SET
      questions_json = excluded.questions_json,
      items = excluded.items,
      description = excluded.description
  `);

  for (const t of PSYCH_TEST_DEFINITIONS) {
    const scoring = JSON.stringify(t.ranges);
    const questions_json = JSON.stringify({
      version: 1,
      instructions: t.instructions,
      scale: t.scale,
      questions: t.questions,
      scoring: t.scoring,
      ranges: t.ranges,
      alerts: t.alerts ?? null,
    });
    insert.run({
      id: t.id,
      code: t.code,
      name: t.name,
      short_name: t.short_name,
      items: t.items,
      minutes: t.minutes,
      category: t.category,
      description: t.description,
      age_range: t.age_range,
      scoring,
      questions_json,
    });
  }
}

/**
 * Calcula el score de una aplicación dada las respuestas.
 * Devuelve { score, level, label, alerts }.
 *
 * Para tests con scoring.type === "millon" (MCMI-II), `score` es la suma
 * total de raw scores y `alerts.scales_raw` contiene el detalle por escala.
 */
export function calculateScore(testDef, answers) {
  let score = 0;
  const alerts = {};

  // Tests cualitativos (formularios "Selección personalizada" sin scoring):
  // no se calcula puntaje ni nivel. Solo se guarda un snapshot de las
  // respuestas con la etiqueta de la opción elegida, para que el psicólogo
  // pueda leerlas e interpretarlas a su criterio. La etiqueta se guarda
  // junto al valor para que aplicaciones viejas sigan siendo legibles si
  // el formulario se edita después.
  if (testDef.scoring?.type === "none") {
    const scaleByValue = new Map();
    for (const opt of testDef.scale ?? []) scaleByValue.set(Number(opt.value), opt.label);
    const answers_snapshot = (testDef.questions ?? []).map((q) => {
      const v = answers[q.id];
      const numV = v == null || v === "" ? null : Number(v);
      return {
        id: q.id,
        text: q.text,
        value: numV,
        label: numV != null ? (scaleByValue.get(numV) ?? String(numV)) : null,
      };
    });
    return {
      score: null,
      level: "none",
      label: "Ver respuestas",
      alerts: { meta: { type: "qualitative", answers_snapshot } },
    };
  }

  // Caso especial: MCMI-II — usa matriz V/F → escala+peso.
  if (testDef.scoring?.type === "millon") {
    const raw = calculateMillonScores(answers);
    // Score "agregado" = suma de las escalas calculables. Sirve para
    // ordenar listados y dar una métrica única, pero la interpretación
    // real es por escala individual.
    for (const k of Object.keys(raw)) if (raw[k] != null) score += raw[k];
    // Validez mínima: si V > 1, marcamos warning (test posiblemente inválido).
    const v = raw["V"] ?? 0;
    alerts.scales_raw = raw;
    alerts.meta = {
      type: "millon",
      requires_clinical_interpretation: true,
      validity_warning: v > 1
        ? "El índice de Validez (V) es ≥ 2. El test podría ser inválido. Revisar con criterio clínico antes de interpretar."
        : null,
    };
    return {
      score,
      level: "none",
      label: "Ver detalle por escala",
      alerts,
    };
  }

  const scaleMaxValue = (sc) => sc ? Math.max(...sc.map((o) => o.value)) : 3;

  for (const q of testDef.questions) {
    const v = answers[q.id];
    if (v == null) continue;
    if (testDef.scoring?.type === "sum_reversed" && q.reverse) {
      const max = scaleMaxValue(testDef.scale);
      const min = testDef.scale ? Math.min(...testDef.scale.map((o) => o.value)) : 0;
      score += (max + min) - Number(v);
    } else {
      score += Number(v);
    }
  }

  // Determinar nivel
  const range = testDef.ranges.find((r) => score >= r.min && score <= r.max);
  const level = range?.level ?? "none";
  const label = range?.label ?? "";

  // Alertas clínicas (ej: ítem 9 PHQ-9 con valor ≥ 1 = ideación)
  if (testDef.alerts?.critical_question_id) {
    const cv = answers[testDef.alerts.critical_question_id];
    if (cv != null && Number(cv) >= testDef.alerts.critical_threshold) {
      alerts.critical_response = true;
      alerts.critical_question_id = testDef.alerts.critical_question_id;
      alerts.critical_value = Number(cv);
    }
  }

  return { score, level, label, alerts };
}
