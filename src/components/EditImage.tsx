import { useEffect, useRef, useState } from "react";
import { Download, ImageIcon, Loader2, Palette, Pencil, Scissors, Wand2, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { apiEditImageWithInstructions, downloadImage } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { createDisplayableImageObjectUrl } from "@/lib/heicImage";

type EditImageProps = {
  /** When set, this image is fetched and used as the source file (user does not need to upload). */
  imageUrl?: string | null;
  /**
   * When set with a logged-in `token`, the source file is loaded via your API (`download-image`),
   * avoiding browser CORS issues common with presigned S3 URLs and `fetch(imageUrl)`.
   */
  sourceImageS3Key?: string | null;
  onEditImage?: (s3Key: string, imageUrl: string) => void;
  onChangeColour?: (s3Key: string, imageUrl: string) => void;
  onChangeLength?: (s3Key: string, imageUrl: string) => void;
};

function fileFromImageBlob(blob: Blob): File {
  const mime = blob.type || "image/png";
  const ext = mime.includes("webp")
    ? "webp"
    : mime.includes("gif")
      ? "gif"
      : mime.includes("jpeg") || mime.includes("jpg")
        ? "jpg"
        : "png";
  return new File([blob], `source.${ext}`, { type: mime });
}

export default function EditImage({
  imageUrl,
  sourceImageS3Key,
  onEditImage,
  onChangeColour,
  onChangeLength,
}: EditImageProps) {
  const { token } = useAuth();
  const { toast } = useToast();
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [instructions, setInstructions] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sourcePreview, setSourcePreview] = useState<string | null>(null);
  const [referencePreview, setReferencePreview] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultS3Key, setResultS3Key] = useState<string | null>(null);
  const [resultIsObjectUrl, setResultIsObjectUrl] = useState(false);
  const [isDrawingOnSource, setIsDrawingOnSource] = useState(false);
  const [isSourcePointerDown, setIsSourcePointerDown] = useState(false);
  const sourceInputRef = useRef<HTMLInputElement | null>(null);
  const sourceDrawCanvasRef = useRef<HTMLCanvasElement | null>(null);
  /** When the user picks a file from the input, ignore late completion of a prop-URL fetch. */
  const userChoseLocalSourceRef = useRef(false);

  // Load source from S3 key (API) and/or remote URL. Prefer S3 + `downloadImage` — presigned URLs often fail CORS on `fetch`.
  useEffect(() => {
    const trimmedUrl = imageUrl?.trim() ?? "";
    const s3 = sourceImageS3Key?.trim() ?? "";
    if (!trimmedUrl && !s3) {
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    userChoseLocalSourceRef.current = false;
    setSourceFile(null);
    void (async () => {
      try {
        let blob: Blob;
        if (s3) {
          if (!token) {
            return;
          }
          blob = await downloadImage(token, s3);
        } else {
          const res = await fetch(trimmedUrl, { signal: controller.signal });
          if (!res.ok) {
            throw new Error(`Could not load image (${res.status})`);
          }
          blob = await res.blob();
        }
        if (cancelled || userChoseLocalSourceRef.current) return;
        setSourceFile(fileFromImageBlob(blob));
      } catch (e) {
        if (cancelled || userChoseLocalSourceRef.current) return;
        if (e instanceof DOMException && e.name === "AbortError") return;
        setSourceFile(null);
        toast({
          title: "Could not load image",
          description: e instanceof Error ? e.message : "Failed to load image",
          variant: "destructive",
        });
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [imageUrl, sourceImageS3Key, token, toast]);

  // Preview: object URL for any local `File`, or the remote URL while waiting / if fetch failed but URL still usable in <img>.
  useEffect(() => {
    if (!sourceFile) {
      setSourcePreview(imageUrl?.trim() || null);
      setIsDrawingOnSource(false);
      return;
    }
    let cancelled = false;
    let createdUrl: string | null = null;
    void createDisplayableImageObjectUrl(sourceFile).then((url) => {
      if (cancelled) {
        URL.revokeObjectURL(url);
        return;
      }
      createdUrl = url;
      setSourcePreview(url);
    });
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [sourceFile, imageUrl, sourceImageS3Key]);

  useEffect(() => {
    if (!referenceFile) {
      setReferencePreview(null);
      return;
    }
    let cancelled = false;
    let createdUrl: string | null = null;
    void createDisplayableImageObjectUrl(referenceFile).then((url) => {
      if (cancelled) {
        URL.revokeObjectURL(url);
        return;
      }
      createdUrl = url;
      setReferencePreview(url);
    });
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [referenceFile]);

  const clearResult = () => {
    if (resultUrl && resultIsObjectUrl) {
      URL.revokeObjectURL(resultUrl);
    }
    setResultUrl(null);
    setResultS3Key(null);
    setResultIsObjectUrl(false);
  };

  useEffect(() => {
    return () => {
      if (resultUrl && resultIsObjectUrl) {
        URL.revokeObjectURL(resultUrl);
      }
    };
  }, [resultUrl, resultIsObjectUrl]);

  const handleEdit = async () => {
    if (!token) return;
    if (!sourceFile) {
      toast({
        title: "Source image required",
        description: "Please upload the image you want to edit.",
        variant: "destructive",
      });
      return;
    }
    const trimmed = instructions.trim();
    if (!trimmed) {
      toast({
        title: "Instructions required",
        description: "Please describe how the image should be edited.",
        variant: "destructive",
      });
      return;
    }

    clearResult();
    setSubmitting(true);
    try {
      const data = await apiEditImageWithInstructions(token, {
        editInstructions: trimmed,
        sourceImageFile: sourceFile,
        referenceImageFile: referenceFile,
      });
      const nextUrl = data.previewUrl ?? data.objectUrl;
      if (!nextUrl) {
        throw new Error("No image URL returned from the server");
      }
      setResultUrl(nextUrl);
      setResultS3Key(data.editedImageS3Key ?? null);
      setResultIsObjectUrl(Boolean(data.objectUrl));
      toast({ title: "Image edited", description: "Your edited image is shown below." });
    } catch (err: unknown) {
      toast({
        title: "Edit failed",
        description: err instanceof Error ? err.message : "Could not edit image",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownload = async (filename: string) => {
    if (!token || !resultUrl) return;
    try {
      let blob: Blob;
      if (resultS3Key) {
        blob = await downloadImage(token, resultS3Key);
      } else {
        const res = await fetch(resultUrl);
        if (!res.ok) throw new Error("fetch failed");
        blob = await res.blob();
      }
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch {
      toast({
        title: "Download failed",
        description: "Could not download image",
        variant: "destructive",
      });
    }
  };

  const getSourceCanvasPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = sourceDrawCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const displayedWidth = rect.width;
    const displayedHeight = rect.height;
    if (!displayedWidth || !displayedHeight || !canvas.width || !canvas.height) {
      return null;
    }
    const imageScale = Math.min(displayedWidth / canvas.width, displayedHeight / canvas.height);
    const renderedWidth = canvas.width * imageScale;
    const renderedHeight = canvas.height * imageScale;
    const renderedLeft = (displayedWidth - renderedWidth) / 2;
    const renderedTop = (displayedHeight - renderedHeight) / 2;
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    if (
      localX < renderedLeft ||
      localX > renderedLeft + renderedWidth ||
      localY < renderedTop ||
      localY > renderedTop + renderedHeight
    ) {
      return null;
    }
    const x = ((localX - renderedLeft) / renderedWidth) * canvas.width;
    const y = ((localY - renderedTop) / renderedHeight) * canvas.height;
    return { x, y };
  };

  const drawOnSourceCanvas = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = sourceDrawCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const point = getSourceCanvasPoint(event);
    if (!point) return;
    const { x, y } = point;
    ctx.lineWidth = Math.max(4, Math.round(canvas.width * 0.007));
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#ef4444";
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const startSourceDrawing = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = sourceDrawCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const point = getSourceCanvasPoint(event);
    if (!ctx || !point) return;
    canvas.setPointerCapture(event.pointerId);
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    setIsSourcePointerDown(true);
  };

  const moveSourceDrawing = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isSourcePointerDown) return;
    drawOnSourceCanvas(event);
  };

  const endSourceDrawing = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = sourceDrawCanvasRef.current;
    if (!canvas) return;
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    setIsSourcePointerDown(false);
  };

  const clearSourceDrawing = () => {
    const canvas = sourceDrawCanvasRef.current;
    if (!canvas || !sourcePreview) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const image = new Image();
    image.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    };
    image.src = sourcePreview;
  };

  const saveSourceDrawing = () => {
    const canvas = sourceDrawCanvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      userChoseLocalSourceRef.current = true;
      setSourceFile(fileFromImageBlob(blob));
      setIsDrawingOnSource(false);
    }, "image/png");
  };

  useEffect(() => {
    if (!isDrawingOnSource || !sourcePreview) return;
    const canvas = sourceDrawCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const image = new Image();
    image.onload = () => {
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    };
    image.src = sourcePreview;
  }, [isDrawingOnSource, sourcePreview]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Edit Image</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
      {resultUrl && (
          <div className="space-y-2">
            <Label>Result</Label>
            <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
              <div className="relative">
                <img
                  src={resultUrl}
                  alt="Edited result"
                  className="mx-auto max-h-[min(70vh,32rem)] w-full rounded-lg border object-contain shadow-sm"
                />
                {(onEditImage || onChangeLength || onChangeColour) && resultS3Key ? (
                  <div className="absolute right-2 top-2 flex items-center gap-2">
                    {onEditImage ? (
                      <button
                        type="button"
                        onClick={() => {clearResult(); onEditImage(resultS3Key, resultUrl); }}
                        className="rounded-full bg-background/80 p-1.5 shadow hover:bg-background"
                        title="Edit image"
                      >
                        <Pencil className="h-4 w-4 text-foreground" />
                      </button>
                    ) : null}
                    {onChangeColour ? (
                      <button
                        type="button"
                        onClick={() => onChangeColour(resultS3Key, resultUrl)}
                        className="rounded-full bg-background/80 p-1.5 shadow hover:bg-background"
                        title="Change colour"
                      >
                        <Palette className="h-4 w-4 text-foreground" />
                      </button>
                    ) : null}
                    {onChangeLength ? (
                      <button
                        type="button"
                        onClick={() => onChangeLength(resultS3Key, resultUrl)}
                        className="rounded-full bg-background/80 p-1.5 shadow hover:bg-background"
                        title="Change length"
                      >
                        <Scissors className="h-4 w-4 text-foreground" />
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full gap-2"
                onClick={() => handleDownload("edited-image.png")}
                disabled={!token}
              >
                <Download className="h-4 w-4" /> Download
              </Button>
            </div>
          </div>
        )}
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Source image *</Label>
            <div className="relative rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/20 p-6 transition hover:border-primary/50 hover:bg-muted/40">
              {sourcePreview ? (
                <>
                  {!isDrawingOnSource ? (
                    <img src={sourcePreview} alt="Source preview" className="max-h-56 w-full rounded object-contain" />
                  ) : (
                    <canvas
                      ref={sourceDrawCanvasRef}
                      className="max-h-56 w-full cursor-crosshair rounded object-contain"
                      onPointerDown={startSourceDrawing}
                      onPointerMove={moveSourceDrawing}
                      onPointerUp={endSourceDrawing}
                      onPointerLeave={endSourceDrawing}
                    />
                  )}
                  <div className="absolute right-2 top-2 flex items-center gap-2">
                    {!isDrawingOnSource ? (
                      <button
                        type="button"
                        onClick={() => setIsDrawingOnSource(true)}
                        className="rounded-full bg-background/80 p-1.5 shadow hover:bg-background"
                        title="Draw on source image"
                      >
                        <Pencil className="h-4 w-4 text-foreground" />
                      </button>
                    ) : (
                      <>
                        <Button type="button" variant="secondary" size="sm" onClick={saveSourceDrawing}>
                          Save
                        </Button>
                        <Button type="button" variant="secondary" size="sm" onClick={clearSourceDrawing}>
                          Clear
                        </Button>
                        <button
                          type="button"
                          onClick={() => setIsDrawingOnSource(false)}
                          className="rounded-full bg-background/80 p-1.5 shadow hover:bg-background"
                          title="Cancel drawing"
                        >
                          <X className="h-4 w-4 text-foreground" />
                        </button>
                      </>
                    )}
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  className="flex w-full flex-col items-center justify-center"
                  onClick={() => sourceInputRef.current?.click()}
                >
                  <ImageIcon className="mb-2 h-10 w-10 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Click to upload source image</span>
                </button>
              )}
              <input
                ref={sourceInputRef}
                type="file"
                accept="image/*,.heic,.heif"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  userChoseLocalSourceRef.current = Boolean(f);
                  setSourceFile(f);
                  setIsDrawingOnSource(false);
                  e.target.value = "";
                }}
              />
            </div>
            {sourcePreview && (
              <Button type="button" variant="ghost" size="sm" className="px-0" onClick={() => sourceInputRef.current?.click()}>
                Change source image
              </Button>
            )}
            {sourceFile && (
              <p className="text-xs text-muted-foreground truncate" title={sourceFile.name}>
                {sourceFile.name}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Reference image (optional)</Label>
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/20 p-6 transition hover:border-primary/50 hover:bg-muted/40">
              {referencePreview ? (
                <img src={referencePreview} alt="Reference preview" className="max-h-56 w-full rounded object-contain" />
              ) : (
                <>
                  <ImageIcon className="mb-2 h-10 w-10 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Optional reference for style or content</span>
                </>
              )}
              <input
                type="file"
                accept="image/*,.heic,.heif"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setReferenceFile(f);
                  e.target.value = "";
                }}
              />
            </label>
            <div className="flex items-center justify-between gap-2">
              {referenceFile && (
                <p className="text-xs text-muted-foreground truncate" title={referenceFile.name}>
                  {referenceFile.name}
                </p>
              )}
              {referenceFile && (
                <Button type="button" variant="ghost" size="sm" className="shrink-0" onClick={() => setReferenceFile(null)}>
                  Clear
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="edit-instructions">Edit instructions *</Label>
          <Textarea
            id="edit-instructions"
            placeholder="Describe the changes you want (e.g. change the dress colour to navy blue, remove the logo from the chest…)"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={4}
            className="resize-y min-h-[100px]"
          />
        </div>

        <Button type="button" onClick={handleEdit} disabled={submitting || !token} className="w-full sm:w-auto">
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Editing…
            </>
          ) : (
            <>
              <Wand2 className="mr-2 h-4 w-4" />
              Edit image
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
