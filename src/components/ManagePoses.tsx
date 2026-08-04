import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  apiListFemalePoses,
  apiListMalePoses,
  apiDeletePose,
  getPresignedUrl,
  type PoseRecord,
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
import { ImageIcon, Trash2, Loader2, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import CreatePoseDialog from "@/components/CreatePoseDialog";

type PoseSections = {
  female: PoseRecord[];
  male: PoseRecord[];
};

const EMPTY_SECTIONS: PoseSections = {
  female: [],
  male: [],
};

function audienceLabel(pose: PoseRecord) {
  const parts: string[] = [];
  if (pose.adult) parts.push("Adult");
  if (pose.child) parts.push("Child");
  return parts.length > 0 ? parts.join(", ") : "—";
}

export default function ManagePoses() {
  const { token } = useAuth();
  const { toast } = useToast();

  const [posesBySection, setPosesBySection] = useState<PoseSections>(EMPTY_SECTIONS);
  const [poseUrls, setPoseUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [deletingUid, setDeletingUid] = useState<string | null>(null);
  const [confirmDeleteUid, setConfirmDeleteUid] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const fetchPoses = useCallback(async () => {
    if (!token) return;

    setLoading(true);
    try {
      const [female, male] = await Promise.all([
        apiListFemalePoses(token),
        apiListMalePoses(token),
      ]);
      setPosesBySection({ female, male });

      const allPoses = [...female, ...male];
      const urlEntries = await Promise.all(
        allPoses.map(async (pose) => {
          try {
            const url = await getPresignedUrl(token, pose.image_s3_key);
            return [pose.uid, url] as [string, string];
          } catch {
            return [pose.uid, ""] as [string, string];
          }
        })
      );

      setPoseUrls(Object.fromEntries(urlEntries));
    } catch (err: unknown) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to load poses",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [token, toast]);

  useEffect(() => {
    fetchPoses();
  }, [fetchPoses]);

  const handleDelete = async (uid: string) => {
    if (!token) return;

    setDeletingUid(uid);
    try {
      await apiDeletePose(token, uid);
      toast({ title: "Deleted", description: "Pose removed." });
      setPosesBySection((prev) => ({
        female: prev.female.filter((p) => p.uid !== uid),
        male: prev.male.filter((p) => p.uid !== uid),
      }));
      setPoseUrls((prev) => {
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

  const sectionConfigs: Array<{ key: keyof PoseSections; title: string }> = [
    { key: "female", title: "Female" },
    { key: "male", title: "Male" },
  ];

  const hasAnyPose =
    posesBySection.female.length > 0 || posesBySection.male.length > 0;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Manage Poses</CardTitle>
            <Button size="sm" onClick={() => setIsCreateModalOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Pose
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="aspect-[3/4] w-full rounded-lg" />
              ))}
            </div>
          ) : !hasAnyPose ? (
            <div className="flex flex-col items-center justify-center py-16">
              <ImageIcon className="mb-4 h-16 w-16 text-muted-foreground/40" />
              <p className="text-muted-foreground">No poses yet</p>
            </div>
          ) : (
            <div className="space-y-8">
              {sectionConfigs.map((section) => {
                const poses = posesBySection[section.key];
                return (
                  <div key={section.key} className="space-y-3">
                    <h3 className="text-sm font-semibold text-foreground">{section.title}</h3>
                    {poses.length === 0 ? (
                      <div className="py-2 text-sm text-muted-foreground">
                        No poses in this category.
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
                        {poses.map((pose) => (
                          <div
                            key={pose.uid}
                            className="group relative aspect-[3/4] overflow-hidden rounded-lg border"
                          >
                            {poseUrls[pose.uid] ? (
                              <img
                                src={poseUrls[pose.uid]}
                                alt={pose.name}
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
                                disabled={deletingUid === pose.uid}
                                onClick={() => setConfirmDeleteUid(pose.uid)}
                              >
                                {deletingUid === pose.uid ? (
                                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                ) : (
                                  <Trash2 className="mr-1 h-3 w-3" />
                                )}
                                Delete
                              </Button>
                            </div>
                            <div className="absolute bottom-0 left-0 right-0 bg-black/70 p-2 text-xs text-white">
                              <p className="truncate font-medium">{pose.name}</p>
                              <p className="truncate">{audienceLabel(pose)}</p>
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
        </CardContent>
      </Card>

      <CreatePoseDialog
        token={token}
        open={isCreateModalOpen}
        onOpenChange={setIsCreateModalOpen}
        onCreated={fetchPoses}
      />

      <AlertDialog open={!!confirmDeleteUid} onOpenChange={() => setConfirmDeleteUid(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Pose</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this pose and its image. This action cannot be undone.
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
