import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, RotateCcw, Trash2, Upload } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  apiGetCatalogueTheme,
  apiUpdateCatalogueTheme,
  apiUploadCatalogueThemeLogo,
  getPresignedUrl,
  type CatalogueTheme,
} from "@/lib/api";
import {
  CATALOGUE_TEMPLATES,
  ensureCatalogueFonts,
  getCatalogueTemplate,
  normalizeTemplateId,
  resolveCatalogueStyle,
  templateToThemeColors,
  type CatalogueTemplateId,
} from "@/lib/catalogueTemplates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";

const COLOR_FIELDS = [
  { key: "background_color", label: "Background" },
  { key: "secondary_color", label: "Card / surface" },
  { key: "text_color", label: "Text" },
  { key: "accent_color", label: "Accent" },
  { key: "primary_color", label: "Primary (headings)" },
] as const;

export default function ManageCatalogueTheme() {
  const { token } = useAuth();
  const { toast } = useToast();
  const [theme, setTheme] = useState<CatalogueTheme | null>(null);
  const [logoUrl, setLogoUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const style = useMemo(() => resolveCatalogueStyle(theme), [theme]);

  const load = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiGetCatalogueTheme(token);
      const normalized = {
        ...data,
        template_id: normalizeTemplateId(data.template_id),
      };
      setTheme(normalized);
      ensureCatalogueFonts(getCatalogueTemplate(normalized.template_id));
      if (data.logo_s3_key) {
        setLogoUrl(await getPresignedUrl(token, data.logo_s3_key));
      } else {
        setLogoUrl("");
      }
    } catch (err: unknown) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to load theme",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [token]);

  useEffect(() => {
    if (theme) ensureCatalogueFonts(getCatalogueTemplate(theme.template_id));
  }, [theme?.template_id]);

  const selectTemplate = (id: CatalogueTemplateId) => {
    if (!theme) return;
    const t = getCatalogueTemplate(id);
    ensureCatalogueFonts(t);
    setTheme({
      ...theme,
      template_id: t.id,
      ...templateToThemeColors(t),
      card_layout: "grid",
      card_size: "md",
    });
  };

  const resetColors = () => {
    if (!theme) return;
    const t = getCatalogueTemplate(theme.template_id);
    setTheme({ ...theme, ...templateToThemeColors(t) });
  };

  const save = async () => {
    if (!token || !theme) return;
    setSaving(true);
    try {
      const tid = normalizeTemplateId(theme.template_id);
      const updated = await apiUpdateCatalogueTheme(token, {
        template_id: tid,
        primary_color: theme.primary_color,
        secondary_color: theme.secondary_color,
        accent_color: theme.accent_color,
        background_color: theme.background_color,
        text_color: theme.text_color,
        font_family: theme.font_family,
        card_layout: "grid",
        card_size: "md",
        page_title: theme.page_title,
        subtitle: theme.subtitle,
      });
      setTheme({ ...updated, template_id: normalizeTemplateId(updated.template_id) });
      toast({ title: "Theme saved" });
    } catch (err: unknown) {
      toast({
        title: "Save failed",
        description: err instanceof Error ? err.message : "Could not save theme",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const onLogo = async (file: File | null) => {
    if (!token || !file) return;
    setUploading(true);
    try {
      const updated = await apiUploadCatalogueThemeLogo(token, file);
      setTheme({ ...updated, template_id: normalizeTemplateId(updated.template_id) });
      if (updated.logo_s3_key) {
        setLogoUrl(await getPresignedUrl(token, updated.logo_s3_key));
      }
      toast({ title: "Logo uploaded" });
    } catch (err: unknown) {
      toast({
        title: "Upload failed",
        description: err instanceof Error ? err.message : "Could not upload logo",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const clearLogo = async () => {
    if (!token) return;
    setSaving(true);
    try {
      const updated = await apiUpdateCatalogueTheme(token, { clear_logo: true });
      setTheme({ ...updated, template_id: normalizeTemplateId(updated.template_id) });
      setLogoUrl("");
      toast({ title: "Logo removed" });
    } catch (err: unknown) {
      toast({
        title: "Failed",
        description: err instanceof Error ? err.message : "Could not remove logo",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading || !theme) {
    return <Skeleton className="h-96 w-full" />;
  }

  const activeId = normalizeTemplateId(theme.template_id);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Catalog theme</h2>
          <p className="text-sm text-muted-foreground">
            Choose a luxury preset, then fine-tune every colour. Cards stay 2:3 so product photos remain fully visible.
          </p>
        </div>
        <Button onClick={() => void save()} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Save theme
        </Button>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-medium">Templates</h3>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {CATALOGUE_TEMPLATES.map((t) => {
            const selected = activeId === t.id;
            const preview = resolveCatalogueStyle({
              ...theme,
              template_id: t.id,
              ...templateToThemeColors(t),
            });
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => selectTemplate(t.id)}
                className="group relative overflow-hidden rounded-xl border text-left transition hover:-translate-y-0.5 hover:shadow-lg"
                style={{
                  borderColor: selected ? "hsl(var(--primary))" : undefined,
                  boxShadow: selected ? "0 0 0 2px hsl(var(--primary))" : undefined,
                }}
              >
                <div
                  className="relative h-40 p-3"
                  style={{ background: preview.atmosphere, color: preview.text, fontFamily: preview.bodyFont }}
                >
                  {selected ? (
                    <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check className="h-3.5 w-3.5" />
                    </span>
                  ) : null}
                  <div className="grid h-full grid-cols-3 gap-2">
                    {[0, 1, 2].map((n) => (
                      <div key={n} className="flex flex-col">
                        <div
                          className="w-full flex-1"
                          style={{
                            aspectRatio: "2 / 3",
                            background: preview.surface,
                            border: `1px solid ${preview.border}`,
                            borderRadius: preview.cardRadius,
                            boxShadow: preview.cardShadow,
                          }}
                        />
                        <div
                          className="mt-1.5 h-1 w-2/3 rounded-full"
                          style={{ background: preview.accent, opacity: 0.7 }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
                <div className="space-y-1 border-t bg-background p-3">
                  <p className="font-medium" style={{ fontFamily: t.displayFont }}>
                    {t.name}
                  </p>
                  <p className="text-xs leading-snug text-muted-foreground">{t.tagline}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label>Page title</Label>
            <Input
              value={theme.page_title ?? ""}
              onChange={(e) => setTheme({ ...theme, page_title: e.target.value })}
              placeholder="Your brand catalogue"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Subtitle</Label>
            <Textarea
              value={theme.subtitle ?? ""}
              onChange={(e) => setTheme({ ...theme, subtitle: e.target.value })}
              rows={2}
              placeholder="A short line under the title"
            />
          </div>

          <div className="space-y-3 rounded-xl border p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-medium">Colours</h3>
                <p className="text-xs text-muted-foreground">Overrides for the selected template</p>
              </div>
              <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={resetColors}>
                <RotateCcw className="h-3.5 w-3.5" /> Reset to preset
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {COLOR_FIELDS.map(({ key, label }) => (
                <div key={key} className="space-y-1.5">
                  <Label>{label}</Label>
                  <div className="flex gap-2">
                    <Input
                      type="color"
                      className="h-10 w-14 p-1"
                      value={theme[key] || "#000000"}
                      onChange={(e) => setTheme({ ...theme, [key]: e.target.value })}
                    />
                    <Input
                      value={theme[key] || ""}
                      onChange={(e) => setTheme({ ...theme, [key]: e.target.value })}
                      className="font-mono text-xs"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Logo</Label>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="outline" className="gap-2" disabled={uploading} asChild>
                <label>
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  Upload logo
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => void onLogo(e.target.files?.[0] ?? null)}
                  />
                </label>
              </Button>
              {theme.logo_s3_key ? (
                <Button variant="ghost" className="gap-2 text-destructive" onClick={() => void clearLogo()}>
                  <Trash2 className="h-4 w-4" /> Remove
                </Button>
              ) : null}
            </div>
            {logoUrl ? (
              <img src={logoUrl} alt="Logo preview" className="mt-2 h-12 max-w-[160px] object-contain" />
            ) : null}
          </div>
        </div>

        <div
          className="overflow-hidden rounded-xl border p-6"
          style={{
            background: style.atmosphere,
            color: style.text,
            fontFamily: style.bodyFont,
            borderColor: style.border,
          }}
        >
          <div className="mb-6 flex items-center gap-3">
            {logoUrl ? <img src={logoUrl} alt="" className="h-9 max-w-[110px] object-contain" /> : null}
            <div>
              <h3 className="text-2xl tracking-tight" style={{ fontFamily: style.displayFont }}>
                {theme.page_title || "Catalogue"}
              </h3>
              {theme.subtitle ? (
                <p className="text-xs tracking-wide" style={{ color: style.muted }}>
                  {theme.subtitle}
                </p>
              ) : null}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map((n) => (
              <div key={n} className="flex flex-col">
                <div
                  className="relative w-full"
                  style={{
                    aspectRatio: "2 / 3",
                    background: style.surface,
                    border: `1px solid ${style.border}`,
                    borderRadius: style.cardRadius,
                    boxShadow: style.cardShadow,
                  }}
                >
                  <div
                    className="absolute inset-[18%] rounded-full opacity-25 blur-md"
                    style={{ background: style.accent }}
                  />
                </div>
                <p className="mt-2.5 text-[9px] uppercase tracking-[0.22em]" style={{ color: style.muted }}>
                  SKU-00{n}
                </p>
                <p className="text-[15px]" style={{ fontFamily: style.displayFont }}>
                  Sample piece {n}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-5 text-[11px]" style={{ color: style.muted }}>
            Live preview with your colour overrides · {style.name}
          </p>
        </div>
      </div>
    </div>
  );
}
