import { useEffect, useMemo, useState } from "react";
import { Check, ImageIcon, Loader2, Upload } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import {
  apiCreateStudioShoot,
  apiListProductAngles,
  apiListProductSideAngles,
  apiListProductBrandKits,
  getPresignedUrl,
  TRY_ON_ASPECT_RATIOS,
  TRY_ON_OUTPUT_QUALITIES,
  type ProductAngleRecord,
  type ProductSideAngleRecord,
  type ProductBrandKitRecord,
  type ProductShootDraft,
  type StudioShootResult,
  type StudioShootViews,
  type TryOnAspectRatio,
  type TryOnOutputQuality,
} from "@/lib/api";
import ProductShootReviewSession from "@/components/ProductShootReviewSession";
import StudioShootResults from "@/components/StudioShootResults";
import type { ManualEditTool } from "@/components/ManualPhotoEditor";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { createDisplayableImageObjectUrl } from "@/lib/heicImage";
import { cn } from "@/lib/utils";

type Props = {
  onEditImage?: (s3Key: string, imageUrl: string) => void;
  onManualPhotoEdit?: (s3Key: string, imageUrl: string, initialTool?: ManualEditTool) => void;
};

export default function UploadStudioShoot({
  onEditImage,
  onManualPhotoEdit,
}: Props) {
  const { token } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [sideViewFile, setSideViewFile] = useState<File | null>(null);
  const [views, setViews] = useState<StudioShootViews | "">("");
  const generateFront = views === "front" || views === "both";
  const generateSide = views === "side" || views === "both";
  const [aspectRatio, setAspectRatio] = useState<TryOnAspectRatio>("2:3");
  const [outputQuality, setOutputQuality] = useState<TryOnOutputQuality>("1K");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [sidePreviewUrl, setSidePreviewUrl] = useState<string | null>(null);
  const [shooting, setShooting] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [results, setResults] = useState<StudioShootResult | null>(null);
  const [draft, setDraft] = useState<ProductShootDraft | null>(null);
  const [activeGenerationUid, setActiveGenerationUid] = useState<string | null>(null);

  const NO_BRAND_KIT = "none";
  const [brandKits, setBrandKits] = useState<ProductBrandKitRecord[]>([]);
  const [selectedBrandKitUid, setSelectedBrandKitUid] = useState<string>(NO_BRAND_KIT);
  const [useCustomBackground, setUseCustomBackground] = useState(false);
  const [backgroundInputMode, setBackgroundInputMode] = useState<"description" | "image">("description");
  const [backgroundText, setBackgroundText] = useState("");
  const [backgroundFile, setBackgroundFile] = useState<File | null>(null);
  const [backgroundPreviewUrl, setBackgroundPreviewUrl] = useState<string | null>(null);

  const [productAngles, setProductAngles] = useState<ProductAngleRecord[]>([]);
  const [productAngleUrls, setProductAngleUrls] = useState<Record<string, string>>({});
  const [productAnglesLoading, setProductAnglesLoading] = useState(false);
  const [wantProductAngle, setWantProductAngle] = useState(false);
  const [selectedProductAngleUid, setSelectedProductAngleUid] = useState<string | null>(null);

  const [productSideAngles, setProductSideAngles] = useState<ProductSideAngleRecord[]>([]);
  const [productSideAngleUrls, setProductSideAngleUrls] = useState<Record<string, string>>({});
  const [productSideAnglesLoading, setProductSideAnglesLoading] = useState(false);
  const [wantProductSideAngle, setWantProductSideAngle] = useState(false);
  const [selectedProductSideAngleUid, setSelectedProductSideAngleUid] = useState<string | null>(null);

  const selectedProductAngleS3Key = useMemo(() => {
    const angle = productAngles.find((a) => a.uid === selectedProductAngleUid);
    return angle?.image_s3_key ?? null;
  }, [productAngles, selectedProductAngleUid]);

  const selectedProductSideAngleS3Key = useMemo(() => {
    const angle = productSideAngles.find((a) => a.uid === selectedProductSideAngleUid);
    return angle?.image_s3_key ?? null;
  }, [productSideAngles, selectedProductSideAngleUid]);

  useEffect(() => {
    if (!token) return;
    apiListProductBrandKits(token)
      .then((kits) => {
        setBrandKits(kits);
        const active = kits.find((kit) => kit.is_active);
        if (active) setSelectedBrandKitUid(active.uid);
      })
      .catch(() => {
        // Product brand kits are optional — silently ignore load failures.
      });
  }, [token]);

  useEffect(() => {
    if (!token || !wantProductAngle) {
      if (!wantProductAngle) {
        setProductAngles([]);
        setProductAngleUrls({});
        setProductAnglesLoading(false);
      }
      return;
    }

    let cancelled = false;
    setProductAnglesLoading(true);
    (async () => {
      try {
        const list = await apiListProductAngles(token);
        if (cancelled) return;
        setProductAngles(list);

        const urlEntries = await Promise.all(
          list.map(async (angle) => {
            try {
              return [angle.uid, await getPresignedUrl(token, angle.image_s3_key)] as [string, string];
            } catch {
              return [angle.uid, ""] as [string, string];
            }
          })
        );
        if (!cancelled) setProductAngleUrls(Object.fromEntries(urlEntries));
      } catch {
        if (!cancelled) {
          setProductAngles([]);
          setProductAngleUrls({});
        }
      } finally {
        if (!cancelled) setProductAnglesLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, wantProductAngle]);

  useEffect(() => {
    if (!token || !generateSide || !wantProductSideAngle) {
      if (!generateSide || !wantProductSideAngle) {
        setProductSideAngles([]);
        setProductSideAngleUrls({});
        setProductSideAnglesLoading(false);
      }
      return;
    }

    let cancelled = false;
    setProductSideAnglesLoading(true);
    (async () => {
      try {
        const list = await apiListProductSideAngles(token);
        if (cancelled) return;
        setProductSideAngles(list);

        const urlEntries = await Promise.all(
          list.map(async (angle) => {
            try {
              return [angle.uid, await getPresignedUrl(token, angle.image_s3_key)] as [string, string];
            } catch {
              return [angle.uid, ""] as [string, string];
            }
          })
        );
        if (!cancelled) setProductSideAngleUrls(Object.fromEntries(urlEntries));
      } catch {
        if (!cancelled) {
          setProductSideAngles([]);
          setProductSideAngleUrls({});
        }
      } finally {
        if (!cancelled) setProductSideAnglesLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, generateSide, wantProductSideAngle]);

  const handleUseCustomBackgroundChange = (checked: boolean) => {
    setUseCustomBackground(checked);
    if (checked) {
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

  const handleViewsChange = (next: StudioShootViews) => {
    setViews(next);
    if (next === "front") {
      setSideViewFile(null);
      setWantProductSideAngle(false);
      setSelectedProductSideAngleUid(null);
    }
    if (next === "side") {
      setWantProductAngle(false);
      setSelectedProductAngleUid(null);
    }
  };

  const handleGenerate = async () => {
    if (!token) return;
    if (!views) {
      toast({
        title: "View required",
        description: "Select front view, side view, or both before generating.",
        variant: "destructive",
      });
      return;
    }
    if (!imageFile) {
      toast({
        title: "Image required",
        description: generateFront
          ? "Please upload a raw jewellery image first."
          : "Please upload a product photo first.",
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

    if (generateFront && wantProductAngle && !selectedProductAngleS3Key) {
      toast({
        title: "Angle required",
        description: "Select a product angle from the library, or turn off angle selection.",
        variant: "destructive",
      });
      return;
    }

    if (generateSide && wantProductSideAngle && !selectedProductSideAngleS3Key) {
      toast({
        title: "Side angle required",
        description: "Select a product side angle from the library, or turn off side angle selection.",
        variant: "destructive",
      });
      return;
    }

    setShooting(true);
    setShowResults(true);
    setResults(null);
    setDraft(null);
    setActiveGenerationUid(null);

    try {
      const shot = await apiCreateStudioShoot(token, imageFile, {
        views,
        sideViewFile: generateSide ? sideViewFile : null,
        aspectRatio,
        outputQuality,
        brandKitUid: selectedBrandKitUid,
        backgroundText:
          useCustomBackground && backgroundInputMode === "description"
            ? backgroundText.trim()
            : undefined,
        backgroundFile:
          useCustomBackground && backgroundInputMode === "image" ? backgroundFile : null,
        productAngleS3Key: generateFront && wantProductAngle ? selectedProductAngleS3Key : null,
        productSideAngleS3Key:
          generateSide && wantProductSideAngle ? selectedProductSideAngleS3Key : null,
      });
      if (generateFront && !shot.frontImageS3Key) {
        throw new Error("Front studio shoot image key not returned from API");
      }
      if (generateSide && !shot.sideImageS3Key && !shot.sideError) {
        throw new Error("Side studio shoot image key not returned from API");
      }
      if (!shot.frontImageS3Key && !shot.sideImageS3Key) {
        throw new Error("Studio shoot image key not returned from API");
      }

      let frontUrl = shot.frontImageUrl ?? null;
      if (shot.frontImageS3Key && !frontUrl) {
        frontUrl = await getPresignedUrl(token, shot.frontImageS3Key);
      }

      let sideUrl = shot.sideImageUrl ?? null;
      if (shot.sideImageS3Key && !sideUrl) {
        sideUrl = await getPresignedUrl(token, shot.sideImageS3Key);
      }

      setDraft(shot.draft ?? null);
      setActiveGenerationUid(shot.generation_uid ?? shot.draft?.latest_generation?.uid ?? null);
      setResults({
        ...shot,
        frontImageUrl: frontUrl,
        sideImageUrl: sideUrl,
      });
      await queryClient.invalidateQueries({ queryKey: ["gallery-items"] });

      const autosaved = shot.draft?.latest_generation?.saved ?? false;
      toast({
        title: "Your look is ready",
        description: [
          autosaved ? "Saved to this shoot in your gallery." : "It is not in the gallery yet.",
          "Each product shoot comes with 2 complementary edits if you’d like a change.",
        ].join(" "),
      });
    } catch (err: unknown) {
      setResults(null);
      setDraft(null);
      setActiveGenerationUid(null);
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
    setDraft(null);
    setActiveGenerationUid(null);
  };

  if (showResults) {
    if (draft?.uid) {
      return (
        <ProductShootReviewSession
          draftUid={draft.uid}
          token={token}
          onBack={handleBack}
          initialDraft={draft}
          initialResults={results}
          initialGenerationUid={activeGenerationUid}
          loading={shooting}
          onEditImage={onEditImage}
          onManualPhotoEdit={onManualPhotoEdit}
          onDraftChange={setDraft}
        />
      );
    }
    return (
      <StudioShootResults
        loading={shooting}
        results={results}
        onBack={handleBack}
        token={token}
        onEditImage={onEditImage}
        onManualPhotoEdit={onManualPhotoEdit}
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Studio Shoot</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium">Views to generate *</p>
            <p className="text-xs text-muted-foreground">
              Choose front view, side view, or both before uploading references.
            </p>
          </div>
          <RadioGroup
            value={views || undefined}
            onValueChange={(value) => handleViewsChange(value as StudioShootViews)}
            className="grid gap-3 sm:grid-cols-3"
          >
            {(
              [
                { value: "front", title: "Front view", description: "Hero catalogue shot, straight-on." },
                { value: "side", title: "Side view", description: "Profile / three-quarter shot." },
                { value: "both", title: "Both views", description: "Front hero and side profile." },
              ] as const
            ).map((option) => (
              <label
                key={option.value}
                htmlFor={`studio-views-${option.value}`}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-lg border bg-muted/20 px-4 py-3 transition hover:border-primary/50",
                  views === option.value && "border-primary bg-primary/5 ring-1 ring-primary/30"
                )}
              >
                <RadioGroupItem
                  id={`studio-views-${option.value}`}
                  value={option.value}
                  className="mt-0.5"
                />
                <div className="space-y-1">
                  <span className="text-sm font-medium leading-snug">{option.title}</span>
                  <p className="text-xs text-muted-foreground">{option.description}</p>
                </div>
              </label>
            ))}
          </RadioGroup>
        </div>

        {/* Reference images */}
        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium">Reference images</p>
            <p className="text-xs text-muted-foreground">
              {views
                ? "Upload raw photos of the jewellery piece"
                : "Select which views to generate first"}
            </p>
          </div>

          {!views ? (
            <div className="flex min-h-[140px] items-center justify-center rounded-lg border border-dashed bg-muted/20 px-4 py-6">
              <p className="text-center text-sm text-muted-foreground">
                Choose front view, side view, or both to continue.
              </p>
            </div>
          ) : (
            <div
              className={cn(
                "grid gap-4 md:items-stretch",
                generateSide ? "md:grid-cols-2" : "md:max-w-lg"
              )}
            >
              <div className="flex flex-col gap-2">
                <Label htmlFor="front-view-upload">
                  {generateFront ? "Front view *" : "Product photo *"}
                </Label>
                <label
                  id="front-view-upload"
                  className="flex min-h-[220px] flex-1 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/20 p-6 transition hover:border-primary/50 hover:bg-muted/40"
                >
                  {previewUrl ? (
                    <img
                      src={previewUrl}
                      alt={generateFront ? "Front view preview" : "Product photo preview"}
                      className="max-h-48 w-full rounded object-contain"
                    />
                  ) : (
                    <>
                      <ImageIcon className="mb-2 h-10 w-10 text-muted-foreground" />
                      <span className="text-center text-sm text-muted-foreground">
                        {generateFront ? "Click to upload front view" : "Click to upload product photo"}
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

              {generateSide && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="side-view-upload">Side view (optional reference)</Label>
                  <label
                    id="side-view-upload"
                    className="flex min-h-[220px] flex-1 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/20 p-6 transition hover:border-primary/50 hover:bg-muted/40"
                  >
                    {sidePreviewUrl ? (
                      <img
                        src={sidePreviewUrl}
                        alt="Side view preview"
                        className="max-h-48 w-full rounded object-contain"
                      />
                    ) : (
                      <>
                        <ImageIcon className="mb-2 h-10 w-10 text-muted-foreground" />
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
                </div>
              )}
            </div>
          )}
        </div>

        {/* Front-view angle / pose */}
        {generateFront && (
          <div className="space-y-3">
          <div className="flex items-start gap-3 rounded-lg border bg-muted/20 px-4 py-3">
            <Checkbox
              id="want-product-angle"
              checked={wantProductAngle}
              onCheckedChange={(checked) => {
                const next = checked === true;
                setWantProductAngle(next);
                if (!next) setSelectedProductAngleUid(null);
              }}
              className="mt-0.5"
            />
            <div className="space-y-1">
              <Label htmlFor="want-product-angle" className="cursor-pointer text-sm leading-snug">
                Select front-view angle / pose (optional)
              </Label>
              <p className="text-xs text-muted-foreground">
                Pick a library reference to direct the camera angle for the front hero shot.
              </p>
            </div>
          </div>

          {wantProductAngle && (
            <div className="space-y-3 rounded-lg border bg-muted/10 p-4">
              <p className="text-xs text-muted-foreground">
                Choose an angle. Manage the library under Manage Product Angles.
              </p>
              {productAnglesLoading ? (
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="aspect-[3/4] w-full rounded-lg" />
                  ))}
                </div>
              ) : productAngles.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No product angles yet. Add some under Manage Product Angles.
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                  {productAngles.map((angle) => (
                    <button
                      key={angle.uid}
                      type="button"
                      onClick={() =>
                        setSelectedProductAngleUid((prev) =>
                          prev === angle.uid ? null : angle.uid
                        )
                      }
                      className={cn(
                        "group relative aspect-[3/4] overflow-hidden rounded-lg border-2 transition focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                        selectedProductAngleUid === angle.uid
                          ? "border-primary ring-2 ring-primary/30"
                          : "border-transparent hover:border-muted-foreground/30"
                      )}
                    >
                      {productAngleUrls[angle.uid] ? (
                        <img
                          src={productAngleUrls[angle.uid]}
                          alt={angle.name}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-muted">
                          <ImageIcon className="h-8 w-8 text-muted-foreground" />
                        </div>
                      )}
                      <div className="absolute bottom-0 left-0 right-0 bg-black/70 p-2 text-xs text-white">
                        <p className="truncate font-medium">{angle.name}</p>
                      </div>
                      {selectedProductAngleUid === angle.uid && (
                        <div className="absolute inset-0 flex items-center justify-center bg-primary/20">
                          <Check className="h-8 w-8 text-primary-foreground drop-shadow-md" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          </div>
        )}

        {/* Side-view angle / pose — only when side generation is enabled */}
        {generateSide && (
          <div className="space-y-3">
            <div className="flex items-start gap-3 rounded-lg border bg-muted/20 px-4 py-3">
              <Checkbox
                id="want-product-side-angle"
                checked={wantProductSideAngle}
                onCheckedChange={(checked) => {
                  const next = checked === true;
                  setWantProductSideAngle(next);
                  if (!next) setSelectedProductSideAngleUid(null);
                }}
                className="mt-0.5"
              />
              <div className="space-y-1">
                <Label htmlFor="want-product-side-angle" className="cursor-pointer text-sm leading-snug">
                  Select side-view angle / pose (optional)
                </Label>
                <p className="text-xs text-muted-foreground">
                  Pick a library reference to direct the camera angle for the side / profile shot.
                </p>
              </div>
            </div>

            {wantProductSideAngle && (
              <div className="space-y-3 rounded-lg border bg-muted/10 p-4">
                <p className="text-xs text-muted-foreground">
                  Choose a side angle. Manage the library under Manage Product Side Angles.
                </p>
                {productSideAnglesLoading ? (
                  <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton key={i} className="aspect-[3/4] w-full rounded-lg" />
                    ))}
                  </div>
                ) : productSideAngles.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No product side angles yet. Add some under Manage Product Side Angles.
                  </p>
                ) : (
                  <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                    {productSideAngles.map((angle) => (
                      <button
                        key={angle.uid}
                        type="button"
                        onClick={() =>
                          setSelectedProductSideAngleUid((prev) =>
                            prev === angle.uid ? null : angle.uid
                          )
                        }
                        className={cn(
                          "group relative aspect-[3/4] overflow-hidden rounded-lg border-2 transition focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                          selectedProductSideAngleUid === angle.uid
                            ? "border-primary ring-2 ring-primary/30"
                            : "border-transparent hover:border-muted-foreground/30"
                        )}
                      >
                        {productSideAngleUrls[angle.uid] ? (
                          <img
                            src={productSideAngleUrls[angle.uid]}
                            alt={angle.name}
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-muted">
                            <ImageIcon className="h-8 w-8 text-muted-foreground" />
                          </div>
                        )}
                        <div className="absolute bottom-0 left-0 right-0 bg-black/70 p-2 text-xs text-white">
                          <p className="truncate font-medium">{angle.name}</p>
                        </div>
                        {selectedProductSideAngleUid === angle.uid && (
                          <div className="absolute inset-0 flex items-center justify-center bg-primary/20">
                            <Check className="h-8 w-8 text-primary-foreground drop-shadow-md" />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

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
                : "Applies your brand's camera style and jewellery placement to the result. Uses white studio background as default."}
            </p>
          </div>

          <div className="flex items-start gap-3 rounded-lg border bg-muted/20 px-4 py-3">
            <Checkbox
              id="use-custom-background"
              checked={useCustomBackground}
              onCheckedChange={(checked) => handleUseCustomBackgroundChange(checked === true)}
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
        </div>

        <Button
          type="button"
          className="w-full gap-2"
          onClick={handleGenerate}
          disabled={
            !token ||
            !views ||
            !imageFile ||
            shooting ||
            (generateFront && wantProductAngle && !selectedProductAngleS3Key) ||
            (generateSide && wantProductSideAngle && !selectedProductSideAngleS3Key)
          }
        >
          {shooting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {shooting ? "Generating studio shoot..." : "Generate studio shoot"}
        </Button>
      </CardContent>
    </Card>
  );
}
