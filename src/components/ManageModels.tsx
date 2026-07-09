import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  apiListFemaleAdultModels,
  apiListFemaleChildModels,
  apiListMaleAdultModels,
  apiListMaleChildModels,
  apiDeleteModel,
  getPresignedUrl,
  type ModelRecord,
} from "@/lib/api";
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
import { ImageIcon, Trash2, Loader2, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import CreateModelDialog from "@/components/CreateModelDialog";

type ModelSections = {
  femaleAdult: ModelRecord[];
  femaleChild: ModelRecord[];
  maleAdult: ModelRecord[];
  maleChild: ModelRecord[];
};

const EMPTY_MODEL_SECTIONS: ModelSections = {
  femaleAdult: [],
  femaleChild: [],
  maleAdult: [],
  maleChild: [],
};

export default function ManageModels() {
  const { token } = useAuth();
  const { toast } = useToast();

  const [modelsBySection, setModelsBySection] = useState<ModelSections>(EMPTY_MODEL_SECTIONS);
  const [modelUrls, setModelUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [deletingUid, setDeletingUid] = useState<string | null>(null);
  const [confirmDeleteUid, setConfirmDeleteUid] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const fetchModels = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [femaleAdult, femaleChild, maleAdult, maleChild] = await Promise.all([
        apiListFemaleAdultModels(token),
        apiListFemaleChildModels(token),
        apiListMaleAdultModels(token),
        apiListMaleChildModels(token),
      ]);

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
    } catch (err: unknown) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to load models",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchModels();
  }, [token]);

  const handleDelete = async (uid: string) => {
    if (!token) return;
    setDeletingUid(uid);
    try {
      await apiDeleteModel(token, uid);
      toast({ title: "Deleted", description: "Model removed." });
      setModelsBySection((prev) => ({
        femaleAdult: prev.femaleAdult.filter((model) => model.uid !== uid),
        femaleChild: prev.femaleChild.filter((model) => model.uid !== uid),
        maleAdult: prev.maleAdult.filter((model) => model.uid !== uid),
        maleChild: prev.maleChild.filter((model) => model.uid !== uid),
      }));
      setModelUrls((prev) => {
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

  const sectionConfigs: Array<{ key: keyof ModelSections; title: string }> = [
    { key: "femaleAdult", title: "Female Adult" },
    { key: "femaleChild", title: "Female Child" },
    { key: "maleAdult", title: "Male Adult" },
    { key: "maleChild", title: "Male Child" },
  ];

  const hasAnyModel = Object.values(modelsBySection).some((section) => section.length > 0);

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button size="sm" onClick={() => setIsCreateModalOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Model
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[3/4] w-full rounded-lg" />
          ))}
        </div>
      ) : !hasAnyModel ? (
        <div className="flex flex-col items-center justify-center py-16">
          <ImageIcon className="mb-4 h-16 w-16 text-muted-foreground/40" />
          <p className="text-muted-foreground">No models yet</p>
        </div>
      ) : (
        <div className="space-y-8">
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
                      <div
                        key={model.uid}
                        className="group relative aspect-[3/4] overflow-hidden rounded-lg border"
                      >
                        {modelUrls[model.uid] ? (
                          <img
                            src={modelUrls[model.uid]}
                            alt="Model"
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
                            disabled={deletingUid === model.uid}
                            onClick={() => setConfirmDeleteUid(model.uid)}
                          >
                            {deletingUid === model.uid ? (
                              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                            ) : (
                              <Trash2 className="mr-1 h-3 w-3" />
                            )}
                            Delete
                          </Button>
                        </div>
                        <div className="absolute bottom-0 left-0 right-0 bg-black/70 p-2 text-xs text-white">
                          <p className="truncate font-medium">{model.name}</p>
                          <p className="truncate">
                            {model.gender.toString().charAt(0).toUpperCase() +
                              model.gender.toString().slice(1)}{" "}
                            |{" "}
                            {model.category.toString().charAt(0).toUpperCase() +
                              model.category.toString().slice(1)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <CreateModelDialog
        token={token}
        open={isCreateModalOpen}
        onOpenChange={setIsCreateModalOpen}
        onCreated={fetchModels}
      />

      <AlertDialog open={!!confirmDeleteUid} onOpenChange={() => setConfirmDeleteUid(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Model</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this model. This action cannot be undone.
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
