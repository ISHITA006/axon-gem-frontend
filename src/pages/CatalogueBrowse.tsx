import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { Gem, Loader2, LogOut, Search, Sparkles } from "lucide-react";
import { useCatalogViewerAuth } from "@/contexts/CatalogViewerAuthContext";
import {
  apiCatalogViewFields,
  apiCatalogViewItems,
  apiCatalogViewPresignedUrl,
  apiCatalogViewTheme,
  type CatalogueFieldDefinition,
  type CatalogueItem,
  type CatalogueTheme,
} from "@/lib/api";
import {
  ensureCatalogueFonts,
  resolveCatalogueStyle,
} from "@/lib/catalogueTemplates";
import { CatalogueItemZoom } from "@/components/catalogue/CatalogueItemZoom";
import {
  CatalogueAmbientOrbs,
  CatalogueGlassPanel,
  CatalogueGradientFrame,
  CatalogueHairline,
  CataloguePremiumStyles,
} from "@/components/catalogue/CataloguePremiumChrome";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

export default function CatalogueBrowse() {
  const { token, isAuthenticated, logout } = useCatalogViewerAuth();
  const { toast } = useToast();
  const [theme, setTheme] = useState<CatalogueTheme | null>(null);
  const [fields, setFields] = useState<CatalogueFieldDefinition[]>([]);
  const [items, setItems] = useState<CatalogueItem[]>([]);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [fieldFilters, setFieldFilters] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<CatalogueItem | null>(null);
  const [logoUrl, setLogoUrl] = useState("");

  const style = useMemo(() => resolveCatalogueStyle(theme), [theme]);

  const filterable = useMemo(
    () => fields.filter((f) => f.filterable && f.show_on_buyer),
    [fields],
  );

  useEffect(() => {
    ensureCatalogueFonts(style);
  }, [style.id]);

  useEffect(() => {
    if (!token) return;
    void apiCatalogViewTheme()
      .then(async (t) => {
        setTheme(t);
        if (t.logo_s3_key) {
          try {
            setLogoUrl(await apiCatalogViewPresignedUrl(token, t.logo_s3_key));
          } catch {
            setLogoUrl("");
          }
        }
      })
      .catch(() => setTheme(null));
    void apiCatalogViewFields(token).then(setFields).catch(() => setFields([]));
  }, [token]);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    void apiCatalogViewItems(token, { page, q, fieldFilters })
      .then((res) => {
        setItems(res.data);
        setPageCount(res.page_count);
        setTotal(res.total);
      })
      .catch((err: unknown) => {
        toast({
          title: "Failed to load",
          description: err instanceof Error ? err.message : "Could not load catalogue",
          variant: "destructive",
        });
        if (err instanceof Error && /auth|token|login/i.test(err.message)) logout();
      })
      .finally(() => setLoading(false));
  }, [token, page, q, fieldFilters]);

  useEffect(() => {
    if (!token || !items.length) return;
    let cancelled = false;
    void (async () => {
      const next: Record<string, string> = {};
      await Promise.all(
        items.map(async (item) => {
          const key = item.images?.[0]?.image_s3_key;
          if (!key) return;
          try {
            next[item.uid] = await apiCatalogViewPresignedUrl(token, key);
          } catch {
            /* ignore */
          }
        }),
      );
      if (!cancelled) setImageUrls(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [token, items]);

  if (!isAuthenticated || !token) return <Navigate to="/catalogue/login" replace />;

  return (
    <div
      className="relative min-h-screen overflow-x-hidden"
      style={{
        background: style.atmosphere,
        color: style.text,
        fontFamily: style.bodyFont,
      }}
    >
      <CataloguePremiumStyles style={style} />
      <CatalogueAmbientOrbs style={style} />

      <header className="sticky top-0 z-30">
        <div
          className="border-b backdrop-blur-2xl"
          style={{ borderColor: style.border, background: style.headerBlur }}
        >
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-8 sm:py-5">
            <div className="flex min-w-0 items-center gap-4">
              {logoUrl ? (
                <div
                  className="flex h-12 items-center rounded-full px-3"
                  style={{
                    background: style.surfaceGradient,
                    border: `1px solid ${style.border}`,
                    boxShadow: `0 0 24px ${style.accentSoft}`,
                  }}
                >
                  <img src={logoUrl} alt="" className="h-8 max-w-[120px] object-contain" />
                </div>
              ) : (
                <div
                  className="flex h-11 w-11 items-center justify-center rounded-full"
                  style={{
                    background: style.buttonGradient,
                    color: style.background,
                    boxShadow: `0 0 28px ${style.accentGlow}`,
                  }}
                >
                  <Gem className="h-5 w-5" />
                </div>
              )}
              <div className="min-w-0">
                <p
                  className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.32em]"
                  style={{ color: style.accent }}
                >
                  <Sparkles className="h-3 w-3" /> Private collection
                </p>
                <h1
                  className="truncate text-xl tracking-tight sm:text-2xl"
                  style={{ fontFamily: style.displayFont, fontWeight: 500 }}
                >
                  {theme?.page_title || "Catalogue"}
                </h1>
              </div>
            </div>
            <button
              type="button"
              onClick={logout}
              className="flex shrink-0 items-center gap-2 rounded-full px-4 py-2.5 text-[10px] uppercase tracking-[0.2em] transition hover:opacity-80"
              style={{
                color: style.muted,
                background: style.panelGradient,
                border: `1px solid ${style.border}`,
              }}
            >
              <LogOut className="h-3.5 w-3.5" /> Sign out
            </button>
          </div>
          <CatalogueHairline style={style} />
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-7xl space-y-10 px-4 py-10 sm:px-8 sm:py-14">
        {/* Hero */}
        <section className="relative text-center">
          <div
            className="pointer-events-none absolute left-1/2 top-0 h-40 w-[min(90%,36rem)] -translate-x-1/2 rounded-full blur-3xl"
            style={{ background: style.accentSoft }}
            aria-hidden
          />
          <p
            className="relative text-[11px] uppercase tracking-[0.4em]"
            style={{ color: style.accent }}
          >
            Curated for you
          </p>
          <h2
            className="relative mx-auto mt-3 max-w-3xl text-4xl leading-[1.1] tracking-tight sm:text-5xl md:text-6xl"
            style={{ fontFamily: style.displayFont, fontWeight: 500 }}
          >
            {theme?.page_title || "The collection"}
          </h2>
          {theme?.subtitle ? (
            <p
              className="relative mx-auto mt-4 max-w-xl text-sm leading-relaxed sm:text-base"
              style={{ color: style.muted }}
            >
              {theme.subtitle}
            </p>
          ) : (
            <p
              className="relative mx-auto mt-4 max-w-xl text-sm leading-relaxed sm:text-base"
              style={{ color: style.muted }}
            >
              Explore every piece in a private viewing room — crafted light, quiet detail.
            </p>
          )}
          <div className="relative mx-auto mt-7 flex max-w-xs items-center gap-3">
            <CatalogueHairline style={style} className="flex-1" />
            <span
              className="rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.24em]"
              style={{
                color: style.accent,
                background: style.accentSoft,
                border: `1px solid ${style.border}`,
              }}
            >
              {loading ? "…" : `${total} piece${total === 1 ? "" : "s"}`}
            </span>
            <CatalogueHairline style={style} className="flex-1" />
          </div>
        </section>

        {/* Filters */}
        <CatalogueGlassPanel style={style} className="p-4 sm:p-5">
          <div className="mb-4 flex items-center gap-2">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: style.accent, boxShadow: `0 0 12px ${style.accentGlow}` }}
            />
            <p className="text-[10px] uppercase tracking-[0.28em]" style={{ color: style.muted }}>
              Refine the view
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-[0.22em]" style={{ color: style.muted }}>
                Search
              </label>
              <div
                className="relative flex items-center overflow-hidden rounded-full"
                style={{
                  background: style.surfaceGradient,
                  border: `1px solid ${style.border}`,
                }}
              >
                <Search
                  className="pointer-events-none absolute left-3.5 h-3.5 w-3.5"
                  style={{ color: style.accent }}
                />
                <Input
                  value={q}
                  onChange={(e) => {
                    setPage(1);
                    setQ(e.target.value);
                  }}
                  placeholder="SKU or name…"
                  className="border-0 bg-transparent pl-10 shadow-none focus-visible:ring-0"
                  style={{ color: style.text }}
                />
              </div>
            </div>
            {filterable.map((field) => (
              <div key={field.uid} className="space-y-2">
                <label className="text-[10px] uppercase tracking-[0.22em]" style={{ color: style.muted }}>
                  {field.label}
                </label>
                <div
                  className="overflow-hidden rounded-full"
                  style={{
                    background: style.surfaceGradient,
                    border: `1px solid ${style.border}`,
                  }}
                >
                  {field.field_type === "dropdown" ||
                  field.field_type === "multiselect" ||
                  field.field_type === "boolean" ? (
                    <Select
                      value={fieldFilters[field.key] || "__all__"}
                      onValueChange={(v) => {
                        setPage(1);
                        setFieldFilters((prev) => {
                          const next = { ...prev };
                          if (v === "__all__") delete next[field.key];
                          else next[field.key] = v;
                          return next;
                        });
                      }}
                    >
                      <SelectTrigger
                        className="border-0 bg-transparent shadow-none focus:ring-0"
                        style={{ color: style.text }}
                      >
                        <SelectValue placeholder="All" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">All</SelectItem>
                        {field.field_type === "boolean" ? (
                          <>
                            <SelectItem value="true">Yes</SelectItem>
                            <SelectItem value="false">No</SelectItem>
                          </>
                        ) : (
                          (field.options ?? []).map((opt) => (
                            <SelectItem key={opt} value={opt}>
                              {opt}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      value={fieldFilters[field.key] || ""}
                      onChange={(e) => {
                        setPage(1);
                        const v = e.target.value;
                        setFieldFilters((prev) => {
                          const next = { ...prev };
                          if (!v.trim()) delete next[field.key];
                          else next[field.key] = v;
                          return next;
                        });
                      }}
                      className="border-0 bg-transparent shadow-none focus-visible:ring-0"
                      style={{ color: style.text }}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        </CatalogueGlassPanel>

        {loading ? (
          <div className="flex flex-col items-center justify-center gap-4 py-28">
            <div
              className="relative flex h-16 w-16 items-center justify-center rounded-full"
              style={{
                background: style.panelGradient,
                border: `1px solid ${style.border}`,
                boxShadow: `0 0 40px ${style.accentSoft}`,
              }}
            >
              <Loader2 className="h-7 w-7 animate-spin" style={{ color: style.accent }} />
            </div>
            <p className="text-xs uppercase tracking-[0.28em]" style={{ color: style.muted }}>
              Opening the vault
            </p>
          </div>
        ) : items.length === 0 ? (
          <CatalogueGlassPanel style={style} className="px-6 py-20 text-center">
            <Sparkles className="mx-auto mb-3 h-6 w-6" style={{ color: style.accent }} />
            <p className="text-sm tracking-wide" style={{ color: style.muted }}>
              No pieces match your filters.
            </p>
          </CatalogueGlassPanel>
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-11 sm:grid-cols-3 sm:gap-x-7 sm:gap-y-14 lg:grid-cols-4 lg:gap-x-8">
            {items.map((item, idx) => (
              <button
                key={item.uid}
                type="button"
                onClick={() => setSelected(item)}
                className="group flex flex-col text-left outline-none"
                style={{
                  animation: `catalogueFadeIn 0.65s ease ${Math.min(idx * 0.05, 0.45)}s both`,
                }}
              >
                <CatalogueGradientFrame
                  style={style}
                  className="transition duration-500 group-hover:-translate-y-1.5 group-hover:shadow-[0_28px_60px_rgba(0,0,0,0.35)]"
                >
                  <div className="relative w-full" style={{ aspectRatio: "2 / 3" }}>
                    {/* Soft vignette behind product */}
                    <div
                      className="pointer-events-none absolute inset-0"
                      style={{
                        background: `radial-gradient(ellipse 70% 55% at 50% 55%, ${style.accentSoft} 0%, transparent 70%)`,
                      }}
                    />
                    {imageUrls[item.uid] ? (
                      <img
                        src={imageUrls[item.uid]}
                        alt={item.name}
                        className="relative z-[1] h-full w-full object-contain p-2 transition duration-700 ease-out group-hover:scale-[1.04]"
                      />
                    ) : (
                      <div className="h-full w-full animate-pulse" style={{ background: style.border }} />
                    )}
                    <div
                      className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] h-16 opacity-0 transition group-hover:opacity-100"
                      style={{
                        background: `linear-gradient(transparent, ${style.accentSoft})`,
                      }}
                    />
                  </div>
                </CatalogueGradientFrame>
                <div className="mt-4 space-y-1.5 px-1">
                  <p
                    className="text-[10px] uppercase tracking-[0.26em] transition group-hover:tracking-[0.32em]"
                    style={{ color: style.accent }}
                  >
                    {item.item_code}
                  </p>
                  <p
                    className="text-[15px] leading-snug sm:text-[17px]"
                    style={{ fontFamily: style.displayFont, fontWeight: 500 }}
                  >
                    {item.name}
                  </p>
                  <div
                    className="h-px w-8 origin-left scale-x-0 transition duration-500 group-hover:scale-x-100"
                    style={{ background: style.hairlineGradient }}
                  />
                </div>
              </button>
            ))}
          </div>
        )}

        {pageCount > 1 ? (
          <CatalogueGlassPanel style={style} className="flex items-center justify-between px-5 py-4">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="rounded-full px-4 py-2 text-[10px] uppercase tracking-[0.22em] disabled:opacity-30"
              style={{
                color: style.text,
                background: style.surfaceGradient,
                border: `1px solid ${style.border}`,
              }}
            >
              Previous
            </button>
            <span className="text-xs tracking-[0.18em]" style={{ color: style.muted }}>
              {page}
              <span style={{ color: style.accent }}> / </span>
              {pageCount}
            </span>
            <button
              type="button"
              disabled={page >= pageCount}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-full px-4 py-2 text-[10px] uppercase tracking-[0.22em] disabled:opacity-30"
              style={{
                color: style.background,
                background: style.buttonGradient,
                boxShadow: `0 0 24px ${style.accentSoft}`,
              }}
            >
              Next
            </button>
          </CatalogueGlassPanel>
        ) : null}
      </main>

      {selected ? (
        <CatalogueItemZoom
          item={selected}
          fields={fields}
          token={token}
          style={style}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </div>
  );
}
