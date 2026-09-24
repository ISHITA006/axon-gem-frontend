import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { Gem, ImagePlus, Loader2, LogOut, Search, Sparkles, X } from "lucide-react";
import { useCatalogViewerAuth } from "@/contexts/CatalogViewerAuthContext";
import {
  apiCatalogViewFields,
  apiCatalogViewItems,
  apiCatalogViewPresignedUrl,
  apiCatalogViewSmartSearch,
  apiCatalogViewTheme,
  isVideoS3Key,
  type CatalogueFieldDefinition,
  type CatalogueItem,
  type CatalogueTheme,
} from "@/lib/api";
import {
  ensureCatalogueFonts,
  resolveCatalogueStyle,
} from "@/lib/catalogueTemplates";
import {
  readCachedCatalogueTheme,
  writeCachedCatalogueTheme,
} from "@/lib/catalogueThemeCache";
import { CatalogueItemZoom } from "@/components/catalogue/CatalogueItemZoom";
import { BuyerCatalogueCardMedia } from "@/components/catalogue/BuyerCatalogueCardMedia";
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
  const [theme, setTheme] = useState<CatalogueTheme | null>(() => readCachedCatalogueTheme());
  const [themeReady, setThemeReady] = useState(theme != null);
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

  const [smartText, setSmartText] = useState("");
  const [smartFile, setSmartFile] = useState<File | null>(null);
  const [smartPreview, setSmartPreview] = useState("");
  const [smartMode, setSmartMode] = useState(false);
  const [smartNonce, setSmartNonce] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const style = useMemo(() => resolveCatalogueStyle(theme), [theme]);

  const filterable = useMemo(
    () => fields.filter((f) => f.filterable && f.show_on_buyer),
    [fields],
  );

  useEffect(() => {
    if (!themeReady) return;
    ensureCatalogueFonts(style);
  }, [themeReady, style.id]);

  useEffect(() => {
    if (!token) return;
    void apiCatalogViewTheme()
      .then(async (t) => {
        setTheme(t);
        writeCachedCatalogueTheme(t);
        if (t.logo_s3_key) {
          try {
            setLogoUrl(await apiCatalogViewPresignedUrl(token, t.logo_s3_key));
          } catch {
            setLogoUrl("");
          }
        } else {
          setLogoUrl("");
        }
      })
      .catch(() => {
        /* keep cached theme if present */
      })
      .finally(() => setThemeReady(true));
    void apiCatalogViewFields(token).then(setFields).catch(() => setFields([]));
  }, [token]);

  useEffect(() => {
    if (!token) return;
    if (smartMode) return;
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
  }, [token, page, q, fieldFilters, smartMode]);

  useEffect(() => {
    if (!token || !smartMode) return;
    if (!smartText.trim() && !smartFile) return;
    setLoading(true);
    void apiCatalogViewSmartSearch(token, {
      q: smartText,
      page,
      fieldFilters,
      image: smartFile,
    })
      .then((res) => {
        setItems(res.data);
        setPageCount(res.page_count);
        setTotal(res.total);
      })
      .catch((err: unknown) => {
        toast({
          title: "Smart search failed",
          description: err instanceof Error ? err.message : "Could not run smart search",
          variant: "destructive",
        });
        if (err instanceof Error && /auth|token|login/i.test(err.message)) logout();
      })
      .finally(() => setLoading(false));
  }, [token, smartMode, page, fieldFilters, smartNonce]);

  useEffect(() => {
    if (!token || !items.length) return;
    let cancelled = false;
    void (async () => {
      const next: Record<string, string> = {};
      await Promise.all(
        items.map(async (item) => {
          const keys = (item.images ?? []).map((img) => img.image_s3_key).filter(Boolean);
          const key = keys.find((k) => !isVideoS3Key(k)) ?? keys[0];
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

  useEffect(() => {
    return () => {
      if (smartPreview) URL.revokeObjectURL(smartPreview);
    };
  }, [smartPreview]);

  const runSmartSearch = () => {
    if (!smartText.trim() && !smartFile) {
      toast({
        title: "Add a description or photo",
        description: "Smart search needs text and/or a reference image.",
        variant: "destructive",
      });
      return;
    }
    setPage(1);
    setSmartMode(true);
    setSmartNonce((n) => n + 1);
  };

  const clearSmartSearch = () => {
    setSmartMode(false);
    setSmartText("");
    setSmartFile(null);
    if (smartPreview) URL.revokeObjectURL(smartPreview);
    setSmartPreview("");
    setPage(1);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const onPickSmartImage = (file: File | null) => {
    if (smartPreview) URL.revokeObjectURL(smartPreview);
    if (!file) {
      setSmartFile(null);
      setSmartPreview("");
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast({
        title: "Invalid file",
        description: "Please upload an image.",
        variant: "destructive",
      });
      return;
    }
    setSmartFile(file);
    setSmartPreview(URL.createObjectURL(file));
  };

  if (!isAuthenticated || !token) return <Navigate to="/catalogue/login" replace />;

  // Cold load with no cache: wait for API theme before painting themed chrome.
  if (!themeReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 text-neutral-400">
        <Loader2 className="h-7 w-7 animate-spin" />
      </div>
    );
  }

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

        <CatalogueGlassPanel style={style} className="p-4 sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: style.accent, boxShadow: `0 0 12px ${style.accentGlow}` }}
              />
              <p className="text-[10px] uppercase tracking-[0.28em]" style={{ color: style.muted }}>
                Smart search
              </p>
              {smartMode ? (
                <span
                  className="rounded-full px-2 py-0.5 text-[9px] uppercase tracking-[0.18em]"
                  style={{
                    color: style.background,
                    background: style.buttonGradient,
                  }}
                >
                  Active
                </span>
              ) : null}
            </div>
            {smartMode ? (
              <button
                type="button"
                onClick={clearSmartSearch}
                className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] transition hover:opacity-80"
                style={{ color: style.muted }}
              >
                <X className="h-3 w-3" /> Clear
              </button>
            ) : null}
          </div>
          <p className="mb-4 text-sm leading-relaxed" style={{ color: style.muted }}>
            Describe a piece or upload a reference photo — we match the closest items in the catalogue.
          </p>
          <div className="grid gap-4 lg:grid-cols-[1fr_auto_auto] lg:items-end">
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-[0.22em]" style={{ color: style.muted }}>
                Describe what you want
              </label>
              <div
                className="relative flex items-center overflow-hidden rounded-full"
                style={{
                  background: style.surfaceGradient,
                  border: `1px solid ${style.border}`,
                }}
              >
                <Sparkles
                  className="pointer-events-none absolute left-3.5 h-3.5 w-3.5"
                  style={{ color: style.accent }}
                />
                <Input
                  value={smartText}
                  onChange={(e) => setSmartText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      runSmartSearch();
                    }
                  }}
                  placeholder="e.g. gold jhumka with pearls…"
                  className="border-0 bg-transparent pl-10 shadow-none focus-visible:ring-0"
                  style={{ color: style.text }}
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-[0.22em]" style={{ color: style.muted }}>
                Reference photo
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => onPickSmartImage(e.target.files?.[0] ?? null)}
              />
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 rounded-full px-4 py-2.5 text-[10px] uppercase tracking-[0.2em] transition hover:opacity-90"
                  style={{
                    color: style.text,
                    background: style.surfaceGradient,
                    border: `1px solid ${style.border}`,
                  }}
                >
                  <ImagePlus className="h-3.5 w-3.5" style={{ color: style.accent }} />
                  {smartFile ? "Change" : "Upload"}
                </button>
                {smartPreview ? (
                  <div
                    className="relative h-11 w-11 overflow-hidden rounded-full"
                    style={{ border: `1px solid ${style.border}` }}
                  >
                    <img src={smartPreview} alt="" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      aria-label="Remove photo"
                      onClick={() => {
                        onPickSmartImage(null);
                        if (fileInputRef.current) fileInputRef.current.value = "";
                      }}
                      className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full"
                      style={{ background: style.buttonGradient, color: style.background }}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              onClick={runSmartSearch}
              disabled={loading}
              className="rounded-full px-6 py-2.5 text-[10px] uppercase tracking-[0.22em] disabled:opacity-50"
              style={{
                color: style.background,
                background: style.buttonGradient,
                boxShadow: `0 0 24px ${style.accentSoft}`,
              }}
            >
              Find matches
            </button>
          </div>
        </CatalogueGlassPanel>

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
                  opacity: smartMode ? 0.45 : 1,
                }}
              >
                <Search
                  className="pointer-events-none absolute left-3.5 h-3.5 w-3.5"
                  style={{ color: style.accent }}
                />
                <Input
                  value={q}
                  disabled={smartMode}
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
              {smartMode ? "Finding closest matches" : "Opening the vault"}
            </p>
          </div>
        ) : items.length === 0 ? (
          <CatalogueGlassPanel style={style} className="px-6 py-20 text-center">
            <Sparkles className="mx-auto mb-3 h-6 w-6" style={{ color: style.accent }} />
            <p className="text-sm tracking-wide" style={{ color: style.muted }}>
              {smartMode
                ? "No close matches yet — try a different description or photo."
                : "No pieces match your filters."}
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
                  className="transition duration-500 group-hover:-translate-y-1 group-hover:shadow-[0_22px_48px_rgba(0,0,0,0.28)]"
                >
                  <div className="relative w-full overflow-hidden" style={{ aspectRatio: "2 / 3" }}>
                    <BuyerCatalogueCardMedia
                      item={item}
                      token={token}
                      primaryUrl={imageUrls[item.uid]}
                    />
                    <div
                      className="pointer-events-none absolute inset-0 z-[2] opacity-0 transition duration-500 group-hover:opacity-100"
                      style={{
                        background: `linear-gradient(180deg, transparent 55%, rgba(0,0,0,0.35) 100%)`,
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
