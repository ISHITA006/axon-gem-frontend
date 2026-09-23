import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Maximize2, Volume2, VolumeX, X } from "lucide-react";
import type { CatalogueFieldDefinition, CatalogueItem } from "@/lib/api";
import { apiCatalogViewPresignedUrl, isVideoS3Key } from "@/lib/api";
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

function AutoPlayMedia({
  url,
  s3Key,
  className,
  onEnded,
  alt,
  loop,
  muted,
  onAutoMute,
}: {
  url: string;
  s3Key: string | undefined;
  className: string;
  onEnded?: () => void;
  alt: string;
  loop?: boolean;
  /** Modal/fullscreen play with sound; falls back to muted if browser blocks it. */
  muted: boolean;
  onAutoMute?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const onAutoMuteRef = useRef(onAutoMute);
  const mutedRef = useRef(muted);
  onAutoMuteRef.current = onAutoMute;
  mutedRef.current = muted;

  useEffect(() => {
    if (!isVideoS3Key(s3Key)) return;
    const el = videoRef.current;
    if (!el) return;
    el.muted = mutedRef.current;
    el.currentTime = 0;
    void el.play().catch(() => {
      if (!el.muted) {
        el.muted = true;
        onAutoMuteRef.current?.();
        void el.play().catch(() => undefined);
      }
    });
  }, [url, s3Key]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !isVideoS3Key(s3Key)) return;
    el.muted = muted;
    if (el.paused) void el.play().catch(() => undefined);
  }, [muted, s3Key]);

  if (isVideoS3Key(s3Key)) {
    return (
      <video
        ref={videoRef}
        key={url}
        src={url}
        className={`${className} pointer-events-none`}
        muted={muted}
        playsInline
        autoPlay
        loop={loop}
        preload="auto"
        controls={false}
        disablePictureInPicture
        controlsList="nodownload noplaybackrate noremoteplayback"
        onContextMenu={(e) => e.preventDefault()}
        onEnded={loop ? undefined : onEnded}
      />
    );
  }

  return <img src={url} alt={alt} className={className} draggable={false} />;
}

function MuteToggle({
  muted,
  onToggle,
  className = "",
}: {
  muted: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`flex h-9 w-9 items-center justify-center rounded-full text-white transition hover:scale-105 ${className}`}
      style={{ background: "rgba(0,0,0,0.45)", border: "1px solid rgba(255,255,255,0.25)" }}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      aria-label={muted ? "Unmute video" : "Mute video"}
    >
      {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
    </button>
  );
}

export function CatalogueItemZoom({ item, fields, token, style, onClose }: Props) {
  const [urls, setUrls] = useState<string[]>([]);
  const [keys, setKeys] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [videoMuted, setVideoMuted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setActiveIndex(0);
    setFullscreen(false);
    setVideoMuted(false);
    const mediaKeys = (item.images ?? []).map((img) => img.image_s3_key);
    setKeys(mediaKeys);
    void Promise.all(
      mediaKeys.map((key) => apiCatalogViewPresignedUrl(token, key).catch(() => "")),
    ).then((loaded) => {
      if (!cancelled) setUrls(loaded);
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
        setVideoMuted(false);
        setActiveIndex((i) => (i + 1) % urls.length);
      }
      if (e.key === "ArrowLeft" && urls.length > 1) {
        setVideoMuted(false);
        setActiveIndex((i) => (i - 1 + urls.length) % urls.length);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen, onClose, urls.length]);

  const visibleFields = fields.filter((f) => f.show_on_buyer);
  const activeUrl = urls[activeIndex];
  const activeKey = keys[activeIndex];
  const activeIsVideo = isVideoS3Key(activeKey);
  const mediaCount = urls.filter(Boolean).length;

  const goNext = () => {
    setVideoMuted(false);
    setActiveIndex((i) => (i + 1) % Math.max(urls.length, 1));
  };
  const goPrev = () => {
    setVideoMuted(false);
    setActiveIndex((i) => (i - 1 + urls.length) % Math.max(urls.length, 1));
  };

  const onVideoEnded = () => {
    if (mediaCount > 1) goNext();
  };

  const toggleMute = () => setVideoMuted((m) => !m);

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
        style={{
          background: style.isDark ? "rgba(0,0,0,0.78)" : "rgba(20,16,12,0.55)",
        }}
        onClick={onClose}
        role="dialog"
        aria-modal="true"
      >
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
              background: style.background,
            }}
          >
            {activeUrl ? (
              <div className="group relative w-full max-w-md">
                <CatalogueGradientFrame style={style} shine={false}>
                  <div className="relative w-full overflow-hidden" style={{ aspectRatio: "2 / 3" }}>
                    {fullscreen ? (
                      <div className="absolute inset-0 bg-black/80" />
                    ) : (
                      <AutoPlayMedia
                        url={activeUrl}
                        s3Key={activeKey}
                        alt={item.name}
                        className="absolute inset-0 h-full w-full object-cover"
                        onEnded={onVideoEnded}
                        loop={mediaCount <= 1}
                        muted={videoMuted}
                        onAutoMute={() => setVideoMuted(true)}
                      />
                    )}
                    <button
                      type="button"
                      className="absolute inset-0 z-[1] outline-none"
                      onClick={() => setFullscreen(true)}
                      title="View fullscreen"
                      aria-label="View fullscreen"
                    />
                    {activeIsVideo && !fullscreen ? (
                      <div className="absolute bottom-3 right-3 z-[2]">
                        <MuteToggle muted={videoMuted} onToggle={toggleMute} />
                      </div>
                    ) : !activeIsVideo ? (
                      <span
                        className="pointer-events-none absolute bottom-4 left-1/2 z-[2] flex -translate-x-1/2 items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] opacity-0 transition group-hover:opacity-100"
                        style={{
                          background: style.buttonGradient,
                          color: style.background,
                          boxShadow: `0 8px 24px ${style.accentSoft}`,
                        }}
                      >
                        <Maximize2 className="h-3 w-3" /> Fullscreen
                      </span>
                    ) : null}
                  </div>
                </CatalogueGradientFrame>
              </div>
            ) : (
              <div
                className="aspect-[2/3] w-full max-w-md animate-pulse"
                style={{ background: style.border, borderRadius: style.cardRadius }}
              />
            )}

            {mediaCount > 1 ? (
              <div className="mt-5 flex items-center gap-3">
                <button
                  type="button"
                  className="flex h-9 w-9 items-center justify-center rounded-full"
                  style={{
                    background: style.surfaceGradient,
                    border: `1px solid ${style.border}`,
                  }}
                  onClick={goPrev}
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
                      onClick={() => {
                        setVideoMuted(false);
                        setActiveIndex(i);
                      }}
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
                  onClick={goNext}
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
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
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black"
          onClick={() => setFullscreen(false)}
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full text-white"
            style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)" }}
            onClick={() => setFullscreen(false)}
            aria-label="Close fullscreen"
          >
            <X className="h-5 w-5" />
          </button>
          {mediaCount > 1 ? (
            <>
              <button
                type="button"
                className="absolute left-3 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-white sm:left-6"
                style={{ background: "rgba(255,255,255,0.12)" }}
                onClick={(e) => {
                  e.stopPropagation();
                  goPrev();
                }}
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                type="button"
                className="absolute right-3 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-white sm:right-6"
                style={{ background: "rgba(255,255,255,0.12)" }}
                onClick={(e) => {
                  e.stopPropagation();
                  goNext();
                }}
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          ) : null}
          <div className="relative flex max-h-[96vh] max-w-[96vw] items-center justify-center" onClick={(e) => e.stopPropagation()}>
            <AutoPlayMedia
              url={activeUrl}
              s3Key={activeKey}
              alt={item.name}
              className="max-h-[96vh] max-w-[96vw] object-contain"
              onEnded={onVideoEnded}
              loop={mediaCount <= 1}
              muted={videoMuted}
              onAutoMute={() => setVideoMuted(true)}
            />
            {activeIsVideo ? (
              <div className="absolute bottom-4 right-4 z-10 sm:bottom-6 sm:right-6">
                <MuteToggle muted={videoMuted} onToggle={toggleMute} />
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
