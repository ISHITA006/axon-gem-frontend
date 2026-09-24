import type { CatalogueTheme } from "@/lib/api";

const STORAGE_KEY = "catalog_view_theme";

function isCatalogueTheme(value: unknown): value is CatalogueTheme {
  if (!value || typeof value !== "object") return false;
  const t = value as Record<string, unknown>;
  return (
    typeof t.background_color === "string" &&
    typeof t.secondary_color === "string" &&
    typeof t.accent_color === "string" &&
    typeof t.text_color === "string" &&
    typeof t.primary_color === "string"
  );
}

/** Sync read for first paint — avoids flashing the default preset. */
export function readCachedCatalogueTheme(): CatalogueTheme | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isCatalogueTheme(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeCachedCatalogueTheme(theme: CatalogueTheme): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(theme));
  } catch {
    /* quota / private mode — ignore */
  }
}
