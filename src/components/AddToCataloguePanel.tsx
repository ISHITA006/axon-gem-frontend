import { useCallback, useMemo, useState } from "react";
import { LibraryBig, Loader2, Pencil, X } from "lucide-react";
import Cropper, { type Area } from "react-easy-crop";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiCreateCatalogueItem, apiEditCatalogueImage, downloadImage, type TryOnAnalysis } from "@/lib/api";
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
} from "@/components/catalogue/constants";

type ImageItem = { url: string; s3Key: string };

type Props = {
  token: string | null;
  analysis: TryOnAnalysis | null | undefined;
  images: ImageItem[];
  formOverrides?: Partial<CatalogueForm>;
};

type CatalogueForm = {
  name: string;
  description: string;
  jewelleryType: string;
  category: string;
  itemCode: string;
  gender: string;
  age: string;
  metal: string;
  metalPurity: string;
  metalWeightGrams: string;
  stoneType: string;
  stoneCut: string;
  stoneCount: string;
  stoneCarat: string;
  settingType: string;
  design: string;
};

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

function normalizeEnumValue(v: unknown): string {
  return str(v).trim().toLowerCase();
}

function pickEnum<T extends string>(options: readonly T[], v: unknown): T | "" {
  const nv = normalizeEnumValue(v);
  const match = options.find((o) => normalizeEnumValue(o) === nv);
  return match ?? "";
}

function buildCatalogueDefaults(
  analysis: TryOnAnalysis | null | undefined,
  formOverrides?: Partial<CatalogueForm>,
): CatalogueForm {
  return {
    ...{
      name: analysis?.name || "",
      description: analysis?.description || "",
      jewelleryType: pickEnum(JEWELLERY_TYPE_OPTIONS, analysis?.jewellery_type),
      category: pickEnum(CATEGORY_OPTIONS, ""),
      itemCode: analysis?.item_code || "",
      gender: pickEnum(GENDER_OPTIONS, analysis?.gender),
      age: pickEnum(AGE_OPTIONS, analysis?.age),
      metal: pickEnum(METAL_OPTIONS, analysis?.metal),
      metalPurity: pickEnum(METAL_PURITY_OPTIONS, analysis?.metal_purity),
      metalWeightGrams: str(analysis?.metal_weight_grams),
      stoneType: pickEnum(STONE_TYPE_OPTIONS, analysis?.stone_type),
      stoneCut: pickEnum(STONE_CUT_OPTIONS, analysis?.stone_cut),
      stoneCount: str(analysis?.stone_count),
      stoneCarat: str(analysis?.stone_carat),
      settingType: pickEnum(SETTING_TYPE_OPTIONS, analysis?.setting_type),
      design: pickEnum(DESIGN_OPTIONS, analysis?.design),
    },
    ...formOverrides,
  };
}

async function getCroppedImageFile(imageSrc: string, cropPixels: Area, fileName: string): Promise<File> {
  const image = new Image();
  image.crossOrigin = "anonymous";
  const imageLoaded = new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Failed to load image for cropping"));
  });
  image.src = imageSrc;
  await imageLoaded;

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(cropPixels.width));
  canvas.height = Math.max(1, Math.round(cropPixels.height));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not initialize crop canvas");
  ctx.drawImage(image, cropPixels.x, cropPixels.y, cropPixels.width, cropPixels.height, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.95));
  if (!blob) throw new Error("Failed to export cropped image");
  return new File([blob], fileName, { type: "image/jpeg" });
}

export default function AddToCataloguePanel({ token, analysis, images, formOverrides }: Props) {
  const { toast } = useToast();
  const [catalogueOpen, setCatalogueOpen] = useState(false);
  const [catalogueSubmitting, setCatalogueSubmitting] = useState(false);
  const [catalogueTarget, setCatalogueTarget] = useState<{ imageUrls: string[]; s3Keys: string[] } | null>(null);
  const [cropDialogOpen, setCropDialogOpen] = useState(false);
  const [cropIndex, setCropIndex] = useState<number | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [cropSaving, setCropSaving] = useState(false);
  const [cropImageUrl, setCropImageUrl] = useState<string | null>(null);
  const [cropLoading, setCropLoading] = useState(false);
  const [form, setForm] = useState<CatalogueForm>(buildCatalogueDefaults(analysis, formOverrides));

  const canOpen = Boolean(token && images.length);
  const previewUrls = useMemo(() => images.map((i) => i.url), [images]);
  const previewS3Keys = useMemo(() => images.map((i) => i.s3Key), [images]);

  const openCatalogue = () => {
    setForm(buildCatalogueDefaults(analysis, formOverrides));
    setCatalogueTarget({ imageUrls: previewUrls, s3Keys: previewS3Keys });
    setCatalogueOpen(true);
  };

  const onCropComplete = useCallback((_a: Area, croppedAreaInPixels: Area) => setCroppedAreaPixels(croppedAreaInPixels), []);

  const removeCatalogueImageAt = (index: number) => {
    if (!catalogueTarget) return;
    if (catalogueTarget.s3Keys.length <= 1) {
      toast({ title: "At least one image", description: "Keep at least one image to add to the catalogue.", variant: "destructive" });
      return;
    }
    setCatalogueTarget((prev) => {
      if (!prev) return prev;
      const nextUrls = [...prev.imageUrls];
      const nextKeys = [...prev.s3Keys];
      nextUrls.splice(index, 1);
      nextKeys.splice(index, 1);
      return { imageUrls: nextUrls, s3Keys: nextKeys };
    });
    if (cropDialogOpen && cropIndex === index) {
      setCropDialogOpen(false);
      setCropIndex(null);
      setCroppedAreaPixels(null);
      setCropImageUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    } else if (cropDialogOpen && cropIndex != null && cropIndex > index) {
      setCropIndex(cropIndex - 1);
    }
  };

  const openCropDialog = async (index: number) => {
    if (!token || !catalogueTarget) return;
    const s3Key = catalogueTarget.s3Keys[index];
    if (!s3Key) return;
    setCropLoading(true);
    setCropIndex(index);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    try {
      const imageBlob = await downloadImage(token, s3Key);
      const blobUrl = URL.createObjectURL(imageBlob);
      setCropImageUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return blobUrl;
      });
      setCropDialogOpen(true);
    } catch {
      toast({ title: "Crop failed", description: "Could not load image for cropping", variant: "destructive" });
    } finally {
      setCropLoading(false);
    }
  };

  const handleCropConfirm = async () => {
    if (!token || !catalogueTarget || cropIndex == null || !croppedAreaPixels || !cropImageUrl) return;
    const originalS3Key = catalogueTarget.s3Keys[cropIndex];
    if (!originalS3Key) return;
    setCropSaving(true);
    try {
      const croppedFile = await getCroppedImageFile(cropImageUrl, croppedAreaPixels, `cropped-${cropIndex + 1}.jpg`);
      const edited = await apiEditCatalogueImage(token, { originalImageS3Key: originalS3Key, file: croppedFile });
      setCatalogueTarget((prev) => {
        if (!prev) return prev;
        const nextUrls = [...prev.imageUrls];
        const nextS3Keys = [...prev.s3Keys];
        nextUrls[cropIndex] = edited.previewUrl ?? URL.createObjectURL(croppedFile);
        if (edited.editedImageS3Key) nextS3Keys[cropIndex] = edited.editedImageS3Key;
        return { ...prev, imageUrls: nextUrls, s3Keys: nextS3Keys };
      });
      setCropDialogOpen(false);
      toast({ title: "Image updated", description: "Cropped image saved." });
    } catch (err: unknown) {
      toast({ title: "Crop failed", description: err instanceof Error ? err.message : "Could not crop image", variant: "destructive" });
    } finally {
      setCropSaving(false);
    }
  };

  const handleCatalogueSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !catalogueTarget) return;
    if (!catalogueTarget.s3Keys.length) {
      return toast({ title: "Images required", description: "Add at least one image to create a catalogue item.", variant: "destructive" });
    }
    if (!form.name.trim()) return toast({ title: "Name required", description: "Please enter a catalogue item name.", variant: "destructive" });
    if (!form.category) return toast({ title: "Category required", description: "Please select a category.", variant: "destructive" });
    if (!form.gender) return toast({ title: "Gender required", description: "Please select a gender.", variant: "destructive" });
    if (!form.age) return toast({ title: "Age required", description: "Please select an age.", variant: "destructive" });
    if (!form.jewelleryType) return toast({ title: "Jewellery type required", description: "Please select a jewellery type.", variant: "destructive" });
    if (!form.itemCode.trim()) return toast({ title: "Item code required", description: "Please enter an item code.", variant: "destructive" });
    if (!form.metal) return toast({ title: "Metal required", description: "Please select a metal.", variant: "destructive" });
    if (!form.settingType) return toast({ title: "Setting type required", description: "Please select a setting type.", variant: "destructive" });
    if (!form.design) return toast({ title: "Design required", description: "Please select a design.", variant: "destructive" });

    setCatalogueSubmitting(true);
    try {
      await apiCreateCatalogueItem(token, {
        name: form.name.trim(),
        jewelleryType: form.jewelleryType,
        category: form.category,
        itemCode: form.itemCode.trim(),
        gender: form.gender,
        age: form.age,
        metal: form.metal,
        settingType: form.settingType,
        design: form.design,
        imageS3Keys: catalogueTarget.s3Keys,
        description: form.description.trim() || undefined,
        metalPurity: form.metalPurity || undefined,
        metalWeightGrams: form.metalWeightGrams.trim() || undefined,
        stoneType: form.stoneType || undefined,
        stoneCut: form.stoneCut || undefined,
        stoneCount: form.stoneCount.trim() || undefined,
        stoneCarat: form.stoneCarat.trim() || undefined,
      });
      toast({ title: "Added to catalogue", description: `"${form.name.trim()}" was created.` });
      setCatalogueOpen(false);
      setCatalogueTarget(null);
    } catch (err: unknown) {
      toast({ title: "Catalogue failed", description: err instanceof Error ? err.message : "Could not create item", variant: "destructive" });
    } finally {
      setCatalogueSubmitting(false);
    }
  };

  return (
    <>
      <Button variant="secondary" className="gap-2 sm:self-auto" onClick={openCatalogue} disabled={!canOpen}>
        <LibraryBig className="h-4 w-4" /> Add to catalogue
      </Button>
      <Sheet open={catalogueOpen} onOpenChange={setCatalogueOpen}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-lg">
          <SheetHeader className="text-left">
            <SheetTitle>Add to catalogue</SheetTitle>
            <SheetDescription>Create a catalogue entry from these generated images.</SheetDescription>
          </SheetHeader>
          <form onSubmit={handleCatalogueSubmit} className="mt-6 flex flex-1 flex-col gap-4 pb-8">
            {catalogueTarget ? (
              <div className="overflow-x-auto scroll-px-4 rounded-md border bg-muted/30 px-4 py-3">
                <div className="flex w-max max-w-none justify-start gap-4 py-1">
                  {catalogueTarget.imageUrls.map((url, idx) => (
                    <div key={`${catalogueTarget.s3Keys[idx]}-${idx}`} className="relative shrink-0 pt-0.5">
                      <Button
                        type="button"
                        size="icon"
                        variant="secondary"
                        className="absolute left-1 top-1 h-7 w-7"
                        title="Remove from catalogue (does not delete from storage)"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          removeCatalogueImageAt(idx);
                        }}
                        disabled={cropSaving || cropLoading || catalogueTarget.s3Keys.length <= 1}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="secondary"
                        className="absolute right-1 top-1 h-7 w-7"
                        title="Crop image"
                        onClick={() => openCropDialog(idx)}
                        disabled={cropSaving || cropLoading}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <img src={url} alt="Catalogue preview" className="h-40 w-40 rounded object-contain" />
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2"><Label htmlFor="cat-category">Category *</Label><Select value={form.category || undefined} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}><SelectTrigger id="cat-category"><SelectValue placeholder="Select category" /></SelectTrigger><SelectContent>{CATEGORY_OPTIONS.map((opt) => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-2 sm:col-span-2"><Label htmlFor="cat-jewellery-type">Jewellery type *</Label><Select value={form.jewelleryType || undefined} onValueChange={(v) => setForm((f) => ({ ...f, jewelleryType: v }))}><SelectTrigger id="cat-jewellery-type"><SelectValue placeholder="Select jewellery type" /></SelectTrigger><SelectContent>{JEWELLERY_TYPE_OPTIONS.map((opt) => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-2 sm:col-span-2"><Label htmlFor="cat-item-code">Item code *</Label><Input id="cat-item-code" value={form.itemCode} onChange={(e) => setForm((f) => ({ ...f, itemCode: e.target.value }))} required /></div>
              <div className="space-y-2 sm:col-span-2"><Label htmlFor="cat-name">Name *</Label><Input id="cat-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Product name" required /></div>
              <div className="space-y-2 sm:col-span-2"><Label htmlFor="cat-desc">Description</Label><Textarea id="cat-desc" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Optional" rows={3} className="resize-y min-h-[72px]" /></div>
              <div className="space-y-2"><Label htmlFor="cat-gender">Gender *</Label><Select value={form.gender || undefined} onValueChange={(v) => setForm((f) => ({ ...f, gender: v }))}><SelectTrigger id="cat-gender"><SelectValue placeholder="Select gender" /></SelectTrigger><SelectContent>{GENDER_OPTIONS.map((opt) => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-2"><Label htmlFor="cat-age">Age *</Label><Select value={form.age || undefined} onValueChange={(v) => setForm((f) => ({ ...f, age: v }))}><SelectTrigger id="cat-age"><SelectValue placeholder="Select age" /></SelectTrigger><SelectContent>{AGE_OPTIONS.map((opt) => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-2"><Label htmlFor="cat-metal">Metal *</Label><Select value={form.metal || undefined} onValueChange={(v) => setForm((f) => ({ ...f, metal: v }))}><SelectTrigger id="cat-metal"><SelectValue placeholder="Select metal" /></SelectTrigger><SelectContent>{METAL_OPTIONS.map((opt) => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-2"><Label htmlFor="cat-metal-purity">Metal purity</Label><Select value={form.metalPurity || undefined} onValueChange={(v) => setForm((f) => ({ ...f, metalPurity: v }))}><SelectTrigger id="cat-metal-purity"><SelectValue placeholder="Select metal purity" /></SelectTrigger><SelectContent>{METAL_PURITY_OPTIONS.map((opt) => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-2"><Label htmlFor="cat-metal-weight">Metal weight (g)</Label><Input id="cat-metal-weight" value={form.metalWeightGrams} onChange={(e) => setForm((f) => ({ ...f, metalWeightGrams: e.target.value }))} /></div>
              <div className="space-y-2"><Label htmlFor="cat-setting-type">Setting type *</Label><Select value={form.settingType || undefined} onValueChange={(v) => setForm((f) => ({ ...f, settingType: v }))}><SelectTrigger id="cat-setting-type"><SelectValue placeholder="Select setting type" /></SelectTrigger><SelectContent>{SETTING_TYPE_OPTIONS.map((opt) => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-2 sm:col-span-2"><Label htmlFor="cat-design">Design *</Label><Select value={form.design || undefined} onValueChange={(v) => setForm((f) => ({ ...f, design: v }))}><SelectTrigger id="cat-design"><SelectValue placeholder="Select design" /></SelectTrigger><SelectContent>{DESIGN_OPTIONS.map((opt) => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-2"><Label htmlFor="cat-stone-type">Stone type</Label><Select value={form.stoneType || undefined} onValueChange={(v) => setForm((f) => ({ ...f, stoneType: v }))}><SelectTrigger id="cat-stone-type"><SelectValue placeholder="Select stone type" /></SelectTrigger><SelectContent>{STONE_TYPE_OPTIONS.map((opt) => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-2"><Label htmlFor="cat-stone-cut">Stone cut</Label><Select value={form.stoneCut || undefined} onValueChange={(v) => setForm((f) => ({ ...f, stoneCut: v }))}><SelectTrigger id="cat-stone-cut"><SelectValue placeholder="Select stone cut" /></SelectTrigger><SelectContent>{STONE_CUT_OPTIONS.map((opt) => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-2"><Label htmlFor="cat-stone-count">Stone count</Label><Input id="cat-stone-count" value={form.stoneCount} onChange={(e) => setForm((f) => ({ ...f, stoneCount: e.target.value }))} /></div>
              <div className="space-y-2"><Label htmlFor="cat-stone-carat">Stone carat</Label><Input id="cat-stone-carat" value={form.stoneCarat} onChange={(e) => setForm((f) => ({ ...f, stoneCarat: e.target.value }))} /></div>
            </div>
            <Button
              type="submit"
              className="mt-2 w-full"
              disabled={!token || catalogueSubmitting || !catalogueTarget?.s3Keys.length}
            >
              {catalogueSubmitting ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>) : "Save to catalogue"}
            </Button>
          </form>
        </SheetContent>
      </Sheet>
      <Dialog
        open={cropDialogOpen}
        onOpenChange={(open) => {
          setCropDialogOpen(open);
          if (!open) {
            setCropIndex(null);
            setCroppedAreaPixels(null);
            setCropImageUrl((prev) => {
              if (prev) URL.revokeObjectURL(prev);
              return null;
            });
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Crop image</DialogTitle>
            <DialogDescription>Adjust crop with a fixed 2:3 aspect ratio.</DialogDescription>
          </DialogHeader>
          <div className="relative h-[420px] overflow-hidden rounded-md bg-black">
            {cropImageUrl ? (
              <Cropper image={cropImageUrl} crop={crop} zoom={zoom} aspect={2 / 3} onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={onCropComplete} />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading image...</div>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="crop-zoom">Zoom</Label>
            <input id="crop-zoom" type="range" min={1} max={3} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-full" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCropDialogOpen(false)} disabled={cropSaving}>Cancel</Button>
            <Button type="button" onClick={handleCropConfirm} disabled={cropSaving || !croppedAreaPixels}>
              {cropSaving ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>) : "Confirm crop"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
