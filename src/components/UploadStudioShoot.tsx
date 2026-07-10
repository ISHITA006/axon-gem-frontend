import { useEffect, useState } from "react";
import { ImageIcon, Loader2, Upload } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  apiCreateStudioShoot,
  apiListProductBrandKits,
  getPresignedUrl,
  TRY_ON_ASPECT_RATIOS,
  TRY_ON_OUTPUT_QUALITIES,
  type ProductBrandKitRecord,
  type StudioShootResult,
  type TryOnAspectRatio,
  type TryOnOutputQuality,
} from "@/lib/api";
import StudioShootResults from "@/components/StudioShootResults";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { createDisplayableImageObjectUrl } from "@/lib/heicImage";

export default function UploadStudioShoot() {
  const { token } = useAuth();
  const { toast } = useToast();
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [sideViewFile, setSideViewFile] = useState<File | null>(null);
  const [generateSideView, setGenerateSideView] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<TryOnAspectRatio>("2:3");
  const [outputQuality, setOutputQuality] = useState<TryOnOutputQuality>("2K");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [sidePreviewUrl, setSidePreviewUrl] = useState<string | null>(null);
  const [shooting, setShooting] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [results, setResults] = useState<StudioShootResult | null>(null);

  const NO_BRAND_KIT = "none";
  const [brandKits, setBrandKits] = useState<ProductBrandKitRecord[]>([]);
  const [selectedBrandKitUid, setSelectedBrandKitUid] = useState<string>(NO_BRAND_KIT);
  const [ensureWhiteBackground, setEnsureWhiteBackground] = useState(false);
  const [useCustomBackground, setUseCustomBackground] = useState(false);
  const [backgroundInputMode, setBackgroundInputMode] = useState<"description" | "image">("description");
  const [backgroundText, setBackgroundText] = useState("");
  const [backgroundFile, setBackgroundFile] = useState<File | null>(null);
  const [backgroundPreviewUrl, setBackgroundPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    apiListProductBrandKits(token)
      .then((kits) => {
        setBrandKits(kits);
        if (ensureWhiteBackground) return;
        const active = kits.find((kit) => kit.is_active);
        if (active) setSelectedBrandKitUid(active.uid);
      })
      .catch(() => {
        // Product brand kits are optional — silently ignore load failures.
      });
  }, [token, ensureWhiteBackground]);

  const handleEnsureWhiteBackgroundChange = (checked: boolean) => {
    setEnsureWhiteBackground(checked);
    if (checked) {
      setSelectedBrandKitUid(NO_BRAND_KIT);
      setUseCustomBackground(false);
      setBackgroundText("");
      setBackgroundFile(null);
      return;
    }
    const active = brandKits.find((kit) => kit.is_active);
    if (active) setSelectedBrandKitUid(active.uid);
  };

  const handleUseCustomBackgroundChange = (checked: boolean) => {
    setUseCustomBackground(checked);
    if (checked) {
      setEnsureWhiteBackground(false);
      const active = brandKits.find((kit) => kit.is_active);
      if (active && selectedBrandKitUid === NO_BRAND_KIT) {
        setSelectedBrandKitUid(active.uid);
      }
      return;
    }
    setBackgroundText("");
    setBackgroundFile(null);
    setBackgroundInputMode("description");
  };

  const handleBackgroundInputModeChange = (mode: "description" | "image") => {
    setBackgroundInputMode(mode);
    if (mode === "description") {
      setBackgroundFile(null);
    } else {
      setBackgroundText("");
    }
  };

  useEffect(() => {
    if (!imageFile) {
      setPreviewUrl(null);
      return;
    }
    let cancelled = false;
    let createdUrl: string | null = null;
    void createDisplayableImageObjectUrl(imageFile)
      .then((url) => {
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        createdUrl = url;
        setPreviewUrl(url);
      })
      .catch(() => {
        if (!cancelled) setPreviewUrl(null);
      });
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [imageFile]);

  useEffect(() => {
    if (!sideViewFile) {
      setSidePreviewUrl(null);
      return;
    }
    let cancelled = false;
    let createdUrl: string | null = null;
    void createDisplayableImageObjectUrl(sideViewFile)
      .then((url) => {
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        createdUrl = url;
        setSidePreviewUrl(url);
      })
      .catch(() => {
        if (!cancelled) setSidePreviewUrl(null);
      });
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [sideViewFile]);

  useEffect(() => {
    if (!backgroundFile) {
      setBackgroundPreviewUrl(null);
      return;
    }
    let cancelled = false;
    let createdUrl: string | null = null;
    void createDisplayableImageObjectUrl(backgroundFile)
      .then((url) => {
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        createdUrl = url;
        setBackgroundPreviewUrl(url);
      })
      .catch(() => {
        if (!cancelled) setBackgroundPreviewUrl(null);
      });
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [backgroundFile]);

  const handleGenerateSideViewChange = (checked: boolean) => {
    setGenerateSideView(checked);
    if (!checked) {
      setSideViewFile(null);
    }
  };

  const handleGenerate = async () => {
    if (!token) return;
    if (!imageFile) {
      toast({
        title: "Image required",
        description: "Please upload a raw jewellery image first.",
        variant: "destructive",
      });
      return;
    }

    if (useCustomBackground) {
      if (backgroundInputMode === "description" && !backgroundText.trim()) {
        toast({
          title: "Background required",
          description: "Enter a background description.",
          variant: "destructive",
        });
        return;
      }
      if (backgroundInputMode === "image" && !backgroundFile) {
        toast({
          title: "Background required",
          description: "Upload a background reference image.",
          variant: "destructive",
        });
        return;
      }
    }

    setShooting(true);
    setShowResults(true);
    setResults(null);

    try {
      const shot = await apiCreateStudioShoot(token, imageFile, {
        generateSideView,
        sideViewFile: generateSideView ? sideViewFile : null,
        aspectRatio,
        outputQuality,
        brandKitUid: ensureWhiteBackground ? null : selectedBrandKitUid,
        backgroundText:
          useCustomBackground && backgroundInputMode === "description"
            ? backgroundText.trim()
            : undefined,
        backgroundFile:
          useCustomBackground && backgroundInputMode === "image" ? backgroundFile : null,
      });
      if (!shot.frontImageS3Key) {
        throw new Error("Front studio shoot image key not returned from API");
      }

      let frontUrl = shot.frontImageUrl;
      if (!frontUrl) {
        frontUrl = await getPresignedUrl(token, shot.frontImageS3Key);
      }

      let sideUrl = shot.sideImageUrl ?? null;
      if (shot.sideImageS3Key && !sideUrl) {
        sideUrl = await getPresignedUrl(token, shot.sideImageS3Key);
      }

      setResults({
        ...shot,
        frontImageUrl: frontUrl,
        sideImageUrl: sideUrl,
      });

      if (shot.status === "partial" && shot.sideError) {
        toast({
          title: "Partial success",
          description: "Front view is ready, but the side view could not be generated.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Studio shoot ready",
          description: generateSideView
            ? "Front and side studio shots are ready."
            : "Front studio shot is ready.",
        });
      }
    } catch (err: unknown) {
      setResults(null);
      setShowResults(false);
      toast({
        title: "Studio shoot failed",
        description: err instanceof Error ? err.message : "Could not create studio shoot",
        variant: "destructive",
      });
    } finally {
      setShooting(false);
    }
  };

  const handleBack = () => {
    setShowResults(false);
    setResults(null);
  };

  if (showResults) {
    return (
      <StudioShootResults
        loading={shooting}
        results={results}
        onBack={handleBack}
        token={token}
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Studio Shoot</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Reference images */}
        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium">Reference images</p>
            <p className="text-xs text-muted-foreground">
              Upload raw photos of the jewellery piece
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 md:items-stretch">
            <div className="flex flex-col gap-2">
              <Label htmlFor="front-view-upload">Front view *</Label>
              <label
                id="front-view-upload"
                className="flex min-h-[220px] flex-1 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/20 p-6 transition hover:border-primary/50 hover:bg-muted/40"
              >
                {previewUrl ? (
                  <img src={previewUrl} alt="Front view preview" className="max-h-48 w-full rounded object-contain" />
                ) : (
                  <>
                    <ImageIcon className="mb-2 h-10 w-10 text-muted-foreground" />
                    <span className="text-center text-sm text-muted-foreground">
                      Click to upload front view
                    </span>
                  </>
                )}
                <input
                  type="file"
                  accept="image/*,.heic,.heif"
                  className="hidden"
                  onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                />
              </label>
            </div>

            <div className="flex flex-col gap-2">
              <Label
                htmlFor={generateSideView ? "side-view-upload" : "generate-side-view"}
                className={generateSideView ? undefined : "text-muted-foreground"}
              >
                Side view{generateSideView ? " (optional reference)" : ""}
              </Label>
              <div className="flex min-h-[220px] flex-1 flex-col overflow-hidden rounded-lg border bg-muted/20">
                {generateSideView && (
                  <label
                    id="side-view-upload"
                    className="flex flex-1 cursor-pointer flex-col items-center justify-center border-b border-dashed border-muted-foreground/25 bg-muted/20 p-4 transition hover:border-primary/50 hover:bg-muted/40"
                  >
                      {sidePreviewUrl ? (
                        <img
                          src={sidePreviewUrl}
                          alt="Side view preview"
                          className="max-h-36 w-full rounded object-contain"
                        />
                      ) : (
                        <>
                          <ImageIcon className="mb-2 h-8 w-8 text-muted-foreground" />
                          <span className="text-center text-sm text-muted-foreground">
                            Click to upload side view
                          </span>
                          <span className="mt-1 text-center text-xs text-muted-foreground">
                            Improves profile-shot accuracy
                          </span>
                        </>
                      )}
                      <input
                        type="file"
                        accept="image/*,.heic,.heif"
                        className="hidden"
                        onChange={(e) => setSideViewFile(e.target.files?.[0] || null)}
                      />
                    </label>
                )}

                <div
                  className={
                    generateSideView
                      ? "flex shrink-0 items-start gap-3 px-4 py-3"
                      : "flex flex-1 items-center gap-3 px-4 py-6"
                  }
                >
                  <Checkbox
                    id="generate-side-view"
                    checked={generateSideView}
                    onCheckedChange={(checked) => handleGenerateSideViewChange(checked === true)}
                    className="mt-0.5"
                  />
                  <div className="space-y-1">
                    <Label htmlFor="generate-side-view" className="cursor-pointer text-sm leading-snug">
                      Also generate side view
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Adds a profile studio shot alongside the front hero image.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Output settings */}
        <div className="space-y-3">
          <p className="text-sm font-medium">Output settings</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="studioOutputQuality" className="text-sm font-medium">
                Output quality
              </Label>
              <Select
                value={outputQuality}
                onValueChange={(v) => setOutputQuality(v as TryOnOutputQuality)}
              >
                <SelectTrigger id="studioOutputQuality">
                  <SelectValue placeholder="Quality" />
                </SelectTrigger>
                <SelectContent>
                  {TRY_ON_OUTPUT_QUALITIES.map((quality) => (
                    <SelectItem key={quality} value={quality}>
                      {quality}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="studioAspectRatio" className="text-sm font-medium">
                Aspect ratio
              </Label>
              <Select
                value={aspectRatio}
                onValueChange={(v) => setAspectRatio(v as TryOnAspectRatio)}
              >
                <SelectTrigger id="studioAspectRatio">
                  <SelectValue placeholder="Aspect ratio" />
                </SelectTrigger>
                <SelectContent>
                  {TRY_ON_ASPECT_RATIOS.map((ratio) => (
                    <SelectItem key={ratio} value={ratio}>
                      {ratio}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="productBrandKit" className="text-sm font-medium">
              Product brand kit
            </Label>
            <Select
              value={selectedBrandKitUid}
              onValueChange={setSelectedBrandKitUid}
              disabled={ensureWhiteBackground}
            >
              <SelectTrigger id="productBrandKit">
                <SelectValue placeholder="No brand kit" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_BRAND_KIT}>No brand kit</SelectItem>
                {brandKits.map((kit) => (
                  <SelectItem key={kit.uid} value={kit.uid}>
                    {kit.name}
                    {kit.is_active ? " (active)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {useCustomBackground
                ? "Applies camera style and jewellery placement from your brand kit. Background comes from your custom input."
                : "Applies your brand's camera style, background and jewellery placement to the result."}
            </p>
          </div>

          <div className="flex items-start gap-3 rounded-lg border bg-muted/20 px-4 py-3">
            <Checkbox
              id="use-custom-background"
              checked={useCustomBackground}
              onCheckedChange={(checked) => handleUseCustomBackgroundChange(checked === true)}
              disabled={ensureWhiteBackground}
              className="mt-0.5"
            />
            <div className="space-y-1">
              <Label htmlFor="use-custom-background" className="cursor-pointer text-sm leading-snug">
                Use custom background
              </Label>
              <p className="text-xs text-muted-foreground">
                Choose either a description or a reference image for the backdrop. Brand kit
                background styling is skipped; camera and placement still apply if a kit is selected.
              </p>
            </div>
          </div>

          {useCustomBackground && (
            <div className="space-y-4 rounded-lg border bg-muted/10 p-4">
              <div className="space-y-2">
                <p className="text-sm font-medium">Background input</p>
                <div className="flex flex-wrap gap-4">
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="background-input-mode"
                      checked={backgroundInputMode === "description"}
                      onChange={() => handleBackgroundInputModeChange("description")}
                      className="h-4 w-4"
                    />
                    Describe background
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="background-input-mode"
                      checked={backgroundInputMode === "image"}
                      onChange={() => handleBackgroundInputModeChange("image")}
                      className="h-4 w-4"
                    />
                    Upload reference image
                  </label>
                </div>
              </div>

              {backgroundInputMode === "description" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="background-description" className="text-sm font-medium">
                    Background description
                  </Label>
                  <Textarea
                    id="background-description"
                    value={backgroundText}
                    onChange={(e) => setBackgroundText(e.target.value)}
                    placeholder="e.g. Soft blush-pink silk fabric with gentle folds and a subtle contact shadow"
                    rows={3}
                  />
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="background-image-upload" className="text-sm font-medium">
                    Background reference image
                  </Label>
                  <label
                    id="background-image-upload"
                    className="flex min-h-[140px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/20 p-4 transition hover:border-primary/50 hover:bg-muted/40"
                  >
                    {backgroundPreviewUrl ? (
                      <img
                        src={backgroundPreviewUrl}
                        alt="Background preview"
                        className="max-h-28 w-full rounded object-contain"
                      />
                    ) : (
                      <>
                        <ImageIcon className="mb-2 h-8 w-8 text-muted-foreground" />
                        <span className="text-center text-sm text-muted-foreground">
                          Click to upload a background reference
                        </span>
                      </>
                    )}
                    <input
                      type="file"
                      accept="image/*,.heic,.heif"
                      className="hidden"
                      onChange={(e) => setBackgroundFile(e.target.files?.[0] || null)}
                    />
                  </label>
                </div>
              )}
            </div>
          )}

          <div className="flex items-start gap-3 rounded-lg border bg-muted/20 px-4 py-3">
            <Checkbox
              id="ensure-white-background"
              checked={ensureWhiteBackground}
              onCheckedChange={(checked) => handleEnsureWhiteBackgroundChange(checked === true)}
              disabled={useCustomBackground}
              className="mt-0.5"
            />
            <div className="space-y-1">
              <Label htmlFor="ensure-white-background" className="cursor-pointer text-sm leading-snug">
                Ensure white studio background
              </Label>
              <p className="text-xs text-muted-foreground">
                Uses the default clean white studio look and skips any product brand kit styling.
              </p>
            </div>
          </div>
        </div>

        <Button
          type="button"
          className="w-full gap-2"
          onClick={handleGenerate}
          disabled={!token || !imageFile || shooting}
        >
          {shooting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {shooting ? "Generating studio shoot..." : "Generate studio shoot"}
        </Button>
      </CardContent>
    </Card>
  );
}
