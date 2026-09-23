import type { Dispatch, SetStateAction } from "react";
import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { flexRender, getCoreRowModel, type ColumnDef, type PaginationState, useReactTable } from "@tanstack/react-table";
import { ArrowLeft, ChevronLeft, ChevronRight, Download, Gem, Loader2, Pencil, Tag, Trash2, Video } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  apiAssignGalleryItemProduct,
  apiDeleteGalleryItem,
  apiDeleteGalleryProduct,
  apiGetGalleryItems,
  apiGetGalleryProduct,
  apiGetGalleryProducts,
  downloadMedia,
  getPresignedUrl,
  galleryImageCaptions,
  isVideoS3Key,
  type GalleryCategory,
  type GalleryItem,
  type GalleryProduct,
  type GalleryProductDetailResponse,
  type VideoCampaignMode,
} from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
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
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatTableDate } from "@/lib/utils";
import { GalleryItemDetail } from "@/components/GalleryItemDetail";
import ModelShootReviewSession from "@/components/ModelShootReviewSession";
import ProductShootReviewSession from "@/components/ProductShootReviewSession";
import type { VideoCampaignSource } from "@/components/VideoCampaignForm";
import type { ManualEditTool } from "@/components/ManualPhotoEditor";

const ITEMS_PER_PAGE = 5;
const PRODUCTS_PER_PAGE = 24;
type GalleryView = "products" | "recent";
const GALLERY_VIEWS: { id: GalleryView; label: string }[] = [
  { id: "products", label: "All products" },
  { id: "recent", label: "All generations" },
];
const ASSIGNABLE_CATEGORIES = new Set([
  "model-shoot",
  "product-shoot",
  "edited-image",
  "product-video",
  "model-video",
]);
const GALLERY_CATEGORY_LABELS: Record<GalleryCategory, string> = {
  "model-shoot": "Model Shoot",
  "product-shoot": "Product Shoot",
  "edited-image": "Edited Images",
  "product-video": "Product Video",
  "model-video": "Model Video",
};

function defaultVideoModeForCategory(category: string): VideoCampaignMode {
  if (category === "model-shoot" || category === "model-video") return "on_model";
  return "product";
}

function allowVideoModeChange(category: string): boolean {
  return category !== "model-shoot" && category !== "product-shoot" && category !== "model-video" && category !== "product-video";
}

interface MyGalleryProps {
  onEditImage?: (s3Key: string, imageUrl: string) => void;
  onManualPhotoEdit?: (s3Key: string, imageUrl: string, initialTool?: ManualEditTool) => void;
  /** Opens Model Try On with this image as the jewellery piece (presigned URL resolved here). */
  onOpenTryOnWithJewellery?: (s3Key: string, imageUrl: string) => void;
  /** Opens Video Shoot tab with this still preselected. */
  onOpenVideoShoot?: (source: VideoCampaignSource) => void;
}

function GalleryImageCell({
  token,
  s3Keys,
  captions,
  rowKey,
  imageIndexByRow,
  setImageIndexByRow,
}: {
  token: string | null;
  s3Keys: string[];
  captions?: Record<string, string>;
  rowKey: string;
  imageIndexByRow: Record<string, number>;
  setImageIndexByRow: Dispatch<SetStateAction<Record<string, number>>>;
}) {
  const idx = Math.min(Math.max(imageIndexByRow[rowKey] ?? 0, 0), Math.max(0, s3Keys.length - 1));
  const currentKey = s3Keys[idx] ?? null;

  const urlQuery = useQuery({
    queryKey: ["presigned-url", token, currentKey],
    enabled: Boolean(token && currentKey),
    queryFn: () => getPresignedUrl(token!, currentKey!),
    staleTime: 3 * 60 * 1000,
  });

  const hasMany = s3Keys.length > 1;
  const prevDisabled = !token || !hasMany || idx <= 0;
  const nextDisabled = !token || !hasMany || idx >= s3Keys.length - 1;

  const bump = (dir: -1 | 1) => {
    setImageIndexByRow((m) => {
      const cur = m[rowKey] ?? 0;
      const next = Math.min(Math.max(cur + dir, 0), Math.max(0, s3Keys.length - 1));
      return { ...m, [rowKey]: next };
    });
  };

  return (
    <div className="flex items-center gap-1.5 md:gap-2">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-9 w-9 shrink-0 touch-manipulation md:h-4 md:w-4"
        disabled={prevDisabled}
        onClick={(e) => {
          e.stopPropagation();
          bump(-1);
        }}
      >
        <ChevronLeft className="h-4 w-4 md:h-3.5 md:w-3.5" />
      </Button>

      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md border bg-muted/30 md:h-20 md:w-20">
          {!currentKey ? (
            <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">—</div>
          ) : urlQuery.isPending ? (
            <div className="flex h-full w-full items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : urlQuery.isError || !urlQuery.data ? (
            <div className="flex h-full w-full items-center justify-center px-0.5 text-center text-[10px] leading-tight text-destructive">
              Error
            </div>
          ) : isVideoS3Key(currentKey) ? (
            <video
              src={urlQuery.data}
              muted
              playsInline
              preload="metadata"
              className="h-full w-full object-cover"
            />
          ) : (
            <img
              src={urlQuery.data}
              alt={currentKey && captions?.[currentKey] ? captions[currentKey] : ""}
              className="h-full w-full object-cover"
            />
          )}
        </div>
        {currentKey && captions?.[currentKey] ? (
          <p className="max-w-[5.5rem] truncate text-[10px] leading-tight text-muted-foreground md:max-w-[6.5rem]">
            {captions[currentKey]}
          </p>
        ) : null}
      </div>

      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-9 w-9 shrink-0 touch-manipulation md:h-4 md:w-4"
        disabled={nextDisabled}
        onClick={(e) => {
          e.stopPropagation();
          bump(1);
        }}
      >
        <ChevronRight className="h-4 w-4 md:h-3.5 md:w-3.5" />
      </Button>

      <div className="min-w-[3rem] text-[11px] text-muted-foreground md:min-w-[3.5rem] md:text-xs">
        {s3Keys.length ? `${idx + 1}/${s3Keys.length}` : "0/0"}
      </div>
    </div>
  );
}

function ProductHeroThumb({ token, s3Key }: { token: string | null; s3Key: string }) {
  const urlQuery = useQuery({
    queryKey: ["presigned-url", token, s3Key],
    enabled: Boolean(token && s3Key),
    queryFn: () => getPresignedUrl(token!, s3Key),
    staleTime: 3 * 60 * 1000,
  });
  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted/30">
      {urlQuery.isPending ? (
        <div className="flex h-full w-full items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : urlQuery.isError || !urlQuery.data ? (
        <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
          No image
        </div>
      ) : (
        <img src={urlQuery.data} alt="" className="h-full w-full object-cover" />
      )}
    </div>
  );
}

function countBadge(count: number, label: string, className: string) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${className}`}>
      {count} {label}
    </span>
  );
}

export default function MyGallery({
  onEditImage,
  onManualPhotoEdit,
  onOpenTryOnWithJewellery,
  onOpenVideoShoot,
}: MyGalleryProps) {
  const { token } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [view, setView] = useState<GalleryView>("products");
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: PRODUCTS_PER_PAGE });
  const [actionKey, setActionKey] = useState<string | null>(null);
  const [imageIndexByRow, setImageIndexByRow] = useState<Record<string, number>>({});
  const [selectedItem, setSelectedItem] = useState<GalleryItem | null>(null);
  const [selectedProductUid, setSelectedProductUid] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<GalleryItem | null>(null);
  const [galleryDeleting, setGalleryDeleting] = useState(false);
  const [deleteProductTarget, setDeleteProductTarget] = useState<GalleryProduct | null>(null);
  const [productDeleting, setProductDeleting] = useState(false);
  const [assignTarget, setAssignTarget] = useState<GalleryItem | null>(null);
  const [assignProductId, setAssignProductId] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [resumeDraft, setResumeDraft] = useState<{
    uid: string;
    category: GalleryCategory;
  } | null>(null);

  const page = pagination.pageIndex + 1;

  const productsQuery = useQuery({
    queryKey: ["gallery-products", token, page, pagination.pageSize],
    enabled: Boolean(token) && view === "products" && !selectedProductUid,
    queryFn: async () => {
      if (!token) throw new Error("Not authenticated");
      return apiGetGalleryProducts(token, { page, limit: pagination.pageSize });
    },
    staleTime: 15_000,
  });

  const productDetailQuery = useQuery({
    queryKey: ["gallery-products", token, selectedProductUid],
    enabled: Boolean(token && selectedProductUid),
    queryFn: async () => {
      if (!token || !selectedProductUid) throw new Error("Not authenticated");
      return apiGetGalleryProduct(token, selectedProductUid);
    },
    staleTime: 15_000,
  });

  const query = useQuery({
    queryKey: ["gallery-items", token, page, pagination.pageSize],
    enabled: Boolean(token) && view !== "products",
    queryFn: async () => {
      if (!token) throw new Error("Not authenticated");
      return apiGetGalleryItems(token, {
        category: "recent",
        page,
        limit: pagination.pageSize,
      });
    },
    staleTime: 15_000,
  });

  const confirmDeleteGalleryItem = async () => {
    if (!token || !deleteTarget?.uid) return;
    setGalleryDeleting(true);
    try {
      await apiDeleteGalleryItem(token, deleteTarget.uid);
      setDeleteTarget(null);
      setImageIndexByRow((m) => {
        const next = { ...m };
        delete next[deleteTarget.uid];
        return next;
      });
      if (selectedItem?.uid === deleteTarget.uid) setSelectedItem(null);
      await qc.invalidateQueries({ queryKey: ["gallery-items"] });
      await qc.invalidateQueries({ queryKey: ["gallery-products"] });
      toast({ title: "Deleted", description: "Gallery item removed." });
    } catch (err: unknown) {
      toast({
        title: "Delete failed",
        description: err instanceof Error ? err.message : "Could not delete gallery item",
        variant: "destructive",
      });
    } finally {
      setGalleryDeleting(false);
    }
  };

  const confirmDeleteProduct = async () => {
    if (!token || !deleteProductTarget?.uid) return;
    setProductDeleting(true);
    try {
      const result = await apiDeleteGalleryProduct(token, deleteProductTarget.uid);
      const sku = result.sku || deleteProductTarget.sku;
      setDeleteProductTarget(null);
      if (selectedProductUid === deleteProductTarget.uid) setSelectedProductUid(null);
      if (selectedItem?.product_uid === deleteProductTarget.uid) setSelectedItem(null);
      await qc.invalidateQueries({ queryKey: ["gallery-items"] });
      await qc.invalidateQueries({ queryKey: ["gallery-products"] });
      toast({
        title: "Product deleted",
        description: `${sku} and all generations grouped under it were removed.`,
      });
    } catch (err: unknown) {
      toast({
        title: "Delete failed",
        description: err instanceof Error ? err.message : "Could not delete product",
        variant: "destructive",
      });
    } finally {
      setProductDeleting(false);
    }
  };

  const confirmAssignGalleryItem = async () => {
    if (!token || !assignTarget?.uid) return;
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
      await apiAssignGalleryItemProduct(token, assignTarget.uid, productId);
      setAssignTarget(null);
      setAssignProductId("");
      await qc.invalidateQueries({ queryKey: ["gallery-items"] });
      await qc.invalidateQueries({ queryKey: ["gallery-products"] });
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

  const handleDownload = async (s3Key: string) => {
    if (!token) return;
    setActionKey(`download:${s3Key}`);
    try {
      const blob = await downloadMedia(token, s3Key);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = s3Key.split("/").pop() || "gallery-image";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      toast({
        title: "Download failed",
        description: err instanceof Error ? err.message : "Unable to download image",
        variant: "destructive",
      });
    } finally {
      setActionKey(null);
    }
  };

  const handleEdit = async (s3Key: string) => {
    if (!token || !onEditImage) return;
    setActionKey(`edit:${s3Key}`);
    try {
      const url = await getPresignedUrl(token, s3Key);
      onEditImage(s3Key, url);
    } catch (err: unknown) {
      toast({
        title: "Open editor failed",
        description: err instanceof Error ? err.message : "Unable to open image editor",
        variant: "destructive",
      });
    } finally {
      setActionKey(null);
    }
  };

  const openTryOnWithJewelleryFromKey = useCallback(
    async (s3Key: string) => {  
      if (!token || !onOpenTryOnWithJewellery) return;
      setActionKey(`tryon:${s3Key}`);
      try {
        const url = await getPresignedUrl(token, s3Key);
        onOpenTryOnWithJewellery(s3Key, url);
      } catch (err: unknown) {
        toast({
          title: "Could not open try-on",
          description: err instanceof Error ? err.message : "Unable to prepare jewellery image",
          variant: "destructive",
        });
      } finally {
        setActionKey(null);
      }
    },
    [token, onOpenTryOnWithJewellery, toast]
  );

  const openCampaignVideo = useCallback(
    (item: GalleryItem, s3Key: string) => {
      if (isVideoS3Key(s3Key)) {
        toast({
          title: "Pick a still image",
          description: "Campaign video is generated from a product or model shoot still.",
        });
        return;
      }
      if (!onOpenVideoShoot) return;
      const extras = (item.image_s3_keys ?? []).filter((k) => k && k !== s3Key && !isVideoS3Key(k)).slice(0, 2);
      onOpenVideoShoot({
        s3Key,
        galleryUid: item.uid,
        productId: item.product_sku,
        defaultMode: defaultVideoModeForCategory(String(item.category)),
        allowModeChange: allowVideoModeChange(String(item.category)),
        extraReferenceS3Keys: extras,
      });
    },
    [toast, onOpenVideoShoot],
  );

  const columns = useMemo<ColumnDef<GalleryItem>[]>(
    () => [
      {
        id: "images",
        header: "Image",
        cell: ({ row }) => (
          <GalleryImageCell
            token={token}
            s3Keys={row.original.image_s3_keys ?? []}
            captions={galleryImageCaptions(row.original.analysis)}
            rowKey={String(row.original.uid ?? row.id)}
            imageIndexByRow={imageIndexByRow}
            setImageIndexByRow={setImageIndexByRow}
          />
        ),
      },
      {
        accessorKey: "category",
        header: "Category",
        cell: ({ row }) => {
          const item = row.original;
          return (
            <div className="flex flex-col gap-1">
              <span>
                {GALLERY_CATEGORY_LABELS[item.category as GalleryCategory] ?? item.category}
              </span>
              {item.can_resume_review ? (
                <Badge variant="secondary" className="w-fit">
                  {item.generations_remaining === 1
                    ? "1 edit left"
                    : `${item.generations_remaining ?? 2} edits left`}
                </Badge>
              ) : null}
              {item.in_catalog ? (
                <Badge variant="outline" className="w-fit border-primary/40 text-primary">
                  In catalogue
                </Badge>
              ) : null}
            </div>
          );
        },
      },
      {
        id: "product_id",
        header: "Product ID",
        cell: ({ row }) => {
          const sku = row.original.product_sku?.trim();
          return sku ? (
            <span className="font-mono text-xs">{sku}</span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          );
        },
      },
      {
        accessorKey: "created_at",
        header: "Created",
        cell: ({ row }) => formatTableDate(row.original.created_at),
      },
      {
        accessorKey: "edited_at",
        header: "Edited",
        cell: ({ row }) => formatTableDate(row.original.edited_at),
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => {
          const uid = row.original.uid;
          const rowKey = String(uid ?? row.id);
          const s3Keys = row.original.image_s3_keys ?? [];
          const idx = Math.min(Math.max(imageIndexByRow[rowKey] ?? 0, 0), Math.max(0, s3Keys.length - 1));
          const selectedKey = s3Keys[idx] ?? null;
          const rowDeleting = galleryDeleting && deleteTarget?.uid === uid;
          const downloading = Boolean(selectedKey && actionKey === `download:${selectedKey}`);
          const editing = Boolean(selectedKey && actionKey === `edit:${selectedKey}`);
          const openingTryOn = Boolean(selectedKey && actionKey === `tryon:${selectedKey}`);
          const disabled = downloading || editing || openingTryOn || galleryDeleting || assigning;
          const showTryOn = Boolean(onOpenTryOnWithJewellery && selectedKey && !isVideoS3Key(selectedKey));
          const showVideo = Boolean(selectedKey && !isVideoS3Key(selectedKey));
          const canAssign = ASSIGNABLE_CATEGORIES.has(String(row.original.category));
          const rowAssigning = assigning && assignTarget?.uid === uid;
          return (
            <div className="flex max-w-[220px] flex-wrap items-center gap-1.5 md:max-w-none md:gap-2">
              {selectedKey ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={disabled}
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleDownload(selectedKey);
                    }}
                  >
                    {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  </Button>
                  {!isVideoS3Key(selectedKey) ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={disabled}
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleEdit(selectedKey);
                      }}
                    >
                      {editing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
                    </Button>
                  ) : null}
                  {showTryOn ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      title="Use in model try-on"
                      disabled={disabled}
                      onClick={(e) => {
                        e.stopPropagation();
                        void openTryOnWithJewelleryFromKey(selectedKey);
                      }}
                    >
                      {openingTryOn ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Gem className="h-4 w-4" />
                      )}
                    </Button>
                  ) : null}
                  {showVideo ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      title="Generate video"
                      disabled={disabled || !token}
                      onClick={(e) => {
                        e.stopPropagation();
                        openCampaignVideo(row.original, selectedKey);
                      }}
                    >
                      <Video className="h-4 w-4" />
                      <span className="hidden sm:inline">Video</span>
                    </Button>
                  ) : null}
                </>
              ) : null}
              {canAssign ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  title="Assign product ID"
                  disabled={!token || galleryDeleting || assigning}
                  onClick={(e) => {
                    e.stopPropagation();
                    setAssignTarget(row.original);
                    setAssignProductId(row.original.product_sku ?? "");
                  }}
                >
                  {rowAssigning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Tag className="h-4 w-4" />}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                title="Delete gallery item"
                disabled={!token || galleryDeleting}
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteTarget(row.original);
                }}
              >
                {rowDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </Button>
            </div>
          );
        },
      },
    ],
    [
      actionKey,
      assignTarget?.uid,
      assigning,
      deleteTarget?.uid,
      galleryDeleting,
      imageIndexByRow,
      token,
      onOpenTryOnWithJewellery,
      openTryOnWithJewelleryFromKey,
      openCampaignVideo,
    ]
  );

  const table = useReactTable({
    data: query.data?.items ?? [],
    columns,
    manualPagination: true,
    pageCount: query.data?.total_pages ?? -1,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    state: { pagination },
  });

  const openGalleryItem = (item: GalleryItem) => {
    if (item.can_resume_review && item.draft_uid) {
      setSelectedItem(null);
      setResumeDraft({
        uid: item.draft_uid,
        category: item.category as GalleryCategory,
      });
      return;
    }
    setResumeDraft(null);
    setSelectedItem(item);
  };

  const closeResume = () => {
    setResumeDraft(null);
  };

  const listQuery = view === "products" ? productsQuery : query;
  const canPrev = (listQuery.data?.page ?? 1) > 1;
  const canNext = listQuery.data?.total_pages
    ? (listQuery.data?.page ?? 1) < listQuery.data.total_pages
    : false;

  const switchView = (next: GalleryView) => {
    setView(next);
    setSelectedProductUid(null);
    setSelectedItem(null);
    setPagination({
      pageIndex: 0,
      pageSize: next === "products" ? PRODUCTS_PER_PAGE : ITEMS_PER_PAGE,
    });
  };

  if (resumeDraft) {
    if (resumeDraft.category === "product-shoot") {
      return (
        <ProductShootReviewSession
          draftUid={resumeDraft.uid}
          token={token}
          onBack={closeResume}
          backLabel="Back to gallery"
          onEditImage={onEditImage}
          onManualPhotoEdit={onManualPhotoEdit}
        />
      );
    }
    return (
      <ModelShootReviewSession
        draftUid={resumeDraft.uid}
        token={token}
        onBack={closeResume}
        backLabel="Back to gallery"
        onEditImage={onEditImage}
        onManualPhotoEdit={onManualPhotoEdit}
        onOpenVideoShoot={onOpenVideoShoot}
      />
    );
  }

  if (selectedItem) {
    return (
      <GalleryItemDetail
        item={selectedItem}
        token={token}
        categoryTitle={GALLERY_CATEGORY_LABELS[selectedItem.category as GalleryCategory] ?? selectedItem.category}
        onBack={() => setSelectedItem(null)}
        onEditImage={onEditImage}
        onManualPhotoEdit={onManualPhotoEdit}
        onOpenTryOnWithJewellery={onOpenTryOnWithJewellery}
        onGenerateCampaignVideo={(s3Key) => openCampaignVideo(selectedItem, s3Key)}
        onItemUpdated={setSelectedItem}
      />
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete gallery item?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the gallery item. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={galleryDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={galleryDeleting}
              onClick={(e) => {
                e.preventDefault();
                void confirmDeleteGalleryItem();
              }}
            >
              {galleryDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(deleteProductTarget)}
        onOpenChange={(open) => !open && !productDeleting && setDeleteProductTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this product?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes {deleteProductTarget?.sku ? `${deleteProductTarget.sku} ` : "this product "}
              and every product shoot, model shoot, and edited image grouped under it. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={productDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={productDeleting}
              onClick={(e) => {
                e.preventDefault();
                void confirmDeleteProduct();
              }}
            >
              {productDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete product"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={Boolean(assignTarget)}
        onOpenChange={(open) => {
          if (!open && !assigning) {
            setAssignTarget(null);
            setAssignProductId("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign product ID</DialogTitle>
            <DialogDescription>
              Group this generation under an existing product ID, or enter a new one. Items with the
              same ID appear together in All products.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="gallery-assign-product-id">Product ID</Label>
            <Input
              id="gallery-assign-product-id"
              value={assignProductId}
              onChange={(e) => setAssignProductId(e.target.value)}
              placeholder="e.g. AXG-0001 or RING-14"
              maxLength={64}
              autoComplete="off"
              disabled={assigning}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void confirmAssignGalleryItem();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={assigning}
              onClick={() => {
                setAssignTarget(null);
                setAssignProductId("");
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={assigning || !assignProductId.trim()}
              onClick={() => void confirmAssignGalleryItem()}
            >
              {assigning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="space-y-2">
        <div className="-mx-1 flex flex-nowrap items-center gap-1 overflow-x-auto overflow-y-visible pb-2 [-webkit-overflow-scrolling:touch] md:mx-0 md:flex-wrap md:overflow-visible md:pb-0">
          {GALLERY_VIEWS.map((option) => {
            const isActive = view === option.id && !selectedProductUid;
            return (
              <Button
                key={option.id}
                type="button"
                variant={isActive ? "default" : "outline"}
                className="shrink-0 whitespace-nowrap touch-manipulation text-xs md:text-sm"
                onClick={() => switchView(option.id)}
              >
                {option.label}
              </Button>
            );
          })}
        </div>
      </div>

      {selectedProductUid ? (
        <ProductDetailPanel
          token={token}
          query={productDetailQuery}
          imageIndexByRow={imageIndexByRow}
          setImageIndexByRow={setImageIndexByRow}
          onBack={() => setSelectedProductUid(null)}
          onOpenItem={openGalleryItem}
          onDeleteItem={setDeleteTarget}
          onDeleteProduct={setDeleteProductTarget}
          onAssignItem={(item) => {
            setAssignTarget(item);
            setAssignProductId(item.product_sku ?? "");
          }}
          galleryDeleting={galleryDeleting}
          deleteTargetUid={deleteTarget?.uid ?? null}
          productDeleting={productDeleting}
        />
      ) : view === "products" ? (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-3">
            <div className="min-w-0 text-sm text-muted-foreground">
              {productsQuery.isFetching ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading...
                </span>
              ) : productsQuery.data ? (
                <span>
                  {productsQuery.data.total}{" "}
                  {productsQuery.data.total === 1 ? "product" : "products"}
                </span>
              ) : (
                "—"
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2 self-stretch md:self-auto">
              <Button
                type="button"
                variant="outline"
                className="min-h-10 flex-1 touch-manipulation md:min-h-0 md:flex-none"
                disabled={!canPrev || productsQuery.isFetching}
                onClick={() =>
                  setPagination((prev) => ({ ...prev, pageIndex: Math.max(0, prev.pageIndex - 1) }))
                }
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                className="min-h-10 flex-1 touch-manipulation md:min-h-0 md:flex-none"
                disabled={!canNext || productsQuery.isFetching}
                onClick={() => setPagination((prev) => ({ ...prev, pageIndex: prev.pageIndex + 1 }))}
              >
                Next
              </Button>
            </div>
          </div>
          {productsQuery.isError ? (
            <p className="text-sm text-destructive">
              {(productsQuery.error as Error | undefined)?.message ?? "Failed to load products"}
            </p>
          ) : productsQuery.data?.items.length ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {productsQuery.data.items.map((product) => (
                <div
                  key={product.uid}
                  className="overflow-hidden rounded-lg border bg-card text-left transition hover:border-primary/50"
                >
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => setSelectedProductUid(product.uid)}
                  >
                    <ProductHeroThumb token={token} s3Key={product.hero_thumbnail_s3_key} />
                    <div className="space-y-2 p-3 pb-0">
                      <h3 className="truncate font-semibold leading-tight">{product.name}</h3>
                      <p className="text-xs text-muted-foreground">SKU {product.sku}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {countBadge(
                          product.product_shoot_count,
                          "product",
                          "bg-sky-500/15 text-sky-600 dark:text-sky-400"
                        )}
                        {countBadge(
                          product.model_shoot_count,
                          "model",
                          "bg-violet-500/15 text-violet-600 dark:text-violet-400"
                        )}
                        {countBadge(
                          product.edited_image_count,
                          "edited",
                          "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                        )}
                        {countBadge(
                          product.product_video_count ?? 0,
                          "p-video",
                          "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                        )}
                        {countBadge(
                          product.model_video_count ?? 0,
                          "m-video",
                          "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                        )}
                      </div>
                    </div>
                  </button>
                  <div className="flex justify-end p-3 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      title="Delete product"
                      disabled={!token || productDeleting}
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteProductTarget(product);
                      }}
                    >
                      {productDeleting && deleteProductTarget?.uid === product.uid ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : productsQuery.isFetching ? null : (
            <p className="text-sm text-muted-foreground">
              No products yet. Start a product shoot or model shoot to create one.
            </p>
          )}
        </div>
      ) : (
      <div className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-3">
          <div className="min-w-0 text-sm text-muted-foreground">
            {query.isFetching ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading...
              </span>
            ) : query.data ? (
              <span>
                Showing page <span className="font-medium text-foreground">{query.data.page}</span> of{" "}
                <span className="font-medium text-foreground">{query.data.total_pages}</span> (total{" "}
                <span className="font-medium text-foreground">{query.data.total}</span>)
              </span>
            ) : (
              "—"
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2 self-stretch md:self-auto">
            <Button
              type="button"
              variant="outline"
              className="min-h-10 flex-1 touch-manipulation md:min-h-0 md:flex-none"
              disabled={!canPrev || query.isFetching}
              onClick={() => table.previousPage()}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-10 flex-1 touch-manipulation md:min-h-0 md:flex-none"
              disabled={!canNext || query.isFetching}
              onClick={() => table.nextPage()}
            >
              Next
            </Button>
          </div>
        </div>

        <div className="rounded-md border">
          <Table className="min-w-[720px]">
            <TableHeader>
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id}>
                  {hg.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      className="h-10 px-1.5 py-1 text-xs md:px-2 md:text-sm"
                    >
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {query.isError ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="px-2 py-3 text-sm text-destructive">
                    {(query.error as Error | undefined)?.message ?? "Failed to load gallery items"}
                  </TableCell>
                </TableRow>
              ) : table.getRowModel().rows.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id} className="cursor-pointer" onClick={() => openGalleryItem(row.original)}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="px-1.5 py-1.5 align-top text-xs md:px-2 md:py-2 md:text-sm">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="px-2 py-3 text-sm text-muted-foreground">
                    No results.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
      )}
    </div>
  );
}

function ProductDetailPanel({
  token,
  query,
  imageIndexByRow,
  setImageIndexByRow,
  onBack,
  onOpenItem,
  onDeleteItem,
  onDeleteProduct,
  onAssignItem,
  galleryDeleting,
  deleteTargetUid,
  productDeleting,
}: {
  token: string | null;
  query: UseQueryResult<GalleryProductDetailResponse>;
  imageIndexByRow: Record<string, number>;
  setImageIndexByRow: Dispatch<SetStateAction<Record<string, number>>>;
  onBack: () => void;
  onOpenItem: (item: GalleryItem) => void;
  onDeleteItem: (item: GalleryItem) => void;
  onDeleteProduct: (product: GalleryProduct) => void;
  onAssignItem: (item: GalleryItem) => void;
  galleryDeleting: boolean;
  deleteTargetUid: string | null;
  productDeleting: boolean;
}) {
  const product = query.data?.product;
  const sections: { title: string; items: GalleryItem[] }[] = [
    { title: "Product shoots", items: query.data?.product_shoots ?? [] },
    { title: "Model shoots", items: query.data?.model_shoots ?? [] },
    { title: "Edited images", items: query.data?.edited_images ?? [] },
    { title: "Product videos", items: query.data?.product_videos ?? [] },
    { title: "Model videos", items: query.data?.model_videos ?? [] },
  ];
  const hasAnyItems = sections.some((section) => section.items.length > 0);
  return (
    <div className="space-y-5">
      <Button type="button" variant="ghost" className="h-auto px-0" onClick={onBack}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        All products
      </Button>
      {query.isPending ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading product...
        </div>
      ) : query.isError || !product ? (
        <p className="text-sm text-destructive">
          {(query.error as Error | undefined)?.message ?? "Failed to load product"}
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="w-full max-w-[16rem] overflow-hidden rounded-lg border">
              <ProductHeroThumb token={token} s3Key={product.hero_thumbnail_s3_key} />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold">{product.name}</h2>
              <p className="text-sm text-muted-foreground">SKU {product.sku}</p>
              <div className="flex flex-wrap gap-1.5">
                {countBadge(
                  product.product_shoot_count,
                  "product",
                  "bg-sky-500/15 text-sky-600 dark:text-sky-400"
                )}
                {countBadge(
                  product.model_shoot_count,
                  "model",
                  "bg-violet-500/15 text-violet-600 dark:text-violet-400"
                )}
                {countBadge(
                  product.edited_image_count,
                  "edited",
                  "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                )}
                {countBadge(
                  product.product_video_count ?? 0,
                  "product video",
                  "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                )}
                {countBadge(
                  product.model_video_count ?? 0,
                  "model video",
                  "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={!token || productDeleting}
                onClick={() => onDeleteProduct(product)}
              >
                {productDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Delete product
              </Button>
            </div>
          </div>
          {sections.map((section) =>
            section.items.length ? (
              <div key={section.title} className="space-y-3">
                <h3 className="text-sm font-medium">{section.title}</h3>
                <div className="grid gap-2">
                  {section.items.map((item) => (
                    <div
                      key={item.uid}
                      className="flex cursor-pointer items-center gap-3 rounded-lg border bg-card px-3 py-2 text-left transition hover:border-primary/50"
                      onClick={() => onOpenItem(item)}
                    >
                      <GalleryImageCell
                        token={token}
                        s3Keys={item.image_s3_keys ?? []}
                        captions={galleryImageCaptions(item.analysis)}
                        rowKey={item.uid}
                        imageIndexByRow={imageIndexByRow}
                        setImageIndexByRow={setImageIndexByRow}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">
                          {GALLERY_CATEGORY_LABELS[item.category as GalleryCategory] ?? item.category}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Edited {formatTableDate(item.edited_at)}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {item.can_resume_review ? (
                            <Badge variant="secondary" className="w-fit">
                              {item.generations_remaining === 1
                                ? "1 edit left"
                                : `${item.generations_remaining ?? 2} edits left`}
                            </Badge>
                          ) : null}
                          {item.in_catalog ? (
                            <Badge variant="outline" className="w-fit border-primary/40 text-primary">
                              In catalogue
                            </Badge>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          title="Change product ID"
                          disabled={!token || galleryDeleting}
                          onClick={(e) => {
                            e.stopPropagation();
                            onAssignItem(item);
                          }}
                        >
                          <Tag className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          title="Delete gallery item"
                          disabled={!token || galleryDeleting}
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteItem(item);
                          }}
                        >
                          {galleryDeleting && deleteTargetUid === item.uid ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null
          )}
          {!hasAnyItems ? (
            <p className="text-sm text-muted-foreground">
              No generations grouped under this product yet.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
