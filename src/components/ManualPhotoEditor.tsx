import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Brush,
  CloudFog,
  Coins,
  Download,
  Eraser,
  Eye,
  EyeOff,
  Loader2,
  PaintBucket,
  RotateCcw,
  Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  apiBlurMetalBrush,
  apiBlurShadowBrush,
  apiChangeBackgroundColour,
  apiChangeMetalColour,
  apiGetColourName,
  apiSaveEditedImage,
  downloadImage,
  getPresignedUrl,
} from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import AddToCataloguePanel from "./AddToCataloguePanel";

export type ManualEditTool = "background" | "metal" | "blur" | "shadow";

function isBrushTool(tool: ManualEditTool): boolean {
  return tool === "blur" || tool === "shadow";
}

interface ManualPhotoEditorProps {
  s3Key: string;
  imageUrl: string;
  onBack: () => void;
  initialTool?: ManualEditTool;
}

type BrushMode = "paint" | "erase";

const BG_PRESETS: { hex: string; label: string }[] = [
  { hex: "#FFFFFF", label: "Pure white" },
  { hex: "#F8F8F8", label: "Off white" },
  { hex: "#F5F5F5", label: "Studio grey" },
  { hex: "#F8F4EC", label: "Ivory" },
  { hex: "#F3E9DC", label: "Champagne" },
  { hex: "#EAF0F2", label: "Cool mist" },
  { hex: "#1A1A1A", label: "Charcoal" },
];

const METAL_PRESETS: { hex: string; label: string }[] = [
  { hex: "#D4A13B", label: "Yellow gold" },
  { hex: "#E79880", label: "Rose gold" },
  { hex: "#C9CCD1", label: "White gold" },
  { hex: "#C0C0C5", label: "Silver" },
  { hex: "#D5D8DC", label: "Platinum" },
  { hex: "#41474E", label: "Gun Metal" },
  { hex: "#D9BE8C", label: "Champagne gold" },
  { hex: "#BE6F57", label: "Copper" },
];

const TOLERANCE_OPTIONS: { value: number; label: string; hint: string }[] = [
  { value: 6, label: "Strict", hint: "Only near-exact metal tones — protects nearby stones" },
  { value: 12, label: "Balanced", hint: "Default — normal lighting variation on any metal" },
  { value: 24, label: "Broad", hint: "Catches colour-shifted or oxidised metal" },
];

const METAL_OVERLAY_STROKE = "rgba(34, 197, 94, 0.55)";
const SHADOW_OVERLAY_STROKE = "rgba(251, 146, 60, 0.55)";

function normalizeHex(value: string): string {
  const m = value.trim().replace(/^#/, "").match(/^([0-9A-Fa-f]{0,6})/);
  if (!m) return "";
  return m[1].length === 6 ? `#${m[1]}` : value.trim().startsWith("#") ? `#${m[1]}` : m[1];
}

export default function ManualPhotoEditor({
  s3Key,
  imageUrl,
  onBack,
  initialTool = "background",
}: ManualPhotoEditorProps) {
  const { token } = useAuth();
  const { toast } = useToast();

  const originalUrl = imageUrl;

  const [tool, setTool] = useState<ManualEditTool>(initialTool);
  const [workingS3Key, setWorkingS3Key] = useState(s3Key);
  const [workingUrl, setWorkingUrl] = useState(imageUrl);
  const [showOriginal, setShowOriginal] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [editCount, setEditCount] = useState(0);

  // Background controls
  const [bgHex, setBgHex] = useState("#F8F8F8");
  const [bgName, setBgName] = useState("whitesmoke");
  const [bgNameLoading, setBgNameLoading] = useState(false);

  // Metal controls
  const [metalHex, setMetalHex] = useState("#B76E79");
  const [metalSourceHex, setMetalSourceHex] = useState("");
  const [hueTolerance, setHueTolerance] = useState(12);
  const [metalName, setMetalName] = useState("Rose gold");
  const [metalNameLoading, setMetalNameLoading] = useState(false);

  // Blur brush controls
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const hasPaintRef = useRef(false);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [imageReady, setImageReady] = useState(false);
  const [isPointerDown, setIsPointerDown] = useState(false);
  const [hasPaint, setHasPaint] = useState(false);
  const [brushMode, setBrushMode] = useState<BrushMode>("paint");
  const [brushSize, setBrushSize] = useState(28);
  const [blurStrength, setBlurStrength] = useState(0.9);
  const [darkRatio, setDarkRatio] = useState(0.7);
  const [shadowStrength, setShadowStrength] = useState(0.9);
  const [shadowDarkRatio, setShadowDarkRatio] = useState(0.9);
  const [previewKey, setPreviewKey] = useState(0);

  const cleanBgHex = bgHex.replace(/^#/, "");
  const isValidBgHex = cleanBgHex.length === 6;
  const cleanMetalHex = metalHex.replace(/^#/, "");
  const isValidMetalHex = cleanMetalHex.length === 6;
  const cleanMetalSource = metalSourceHex.replace(/^#/, "");
  const isValidMetalSource = cleanMetalSource.length === 0 || cleanMetalSource.length === 6;

  const displayUrl = showOriginal ? originalUrl : workingUrl;

  useEffect(() => {
    setWorkingS3Key(s3Key);
    setWorkingUrl(imageUrl);
    setDirty(false);
    setSaved(false);
    setEditCount(0);
    setShowOriginal(false);
    setTool(initialTool);
    setPreviewKey((k) => k + 1);
  }, [s3Key, imageUrl, initialTool]);

  const fetchBgName = useCallback(
    async (value: string) => {
      const clean = value.replace(/^#/, "");
      if (clean.length !== 6 || !token) return;
      setBgNameLoading(true);
      try {
        const { name } = await apiGetColourName(token, clean);
        setBgName(name);
      } catch {
        setBgName("Unknown");
      } finally {
        setBgNameLoading(false);
      }
    },
    [token]
  );

  const fetchMetalName = useCallback(
    async (value: string) => {
      const clean = value.replace(/^#/, "");
      if (clean.length !== 6 || !token) return;
      const preset = METAL_PRESETS.find((p) => p.hex.toUpperCase() === `#${clean.toUpperCase()}`);
      if (preset) {
        setMetalName(preset.label);
        return;
      }
      setMetalNameLoading(true);
      try {
        const { name } = await apiGetColourName(token, clean);
        setMetalName(name);
      } catch {
        setMetalName("Unknown");
      } finally {
        setMetalNameLoading(false);
      }
    },
    [token]
  );

  useEffect(() => {
    if (isValidBgHex) fetchBgName(bgHex);
  }, [bgHex, isValidBgHex, fetchBgName]);

  useEffect(() => {
    if (isValidMetalHex) fetchMetalName(metalHex);
  }, [metalHex, isValidMetalHex, fetchMetalName]);

  const applyWorkingResult = async (resS3Key: string) => {
    if (!token) return;
    const displayUrlNext = await getPresignedUrl(token, resS3Key);
    setWorkingS3Key(resS3Key);
    setWorkingUrl(displayUrlNext);
    setDirty(true);
    setSaved(false);
    setEditCount((n) => n + 1);
    setShowOriginal(false);
    setPreviewKey((k) => k + 1);
    clearPaint();
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
    octx.fillStyle = tool === "shadow" ? SHADOW_OVERLAY_STROKE : METAL_OVERLAY_STROKE;
    octx.fillRect(0, 0, overlay.width, overlay.height);
    octx.globalCompositeOperation = "source-over";
  }, [tool]);

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
    setImageReady(true);
    setBrushSize(Math.max(12, Math.round(Math.min(w, h) * 0.025)));
  }, []);

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
        hasPaintRef.current = true;
        setHasPaint(true);
      } else {
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
    [brushSize, brushMode, syncOverlay]
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

  const handleApplyBackground = async () => {
    if (!token || !isValidBgHex) {
      toast({
        title: "Invalid input",
        description: "Choose a valid background colour (6-digit hex).",
        variant: "destructive",
      });
      return;
    }
    setGenerating(true);
    try {
      const res = await apiChangeBackgroundColour(
        token,
        workingS3Key,
        `#${cleanBgHex.toUpperCase()}`,
        { saveToGallery: false }
      );
      await applyWorkingResult(res.s3_key);
      toast({ title: "Applied", description: "Background updated. Continue editing or Save." });
    } catch (err: unknown) {
      toast({
        title: "Failed",
        description: err instanceof Error ? err.message : "Could not change background",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleApplyMetal = async () => {
    if (!token || !isValidMetalHex || !isValidMetalSource) {
      toast({
        title: "Invalid input",
        description: "Choose a valid metal colour (6-digit hex).",
        variant: "destructive",
      });
      return;
    }
    setGenerating(true);
    try {
      const res = await apiChangeMetalColour(
        token,
        workingS3Key,
        `#${cleanMetalHex.toUpperCase()}`,
        cleanMetalSource.length === 6 ? `#${cleanMetalSource.toUpperCase()}` : undefined,
        hueTolerance,
        { saveToGallery: false }
      );
      await applyWorkingResult(res.s3_key);
      toast({ title: "Applied", description: "Metal colour updated. Continue editing or Save." });
    } catch (err: unknown) {
      toast({
        title: "Failed",
        description: err instanceof Error ? err.message : "Could not change metal colour",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleApplyBlur = async () => {
    if (!token || !hasPaint) {
      toast({
        title: "Paint a region",
        description: "Brush over the dark or white metal patches to merge.",
        variant: "destructive",
      });
      return;
    }
    setGenerating(true);
    try {
      const maskBlob = await exportMaskBlob();
      if (!maskBlob) throw new Error("Could not export brush mask");
      const res = await apiBlurMetalBrush(token, workingS3Key, maskBlob, {
        strength: blurStrength,
        darkRatio,
        saveToGallery: false,
      });
      await applyWorkingResult(res.s3_key);
      toast({ title: "Applied", description: "Metal patches merged. Continue editing or Save." });
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

  const handleApplyShadow = async () => {
    if (!token || !hasPaint) {
      toast({
        title: "Paint a region",
        description: "Brush over the surface shadows you want to soften.",
        variant: "destructive",
      });
      return;
    }
    setGenerating(true);
    try {
      const maskBlob = await exportMaskBlob();
      if (!maskBlob) throw new Error("Could not export brush mask");
      const res = await apiBlurShadowBrush(token, workingS3Key, maskBlob, {
        strength: shadowStrength,
        darkRatio: shadowDarkRatio,
        saveToGallery: false,
      });
      await applyWorkingResult(res.s3_key);
      toast({
        title: "Applied",
        description: "Surface shadows softened. Continue editing or Save.",
      });
    } catch (err: unknown) {
      toast({
        title: "Failed",
        description: err instanceof Error ? err.message : "Could not soften surface shadows",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!token || !dirty) return;
    setSaving(true);
    try {
      await apiSaveEditedImage(token, workingS3Key);
      setDirty(false);
      setSaved(true);
      toast({ title: "Saved", description: "Added to Edited Images in My Gallery." });
    } catch (err: unknown) {
      toast({
        title: "Save failed",
        description: err instanceof Error ? err.message : "Could not save to gallery",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDownload = async () => {
    if (!token) return;
    try {
      const blob = await downloadImage(token, workingS3Key);
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = "manually-edited.png";
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

  const handleBack = () => {
    if (dirty) {
      const ok = window.confirm(
        "You have unsaved edits. Leave without saving to Edited Images?"
      );
      if (!ok) return;
    }
    onBack();
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (showOriginal) return;
    const point = getCanvasPoint(event);
    if (!point) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsPointerDown(true);
    lastPointRef.current = point;
    strokeAt(null, point);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isPointerDown || showOriginal) return;
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

  if (generating) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-6">
        <div className="relative">
          <div className="h-20 w-20 rounded-full border-4 border-muted" />
          <Loader2 className="absolute inset-0 h-20 w-20 animate-spin text-primary" />
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-xl font-semibold">Applying edit...</h2>
          <p className="text-sm text-muted-foreground">
            Updating your working image. Nothing is saved to the gallery until you click Save.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" onClick={handleBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          {editCount > 0 && (
            <span className="text-sm text-muted-foreground">
              {editCount} edit{editCount === 1 ? "" : "s"} applied
              {dirty ? " · unsaved" : saved ? " · saved" : ""}
            </span>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => setShowOriginal((v) => !v)}
            disabled={workingUrl === originalUrl && !dirty && editCount === 0}
          >
            {showOriginal ? (
              <>
                <EyeOff className="h-4 w-4" /> Show edited
              </>
            ) : (
              <>
                <Eye className="h-4 w-4" /> Show original
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={handleDownload}
            disabled={!token}
          >
            <Download className="h-4 w-4" /> Download
          </Button>
          <Button
            type="button"
            size="sm"
            className="gap-2"
            onClick={handleSave}
            disabled={!token || !dirty || saving}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save to gallery
          </Button>
          {saved && (
            <AddToCataloguePanel
              token={token}
              analysis={null}
              images={[{ url: workingUrl, s3Key: workingS3Key }]}
            />
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {showOriginal ? "Original" : dirty || editCount > 0 ? "Edited preview" : "Working image"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative mx-auto flex w-full justify-center rounded-lg border bg-muted/20 p-2">
              <div className="relative inline-block max-h-[70vh] max-w-full">
                <img
                  key={`${previewKey}-${displayUrl}`}
                  src={displayUrl}
                  alt={showOriginal ? "Original" : "Working edit"}
                  className="block max-h-[70vh] max-w-full"
                  onLoad={(e) => {
                    if (isBrushTool(tool) && !showOriginal) {
                      const img = e.currentTarget;
                      initCanvases(img.naturalWidth, img.naturalHeight);
                    }
                  }}
                  draggable={false}
                />
                {isBrushTool(tool) && !showOriginal && (
                  <>
                    <canvas ref={maskCanvasRef} className="hidden" />
                    <canvas
                      ref={overlayCanvasRef}
                      className="absolute inset-0 h-full w-full touch-none"
                      style={{ cursor: brushMode === "erase" ? "cell" : "crosshair" }}
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
                  </>
                )}
              </div>
            </div>
            {showOriginal && (
              <p className="mt-2 text-sm text-muted-foreground">
                Viewing the original. Toggle back to continue editing the latest result.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Manual photo editing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Apply background, metal, blur merge, or shadow soften as many times as you like.
              Edits stack on the latest result. Save only when you are done.
            </p>

            <Tabs
              value={tool}
              onValueChange={(v) => {
                const next = v as ManualEditTool;
                setTool(next);
                clearPaint();
                if (isBrushTool(next)) {
                  setImageReady(false);
                  setPreviewKey((k) => k + 1);
                }
              }}
            >
              <TabsList className="grid h-auto w-full grid-cols-2 gap-1 sm:grid-cols-4">
                <TabsTrigger value="background" className="gap-1 px-1.5 text-xs sm:text-sm">
                  <PaintBucket className="h-3.5 w-3.5" /> Background
                </TabsTrigger>
                <TabsTrigger value="metal" className="gap-1 px-1.5 text-xs sm:text-sm">
                  <Coins className="h-3.5 w-3.5" /> Metal
                </TabsTrigger>
                <TabsTrigger value="blur" className="gap-1 px-1.5 text-xs sm:text-sm">
                  <Brush className="h-3.5 w-3.5" /> Blur
                </TabsTrigger>
                <TabsTrigger value="shadow" className="gap-1 px-1.5 text-xs sm:text-sm">
                  <CloudFog className="h-3.5 w-3.5" /> Shadows
                </TabsTrigger>
              </TabsList>

              <TabsContent value="background" className="space-y-4 pt-2">
                <div className="space-y-3">
                  <Label>Background colour</Label>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="color"
                      value={bgHex.startsWith("#") ? bgHex : `#${bgHex}`}
                      onChange={(e) => setBgHex(e.target.value)}
                      className="h-10 w-14 cursor-pointer rounded border border-input bg-transparent"
                    />
                    <Input
                      placeholder="#F8F8F8"
                      value={bgHex}
                      onChange={(e) => {
                        const next = normalizeHex(e.target.value);
                        setBgHex(
                          next.length === 6
                            ? next.startsWith("#")
                              ? next
                              : `#${next}`
                            : e.target.value || "#"
                        );
                      }}
                      className="max-w-[120px] font-mono"
                    />
                    {bgNameLoading ? (
                      <span className="text-sm text-muted-foreground">Resolving…</span>
                    ) : (
                      isValidBgHex && (
                        <span className="text-sm font-medium">
                          {bgName} (#{cleanBgHex.toUpperCase()})
                        </span>
                      )
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {BG_PRESETS.map((preset) => (
                      <button
                        key={preset.hex}
                        type="button"
                        onClick={() => setBgHex(preset.hex)}
                        title={`${preset.label} (${preset.hex})`}
                        className={`h-8 w-8 rounded-full border shadow-sm transition-transform hover:scale-110 ${
                          bgHex.toUpperCase() === preset.hex
                            ? "ring-2 ring-primary ring-offset-2"
                            : ""
                        }`}
                        style={{ backgroundColor: preset.hex }}
                      />
                    ))}
                  </div>
                </div>
                <Button
                  className="w-full"
                  onClick={handleApplyBackground}
                  disabled={!token || !isValidBgHex || showOriginal}
                >
                  Apply background
                </Button>
              </TabsContent>

              <TabsContent value="metal" className="space-y-4 pt-2">
                <p className="text-sm text-muted-foreground">
                  Recolour any metallic base — yellow gold, rose gold, silver, gun metal,
                  platinum, white gold, copper — without changing stones or lighting.
                </p>
                <div className="space-y-3">
                  <Label>New metal colour</Label>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="color"
                      value={metalHex.startsWith("#") ? metalHex : `#${metalHex}`}
                      onChange={(e) => setMetalHex(e.target.value)}
                      className="h-10 w-14 cursor-pointer rounded border border-input bg-transparent"
                    />
                    <Input
                      placeholder="#E79880"
                      value={metalHex}
                      onChange={(e) => {
                        const next = normalizeHex(e.target.value);
                        setMetalHex(
                          next.length === 6
                            ? next.startsWith("#")
                              ? next
                              : `#${next}`
                            : e.target.value || "#"
                        );
                      }}
                      className="max-w-[120px] font-mono"
                    />
                    {metalNameLoading ? (
                      <span className="text-sm text-muted-foreground">Resolving…</span>
                    ) : (
                      isValidMetalHex && (
                        <span className="text-sm font-medium">
                          {metalName} (#{cleanMetalHex.toUpperCase()})
                        </span>
                      )
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {METAL_PRESETS.map((preset) => (
                      <button
                        key={preset.hex}
                        type="button"
                        onClick={() => setMetalHex(preset.hex)}
                        title={`${preset.label} (${preset.hex})`}
                        className={`h-8 w-8 rounded-full border shadow-sm transition-transform hover:scale-110 ${
                          metalHex.toUpperCase() === preset.hex
                            ? "ring-2 ring-primary ring-offset-2"
                            : ""
                        }`}
                        style={{ backgroundColor: preset.hex }}
                      />
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Metal to change (optional)</Label>
                  <p className="text-xs text-muted-foreground">
                    Auto-detects gold and gray metals. Pin a swatch for two-tone pieces
                    (for example change only the silver, or only the gun metal).
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setMetalSourceHex("")}
                      title="Auto-detect the current metal"
                      className={`h-8 rounded-full border px-3 text-xs font-medium shadow-sm transition-transform hover:scale-105 ${
                        cleanMetalSource.length === 0
                          ? "ring-2 ring-primary ring-offset-2"
                          : "bg-background"
                      }`}
                    >
                      Auto
                    </button>
                    {METAL_PRESETS.map((preset) => (
                      <button
                        key={`src-${preset.hex}`}
                        type="button"
                        onClick={() => setMetalSourceHex(preset.hex)}
                        title={`${preset.label} (${preset.hex})`}
                        className={`h-8 w-8 rounded-full border shadow-sm transition-transform hover:scale-110 ${
                          metalSourceHex.toUpperCase() === preset.hex
                            ? "ring-2 ring-primary ring-offset-2"
                            : ""
                        }`}
                        style={{ backgroundColor: preset.hex }}
                      />
                    ))}
                  </div>
                  <Input
                    placeholder="Auto-detect"
                    value={metalSourceHex}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw.trim() === "") {
                        setMetalSourceHex("");
                        return;
                      }
                      const next = normalizeHex(raw);
                      setMetalSourceHex(
                        next.length === 6
                          ? next.startsWith("#")
                            ? next
                            : `#${next}`
                          : raw
                      );
                    }}
                    className="max-w-[160px] font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Match precision</Label>
                  <div className="flex flex-wrap gap-2">
                    {TOLERANCE_OPTIONS.map((opt) => (
                      <Button
                        key={opt.value}
                        type="button"
                        size="sm"
                        variant={hueTolerance === opt.value ? "default" : "outline"}
                        onClick={() => setHueTolerance(opt.value)}
                        title={opt.hint}
                      >
                        {opt.label}
                      </Button>
                    ))}
                  </div>
                </div>
                <Button
                  className="w-full"
                  onClick={handleApplyMetal}
                  disabled={!token || !isValidMetalHex || !isValidMetalSource || showOriginal}
                >
                  Apply metal colour
                </Button>
              </TabsContent>

              <TabsContent value="blur" className="space-y-4 pt-2">
                <p className="text-sm text-muted-foreground">
                  Paint over dark or white metal patches on the preview, then apply.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={brushMode === "paint" ? "default" : "outline"}
                    className="gap-2"
                    onClick={() => setBrushMode("paint")}
                    disabled={showOriginal}
                  >
                    <Brush className="h-4 w-4" /> Paint
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={brushMode === "erase" ? "default" : "outline"}
                    className="gap-2"
                    onClick={() => setBrushMode("erase")}
                    disabled={showOriginal}
                  >
                    <Eraser className="h-4 w-4" /> Erase
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-2"
                    onClick={clearPaint}
                    disabled={!hasPaint || showOriginal}
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
                      naturalSize
                        ? Math.round(Math.min(naturalSize.w, naturalSize.h) * 0.12)
                        : 120
                    )}
                    step={1}
                    disabled={showOriginal}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Label>Merge strength</Label>
                    <span className="text-sm text-muted-foreground">{blurStrength.toFixed(2)}</span>
                  </div>
                  <Slider
                    value={[blurStrength]}
                    onValueChange={(v) => setBlurStrength(v[0] ?? 0.9)}
                    min={0.1}
                    max={1}
                    step={0.05}
                    disabled={showOriginal}
                  />
                </div>
                <div className="space-y-2">
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
                    disabled={showOriginal}
                  />
                </div>
                <Button
                  className="w-full"
                  onClick={handleApplyBlur}
                  disabled={!token || !hasPaint || showOriginal}
                >
                  Apply blur merge
                </Button>
              </TabsContent>

              <TabsContent value="shadow" className="space-y-4 pt-2">
                <p className="text-sm text-muted-foreground">
                  Paint over contact shadows on the surface. They merge into nearby background
                  colour — the jewellery is left untouched.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={brushMode === "paint" ? "default" : "outline"}
                    className="gap-2"
                    onClick={() => setBrushMode("paint")}
                    disabled={showOriginal}
                  >
                    <Brush className="h-4 w-4" /> Paint
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={brushMode === "erase" ? "default" : "outline"}
                    className="gap-2"
                    onClick={() => setBrushMode("erase")}
                    disabled={showOriginal}
                  >
                    <Eraser className="h-4 w-4" /> Erase
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-2"
                    onClick={clearPaint}
                    disabled={!hasPaint || showOriginal}
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
                      naturalSize
                        ? Math.round(Math.min(naturalSize.w, naturalSize.h) * 0.12)
                        : 120
                    )}
                    step={1}
                    disabled={showOriginal}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Label>Soften strength</Label>
                    <span className="text-sm text-muted-foreground">{shadowStrength.toFixed(2)}</span>
                  </div>
                  <Slider
                    value={[shadowStrength]}
                    onValueChange={(v) => setShadowStrength(v[0] ?? 0.9)}
                    min={0.1}
                    max={1}
                    step={0.05}
                    disabled={showOriginal}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Label>Shadow sensitivity</Label>
                    <span className="text-sm text-muted-foreground">{shadowDarkRatio.toFixed(2)}</span>
                  </div>
                  <Slider
                    value={[shadowDarkRatio]}
                    onValueChange={(v) => setShadowDarkRatio(v[0] ?? 0.9)}
                    min={0.6}
                    max={0.98}
                    step={0.02}
                    disabled={showOriginal}
                  />
                  <p className="text-xs text-muted-foreground">
                    Higher catches fainter contact shadows on the plate.
                  </p>
                </div>
                <Button
                  className="w-full"
                  onClick={handleApplyShadow}
                  disabled={!token || !hasPaint || showOriginal}
                >
                  Soften surface shadows
                </Button>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
