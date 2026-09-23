import { useEffect, useRef, useState } from "react";
import { Loader2, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { apiTrimVideo, getPresignedUrl } from "@/lib/api";

const MIN_CLIP_S = 0.5;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00.0";
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  const whole = Math.floor(s);
  const tenths = Math.floor((s - whole) * 10);
  return `${m}:${String(whole).padStart(2, "0")}.${tenths}`;
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  sourceS3Key: string;
  /** Optional preloaded URL; otherwise resolved via presigned URL. */
  videoUrl?: string | null;
  onTrimmed: (result: { videoS3Key: string; previewUrl?: string }) => void;
};

export function VideoTrimDialog({
  open,
  onOpenChange,
  token,
  sourceS3Key,
  videoUrl: videoUrlProp,
  onTrimmed,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const rangeRef = useRef<[number, number]>([0, 0]);
  const playingRef = useRef(false);
  const [resolvedUrl, setResolvedUrl] = useState<string>("");
  const [loadingUrl, setLoadingUrl] = useState(false);
  const [duration, setDuration] = useState(0);
  const [range, setRange] = useState<[number, number]>([0, 0]);
  const [currentTime, setCurrentTime] = useState(0);
  const [playingSelection, setPlayingSelection] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  rangeRef.current = range;
  playingRef.current = playingSelection;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    setPlayingSelection(false);
    setDuration(0);
    setRange([0, 0]);
    setCurrentTime(0);
    setResolvedUrl("");

    void (async () => {
      if (videoUrlProp) {
        if (!cancelled) setResolvedUrl(videoUrlProp);
        return;
      }
      setLoadingUrl(true);
      try {
        const url = await getPresignedUrl(token, sourceS3Key);
        if (!cancelled) setResolvedUrl(url);
      } catch {
        if (!cancelled) setError("Could not load video for trimming.");
      } finally {
        if (!cancelled) setLoadingUrl(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, sourceS3Key, token, videoUrlProp]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !open || !resolvedUrl) return;

    const onLoaded = () => {
      const d = Number.isFinite(el.duration) ? el.duration : 0;
      setDuration(d);
      setRange([0, d]);
      el.currentTime = 0;
    };
    const onTime = () => {
      setCurrentTime(el.currentTime);
      const [, end] = rangeRef.current;
      if (playingRef.current && el.currentTime >= end - 0.04) {
        el.pause();
        el.currentTime = rangeRef.current[0];
        setPlayingSelection(false);
      }
    };
    const onEnded = () => setPlayingSelection(false);

    el.addEventListener("loadedmetadata", onLoaded);
    el.addEventListener("durationchange", onLoaded);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("ended", onEnded);
    if (el.readyState >= 1) onLoaded();

    return () => {
      el.removeEventListener("loadedmetadata", onLoaded);
      el.removeEventListener("durationchange", onLoaded);
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("ended", onEnded);
    };
  }, [open, resolvedUrl]);

  const clipDuration = Math.max(0, range[1] - range[0]);
  const canApply = duration > 0 && clipDuration >= MIN_CLIP_S && !saving;

  const onRangeChange = (values: number[]) => {
    if (values.length < 2 || duration <= 0) return;
    let start = Math.max(0, Math.min(values[0], values[1]));
    let end = Math.min(duration, Math.max(values[0], values[1]));
    if (end - start < MIN_CLIP_S) {
      if (Math.abs(values[0] - range[0]) >= Math.abs(values[1] - range[1])) {
        start = Math.min(start, Math.max(0, duration - MIN_CLIP_S));
        end = Math.min(duration, start + MIN_CLIP_S);
      } else {
        end = Math.max(end, MIN_CLIP_S);
        start = Math.max(0, end - MIN_CLIP_S);
      }
    }
    setRange([start, end]);
    const el = videoRef.current;
    if (el && !playingRef.current) {
      el.currentTime = start;
    }
  };

  const togglePlaySelection = () => {
    const el = videoRef.current;
    if (!el) return;
    if (playingSelection) {
      el.pause();
      setPlayingSelection(false);
      return;
    }
    el.currentTime = range[0];
    void el
      .play()
      .then(() => setPlayingSelection(true))
      .catch(() => setPlayingSelection(false));
  };

  const handleApply = async () => {
    if (!canApply) return;
    setSaving(true);
    setError(null);
    try {
      const result = await apiTrimVideo(token, {
        sourceS3Key,
        startSeconds: range[0],
        endSeconds: range[1],
      });
      onTrimmed({ videoS3Key: result.videoS3Key, previewUrl: result.previewUrl });
      onOpenChange(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not trim video");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Trim video</DialogTitle>
          <DialogDescription>
            Drag the handles to choose the portion to keep, preview it, then apply.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative aspect-video w-full overflow-hidden rounded-md bg-black">
            {loadingUrl ? (
              <div className="flex h-full items-center justify-center text-white/80">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : resolvedUrl ? (
              <video
                ref={videoRef}
                key={resolvedUrl}
                src={resolvedUrl}
                className="h-full w-full object-contain"
                playsInline
                preload="metadata"
                controls={false}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-white/70">
                {error || "No video"}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3 text-sm">
              <Label>Selection</Label>
              <span className="font-mono text-muted-foreground">
                {formatTime(range[0])} – {formatTime(range[1])} ({formatTime(clipDuration)})
              </span>
            </div>
            <Slider
              min={0}
              max={Math.max(duration, MIN_CLIP_S)}
              step={0.05}
              value={range}
              onValueChange={onRangeChange}
              disabled={!duration || saving}
              className="py-2"
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Playhead {formatTime(currentTime)}</span>
              <span>Full length {formatTime(duration)}</span>
            </div>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            onClick={togglePlaySelection}
            disabled={!duration || saving}
          >
            {playingSelection ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {playingSelection ? "Pause" : "Preview clip"}
          </Button>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleApply()} disabled={!canApply}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Apply trim
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
