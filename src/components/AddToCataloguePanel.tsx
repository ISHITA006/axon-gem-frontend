import { useCallback, useEffect, useMemo, useState } from "react";
import { LibraryBig, Loader2, Pencil, X } from "lucide-react";
import Cropper, { type Area } from "react-easy-crop";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  apiCreateCatalogueItem,
  apiEditCatalogueImage,
  apiListCatalogueFields,
  downloadImage,
  getPresignedUrl,
  type CatalogueFieldDefinition,
} from "@/lib/api";
import { DynamicCatalogueFields } from "@/components/catalogue/DynamicCatalogueFields";

type ImageItem = { url: string; s3Key: string };

type Props = {
  token: string | null;
  images: ImageItem[];
  defaults?: {
    itemCode?: string;
    name?: string;
    description?: string;
  };
};

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

export default function AddToCataloguePanel({ token, images, defaults }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fields, setFields] = useState<CatalogueFieldDefinition[]>([]);
  const [itemCode, setItemCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [customFields, setCustomFields] = useState<Record<string, unknown>>({});
  const [target, setTarget] = useState<{ imageUrls: string[]; s3Keys: string[] } | null>(null);

  const [cropDialogOpen, setCropDialogOpen] = useState(false);
  const [cropIndex, setCropIndex] = useState<number | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [cropSaving, setCropSaving] = useState(false);
  const [cropImageUrl, setCropImageUrl] = useState<string | null>(null);
  const [cropLoading, setCropLoading] = useState(false);

  const canOpen = Boolean(token && images.length);
  const previewUrls = useMemo(() => images.map((i) => i.url), [images]);
  const previewS3Keys = useMemo(() => images.map((i) => i.s3Key), [images]);

  useEffect(() => {
    if (!open || !token) return;
    void apiListCatalogueFields(token)
      .then(setFields)
      .catch(() => setFields([]));
  }, [open, token]);

  const openCatalogue = async () => {
    setItemCode(defaults?.itemCode ?? "");
    setName(defaults?.name ?? "");
    setDescription(defaults?.description ?? "");
    setCustomFields({});
    let urls = previewUrls;
    if (token && previewS3Keys.some((k, i) => !previewUrls[i])) {
      urls = await Promise.all(
        previewS3Keys.map(async (key, i) => {
          if (previewUrls[i]) return previewUrls[i];
          try {
            return await getPresignedUrl(token, key);
          } catch {
            return "";
          }
        }),
      );
    }
    setTarget({ imageUrls: urls, s3Keys: previewS3Keys });
    setOpen(true);
  };

  const onCropComplete = useCallback((_a: Area, croppedAreaInPixels: Area) => setCroppedAreaPixels(croppedAreaInPixels), []);

  const removeImageAt = (index: number) => {
    if (!target) return;
    if (target.s3Keys.length <= 1) {
      toast({
        title: "At least one image",
        description: "Keep at least one image to add to the catalogue.",
        variant: "destructive",
      });
      return;
    }
    setTarget((prev) => {
      if (!prev) return prev;
      const nextUrls = [...prev.imageUrls];
      const nextKeys = [...prev.s3Keys];
      nextUrls.splice(index, 1);
      nextKeys.splice(index, 1);
      return { imageUrls: nextUrls, s3Keys: nextKeys };
    });
  };

  const openCropDialog = async (index: number) => {
    if (!token || !target) return;
    const s3Key = target.s3Keys[index];
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
    if (!token || !target || cropIndex == null || !croppedAreaPixels || !cropImageUrl) return;
    const originalS3Key = target.s3Keys[cropIndex];
    if (!originalS3Key) return;
    setCropSaving(true);
    try {
      const croppedFile = await getCroppedImageFile(cropImageUrl, croppedAreaPixels, `cropped-${cropIndex + 1}.jpg`);
      const edited = await apiEditCatalogueImage(token, {
        originalImageS3Key: originalS3Key,
        file: croppedFile,
      });
      let preview = edited.previewUrl;
      if (!preview && edited.editedImageS3Key) {
        preview = await getPresignedUrl(token, edited.editedImageS3Key);
      }
      setTarget((prev) => {
        if (!prev) return prev;
        const nextUrls = [...prev.imageUrls];
        const nextS3Keys = [...prev.s3Keys];
        nextUrls[cropIndex] = preview ?? URL.createObjectURL(croppedFile);
        if (edited.editedImageS3Key) nextS3Keys[cropIndex] = edited.editedImageS3Key;
        return { ...prev, imageUrls: nextUrls, s3Keys: nextS3Keys };
      });
      setCropDialogOpen(false);
      toast({ title: "Image updated", description: "Cropped image saved." });
    } catch (err: unknown) {
      toast({
        title: "Crop failed",
        description: err instanceof Error ? err.message : "Could not crop image",
        variant: "destructive",
      });
    } finally {
      setCropSaving(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !target) return;
    if (!target.s3Keys.length) {
      return toast({
        title: "Images required",
        description: "Add at least one image.",
        variant: "destructive",
      });
    }
    if (!itemCode.trim()) {
      return toast({ title: "SKU required", description: "Please enter an item code / SKU.", variant: "destructive" });
    }
    if (!name.trim()) {
      return toast({ title: "Name required", description: "Please enter a product name.", variant: "destructive" });
    }
    for (const field of fields) {
      if (!field.required) continue;
      const v = customFields[field.key];
      if (v == null || v === "" || (Array.isArray(v) && v.length === 0)) {
        return toast({
          title: "Missing field",
          description: `${field.label} is required.`,
          variant: "destructive",
        });
      }
    }

    setSubmitting(true);
    try {
      await apiCreateCatalogueItem(token, {
        itemCode: itemCode.trim(),
        name: name.trim(),
        description: description.trim() || undefined,
        imageS3Keys: target.s3Keys,
        customFields,
      });
      toast({ title: "Added to catalogue", description: `"${name.trim()}" was created.` });
      setOpen(false);
      setTarget(null);
    } catch (err: unknown) {
      toast({
        title: "Catalogue failed",
        description: err instanceof Error ? err.message : "Could not create item",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Button variant="secondary" className="gap-2 sm:self-auto" onClick={openCatalogue} disabled={!canOpen}>
        <LibraryBig className="h-4 w-4" /> Add to catalogue
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-lg">
          <SheetHeader className="text-left">
            <SheetTitle>Add to catalogue</SheetTitle>
            <SheetDescription>Create a catalogue entry from these generated images.</SheetDescription>
          </SheetHeader>
          <form onSubmit={handleSubmit} className="mt-6 flex flex-1 flex-col gap-4 pb-8">
            {target ? (
              <div className="overflow-x-auto scroll-px-4 rounded-md border bg-muted/30 px-4 py-3">
                <div className="flex w-max max-w-none justify-start gap-4 py-1">
                  {target.imageUrls.map((url, idx) => (
                    <div key={`${target.s3Keys[idx]}-${idx}`} className="relative shrink-0 pt-0.5">
                      <Button
                        type="button"
                        size="icon"
                        variant="secondary"
                        className="absolute left-1 top-1 h-7 w-7"
                        title="Remove"
                        onClick={() => removeImageAt(idx)}
                        disabled={cropSaving || cropLoading || target.s3Keys.length <= 1}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="secondary"
                        className="absolute right-1 top-1 h-7 w-7"
                        title="Crop"
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

            <div className="space-y-1.5">
              <Label htmlFor="cat-item-code">SKU / Item code *</Label>
              <Input id="cat-item-code" value={itemCode} onChange={(e) => setItemCode(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cat-name">Product name *</Label>
              <Input id="cat-name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cat-desc">Description</Label>
              <Textarea id="cat-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
            </div>

            <DynamicCatalogueFields
              fields={fields}
              values={customFields}
              onChange={(key, value) => setCustomFields((prev) => ({ ...prev, [key]: value }))}
            />

            <Button type="submit" disabled={submitting || !token} className="mt-2">
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save to catalogue
            </Button>
          </form>
        </SheetContent>
      </Sheet>

      <Dialog open={cropDialogOpen} onOpenChange={setCropDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Crop image</DialogTitle>
            <DialogDescription>Adjust the crop area (2:3) then confirm.</DialogDescription>
          </DialogHeader>
          <div className="relative h-80 w-full overflow-hidden rounded-md bg-muted">
            {cropImageUrl ? (
              <Cropper
                image={cropImageUrl}
                crop={crop}
                zoom={zoom}
                aspect={2 / 3}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label>Zoom</Label>
            <input
              type="range"
              min={1}
              max={3}
              step={0.05}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-full"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCropDialogOpen(false)} disabled={cropSaving}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void handleCropConfirm()} disabled={cropSaving || !croppedAreaPixels}>
              {cropSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Apply crop
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
