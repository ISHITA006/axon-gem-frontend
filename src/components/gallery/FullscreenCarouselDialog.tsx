import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Download, Gem, Loader2, Pencil, SlidersHorizontal } from "lucide-react";
import type { ManualEditTool } from "@/components/ManualPhotoEditor";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { downloadMedia, getPresignedUrl } from "@/lib/api";
import { cn } from "@/lib/utils";

type ImageCarouselProps = {
  token: string | null;
  title: string;
  s3Keys: string[];
  captions?: Record<string, string>;
  startIndex?: number;
  active?: boolean;
  imageStageClassName?: string;
  onManualPhotoEdit?: (s3Key: string, imageUrl: string, initialTool?: ManualEditTool) => void;
  onEditImage?: (s3Key: string, imageUrl: string) => void;
  onOpenTryOnWithJewellery?: (s3Key: string, imageUrl: string) => void;
};

export function ImageCarouselStage({
  token,
  title,
  s3Keys,
  captions,
  startIndex = 0,
  active = true,
  imageStageClassName = "h-[min(78vh,48rem)]",
  onManualPhotoEdit,
  onEditImage,
  onOpenTryOnWithJewellery,
}: ImageCarouselProps) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const safeStart = Math.min(Math.max(startIndex, 0), Math.max(0, s3Keys.length - 1));
  const [idx, setIdx] = useState(safeStart);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!active) return;
    setIdx(safeStart);
  }, [active, safeStart]);

  const currentKey = s3Keys[idx] ?? null;
  const currentCaption = currentKey && captions?.[currentKey] ? captions[currentKey] : null;
  const urlQuery = useQuery({
    queryKey: ["presigned-url", token, currentKey],
    enabled: Boolean(active && token && currentKey),
    queryFn: () => getPresignedUrl(token!, currentKey!),
    staleTime: 3 * 60 * 1000,
  });

  const prevKey = idx > 0 ? s3Keys[idx - 1] : null;
  const nextKey = idx < s3Keys.length - 1 ? s3Keys[idx + 1] : null;
  if (active && token && prevKey) {
    qc.prefetchQuery({
      queryKey: ["presigned-url", token, prevKey],
      queryFn: () => getPresignedUrl(token, prevKey),
      staleTime: 3 * 60 * 1000,
    }).catch(() => null);
  }
  if (active && token && nextKey) {
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
      anchor.download = currentKey.split("/").pop() || "image";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast({
        title: "Download failed",
        description: "Could not download this image.",
        variant: "destructive",
      });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div>
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
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              if (currentKey && urlQuery.data && onManualPhotoEdit) {
                onManualPhotoEdit(currentKey, urlQuery.data);
              }
            }}
            className="h-8 gap-2 rounded-md bg-background/80 px-2.5 shadow hover:bg-background disabled:opacity-50"
            title="Manual photo editing"
            disabled={!currentKey || !urlQuery.data || !onManualPhotoEdit}
          >
            <SlidersHorizontal className="h-4 w-4 text-foreground" />
            <span className="text-xs font-medium text-foreground">Manual edit</span>
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
          {title === "Edited Images" && (
            <Button
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
            </Button>
          )}
        </div>
      </div>

      <div className="mt-3 overflow-hidden rounded-lg border bg-muted/20">
        <div className="flex items-center justify-between gap-2 border-b bg-background/60 px-3 py-2 text-sm">
          <div className="text-muted-foreground">
            {s3Keys.length ? (
              <span>
                Image <span className="font-medium text-foreground">{idx + 1}</span> / {s3Keys.length}
                {currentCaption ? (
                  <span>
                    {" "}
                    · <span className="font-medium text-foreground">{currentCaption}</span>
                  </span>
                ) : null}
              </span>
            ) : (
              <span>0 / 0</span>
            )}
          </div>
        </div>

        <div className={cn("relative flex items-center justify-center bg-black/5", imageStageClassName)}>
          {!currentKey ? (
            <div className="text-sm text-muted-foreground">No image</div>
          ) : urlQuery.isPending ? (
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          ) : urlQuery.isError || !urlQuery.data ? (
            <div className="text-sm text-destructive">Failed to load image</div>
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
    </div>
  );
}

export function FullscreenCarouselDialog({
  open,
  onOpenChange,
  token,
  title,
  s3Keys,
  captions,
  startIndex,
  onManualPhotoEdit,
  onEditImage,
  onOpenTryOnWithJewellery,
}: ImageCarouselProps & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  startIndex: number;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="max-h-[96vh] w-[min(98vw,90rem)] max-w-[min(98vw,90rem)] p-3 sm:p-5">
        <ImageCarouselStage
          token={token}
          title={title}
          s3Keys={s3Keys}
          captions={captions}
          startIndex={startIndex}
          active={open}
          imageStageClassName="h-[min(82vh,calc(96vh-7rem))]"
          onManualPhotoEdit={onManualPhotoEdit}
          onEditImage={onEditImage}
          onOpenTryOnWithJewellery={onOpenTryOnWithJewellery}
        />
      </DialogContent>
    </Dialog>
  );
}
