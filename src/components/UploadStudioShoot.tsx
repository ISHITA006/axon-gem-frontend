import { useEffect, useState } from "react";
import { ImageIcon, Loader2, Upload } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { apiCreateCatalogueItem, apiCreateStudioShoot, apiGetNextStudioShootCode, getPresignedUrl } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { createDisplayableImageObjectUrl } from "@/lib/heicImage";
import {
  AGE_OPTIONS,
  DESIGN_OPTIONS,
  GENDER_OPTIONS,
  JEWELLERY_TYPE_OPTIONS,
  METAL_OPTIONS,
  METAL_PURITY_OPTIONS,
  SETTING_TYPE_OPTIONS,
  STONE_CUT_OPTIONS,
  STONE_TYPE_OPTIONS,
} from "@/components/catalogue/constants";

const FIXED_CATEGORY = "Studio Shoot";

type FormState = {
  name: string;
  description: string;
  jewelleryType: string;
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

const EMPTY_FORM: FormState = {
  name: "",
  description: "",
  jewelleryType: "",
  itemCode: "",
  gender: "",
  age: "",
  metal: "",
  metalPurity: "",
  metalWeightGrams: "",
  stoneType: "",
  stoneCut: "",
  stoneCount: "",
  stoneCarat: "",
  settingType: "",
  design: "",
};

export default function UploadStudioShoot() {
  const { token } = useAuth();
  const { toast } = useToast();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [shooting, setShooting] = useState(false);
  const [codeLoading, setCodeLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [studioImageUrl, setStudioImageUrl] = useState<string | null>(null);
  const [studioImageS3Key, setStudioImageS3Key] = useState<string | null>(null);

  useEffect(() => {
    if (!imageFile) {
      setPreviewUrl(null);
      return;
    }
    let cancelled = false;
    let createdUrl: string | null = null;
    void createDisplayableImageObjectUrl(imageFile)
      .then((url) => {
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        createdUrl = url;
        setPreviewUrl(url);
      })
      .catch(() => {
        if (!cancelled) setPreviewUrl(null);
      });
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [imageFile]);

  const loadNextStudioShootCode = async () => {
    if (!token) return;
    setCodeLoading(true);
    try {
      const data = await apiGetNextStudioShootCode(token);
      setForm((prev) => ({ ...prev, itemCode: data.code || "" }));
    } catch (err: unknown) {
      toast({
        title: "Could not fetch item code",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setCodeLoading(false);
    }
  };

  useEffect(() => {
    loadNextStudioShootCode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleCreateStudioShoot = async () => {
    if (!token) return;
    if (!imageFile) {
      toast({ title: "Image required", description: "Please upload a raw jewellery image first.", variant: "destructive" });
      return;
    }
    setShooting(true);
    try {
      const shot = await apiCreateStudioShoot(token, imageFile);
      if (!shot.imageS3Key) {
        throw new Error("Studio shoot image key not returned from API");
      }
      let nextUrl = shot.imageUrl;
      if (!nextUrl) {
        nextUrl = await getPresignedUrl(token, shot.imageS3Key);
      }
      setStudioImageS3Key(shot.imageS3Key);
      setStudioImageUrl(nextUrl);
      toast({ title: "Studio shoot ready", description: "The studio product shot is ready to save." });
    } catch (err: unknown) {
      setStudioImageS3Key(null);
      setStudioImageUrl(null);
      toast({ title: "Studio shoot failed", description: err instanceof Error ? err.message : "Could not create studio shoot", variant: "destructive" });
    } finally {
      setShooting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (!imageFile) return toast({ title: "Image required", description: "Please upload a raw jewellery image.", variant: "destructive" });
    if (!studioImageS3Key) return toast({ title: "Studio shoot required", description: "Please click Create studio shoot before saving.", variant: "destructive" });
    if (!form.name.trim()) return toast({ title: "Name required", description: "Please enter a catalogue item name.", variant: "destructive" });
    if (!form.gender) return toast({ title: "Gender required", description: "Please select a gender.", variant: "destructive" });
    if (!form.age) return toast({ title: "Age required", description: "Please select an age.", variant: "destructive" });
    if (!form.jewelleryType) return toast({ title: "Jewellery type required", description: "Please select a jewellery type.", variant: "destructive" });
    if (!form.itemCode.trim()) return toast({ title: "Item code required", description: "Please enter an item code.", variant: "destructive" });
    if (!form.metal) return toast({ title: "Metal required", description: "Please select a metal.", variant: "destructive" });
    if (!form.settingType) return toast({ title: "Setting type required", description: "Please select a setting type.", variant: "destructive" });
    if (!form.design) return toast({ title: "Design required", description: "Please select a design.", variant: "destructive" });

    setSubmitting(true);
    try {
      await apiCreateCatalogueItem(token, {
        name: form.name.trim(),
        jewelleryType: form.jewelleryType,
        category: FIXED_CATEGORY,
        itemCode: form.itemCode.trim(),
        gender: form.gender,
        age: form.age,
        metal: form.metal,
        settingType: form.settingType,
        design: form.design,
        imageS3Keys: [studioImageS3Key],
        description: form.description.trim() || undefined,
        metalPurity: form.metalPurity || undefined,
        metalWeightGrams: form.metalWeightGrams.trim() || undefined,
        stoneType: form.stoneType || undefined,
        stoneCut: form.stoneCut || undefined,
        stoneCount: form.stoneCount.trim() || undefined,
        stoneCarat: form.stoneCarat.trim() || undefined,
      });
      toast({ title: "Added to catalogue", description: `"${form.name.trim()}" was created.` });
      setForm(EMPTY_FORM);
      setImageFile(null);
      setStudioImageS3Key(null);
      setStudioImageUrl(null);
      await loadNextStudioShootCode();
    } catch (err: unknown) {
      toast({ title: "Upload failed", description: err instanceof Error ? err.message : "Could not create studio shoot", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Studio Shoot</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {studioImageUrl ? (
            <div className="space-y-2">
              <Label>Studio shoot image *</Label>
              <div className="rounded-lg border bg-muted/20 p-3">
                <img src={studioImageUrl} alt="Studio shoot" className="max-h-64 rounded object-contain" />
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label>Raw jewellery image *</Label>
                <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/20 p-6 transition hover:border-primary/50 hover:bg-muted/40">
                  {previewUrl ? (
                    <img src={previewUrl} alt="Raw jewellery preview" className="max-h-64 rounded object-contain" />
                  ) : (
                    <>
                      <ImageIcon className="mb-2 h-10 w-10 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Click to upload image</span>
                    </>
                  )}
                  <input
                    type="file"
                    accept="image/*,.heic,.heif"
                    className="hidden"
                    onChange={(e) => {
                      setImageFile(e.target.files?.[0] || null);
                      setStudioImageS3Key(null);
                      setStudioImageUrl(null);
                    }}
                  />
                </label>
              </div>

              <div className="space-y-2">
                <Button type="button" variant="secondary" className="gap-2" onClick={handleCreateStudioShoot} disabled={!token || !imageFile || shooting}>
                  {shooting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {shooting ? "Creating studio shoot..." : "Create studio shoot"}
                </Button>
                <p className="text-xs text-muted-foreground">A clean studio product shot is required before saving to catalogue.</p>
              </div>
            </>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2"><Label htmlFor="cat-category">Category *</Label><Input id="cat-category" value={FIXED_CATEGORY} disabled /></div>
            <div className="space-y-2 sm:col-span-2"><Label htmlFor="cat-jewellery-type">Jewellery type *</Label><Select value={form.jewelleryType || undefined} onValueChange={(v) => setForm((f) => ({ ...f, jewelleryType: v }))}><SelectTrigger id="cat-jewellery-type"><SelectValue placeholder="Select jewellery type" /></SelectTrigger><SelectContent>{JEWELLERY_TYPE_OPTIONS.map((opt) => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2 sm:col-span-2"><Label htmlFor="cat-item-code">Item code *</Label><Input id="cat-item-code" value={form.itemCode} disabled required placeholder={codeLoading ? "Loading..." : ""} /></div>
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

          <Button type="submit" className="w-full gap-2" disabled={!token || submitting || !studioImageS3Key}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {submitting ? "Saving..." : "Save to catalogue"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
