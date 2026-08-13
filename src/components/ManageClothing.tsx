import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  apiListClothing,
  apiDeleteClothing,
  getPresignedUrl,
  type ClothingRecord,
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
import CreateClothingDialog from "@/components/CreateClothingDialog";

export default function ManageClothing() {
  const { token } = useAuth();
  const { toast } = useToast();

  const [items, setItems] = useState<ClothingRecord[]>([]);
  const [itemUrls, setItemUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [deletingUid, setDeletingUid] = useState<string | null>(null);
  const [confirmDeleteUid, setConfirmDeleteUid] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const fetchItems = useCallback(async () => {
    if (!token) return;

    setLoading(true);
    try {
      const list = await apiListClothing(token);
      setItems(list);

      const urlEntries = await Promise.all(
        list.map(async (item) => {
          try {
            return [item.uid, await getPresignedUrl(token, item.image_s3_key)] as [string, string];
          } catch {
            return [item.uid, ""] as [string, string];
          }
        })
      );
      setItemUrls(Object.fromEntries(urlEntries));
    } catch (err: unknown) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to load clothing",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [token, toast]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleDelete = async (uid: string) => {
    if (!token) return;

    setDeletingUid(uid);
    try {
      await apiDeleteClothing(token, uid);
      toast({ title: "Deleted", description: "Clothing item removed." });
      setItems((prev) => prev.filter((item) => item.uid !== uid));
      setItemUrls((prev) => {
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
            <CardTitle className="text-base">Manage Clothing</CardTitle>
            <Button size="sm" onClick={() => setIsCreateModalOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Clothing
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">
            Clothing items are styling references for model shoots. Each upload is described in
            one line (colour, neckline, and print or design) and that description is used when
            you pick the item on a Model Shoot.
          </p>
          {loading ? (
            <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="aspect-[3/4] w-full rounded-lg" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <ImageIcon className="mb-4 h-16 w-16 text-muted-foreground/40" />
              <p className="text-muted-foreground">No clothing yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
              {items.map((item) => (
                <div
                  key={item.uid}
                  className="group relative aspect-[3/4] overflow-hidden rounded-lg border"
                  title={item.description}
                >
                  {itemUrls[item.uid] ? (
                    <img
                      src={itemUrls[item.uid]}
                      alt={item.name}
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
                      disabled={deletingUid === item.uid}
                      onClick={() => setConfirmDeleteUid(item.uid)}
                    >
                      {deletingUid === item.uid ? (
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      ) : (
                        <Trash2 className="mr-1 h-3 w-3" />
                      )}
                      Delete
                    </Button>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 bg-black/70 p-2 text-xs text-white">
                    <p className="truncate font-medium">{item.name}</p>
                    <p className="line-clamp-2 text-[11px] text-white/85">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <CreateClothingDialog
        token={token}
        open={isCreateModalOpen}
        onOpenChange={setIsCreateModalOpen}
        onCreated={fetchItems}
      />

      <AlertDialog open={!!confirmDeleteUid} onOpenChange={() => setConfirmDeleteUid(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Clothing</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this clothing item and its image.
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
