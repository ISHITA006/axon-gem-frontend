import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef, PaginationState, SortingState } from "@tanstack/react-table";
import { ArrowUpDown } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  apiDeleteCatalogueItem,
  apiDeleteS3Object,
  apiGetCatalogueItems,
  apiUpdateCatalogueItem,
  apiUploadRawJewelleryImage,
  apiUploadTryOnImage,
  type CatalogueItem,
} from "@/lib/api";

import { CatalogueFilters } from "@/components/catalogue/CatalogueFilters";
import { CatalogueTable } from "@/components/catalogue/CatalogueTable";
import { CatalogueDetail } from "@/components/catalogue/CatalogueDetail";
import { DEFAULT_FILTERS, type CatalogueEditForm, type Filters } from "@/components/catalogue/types";
import { buildEditForm, catalogueImageS3Keys, formatTableDate, sortFromTable, valueOrDash } from "@/components/catalogue/utils";
import { CatalogueImageCell } from "@/components/catalogue/images/CatalogueImageCell";

type Props = {
  onEditImage?: (s3Key: string, imageUrl: string) => void;
  onChangeColour?: (s3Key: string, imageUrl: string) => void;
  onChangeLength?: (s3Key: string, imageUrl: string) => void;
  onEditVideo?: (s3Key: string, imageUrl: string) => void;
};

export default function ManageCatalogue({ onEditImage, onChangeColour, onChangeLength, onEditVideo }: Props) {
  const { token } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [sorting, setSorting] = useState<SortingState>([{ id: "updated_at", desc: true }]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
  const [imageIndexByRow, setImageIndexByRow] = useState<Record<string, number>>({});

  const [selectedItem, setSelectedItem] = useState<CatalogueItem | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState<CatalogueEditForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [deletingItem, setDeletingItem] = useState(false);

  const [carouselOpen, setCarouselOpen] = useState(false);
  const [carouselStartIndex, setCarouselStartIndex] = useState(0);

  const page = pagination.pageIndex + 1;
  const sort = sortFromTable(sorting);

  const query = useQuery({
    queryKey: ["catalogue-items", token, page, filters, sort.sort_by, sort.sort_dir],
    enabled: Boolean(token),
    queryFn: async () => {
      if (!token) throw new Error("Not authenticated");
      return apiGetCatalogueItems(token, {
        page,
        q: filters.q || null,
        jewellery_type: filters.jewellery_type || null,
        gender: filters.gender || null,
        age: filters.age || null,
        metal: filters.metal || null,
        metal_purity: filters.metal_purity || null,
        setting_type: filters.setting_type || null,
        stone_type: filters.stone_type || null,
        stone_cut: filters.stone_cut || null,
        design: filters.design || null,
        category: filters.category || null,
        sort_by: sort.sort_by,
        sort_dir: sort.sort_dir,
      });
    },
    staleTime: 15_000,
  });

  const columns = useMemo<ColumnDef<CatalogueItem>[]>(() => {
    const headerBtn = (label: string) => (
      <span className="inline-flex items-center gap-2">
        {label}
        <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
      </span>
    );

    return [
      {
        id: "images",
        header: "Image",
        cell: ({ row }) => (
          <CatalogueImageCell
            token={token}
            item={row.original}
            rowKey={String(row.original.uid ?? row.id)}
            imageIndexByRow={imageIndexByRow}
            setImageIndexByRow={setImageIndexByRow}
          />
        ),
      },
      {
        accessorKey: "name",
        header: ({ column }) => (
          <button type="button" className="select-none" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
            {headerBtn("Name")}
          </button>
        ),
        cell: ({ getValue }) => valueOrDash(getValue()),
      },
      {
        accessorKey: "item_code",
        header: ({ column }) => (
          <button type="button" className="select-none" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
            {headerBtn("Item code")}
          </button>
        ),
        cell: ({ getValue }) => valueOrDash(getValue()),
      },
      { accessorKey: "category", header: "Category", cell: ({ getValue }) => valueOrDash(getValue()) },
      { accessorKey: "jewellery_type", header: "Jewellery type", cell: ({ getValue }) => valueOrDash(getValue()) },
      { accessorKey: "gender", header: "Gender", cell: ({ getValue }) => valueOrDash(getValue()) },
      { accessorKey: "age", header: "Age", cell: ({ getValue }) => valueOrDash(getValue()) },
      { accessorKey: "metal", header: "Metal", cell: ({ getValue }) => valueOrDash(getValue()) },
      { accessorKey: "metal_purity", header: "Metal purity", cell: ({ getValue }) => valueOrDash(getValue()) },
      { accessorKey: "metal_weight_grams", header: "Metal weight (g)", cell: ({ getValue }) => valueOrDash(getValue()) },
      { accessorKey: "setting_type", header: "Setting type", cell: ({ getValue }) => valueOrDash(getValue()) },
      { accessorKey: "stone_type", header: "Stone type", cell: ({ getValue }) => valueOrDash(getValue()) },
      { accessorKey: "stone_cut", header: "Stone cut", cell: ({ getValue }) => valueOrDash(getValue()) },
      { accessorKey: "stone_count", header: "Stone count", cell: ({ getValue }) => valueOrDash(getValue()) },
      { accessorKey: "stone_carat", header: "Stone carat", cell: ({ getValue }) => valueOrDash(getValue()) },
      { accessorKey: "design", header: "Design", cell: ({ getValue }) => valueOrDash(getValue()) },
      { accessorKey: "description", header: "Description", cell: ({ getValue }) => valueOrDash(getValue()) },
      { accessorKey: "updated_at", header: "Updated", cell: ({ getValue }) => formatTableDate(getValue() as string) },
      { accessorKey: "created_at", header: "Created", cell: ({ getValue }) => formatTableDate(getValue() as string) },
    ];
  }, [token, imageIndexByRow]);

  const clearAll = () => {
    setFilters(DEFAULT_FILTERS);
    setSorting([{ id: "updated_at", desc: true }]);
    setPagination({ pageIndex: 0, pageSize: 10 });
  };

  const setFilter = <K extends keyof Filters>(key: K, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  };

  const openDetail = (item: CatalogueItem) => {
    setSelectedItem(item);
    setEditMode(false);
    setEditForm(null);
  };

  const startEdit = () => {
    if (!selectedItem) return;
    setEditForm(buildEditForm(selectedItem));
    setEditMode(true);
  };

  const cancelEdit = () => {
    setEditMode(false);
    setEditForm(null);
  };

  const handleUploadNewImages = async (files: FileList | null) => {
    if (!token || !editForm || !files || files.length === 0) return;
    setUploading(true);
    try {
      const isStudioShoot = (editForm.category || "").trim().toLowerCase() === "studio shoot";
      const uploadFn = isStudioShoot ? apiUploadRawJewelleryImage : apiUploadTryOnImage;
      const uploads = await Promise.all(Array.from(files).map((f) => uploadFn(token, f)));
      const newKeys = uploads.map((u) => u.s3_key).filter((k) => typeof k === "string" && k.trim().length > 0);
      setEditForm((f) => (f ? { ...f, image_s3_keys: [...f.image_s3_keys, ...newKeys] } : f));
      toast({ title: "Uploaded", description: `${newKeys.length} image(s) added.` });
    } catch (err: unknown) {
      toast({ title: "Upload failed", description: err instanceof Error ? err.message : "Could not upload images", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const removeImageKey = async (s3Key: string) => {
    if (!token || !editForm) return;
    setDeletingKey(s3Key);
    try {
      await apiDeleteS3Object(token, s3Key);
      setEditForm((f) => (f ? { ...f, image_s3_keys: f.image_s3_keys.filter((k) => k !== s3Key) } : f));
      toast({ title: "Removed", description: "Image deleted." });
    } catch (err: unknown) {
      toast({ title: "Delete failed", description: err instanceof Error ? err.message : "Could not delete image", variant: "destructive" });
    } finally {
      setDeletingKey((cur) => (cur === s3Key ? null : cur));
    }
  };

  const saveEdits = async () => {
    if (!token || !selectedItem?.uid || !editForm) return;
    if (editForm.image_s3_keys.length === 0) {
      toast({ title: "Images required", description: "Please keep at least one image.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const updated = await apiUpdateCatalogueItem(token, selectedItem.uid, {
        item_code: editForm.item_code.trim(),
        name: editForm.name.trim(),
        jewellery_type: editForm.jewellery_type,
        category: editForm.category,
        gender: editForm.gender,
        age: editForm.age,
        metal: editForm.metal,
        setting_type: editForm.setting_type,
        design: editForm.design,
        image_s3_keys: editForm.image_s3_keys,
        description: editForm.description.trim() ? editForm.description.trim() : null,
        metal_purity: editForm.metal_purity || null,
        metal_weight_grams: editForm.metal_weight_grams.trim() || null,
        stone_type: editForm.stone_type || null,
        stone_cut: editForm.stone_cut || null,
        stone_count: editForm.stone_count.trim() || null,
        stone_carat: editForm.stone_carat.trim() || null,
      });
      setSelectedItem(updated);
      cancelEdit();
      await qc.invalidateQueries({ queryKey: ["catalogue-items"] });
      toast({ title: "Saved", description: "Catalogue item updated." });
    } catch (err: unknown) {
      toast({ title: "Save failed", description: err instanceof Error ? err.message : "Could not save changes", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const deleteItem = async () => {
    if (!token || !selectedItem?.uid) return;
    setDeletingItem(true);
    try {
      await apiDeleteCatalogueItem(token, selectedItem.uid);
      setSelectedItem(null);
      cancelEdit();
      await qc.invalidateQueries({ queryKey: ["catalogue-items"] });
      toast({ title: "Deleted", description: "Catalogue item deleted." });
    } catch (err: unknown) {
      toast({ title: "Delete failed", description: err instanceof Error ? err.message : "Could not delete item", variant: "destructive" });
    } finally {
      setDeletingItem(false);
    }
  };

  if (selectedItem) {
    const imageKeys = editMode && editForm ? editForm.image_s3_keys : catalogueImageS3Keys(selectedItem);
    return (
      <CatalogueDetail
        token={token}
        item={selectedItem}
        editMode={editMode}
        form={editForm}
        saving={saving}
        uploading={uploading}
        deletingItem={deletingItem}
        deletingKey={deletingKey}
        imageKeys={imageKeys}
        carouselOpen={carouselOpen}
        carouselStartIndex={carouselStartIndex}
        onCarouselOpenChange={setCarouselOpen}
        onCarouselStartIndexChange={setCarouselStartIndex}
        onBack={() => {
          setSelectedItem(null);
          cancelEdit();
        }}
        onStartEdit={startEdit}
        onCancelEdit={cancelEdit}
        onSave={saveEdits}
        onDeleteItem={deleteItem}
        onUploadFiles={handleUploadNewImages}
        onRemoveImageKey={(k) => void removeImageKey(k)}
        onFormChange={(next) => setEditForm(next)}
        onChangeProductColour={onChangeColour}
        onChangeProductLength={onChangeLength}
        onEditImage={onEditImage}
        onEditVideo={onEditVideo}
      />
    );
  }

  return (
    <div className="space-y-6">
      <CatalogueFilters filters={filters} onChange={setFilter} onClearAll={clearAll} />
      <CatalogueTable
        data={query.data?.data ?? []}
        columns={columns}
        sorting={sorting}
        onSortingChange={(updater) => {
          setSorting(updater);
          setPagination((p) => ({ ...p, pageIndex: 0 }));
        }}
        pagination={pagination}
        onPaginationChange={setPagination}
        pageCount={query.data?.page_count ?? -1}
        isFetching={query.isFetching}
        isError={query.isError}
        errorMessage={(query.error as Error | undefined)?.message}
        page={query.data?.page}
        total={query.data?.total}
        onRowClick={openDetail}
      />
    </div>
  );
}

