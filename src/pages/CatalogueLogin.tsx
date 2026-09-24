import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Gem, Loader2, Sparkles } from "lucide-react";
import { useCatalogViewerAuth } from "@/contexts/CatalogViewerAuthContext";
import { apiCatalogViewLogin, apiCatalogViewTheme, type CatalogueTheme } from "@/lib/api";
import {
  ensureCatalogueFonts,
  resolveCatalogueStyle,
} from "@/lib/catalogueTemplates";
import {
  readCachedCatalogueTheme,
  writeCachedCatalogueTheme,
} from "@/lib/catalogueThemeCache";
import {
  CatalogueAmbientOrbs,
  CatalogueGlassPanel,
  CatalogueHairline,
  CataloguePremiumStyles,
} from "@/components/catalogue/CataloguePremiumChrome";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

export default function CatalogueLogin() {
  const { isAuthenticated, login } = useCatalogViewerAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [theme, setTheme] = useState<CatalogueTheme | null>(() => readCachedCatalogueTheme());
  const [themeReady, setThemeReady] = useState(theme != null);

  const style = useMemo(() => resolveCatalogueStyle(theme), [theme]);

  useEffect(() => {
    void apiCatalogViewTheme()
      .then((t) => {
        setTheme(t);
        writeCachedCatalogueTheme(t);
      })
      .catch(() => {
        /* keep cached theme if present */
      })
      .finally(() => setThemeReady(true));
  }, []);

  useEffect(() => {
    if (!themeReady) return;
    ensureCatalogueFonts(style);
  }, [themeReady, style.id]);

  if (isAuthenticated) return <Navigate to="/catalogue" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await apiCatalogViewLogin(username.trim(), password);
      login(res.access_token);
      navigate("/catalogue", { replace: true });
    } catch (err: unknown) {
      toast({
        title: "Login failed",
        description: err instanceof Error ? err.message : "Invalid credentials",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

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
      className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-12"
      style={{
        background: style.atmosphere,
        color: style.text,
        fontFamily: style.bodyFont,
      }}
    >
      <CataloguePremiumStyles style={style} />
      <CatalogueAmbientOrbs style={style} />

      <div className="relative z-10 w-full max-w-md">
        <div className="mb-8 text-center">
          <div
            className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full"
            style={{
              background: style.buttonGradient,
              color: style.background,
              boxShadow: `0 0 40px ${style.accentGlow}`,
            }}
          >
            <Gem className="h-6 w-6" />
          </div>
          <p
            className="flex items-center justify-center gap-1.5 text-[10px] uppercase tracking-[0.36em]"
            style={{ color: style.accent }}
          >
            <Sparkles className="h-3 w-3" /> Private catalogue
          </p>
        </div>

        <CatalogueGlassPanel style={style} className="p-8 sm:p-10">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2 text-center">
              <h1
                className="text-3xl tracking-tight sm:text-4xl"
                style={{ fontFamily: style.displayFont, fontWeight: 500 }}
              >
                {theme?.page_title || "Catalogue"}
              </h1>
              <CatalogueHairline style={style} className="mx-auto mt-4 max-w-[8rem]" />
              <p className="pt-2 text-sm" style={{ color: style.muted }}>
                Sign in for a private viewing
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="viewer-user" style={{ color: style.muted }}>
                  Username
                </Label>
                <Input
                  id="viewer-user"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  required
                  className="border-0 shadow-none focus-visible:ring-1"
                  style={{
                    background: style.surfaceGradient,
                    color: style.text,
                    boxShadow: `inset 0 0 0 1px ${style.border}`,
                    borderRadius: "9999px",
                    height: "2.75rem",
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="viewer-pass" style={{ color: style.muted }}>
                  Password
                </Label>
                <Input
                  id="viewer-pass"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  className="border-0 shadow-none focus-visible:ring-1"
                  style={{
                    background: style.surfaceGradient,
                    color: style.text,
                    boxShadow: `inset 0 0 0 1px ${style.border}`,
                    borderRadius: "9999px",
                    height: "2.75rem",
                  }}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-full py-3.5 text-[11px] uppercase tracking-[0.28em] transition hover:brightness-110 disabled:opacity-60"
              style={{
                background: style.buttonGradient,
                color: style.background,
                boxShadow: `0 12px 36px ${style.accentSoft}, 0 0 0 1px ${style.border}`,
              }}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Enter the collection
            </button>
          </form>
        </CatalogueGlassPanel>
      </div>
    </div>
  );
}
