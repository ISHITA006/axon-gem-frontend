import { useEffect, useState, useRef, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  apiListFemaleAdultModels,
  apiListFemaleChildModels,
  apiListMaleAdultModels,
  apiListMaleChildModels,
  apiListPoses,
  apiListModelPosesForModel,
  apiGetBackgroundImages,
  apiGenerateTryOnPoseBg,
  getPresignedUrl,
  type ModelRecord,
  type PoseRecord,
  type ModelPoseRecord,
  TryOnAnalysis,
} from "@/lib/api";
import ModelShootResults from "@/components/ModelShootResults";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, Upload, ImageIcon, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { createDisplayableImageObjectUrl } from "@/lib/heicImage";
import { cn } from "@/lib/utils";

type ModelSections = {
  femaleAdult: ModelRecord[];
  femaleChild: ModelRecord[];
  maleAdult: ModelRecord[];
  maleChild: ModelRecord[];
};

interface ModelShootProps {
  onEditImage?: (s3Key: string, imageUrl: string) => void;
  onChangeColour?: (s3Key: string, imageUrl: string) => void;
  onChangeLength?: (s3Key: string, imageUrl: string) => void;
}

const modelSectionConfigs: Array<{ key: keyof ModelSections; title: string }> = [
  { key: "femaleAdult", title: "Female Adult" },
  { key: "femaleChild", title: "Female Child" },
  { key: "maleAdult", title: "Male Adult" },
  { key: "maleChild", title: "Male Child" },
];

function modelsIntoSections(models: ModelRecord[]): ModelSections {
  const next: ModelSections = {
    femaleAdult: [],
    femaleChild: [],
    maleAdult: [],
    maleChild: [],
  };
  for (const m of models) {
    const g = m.gender.toLowerCase().trim();
    const c = m.category.toLowerCase().trim();
    if (g === "female" && c === "adult") next.femaleAdult.push(m);
    else if (g === "female" && c === "child") next.femaleChild.push(m);
    else if (g === "male" && c === "adult") next.maleAdult.push(m);
    else if (g === "male" && c === "child") next.maleChild.push(m);
  }
  return next;
}

export default function ModelShoot({ onEditImage, onChangeColour, onChangeLength }: ModelShootProps) {
  const { token } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [flatlayFile, setFlatlayFile] = useState<File | null>(null);
  const [flatlayPreview, setFlatlayPreview] = useState<string | null>(null);

  const [useBackground, setUseBackground] = useState(false);
  const [backgroundKeys, setBackgroundKeys] = useState<string[]>([]);
  const [backgroundUrls, setBackgroundUrls] = useState<Record<string, string>>({});
  const [selectedBackground, setSelectedBackground] = useState<string | null>(null);
  const [backgroundsLoading, setBackgroundsLoading] = useState(true);

  const [models, setModels] = useState<ModelRecord[]>([]);
  const [poses, setPoses] = useState<PoseRecord[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [modelRefUrls, setModelRefUrls] = useState<Record<string, string>>({});

  const [selectedModelUid, setSelectedModelUid] = useState("");
  const [wantModelPose, setWantModelPose] = useState(false);
  const [modelPoseRows, setModelPoseRows] = useState<ModelPoseRecord[]>([]);
  const [poseRowUrls, setPoseRowUrls] = useState<Record<string, string>>({});
  const [modelPosesLoading, setModelPosesLoading] = useState(false);
  const [selectedModelPoseUid, setSelectedModelPoseUid] = useState<string | null>(null);

  const [generating, setGenerating] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [results, setResults] = useState<{ imageUrl: string; imageKey: string; analysis?: TryOnAnalysis | null } | null>(null);

  const modelByUid = useMemo(() => Object.fromEntries(models.map((m) => [m.uid, m])), [models]);
  const poseByUid = useMemo(() => Object.fromEntries(poses.map((p) => [p.uid, p])), [poses]);
  const modelsBySection = useMemo(() => modelsIntoSections(models), [models]);

  const selectedModelPoseS3Key = useMemo(() => {
    const row = modelPoseRows.find((r) => r.uid === selectedModelPoseUid);
    return row?.image_s3_key ?? null;
  }, [modelPoseRows, selectedModelPoseUid]);

  const modelReferenceS3Key = useMemo(() => {
    const model = selectedModelUid ? modelByUid[selectedModelUid] : undefined;
    if (!model) return null;
    if (wantModelPose) return selectedModelPoseS3Key;
    return model.image_s3_key ?? null;
  }, [selectedModelUid, modelByUid, wantModelPose, selectedModelPoseS3Key]);

  useEffect(() => {
    if (!token) return;
    setCatalogLoading(true);
    Promise.all([
      apiListFemaleAdultModels(token),
      apiListFemaleChildModels(token),
      apiListMaleAdultModels(token),
      apiListMaleChildModels(token),
      apiListPoses(token),
    ])
      .then(([fa, fc, ma, mc, poseList]) => {
        setModels([...fa, ...fc, ...ma, ...mc]);
        setPoses(poseList);
      })
      .catch((err: unknown) =>
        toast({
          title: "Error",
          description: err instanceof Error ? err.message : "Failed to load models or poses",
          variant: "destructive",
        })
      )
      .finally(() => setCatalogLoading(false));
  }, [token, toast]);

  useEffect(() => {
    if (!token || models.length === 0) {
      setModelRefUrls({});
      return;
    }
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        models.map(async (m) => {
          try {
            const url = await getPresignedUrl(token, m.image_s3_key);
            return [m.uid, url] as [string, string];
          } catch {
            return [m.uid, ""] as [string, string];
          }
        })
      );
      if (!cancelled) setModelRefUrls(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [token, models]);

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
              const url = await getPresignedUrl(token, row.image_s3_key);
              return [row.uid, url] as [string, string];
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

  useEffect(() => {
    return () => {
      if (flatlayPreview) URL.revokeObjectURL(flatlayPreview);
    };
  }, [flatlayPreview]);

  const handleFlatlaySelect = async (file: File | null) => {
    if (!file) return;
    try {
      const url = await createDisplayableImageObjectUrl(file);
      setFlatlayFile(file);
      setFlatlayPreview(url);
    } catch {
      toast({ title: "Could not load image", description: "Please try a different file.", variant: "destructive" });
    }
  };

  const handleGenerate = async () => {
    if (!token || !flatlayFile || !modelReferenceS3Key) {
      toast({
        title: "Missing fields",
        description: wantModelPose
          ? "Upload a flatlay, choose a model, and pick one of their model poses."
          : "Upload a flatlay and choose a model.",
        variant: "destructive",
      });
      return;
    }

    if (useBackground && !selectedBackground) {
      toast({
        title: "Missing background",
        description: "Select a background, or uncheck the background option.",
        variant: "destructive",
      });
      return;
    }

    setGenerating(true);
    setResults(null);
    setShowResults(true);

    try {
      const data = await apiGenerateTryOnPoseBg(
        token,
        flatlayFile,
        modelReferenceS3Key,
        useBackground ? selectedBackground : null,
        wantModelPose
      );

      type ModelShootResponse = {
        try_on_image_s3_key: string;
        analysis: Record<string, unknown>;
      };

      const typedData = data as ModelShootResponse;

      if (!typedData.try_on_image_s3_key || typeof typedData.try_on_image_s3_key !== "string") {
        throw new Error("Server did not return a generated image key");
      }

      const imageUrl = await getPresignedUrl(token, typedData.try_on_image_s3_key);
      setResults({ imageUrl, imageKey: typedData.try_on_image_s3_key, analysis: typedData.analysis });
      toast({ title: "Success", description: "Model shoot image generated!" });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Please try again";
      toast({ title: "Generation Failed", description: message, variant: "destructive" });
      setShowResults(false);
    } finally {
      setGenerating(false);
    }
  };

  const handleBackFromResults = () => {
    setShowResults(false);
    setResults(null);
  };

  const hasAnyModel = models.length > 0;
  const selectedModel = selectedModelUid ? modelByUid[selectedModelUid] : undefined;

  if (showResults) {
    return (
      <ModelShootResults
        loading={generating}
        results={results}
        onBack={handleBackFromResults}
        token={token}
        onEditImage={onEditImage}
        onChangeLength={onChangeLength}
        onChangeColour={onChangeColour}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Upload className="h-4 w-4" /> Jewellery Flatlay Image *
            </CardTitle>
          </CardHeader>
          <CardContent>
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/20 p-6 transition hover:border-primary/50 hover:bg-muted/40">
              {flatlayPreview ? (
                <img src={flatlayPreview} alt="Flatlay" className="max-h-48 rounded object-contain" />
              ) : (
                <>
                  <ImageIcon className="mb-2 h-10 w-10 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Click to upload flatlay image</span>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.heic,.heif"
                className="hidden"
                onChange={(e) => void handleFlatlaySelect(e.target.files?.[0] || null)}
              />
            </label>
          </CardContent>
        </Card>

        <Card className={!useBackground ? "opacity-50" : ""}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">Background (optional)</CardTitle>
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
                <p className="text-sm text-muted-foreground">No background images found.</p>
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
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Model &amp; pose</CardTitle>
        </CardHeader>
        <CardContent className="space-y-8">
          {!selectedModelUid ? (
            <div>
              <h3 className="mb-3 text-sm font-semibold">Select a model</h3>
              {catalogLoading ? (
                <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="aspect-[3/4] w-full rounded-lg" />
                  ))}
                </div>
              ) : !hasAnyModel ? (
                <p className="text-sm text-muted-foreground">No models found.</p>
              ) : (
                <div className="space-y-6">
                  {modelSectionConfigs.map(({ key, title }) => {
                    const sectionModels = modelsBySection[key];
                    if (sectionModels.length === 0) return null;
                    return (
                      <div key={key} className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">{title}</p>
                        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
                          {sectionModels.map((model) => (
                            <button
                              key={model.uid}
                              type="button"
                              onClick={() => setSelectedModelUid(model.uid)}
                              className="group relative aspect-[3/4] overflow-hidden rounded-lg border-2 border-transparent transition hover:border-muted-foreground/30 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                            >
                              {modelRefUrls[model.uid] ? (
                                <img
                                  src={modelRefUrls[model.uid]}
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
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <>
              {selectedModel && (
                <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div className="relative h-20 w-14 shrink-0 overflow-hidden rounded-md border bg-background sm:h-24 sm:w-[4.5rem]">
                      {modelRefUrls[selectedModel.uid] ? (
                        <img
                          src={modelRefUrls[selectedModel.uid]}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-muted">
                          <ImageIcon className="h-6 w-6 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium leading-tight">{selectedModel.name}</p>
                      <p className="text-sm capitalize text-muted-foreground">
                        {selectedModel.gender} · {selectedModel.category}
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 self-start sm:self-center"
                    onClick={() => {
                      setSelectedModelUid("");
                      setSelectedModelPoseUid(null);
                      setWantModelPose(false);
                    }}
                  >
                    Change model
                  </Button>
                </div>
              )}

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
                    These are saved model poses for this model (from model pose management). The image you pick is
                    sent to the shoot API as the model reference when pose is enabled.
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
        </CardContent>
      </Card>

      <div className="flex justify-center">
        <Button
          size="lg"
          onClick={handleGenerate}
          disabled={
            generating ||
            !flatlayFile ||
            !modelReferenceS3Key ||
            (useBackground && !selectedBackground)
          }
          className="min-w-[260px]"
        >
          {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Generate Model Shoot
        </Button>
      </div>
    </div>
  );
}
