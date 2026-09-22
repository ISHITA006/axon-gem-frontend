import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Maximize2, X } from "lucide-react";
import type { CatalogueFieldDefinition, CatalogueItem } from "@/lib/api";
import { apiCatalogViewPresignedUrl } from "@/lib/api";
import type { ResolvedCatalogueStyle } from "@/lib/catalogueTemplates";
import {
  CatalogueGradientFrame,
  CatalogueHairline,
} from "@/components/catalogue/CataloguePremiumChrome";

type Props = {
  item: CatalogueItem;
  fields: CatalogueFieldDefinition[];
  token: string;
  style: ResolvedCatalogueStyle;
  onClose: () => void;
};

export function CatalogueItemZoom({ item, fields, token, style, onClose }: Props) {
  const [urls, setUrls] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setActiveIndex(0);
    setFullscreen(false);
    void Promise.all(
      (item.images ?? []).map((img) =>
        apiCatalogViewPresignedUrl(token, img.image_s3_key).catch(() => ""),
      ),
    ).then((loaded) => {
      if (!cancelled) setUrls(loaded.filter(Boolean));
    });
    return () => {
      cancelled = true;
    };
  }, [item, token]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (fullscreen) setFullscreen(false);
        else onClose();
      }
      if (e.key === "ArrowRight" && urls.length > 1) {
        setActiveIndex((i) => (i + 1) % urls.length);
      }
      if (e.key === "ArrowLeft" && urls.length > 1) {
        setActiveIndex((i) => (i - 1 + urls.length) % urls.length);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen, onClose, urls.length]);

  const visibleFields = fields.filter((f) => f.show_on_buyer);
  const activeUrl = urls[activeIndex];

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
        style={{
          background: style.isDark ? "rgba(0,0,0,0.72)" : "rgba(20,16,12,0.45)",
          backdropFilter: "blur(16px)",
        }}
        onClick={onClose}
        role="dialog"
        aria-modal="true"
      >
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: `radial-gradient(ellipse 50% 40% at 50% 40%, ${style.accentSoft}, transparent 70%)`,
          }}
          aria-hidden
        />

        <div
          className="relative grid max-h-[92vh] w-full max-w-5xl overflow-hidden lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]"
          style={{
            background: style.panelGradient,
            color: style.text,
            borderRadius: `calc(${style.cardRadius} + 0.25rem)`,
            border: `1px solid ${style.border}`,
            fontFamily: style.bodyFont,
            boxShadow: `${style.cardShadow}, 0 0 80px ${style.accentSoft}`,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="pointer-events-none absolute inset-x-0 top-0 z-20 h-px"
            style={{ background: style.hairlineGradient }}
          />

          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 z-30 flex h-9 w-9 items-center justify-center rounded-full transition hover:scale-105"
            style={{
              background: style.surfaceGradient,
              color: style.text,
              border: `1px solid ${style.border}`,
              boxShadow: `0 0 20px ${style.accentSoft}`,
            }}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>

          <div
            className="relative flex min-h-[40vh] flex-col items-center justify-center p-5 sm:p-8 lg:min-h-[72vh]"
            style={{
              background: `radial-gradient(ellipse 70% 60% at 50% 45%, ${style.accentSoft}, transparent 65%), ${style.background}`,
            }}
          >
            {activeUrl ? (
              <button
                type="button"
                className="group relative w-full max-w-md outline-none"
                onClick={() => setFullscreen(true)}
                title="View fullscreen"
              >
                <CatalogueGradientFrame style={style}>
                  <div className="relative w-full" style={{ aspectRatio: "2 / 3" }}>
                    <img
                      src={activeUrl}
                      alt={item.name}
                      className="h-full w-full object-contain p-2 transition duration-500 group-hover:scale-[1.02]"
                    />
                    <span
                      className="pointer-events-none absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] opacity-0 transition group-hover:opacity-100"
                      style={{
                        background: style.buttonGradient,
                        color: style.background,
                        boxShadow: `0 8px 24px ${style.accentSoft}`,
                      }}
                    >
                      <Maximize2 className="h-3 w-3" /> Fullscreen
                    </span>
                  </div>
                </CatalogueGradientFrame>
              </button>
            ) : (
              <div
                className="aspect-[2/3] w-full max-w-md animate-pulse"
                style={{ background: style.border, borderRadius: style.cardRadius }}
              />
            )}

            {urls.length > 1 ? (
              <div className="mt-5 flex items-center gap-3">
                <button
                  type="button"
                  className="flex h-9 w-9 items-center justify-center rounded-full"
                  style={{
                    background: style.surfaceGradient,
                    border: `1px solid ${style.border}`,
                  }}
                  onClick={() => setActiveIndex((i) => (i - 1 + urls.length) % urls.length)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div className="flex gap-1.5">
                  {urls.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      className="h-1.5 rounded-full transition-all"
                      style={{
                        width: i === activeIndex ? "1.4rem" : "0.4rem",
                        background: i === activeIndex ? style.accent : style.border,
                        boxShadow: i === activeIndex ? `0 0 12px ${style.accentGlow}` : undefined,
                      }}
                      onClick={() => setActiveIndex(i)}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  className="flex h-9 w-9 items-center justify-center rounded-full"
                  style={{
                    background: style.surfaceGradient,
                    border: `1px solid ${style.border}`,
                  }}
                  onClick={() => setActiveIndex((i) => (i + 1) % urls.length)}
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            ) : null}

            {urls.length > 1 ? (
              <div className="mt-4 flex max-w-md gap-2 overflow-x-auto pb-1">
                {urls.map((url, i) => (
                  <button
                    key={url}
                    type="button"
                    onClick={() => setActiveIndex(i)}
                    className="h-14 w-[2.333rem] shrink-0 overflow-hidden p-[1px]"
                    style={{
                      aspectRatio: "2 / 3",
                      borderRadius: style.cardRadius,
                      background: i === activeIndex ? style.cardBorderGradient : style.border,
                    }}
                  >
                    <div
                      className="h-full w-full overflow-hidden"
                      style={{
                        borderRadius: `calc(${style.cardRadius} - 1px)`,
                        background: style.surface,
                      }}
                    >
                      <img src={url} alt="" className="h-full w-full object-contain" />
                    </div>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div
            className="flex flex-col overflow-y-auto border-t p-6 sm:p-9 lg:border-l lg:border-t-0"
            style={{
              borderColor: style.border,
              background: style.surfaceGradient,
            }}
          >
            <p
              className="text-[11px] uppercase tracking-[0.32em]"
              style={{ color: style.accent }}
            >
              {item.item_code}
            </p>
            <h2
              className="mt-2 text-3xl leading-tight sm:text-4xl"
              style={{ fontFamily: style.displayFont, fontWeight: 500, color: style.text }}
            >
              {item.name}
            </h2>
            <CatalogueHairline style={style} className="mt-5 max-w-[6rem]" />
            {item.description ? (
              <p className="mt-5 text-sm leading-relaxed" style={{ color: style.muted }}>
                {item.description}
              </p>
            ) : null}

            <div className="mt-8 space-y-0">
              {visibleFields.map((field) => {
                const raw = item.custom_fields?.[field.key];
                if (raw == null || raw === "") return null;
                const display = Array.isArray(raw) ? raw.join(", ") : String(raw);
                return (
                  <div
                    key={field.uid}
                    className="grid grid-cols-[1fr_1.2fr] gap-4 border-b py-3.5 text-sm"
                    style={{ borderColor: style.border }}
                  >
                    <dt className="text-[11px] uppercase tracking-[0.16em]" style={{ color: style.muted }}>
                      {field.label}
                    </dt>
                    <dd className="text-right font-medium">{display}</dd>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {fullscreen && activeUrl ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center"
          style={{
            background: `radial-gradient(ellipse 60% 50% at 50% 50%, ${style.accentSoft}, #000 70%)`,
          }}
          onClick={() => setFullscreen(false)}
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full text-white backdrop-blur"
            style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)" }}
            onClick={() => setFullscreen(false)}
            aria-label="Close fullscreen"
          >
            <X className="h-5 w-5" />
          </button>
          {urls.length > 1 ? (
            <>
              <button
                type="button"
                className="absolute left-3 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-white backdrop-blur sm:left-6"
                style={{ background: "rgba(255,255,255,0.12)" }}
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveIndex((i) => (i - 1 + urls.length) % urls.length);
                }}
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                type="button"
                className="absolute right-3 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-white backdrop-blur sm:right-6"
                style={{ background: "rgba(255,255,255,0.12)" }}
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveIndex((i) => (i + 1) % urls.length);
                }}
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          ) : null}
          <img
            src={activeUrl}
            alt={item.name}
            className="max-h-[96vh] max-w-[96vw] object-contain drop-shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}
    </>
  );
}
