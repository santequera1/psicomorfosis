# Sistema de diseño — Psicomorfosis

Guía canónica para mantener coherencia visual en todo lo nuevo. Este
documento **describe lo que ya está construido** — los tokens y
patrones que aplicamos consistentemente. Si vas a agregar componentes,
usá esto antes de inventar cosas.

> Filosofía: **Clínico humano** — teal apagado + off-white cálido +
> tipografía editorial. Nada estridente. La app trata temas sensibles
> (salud mental) y el diseño lo respeta.

**Fuentes de verdad** (si algo del doc no coincide con el código, gana el código):
- Colores/tokens: [`src/styles.css`](../src/styles.css) — bloques `:root` y `.dark`.
- Familias de tema: [`src/lib/theme.ts`](../src/lib/theme.ts) → `THEME_FAMILIES`.
- Liquid Glass: [`docs/liquid-glass-guide.md`](liquid-glass-guide.md).
- Transiciones: [`src/styles/transitions.css`](../src/styles/transitions.css).

---

## 1. Principios de diseño

1. **Ningún color ad-hoc.** Siempre usar tokens (`brand-700`, `sage-500`, `risk-high`, etc.). Un color literal (`#3b82f6`, `bg-blue-500`) es señal de que falta un token.
2. **Jerarquía por peso, no por color.** Título ≠ color especial — es `font-serif` + tamaño mayor. El color entra solo para semántica (riesgo, éxito, marca).
3. **Espacio antes de decorar.** Padding y whitespace hacen el 80% del "lujo". Antes de agregar bordes/sombras/gradientes, ver si más espacio soluciona.
4. **Semántica sobre estilo.** Un botón peligroso no es "rojo" — es `border-risk-high hover:text-risk-high`. Si mañana cambiamos la paleta, funciona igual.
5. **Modo oscuro es de primera clase.** Todo componente debe verse igual de bien en `.dark`. Testear ambos siempre.
6. **Solo comentarios cuando el "por qué" no es obvio.** Los estilos de Tailwind no necesitan comentarios; el patrón sí.

---

## 2. Tokens

### 2.1 Colores de marca

| Token | Uso | Ejemplo |
|---|---|---|
| `brand-700` | **Primary**. Botones "acción principal", links importantes, ring de focus, chart-1. | `bg-brand-700 text-white`, `text-brand-700` |
| `brand-800` | Hover del primary. | `hover:bg-brand-800` |
| `brand-600` | Segundo nivel de brand, chart-4. | Poco frecuente. |
| `brand-400` | Ring, subtle accents, borders al focus. | `focus:border-brand-400 focus:ring-brand-400` |
| `brand-100` | Backgrounds de badges/chips brand. | `bg-brand-100 text-brand-800` |
| `brand-50` | Fondos súper sutiles (hover de items, contexto). | `hover:bg-brand-50/30` |
| `brand-900` | Texto sobre `brand-100` (badges). Casi nunca solo. | `bg-brand-100 text-brand-900` |

### 2.2 Colores neutros (ink + line + bg)

**Ink** = texto. Números más altos = más fuerte.

| Token | Uso |
|---|---|
| `text-ink-900` | Título principal, valores destacados. |
| `text-ink-700` | Texto de cuerpo. |
| `text-ink-500` | Texto secundario, hint, meta. |
| `text-ink-400` | Placeholder, iconos disabled, "empty state". |
| `text-ink-300` | Ultra sutil (border-transparent icons). Casi nunca. |

**Line** = bordes.

| Token | Uso |
|---|---|
| `border-line-200` | Border default de cards, inputs, tablas. |
| `border-line-100` | Border interno más sutil (separator dentro de card). |

**Bg** = fondos.

| Token | Uso |
|---|---|
| `bg-surface` | Card, modal, popover, input. Fondo "elevado". |
| `bg-bg-50` | Fondo global de la app (`body`). |
| `bg-bg-100` | Fondo de sección (mostly = agrupa cards). Hover de items no interactivos. |

### 2.3 Colores acento

| Token | Uso |
|---|---|
| `sage-*` | Verde salvia. Semántica de "estable / bajo riesgo / éxito neutro". Chart-2. |
| `lavender-*` | Púrpura desaturado. Nota privada (kind=`privada`), chart-3. |

### 2.4 Colores semánticos

| Token | Cuándo |
|---|---|
| `success` / `success-soft` | Confirmación, "guardado", nota firmada. |
| `warning` / `warning-soft` | Alerta suave, riesgo moderado. |
| `error` / `error-soft` | Error de form, cancelación, botón destructivo. |
| `info` / `info-soft` | Aviso neutro (raro — evaluar primero si es `ink-500`). |

### 2.5 Colores de riesgo clínico

Para la ficha del paciente, tags, banderas, cards de "riesgo activo".

| Token | Nivel |
|---|---|
| `risk-low` | Bajo (verde sage). |
| `risk-moderate` | Moderado (ámbar). |
| `risk-high` | Alto (rojo apagado). |
| `risk-critical` | Crítico (rojo saturado). |

Uso típico: `border-risk-high/25 bg-risk-high/5 text-risk-high` (los `/opacidad` bajan el peso visual sin cambiar el hue).

### 2.6 Radios

Definidos en `@theme inline`:

| Token | px | Uso |
|---|---|---|
| `rounded-sm` (radius-sm) | 6 | Chips pequeños, badges. |
| `rounded-md` (radius-md) | 10 | Botones, inputs, items de menú. |
| `rounded-lg` (radius-lg) | 14 | Cards internas, tarjetas de acción. |
| `rounded-xl` (radius-xl) | 20 | **Card default**. |
| `rounded-2xl` (radius-2xl) | 28 | Modal, dialog, header cards de landing. |
| `rounded-full` | ∞ | Avatar, dots, chips redondos. |

**Regla**: cards de contenido = `rounded-xl`. Nunca `rounded-3xl` o `rounded-[custom]px`.

### 2.7 Sombras

| Token | Uso | Peso |
|---|---|---|
| `shadow-xs` | Card default. Muy sutil. | `1px 2px rgb(31 57 63 / 0.05)` |
| `shadow-soft` | Hover sobre card, cards levantadas. | `2px 6px rgb(31 57 63 / 0.07)` |
| `shadow-card` | Card destacada (KPI hero, callout). | `6px 18px rgb(31 57 63 / 0.09)` |
| `shadow-modal` | Modales, popovers, drawers. | `16px 40px rgb(31 57 63 / 0.12)` |

Patrón muy común: `shadow-xs hover:shadow-soft transition-shadow`.

### 2.8 Tipografía

| Familia | Fuente base | Uso |
|---|---|---|
| `font-sans` | **Inter** | Todo el texto de UI, cuerpo, forms, tablas. |
| `font-serif` | **Fraunces** | Títulos de sección, valores KPI, "hero" del dashboard. |
| `font-mono` | (system-ui mono) | IDs de paciente (`P-9001`), códigos técnicos. Uso raro. |

**Regla**: `font-serif` solo para **jerarquía visual**, nunca para texto largo. `font-sans` es el default.

Los tamaños usados consistentemente:

| Tailwind | Uso |
|---|---|
| `text-[10px]` | Kickers/eyebrow (uppercase tracking-widest), badges. |
| `text-[11px]` | Meta info, timestamps. |
| `text-xs` | Body pequeño, hints. |
| `text-sm` | Body default. |
| `text-base` | Body ampliado, valores. |
| `text-lg` | Subtítulos de sección. |
| `text-xl` — `text-2xl` | Valores KPI. |
| `text-3xl` — `text-4xl` | Títulos de página (dashboard, landing hero). |

**Nunca** usar `text-[15px]` u otros custom. Si hace falta, es señal de que el spacing está mal.

---

## 3. Patrones de componente

### 3.1 Card estándar

Base común. Ver [`KpiCard.tsx`](../src/components/app/KpiCard.tsx) y ejemplos en [`AdminDashboard.tsx`](../src/components/dashboards/AdminDashboard.tsx).

```jsx
<div className="lg-surface rounded-xl border border-line-200 bg-surface p-5 shadow-xs hover:shadow-soft transition-shadow">
  {/* contenido */}
</div>
```

Notas:
- **`lg-surface`** al inicio: sin efecto por default; **habilita el modo claro con "frosted glass" sutil** y el tema `liquid` si el usuario lo activa. Es no-op en otros temas. Prácticamente sin costo — **agregalo siempre en cards de contenido.**
- `p-5` para cards grandes, `p-3 sm:p-4` para cards de agrupación densa (quick actions), `p-4` para KPIs.
- Padding responsive: `px-2.5 py-2 sm:px-5 sm:py-4` en móvil vs desktop para KPI cards.

### 3.2 Card con estado de riesgo

Para "Riesgo activo" y cards de alerta.

```jsx
<div className="lg-surface lg-surface--risk rounded-xl border border-risk-high/25 bg-surface p-5 shadow-xs">
  <h3 className="font-serif text-lg text-ink-900 flex items-center gap-2">
    <ShieldAlert className="h-4 w-4 text-risk-high" />
    Riesgo activo
  </h3>
  ...
</div>
```

### 3.3 Botones

**Primary** (acción principal, hay uno por vista):
```jsx
<button className="h-9 px-3.5 rounded-md text-sm font-medium bg-brand-700 text-white hover:bg-brand-800 inline-flex items-center gap-2">
  <Icon className="h-3.5 w-3.5" />
  Nueva nota
</button>
```

**Secondary** (acciones alternas):
```jsx
<button className="h-9 px-3 rounded-md border border-line-200 text-sm text-ink-700 hover:border-brand-400 hover:bg-brand-50/30 inline-flex items-center gap-1.5">
  Ver todo
</button>
```

**Destructive**:
```jsx
<button className="h-9 px-3 rounded-md border border-line-200 text-sm text-ink-700 hover:border-risk-high hover:text-risk-high">
  Cancelar cita
</button>
```

**Ghost / icon-only** (botones de barra en headers):
```jsx
<button className="h-8 w-8 rounded-md text-ink-500 hover:bg-bg-50 inline-flex items-center justify-center">
  <X className="h-4 w-4" />
</button>
```

**Alturas canónicas**:
- `h-8` (32px) — botones densos de header/toolbar
- `h-9` (36px) — botones inline en cards
- `h-10 sm:h-11` — botones de form principal
- `h-11` (44px) — mínimo mobile touch target (44px es el mínimo de a11y)

### 3.4 Inputs

```jsx
<input
  className="w-full h-11 px-3 rounded-md border border-line-200 bg-bg text-sm text-ink-900 focus:outline-none focus:border-brand-400"
  placeholder="..."
/>
```

**Reglas**:
- Border: `border-line-200` reposo, `border-brand-400` focus.
- `focus:outline-none` + border custom (no dejar el outline default del navegador).
- Placeholder queda por default en `ink-400`.
- Estado inválido: `border-rose-400 focus:border-rose-500`.

### 3.5 Chips / Badges

**Kicker** (eyebrow encima de título de sección):
```jsx
<div className="text-xs uppercase tracking-widest text-brand-700 font-semibold">
  Trayectoria terapéutica
</div>
```

**Chip informativo** (estados dentro de cards):
```jsx
<span className="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full bg-brand-50 text-brand-800 font-medium">
  Sesión · SOAP
</span>
```

**Chip semántico** (firmada, borrador, etc.):
```jsx
<span className="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full bg-success-soft text-success font-medium inline-flex items-center gap-1">
  <Lock className="h-2.5 w-2.5" /> Firmada
</span>
```

**Chip código** (patient ID, código de test):
```jsx
<span className="px-1.5 py-0.5 rounded-full bg-bg-50 border border-line-200 font-mono text-[10px]">
  P-9001
</span>
```

### 3.6 Header de sección

Patrón canónico usado en todas las vistas:

```jsx
<header className="flex items-end justify-between gap-3 flex-wrap mb-5">
  <div>
    <div className="text-xs uppercase tracking-widest text-brand-700 font-semibold">
      Sección
    </div>
    <h2 className="font-serif text-2xl text-ink-900 mt-1">
      Título grande
    </h2>
    <p className="text-sm text-ink-500 mt-1.5 max-w-xl">
      Descripción opcional.
    </p>
  </div>
  <button className="h-9 px-3.5 rounded-md bg-brand-700 text-white text-sm font-medium">
    Acción principal
  </button>
</header>
```

### 3.7 Modal / Drawer

Modal:
```jsx
<div className="lg-surface bg-surface rounded-2xl shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col border border-line-200 t-modal">
  <header className="flex items-center gap-3 p-4 border-b border-line-100 shrink-0">
    ...
  </header>
  <div className="flex-1 overflow-y-auto p-5">
    ...
  </div>
  <footer className="border-t border-line-100 p-3 shrink-0 flex items-center gap-2 justify-end">
    ...
  </footer>
</div>
```

Drawer (side sheet, ej. LauraChat):
```jsx
<aside className="lg-surface lg-surface--drawer fixed top-0 right-0 z-50 h-dvh w-full sm:w-[420px] bg-surface border-l border-line-200 shadow-2xl flex flex-col">
  ...
</aside>
```

**Reglas**:
- Modal: `rounded-2xl` (28px). Drawer: `rounded-none` porque pega al borde.
- Ambos: `bg-surface` + `border border-line-200` + `shadow-2xl` como fallback en temas sin liquid glass.
- `lg-surface` habilita frosted claro / liquid glass automáticamente.
- Mobile: `h-dvh` (dynamic viewport height) para que el teclado no tape el input.

### 3.8 Notas SOAP editor

Textarea con auto-resize (patrón en NoteEditor):
```jsx
<AutoResizeTextarea
  value={soap[k]}
  onChange={(e) => setSoap((p) => ({ ...p, [k]: e.target.value }))}
  minHeight={56}
  className="mt-1 w-full px-3 py-2 rounded-md border border-line-200 bg-surface text-sm outline-none focus:border-brand-700 resize-none"
/>
```

`resize-none` + auto-grow via `scrollHeight` — nunca `resize-y` (arrastres accidentales rompen layout en mobile).

---

## 4. Animaciones y transiciones

### 4.1 Duraciones

| Situación | Duración | Easing |
|---|---|---|
| Hover simple (color, border) | `transition-colors` (150ms default) | (default) |
| Shadow lift | `transition-shadow` (150ms) | (default) |
| Layout shift | `duration-200` a `duration-300` | `ease-out` |
| Modal enter | `--modal-open-dur: 250ms` | `cubic-bezier(0.22, 1, 0.36, 1)` |
| Modal exit | `--modal-close-dur: 150ms` | `cubic-bezier(0.22, 1, 0.36, 1)` |
| Drawer slide | `300ms` | `cubic-bezier(0.16, 1, 0.3, 1)` |

**Regla**: si no sabés qué duración usar, `duration-200 ease-out` es un valor seguro para casi todo.

### 4.2 Sistema de transiciones (transitions.dev)

Instalamos el paquete `transitions.dev` para transiciones consistentes. Están cargadas globalmente en [`src/styles/transitions.css`](../src/styles/transitions.css). Uso:

- **`t-modal`** — para modales (open/close con scale + fade). Ver [`LauraStreamModal`](../src/components/laura/LauraStreamModal.tsx).
- **`t-dropdown`** — para dropdowns (crece desde origin anchor). Ver [`LauraRewriteButton`](../src/components/laura/LauraRewriteButton.tsx).
- **`t-shimmer`** — para texto "cargando" con animación de barrido. Ver el loading del `LauraStreamModal`.
- **`t-acc`** — para accordion (grid-rows 0fr↔1fr). Ver el banner del `LauraChat`.

Patrón general: agregás la clase + gestionás las clases `is-open` / `is-closing` con estado (ver componentes de ejemplo).

### 4.3 Animate-in de tw-animate-css

Para entradas rápidas:

```jsx
<section
  className="animate-in fade-in slide-in-from-bottom-1 duration-500 fill-mode-backwards"
  style={{ animationDelay: "120ms" }}
>
```

- `fill-mode-backwards` importante — sin esto se ve un frame al 100% antes del delay.
- Stagger típico: 80ms entre cards.

### 4.4 Reduced motion

Todo el sistema respeta `prefers-reduced-motion: reduce`. En transiciones custom:

```css
@media (prefers-reduced-motion: reduce) {
  .mi-clase { transition: none !important; }
}
```

---

## 5. Sistema de temas

La app soporta 5 familias × 3 modos (claro / oscuro / auto):

| Familia | Descripción | Dark-only |
|---|---|---|
| `clinico` | Default. Teal apagado sobre off-white cálido. | No |
| `bridgery` | Light vibrante con acento púrpura. | No |
| `minimo` | Ultra-clean, casi sin bordes, acento mint. | No |
| `aurora` | Dark premium con auroras de gradiente al fondo. | **Sí** |
| `liquid` | Liquid Glass à la Apple (whitelist beta). | **Sí** |

Toda card/componente **debe verse bien en todas las combinaciones**. La forma correcta es usar **solo tokens** — nunca colores literales — y así los overrides de tema se propagan automáticamente.

Testing rápido: en Configuración → Apariencia probar cada familia + toggle claro/oscuro.

---

## 6. Iconos

Usamos **[`lucide-react`](https://lucide.dev)** exclusivamente. No mezclar con otras librerías (Heroicons, FontAwesome, etc.).

**Tamaños canónicos**:
- `h-3 w-3` — chips y badges pequeños
- `h-3.5 w-3.5` — dentro de botones h-9
- `h-4 w-4` — icon buttons default
- `h-5 w-5` — nav items del sidebar
- `h-6 w-6` — headers grandes

**Regla**: si usás un icono que no existe en lucide, verificá que sea realmente necesario. Casi siempre hay uno equivalente.

---

## 7. Accesibilidad

- **Contraste**: los tokens ink+bg cumplen WCAG AA en modo claro y oscuro. No cambiar arbitrariamente.
- **Focus visible**: los inputs tienen `focus:border-brand-400`; los botones heredan el ring de shadcn. No `outline: none` sin reemplazo.
- **Touch target**: mínimo 44×44px en mobile (`h-11 w-11`).
- **Alt text**: imágenes decorativas → `alt=""`. Imágenes informativas → texto real.
- **aria-label** en icon buttons: `<button aria-label="Cerrar">`.
- **Roles**: `<dialog role="dialog">`, `<aside role="dialog">` para drawers, etc.

---

## 8. Reglas de "NO hacer"

1. **NO uses colores literales.** `bg-blue-500`, `#3b82f6`, `rgb(...)` en JSX → tomar del token equivalente.
2. **NO uses `text-[15px]`, `w-[137px]`, arbitrary values sin razón fuerte.** Si `text-sm` no alcanza, quizás falta jerarquía o el layout está mal.
3. **NO `rounded-3xl` ni `rounded-[N]px`.** El sistema tiene `sm|md|lg|xl|2xl|full`. Se usa.
4. **NO mezcles librerías de iconos.**
5. **NO `!important` en JSX inline.** Excepción: liquid glass overrides (ya wrapeados en `@layer utilities`). Cualquier otro `!` en un className es señal de que hay que refactorizar la especificidad.
6. **NO `resize-y` en textareas.** Rompe layout mobile. Auto-grow programático.
7. **NO shadow sin transición.** `shadow-xs hover:shadow-soft transition-shadow` — nunca solo `hover:shadow-soft`.
8. **NO cierra modales o drawers de golpe.** Siempre con transición `t-modal` (250ms enter / 150ms exit).
9. **NO uses emojis decorativos en UI staff.** OK en mensajes de Laura al paciente (📅 ⏰ ✅). Nunca en headers, botones, labels.
10. **NO texto blanco sobre fondo claro** ni al revés. El sistema define `text-ink-*` y `text-*-foreground` para cada superficie.

---

## 9. Checklist antes de dar merge

- [ ] Cero colores literales — todo via tokens.
- [ ] `lg-surface` en cards de contenido (habilita frosted / liquid glass sin efecto en otros temas).
- [ ] `rounded-xl` para cards, `rounded-2xl` para modales, `rounded-md` para botones/inputs.
- [ ] `shadow-xs hover:shadow-soft transition-shadow` en cards.
- [ ] Botones respetan alturas canónicas (`h-8`/`h-9`/`h-11`).
- [ ] Icon buttons con `aria-label`.
- [ ] Testeado en modo claro **y** oscuro.
- [ ] Testeado en al menos 2 familias (Clínico + Bridgery).
- [ ] Focus visible en todos los interactivos.
- [ ] Mobile: mínimo 375px de ancho, touch targets 44px+.
- [ ] Sin `!important` fuera de liquid glass.
- [ ] Sin comentarios que explican qué hace el código (solo el "por qué" no obvio).

---

## 10. Referencias rápidas

### Cards del dashboard: [`AdminDashboard.tsx`](../src/components/dashboards/AdminDashboard.tsx)
- Quick actions container (línea ~165)
- KPI grid (línea ~183)
- Próximas sesiones + Riesgo activo (línea ~217)

### Notas SOAP: [`historia.tsx`](../src/routes/historia.tsx)
- NoteEditor (línea ~1327)
- AutoResizeTextarea helper

### Modales: [`LauraStreamModal.tsx`](../src/components/laura/LauraStreamModal.tsx)
- Patrón `phase: opening → open → closing → unmount`
- Render prop `footer(close)` para transición del cierre

### Drawer: [`LauraChat.tsx`](../src/components/laura/LauraChat.tsx)
- `h-dvh` para mobile keyboard
- `safe-area-inset-bottom` en el form
- `body scroll lock` cuando el drawer está montado

### Sidebar: [`AppSidebar.tsx`](../src/components/app/AppSidebar.tsx)
- Item activo con `.lg-sidebar-active` para tema liquid
- Border colapsable + persistente

---

## 11. Cómo agregar un componente nuevo

1. **Buscá si ya existe** — grep por lo que estás por hacer. Muchas veces hay un patrón similar que se puede reusar.
2. **Empezá con tokens y padding.** No agregues color hasta que lo pida el diseño.
3. **Testeá los dos modos** (claro/oscuro) durante el desarrollo, no al final.
4. **Mirá cómo se ve en Liquid Glass** — activá el tema en tu cuenta demo. Si algo se rompe, es porque no usaste tokens.
5. **Copiá el patrón de un componente existente similar** en lugar de partir de cero.
6. Al final: pasá por el checklist de la sección 9.

---

## 12. Referencias externas de inspiración

Estas guiaron decisiones específicas:

- **Apple HIG — Materials**: base para Liquid Glass.
- **Aave — Building Glass for the Web** (`aave.com/design/building-glass-for-the-web`): edge highlights y pilas de sombras.
- **transitions.dev**: para nuestras animaciones. Ya integrado en `src/styles/transitions.css`.
- **shadcn/ui**: nomenclatura de tokens (`--background`, `--foreground`, `--card`, etc.).

No copiar de Material Design ni de Fluent UI — no comparten filosofía con nuestra estética clínica cálida.
