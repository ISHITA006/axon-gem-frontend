import { useState } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Tag, Trash2 } from "lucide-react";

import AddToCataloguePanel from "@/components/AddToCataloguePanel";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ViewField } from "@/components/catalogue/ViewField";
import { formatTableDate } from "@/components/catalogue/utils";
import { FullscreenCarouselDialog } from "@/components/catalogue/images/FullscreenCarouselDialog";
import { ImageKeyThumb } from "@/components/catalogue/images/ImageKeyThumb";
import { useToast } from "@/hooks/use-toast";
import {
  apiAssignGalleryItemProduct,
  apiDeleteGalleryItem,
  galleryImageCaptions,
  getPresignedUrl,
  type GalleryItem,
  type TryOnAnalysis,
} from "@/lib/api";
import type { ManualEditTool } from "@/components/ManualPhotoEditor";

type Props = {
  item: GalleryItem;
  token: string | null;
  categoryTitle: string;
  onBack: () => void;
  onEditImage?: (s3Key: string, imageUrl: string) => void;
  onManualPhotoEdit?: (s3Key: string, imageUrl: string, initialTool?: ManualEditTool) => void;
  onOpenTryOnWithJewellery?: (s3Key: string, imageUrl: string) => void;
  onItemUpdated?: (item: GalleryItem) => void;
};

export function GalleryItemDetail({
  item,
  token,
  categoryTitle,
  onBack,
  onEditImage,
  onManualPhotoEdit,
  onOpenTryOnWithJewellery,
  onItemUpdated,
}: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [carouselOpen, setCarouselOpen] = useState(false);
  const [carouselStartIndex, setCarouselStartIndex] = useState(0);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignProductId, setAssignProductId] = useState("");
  const [assigning, setAssigning] = useState(false);
  const imageKeys = item.image_s3_keys ?? [];
  const canAssign = ["model-shoot", "product-shoot", "edited-image"].includes(String(item.category));

  const presignedQueries = useQueries({
    queries: imageKeys.map((s3Key) => ({
      queryKey: ["presigned-url", token, s3Key],
      queryFn: () => getPresignedUrl(token!, s3Key),
      enabled: Boolean(token && s3Key),
      staleTime: 3 * 60 * 1000,
    })),
  });

  const catalogueImages: { url: string; s3Key: string }[] = [];
  imageKeys.forEach((s3Key, i) => {
    const url = presignedQueries[i]?.data;
    if (url) catalogueImages.push({ s3Key, url });
  });

  const analysis = item.analysis as TryOnAnalysis | null | undefined;
  const captions = galleryImageCaptions(item.analysis);
  const analysisForDisplay = item.analysis
    ? Object.fromEntries(
        Object.entries(item.analysis).filter(([key]) => key !== "image_captions" && key !== "image_views")
      )
    : null;
  const carouselTitle = `${categoryTitle}`;

  const confirmDelete = async () => {
    if (!token || !item.uid) return;
    setDeleting(true);
    try {
      await apiDeleteGalleryItem(token, item.uid);
      await qc.invalidateQueries({ queryKey: ["gallery-items"] });
      await qc.invalidateQueries({ queryKey: ["gallery-products"] });
      setDeleteOpen(false);
      toast({ title: "Deleted", description: "Gallery item removed." });
      onBack();
    } catch (err: unknown) {
      toast({
        title: "Delete failed",
        description: err instanceof Error ? err.message : "Could not delete gallery item",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  const confirmAssign = async () => {
    if (!token || !item.uid) return;
    const productId = assignProductId.trim();
    if (!productId) {
      toast({
        title: "Product ID required",
        description: "Enter a product ID to group this item.",
        variant: "destructive",
      });
      return;
    }
    setAssigning(true);
    try {
      const updated = await apiAssignGalleryItemProduct(token, item.uid, productId);
      await qc.invalidateQueries({ queryKey: ["gallery-items"] });
      await qc.invalidateQueries({ queryKey: ["gallery-products"] });
      setAssignOpen(false);
      onItemUpdated?.(updated);
      toast({
        title: "Product ID saved",
        description: `This item is now grouped under ${productId}.`,
      });
    } catch (err: unknown) {
      toast({
        title: "Could not save product ID",
        description: err instanceof Error ? err.message : "Assignment failed",
        variant: "destructive",
      });
    } finally {
      setAssigning(false);
    }
  };

  return (
    <div className="space-y-6">
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete gallery item?</AlertDialogTitle>
            <AlertDialogDescription>This removes the gallery item. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={assignOpen}
        onOpenChange={(open) => {
          if (!open && !assigning) setAssignOpen(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign product ID</DialogTitle>
            <DialogDescription>
              Group this generation under an existing product ID, or enter a new one.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="detail-assign-product-id">Product ID</Label>
            <Input
              id="detail-assign-product-id"
              value={assignProductId}
              onChange={(e) => setAssignProductId(e.target.value)}
              placeholder="e.g. AXG-0001 or RING-14"
              maxLength={64}
              autoComplete="off"
              disabled={assigning}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void confirmAssign();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={assigning} onClick={() => setAssignOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={assigning || !assignProductId.trim()}
              onClick={() => void confirmAssign()}
            >
              {assigning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button type="button" variant="outline" onClick={onBack} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Gallery item</h2>
            <p className="font-mono text-sm text-muted-foreground">{item.uid}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        <AddToCataloguePanel token={token} analysis={analysis} images={catalogueImages} />
          {canAssign ? (
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              disabled={!token || deleting || assigning}
              onClick={() => {
                setAssignProductId(item.product_sku ?? "");
                setAssignOpen(true);
              }}
            >
              <Tag className="h-4 w-4" /> {item.product_sku ? "Change product ID" : "Assign product ID"}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            className="gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={!token || deleting}
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-6 pt-6">
          <div className="space-y-3">
            <h3 className="text-base font-semibold">Images</h3>
            <div className="flex flex-wrap gap-3">
              {imageKeys.map((k, i) => (
                <button
                  key={k}
                  type="button"
                  className="flex flex-col items-center gap-1"
                  onClick={() => {
                    setCarouselStartIndex(i);
                    setCarouselOpen(true);
                  }}
                >
                  <ImageKeyThumb token={token} s3Key={k} clickable />
                  {captions[k] ? (
                    <span className="max-w-24 text-center text-[11px] leading-tight text-muted-foreground">
                      {captions[k]}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>

          <FullscreenCarouselDialog
            open={carouselOpen}
            onOpenChange={setCarouselOpen}
            token={token}
            title={carouselTitle}
            s3Keys={imageKeys}
            captions={captions}
            startIndex={carouselStartIndex}
            onManualPhotoEdit={onManualPhotoEdit}
            onEditImage={onEditImage}
            onOpenTryOnWithJewellery={onOpenTryOnWithJewellery}
          />

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <ViewField label="Category" value={item.category} />
            <ViewField label="Product ID" value={item.product_sku || "—"} />
            <ViewField label="Created" value={formatTableDate(item.created_at)} />
            <ViewField label="Edited" value={formatTableDate(item.edited_at)} />
          </div>

          {analysisForDisplay && Object.keys(analysisForDisplay).length > 0 ? (
            <div className="space-y-2">
              <div className="text-base font-semibold">Analysis</div>
              <pre className="max-h-64 overflow-auto rounded-md border bg-muted/30 p-3 text-xs">{JSON.stringify(analysisForDisplay, null, 2)}</pre>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
