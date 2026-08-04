import { useState } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Trash2 } from "lucide-react";

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
import { ViewField } from "@/components/catalogue/ViewField";
import { formatTableDate } from "@/components/catalogue/utils";
import { FullscreenCarouselDialog } from "@/components/catalogue/images/FullscreenCarouselDialog";
import { ImageKeyThumb } from "@/components/catalogue/images/ImageKeyThumb";
import { useToast } from "@/hooks/use-toast";
import { apiDeleteGalleryItem, getPresignedUrl, type GalleryItem, type TryOnAnalysis } from "@/lib/api";

type Props = {
  item: GalleryItem;
  token: string | null;
  categoryTitle: string;
  onBack: () => void;
  onEditImage?: (s3Key: string, imageUrl: string) => void;
  onChangeLength?: (s3Key: string, imageUrl: string) => void;
  onChangeColour?: (s3Key: string, imageUrl: string) => void;
  onEditVideo?: (s3Key: string, imageUrl: string) => void;
  onOpenTryOnWithJewellery?: (s3Key: string, imageUrl: string) => void;
};

export function GalleryItemDetail({
  item,
  token,
  categoryTitle,
  onBack,
  onEditImage,
  onChangeLength, 
  onChangeColour,
  onEditVideo,
  onOpenTryOnWithJewellery,
}: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [carouselOpen, setCarouselOpen] = useState(false);
  const [carouselStartIndex, setCarouselStartIndex] = useState(0);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const imageKeys = item.image_s3_keys ?? [];

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
  const carouselTitle = `${categoryTitle}`;
  const isVideoItem = item.category === "video";

  const confirmDelete = async () => {
    if (!token || !item.uid) return;
    setDeleting(true);
    try {
      await apiDeleteGalleryItem(token, item.uid);
      await qc.invalidateQueries({ queryKey: ["gallery-items"] });
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
                  className="contents"
                  onClick={() => {
                    setCarouselStartIndex(i);
                    setCarouselOpen(true);
                  }}
                >
                  {isVideoItem ? (
                    <div className="group relative h-24 w-24 overflow-hidden rounded-md border bg-muted/30">
                      {presignedQueries[i]?.isPending ? (
                        <div className="flex h-full w-full items-center justify-center">
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                      ) : presignedQueries[i]?.isError || !presignedQueries[i]?.data ? (
                        <div className="flex h-full w-full items-center justify-center px-1 text-center text-[10px] leading-tight text-destructive">
                          Failed
                        </div>
                      ) : (
                        <video
                          src={presignedQueries[i].data}
                          muted
                          playsInline
                          preload="metadata"
                          className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.06] group-hover:-translate-y-0.5"
                        />
                      )}
                    </div>
                  ) : (
                    <ImageKeyThumb token={token} s3Key={k} clickable />
                  )}
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
            startIndex={carouselStartIndex}
            isVideo={isVideoItem}
            onChangeProductColour={onChangeColour}
            onChangeProductLength={onChangeLength}
            onEditImage={onEditImage}
            onEditVideo={onEditVideo}
            onOpenTryOnWithJewellery={onOpenTryOnWithJewellery}
          />

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <ViewField label="Category" value={item.category} />
            <ViewField label="Created" value={formatTableDate(item.created_at)} />
            <ViewField label="Edited" value={formatTableDate(item.edited_at)} />
          </div>

          {item.analysis && Object.keys(item.analysis).length > 0 ? (
            <div className="space-y-2">
              <div className="text-base font-semibold">Analysis</div>
              <pre className="max-h-64 overflow-auto rounded-md border bg-muted/30 p-3 text-xs">{JSON.stringify(item.analysis, null, 2)}</pre>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
