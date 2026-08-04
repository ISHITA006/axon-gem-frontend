import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  apiListFemaleAdultModels,
  apiListFemaleChildModels,
  apiListMaleAdultModels,
  apiListMaleChildModels,
  apiListPoses,
  apiListModelPosesForModel,
  apiCreateModelPose,
  apiDeleteModelPose,
  apiGenerateModelPoseImage,
  modelPoseImageS3KeyFromGenerateResponse,
  getPresignedUrl,
  type ModelRecord,
  type PoseRecord,
  type ModelPoseRecord,
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Check, ImageIcon, Layers, Loader2, Sparkles, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const ALL_POSES_VALUE = "__all__";

type ModelSections = {
  femaleAdult: ModelRecord[];
  femaleChild: ModelRecord[];
  maleAdult: ModelRecord[];
  maleChild: ModelRecord[];
};

type PoseSections = { female: PoseRecord[]; male: PoseRecord[] };

const modelSectionConfigs: Array<{ key: keyof ModelSections; title: string }> = [
  { key: "femaleAdult", title: "Female Adult" },
  { key: "femaleChild", title: "Female Child" },
  { key: "maleAdult", title: "Male Adult" },
  { key: "maleChild", title: "Male Child" },
];

const poseSectionConfigs: Array<{ key: keyof PoseSections; title: string }> = [
  { key: "female", title: "Female" },
  { key: "male", title: "Male" },
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

function posesIntoSections(poses: PoseRecord[]): PoseSections {
  const female: PoseRecord[] = [];
  const male: PoseRecord[] = [];
  for (const p of poses) {
    const g = p.gender.toLowerCase();
    if (g === "male") male.push(p);
    else female.push(p);
  }
  return { female, male };
}

export default function ManageModelPoses() {
  const { token } = useAuth();
  const { toast } = useToast();

  const [models, setModels] = useState<ModelRecord[]>([]);
  const [poses, setPoses] = useState<PoseRecord[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [modelRefUrls, setModelRefUrls] = useState<Record<string, string>>({});
  const [poseRefUrls, setPoseRefUrls] = useState<Record<string, string>>({});

  const [selectedModelUid, setSelectedModelUid] = useState<string>("");
  const [filterPoseUid, setFilterPoseUid] = useState<string>(ALL_POSES_VALUE);

  const [rows, setRows] = useState<ModelPoseRecord[]>([]);
  const [rowUrls, setRowUrls] = useState<Record<string, string>>({});
  const [listLoading, setListLoading] = useState(false);

  const [deletingUid, setDeletingUid] = useState<string | null>(null);
  const [confirmDeleteUid, setConfirmDeleteUid] = useState<string | null>(null);
  const [generatingPose, setGeneratingPose] = useState(false);

  const poseByUid = useMemo(() => Object.fromEntries(poses.map((p) => [p.uid, p])), [poses]);
  const modelByUid = useMemo(() => Object.fromEntries(models.map((m) => [m.uid, m])), [models]);
  const modelsBySection = useMemo(() => modelsIntoSections(models), [models]);
  const posesBySection = useMemo(() => posesIntoSections(poses), [poses]);

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
    if (!token || (models.length === 0 && poses.length === 0)) {
      setModelRefUrls({});
      setPoseRefUrls({});
      return;
    }

    let cancelled = false;

    const load = async () => {
      const [modelEntries, poseEntries] = await Promise.all([
        Promise.all(
          models.map(async (m) => {
            try {
              const url = await getPresignedUrl(token, m.image_s3_key);
              return [m.uid, url] as [string, string];
            } catch {
              return [m.uid, ""] as [string, string];
            }
          })
        ),
        Promise.all(
          poses.map(async (p) => {
            try {
              const url = await getPresignedUrl(token, p.image_s3_key);
              return [p.uid, url] as [string, string];
            } catch {
              return [p.uid, ""] as [string, string];
            }
          })
        ),
      ]);

      if (!cancelled) {
        setModelRefUrls(Object.fromEntries(modelEntries));
        setPoseRefUrls(Object.fromEntries(poseEntries));
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [token, models, poses]);

  const fetchModelPoses = useCallback(async () => {
    if (!token || !selectedModelUid) {
      setRows([]);
      setRowUrls({});
      return;
    }

    setListLoading(true);
    try {
      let list = await apiListModelPosesForModel(token, selectedModelUid);
      if (filterPoseUid !== ALL_POSES_VALUE) {
        list = list.filter((r) => r.pose_uid === filterPoseUid);
      }
      setRows(list);

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
      setRowUrls(Object.fromEntries(urlEntries));
    } catch (err: unknown) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to load model poses",
        variant: "destructive",
      });
      setRows([]);
      setRowUrls({});
    } finally {
      setListLoading(false);
    }
  }, [token, selectedModelUid, filterPoseUid, toast]);

  useEffect(() => {
    fetchModelPoses();
  }, [fetchModelPoses]);

  const handleGenerateForFilteredPose = async () => {
    if (!token || !selectedModelUid || filterPoseUid === ALL_POSES_VALUE) return;

    const model = modelByUid[selectedModelUid];
    const pose = poseByUid[filterPoseUid];
    if (!model || !pose) {
      toast({ title: "Error", description: "Invalid model or pose.", variant: "destructive" });
      return;
    }

    setGeneratingPose(true);
    try {
      const genJson = await apiGenerateModelPoseImage(token, model.image_s3_key, pose.image_s3_key);
      const imageS3Key = modelPoseImageS3KeyFromGenerateResponse(genJson);
      await apiCreateModelPose(token, {
        model_uid: selectedModelUid,
        pose_uid: filterPoseUid,
        image_s3_key: imageS3Key,
      });
      toast({ title: "Created", description: "Model pose saved." });
      await fetchModelPoses();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Generation failed";
      toast({ title: "Could not create model pose", description: message, variant: "destructive" });
    } finally {
      setGeneratingPose(false);
    }
  };

  const handleDelete = async (uid: string) => {
    if (!token) return;
    setDeletingUid(uid);
    try {
      await apiDeleteModelPose(token, uid);
      toast({ title: "Deleted", description: "Model pose removed." });
      setRows((prev) => prev.filter((r) => r.uid !== uid));
      setRowUrls((prev) => {
        const next = { ...prev };
        delete next[uid];
        return next;
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Delete failed";
      toast({ title: "Delete Failed", description: message, variant: "destructive" });
    } finally {
      setDeletingUid(null);
      setConfirmDeleteUid(null);
    }
  };

  const selectedModel = selectedModelUid ? modelByUid[selectedModelUid] : undefined;
  const hasAnyModel = models.length > 0;

  return (
    <>
      <div className="space-y-6">
        <Card>
          <CardHeader className="space-y-1 px-6 pb-4 pt-6 sm:px-8 sm:pb-6">
            <CardTitle className="text-lg font-semibold tracking-tight">Browse model poses</CardTitle>
          </CardHeader>
          <CardContent className="space-y-8 px-6 pb-8 pt-0 sm:px-8 sm:pb-10">
            {!selectedModelUid ? (
              <div>
                <h3 className="mb-3 text-sm font-semibold">Select a reference model</h3>
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
                                onClick={() => {
                                  setSelectedModelUid(model.uid);
                                  setFilterPoseUid(ALL_POSES_VALUE);
                                }}
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
                        setFilterPoseUid(ALL_POSES_VALUE);
                      }}
                    >
                      Change model
                    </Button>
                  </div>
                )}

                <div>
                  <h3 className="mb-3 text-sm font-semibold">Filter by reference pose (optional)</h3>
                  <p className="mb-3 text-xs text-muted-foreground">
                    Narrow the list to one pose, or keep all poses for this model.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setFilterPoseUid(ALL_POSES_VALUE)}
                      className={cn(
                        "flex h-28 w-20 shrink-0 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-1 text-center transition focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 sm:h-32 sm:w-24",
                        filterPoseUid === ALL_POSES_VALUE
                          ? "border-primary bg-primary/5 ring-2 ring-primary/25"
                          : "border-muted-foreground/30 hover:border-muted-foreground/50 hover:bg-muted/40"
                      )}
                    >
                      <Layers className="h-6 w-6 text-muted-foreground" />
                      <span className="text-[10px] font-medium leading-tight sm:text-xs">All poses</span>
                      {filterPoseUid === ALL_POSES_VALUE && (
                        <Check className="h-4 w-4 text-primary" strokeWidth={2.5} />
                      )}
                    </button>

                    {poseSectionConfigs.map(({ key, title }) => {
                      const sectionPoses = posesBySection[key];
                      if (sectionPoses.length === 0) return null;
                      return (
                        <div key={key} className="contents">
                          {sectionPoses.map((pose) => (
                            <button
                              key={pose.uid}
                              type="button"
                              onClick={() => setFilterPoseUid(pose.uid)}
                              title={`${title}: ${pose.name}`}
                              className={cn(
                                "relative aspect-[3/4] w-20 shrink-0 overflow-hidden rounded-lg border-2 transition focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 sm:w-24",
                                filterPoseUid === pose.uid
                                  ? "border-primary ring-2 ring-primary/30"
                                  : "border-transparent hover:border-muted-foreground/30"
                              )}
                            >
                              {poseRefUrls[pose.uid] ? (
                                <img
                                  src={poseRefUrls[pose.uid]}
                                  alt={pose.name}
                                  className="h-full w-full object-cover"
                                  loading="lazy"
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center bg-muted">
                                  <ImageIcon className="h-6 w-6 text-muted-foreground" />
                                </div>
                              )}
                              <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-1 py-0.5 text-[9px] text-white sm:text-[10px]">
                                <p className="truncate font-medium">{pose.name}</p>
                              </div>
                              {filterPoseUid === pose.uid && (
                                <div className="absolute inset-0 flex items-center justify-center bg-primary/20">
                                  <Check className="h-6 w-6 text-primary drop-shadow-md" strokeWidth={2.5} />
                                </div>
                              )}
                            </button>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {selectedModelUid && (
              <div>
                <h3 className="mb-3 text-sm font-semibold">Model poses</h3>
                {listLoading ? (
                  <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <Skeleton key={i} className="aspect-[3/4] w-full rounded-lg" />
                    ))}
                  </div>
                ) : rows.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
                    <ImageIcon className="mb-3 h-12 w-12 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">
                      {filterPoseUid === ALL_POSES_VALUE
                        ? "No model poses for this model yet."
                        : "No results for this model and pose."}
                    </p>
                    {filterPoseUid !== ALL_POSES_VALUE && (
                      <Button
                        type="button"
                        className="mt-4"
                        disabled={generatingPose || catalogLoading}
                        onClick={handleGenerateForFilteredPose}
                      >
                        {generatingPose ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Sparkles className="mr-2 h-4 w-4" />
                        )}
                        Generate for this pose
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                    {rows.map((row) => {
                      const pose = poseByUid[row.pose_uid];
                      return (
                        <div
                          key={row.uid}
                          className="group relative aspect-[3/4] overflow-hidden rounded-lg border"
                        >
                          {rowUrls[row.uid] ? (
                            <img
                              src={rowUrls[row.uid]}
                              alt={pose?.name ?? "Model pose"}
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-muted">
                              <ImageIcon className="h-8 w-8 text-muted-foreground" />
                            </div>
                          )}
                          <div className="absolute inset-0 flex items-start justify-center bg-gradient-to-b from-black/60 to-transparent opacity-0 transition group-hover:opacity-100">
                            <Button
                              variant="destructive"
                              size="sm"
                              className="mt-3"
                              disabled={deletingUid === row.uid}
                              onClick={() => setConfirmDeleteUid(row.uid)}
                            >
                              {deletingUid === row.uid ? (
                                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                              ) : (
                                <Trash2 className="mr-1 h-3 w-3" />
                              )}
                              Delete
                            </Button>
                          </div>
                          <div className="absolute bottom-0 left-0 right-0 bg-black/70 p-2 text-xs text-white">
                            <p className="truncate font-medium">{pose?.name ?? row.pose_uid}</p>
                            {selectedModel && (
                              <p className="truncate text-white/80">{selectedModel.name}</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={!!confirmDeleteUid} onOpenChange={() => setConfirmDeleteUid(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete model pose</AlertDialogTitle>
            <AlertDialogDescription>
              This removes this generated model pose record and its image. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmDeleteUid && handleDelete(confirmDeleteUid)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
