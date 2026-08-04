import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  apiGetBackgroundImages,
  apiGenerateVideo,
  downloadMedia,
  getPresignedUrl,
  type VeoCameraStyle,
} from "@/lib/api";
import { createDisplayableImageObjectUrl } from "@/lib/heicImage";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Check, Download, ImageIcon, Loader2, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";

const MODEL_TRY_ON_VIDEO_FRONT_IMAGE_S3KEY_STORAGE_KEY = "auro:modelTryOnVideo:frontImageS3Key";

const ASPECT_RATIO_OPTIONS: { value: "16:9" | "9:16"; label: string }[] = [
  { value: "16:9", label: "16:9 (required for adult try-on video)" },
  { value: "9:16", label: "9:16" },
];


const CAMERA_OPTIONS: { value: VeoCameraStyle; label: string }[] = [
  { value: "editorial", label: "Editorial slow cinematic pans with smooth movement" },
  { value: "fashion_film", label: "Dynamic fashion-film style with subtle handheld movement" },
  { value: "commercial", label: "Clean locked-off commercial lookbook framing" },
  { value: "360_arc", label: "Smooth 360-degree arc shot revealing all angles of the piece" },
];

type Slot = "front" | "back";

export default function ModelTryOnVideo() {
  const { token } = useAuth();
  const { toast } = useToast();

  const [frontFile, setFrontFile] = useState<File | null>(null);
  const [frontPreview, setFrontPreview] = useState<string | null>(null);
  const [backFile, setBackFile] = useState<File | null>(null);
  const [backPreview, setBackPreview] = useState<string | null>(null);
  const [backgroundKeys, setBackgroundKeys] = useState<string[]>([]);
  const [backgroundUrls, setBackgroundUrls] = useState<Record<string, string>>({});
  const [selectedBackground, setSelectedBackground] = useState<string | null>(null);
  const [backgroundsLoading, setBackgroundsLoading] = useState(true);
  const [useBackground, setUseBackground] = useState(false);

  const [aspectRatio, setAspectRatio] = useState<"16:9" | "9:16">("16:9");
  const [cameraStyle, setCameraStyle] = useState<VeoCameraStyle>("editorial");
  const [type, setType] = useState<"adult" | "child" | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generatedVideo, setGeneratedVideo] = useState<{ s3Key: string; url: string } | null>(null);
  const [downloadingVideo, setDownloadingVideo] = useState(false);
  const isTypeSelected = type !== null;
  const isChildType = type === "child";

  const handleFileSelect = async (file: File | null, slot: Slot) => {
    if (!file) return;
    try {
      const url = await createDisplayableImageObjectUrl(file);
      if (slot === "front") {
        if (frontPreview) URL.revokeObjectURL(frontPreview);
        setFrontFile(file);
        setFrontPreview(url);
      } else if (slot === "back") {
        if (backPreview) URL.revokeObjectURL(backPreview);
        setBackFile(file);
        setBackPreview(url);
      }
    } catch {
      toast({ title: "Could not load image", description: "Please try a different file.", variant: "destructive" });
    }
  };

  useEffect(() => {
    // Allow other screens (e.g. carousel "Edit video") to prefill the front image.
    if (!token) return;
    const s3Key = (() => {
      try {
        return window.localStorage.getItem(MODEL_TRY_ON_VIDEO_FRONT_IMAGE_S3KEY_STORAGE_KEY);
      } catch {
        return null;
      }
    })();
    if (!s3Key) return;

    (async () => {
      try {
        const blob = await downloadMedia(token, s3Key);
        const contentType = blob.type || "image/jpeg";
        const ext = contentType.split("/")[1] || "jpg";
        const file = new File([blob], `try-on-front.${ext}`, { type: contentType });
        await handleFileSelect(file, "front");
      } catch (err: unknown) {
        toast({
          title: "Could not load image",
          description: "Please try selecting the image again.",
          variant: "destructive",
        });
      } finally {
        try {
          window.localStorage.removeItem(MODEL_TRY_ON_VIDEO_FRONT_IMAGE_S3KEY_STORAGE_KEY);
        } catch {
          // ignore
        }
      }
    })();
  }, [token, toast]);

  useEffect(() => {
    return () => {
      if (frontPreview) URL.revokeObjectURL(frontPreview);
      if (backPreview) URL.revokeObjectURL(backPreview);
    };
  }, [frontPreview, backPreview]);

  useEffect(() => {
    if (!isChildType) return;
    if (aspectRatio !== "9:16") setAspectRatio("9:16");
    if (backFile || backPreview) clearSlot("back");
    if (useBackground) setUseBackground(false);
    if (selectedBackground) setSelectedBackground(null);
  }, [aspectRatio, backFile, backPreview, isChildType, selectedBackground, useBackground]);

  useEffect(() => {
    if (type === "adult" && aspectRatio !== "16:9") {
      setAspectRatio("16:9");
    }
  }, [type, aspectRatio]);

  useEffect(() => {
    if (!token) return;
    setBackgroundsLoading(true);
    apiGetBackgroundImages(token)
      .then(async (data) => {
        const keys = data.map((d) => d.Key);
        setBackgroundKeys(keys);
        const urlEntries = await Promise.all(
          keys.map(async (key) => {
            try {
              const url = await getPresignedUrl(token, key);
              return [key, url] as [string, string];
            } catch {
              return [key, ""] as [string, string];
            }
          })
        );
        setBackgroundUrls(Object.fromEntries(urlEntries));
      })
      .catch((err: unknown) =>
        toast({
          title: "Error",
          description: err instanceof Error ? err.message : "Failed to load background images",
          variant: "destructive",
        })
      )
      .finally(() => setBackgroundsLoading(false));
  }, [token, toast]);

  const clearSlot = (slot: Slot) => {
    if (slot === "front") {
      if (frontPreview) URL.revokeObjectURL(frontPreview);
      setFrontFile(null);
      setFrontPreview(null);
    } else if (slot === "back") {
      if (backPreview) URL.revokeObjectURL(backPreview);
      setBackFile(null);
      setBackPreview(null);
    }
  };

  const handleGenerate = async () => {
    if (!type) {
      toast({
        title: "Missing type",
        description: "Please select type first.",
        variant: "destructive",
      });
      return;
    }
    if (!token || !frontFile) {
      toast({
        title: "Missing image",
        description: "Please upload the model try-on front image.",
        variant: "destructive",
      });
      return;
    }
    setGenerating(true);
    setGeneratedVideo(null);
    try {
      const video = await apiGenerateVideo(token, frontFile, {
        backImage: backFile,
        backgroundS3Key: useBackground ? selectedBackground : null,
        aspectRatio,
        cameraStyle,
        type,
      });
      setGeneratedVideo({ s3Key: video.s3_key, url: video.url });
      toast({ title: "Video ready", description: "Your generated video is below." });
    } catch (err: unknown) {
      toast({
        title: "Generation failed",
        description: err instanceof Error ? err.message : "Something went wrong.",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleDownloadGeneratedVideo = async () => {
    if (!token || !generatedVideo) return;
    setDownloadingVideo(true);
    try {
      const blob = await downloadMedia(token, generatedVideo.s3Key);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      const baseName = generatedVideo.s3Key.split("/").pop() || "generated-video";
      const dotIndex = baseName.lastIndexOf(".");
      const withoutExt = dotIndex > 0 ? baseName.slice(0, dotIndex) : baseName;
      anchor.download = `${withoutExt || "generated-video"}.mp4`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url); 
    } catch {
      toast({
        title: "Download failed",
        description: "Could not download generated video.",
        variant: "destructive",
      });   
    } finally {
      setDownloadingVideo(false);
    }
  };

  const uploadSlot = (
    slot: Slot,
    title: string,
    required: boolean,
    preview: string | null,
    hasFile: boolean,
    disabled = false
  ) => (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-medium">
          <Upload className="h-4 w-4 shrink-0" />
          {title}
          {required ? <span className="text-destructive">*</span> : <span className="text-muted-foreground font-normal">(optional)</span>}
        </CardTitle>
        {hasFile && !disabled && (
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => clearSlot(slot)} aria-label={`Remove ${title}`}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <label
          className={cn(
            "flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/20 p-6 transition",
            disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:border-primary/50 hover:bg-muted/40"
          )}
        >
          {preview ? (
            <img src={preview} alt="" className="max-h-48 w-full rounded object-contain" />
          ) : (
            <>
              <ImageIcon className="mb-2 h-10 w-10 text-muted-foreground" />
              <span className="text-center text-sm text-muted-foreground">
                {disabled ? "Disabled for this model type" : "Click to upload"}
              </span>
            </>
          )}
          <input
            type="file"
            accept="image/*,.heic,.heif"
            className="hidden"
            disabled={disabled}
            onChange={(e) => void handleFileSelect(e.target.files?.[0] || null, slot)}
          />
        </label>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">

<Card>
        <CardHeader>
          <CardTitle className="text-base">Video options</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-2">
            <Label htmlFor="veo-aspect-ratio">Model Age</Label>
            <Select value={type ?? undefined} onValueChange={(v) => setType(v as "adult" | "child")}>
              <SelectTrigger id="veo-type">
                <SelectValue placeholder="Select model age" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="adult">Adult</SelectItem>
                <SelectItem value="child">Child</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="veo-aspect-ratio">Aspect ratio</Label>
            <Select
              value={aspectRatio}
              onValueChange={(v) => setAspectRatio(v as "16:9" | "9:16")}
              disabled={!isTypeSelected || isChildType || type === "adult"}
            >
              <SelectTrigger id="veo-aspect-ratio">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(type === "adult"
                  ? ASPECT_RATIO_OPTIONS.filter((o) => o.value === "16:9")
                  : ASPECT_RATIO_OPTIONS
                ).map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {type === "adult" && (
              <p className="text-xs text-muted-foreground">
                Only supports 16:9 aspect ratio for reference images.
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="veo-camera">Camera style</Label>
            <Select value={cameraStyle} onValueChange={(v) => setCameraStyle(v as VeoCameraStyle)} disabled={!isTypeSelected}>
              <SelectTrigger id="veo-camera">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CAMERA_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {uploadSlot("front", "Model try-on front", true, frontPreview, !!frontFile, !isTypeSelected)}
        {uploadSlot("back", "Model try-on back", false, backPreview, !!backFile, !isTypeSelected || isChildType)}
      </div>

      <Card className={cn("mx-auto w-full", (!useBackground || !isTypeSelected || isChildType) && "opacity-50")}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Background (optional)</CardTitle>
            <div className="flex items-center gap-2">
              <Checkbox
                id="useBackgroundVideo"
                checked={useBackground}
                disabled={!isTypeSelected || isChildType}
                onCheckedChange={(v) => {
                  const next = !!v;
                  setUseBackground(next);
                  if (!next) setSelectedBackground(null);
                }}
              />
              <Label htmlFor="useBackgroundVideo" className="text-xs">
                Use background (not available for child models)
              </Label>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className={!useBackground || !isTypeSelected || isChildType ? "pointer-events-none select-none" : ""}>
            {backgroundsLoading ? (
              <div className="grid grid-cols-4 gap-3 sm:grid-cols-5 md:grid-cols-6">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="aspect-[3/4] w-full rounded-lg" />
                ))}
              </div>
            ) : backgroundKeys.length === 0 ? (
              <p className="text-sm text-muted-foreground">No background images found.</p>
            ) : (
              <div className="grid grid-cols-4 gap-3 sm:grid-cols-5 md:grid-cols-6">
                {backgroundKeys.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedBackground((prev) => (prev === key ? null : key))}
                    className={cn(
                      "group relative aspect-[3/4] overflow-hidden rounded-lg border-2 transition",
                      selectedBackground === key
                        ? "border-primary ring-2 ring-primary/30"
                        : "border-transparent hover:border-muted-foreground/30"
                    )}
                  >
                    {backgroundUrls[key] ? (
                      <img src={backgroundUrls[key]} alt="Background" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-muted">
                        <ImageIcon className="h-8 w-8 text-muted-foreground" />
                      </div>
                    )}
                    {selectedBackground === key && (
                      <div className="absolute inset-0 flex items-center justify-center bg-primary/20">
                        <Check className="h-8 w-8 text-primary-foreground drop-shadow-md" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      

      <div className="flex justify-center">
        <Button
          size="lg"
          className="min-w-[220px]"
          onClick={handleGenerate}
          disabled={generating || !frontFile || !token || !isTypeSelected}
        >
          {generating ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Generating. This may take a while…
            </>
          ) : (
            "Generate video"
          )}
        </Button>
      </div>

      {generatedVideo !== null && (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
            <CardTitle className="text-base">Generated video</CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={handleDownloadGeneratedVideo}
              disabled={!generatedVideo || downloadingVideo || !isTypeSelected}
            >
              {downloadingVideo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {downloadingVideo ? "Downloading…" : "Download"}
            </Button>
          </CardHeader>
          <CardContent>
            <video
              key={generatedVideo.url}
              src={generatedVideo.url}
              controls
              playsInline
              className="aspect-video w-full max-h-[min(32rem,70vh)] rounded-md border bg-black object-contain"
            >
              Your browser does not support embedded video.
            </video>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
