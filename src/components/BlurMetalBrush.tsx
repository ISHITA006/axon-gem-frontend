import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Brush, Download, Eraser, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  apiBlurMetalBrush,
  downloadImage,
  getPresignedUrl,
} from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import AddToCataloguePanel from "./AddToCataloguePanel";

interface BlurMetalBrushProps {
  s3Key: string;
  imageUrl: string;
  onBack: () => void;
}

type ToolMode = "paint" | "erase";

const OVERLAY_STROKE = "rgba(34, 197, 94, 0.55)";

export default function BlurMetalBrush({ s3Key, imageUrl, onBack }: BlurMetalBrushProps) {
  const { token } = useAuth();
  const { toast } = useToast();

  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const hasPaintRef = useRef(false);

  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [imageReady, setImageReady] = useState(false);
  const [isPointerDown, setIsPointerDown] = useState(false);
  const [hasPaint, setHasPaint] = useState(false);
  const [tool, setTool] = useState<ToolMode>("paint");
  const [brushSize, setBrushSize] = useState(28);
  const [strength, setStrength] = useState(0.9);
  const [darkRatio, setDarkRatio] = useState(0.7);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{ url: string; s3Key: string } | null>(null);

  const syncOverlay = useCallback(() => {
    const mask = maskCanvasRef.current;
    const overlay = overlayCanvasRef.current;
    if (!mask || !overlay) return;
    const octx = overlay.getContext("2d");
    if (!octx) return;
    octx.clearRect(0, 0, overlay.width, overlay.height);
    octx.drawImage(mask, 0, 0);
    octx.globalCompositeOperation = "source-in";
    octx.fillStyle = OVERLAY_STROKE;
    octx.fillRect(0, 0, overlay.width, overlay.height);
    octx.globalCompositeOperation = "source-over";
  }, []);

  const initCanvases = useCallback(
    (w: number, h: number) => {
      setNaturalSize({ w, h });
      for (const canvas of [maskCanvasRef.current, overlayCanvasRef.current]) {
        if (!canvas) continue;
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (ctx) ctx.clearRect(0, 0, w, h);
      }
      hasPaintRef.current = false;
      setHasPaint(false);
      setImageReady(true);
      // Default brush ~2.5% of short side.
      setBrushSize(Math.max(12, Math.round(Math.min(w, h) * 0.025)));
    },
    []
  );

  const getCanvasPoint = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = overlayCanvasRef.current;
    if (!canvas || !canvas.width || !canvas.height) return null;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((event.clientY - rect.top) / rect.height) * canvas.height;
    return {
      x: Math.max(0, Math.min(canvas.width, x)),
      y: Math.max(0, Math.min(canvas.height, y)),
    };
  }, []);

  const strokeAt = useCallback(
    (from: { x: number; y: number } | null, to: { x: number; y: number }) => {
      const mask = maskCanvasRef.current;
      if (!mask) return;
      const ctx = mask.getContext("2d");
      if (!ctx) return;

      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = brushSize;

      if (tool === "erase") {
        ctx.globalCompositeOperation = "destination-out";
        ctx.strokeStyle = "rgba(0,0,0,1)";
      } else {
        ctx.globalCompositeOperation = "source-over";
        ctx.strokeStyle = "#ffffff";
      }

      ctx.beginPath();
      if (from) {
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
      } else {
        ctx.moveTo(to.x, to.y);
        ctx.lineTo(to.x + 0.01, to.y);
      }
      ctx.stroke();
      ctx.globalCompositeOperation = "source-over";

      if (tool === "paint") {
        hasPaintRef.current = true;
        setHasPaint(true);
      } else {
        // Check if any paint remains after erase.
        const sample = ctx.getImageData(0, 0, mask.width, mask.height).data;
        let any = false;
        for (let i = 3; i < sample.length; i += 16) {
          if (sample[i] > 10) {
            any = true;
            break;
          }
        }
        hasPaintRef.current = any;
        setHasPaint(any);
      }
      syncOverlay();
    },
    [brushSize, tool, syncOverlay]
  );

  const clearPaint = () => {
    const mask = maskCanvasRef.current;
    const overlay = overlayCanvasRef.current;
    if (mask) {
      const ctx = mask.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, mask.width, mask.height);
    }
    if (overlay) {
      const ctx = overlay.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, overlay.width, overlay.height);
    }
    hasPaintRef.current = false;
    setHasPaint(false);
    lastPointRef.current = null;
  };

  const exportMaskBlob = (): Promise<Blob | null> => {
    if (!naturalSize || !hasPaintRef.current) return Promise.resolve(null);
    const mask = maskCanvasRef.current;
    if (!mask) return Promise.resolve(null);

    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = naturalSize.w;
    exportCanvas.height = naturalSize.h;
    const ctx = exportCanvas.getContext("2d");
    if (!ctx) return Promise.resolve(null);

    // Opaque black background; white where painted (backend reads RGB max).
    // IMPORTANT: after fillRect every pixel has alpha=255 — do NOT treat alpha
    // alone as "selected" or the whole image becomes white.
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
    ctx.drawImage(mask, 0, 0);
    const image = ctx.getImageData(0, 0, exportCanvas.width, exportCanvas.height);
    const data = image.data;
    for (let i = 0; i < data.length; i += 4) {
      const lum = Math.max(data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0);
      if (lum > 20) {
        data[i] = 255;
        data[i + 1] = 255;
        data[i + 2] = 255;
      } else {
        data[i] = 0;
        data[i + 1] = 0;
        data[i + 2] = 0;
      }
      data[i + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);

    return new Promise((resolve) => {
      exportCanvas.toBlob((blob) => resolve(blob), "image/png");
    });
  };

  const handleSubmit = async () => {
    if (!token || !hasPaint) {
      toast({
        title: "Paint a region",
        description: "Brush over the dark or white metal patches you want to merge into the surrounding metal.",
        variant: "destructive",
      });
      return;
    }
    setGenerating(true);
    setResult(null);
    try {
      const maskBlob = await exportMaskBlob();
      if (!maskBlob) throw new Error("Could not export brush mask");
      const res = await apiBlurMetalBrush(token, s3Key, maskBlob, {
        strength,
        darkRatio,
      });
      const displayUrl = await getPresignedUrl(token, res.s3_key);
      setResult({ url: displayUrl, s3Key: res.s3_key });
      toast({
        title: "Success",
        description: "Dark and light patches merged into surrounding metal inside your brush strokes.",
      });
    } catch (err: unknown) {
      toast({
        title: "Failed",
        description: err instanceof Error ? err.message : "Could not merge metal patches",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = async () => {
    if (!result || !token) return;
    try {
      const blob = await downloadImage(token, result.s3Key);
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = "metal-blur-brush.png";
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

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = getCanvasPoint(event);
    if (!point) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsPointerDown(true);
    lastPointRef.current = point;
    strokeAt(null, point);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isPointerDown) return;
    const point = getCanvasPoint(event);
    if (!point) return;
    strokeAt(lastPointRef.current, point);
    lastPointRef.current = point;
  };

  const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setIsPointerDown(false);
    lastPointRef.current = null;
  };

  useEffect(() => {
    setImageReady(false);
    setNaturalSize(null);
    setHasPaint(false);
    hasPaintRef.current = false;
    setResult(null);
  }, [imageUrl, s3Key]);

  if (generating) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-6">
        <div className="relative">
          <div className="h-20 w-20 rounded-full border-4 border-muted" />
          <Loader2 className="absolute inset-0 h-20 w-20 animate-spin text-primary" />
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-xl font-semibold">Merging metal patches...</h2>
          <p className="text-sm text-muted-foreground">
            Recolouring dark and light patches toward surrounding metal, then lightly
            feathering the edge. Gemstones and background stay untouched.
          </p>
        </div>
      </div>
    );
  }

  if (result) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle className="text-base">Metal patches merged</CardTitle>
              <AddToCataloguePanel
                token={token}
                analysis={null}
                images={[{ url: result.url, s3Key: result.s3Key }]}
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label className="text-muted-foreground">Original</Label>
                <img
                  src={imageUrl}
                  alt="Original"
                  className="mt-2 w-full rounded-lg border shadow-sm object-contain max-h-[60vh]"
                />
              </div>
              <div>
                <Label className="text-muted-foreground">Merged</Label>
                <img
                  src={result.url}
                  alt="Result"
                  className="mt-2 w-full rounded-lg border shadow-sm object-contain max-h-[60vh]"
                />
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                variant="outline"
                className="flex-1 gap-2"
                onClick={() => {
                  setResult(null);
                }}
              >
                Merge again
              </Button>
              <Button
                variant="outline"
                className="flex-1 gap-2"
                onClick={handleDownload}
                disabled={!token}
              >
                <Download className="h-4 w-4" /> Download image
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={onBack} className="gap-2">
        <ArrowLeft className="h-4 w-4" /> Back
      </Button>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Merge metal brush</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm text-muted-foreground">
            Paint over dark or white metal patches. They are recoloured toward surrounding
            metal, then the edge is lightly feathered — gemstones and background stay unchanged.
          </p>

          <div className="mx-auto flex w-full max-w-3xl justify-center rounded-lg border bg-muted/20 p-2">
            <div className="relative inline-block max-h-[70vh] max-w-full">
              <img
                src={imageUrl}
                alt="Jewellery to edit"
                className="block max-h-[70vh] max-w-full"
                onLoad={(e) => {
                  const img = e.currentTarget;
                  initCanvases(img.naturalWidth, img.naturalHeight);
                }}
                onError={() => {
                  toast({
                    title: "Could not load image",
                    description: "The source image failed to load for painting.",
                    variant: "destructive",
                  });
                }}
                draggable={false}
              />
              <canvas ref={maskCanvasRef} className="hidden" />
              <canvas
                ref={overlayCanvasRef}
                className="absolute inset-0 h-full w-full touch-none"
                style={{ cursor: tool === "erase" ? "cell" : "crosshair" }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              />
              {!imageReady && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/60">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant={tool === "paint" ? "default" : "outline"}
              className="gap-2"
              onClick={() => setTool("paint")}
            >
              <Brush className="h-4 w-4" /> Paint
            </Button>
            <Button
              type="button"
              size="sm"
              variant={tool === "erase" ? "default" : "outline"}
              className="gap-2"
              onClick={() => setTool("erase")}
            >
              <Eraser className="h-4 w-4" /> Erase
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-2"
              onClick={clearPaint}
              disabled={!hasPaint}
            >
              <RotateCcw className="h-4 w-4" /> Clear
            </Button>
            <span className="text-sm text-muted-foreground">
              {hasPaint ? "Green overlay shows your brush strokes." : "Paint on the metal to begin."}
            </span>
          </div>

          <div className="space-y-2 max-w-md">
            <div className="flex justify-between">
              <Label>Brush size</Label>
              <span className="text-sm text-muted-foreground">{brushSize}px</span>
            </div>
            <Slider
              value={[brushSize]}
              onValueChange={(v) => setBrushSize(v[0] ?? 28)}
              min={8}
              max={Math.max(80, naturalSize ? Math.round(Math.min(naturalSize.w, naturalSize.h) * 0.12) : 120)}
              step={1}
            />
          </div>

          <div className="space-y-2 max-w-md">
            <div className="flex justify-between">
              <Label>Merge strength</Label>
              <span className="text-sm text-muted-foreground">{strength.toFixed(2)}</span>
            </div>
            <Slider
              value={[strength]}
              onValueChange={(v) => setStrength(v[0] ?? 0.9)}
              min={0.1}
              max={1}
              step={0.05}
            />
          </div>

          <div className="space-y-2 max-w-md">
            <div className="flex justify-between">
              <Label>Darkness sensitivity</Label>
              <span className="text-sm text-muted-foreground">{darkRatio.toFixed(2)}</span>
            </div>
            <Slider
              value={[darkRatio]}
              onValueChange={(v) => setDarkRatio(v[0] ?? 0.7)}
              min={0.35}
              max={0.85}
              step={0.05}
            />
          </div>

          <Button
            size="lg"
            onClick={handleSubmit}
            disabled={!hasPaint || !token || !imageReady}
            className="min-w-[200px]"
          >
            Merge painted metal
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
