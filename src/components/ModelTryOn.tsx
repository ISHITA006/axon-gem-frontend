import { useState, useEffect, useRef, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
  apiListClothing,
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
  type ModelShootDraft,
  type ModelShootViews,
  type CloseUpPoseRecord,
  type ClothingRecord,
  type PoseRecord,
  type TryOnAnalysis,
  type TryOnAspectRatio,
  type TryOnOutputQuality,
} from "@/lib/api";
import TryOnResults from "@/components/TryOnResults";
import ModelShootReviewSession from "@/components/ModelShootReviewSession";
import type { ManualEditTool } from "@/components/ManualPhotoEditor";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Upload, ImageIcon, Check, Loader2, Plus, Trash2, Ruler, Brush } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { toBrowserDecodedImageFile } from "@/lib/heicImage";
import { cn } from "@/lib/utils";
import PlacementShadeCanvas, {
  type PlacementShadeCanvasHandle,
} from "@/components/PlacementShadeCanvas";

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
  onManualPhotoEdit?: (s3Key: string, imageUrl: string, initialTool?: ManualEditTool) => void;
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

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong. Please try again.";
}

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

export default function ModelTryOn({ s3Key, imageUrl, onEditImage, onManualPhotoEdit }: ModelTryOnProps) {
  const { token } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const clothingFileRef = useRef<File | null>(null);
  const [clothingFile, setClothingFile] = useState<File | null>(null);
  const [clothingPreview, setClothingPreview] = useState<string | null>(null);
  const [clothingExternalS3Key, setClothingExternalS3Key] = useState<string | null>(null);

  clothingFileRef.current = clothingFile;
  const [views, setViews] = useState<ModelShootViews>("front");
  const generateFront = views === "front" || views === "both";
  const generateCloseUp = views === "close_up" || views === "both";
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

  const [useClothing, setUseClothing] = useState(false);
  const [clothingItems, setClothingItems] = useState<ClothingRecord[]>([]);
  const [clothingUrls, setClothingUrls] = useState<Record<string, string>>({});
  const [clothingLoading, setClothingLoading] = useState(false);
  const [selectedClothingUid, setSelectedClothingUid] = useState<string | null>(null);

  const [usePlacementShade, setUsePlacementShade] = useState(false);
  const [placementHasPaint, setPlacementHasPaint] = useState(false);
  const [closeUpPlacementHasPaint, setCloseUpPlacementHasPaint] = useState(false);
  const placementShadeRef = useRef<PlacementShadeCanvasHandle>(null);
  const closeUpPlacementShadeRef = useRef<PlacementShadeCanvasHandle>(null);

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

  const placementImageUrl = useMemo(() => {
    if (!selectedModelUid) return null;
    if (wantModelPose) {
      if (!selectedModelPoseUid) return null;
      return poseRowUrls[selectedModelPoseUid] || null;
    }
    return modelUrls[selectedModelUid] || null;
  }, [selectedModelUid, wantModelPose, selectedModelPoseUid, poseRowUrls, modelUrls]);

  const closeUpPlacementImageUrl = useMemo(() => {
    if (!generateCloseUp || !wantCloseUpPose || !selectedCloseUpPoseUid) return null;
    return closeUpPoseUrls[selectedCloseUpPoseUid] || null;
  }, [generateCloseUp, wantCloseUpPose, selectedCloseUpPoseUid, closeUpPoseUrls]);

  useEffect(() => {
    setPlacementHasPaint(false);
  }, [placementImageUrl]);

  useEffect(() => {
    setCloseUpPlacementHasPaint(false);
  }, [closeUpPlacementImageUrl]);

  const [generating, setGenerating] = useState(false);
  const [results, setResults] = useState<{
    front?: string;
    closeUp?: string;
    frontKey?: string;
    closeUpKey?: string;
    analysis?: TryOnAnalysis | null;
  } | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [draft, setDraft] = useState<ModelShootDraft | null>(null);
  const [activeGenerationUid, setActiveGenerationUid] = useState<string | null>(null);
  const [progressLabel, setProgressLabel] = useState<string | null>(null);

  /** Presign is handled by ModelShootReviewSession once a draft exists. */

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
    if (!generateFront || !wantModelPose || !selectedModelUid || !token) {
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
  }, [generateFront, wantModelPose, selectedModelUid, token, toast]);

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

    let cancelled = false;
    setClothingLoading(true);

    (async () => {
      try {
        const list = await apiListClothing(token);
        if (cancelled) return;
        setClothingItems(list);
        const urlEntries = await Promise.all(
          list.map(async (item) => {
            try {
              return [item.uid, await getPresignedUrl(token, item.image_s3_key)] as [string, string];
            } catch {
              return [item.uid, ""] as [string, string];
            }
          })
        );
        if (!cancelled) setClothingUrls(Object.fromEntries(urlEntries));
      } catch {
        if (!cancelled) {
          setClothingItems([]);
          setClothingUrls({});
        }
      } finally {
        if (!cancelled) setClothingLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

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

    setShowResults(false);
    setResults(null);
    setDraft(null);
    setActiveGenerationUid(null);

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

  const handleViewsChange = (next: ModelShootViews) => {
    setViews(next);
    if (next === "front") {
      setWantCloseUpPose(false);
      setSelectedCloseUpPoseUid(null);
      setCloseUpPlacementHasPaint(false);
    } else if (next === "close_up") {
      setWantModelPose(false);
      setSelectedModelPoseUid(null);
      setPlacementHasPaint(false);
      if (usePlacementShade) setWantCloseUpPose(true);
    } else if (usePlacementShade) {
      setWantCloseUpPose(true);
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
    if (generateFront && wantModelPose && !selectedModelPoseS3Key) {
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
    if (useClothing && !selectedClothingUid) {
      toast({
        title: "Missing clothing",
        description: "Pick a clothing item, or turn off the clothing option.",
        variant: "destructive",
      });
      return;
    }
    if (usePlacementShade && generateFront && wantModelPose && !selectedModelPoseS3Key) {
      toast({
        title: "Missing pose",
        description: "Pick a model pose before shading the jewellery placement area.",
        variant: "destructive",
      });
      return;
    }
    if (usePlacementShade && generateCloseUp && !selectedCloseUpPoseS3Key) {
      toast({
        title: "Missing close-up pose",
        description: "Pick a close-up pose before shading the close-up jewellery placement area.",
        variant: "destructive",
      });
      return;
    }
    let placementMask: Blob | null = null;
    let closeUpPlacementMask: Blob | null = null;
    if (usePlacementShade) {
      if (generateFront) {
        placementMask = (await placementShadeRef.current?.exportMaskBlob()) ?? null;
        if (!placementMask) {
          toast({
            title: "Missing placement shade",
            description: "Shade a rough placement area on the model, or turn off placement shading.",
            variant: "destructive",
          });
          return;
        }
      }
      if (generateCloseUp) {
        closeUpPlacementMask = (await closeUpPlacementShadeRef.current?.exportMaskBlob()) ?? null;
        if (!closeUpPlacementMask) {
          toast({
            title: "Missing close-up placement shade",
            description: "Shade a rough placement area on the close-up pose, or turn off placement shading.",
            variant: "destructive",
          });
          return;
        }
      }
    }
    setGenerating(true);
    setResults(null);
    setDraft(null);
    setActiveGenerationUid(null);
    setProgressLabel(null);
    setShowResults(true);
    try {
      const data = await apiGenerateTryOn(
        token,
        clothingExternalS3Key ? null : clothingFile,
        selectedModel.image_s3_key,
        views,
        {
          aspectRatio,
          outputQuality,
          brandKitUid: selectedBrandKitUid,
          backgroundS3Key: useBackground ? selectedBackground : null,
          dimensions: useDimensions ? collectMeasurements() : null,
          poseSelected: generateFront && wantModelPose,
          modelPoseS3Key: generateFront && wantModelPose ? selectedModelPoseS3Key : null,
          closeUpPoseS3Key: generateCloseUp && wantCloseUpPose ? selectedCloseUpPoseS3Key : null,
          clothingUid: useClothing ? selectedClothingUid : null,
          placementMask,
          closeUpPlacementMask,
          ...(clothingExternalS3Key ? { existingJewelleryS3Key: clothingExternalS3Key } : {}),
        }
      );
      const includeFront = generateFront;
      const includeCloseUp = generateCloseUp;
      const frontKey = includeFront ? data.front_image_s3_key ?? undefined : undefined;
      const closeUpKey = includeCloseUp ? data.close_up_image_s3_key ?? undefined : undefined;
      if (includeFront && !frontKey) {
        throw new Error("Regular view was not produced. Please try again.");
      }
      if (includeCloseUp && !closeUpKey) {
        throw new Error("Close-up view was not produced. Please try again.");
      }
      const frontUrl = frontKey ? await getPresignedUrl(token, frontKey) : undefined;
      const closeUpUrl = closeUpKey ? await getPresignedUrl(token, closeUpKey) : undefined;
      setDraft(data.draft ?? null);
      setActiveGenerationUid(data.generation_uid ?? data.draft?.latest_generation?.uid ?? null);
      setResults({
        ...(frontUrl && frontKey ? { front: frontUrl, frontKey } : {}),
        ...(closeUpUrl && closeUpKey ? { closeUp: closeUpUrl, closeUpKey } : {}),
        analysis: data.analysis ?? null,
      });
      await queryClient.invalidateQueries({ queryKey: ["gallery-items"] });
      const autosaved = data.draft?.latest_generation?.saved ?? false;
      toast({
        title: "Your look is ready",
        description: [
          autosaved ? "Saved to this shoot in your gallery." : "It is not in the gallery yet.",
          views === "both"
            ? "Each view comes with 2 complementary edits if you’d like a change."
            : "Each model shoot comes with 2 complementary edits if you’d like a change.",
        ].join(" "),
      });
    } catch (err) {
      toast({ title: "Generation Failed", description: errorMessage(err), variant: "destructive" });
      setShowResults(false);
    } finally {
      setGenerating(false);
      setProgressLabel(null);
    }
  };

  const handleBackFromResults = () => {
    setShowResults(false);
    setResults(null);
    setDraft(null);
    setActiveGenerationUid(null);
  };

  if (showResults) {
    if (draft?.uid) {
      return (
        <ModelShootReviewSession
          draftUid={draft.uid}
          token={token}
          onBack={handleBackFromResults}
          initialDraft={draft}
          initialResults={results}
          initialGenerationUid={activeGenerationUid}
          loading={generating}
          onEditImage={onEditImage}
          onManualPhotoEdit={onManualPhotoEdit}
          onDraftChange={setDraft}
        />
      );
    }
    return (
      <TryOnResults
        loading={generating}
        results={results}
        onBack={handleBackFromResults}
        token={token}
        progressLabel={progressLabel}
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
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium">Views to generate</p>
                  <p className="text-xs text-muted-foreground">
                    Choose a regular on-model shot, a close-up of the jewellery, or both.
                  </p>
                </div>
                <RadioGroup
                  value={views}
                  onValueChange={(value) => handleViewsChange(value as ModelShootViews)}
                  className="grid gap-3 sm:grid-cols-3"
                >
                  {(
                    [
                      {
                        value: "front",
                        title: "Regular view",
                        description: "Full on-model shot of the piece.",
                      },
                      {
                        value: "close_up",
                        title: "Close-up view",
                        description: "Tight crop highlighting the jewellery.",
                      },
                      {
                        value: "both",
                        title: "Both views",
                        description: "Regular shot plus a jewellery close-up.",
                      },
                    ] as const
                  ).map((option) => (
                    <label
                      key={option.value}
                      htmlFor={`model-views-${option.value}`}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-lg border bg-muted/20 px-4 py-3 transition hover:border-primary/50",
                        views === option.value && "border-primary bg-primary/5 ring-1 ring-primary/30"
                      )}
                    >
                      <RadioGroupItem
                        id={`model-views-${option.value}`}
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

              {generateCloseUp && (
                <div className="mt-4 space-y-4 border-t pt-4">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="wantCloseUpPose"
                      checked={wantCloseUpPose}
                      disabled={usePlacementShade}
                      onCheckedChange={(v) => {
                        const next = !!v;
                        setWantCloseUpPose(next);
                        if (!next) setSelectedCloseUpPoseUid(null);
                      }}
                    />
                    <Label htmlFor="wantCloseUpPose" className="text-sm font-normal leading-none">
                      Select close-up pose reference{usePlacementShade ? "" : " (optional)"}
                    </Label>
                  </div>

                  {wantCloseUpPose && (
                    <div>
                      <p className="mb-3 text-xs text-muted-foreground">
                        Pick a close-up pose. The generated close-up will replicate this
                        framing and pose on your model wearing the jewellery
                        {usePlacementShade
                          ? ", and you will shade the jewellery placement on this pose below."
                          : "."}
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
      <Collapsible open={useBackground}>
        <Card>
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
          <CollapsibleContent>
            <CardContent>
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
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Exact Dimensions (optional) */}
      <Collapsible open={useDimensions}>
        <Card>
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
          <CollapsibleContent>
            <CardContent>
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
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

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
                if (models.length === 0) return null;
                return (
                  <div key={section.key} className="space-y-3">
                    <h3 className="text-sm font-semibold text-foreground">{section.title}</h3>
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
                  </div>
                );
              })}
            </div>
          )}

          {selectedModelUid && (
            <div className="mt-6 space-y-4 border-t pt-6">
              {generateFront && (
                <>
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
                </>
              )}

              <div className={cn("space-y-4", generateFront && "border-t pt-4")}>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="wantClothing"
                    checked={useClothing}
                    onCheckedChange={(v) => {
                      const next = !!v;
                      setUseClothing(next);
                      if (!next) setSelectedClothingUid(null);
                    }}
                  />
                  <Label htmlFor="wantClothing" className="text-sm font-normal leading-none">
                    Select clothing (optional)
                  </Label>
                </div>

                {useClothing && (
                  <div>
                    <h3 className="mb-3 text-sm font-semibold">Select clothing</h3>
                    <p className="mb-3 text-xs text-muted-foreground">
                      Dress the model in this saved item. Its stored description (colour, neckline,
                      and print) replaces the automatic style note.
                    </p>
                    {clothingLoading ? (
                      <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
                        {Array.from({ length: 6 }).map((_, i) => (
                          <Skeleton key={i} className="aspect-[3/4] w-full rounded-lg" />
                        ))}
                      </div>
                    ) : clothingItems.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No clothing yet. Add some under Manage Clothing.
                      </p>
                    ) : (
                      <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
                        {clothingItems.map((item) => (
                          <button
                            key={item.uid}
                            type="button"
                            title={item.description}
                            onClick={() =>
                              setSelectedClothingUid((prev) =>
                                prev === item.uid ? null : item.uid
                              )
                            }
                            className={cn(
                              "group relative aspect-[3/4] overflow-hidden rounded-lg border-2 transition focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                              selectedClothingUid === item.uid
                                ? "border-primary ring-2 ring-primary/30"
                                : "border-transparent hover:border-muted-foreground/30"
                            )}
                          >
                            {clothingUrls[item.uid] ? (
                              <img
                                src={clothingUrls[item.uid]}
                                alt={item.name}
                                className="h-full w-full object-cover"
                                loading="lazy"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center bg-muted">
                                <ImageIcon className="h-8 w-8 text-muted-foreground" />
                              </div>
                            )}
                            <div className="absolute bottom-0 left-0 right-0 bg-black/70 p-2 text-xs text-white">
                              <p className="truncate font-medium">{item.name}</p>
                              <p className="line-clamp-2 text-[11px] text-white/85">
                                {item.description}
                              </p>
                            </div>
                            {selectedClothingUid === item.uid && (
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
            </div>
          )}
        </CardContent>
      </Card>

      {selectedModelUid && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Brush className="h-4 w-4" /> Shade jewellery placement (optional)
              </CardTitle>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="usePlacementShade"
                  checked={usePlacementShade}
                  onCheckedChange={(v) => {
                    const next = !!v;
                    setUsePlacementShade(next);
                    if (!next) {
                      setPlacementHasPaint(false);
                      setCloseUpPlacementHasPaint(false);
                    } else if (generateCloseUp) {
                      setWantCloseUpPose(true);
                    }
                  }}
                />
                <Label htmlFor="usePlacementShade" className="text-xs">
                  Shade placement area
                </Label>
              </div>
            </div>
          </CardHeader>
          {usePlacementShade && (
            <CardContent className="space-y-8">
              <p className="text-xs text-muted-foreground">
                Paint a rough mark for where the piece should sit and about how large it should
                read. This is a hint only — Gemini does a realistic try-on, not a paste that fills
                your shade.
                {generateFront && generateCloseUp
                  ? " Shade the regular on-model shot and the close-up pose separately."
                  : generateCloseUp
                    ? " Shade the jewellery area on the close-up pose."
                    : " Shade the regular on-model shot."}
              </p>

              {generateFront && (
                <div className="space-y-4">
                  <p className="text-sm font-medium">Regular model shoot</p>
                  {wantModelPose && !selectedModelPoseUid ? (
                    <p className="text-sm text-muted-foreground">
                      Pick a model pose above, then shade the jewellery area on that pose.
                    </p>
                  ) : placementImageUrl ? (
                    <PlacementShadeCanvas
                      key={placementImageUrl}
                      ref={placementShadeRef}
                      imageUrl={placementImageUrl}
                      imageAlt="Model for jewellery placement"
                      onPaintChange={setPlacementHasPaint}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">Loading model image…</p>
                  )}
                </div>
              )}

              {generateCloseUp && (
                <div className={cn("space-y-4", generateFront && "border-t pt-6")}>
                  <p className="text-sm font-medium">Close-up model shoot</p>
                  {!wantCloseUpPose || !selectedCloseUpPoseUid ? (
                    <p className="text-sm text-muted-foreground">
                      Pick a close-up pose above, then shade the jewellery area on that pose.
                    </p>
                  ) : closeUpPlacementImageUrl ? (
                    <PlacementShadeCanvas
                      key={closeUpPlacementImageUrl}
                      ref={closeUpPlacementShadeRef}
                      imageUrl={closeUpPlacementImageUrl}
                      imageAlt="Close-up pose for jewellery placement"
                      onPaintChange={setCloseUpPlacementHasPaint}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">Loading close-up pose…</p>
                  )}
                </div>
              )}
            </CardContent>
          )}
        </Card>
      )}

      {/* Generate Button */}
      <div className="flex justify-center">
        <Button
          size="lg"
          onClick={handleGenerate}
          disabled={
            generating ||
            !(clothingFile || clothingExternalS3Key) ||
            !selectedModelUid ||
            (generateFront && wantModelPose && !selectedModelPoseS3Key) ||
            (generateCloseUp && wantCloseUpPose && !selectedCloseUpPoseS3Key) ||
            (useBackground && !selectedBackground) ||
            (useClothing && !selectedClothingUid) ||
            (usePlacementShade && generateFront && !placementHasPaint) ||
            (usePlacementShade && generateCloseUp && !closeUpPlacementHasPaint) ||
            (usePlacementShade && generateCloseUp && !selectedCloseUpPoseS3Key)
          }
          className="min-w-[220px]"
        >
          Generate Try-On Images
        </Button>
      </div>
    </div>
  );
}
