import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  apiListProductAngles,
  apiDeleteProductAngle,
  getPresignedUrl,
  type ProductAngleRecord,
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
import CreateProductAngleDialog from "@/components/CreateProductAngleDialog";

export default function ManageProductAngles() {
  const { token } = useAuth();
  const { toast } = useToast();

  const [angles, setAngles] = useState<ProductAngleRecord[]>([]);
  const [angleUrls, setAngleUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [deletingUid, setDeletingUid] = useState<string | null>(null);
  const [confirmDeleteUid, setConfirmDeleteUid] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const fetchAngles = useCallback(async () => {
    if (!token) return;

    setLoading(true);
    try {
      const list = await apiListProductAngles(token);
      setAngles(list);

      const urlEntries = await Promise.all(
        list.map(async (angle) => {
          try {
            return [angle.uid, await getPresignedUrl(token, angle.image_s3_key)] as [string, string];
          } catch {
            return [angle.uid, ""] as [string, string];
          }
        })
      );
      setAngleUrls(Object.fromEntries(urlEntries));
    } catch (err: unknown) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to load product angles",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [token, toast]);

  useEffect(() => {
    fetchAngles();
  }, [fetchAngles]);

  const handleDelete = async (uid: string) => {
    if (!token) return;

    setDeletingUid(uid);
    try {
      await apiDeleteProductAngle(token, uid);
      toast({ title: "Deleted", description: "Product angle removed." });
      setAngles((prev) => prev.filter((a) => a.uid !== uid));
      setAngleUrls((prev) => {
        const next = { ...prev };
        delete next[uid];
        return next;
      });
    } catch (err: unknown) {
      toast({
        title: "Delete Failed",
        description: err instanceof Error ? err.message : "Delete failed",
        variant: "destructive",
      });
    } finally {
      setDeletingUid(null);
      setConfirmDeleteUid(null);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Manage Product Angles</CardTitle>
            <Button size="sm" onClick={() => setIsCreateModalOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Product Angle
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">
            Product angles are reference poses used when generating front-view studio product
            shoots. Select one during Product Shoot to direct the camera angle.
          </p>
          {loading ? (
            <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="aspect-[3/4] w-full rounded-lg" />
              ))}
            </div>
          ) : angles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <ImageIcon className="mb-4 h-16 w-16 text-muted-foreground/40" />
              <p className="text-muted-foreground">No product angles yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
              {angles.map((angle) => (
                <div
                  key={angle.uid}
                  className="group relative aspect-[3/4] overflow-hidden rounded-lg border"
                >
                  {angleUrls[angle.uid] ? (
                    <img
                      src={angleUrls[angle.uid]}
                      alt={angle.name}
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
                      disabled={deletingUid === angle.uid}
                      onClick={() => setConfirmDeleteUid(angle.uid)}
                    >
                      {deletingUid === angle.uid ? (
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      ) : (
                        <Trash2 className="mr-1 h-3 w-3" />
                      )}
                      Delete
                    </Button>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 bg-black/70 p-2 text-xs text-white">
                    <p className="truncate font-medium">{angle.name}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <CreateProductAngleDialog
        token={token}
        open={isCreateModalOpen}
        onOpenChange={setIsCreateModalOpen}
        onCreated={fetchAngles}
      />

      <AlertDialog open={!!confirmDeleteUid} onOpenChange={() => setConfirmDeleteUid(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Product Angle</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this product angle and its image.
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
