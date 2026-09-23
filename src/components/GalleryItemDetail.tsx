import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Tag, Trash2, Video } from "lucide-react";

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
import { ViewField } from "@/components/gallery/ViewField";
import { ImageCarouselStage } from "@/components/gallery/FullscreenCarouselDialog";
import { useToast } from "@/hooks/use-toast";
import {
  apiAssignGalleryItemProduct,
  apiDeleteGalleryItem,
  galleryImageCaptions,
  galleryImageViews,
  isVideoS3Key,
  type GalleryItem,
} from "@/lib/api";
import { formatTableDate } from "@/lib/utils";
import type { ManualEditTool } from "@/components/ManualPhotoEditor";
import AddToCataloguePanel from "@/components/AddToCataloguePanel";

type Props = {
  item: GalleryItem;
  token: string | null;
  categoryTitle: string;
  onBack: () => void;
  onEditImage?: (s3Key: string, imageUrl: string) => void;
  onManualPhotoEdit?: (s3Key: string, imageUrl: string, initialTool?: ManualEditTool) => void;
  onOpenTryOnWithJewellery?: (s3Key: string, imageUrl: string) => void;
  onGenerateCampaignVideo?: (s3Key: string) => void;
  onItemUpdated?: (item: GalleryItem) => void;
};

type ViewCarousel = {
  kind: string;
  title: string;
  s3Keys: string[];
};

function inferViewKind(
  key: string,
  views: Record<string, string>,
  captions: Record<string, string>
): string | null {
  const mapped = views[key];
  if (mapped === "front" || mapped === "close_up" || mapped === "side") return mapped;
  const caption = (captions[key] ?? "").toLowerCase();
  if (caption.includes("close-up") || caption.includes("close up")) return "close_up";
  if (caption.includes("side view") || caption.startsWith("side ")) return "side";
  if (caption.includes("regular") || caption.includes("front")) return "front";
  return null;
}

function viewCarouselsForItem(item: GalleryItem, fallbackTitle: string): ViewCarousel[] {
  const keys = item.image_s3_keys ?? [];
  const isProduct = item.category === "product-shoot";
  const isModel = item.category === "model-shoot";
  if (keys.length === 0 || (!isProduct && !isModel)) {
    return [{ kind: "all", title: fallbackTitle, s3Keys: keys }];
  }

  const views = galleryImageViews(item.analysis);
  const captions = galleryImageCaptions(item.analysis);
  const secondKind = isProduct ? "side" : "close_up";
  const frontKeys: string[] = [];
  const secondKeys: string[] = [];
  const unknown: string[] = [];

  for (const key of keys) {
    const kind = inferViewKind(key, views, captions);
    if (kind === secondKind) secondKeys.push(key);
    else if (kind === "front") frontKeys.push(key);
    else unknown.push(key);
  }

  if (
    frontKeys.length === 0 &&
    secondKeys.length === 0 &&
    keys.length === 2 &&
    Object.keys(views).length === 0
  ) {
    return [
      { kind: "front", title: isProduct ? "Front view" : "Regular view", s3Keys: [keys[0]] },
      { kind: secondKind, title: isProduct ? "Side view" : "Close-up view", s3Keys: [keys[1]] },
    ];
  }

  if (frontKeys.length > 0 && secondKeys.length > 0) {
    if (unknown.length) frontKeys.push(...unknown);
    return [
      { kind: "front", title: isProduct ? "Front view" : "Regular view", s3Keys: frontKeys },
      { kind: secondKind, title: isProduct ? "Side view" : "Close-up view", s3Keys: secondKeys },
    ];
  }

  return [{ kind: "all", title: fallbackTitle, s3Keys: keys }];
}

export function GalleryItemDetail({
  item,
  token,
  categoryTitle,
  onBack,
  onEditImage,
  onManualPhotoEdit,
  onOpenTryOnWithJewellery,
  onGenerateCampaignVideo,
  onItemUpdated,
}: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignProductId, setAssignProductId] = useState("");
  const [assigning, setAssigning] = useState(false);
  const canAssign = [
    "model-shoot",
    "product-shoot",
    "edited-image",
    "product-video",
    "model-video",
  ].includes(String(item.category));
  const stillKeys = (item.image_s3_keys ?? []).filter((k) => k && !isVideoS3Key(k));
  const canGenerateVideo = stillKeys.length > 0;
  const captions = galleryImageCaptions(item.analysis);
  const carouselTitle = `${categoryTitle}`;
  const viewCarousels = viewCarouselsForItem(item, carouselTitle);
  const splitViews = viewCarousels.length > 1;

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
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-semibold tracking-tight">Gallery item</h2>
              {item.in_catalog ? (
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                  In catalogue
                </span>
              ) : null}
            </div>
            <p className="font-mono text-sm text-muted-foreground">{item.uid}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          {onGenerateCampaignVideo && canGenerateVideo ? (
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              disabled={!token || deleting}
              onClick={() => {
                const key = stillKeys[stillKeys.length - 1];
                if (!key) return;
                onGenerateCampaignVideo(key);
              }}
            >
              <Video className="h-4 w-4" /> Generate video
            </Button>
          ) : null}
          <AddToCataloguePanel
            token={token}
            images={(item.image_s3_keys ?? []).map((s3Key) => ({ url: "", s3Key }))}
            defaults={{
              itemCode: item.product_sku || (typeof item.analysis?.item_code === "string" ? item.analysis.item_code : undefined),
              name: item.product_name || (typeof item.analysis?.name === "string" ? item.analysis.name : undefined),
              description: typeof item.analysis?.description === "string" ? item.analysis.description : undefined,
            }}
            onSuccess={() => {
              void qc.invalidateQueries({ queryKey: ["gallery-items"] });
              void qc.invalidateQueries({ queryKey: ["gallery-products"] });
              onItemUpdated?.({ ...item, in_catalog: true });
            }}
          />
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
          <div className={splitViews ? "grid gap-6 lg:grid-cols-2" : undefined}>
            {viewCarousels.map((lane) => (
              <ImageCarouselStage
                key={lane.kind}
                token={token}
                title={lane.title}
                s3Keys={lane.s3Keys}
                captions={captions}
                startIndex={Math.max(0, lane.s3Keys.length - 1)}
                imageStageClassName={splitViews ? "h-[min(64vh,38rem)]" : "h-[min(78vh,48rem)]"}
                onManualPhotoEdit={onManualPhotoEdit}
                onEditImage={onEditImage}
                onOpenTryOnWithJewellery={onOpenTryOnWithJewellery}
                onGenerateCampaignVideo={
                  onGenerateCampaignVideo
                    ? (s3Key) => onGenerateCampaignVideo(s3Key)
                    : undefined
                }
              />
            ))}
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <ViewField label="Category" value={item.category} />
            <ViewField label="Product ID" value={item.product_sku || "—"} />
            <ViewField label="Created" value={formatTableDate(item.created_at)} />
            <ViewField label="Edited" value={formatTableDate(item.edited_at)} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
