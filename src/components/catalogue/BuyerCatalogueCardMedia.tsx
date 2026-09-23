import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiCatalogViewPresignedUrl, isVideoS3Key, type CatalogueItem } from "@/lib/api";

type MediaEntry = { key: string; url: string };

type Props = {
  item: CatalogueItem;
  token: string;
  /** Preloaded primary URL (still preferred) so cards paint quickly. */
  primaryUrl?: string;
};

/**
 * Grid-card media: idle shows the first still (or first media).
 * On hover, cycles through every image/video. Videos autoplay muted with no controls.
 */
export function BuyerCatalogueCardMedia({ item, token, primaryUrl }: Props) {
  const keys = useMemo(
    () => (item.images ?? []).map((img) => img.image_s3_key).filter(Boolean),
    [item.images],
  );
  const primaryKey = keys.find((k) => !isVideoS3Key(k)) ?? keys[0] ?? "";
  const keysSignature = keys.join("|");

  const [media, setMedia] = useState<MediaEntry[]>(() =>
    primaryUrl && primaryKey ? [{ key: primaryKey, url: primaryUrl }] : [],
  );
  const [index, setIndex] = useState(0);
  const [hovering, setHovering] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const loadedRef = useRef(false);
  const cycleTimerRef = useRef<number | null>(null);

  const clearCycle = useCallback(() => {
    if (cycleTimerRef.current != null) {
      window.clearTimeout(cycleTimerRef.current);
      cycleTimerRef.current = null;
    }
  }, []);

  const ensureAllMedia = useCallback(async (): Promise<MediaEntry[]> => {
    if (!token || keys.length === 0) return media;
    if (loadedRef.current && media.length >= keys.length) return media;
    loadedRef.current = true;
    const loaded = await Promise.all(
      keys.map(async (key) => {
        try {
          const url = await apiCatalogViewPresignedUrl(token, key);
          return { key, url };
        } catch {
          return null;
        }
      }),
    );
    const next = loaded.filter((m): m is MediaEntry => Boolean(m?.url));
    if (next.length) setMedia(next);
    return next;
  }, [token, keys, keysSignature, media]);

  // Keep primary in sync when parent finishes loading
  useEffect(() => {
    if (!primaryUrl || !primaryKey) return;
    setMedia((prev) => {
      if (prev.some((m) => m.key === primaryKey && m.url === primaryUrl)) return prev;
      if (prev.length === 0) return [{ key: primaryKey, url: primaryUrl }];
      return prev.map((m) => (m.key === primaryKey ? { ...m, url: primaryUrl } : m));
    });
  }, [primaryUrl, primaryKey]);

  // Reset when the item's media list changes
  useEffect(() => {
    loadedRef.current = false;
    setIndex(0);
    setHovering(false);
  }, [item.uid, keysSignature]);

  const advance = useCallback(() => {
    setIndex((i) => {
      const len = media.length;
      if (len <= 1) return 0;
      return (i + 1) % len;
    });
  }, [media.length]);

  // While hovering: stills advance on a timer; videos advance when they end.
  useEffect(() => {
    clearCycle();
    if (!hovering || media.length <= 1) return;

    const current = media[index];
    if (!current) return;

    if (isVideoS3Key(current.key)) {
      const el = videoRef.current;
      if (el) {
        el.currentTime = 0;
        void el.play().catch(() => undefined);
      }
      return;
    }

    cycleTimerRef.current = window.setTimeout(advance, 1400);
    return clearCycle;
  }, [hovering, index, media, advance, clearCycle]);

  useEffect(() => () => clearCycle(), [clearCycle]);

  const onEnter = () => {
    setHovering(true);
    void ensureAllMedia().then((list) => {
      if (list.length > 1) setIndex(1);
    });
  };

  const onLeave = () => {
    setHovering(false);
    clearCycle();
    setIndex(0);
    const el = videoRef.current;
    if (el) {
      el.pause();
      el.currentTime = 0;
    }
  };

  const current = media[index] ?? media[0];
  const isVideo = current ? isVideoS3Key(current.key) : false;

  return (
    <div
      className="absolute inset-0"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
    >
      {current?.url ? (
        isVideo ? (
          <video
            key={current.key}
            ref={videoRef}
            src={current.url}
            className="relative z-[1] h-full w-full object-cover pointer-events-none"
            muted
            playsInline
            autoPlay={hovering}
            preload="auto"
            controls={false}
            disablePictureInPicture
            controlsList="nodownload noplaybackrate noremoteplayback"
            onContextMenu={(e) => e.preventDefault()}
            onEnded={() => {
              if (hovering && media.length > 1) advance();
              else if (hovering && media.length === 1 && videoRef.current) {
                videoRef.current.currentTime = 0;
                void videoRef.current.play().catch(() => undefined);
              }
            }}
          />
        ) : (
          <img
            key={current.key}
            src={current.url}
            alt={item.name}
            className="relative z-[1] h-full w-full object-cover transition duration-500 ease-out"
            draggable={false}
          />
        )
      ) : (
        <div className="h-full w-full animate-pulse bg-black/10" />
      )}

      {hovering && media.length > 1 ? (
        <div className="pointer-events-none absolute bottom-3 left-1/2 z-[3] flex -translate-x-1/2 gap-1">
          {media.map((_, i) => (
            <span
              key={i}
              className="h-1 rounded-full transition-all"
              style={{
                width: i === index ? 14 : 5,
                background: i === index ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.35)",
              }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
