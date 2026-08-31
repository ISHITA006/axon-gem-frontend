import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from "react";
import { Brush, Eraser, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";

type BrushMode = "paint" | "erase";

const PLACEMENT_OVERLAY_STROKE = "rgba(255, 0, 160, 0.55)";

export type PlacementShadeCanvasHandle = {
  exportMaskBlob: () => Promise<Blob | null>;
  clear: () => void;
  hasPaint: () => boolean;
};

interface PlacementShadeCanvasProps {
  imageUrl: string;
  imageAlt?: string;
  disabled?: boolean;
  onPaintChange?: (hasPaint: boolean) => void;
}

const PlacementShadeCanvas = forwardRef<PlacementShadeCanvasHandle, PlacementShadeCanvasProps>(
  function PlacementShadeCanvas({ imageUrl, imageAlt, disabled = false, onPaintChange }, ref) {
    const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const lastPointRef = useRef<{ x: number; y: number } | null>(null);
    const hasPaintRef = useRef(false);

    const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
    const [imageReady, setImageReady] = useState(false);
    const [hasPaint, setHasPaint] = useState(false);
    const [brushMode, setBrushMode] = useState<BrushMode>("paint");
    const [brushSize, setBrushSize] = useState(28);

    const markPaint = (next: boolean) => {
      hasPaintRef.current = next;
      setHasPaint(next);
      onPaintChange?.(next);
    };

    const syncOverlay = useCallback(() => {
      const mask = maskCanvasRef.current;
      const overlay = overlayCanvasRef.current;
      if (!mask || !overlay) return;
      const octx = overlay.getContext("2d");
      if (!octx) return;
      octx.clearRect(0, 0, overlay.width, overlay.height);
      octx.drawImage(mask, 0, 0);
      octx.globalCompositeOperation = "source-in";
      octx.fillStyle = PLACEMENT_OVERLAY_STROKE;
      octx.fillRect(0, 0, overlay.width, overlay.height);
      octx.globalCompositeOperation = "source-over";
    }, []);

    const initCanvases = useCallback((w: number, h: number) => {
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
      onPaintChange?.(false);
      setImageReady(true);
      setBrushSize(Math.max(16, Math.round(Math.min(w, h) * 0.035)));
    }, [onPaintChange]);

    const clearPaint = useCallback(() => {
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
      markPaint(false);
      lastPointRef.current = null;
    }, [onPaintChange]);

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
        if (brushMode === "erase") {
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
        if (brushMode === "paint") {
          markPaint(true);
        } else {
          const sample = ctx.getImageData(0, 0, mask.width, mask.height).data;
          let any = false;
          for (let i = 3; i < sample.length; i += 16) {
            if (sample[i] > 10) {
              any = true;
              break;
            }
          }
          markPaint(any);
        }
        syncOverlay();
      },
      [brushSize, brushMode, syncOverlay, onPaintChange]
    );

    const exportMaskBlob = (): Promise<Blob | null> => {
      if (!naturalSize || !hasPaintRef.current) return Promise.resolve(null);
      const mask = maskCanvasRef.current;
      if (!mask) return Promise.resolve(null);
      const exportCanvas = document.createElement("canvas");
      exportCanvas.width = naturalSize.w;
      exportCanvas.height = naturalSize.h;
      const ctx = exportCanvas.getContext("2d");
      if (!ctx) return Promise.resolve(null);
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

    useImperativeHandle(
      ref,
      () => ({
        exportMaskBlob,
        clear: clearPaint,
        hasPaint: () => hasPaintRef.current,
      }),
      [clearPaint, naturalSize]
    );

    const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (disabled) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      const point = getCanvasPoint(event);
      if (!point) return;
      lastPointRef.current = point;
      strokeAt(null, point);
    };

    const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (disabled || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
      const point = getCanvasPoint(event);
      if (!point) return;
      strokeAt(lastPointRef.current, point);
      lastPointRef.current = point;
    };

    const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      lastPointRef.current = null;
    };

    return (
      <div className="space-y-4">
        <div className="relative mx-auto flex w-full justify-center rounded-lg border bg-muted/20 p-2">
          <div className="relative inline-block max-h-[60vh] max-w-full">
            <img
              src={imageUrl}
              alt={imageAlt ?? "Model for jewellery placement"}
              className="block max-h-[60vh] max-w-full select-none"
              onLoad={(e) => {
                const img = e.currentTarget;
                initCanvases(img.naturalWidth, img.naturalHeight);
              }}
              draggable={false}
            />
            <canvas ref={maskCanvasRef} className="hidden" />
            <canvas
              ref={overlayCanvasRef}
              className="absolute inset-0 h-full w-full touch-none"
              style={{ cursor: disabled ? "default" : brushMode === "erase" ? "cell" : "crosshair" }}
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
            variant={brushMode === "paint" ? "default" : "outline"}
            className="gap-2"
            onClick={() => setBrushMode("paint")}
            disabled={disabled}
          >
            <Brush className="h-4 w-4" /> Shade
          </Button>
          <Button
            type="button"
            size="sm"
            variant={brushMode === "erase" ? "default" : "outline"}
            className="gap-2"
            onClick={() => setBrushMode("erase")}
            disabled={disabled}
          >
            <Eraser className="h-4 w-4" /> Erase
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-2"
            onClick={clearPaint}
            disabled={disabled || !hasPaint}
          >
            <RotateCcw className="h-4 w-4" /> Clear
          </Button>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between">
            <Label>Brush size</Label>
            <span className="text-sm text-muted-foreground">{brushSize}px</span>
          </div>
          <Slider
            value={[brushSize]}
            onValueChange={(v) => setBrushSize(v[0] ?? 28)}
            min={8}
            max={Math.max(
              80,
              naturalSize ? Math.round(Math.min(naturalSize.w, naturalSize.h) * 0.16) : 140
            )}
            step={1}
            disabled={disabled}
          />
        </div>
      </div>
    );
  }
);

export default PlacementShadeCanvas;
