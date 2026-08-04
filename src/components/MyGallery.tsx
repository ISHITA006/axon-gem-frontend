import type { Dispatch, SetStateAction } from "react";
import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { flexRender, getCoreRowModel, type ColumnDef, type PaginationState, useReactTable } from "@tanstack/react-table";
import { ChevronLeft, ChevronRight, Download, Gem, Loader2, Pencil, Scissors, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  apiDeleteGalleryItem,
  apiGetGalleryItems, 
  downloadMedia,
  getPresignedUrl,
  type GalleryCategory,
  type GalleryItem,
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatTableDate } from "./catalogue/utils";
import { GalleryItemDetail } from "@/components/GalleryItemDetail";

const ITEMS_PER_PAGE = 5;
const GALLERY_CATEGORIES: GalleryCategory[] = ["model-shoot", "product-shoot", "modified-product", "edited-image", "generated-design", "deleted-catalogue", "video"];
const GALLERY_CATEGORY_LABELS: Record<GalleryCategory, string> = {
  "model-shoot": "Model Shoot",
  "product-shoot": "Product Shoot",
  "modified-product": "Modified Product Images",
  "edited-image": "Edited Images",
  "generated-design": "Generated Designs",
  "deleted-catalogue": "Deleted Catalogue Items",
  "video": "Videos",
};

interface MyGalleryProps {
  onEditImage?: (s3Key: string, imageUrl: string) => void;
  onChangeColour?: (s3Key: string, imageUrl: string) => void;
  onChangeLength?: (s3Key: string, imageUrl: string) => void;
  onEditVideo?: (s3Key: string, imageUrl: string) => void;
  /** Opens Model Try On with this image as the jewellery piece (presigned URL resolved here). */
  onOpenTryOnWithJewellery?: (s3Key: string, imageUrl: string) => void;
}

function GalleryImageCell({
  token,
  s3Keys,
  category,
  rowKey,
  imageIndexByRow,
  setImageIndexByRow,
}: {
  token: string | null;
  s3Keys: string[];
  category: string;
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
  const isVideoItem = category === "video";
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
        ) : isVideoItem ? (
          <video
            src={urlQuery.data}
            muted
            playsInline
            preload="metadata"
            className="h-full w-full object-cover"
          />
        ) : (
          <img src={urlQuery.data} alt="" className="h-full w-full object-cover" />
        )}
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

export default function MyGallery({
  onEditImage,
  onChangeColour,
  onChangeLength,
  onEditVideo,
  onOpenTryOnWithJewellery,
}: MyGalleryProps) {
  const { token } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [category, setCategory] = useState<GalleryCategory>("model-shoot");
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: ITEMS_PER_PAGE });
  const [actionKey, setActionKey] = useState<string | null>(null);
  const [imageIndexByRow, setImageIndexByRow] = useState<Record<string, number>>({});
  const [selectedItem, setSelectedItem] = useState<GalleryItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<GalleryItem | null>(null);
  const [galleryDeleting, setGalleryDeleting] = useState(false);

  const page = pagination.pageIndex + 1;

  const query = useQuery({
    queryKey: ["gallery-items", token, category, page, pagination.pageSize],
    enabled: Boolean(token),
    queryFn: async () => {
      if (!token) throw new Error("Not authenticated");
      return apiGetGalleryItems(token, {
        category,
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

  const handleChangeLength = async (s3Key: string) => {
    if (!token || !onChangeLength) return;
    setActionKey(`length:${s3Key}`);
    try {
      const url = await getPresignedUrl(token, s3Key);
      onChangeLength(s3Key, url);
    } catch (err: unknown) {
      toast({
        title: "Open length tool failed",
        description: err instanceof Error ? err.message : "Unable to open product length tool",
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

  const columns = useMemo<ColumnDef<GalleryItem>[]>(
    () => [
      {
        id: "images",
        header: "Image",
        cell: ({ row }) => (
          <GalleryImageCell
            token={token}
            s3Keys={row.original.image_s3_keys ?? []}
            category={row.original.category}
            rowKey={String(row.original.uid ?? row.id)}
            imageIndexByRow={imageIndexByRow}
            setImageIndexByRow={setImageIndexByRow}
          />
        ),
      },
      {
        accessorKey: "category",
        header: "Category",
        cell: ({ row }) =>
          GALLERY_CATEGORY_LABELS[row.original.category as GalleryCategory] ?? row.original.category,
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
          const changingLength = Boolean(selectedKey && actionKey === `length:${selectedKey}`);
          const openingTryOn = Boolean(selectedKey && actionKey === `tryon:${selectedKey}`);
          const disabled = downloading || editing || changingLength || openingTryOn || galleryDeleting;
          const category = row.original.category;
          const showTryOn =
            Boolean(onOpenTryOnWithJewellery && selectedKey && category !== "video");
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
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={disabled}
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleChangeLength(selectedKey);
                    }}
                  >
                    {changingLength ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scissors className="h-4 w-4" />}
                  </Button>
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
                </>
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
      deleteTarget?.uid,
      galleryDeleting,
      imageIndexByRow,
      token,
      onOpenTryOnWithJewellery,
      openTryOnWithJewelleryFromKey,
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

  const canPrev = (query.data?.page ?? 1) > 1;
  const canNext = query.data?.total_pages ? (query.data?.page ?? 1) < query.data.total_pages : false;

  if (selectedItem) {
    return (
      <GalleryItemDetail
        item={selectedItem}
        token={token}
        categoryTitle={GALLERY_CATEGORY_LABELS[selectedItem.category as GalleryCategory] ?? selectedItem.category}
        onBack={() => setSelectedItem(null)}
        onEditImage={onEditImage}
        onChangeLength={onChangeLength}
        onChangeColour={onChangeColour}
        onEditVideo={onEditVideo}
        onOpenTryOnWithJewellery={onOpenTryOnWithJewellery}
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

      <div className="space-y-2">
        <div className="-mx-1 flex flex-nowrap items-center gap-1 overflow-x-auto overflow-y-visible pb-2 [-webkit-overflow-scrolling:touch] md:mx-0 md:flex-wrap md:overflow-visible md:pb-0">
          {GALLERY_CATEGORIES.map((option) => {
            const isActive = category === option;
            return (
              <Button
                key={option}
                type="button"
                variant={isActive ? "default" : "outline"}
                className="shrink-0 whitespace-nowrap touch-manipulation text-xs md:text-sm"
                onClick={() => {
                  setCategory(option);
                  setPagination((prev) => ({ ...prev, pageIndex: 0 }));
                }}
              >
                {GALLERY_CATEGORY_LABELS[option]}
              </Button>
            );
          })}
        </div>
      </div>

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
                  <TableRow key={row.id} className="cursor-pointer" onClick={() => setSelectedItem(row.original)}>
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
    </div>
  );
}
