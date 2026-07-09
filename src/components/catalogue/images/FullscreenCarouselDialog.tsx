import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Download, Gem, Loader2, Palette, Pencil, Scissors, Video } from "lucide-react";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { downloadMedia, getPresignedUrl } from "@/lib/api";

export function FullscreenCarouselDialog({
  open,
  onOpenChange,
  token,
  title,
  s3Keys,
  startIndex,
  isVideo = false,
  onChangeProductColour,
  onChangeProductLength,
  onEditImage,
  onEditVideo,
  onOpenTryOnWithJewellery,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string | null;
  title: string;
  s3Keys: string[];
  startIndex: number;
  isVideo?: boolean;
  onChangeProductColour?: (s3Key: string, imageUrl: string) => void;
  onChangeProductLength?: (s3Key: string, imageUrl: string) => void;
  onEditImage?: (s3Key: string, imageUrl: string) => void;
  onEditVideo?: (s3Key: string, imageUrl: string) => void;
  onOpenTryOnWithJewellery?: (s3Key: string, imageUrl: string) => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [idx, setIdx] = useState(0);
  const [downloading, setDownloading] = useState(false);

  const safeStart = Math.min(Math.max(startIndex, 0), Math.max(0, s3Keys.length - 1));

  useEffect(() => {
    if (!open) return;
    setIdx(safeStart);
  }, [open, safeStart]);

  const currentKey = s3Keys[idx] ?? null;
  const urlQuery = useQuery({
    queryKey: ["presigned-url", token, currentKey],
    enabled: Boolean(open && token && currentKey),
    queryFn: () => getPresignedUrl(token!, currentKey!),
    staleTime: 3 * 60 * 1000,
  });

  const prevKey = idx > 0 ? s3Keys[idx - 1] : null;
  const nextKey = idx < s3Keys.length - 1 ? s3Keys[idx + 1] : null;
  if (open && token && prevKey) {
    qc.prefetchQuery({
      queryKey: ["presigned-url", token, prevKey],
      queryFn: () => getPresignedUrl(token, prevKey),
      staleTime: 3 * 60 * 1000,
    }).catch(() => null);
  }
  if (open && token && nextKey) {
    qc.prefetchQuery({
      queryKey: ["presigned-url", token, nextKey],
      queryFn: () => getPresignedUrl(token, nextKey),
      staleTime: 3 * 60 * 1000,
    }).catch(() => null);
  }

  const canPrev = idx > 0;
  const canNext = idx < s3Keys.length - 1;

  const handleDownload = async () => {
    if (!token || !currentKey) return;
    setDownloading(true);
    try {
      const blob = await downloadMedia(token, currentKey);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      const baseName = currentKey.split("/").pop() || (isVideo ? "video" : "image");
      if (isVideo) {
        const dotIndex = baseName.lastIndexOf(".");
        const withoutExt = dotIndex > 0 ? baseName.slice(0, dotIndex) : baseName;
        anchor.download = `${withoutExt || "video"}.mp4`;
      } else {
        anchor.download = baseName;
      }
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast({
        title: "Download failed",
        description: `Could not download this ${isVideo ? "video" : "image"}.`,
        variant: "destructive",
      });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (v) setIdx(safeStart);
      }}
    >
      <DialogContent className="max-w-[min(96vw,70rem)] p-3 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="text-base font-semibold">{title}</div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void handleDownload()}
              className="h-8 gap-2 rounded-md bg-background/80 px-2.5 shadow hover:bg-background disabled:opacity-50"
              title="Download image"
              disabled={!token || !currentKey || downloading}
            >
              {downloading ? <Loader2 className="h-4 w-4 animate-spin text-foreground" /> : <Download className="h-4 w-4 text-foreground" />}
              <span className="text-xs font-medium text-foreground">Download</span>
            </Button>
            {!isVideo && <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                if (currentKey && urlQuery.data && onChangeProductColour) {
                  onChangeProductColour(currentKey, urlQuery.data);
                }
              }}
              className="h-8 gap-2 rounded-md bg-background/80 px-2.5 shadow hover:bg-background disabled:opacity-50"
              title="Change colour"
              disabled={!currentKey || !urlQuery.data || !onChangeProductColour}
            >
              <Palette className="h-4 w-4 text-foreground" />
              <span className="text-xs font-medium text-foreground">Change colour</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                if (currentKey && urlQuery.data && onChangeProductLength) {
                  onChangeProductLength(currentKey, urlQuery.data);
                }
              }}
              className="h-8 gap-2 rounded-md bg-background/80 px-2.5 shadow hover:bg-background disabled:opacity-50"
              title="Change length"
              disabled={!currentKey || !urlQuery.data || !onChangeProductLength}
            >
              <Scissors className="h-4 w-4 text-foreground" />
              <span className="text-xs font-medium text-foreground">Change length</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                if (currentKey && urlQuery.data && onEditImage) {
                  onEditImage(currentKey, urlQuery.data);
                }
              }}
              className="h-8 gap-2 rounded-md bg-background/80 px-2.5 shadow hover:bg-background disabled:opacity-50"
              title="Edit image"
              disabled={!currentKey || !urlQuery.data || !onEditImage}
            >
              <Pencil className="h-4 w-4 text-foreground" />
              <span className="text-xs font-medium text-foreground">Edit image</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                if (currentKey && urlQuery.data && onEditVideo) {
                  onEditVideo(currentKey, urlQuery.data);
                }
              }}
              className="h-8 gap-2 rounded-md bg-background/80 px-2.5 shadow hover:bg-background disabled:opacity-50"
              title="Edit video"
              disabled={!currentKey || !urlQuery.data || !onEditVideo}
            >
              <Video className="h-4 w-4 text-foreground" />
              <span className="text-xs font-medium text-foreground">Create video</span>
            </Button>
            {(title === "Modified Product Images" || title === "Edited Images" || title === "Generated Designs") && <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                if (currentKey && urlQuery.data && onOpenTryOnWithJewellery) {
                  onOpenTryOnWithJewellery(currentKey, urlQuery.data);
                }
              }}
              className="h-8 gap-2 rounded-md bg-background/80 px-2.5 shadow hover:bg-background disabled:opacity-50"
              title="Model try-on"
              disabled={!currentKey || !urlQuery.data || !onOpenTryOnWithJewellery}
            >
              <Gem className="h-4 w-4 text-foreground" />
              <span className="text-xs font-medium text-foreground">Model try-on</span>
            </Button>}
            </>}
          </div>
        </div>

        <div className="mt-3 overflow-hidden rounded-lg border bg-muted/20">
          <div className="flex items-center justify-between gap-2 border-b bg-background/60 px-3 py-2 text-sm">
            <div className="text-muted-foreground">
              {s3Keys.length ? (
                <span>
                  {isVideo ? "Video" : "Image"} <span className="font-medium text-foreground">{idx + 1}</span> / {s3Keys.length}
                </span>
              ) : (
                <span>0 / 0</span>
              )}
            </div>
          </div>

          <div className="relative flex h-[72vh] items-center justify-center bg-black/5">
            {!currentKey ? (
              <div className="text-sm text-muted-foreground">{isVideo ? "No video" : "No image"}</div>
            ) : urlQuery.isPending ? (
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            ) : urlQuery.isError || !urlQuery.data ? (
              <div className="text-sm text-destructive">Failed to load {isVideo ? "video" : "image"}</div>
            ) : isVideo ? (
              <video
                key={urlQuery.data}
                src={urlQuery.data}
                controls
                playsInline
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <img src={urlQuery.data} alt="" className="max-h-full max-w-full object-contain" />
            )}

            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="absolute left-3 top-1/2 -translate-y-1/2"
              disabled={!canPrev}
              onClick={() => setIdx((i) => Math.max(0, i - 1))}
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="absolute right-3 top-1/2 -translate-y-1/2"
              disabled={!canNext}
              onClick={() => setIdx((i) => Math.min(s3Keys.length - 1, i + 1))}
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

