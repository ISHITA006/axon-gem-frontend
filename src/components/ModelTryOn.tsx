import { useState, useEffect, useRef, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  apiListFemaleAdultModels,
  apiListFemaleChildModels,
  apiListMaleAdultModels,
  apiListMaleChildModels,
  apiGenerateTryOn,
  apiListBrandKits,
  apiListPoses,
  apiListModelPosesForModel,
  apiListCloseUpPoses,
  apiGetBackgroundImages,
  getPresignedUrl,
  TRY_ON_ASPECT_RATIOS,
  TRY_ON_OUTPUT_QUALITIES,
  DIMENSION_TYPES,
  DIMENSION_TYPE_LABELS,
  DIMENSION_UNITS,
  type BrandKitRecord,
  type DimensionType,
  type DimensionUnit,
  type Measurement,
  type ModelRecord,
  type ModelPoseRecord,
  type CloseUpPoseRecord,
  type PoseRecord,
  type TryOnAnalysis,
  type TryOnAspectRatio,
  type TryOnOutputQuality,
} from "@/lib/api";
import TryOnResults from "@/components/TryOnResults";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Upload, ImageIcon, Check, Loader2, Plus, Trash2, Ruler } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { toBrowserDecodedImageFile } from "@/lib/heicImage";
import { cn } from "@/lib/utils";

type ModelSections = {
  femaleAdult: ModelRecord[];
  femaleChild: ModelRecord[];
  maleAdult: ModelRecord[];
  maleChild: ModelRecord[];
};

export interface ModelTryOnProps {
  /** Existing jewellery image (e.g. from gallery). Uses this S3 key for try-on without re-uploading. */
  s3Key?: string;
  /** Presigned or public URL for preview when `s3Key` is set; if omitted, a presigned URL is fetched. */
  imageUrl?: string;
  onEditImage?: (s3Key: string, imageUrl: string) => void;
  onChangeColour?: (s3Key: string, imageUrl: string) => void;
  onChangeLength?: (s3Key: string, imageUrl: string) => void;
}

const EMPTY_MODEL_SECTIONS: ModelSections = {
  femaleAdult: [],
  femaleChild: [],
  maleAdult: [],
  maleChild: [],
};

type DimensionRow = {
  id: string;
  part: string;
  type: DimensionType;
  value: string;
  unit: DimensionUnit;
};

type PresetField = { part: string; type: DimensionType; unit: DimensionUnit };

const DIMENSION_PRESETS: { key: string; label: string; fields: PresetField[] }[] = [
  {
    key: "ring",
    label: "Ring",
    fields: [
      { part: "band", type: "diameter", unit: "mm" },
      { part: "band", type: "width", unit: "mm" },
    ],
  },
  {
    key: "necklace",
    label: "Necklace / Pendant",
    fields: [
      { part: "chain", type: "chain_length", unit: "in" },
      { part: "pendant", type: "height", unit: "mm" },
      { part: "pendant", type: "width", unit: "mm" },
    ],
  },
  {
    key: "earrings",
    label: "Earrings",
    fields: [
      { part: "earring", type: "drop", unit: "mm" },
      { part: "earring", type: "width", unit: "mm" },
    ],
  },
  {
    key: "bracelet",
    label: "Bracelet / Bangle",
    fields: [
      { part: "bracelet", type: "inner_diameter", unit: "mm" },
      { part: "bracelet", type: "width", unit: "mm" },
    ],
  },
];

let dimensionRowSeq = 0;
function makeDimensionRow(field?: Partial<PresetField>): DimensionRow {
  dimensionRowSeq += 1;
  return {
    id: `dim-${Date.now()}-${dimensionRowSeq}`,
    part: field?.part ?? "",
    type: field?.type ?? "length",
    value: "",
    unit: field?.unit ?? "mm",
  };
}

export default function ModelTryOn({ s3Key, imageUrl, onEditImage, onChangeColour, onChangeLength }: ModelTryOnProps) {
  const { token } = useAuth();
  const { toast } = useToast();

  const clothingFileRef = useRef<File | null>(null);
  const [clothingFile, setClothingFile] = useState<File | null>(null);
  const [clothingPreview, setClothingPreview] = useState<string | null>(null);
  const [clothingExternalS3Key, setClothingExternalS3Key] = useState<string | null>(null);

  clothingFileRef.current = clothingFile;
  const [generateCloseUp, setGenerateCloseUp] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<TryOnAspectRatio>("2:3");
  const [outputQuality, setOutputQuality] = useState<TryOnOutputQuality>("1K");
  const [frontImageLoading, setFrontImageLoading] = useState(false);

  const NO_BRAND_KIT = "none";
  const [brandKits, setBrandKits] = useState<BrandKitRecord[]>([]);
  const [selectedBrandKitUid, setSelectedBrandKitUid] = useState<string>(NO_BRAND_KIT);

  const [useBackground, setUseBackground] = useState(false);
  const [backgroundKeys, setBackgroundKeys] = useState<string[]>([]);
  const [backgroundUrls, setBackgroundUrls] = useState<Record<string, string>>({});
  const [selectedBackground, setSelectedBackground] = useState<string | null>(null);
  const [backgroundsLoading, setBackgroundsLoading] = useState(true);

  const [useDimensions, setUseDimensions] = useState(false);
  const [dimensionRows, setDimensionRows] = useState<DimensionRow[]>([]);

  const addDimensionRow = (field?: Partial<PresetField>) =>
    setDimensionRows((prev) => [...prev, makeDimensionRow(field)]);

  const applyDimensionPreset = (key: string) => {
    const preset = DIMENSION_PRESETS.find((p) => p.key === key);
    if (!preset) return;
    setDimensionRows((prev) => [...prev, ...preset.fields.map((f) => makeDimensionRow(f))]);
  };

  const updateDimensionRow = (id: string, patch: Partial<DimensionRow>) =>
    setDimensionRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const removeDimensionRow = (id: string) =>
    setDimensionRows((prev) => prev.filter((r) => r.id !== id));

  const collectMeasurements = (): Measurement[] =>
    dimensionRows
      .map((r) => {
        const value = parseFloat(r.value);
        if (!Number.isFinite(value) || value <= 0) return null;
        return {
          part: r.part.trim() || undefined,
          type: r.type,
          value,
          unit: r.unit,
        } as Measurement;
      })
      .filter((m): m is Measurement => m !== null);

  const [modelsBySection, setModelsBySection] = useState<ModelSections>(EMPTY_MODEL_SECTIONS);
  const [modelUrls, setModelUrls] = useState<Record<string, string>>({});
  const [selectedModelUid, setSelectedModelUid] = useState<string | null>(null);
  const [modelsLoading, setModelsLoading] = useState(true);

  const [poses, setPoses] = useState<PoseRecord[]>([]);
  const [wantModelPose, setWantModelPose] = useState(false);
  const [modelPoseRows, setModelPoseRows] = useState<ModelPoseRecord[]>([]);
  const [poseRowUrls, setPoseRowUrls] = useState<Record<string, string>>({});
  const [modelPosesLoading, setModelPosesLoading] = useState(false);
  const [selectedModelPoseUid, setSelectedModelPoseUid] = useState<string | null>(null);

  const [closeUpPoses, setCloseUpPoses] = useState<CloseUpPoseRecord[]>([]);
  const [closeUpPoseUrls, setCloseUpPoseUrls] = useState<Record<string, string>>({});
  const [closeUpPosesLoading, setCloseUpPosesLoading] = useState(false);
  const [wantCloseUpPose, setWantCloseUpPose] = useState(false);
  const [selectedCloseUpPoseUid, setSelectedCloseUpPoseUid] = useState<string | null>(null);

  const allModels = useMemo(
    () => [
      ...modelsBySection.femaleAdult,
      ...modelsBySection.femaleChild,
      ...modelsBySection.maleAdult,
      ...modelsBySection.maleChild,
    ],
    [modelsBySection]
  );
  const modelByUid = useMemo(() => Object.fromEntries(allModels.map((m) => [m.uid, m])), [allModels]);
  const poseByUid = useMemo(() => Object.fromEntries(poses.map((p) => [p.uid, p])), [poses]);

  const selectedModelPoseS3Key = useMemo(() => {
    const row = modelPoseRows.find((r) => r.uid === selectedModelPoseUid);
    return row?.image_s3_key ?? null;
  }, [modelPoseRows, selectedModelPoseUid]);

  const selectedCloseUpPoseS3Key = useMemo(() => {
    const pose = closeUpPoses.find((p) => p.uid === selectedCloseUpPoseUid);
    return pose?.image_s3_key ?? null;
  }, [closeUpPoses, selectedCloseUpPoseUid]);

  const [generating, setGenerating] = useState(false);
  const [results, setResults] = useState<{
    front: string;
    closeUp?: string;
    frontKey: string;
    closeUpKey?: string;
    analysis?: TryOnAnalysis | null;
  } | null>(null);
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    if (!token) return;
    Promise.all([
      apiListFemaleAdultModels(token),
      apiListFemaleChildModels(token),
      apiListMaleAdultModels(token),
      apiListMaleChildModels(token),
    ])
      .then(async ([femaleAdult, femaleChild, maleAdult, maleChild]) => {
        const nextSections: ModelSections = {
          femaleAdult,
          femaleChild,
          maleAdult,
          maleChild,
        };
        setModelsBySection(nextSections);

        const allModels = [...femaleAdult, ...femaleChild, ...maleAdult, ...maleChild];
        const urlEntries = await Promise.all(
          allModels.map(async (model) => {
            try {
              const url = await getPresignedUrl(token, model.image_s3_key);
              return [model.uid, url] as [string, string];
            } catch {
              return [model.uid, ""] as [string, string];
            }
          })
        );
        setModelUrls(Object.fromEntries(urlEntries));
      })
      .catch((err: unknown) =>
        toast({
          title: "Error",
          description: err instanceof Error ? err.message : "Failed to load models",
          variant: "destructive",
        })
      )
      .finally(() => setModelsLoading(false));
  }, [token]);

  useEffect(() => {
    if (!token) return;
    apiListPoses(token)
      .then(setPoses)
      .catch(() => {
        // Pose names are only used for labels — silently ignore load failures.
      });
  }, [token]);

  useEffect(() => {
    if (!wantModelPose || !selectedModelUid || !token) {
      setModelPoseRows([]);
      setPoseRowUrls({});
      setSelectedModelPoseUid(null);
      setModelPosesLoading(false);
      return;
    }

    let cancelled = false;
    setModelPosesLoading(true);
    setSelectedModelPoseUid(null);

    (async () => {
      try {
        const list = await apiListModelPosesForModel(token, selectedModelUid);
        if (cancelled) return;
        setModelPoseRows(list);
        const urlEntries = await Promise.all(
          list.map(async (row) => {
            try {
              return [row.uid, await getPresignedUrl(token, row.image_s3_key)] as [string, string];
            } catch {
              return [row.uid, ""] as [string, string];
            }
          })
        );
        if (!cancelled) setPoseRowUrls(Object.fromEntries(urlEntries));
      } catch (err: unknown) {
        if (!cancelled) {
          toast({
            title: "Error",
            description: err instanceof Error ? err.message : "Failed to load model poses",
            variant: "destructive",
          });
          setModelPoseRows([]);
          setPoseRowUrls({});
        }
      } finally {
        if (!cancelled) setModelPosesLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [wantModelPose, selectedModelUid, token, toast]);

  useEffect(() => {
    if (!generateCloseUp || !token) {
      setCloseUpPoses([]);
      setCloseUpPoseUrls({});
      setWantCloseUpPose(false);
      setSelectedCloseUpPoseUid(null);
      setCloseUpPosesLoading(false);
      return;
    }

    let cancelled = false;
    setCloseUpPosesLoading(true);

    (async () => {
      try {
        const list = await apiListCloseUpPoses(token);
        if (cancelled) return;
        setCloseUpPoses(list);
        const urlEntries = await Promise.all(
          list.map(async (pose) => {
            try {
              return [pose.uid, await getPresignedUrl(token, pose.image_s3_key)] as [string, string];
            } catch {
              return [pose.uid, ""] as [string, string];
            }
          })
        );
        if (!cancelled) setCloseUpPoseUrls(Object.fromEntries(urlEntries));
      } catch {
        if (!cancelled) {
          setCloseUpPoses([]);
          setCloseUpPoseUrls({});
        }
      } finally {
        if (!cancelled) setCloseUpPosesLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [generateCloseUp, token]);

  useEffect(() => {
    if (!token) return;
    apiListBrandKits(token)
      .then((kits) => {
        setBrandKits(kits);
        const active = kits.find((kit) => kit.is_active);
        if (active) setSelectedBrandKitUid(active.uid);
      })
      .catch(() => {
        // Brand kits are optional — silently ignore load failures.
      });
  }, [token]);

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
              return [key, await getPresignedUrl(token, key)] as [string, string];
            } catch {
              return [key, ""] as [string, string];
            }
          })
        );
        setBackgroundUrls(Object.fromEntries(urlEntries));
      })
      .catch(() => {
        // Backgrounds are optional — silently ignore load failures.
      })
      .finally(() => setBackgroundsLoading(false));
  }, [token]);

  useEffect(() => {
    const key = s3Key?.trim();
    if (!key) {
      setClothingExternalS3Key(null);
      if (!clothingFileRef.current) {
        setClothingPreview((prev) => {
          if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
          return null;
        });
      }
      return;
    }

    let cancelled = false;
    setClothingFile(null);
    setClothingExternalS3Key(key);
    setClothingPreview((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return null;
    });

    const applyPreview = (url: string) => {
      if (!cancelled) setClothingPreview(url);
    };

    const nextImageUrl = imageUrl?.trim();
    if (nextImageUrl) {
      applyPreview(nextImageUrl);
    } else if (token) {
      void getPresignedUrl(token, key)
        .then(applyPreview)
        .catch(() => {
          if (!cancelled) {
            toast({
              title: "Could not load jewellery",
              description: "Unable to fetch a preview URL for this jewellery image.",
              variant: "destructive",
            });
          }
        });
    }

    return () => {
      cancelled = true;
    };
  }, [s3Key, imageUrl, token, toast]);

  useEffect(() => {
    return () => {
      if (clothingPreview?.startsWith("blob:")) URL.revokeObjectURL(clothingPreview);
    };
  }, [clothingPreview]);

  const handleFileSelect = async (file: File | null) => {
    if (!file) return;
    setFrontImageLoading(true);
    try {
      const decoded = await toBrowserDecodedImageFile(file);
      const url = URL.createObjectURL(decoded);
      setClothingExternalS3Key(null);
      setClothingFile(decoded);
      setClothingPreview((prev) => {
        if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
        return url;
      });
    } catch {
      toast({
        title: "Could not load image",
        description: "HEIC/HEIF files are supported — please try again or use a different photo.",
        variant: "destructive",
      });
    } finally {
      setFrontImageLoading(false);
    }
  };

  const handleGenerate = async () => {
    const hasFrontGarment = Boolean(clothingFile || clothingExternalS3Key);
    if (!hasFrontGarment || !selectedModelUid || !token) {
      toast({
        title: "Missing fields",
        description: "Please add a jewellery image (upload or open from elsewhere) and select a model.",
        variant: "destructive",
      });
      return;
    }
    const selectedModel = modelByUid[selectedModelUid];
    if (!selectedModel) {
      toast({ title: "Missing model", description: "Selected model could not be found.", variant: "destructive" });
      return;
    }
    if (wantModelPose && !selectedModelPoseS3Key) {
      toast({
        title: "Missing pose",
        description: "Pick one of this model's poses, or turn off the pose option.",
        variant: "destructive",
      });
      return;
    }
    if (generateCloseUp && wantCloseUpPose && !selectedCloseUpPoseS3Key) {
      toast({
        title: "Missing close-up pose",
        description: "Pick a close-up pose reference, or turn off the close-up pose option.",
        variant: "destructive",
      });
      return;
    }
    if (useBackground && !selectedBackground) {
      toast({
        title: "Missing background",
        description: "Select a background, or turn off the background option.",
        variant: "destructive",
      });
      return;
    }
    setGenerating(true);
    setResults(null);
    setShowResults(true);
    try {
      const data = await apiGenerateTryOn(
        token,
        clothingExternalS3Key ? null : clothingFile,
        selectedModel.image_s3_key,
        generateCloseUp,
        {
          aspectRatio,
          outputQuality,
          brandKitUid: selectedBrandKitUid,
          backgroundS3Key: useBackground ? selectedBackground : null,
          dimensions: useDimensions ? collectMeasurements() : null,
          poseSelected: wantModelPose,
          modelPoseS3Key: wantModelPose ? selectedModelPoseS3Key : null,
          closeUpPoseS3Key: generateCloseUp && wantCloseUpPose ? selectedCloseUpPoseS3Key : null,
          ...(clothingExternalS3Key ? { existingJewelleryS3Key: clothingExternalS3Key } : {}),
        }
      );
      const frontUrl = await getPresignedUrl(token, data.front_image_s3_key);
      const closeUpKey = data.close_up_image_s3_key;
      const closeUpUrl =
        closeUpKey && generateCloseUp ? await getPresignedUrl(token, closeUpKey) : undefined;
      setResults({
        front: frontUrl,
        ...(closeUpUrl && closeUpKey ? { closeUp: closeUpUrl, closeUpKey } : {}),
        frontKey: data.front_image_s3_key,
        analysis: data.analysis ?? null,
      });
      toast({ title: "Success", description: "Try-on images generated!" });
    } catch (err: any) {
      toast({ title: "Generation Failed", description: err.message, variant: "destructive" });
      setShowResults(false);
    } finally {
      setGenerating(false);
    }
  };

  const handleBackFromResults = () => {
    setShowResults(false);
    setResults(null);
  };

  if (showResults) {
    return (
      <TryOnResults
        loading={generating}
        results={results}
        onBack={handleBackFromResults}
        token={token}
        onEditImage={onEditImage}
        onChangeColour={onChangeColour}
        onChangeLength={onChangeLength}
      />
    );
  }

  const sectionConfigs: Array<{ key: keyof ModelSections; title: string }> = [
    { key: "femaleAdult", title: "Female Adult" },
    { key: "femaleChild", title: "Female Child" },
    { key: "maleAdult", title: "Male Adult" },
    { key: "maleChild", title: "Male Child" },
  ];

  const hasAnyModel = Object.values(modelsBySection).some((section) => section.length > 0);

  return (
    <div className="space-y-6">
      {/* Upload Section */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Upload className="h-4 w-4" /> Jewellery Image *
            </CardTitle>
          </CardHeader>
          <CardContent>
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/20 p-6 transition hover:border-primary/50 hover:bg-muted/40">
              {frontImageLoading ? (
                <>
                  <Loader2 className="mb-2 h-10 w-10 animate-spin text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Preparing image…</span>
                </>
              ) : clothingPreview ? (
                <img src={clothingPreview} alt="Front" className="max-h-48 rounded object-contain" />
              ) : (
                <>
                  <ImageIcon className="mb-2 h-10 w-10 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Click to upload front image</span>
                </>
              )}
              <input
                type="file"
                accept="image/*,.heic,.heif"
                className="hidden"
                onChange={(e) => void handleFileSelect(e.target.files?.[0] || null)}
              />
            </label>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="generateCloseUp"
                  checked={generateCloseUp}
                  onCheckedChange={(v) => {
                    const next = !!v;
                    setGenerateCloseUp(next);
                    if (!next) {
                      setWantCloseUpPose(false);
                      setSelectedCloseUpPoseUid(null);
                    }
                  }}
                  className="mt-0.5"
                />
                <div className="space-y-1">
                  <Label htmlFor="generateCloseUp" className="text-sm font-medium leading-snug cursor-pointer">
                    Generate a close-up highlighting the jewellery
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Adds a tight close-up of the same model in a pose that spotlights the piece.
                  </p>
                </div>
              </div>

              {generateCloseUp && (
                <div className="mt-4 space-y-4 border-t pt-4">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="wantCloseUpPose"
                      checked={wantCloseUpPose}
                      onCheckedChange={(v) => {
                        const next = !!v;
                        setWantCloseUpPose(next);
                        if (!next) setSelectedCloseUpPoseUid(null);
                      }}
                    />
                    <Label htmlFor="wantCloseUpPose" className="text-sm font-normal leading-none">
                      Select close-up pose reference (optional)
                    </Label>
                  </div>

                  {wantCloseUpPose && (
                    <div>
                      <p className="mb-3 text-xs text-muted-foreground">
                        Pick a close-up pose. The generated close-up will replicate this
                        framing and pose on your model wearing the jewellery.
                      </p>
                      {closeUpPosesLoading ? (
                        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                          {Array.from({ length: 4 }).map((_, i) => (
                            <Skeleton key={i} className="aspect-[3/4] w-full rounded-lg" />
                          ))}
                        </div>
                      ) : closeUpPoses.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          No close-up poses yet. Add some under Manage Close-Up Poses.
                        </p>
                      ) : (
                        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                          {closeUpPoses.map((pose) => (
                            <button
                              key={pose.uid}
                              type="button"
                              onClick={() =>
                                setSelectedCloseUpPoseUid((prev) =>
                                  prev === pose.uid ? null : pose.uid
                                )
                              }
                              className={cn(
                                "group relative aspect-[3/4] overflow-hidden rounded-lg border-2 transition focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                                selectedCloseUpPoseUid === pose.uid
                                  ? "border-primary ring-2 ring-primary/30"
                                  : "border-transparent hover:border-muted-foreground/30"
                              )}
                            >
                              {closeUpPoseUrls[pose.uid] ? (
                                <img
                                  src={closeUpPoseUrls[pose.uid]}
                                  alt={pose.name}
                                  className="h-full w-full object-cover"
                                  loading="lazy"
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center bg-muted">
                                  <ImageIcon className="h-8 w-8 text-muted-foreground" />
                                </div>
                              )}
                              <div className="absolute bottom-0 left-0 right-0 bg-black/70 p-2 text-xs text-white">
                                <p className="truncate font-medium">{pose.name}</p>
                              </div>
                              {selectedCloseUpPoseUid === pose.uid && (
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
            </CardContent>
          </Card>

          <Card>
            <CardContent className="grid gap-4 pt-6 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="outputQuality" className="text-sm font-medium">
                  Output quality
                </Label>
                <Select
                  value={outputQuality}
                  onValueChange={(v) => setOutputQuality(v as TryOnOutputQuality)}
                >
                  <SelectTrigger id="outputQuality">
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
                <Label htmlFor="aspectRatio" className="text-sm font-medium">
                  Aspect ratio
                </Label>
                <Select
                  value={aspectRatio}
                  onValueChange={(v) => setAspectRatio(v as TryOnAspectRatio)}
                >
                  <SelectTrigger id="aspectRatio">
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
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-1.5 pt-6">
              <Label htmlFor="brandKit" className="text-sm font-medium">
                Brand kit
              </Label>
              <Select value={selectedBrandKitUid} onValueChange={setSelectedBrandKitUid}>
                <SelectTrigger id="brandKit">
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
                Applies your brand's shoot style, poses and styling to the result.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Background Selection (optional) */}
      <Card className={!useBackground ? "opacity-70" : ""}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Background (optional)</CardTitle>
            <div className="flex items-center gap-2">
              <Checkbox
                id="useBackground"
                checked={useBackground}
                onCheckedChange={(v) => {
                  const next = !!v;
                  setUseBackground(next);
                  if (!next) setSelectedBackground(null);
                }}
              />
              <Label htmlFor="useBackground" className="text-xs">
                Use background
              </Label>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className={!useBackground ? "pointer-events-none" : ""}>
            {backgroundsLoading ? (
              <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="aspect-[3/4] w-full rounded-lg" />
                ))}
              </div>
            ) : backgroundKeys.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No background images found. Add some under Manage Backgrounds.
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
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

      {/* Exact Dimensions (optional) */}
      <Card className={!useDimensions ? "opacity-70" : ""}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Ruler className="h-4 w-4" /> Exact dimensions (optional)
            </CardTitle>
            <div className="flex items-center gap-2">
              <Checkbox
                id="useDimensions"
                checked={useDimensions}
                onCheckedChange={(v) => {
                  const next = !!v;
                  setUseDimensions(next);
                  if (next && dimensionRows.length === 0) addDimensionRow();
                }}
              />
              <Label htmlFor="useDimensions" className="text-xs">
                Specify dimensions
              </Label>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className={!useDimensions ? "pointer-events-none" : ""}>
            <p className="mb-3 text-xs text-muted-foreground">
              Enter real measurements so the piece renders at its true size on the model. These override
              the automatic size estimate.
            </p>

            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">Quick add:</span>
              {DIMENSION_PRESETS.map((preset) => (
                <Button
                  key={preset.key}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={() => applyDimensionPreset(preset.key)}
                >
                  <Plus className="h-3 w-3" /> {preset.label}
                </Button>
              ))}
            </div>

            {dimensionRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No measurements added yet. Use a quick-add preset above or add a custom measurement.
              </p>
            ) : (
              <div className="space-y-2">
                {dimensionRows.map((row) => (
                  <div key={row.id} className="flex flex-wrap items-center gap-2">
                    <Input
                      value={row.part}
                      onChange={(e) => updateDimensionRow(row.id, { part: e.target.value })}
                      placeholder="Part (e.g. pendant)"
                      className="h-9 w-[9rem]"
                    />
                    <Select
                      value={row.type}
                      onValueChange={(v) => updateDimensionRow(row.id, { type: v as DimensionType })}
                    >
                      <SelectTrigger className="h-9 w-[9.5rem]">
                        <SelectValue placeholder="Measurement" />
                      </SelectTrigger>
                      <SelectContent>
                        {DIMENSION_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {DIMENSION_TYPE_LABELS[t]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      inputMode="decimal"
                      value={row.value}
                      onChange={(e) => updateDimensionRow(row.id, { value: e.target.value })}
                      placeholder="Value"
                      className="h-9 w-[6rem]"
                    />
                    <Select
                      value={row.unit}
                      onValueChange={(v) => updateDimensionRow(row.id, { unit: v as DimensionUnit })}
                    >
                      <SelectTrigger className="h-9 w-[5rem]">
                        <SelectValue placeholder="Unit" />
                      </SelectTrigger>
                      <SelectContent>
                        {DIMENSION_UNITS.map((u) => (
                          <SelectItem key={u} value={u}>
                            {u}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeDimensionRow(row.id)}
                      aria-label="Remove measurement"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="mt-3 gap-1"
              onClick={() => addDimensionRow()}
            >
              <Plus className="h-4 w-4" /> Add measurement
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Model Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Select a Model</CardTitle>
        </CardHeader>
        <CardContent>
          {modelsLoading ? (
            <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="aspect-[3/4] w-full rounded-lg" />
              ))}
            </div>
          ) : !hasAnyModel ? (
            <p className="text-sm text-muted-foreground">No models found.</p>
          ) : (
            <div className="space-y-6">
              {sectionConfigs.map((section) => {
                const models = modelsBySection[section.key];
                return (
                  <div key={section.key} className="space-y-3">
                    <h3 className="text-sm font-semibold text-foreground">{section.title}</h3>
                    {models.length === 0 ? (
                      <div className="py-2 text-sm text-muted-foreground">
                        No models in this category.
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
                        {models.map((model) => (
                          <button
                            key={model.uid}
                            onClick={() => setSelectedModelUid(model.uid)}
                            className={`group relative aspect-[3/4] overflow-hidden rounded-lg border-2 transition ${
                              selectedModelUid === model.uid
                                ? "border-primary ring-2 ring-primary/30"
                                : "border-transparent hover:border-muted-foreground/30"
                            }`}
                          >
                            {modelUrls[model.uid] ? (
                              <img
                                src={modelUrls[model.uid]}
                                alt={model.name}
                                className="h-full w-full object-cover"
                                loading="lazy"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center bg-muted">
                                <ImageIcon className="h-8 w-8 text-muted-foreground" />
                              </div>
                            )}
                            <div className="absolute bottom-0 left-0 right-0 bg-black/70 p-2 text-xs text-white">
                              <p className="truncate font-medium">{model.name}</p>
                            </div>
                            {selectedModelUid === model.uid && (
                              <div className="absolute inset-0 flex items-center justify-center bg-primary/20">
                                <Check className="h-8 w-8 text-primary-foreground drop-shadow-md" />
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {selectedModelUid && (
            <div className="mt-6 space-y-4 border-t pt-6">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="wantModelPose"
                  checked={wantModelPose}
                  onCheckedChange={(v) => setWantModelPose(!!v)}
                />
                <Label htmlFor="wantModelPose" className="text-sm font-normal leading-none">
                  Select model pose
                </Label>
              </div>

              {wantModelPose && (
                <div>
                  <h3 className="mb-3 text-sm font-semibold">Select a model pose</h3>
                  <p className="mb-3 text-xs text-muted-foreground">
                    These are saved poses generated for this model. The pose you pick is used as the model
                    reference for the try-on.
                  </p>
                  {modelPosesLoading ? (
                    <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <Skeleton key={i} className="aspect-[3/4] w-full rounded-lg" />
                      ))}
                    </div>
                  ) : modelPoseRows.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No model poses for this model yet. Create them under Manage Model Poses.
                    </p>
                  ) : (
                    <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
                      {modelPoseRows.map((row) => {
                        const pose = poseByUid[row.pose_uid];
                        return (
                          <button
                            key={row.uid}
                            type="button"
                            onClick={() => setSelectedModelPoseUid(row.uid)}
                            className={cn(
                              "group relative aspect-[3/4] overflow-hidden rounded-lg border-2 transition focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                              selectedModelPoseUid === row.uid
                                ? "border-primary ring-2 ring-primary/30"
                                : "border-transparent hover:border-muted-foreground/30"
                            )}
                          >
                            {poseRowUrls[row.uid] ? (
                              <img
                                src={poseRowUrls[row.uid]}
                                alt={pose?.name ?? "Model pose"}
                                className="h-full w-full object-cover"
                                loading="lazy"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center bg-muted">
                                <ImageIcon className="h-8 w-8 text-muted-foreground" />
                              </div>
                            )}
                            <div className="absolute bottom-0 left-0 right-0 bg-black/70 p-2 text-xs text-white">
                              <p className="truncate font-medium">{pose?.name ?? "Pose"}</p>
                            </div>
                            {selectedModelPoseUid === row.uid && (
                              <div className="absolute inset-0 flex items-center justify-center bg-primary/20">
                                <Check className="h-8 w-8 text-primary-foreground drop-shadow-md" />
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Generate Button */}
      <div className="flex justify-center">
        <Button
          size="lg"
          onClick={handleGenerate}
          disabled={
            generating ||
            !(clothingFile || clothingExternalS3Key) ||
            !selectedModelUid ||
            (wantModelPose && !selectedModelPoseS3Key) ||
            (generateCloseUp && wantCloseUpPose && !selectedCloseUpPoseS3Key) ||
            (useBackground && !selectedBackground)
          }
          className="min-w-[220px]"
        >
          Generate Try-On Images
        </Button>
      </div>
    </div>
  );
}
