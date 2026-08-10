import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Download, Eraser, Loader2, Paintbrush, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  apiSmoothReflection,
  downloadImage,
  getPresignedUrl,
} from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import AddToCataloguePanel from "./AddToCataloguePanel";

interface SmoothReflectionProps {
  s3Key: string;
  imageUrl: string;
  onBack: () => void;
}

type Tool = "brush" | "eraser";

/** Overlay paint colour — green so harsh-reflection regions are obvious. */
const BRUSH_OVERLAY = "rgba(34, 197, 94, 0.45)";

export default function SmoothReflection({ s3Key, imageUrl, onBack }: SmoothReflectionProps) {
  const { token } = useAuth();
  const { toast } = useToast();

  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [imageReady, setImageReady] = useState(false);
  const [tool, setTool] = useState<Tool>("brush");
  const [brushSize, setBrushSize] = useState(28);
  const [strength, setStrength] = useState(0.9);
  const [darkRatio, setDarkRatio] = useState(0.65);
  const [hasPaint, setHasPaint] = useState(false);
  const [isPointerDown, setIsPointerDown] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{ url: string; s3Key: string } | null>(null);

  const initCanvases = useCallback((w: number, h: number) => {
    setNaturalSize({ w, h });
    const maskCanvas = maskCanvasRef.current;
    const overlayCanvas = overlayCanvasRef.current;
    if (!maskCanvas || !overlayCanvas) return;
    maskCanvas.width = w;
    maskCanvas.height = h;
    overlayCanvas.width = w;
    overlayCanvas.height = h;
    const mctx = maskCanvas.getContext("2d");
    if (mctx) {
      mctx.globalCompositeOperation = "source-over";
      mctx.fillStyle = "#000000";
      mctx.fillRect(0, 0, w, h);
    }
    const octx = overlayCanvas.getContext("2d");
    if (octx) {
      octx.globalCompositeOperation = "source-over";
      octx.clearRect(0, 0, w, h);
    }
    setHasPaint(false);
    setImageReady(true);
  }, []);

  const getCanvasPoint = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = overlayCanvasRef.current;
    if (!canvas || !canvas.width || !canvas.height) return null;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }, []);

  const stampDot = useCallback(
    (x: number, y: number) => {
      const maskCanvas = maskCanvasRef.current;
      const overlayCanvas = overlayCanvasRef.current;
      if (!maskCanvas || !overlayCanvas) return;
      const mctx = maskCanvas.getContext("2d");
      const octx = overlayCanvas.getContext("2d");
      if (!mctx || !octx) return;

      const radius = Math.max(2, brushSize / 2);

      if (tool === "brush") {
        mctx.globalCompositeOperation = "source-over";
        mctx.fillStyle = "#ffffff";
        mctx.beginPath();
        mctx.arc(x, y, radius, 0, Math.PI * 2);
        mctx.fill();

        octx.globalCompositeOperation = "source-over";
        octx.fillStyle = BRUSH_OVERLAY;
        octx.beginPath();
        octx.arc(x, y, radius, 0, Math.PI * 2);
        octx.fill();
        setHasPaint(true);
      } else {
        mctx.globalCompositeOperation = "destination-out";
        mctx.beginPath();
        mctx.arc(x, y, radius, 0, Math.PI * 2);
        mctx.fill();
        mctx.globalCompositeOperation = "destination-over";
        mctx.fillStyle = "#000000";
        mctx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
        mctx.globalCompositeOperation = "source-over";

        octx.globalCompositeOperation = "destination-out";
        octx.beginPath();
        octx.arc(x, y, radius, 0, Math.PI * 2);
        octx.fill();
        octx.globalCompositeOperation = "source-over";
      }
    },
    [brushSize, tool]
  );

  const strokeTo = useCallback(
    (x: number, y: number) => {
      const prev = lastPointRef.current;
      if (!prev) {
        stampDot(x, y);
        lastPointRef.current = { x, y };
        return;
      }
      const dist = Math.hypot(x - prev.x, y - prev.y);
      const step = Math.max(1, brushSize * 0.2);
      const n = Math.max(1, Math.ceil(dist / step));
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        stampDot(prev.x + (x - prev.x) * t, prev.y + (y - prev.y) * t);
      }
      lastPointRef.current = { x, y };
    },
    [brushSize, stampDot]
  );

  const clearMask = () => {
    const maskCanvas = maskCanvasRef.current;
    const overlayCanvas = overlayCanvasRef.current;
    if (!maskCanvas || !overlayCanvas || !naturalSize) return;
    const mctx = maskCanvas.getContext("2d");
    const octx = overlayCanvas.getContext("2d");
    if (mctx) {
      mctx.globalCompositeOperation = "source-over";
      mctx.fillStyle = "#000000";
      mctx.fillRect(0, 0, naturalSize.w, naturalSize.h);
    }
    if (octx) {
      octx.globalCompositeOperation = "source-over";
      octx.clearRect(0, 0, naturalSize.w, naturalSize.h);
    }
    setHasPaint(false);
    lastPointRef.current = null;
  };

  const exportMaskBlob = (): Promise<Blob | null> => {
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) return Promise.resolve(null);
    return new Promise((resolve) => {
      maskCanvas.toBlob((blob) => resolve(blob), "image/png");
    });
  };

  const handleSubmit = async () => {
    if (!token || !hasPaint) {
      toast({
        title: "Paint a selection",
        description: "Brush over the dark reflection patches on the metal first.",
        variant: "destructive",
      });
      return;
    }
    setGenerating(true);
    setResult(null);
    try {
      const maskBlob = await exportMaskBlob();
      if (!maskBlob) throw new Error("Could not export selection mask");
      const res = await apiSmoothReflection(token, s3Key, maskBlob, {
        strength,
        darkRatio,
        featherSigma: 5,
      });
      const displayUrl = await getPresignedUrl(token, res.s3_key);
      setResult({ url: displayUrl, s3Key: res.s3_key });
      toast({ title: "Success", description: "Dark reflections reduced successfully." });
    } catch (err: unknown) {
      toast({
        title: "Failed",
        description: err instanceof Error ? err.message : "Could not smooth reflection",
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
      a.download = "reflection-smoothed.png";
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
    lastPointRef.current = null;
    setIsPointerDown(true);
    strokeTo(point.x, point.y);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isPointerDown) return;
    const point = getCanvasPoint(event);
    if (!point) return;
    strokeTo(point.x, point.y);
  };

  const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setIsPointerDown(false);
    lastPointRef.current = null;
  };

  // Reset when the source image changes.
  useEffect(() => {
    setImageReady(false);
    setNaturalSize(null);
    setHasPaint(false);
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
          <h2 className="text-xl font-semibold">Reducing dark reflections...</h2>
          <p className="text-sm text-muted-foreground">
            Finding dark patches on metal inside your selection and reconstructing the metal tone
            underneath — bright highlights stay untouched.
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
              <CardTitle className="text-base">Reflection smoothed</CardTitle>
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
                <Label className="text-muted-foreground">Smoothed</Label>
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
                Smooth again
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
          <CardTitle className="text-base">Smooth dark reflections</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm text-muted-foreground">
            Paint over dark patches on reflective metal. Only unusually dark metal inside your
            selection is repaired — white highlights, gemstones and background stay unchanged.
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
              {/* Hidden binary mask (white = selected) */}
              <canvas ref={maskCanvasRef} className="hidden" />
              {/* Overlay matches the img box exactly so brush coords map 1:1 */}
              <canvas
                ref={overlayCanvasRef}
                className={`absolute inset-0 h-full w-full touch-none ${
                  tool === "eraser" ? "cursor-cell" : "cursor-crosshair"
                }`}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerLeave={onPointerUp}
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
              variant={tool === "brush" ? "default" : "outline"}
              className="gap-2"
              onClick={() => setTool("brush")}
            >
              <Paintbrush className="h-4 w-4" /> Brush
            </Button>
            <Button
              type="button"
              size="sm"
              variant={tool === "eraser" ? "default" : "outline"}
              className="gap-2"
              onClick={() => setTool("eraser")}
            >
              <Eraser className="h-4 w-4" /> Eraser
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-2"
              onClick={clearMask}
              disabled={!hasPaint}
            >
              <RotateCcw className="h-4 w-4" /> Clear
            </Button>
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
              max={120}
              step={2}
            />
          </div>

          <div className="space-y-2 max-w-md">
            <div className="flex justify-between">
              <Label>Repair strength</Label>
              <span className="text-sm text-muted-foreground">{strength.toFixed(2)}</span>
            </div>
            <Slider
              value={[strength]}
              onValueChange={(v) => setStrength(v[0] ?? 0.9)}
              min={0.1}
              max={1}
              step={0.05}
            />
            <p className="text-sm text-muted-foreground">
              How strongly dark patches are replaced with reconstructed metal. Bright shine is never
              touched.
            </p>
          </div>

          <div className="space-y-2 max-w-md">
            <div className="flex justify-between">
              <Label>Darkness sensitivity</Label>
              <span className="text-sm text-muted-foreground">{darkRatio.toFixed(2)}</span>
            </div>
            <Slider
              value={[darkRatio]}
              onValueChange={(v) => setDarkRatio(v[0] ?? 0.65)}
              min={0.35}
              max={0.85}
              step={0.05}
            />
            <p className="text-sm text-muted-foreground">
              Higher values also treat milder dark areas as reflections. If nothing changes, raise
              this toward 0.75–0.85 and paint tightly over the dark patch.
            </p>
          </div>

          <Button
            size="lg"
            onClick={handleSubmit}
            disabled={!hasPaint || !token || !imageReady}
            className="min-w-[200px]"
          >
            Reduce dark reflections
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
