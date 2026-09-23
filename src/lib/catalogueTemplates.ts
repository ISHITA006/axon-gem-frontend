import type { CatalogueTheme } from "@/lib/api";

export type CatalogueTemplateId =
  | "vault_emerald"
  | "obsidian_gold"
  | "midnight_sapphire"
  | "porcelain_luxe"
  // legacy ids map to new presets
  | "atelier_noir"
  | "white_gallery"
  | "editorial_ink";

export type CatalogueTemplate = {
  id: CatalogueTemplateId;
  name: string;
  tagline: string;
  background: string;
  surface: string;
  text: string;
  muted: string;
  accent: string;
  border: string;
  displayFont: string;
  bodyFont: string;
  googleFontsUrl: string;
  cardRadius: string;
  filterStyle: "pill" | "underline" | "boxed";
  /** Soft glow used when building atmosphere from custom colours */
  glowRgb: string;
};

export type ResolvedCatalogueStyle = {
  id: string;
  name: string;
  background: string;
  surface: string;
  text: string;
  muted: string;
  accent: string;
  border: string;
  displayFont: string;
  bodyFont: string;
  atmosphere: string;
  headerBlur: string;
  cardRadius: string;
  filterStyle: "pill" | "underline" | "boxed";
  cardShadow: string;
  /** Extra premium tokens */
  accentSoft: string;
  accentGlow: string;
  surfaceGradient: string;
  panelGradient: string;
  hairlineGradient: string;
  cardBorderGradient: string;
  buttonGradient: string;
  isDark: boolean;
};

const LEGACY_MAP: Record<string, CatalogueTemplateId> = {
  atelier_noir: "obsidian_gold",
  white_gallery: "porcelain_luxe",
  editorial_ink: "midnight_sapphire",
};

export const CATALOGUE_TEMPLATES: CatalogueTemplate[] = [
  {
    id: "vault_emerald",
    name: "Vault Emerald",
    tagline: "Private suite — deep green with gold edge light",
    background: "#061510",
    surface: "#0c221a",
    text: "#e9f2ed",
    muted: "#8aa899",
    accent: "#d4af37",
    border: "rgba(212,175,55,0.28)",
    displayFont: '"Cormorant Garamond", Georgia, serif',
    bodyFont: '"Manrope", system-ui, sans-serif',
    googleFontsUrl:
      "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=Manrope:wght@300;400;500;600&display=swap",
    cardRadius: "0.75rem",
    filterStyle: "pill",
    glowRgb: "212, 175, 55",
  },
  {
    id: "obsidian_gold",
    name: "Obsidian Gold",
    tagline: "Night vitrine — liquid black, champagne metal",
    background: "#070707",
    surface: "#121212",
    text: "#f4efe6",
    muted: "#9a9184",
    accent: "#d2b48c",
    border: "rgba(210,180,140,0.3)",
    displayFont: '"Cormorant Garamond", Georgia, serif',
    bodyFont: '"Manrope", system-ui, sans-serif',
    googleFontsUrl:
      "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=Manrope:wght@300;400;500;600&display=swap",
    cardRadius: "0.75rem",
    filterStyle: "pill",
    glowRgb: "210, 180, 140",
  },
  {
    id: "midnight_sapphire",
    name: "Midnight Sapphire",
    tagline: "Jewel box — ink navy with cool platinum light",
    background: "#060b16",
    surface: "#0d1628",
    text: "#e8eef8",
    muted: "#8b9bb8",
    accent: "#a8c0e8",
    border: "rgba(168,192,232,0.28)",
    displayFont: '"Cormorant Garamond", Georgia, serif',
    bodyFont: '"Manrope", system-ui, sans-serif',
    googleFontsUrl:
      "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=Manrope:wght@300;400;500;600&display=swap",
    cardRadius: "0.75rem",
    filterStyle: "pill",
    glowRgb: "120, 160, 220",
  },
  {
    id: "porcelain_luxe",
    name: "Porcelain Luxe",
    tagline: "Daylight salon — soft stone, warm metal accents",
    background: "#f2efe9",
    surface: "#fffcf8",
    text: "#1a1714",
    muted: "#7a736a",
    accent: "#9a7b4f",
    border: "rgba(154,123,79,0.22)",
    displayFont: '"Cormorant Garamond", Georgia, serif',
    bodyFont: '"Manrope", system-ui, sans-serif',
    googleFontsUrl:
      "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=Manrope:wght@300;400;500;600&display=swap",
    cardRadius: "0.75rem",
    filterStyle: "pill",
    glowRgb: "154, 123, 79",
  },
];

export const ACTIVE_TEMPLATE_IDS = CATALOGUE_TEMPLATES.map((t) => t.id);

export function normalizeTemplateId(id?: string | null): CatalogueTemplateId {
  if (!id) return "porcelain_luxe";
  if (LEGACY_MAP[id]) return LEGACY_MAP[id];
  if (CATALOGUE_TEMPLATES.some((t) => t.id === id)) return id as CatalogueTemplateId;
  return "porcelain_luxe";
}

export function getCatalogueTemplate(id?: string | null): CatalogueTemplate {
  const nid = normalizeTemplateId(id);
  return CATALOGUE_TEMPLATES.find((t) => t.id === nid) ?? CATALOGUE_TEMPLATES[0];
}

export function templateToThemeColors(t: CatalogueTemplate) {
  return {
    primary_color: t.text,
    secondary_color: t.surface,
    accent_color: t.accent,
    background_color: t.background,
    text_color: t.text,
    font_family: t.bodyFont.split(",")[0].replace(/"/g, "").trim(),
  };
}

function hexToRgb(hex: string): [number, number, number] | null {
  const h = hex.replace("#", "").trim();
  if (h.length === 3) {
    return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)];
  }
  if (h.length !== 6) return null;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function mixHex(a: string, b: string, t: number): string {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  if (!A || !B) return a;
  const m = (i: number) => Math.round(A[i] + (B[i] - A[i]) * t);
  return `#${[m(0), m(1), m(2)].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

function rgbaFromHex(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return `rgba(0,0,0,${alpha})`;
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

function isDark(hex: string): boolean {
  const rgb = hexToRgb(hex);
  if (!rgb) return true;
  const lum = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
  return lum < 0.45;
}

export function buildAtmosphere(background: string, accent: string, surface: string, glowRgb?: string): string {
  const glow = glowRgb ?? (() => {
    const rgb = hexToRgb(accent);
    return rgb ? rgb.join(", ") : "200, 180, 120";
  })();
  return [
    `radial-gradient(ellipse 80% 55% at 90% -15%, rgba(${glow}, 0.22), transparent 55%)`,
    `radial-gradient(ellipse 60% 50% at 0% 110%, rgba(${glow}, 0.14), transparent 50%)`,
    `radial-gradient(ellipse 45% 35% at 50% 30%, rgba(${glow}, 0.06), transparent 70%)`,
    `radial-gradient(ellipse 40% 30% at 50% 40%, ${rgbaFromHex(surface, 0.4)}, transparent 70%)`,
    `linear-gradient(165deg, ${background} 0%, ${mixHex(background, surface, 0.4)} 55%, ${background} 100%)`,
  ].join(", ");
}

/** Merge preset structure with saved theme colours. */
export function resolveCatalogueStyle(theme?: CatalogueTheme | null): ResolvedCatalogueStyle {
  const base = getCatalogueTemplate(theme?.template_id);
  const background = theme?.background_color || base.background;
  const surface = theme?.secondary_color || base.surface;
  const text = theme?.text_color || theme?.primary_color || base.text;
  const accent = theme?.accent_color || base.accent;
  const muted = mixHex(text, background, 0.45);
  const border = rgbaFromHex(accent, 0.28);
  const dark = isDark(background);
  // Glow must follow the active accent (saved colour or preset), not a hard-coded preset RGB.
  const accentRgb = hexToRgb(accent);
  const glow = accentRgb ? accentRgb.join(", ") : base.glowRgb;
  const accentMid = mixHex(accent, background, 0.35);

  return {
    id: base.id,
    name: base.name,
    background,
    surface,
    text,
    muted,
    accent,
    border,
    displayFont: base.displayFont,
    bodyFont: base.bodyFont,
    atmosphere: buildAtmosphere(background, accent, surface, glow),
    headerBlur: rgbaFromHex(background, 0.72),
    cardRadius: base.cardRadius,
    filterStyle: base.filterStyle,
    cardShadow: dark
      ? `0 24px 60px rgba(0,0,0,0.55), 0 0 40px rgba(${glow}, 0.08), inset 0 1px 0 rgba(255,255,255,0.06)`
      : `0 20px 50px rgba(26,23,20,0.1), 0 0 30px rgba(${glow}, 0.08), inset 0 1px 0 rgba(255,255,255,0.8)`,
    accentSoft: rgbaFromHex(accent, 0.14),
    accentGlow: `rgba(${glow}, 0.45)`,
    surfaceGradient: `linear-gradient(160deg, ${mixHex(surface, accent, 0.08)} 0%, ${surface} 45%, ${mixHex(surface, background, 0.25)} 100%)`,
    panelGradient: `linear-gradient(145deg, ${rgbaFromHex(surface, dark ? 0.92 : 0.95)} 0%, ${rgbaFromHex(background, dark ? 0.75 : 0.65)} 100%)`,
    hairlineGradient: `linear-gradient(90deg, transparent, ${rgbaFromHex(accent, 0.7)}, ${accent}, ${rgbaFromHex(accent, 0.7)}, transparent)`,
    cardBorderGradient: `linear-gradient(145deg, ${rgbaFromHex(accent, 0.55)}, ${rgbaFromHex(accent, 0.08)} 40%, ${rgbaFromHex(text, dark ? 0.12 : 0.06)} 70%, ${rgbaFromHex(accent, 0.35)})`,
    buttonGradient: `linear-gradient(135deg, ${mixHex(accent, text, 0.15)} 0%, ${accent} 45%, ${accentMid} 100%)`,
    isDark: dark,
  };
}

export function ensureCatalogueFonts(template: CatalogueTemplate | ResolvedCatalogueStyle) {
  const id = `catalogue-font-${"id" in template ? template.id : "resolved"}`;
  if (typeof document === "undefined") return;
  if (document.getElementById(id)) return;
  const base = getCatalogueTemplate("id" in template ? template.id : "porcelain_luxe");
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = base.googleFontsUrl;
  document.head.appendChild(link);
}
