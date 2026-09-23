import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ImageIcon, Loader2, Video } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useGenerationQueue } from "@/contexts/GenerationQueueContext";
import { useToast } from "@/hooks/use-toast";
import {
  apiGenerateCampaignVideo,
  apiGetBackgroundImages,
  apiListBrandKits,
  apiListProductBrandKits,
  getPresignedUrl,
  type BackgroundMode,
  type BrandKitRecord,
  type CustomBackgroundInput,
  type GenerationJob,
  type ProductBrandKitRecord,
  type VideoCampaignAspect,
  type VideoCampaignDuration,
  type VideoCampaignMode,
} from "@/lib/api";
import { cn } from "@/lib/utils";

const NO_BRAND_KIT = "__none__";

export type VideoCampaignSource = {
  s3Key: string;
  imageUrl?: string | null;
  galleryUid?: string | null;
  catalogueItemUid?: string | null;
  productId?: string | null;
  /** When set, locks the mode radio. */
  defaultMode?: VideoCampaignMode;
  allowModeChange?: boolean;
  extraReferenceS3Keys?: string[];
};

type Props = {
  token: string | null;
  source: VideoCampaignSource | null;
  /** When false, skip kit/background/preview fetches (e.g. dialog closed). */
  active?: boolean;
  showSourcePreview?: boolean;
  /** Allow editing Product ID when source has none or for standalone shoots. */
  showProductIdField?: boolean;
  submitLabel?: string;
  cancelLabel?: string;
  onCancel?: () => void;
  onSuccess?: (job: GenerationJob) => void;
};

export default function VideoCampaignForm({
  token,
  source,
  active = true,
  showSourcePreview = true,
  showProductIdField = false,
  submitLabel = "Generate video",
  cancelLabel,
  onCancel,
  onSuccess,
}: Props) {
  const { toast } = useToast();
  const { trackJob } = useGenerationQueue();

  const [videoMode, setVideoMode] = useState<VideoCampaignMode>("product");
  const [duration, setDuration] = useState<VideoCampaignDuration>(8);
  const [aspectRatio, setAspectRatio] = useState<VideoCampaignAspect>("16:9");
  const [backgroundMode, setBackgroundMode] = useState<BackgroundMode>("white");
  const [backgroundInputMode, setBackgroundInputMode] = useState<CustomBackgroundInput>("description");
  const [backgroundText, setBackgroundText] = useState("");
  const [backgroundFile, setBackgroundFile] = useState<File | null>(null);
  const [backgroundPreviewUrl, setBackgroundPreviewUrl] = useState<string | null>(null);
  const [selectedBackground, setSelectedBackground] = useState<string | null>(null);
  const [backgroundKeys, setBackgroundKeys] = useState<string[]>([]);
  const [backgroundUrls, setBackgroundUrls] = useState<Record<string, string>>({});
  const [backgroundsLoading, setBackgroundsLoading] = useState(false);
  const [modelKits, setModelKits] = useState<BrandKitRecord[]>([]);
  const [productKits, setProductKits] = useState<ProductBrandKitRecord[]>([]);
  const [selectedBrandKitUid, setSelectedBrandKitUid] = useState<string>(NO_BRAND_KIT);
  const [productId, setProductId] = useState("");
  const [sourcePreviewUrl, setSourcePreviewUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const backgroundInputRef = useRef<HTMLInputElement>(null);

  const allowModeChange = source?.allowModeChange !== false;
  const kits = videoMode === "on_model" ? modelKits : productKits;

  useEffect(() => {
    if (!active || !source) return;
    setVideoMode(source.defaultMode ?? "product");
    setDuration(8);
    setAspectRatio("16:9");
    setBackgroundMode("white");
    setBackgroundInputMode("description");
    setBackgroundText("");
    setBackgroundFile(null);
    setSelectedBackground(null);
    setSelectedBrandKitUid(NO_BRAND_KIT);
    setProductId(source.productId?.trim() ?? "");
  }, [active, source]);

  useEffect(() => {
    if (!backgroundFile) {
      setBackgroundPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(backgroundFile);
    setBackgroundPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [backgroundFile]);

  useEffect(() => {
    if (!active || !token || !source?.s3Key) {
      setSourcePreviewUrl(null);
      return;
    }
    if (source.imageUrl) {
      setSourcePreviewUrl(source.imageUrl);
      return;
    }
    let cancelled = false;
    getPresignedUrl(token, source.s3Key)
      .then((url) => {
        if (!cancelled) setSourcePreviewUrl(url);
      })
      .catch(() => {
        if (!cancelled) setSourcePreviewUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [active, token, source?.s3Key, source?.imageUrl]);

  useEffect(() => {
    if (!active || !token) return;
    let cancelled = false;
    if (videoMode === "on_model") {
      apiListBrandKits(token)
        .then((list) => {
          if (cancelled) return;
          setModelKits(list);
          const activeKit = list.find((k) => k.is_active);
          if (activeKit) setSelectedBrandKitUid(activeKit.uid);
        })
        .catch(() => {
          if (!cancelled) setModelKits([]);
        });
    } else {
      apiListProductBrandKits(token)
        .then((list) => {
          if (cancelled) return;
          setProductKits(list);
          const activeKit = list.find((k) => k.is_active);
          if (activeKit) setSelectedBrandKitUid(activeKit.uid);
        })
        .catch(() => {
          if (!cancelled) setProductKits([]);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [active, token, videoMode]);

  useEffect(() => {
    if (!active || !token || backgroundMode !== "custom" || backgroundInputMode !== "preset") {
      return;
    }
    let cancelled = false;
    setBackgroundsLoading(true);
    apiGetBackgroundImages(token)
      .then(async (data) => {
        const keys = data.map((d) => d.Key);
        if (cancelled) return;
        setBackgroundKeys(keys);
        const urlEntries = await Promise.all(
          keys.map(async (key) => {
            try {
              return [key, await getPresignedUrl(token, key)] as [string, string];
            } catch {
              return [key, ""] as [string, string];
            }
          }),
        );
        if (!cancelled) setBackgroundUrls(Object.fromEntries(urlEntries));
      })
      .catch(() => {
        if (!cancelled) {
          setBackgroundKeys([]);
          setBackgroundUrls({});
        }
      })
      .finally(() => {
        if (!cancelled) setBackgroundsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [active, token, backgroundMode, backgroundInputMode]);

  const canSubmit = useMemo(() => {
    if (!token || !source?.s3Key || submitting) return false;
    if (backgroundMode === "brand_kit" && selectedBrandKitUid === NO_BRAND_KIT) return false;
    if (backgroundMode === "custom") {
      if (backgroundInputMode === "description" && !backgroundText.trim()) return false;
      if (backgroundInputMode === "upload" && !backgroundFile) return false;
      if (backgroundInputMode === "preset" && !selectedBackground) return false;
    }
    return true;
  }, [
    token,
    source?.s3Key,
    submitting,
    backgroundMode,
    selectedBrandKitUid,
    backgroundInputMode,
    backgroundText,
    backgroundFile,
    selectedBackground,
  ]);

  const handleGenerate = async () => {
    if (!token || !source?.s3Key || !canSubmit) return;
    setSubmitting(true);
    try {
      const resolvedProductId = showProductIdField
        ? productId.trim() || null
        : source.productId?.trim() || null;
      const job = await apiGenerateCampaignVideo(token, {
        sourceS3Key: source.s3Key,
        videoMode,
        durationSeconds: duration,
        aspectRatio,
        backgroundMode,
        brandKitUid:
          backgroundMode === "brand_kit" || selectedBrandKitUid !== NO_BRAND_KIT
            ? selectedBrandKitUid === NO_BRAND_KIT
              ? null
              : selectedBrandKitUid
            : null,
        backgroundText:
          backgroundMode === "custom" && backgroundInputMode === "description"
            ? backgroundText
            : undefined,
        backgroundFile:
          backgroundMode === "custom" && backgroundInputMode === "upload" ? backgroundFile : null,
        backgroundS3Key:
          backgroundMode === "custom" && backgroundInputMode === "preset"
            ? selectedBackground
            : null,
        productId: resolvedProductId,
        galleryUid: source.galleryUid,
        catalogueItemUid: source.catalogueItemUid,
        extraReferenceS3Keys: source.extraReferenceS3Keys,
      });
      trackJob(job);
      toast({
        title: "Campaign video queued",
        description: "Veo 3.1 is generating your studio campaign clip.",
      });
      onSuccess?.(job);
    } catch (err) {
      toast({
        title: "Could not queue video",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {showSourcePreview ? (
        <div className="overflow-hidden rounded-lg border bg-muted/20">
          {sourcePreviewUrl ? (
            <img
              src={sourcePreviewUrl}
              alt="Source still"
              className="mx-auto max-h-56 w-full object-contain"
            />
          ) : (
            <div className="flex h-36 items-center justify-center text-sm text-muted-foreground">
              Source preview
            </div>
          )}
        </div>
      ) : null}

      <div className="space-y-2">
        <Label className="text-sm font-medium">Video type</Label>
        <RadioGroup
          value={videoMode}
          onValueChange={(v) => {
            if (!allowModeChange) return;
            setVideoMode(v as VideoCampaignMode);
            setSelectedBrandKitUid(NO_BRAND_KIT);
          }}
          className="grid grid-cols-2 gap-2"
        >
          <label
            className={cn(
              "flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2",
              !allowModeChange && videoMode !== "product" && "opacity-50",
            )}
          >
            <RadioGroupItem
              value="product"
              id="video-mode-product"
              disabled={!allowModeChange && videoMode !== "product"}
            />
            <div>
              <p className="text-sm font-medium">Product only</p>
              <p className="text-xs text-muted-foreground">From product shoot still</p>
            </div>
          </label>
          <label
            className={cn(
              "flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2",
              !allowModeChange && videoMode !== "on_model" && "opacity-50",
            )}
          >
            <RadioGroupItem
              value="on_model"
              id="video-mode-model"
              disabled={!allowModeChange && videoMode !== "on_model"}
            />
            <div>
              <p className="text-sm font-medium">On-model</p>
              <p className="text-xs text-muted-foreground">From model shoot still</p>
            </div>
          </label>
        </RadioGroup>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Duration</Label>
          <Select
            value={String(duration)}
            onValueChange={(v) => setDuration(Number(v) as VideoCampaignDuration)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="8">8 seconds</SelectItem>
              <SelectItem value="15">15 seconds</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Aspect ratio</Label>
          <Select
            value={aspectRatio}
            onValueChange={(v) => setAspectRatio(v as VideoCampaignAspect)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="16:9">16:9 landscape</SelectItem>
              <SelectItem value="9:16">9:16 portrait</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {showProductIdField ? (
        <div className="space-y-1.5">
          <Label htmlFor="video-product-id" className="text-sm font-medium">
            Product ID <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="video-product-id"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            placeholder="Link video to a product SKU"
          />
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label className="text-sm font-medium">
          {videoMode === "on_model" ? "Model brand kit" : "Product brand kit"}
        </Label>
        <Select value={selectedBrandKitUid} onValueChange={setSelectedBrandKitUid}>
          <SelectTrigger>
            <SelectValue placeholder="Select brand kit" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_BRAND_KIT}>No brand kit</SelectItem>
            {kits.map((kit) => (
              <SelectItem key={kit.uid} value={kit.uid}>
                {kit.name}
                {kit.is_active ? " (active)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3 rounded-lg border bg-muted/20 px-4 py-3">
        <div className="space-y-1">
          <p className="text-sm font-medium">Background</p>
          <p className="text-xs text-muted-foreground">
            White studio, brand kit set, or your own backdrop.
          </p>
        </div>
        <RadioGroup
          value={backgroundMode}
          onValueChange={(v) => setBackgroundMode(v as BackgroundMode)}
          className="space-y-2"
        >
          <label className="flex cursor-pointer items-start gap-3 rounded-md border bg-background/60 px-3 py-2">
            <RadioGroupItem value="white" id="video-bg-white" className="mt-0.5" />
            <div>
              <Label htmlFor="video-bg-white" className="cursor-pointer text-sm font-medium">
                White
              </Label>
              <p className="text-xs text-muted-foreground">Pure white studio cyclorama.</p>
            </div>
          </label>
          <label className="flex cursor-pointer items-start gap-3 rounded-md border bg-background/60 px-3 py-2">
            <RadioGroupItem value="brand_kit" id="video-bg-brand" className="mt-0.5" />
            <div>
              <Label htmlFor="video-bg-brand" className="cursor-pointer text-sm font-medium">
                Infer from brand kit
              </Label>
              <p className="text-xs text-muted-foreground">
                {videoMode === "on_model"
                  ? "Match the model brand kit set aesthetic."
                  : "Match the product brand kit surface treatment."}
              </p>
            </div>
          </label>
          <label className="flex cursor-pointer items-start gap-3 rounded-md border bg-background/60 px-3 py-2">
            <RadioGroupItem value="custom" id="video-bg-custom" className="mt-0.5" />
            <div>
              <Label htmlFor="video-bg-custom" className="cursor-pointer text-sm font-medium">
                Choose your own
              </Label>
              <p className="text-xs text-muted-foreground">
                Describe, upload, or pick a preset background.
              </p>
            </div>
          </label>
        </RadioGroup>
      </div>

      {backgroundMode === "custom" && (
        <div className="space-y-4 rounded-lg border bg-muted/10 p-4">
          <div className="flex flex-wrap gap-4">
            {(
              [
                ["description", "Describe"],
                ["upload", "Upload image"],
                ["preset", "Preset backgrounds"],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="video-bg-input"
                  checked={backgroundInputMode === value}
                  onChange={() => {
                    setBackgroundInputMode(value);
                    setBackgroundFile(null);
                    setSelectedBackground(null);
                  }}
                  className="h-4 w-4"
                />
                {label}
              </label>
            ))}
          </div>

          {backgroundInputMode === "description" ? (
            <Textarea
              value={backgroundText}
              onChange={(e) => setBackgroundText(e.target.value)}
              placeholder="e.g. Soft blush-pink silk fabric with gentle folds"
              rows={3}
            />
          ) : backgroundInputMode === "upload" ? (
            <label className="flex min-h-[120px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/20 p-4">
              {backgroundPreviewUrl ? (
                <img
                  src={backgroundPreviewUrl}
                  alt="Background preview"
                  className="max-h-24 w-full rounded object-contain"
                />
              ) : (
                <>
                  <ImageIcon className="mb-2 h-7 w-7 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Upload background reference</span>
                </>
              )}
              <input
                ref={backgroundInputRef}
                type="file"
                accept="image/*,.heic,.heif"
                className="hidden"
                onChange={(e) => setBackgroundFile(e.target.files?.[0] || null)}
              />
            </label>
          ) : backgroundsLoading ? (
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="aspect-[3/4] w-full rounded-lg" />
              ))}
            </div>
          ) : backgroundKeys.length === 0 ? (
            <p className="text-sm text-muted-foreground">No preset backgrounds found.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {backgroundKeys.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedBackground((prev) => (prev === key ? null : key))}
                  className={cn(
                    "relative aspect-[3/4] overflow-hidden rounded-lg border-2",
                    selectedBackground === key
                      ? "border-primary ring-2 ring-primary/30"
                      : "border-transparent hover:border-muted-foreground/30",
                  )}
                >
                  {backgroundUrls[key] ? (
                    <img src={backgroundUrls[key]} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-muted">
                      <ImageIcon className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                  {selectedBackground === key && (
                    <div className="absolute inset-0 flex items-center justify-center bg-primary/20">
                      <Check className="h-6 w-6 text-primary-foreground drop-shadow" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap justify-end gap-2 pt-2">
        {onCancel ? (
          <Button type="button" variant="outline" disabled={submitting} onClick={onCancel}>
            {cancelLabel ?? "Cancel"}
          </Button>
        ) : null}
        <Button type="button" disabled={!canSubmit} onClick={() => void handleGenerate()}>
          {submitting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Video className="mr-2 h-4 w-4" />
          )}
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}
