import { ArrowLeft, Loader2, Pencil, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import type { CatalogueEditForm, CatalogueItem } from "./types";
import {
  AGE_OPTIONS,
  CATEGORY_OPTIONS,
  DESIGN_OPTIONS,
  GENDER_OPTIONS,
  JEWELLERY_TYPE_OPTIONS,
  METAL_OPTIONS,
  METAL_PURITY_OPTIONS,
  SETTING_TYPE_OPTIONS,
  STONE_CUT_OPTIONS,
  STONE_TYPE_OPTIONS,
} from "./constants";
import { fmtDate } from "./utils";
import { ViewField } from "./ViewField";
import { ImageKeyThumb } from "./images/ImageKeyThumb";
import { FullscreenCarouselDialog } from "./images/FullscreenCarouselDialog";

export function CatalogueDetail({
  token,
  item,
  editMode,
  form,
  saving,
  uploading,
  deletingItem,
  deletingKey,
  imageKeys,
  carouselOpen,
  carouselStartIndex,
  onCarouselOpenChange,
  onCarouselStartIndexChange,
  onBack,
  onStartEdit,
  onCancelEdit,
  onSave,
  onDeleteItem,
  onUploadFiles,
  onRemoveImageKey,
  onFormChange,
  onChangeProductColour,
  onChangeProductLength,
  onEditImage,
  onEditVideo,
}: {
  token: string | null;
  item: CatalogueItem;
  editMode: boolean;
  form: CatalogueEditForm | null;
  saving: boolean;
  uploading: boolean;
  deletingItem: boolean;
  deletingKey: string | null;
  imageKeys: string[];
  carouselOpen: boolean;
  carouselStartIndex: number;
  onCarouselOpenChange: (open: boolean) => void;
  onCarouselStartIndexChange: (idx: number) => void;
  onBack: () => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: () => void;
  onDeleteItem: () => void;
  onUploadFiles: (files: FileList | null) => void;
  onRemoveImageKey: (key: string) => void;
  onFormChange: (next: CatalogueEditForm) => void;
  onChangeProductColour?: (s3Key: string, imageUrl: string) => void;
  onChangeProductLength?: (s3Key: string, imageUrl: string) => void;
  onEditImage?: (s3Key: string, imageUrl: string) => void;
  onEditVideo?: (s3Key: string, imageUrl: string) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button type="button" variant="outline" onClick={onBack} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">{item.name ?? "Catalogue item"}</h2>
            <p className="text-sm text-muted-foreground">{item.item_code ?? ""}</p>
          </div>
        </div>

        {!editMode ? (
          <div className="flex items-center gap-2">
            <Button type="button" onClick={onStartEdit} className="gap-2" disabled={!token}>
              <Pencil className="h-4 w-4" /> Edit
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" variant="destructive" disabled={deletingItem || !token} className="gap-2">
                  {deletingItem ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete catalogue item?</AlertDialogTitle>
                  <AlertDialogDescription>This will move this item to the deleted catalogue section in the gallery.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={onDeleteItem} disabled={deletingItem}>
                    {deletingItem ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={onCancelEdit} disabled={saving || uploading}>
              Cancel
            </Button>
            <Button type="button" onClick={onSave} disabled={saving || uploading} className="gap-2">
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Saving…
                </>
              ) : (
                "Save"
              )}
            </Button>
          </div>
        )}
      </div>

      <Card>
        <CardContent className="space-y-6 pt-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold">Images</h3>
              <div className="flex items-center gap-3">
                {editMode ? (
                  <label
                    className={cn(
                      "inline-flex items-center gap-2 text-sm",
                      uploading ? "pointer-events-none opacity-60" : "cursor-pointer",
                    )}
                  >
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    <span>Upload</span>
                    <input
                      type="file"
                      accept="image/*,.heic,.heif"
                      multiple
                      className="hidden"
                      onChange={(e) => onUploadFiles(e.target.files)}
                      disabled={uploading || saving}
                    />
                  </label>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              {imageKeys.map((k, i) => (
                <button
                  key={k}
                  type="button"
                  className="contents"
                  onClick={() => {
                    onCarouselStartIndexChange(i);
                    onCarouselOpenChange(true);
                  }}
                >
                  <ImageKeyThumb
                    token={token}
                    s3Key={k}
                    clickable
                    disabled={saving || uploading}
                    removeLoading={deletingKey === k}
                    onRemove={
                      editMode
                        ? () => {
                            onRemoveImageKey(k);
                          }
                        : undefined
                    }
                  />
                </button>
              ))}
              {editMode && form && form.image_s3_keys.length === 0 ? (
                <div className="text-sm text-destructive">At least one image is required.</div>
              ) : null}
            </div>
          </div>

          <FullscreenCarouselDialog
            open={carouselOpen}
            onOpenChange={onCarouselOpenChange}
            token={token}
            title={`${item.name ?? "Catalogue item"}`}
            s3Keys={imageKeys}
            startIndex={carouselStartIndex}
            onChangeProductColour={onChangeProductColour}
            onChangeProductLength={onChangeProductLength}
            onEditImage={onEditImage}
            onEditVideo={onEditVideo}
          />

          {editMode && form ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-2">
                <Label>Item code</Label>
                <Input value={form.item_code} onChange={(e) => onFormChange({ ...form, item_code: e.target.value })} />
              </div>

              <div className="space-y-2 md:col-span-2 lg:col-span-2">
                <Label>Name</Label>
                <Input value={form.name} onChange={(e) => onFormChange({ ...form, name: e.target.value })} />
              </div>

              <div className="space-y-2 md:col-span-2 lg:col-span-3">
                <Label>Description</Label>
                <Textarea value={form.description} onChange={(e) => onFormChange({ ...form, description: e.target.value })} rows={3} className="min-h-[72px]" />
              </div>

              <div className="space-y-2">
                <Label>Jewellery type</Label>
                <Select value={form.jewellery_type || undefined} onValueChange={(v) => onFormChange({ ...form, jewellery_type: v })}>
                  <SelectTrigger><SelectValue placeholder="Select jewellery type" /></SelectTrigger>
                  <SelectContent>{JEWELLERY_TYPE_OPTIONS.map((opt) => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={form.category || undefined} onValueChange={(v) => onFormChange({ ...form, category: v })}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>{CATEGORY_OPTIONS.map((opt) => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Gender</Label>
                <Select value={form.gender || undefined} onValueChange={(v) => onFormChange({ ...form, gender: v })}>
                  <SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger>
                  <SelectContent>{GENDER_OPTIONS.map((opt) => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Age</Label>
                <Select value={form.age || undefined} onValueChange={(v) => onFormChange({ ...form, age: v })}>
                  <SelectTrigger><SelectValue placeholder="Select age" /></SelectTrigger>
                  <SelectContent>{AGE_OPTIONS.map((opt) => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Metal</Label>
                <Select value={form.metal || undefined} onValueChange={(v) => onFormChange({ ...form, metal: v })}>
                  <SelectTrigger><SelectValue placeholder="Select metal" /></SelectTrigger>
                  <SelectContent>{METAL_OPTIONS.map((opt) => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Metal purity</Label>
                <Select value={form.metal_purity || undefined} onValueChange={(v) => onFormChange({ ...form, metal_purity: v })}>
                  <SelectTrigger><SelectValue placeholder="Select metal purity" /></SelectTrigger>
                  <SelectContent>{METAL_PURITY_OPTIONS.map((opt) => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Metal weight (grams)</Label>
                <Input value={form.metal_weight_grams} onChange={(e) => onFormChange({ ...form, metal_weight_grams: e.target.value })} />
              </div>

              <div className="space-y-2">
                <Label>Setting type</Label>
                <Select value={form.setting_type || undefined} onValueChange={(v) => onFormChange({ ...form, setting_type: v })}>
                  <SelectTrigger><SelectValue placeholder="Select setting type" /></SelectTrigger>
                  <SelectContent>{SETTING_TYPE_OPTIONS.map((opt) => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Stone type</Label>
                <Select value={form.stone_type || undefined} onValueChange={(v) => onFormChange({ ...form, stone_type: v })}>
                  <SelectTrigger><SelectValue placeholder="Select stone type" /></SelectTrigger>
                  <SelectContent>{STONE_TYPE_OPTIONS.map((opt) => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Stone cut</Label>
                <Select value={form.stone_cut || undefined} onValueChange={(v) => onFormChange({ ...form, stone_cut: v })}>
                  <SelectTrigger><SelectValue placeholder="Select stone cut" /></SelectTrigger>
                  <SelectContent>{STONE_CUT_OPTIONS.map((opt) => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Stone count</Label>
                <Input value={form.stone_count} onChange={(e) => onFormChange({ ...form, stone_count: e.target.value })} />
              </div>

              <div className="space-y-2">
                <Label>Stone carat</Label>
                <Input value={form.stone_carat} onChange={(e) => onFormChange({ ...form, stone_carat: e.target.value })} />
              </div>

              <div className="space-y-2">
                <Label>Design</Label>
                <Select value={form.design || undefined} onValueChange={(v) => onFormChange({ ...form, design: v })}>
                  <SelectTrigger><SelectValue placeholder="Select design" /></SelectTrigger>
                  <SelectContent>{DESIGN_OPTIONS.map((opt) => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <ViewField label="Item code" value={item.item_code} />
              <ViewField label="Name" value={item.name} className="md:col-span-2 lg:col-span-2" />
              <ViewField label="Description" value={item.description} className="md:col-span-2 lg:col-span-3" />
              <ViewField label="Jewellery type" value={item.jewellery_type} />
              <ViewField label="Category" value={item.category} />
              <ViewField label="Gender" value={item.gender} />
              <ViewField label="Age" value={item.age} />
              <ViewField label="Metal" value={item.metal} />
              <ViewField label="Metal purity" value={item.metal_purity} />
              <ViewField label="Metal weight (grams)" value={item.metal_weight_grams} />
              <ViewField label="Setting type" value={item.setting_type} />
              <ViewField label="Stone type" value={item.stone_type} />
              <ViewField label="Stone cut" value={item.stone_cut} />
              <ViewField label="Stone count" value={item.stone_count} />
              <ViewField label="Stone carat" value={item.stone_carat} />
              <ViewField label="Design" value={item.design} />
            </div>
          )}

          {!editMode ? (
            <div className="grid gap-4 md:grid-cols-2">
              <ViewField label="Created" value={fmtDate(item.created_at)} />
              <ViewField label="Updated" value={fmtDate(item.updated_at)} />
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

