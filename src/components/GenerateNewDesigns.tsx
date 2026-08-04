import {
  useEffect,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from "react";
import { Download, Loader2, Gem, Palette, Pencil, Scissors, Sparkles, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  apiGenerateNewDesigns,
  apiUploadTempImage,
  downloadImage,
  getPresignedUrl,
  type GenerateNewDesignsGender,
  type GenerateNewDesignsJewelleryType,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { createDisplayableImageObjectUrl } from "@/lib/heicImage";

const GENDER_OPTIONS: GenerateNewDesignsGender[] = [
  "Womenswear",
  "Menswear",
  "Unisex",
  "Kidswear (Female)",
  "Kidswear (Male)",
];

const JEWELLERY_TYPE_OPTIONS: { value: GenerateNewDesignsJewelleryType; label: string }[] = [
  { value: "ring", label: "Ring" },
  { value: "necklace", label: "Necklace" },
  { value: "earrings", label: "Earrings" },
  { value: "bracelet", label: "Bracelet" },
  { value: "set", label: "Set" },
];

function splitToList(raw: string): string[] {
  return raw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

type FileWithStableId = { id: string; file: File };

function newFileEntryId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function LocalImageThumb({ file, onRemove }: { file: File; onRemove: () => void }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    void (async () => {
      let u: string;
      try {
        u = await createDisplayableImageObjectUrl(file);
      } catch {
        if (cancelled) return;
        setUrl(null);
        return;
      }
      if (cancelled) {
        URL.revokeObjectURL(u);
        return;
      }
      objectUrl = u;
      setUrl(u);
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  return (
    <div className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-md border bg-muted/30">
      {url ? (
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}
      <button
        type="button"
        onClick={onRemove}
        className="absolute right-0.5 top-0.5 rounded-full bg-background/90 p-0.5 shadow-sm ring-1 ring-border opacity-100 transition-opacity hover:bg-destructive hover:text-destructive-foreground md:opacity-0 md:group-hover:opacity-100"
        title="Remove"
        aria-label="Remove image"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function MultiImageField({
  id,
  label,
  items,
  onItemsChange,
}: {
  id: string;
  label: string;
  items: FileWithStableId[];
  onItemsChange: Dispatch<SetStateAction<FileWithStableId[]>>;
}) {
  const appendFromInput = (fileList: FileList | null) => {
    const added = fileList ? Array.from(fileList) : [];
    if (!added.length) return;
    onItemsChange((prev) => [...prev, ...added.map((file) => ({ id: newFileEntryId(), file }))]);
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="file"
        accept="image/*,.heic,.heif"
        multiple
        className="cursor-pointer"
        onChange={(e) => {
          appendFromInput(e.target.files);
          e.target.value = "";
        }}
      />
      {items.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{items.length} image(s) — add more anytime</p>
          <div className="flex flex-wrap gap-2">
            {items.map((item) => (
              <LocalImageThumb
                key={item.id}
                file={item.file}
                onRemove={() => onItemsChange((prev) => prev.filter((x) => x.id !== item.id))}
              />
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Choose one or more images; repeat to add another batch.</p>
      )}
    </div>
  );
}

type GeneratedDesignResult = {
  s3Key: string;
  url: string;
};

type GenerateNewDesignsProps = {
  onEditImage?: (s3Key: string, imageUrl: string) => void;
  onChangeColour?: (s3Key: string, imageUrl: string) => void;
  onChangeLength?: (s3Key: string, imageUrl: string) => void;
  onOpenTryOnWithJewellery?: (s3Key: string, imageUrl: string) => void;
};

export default function GenerateNewDesigns({
  onEditImage,
  onChangeColour,
  onChangeLength,
  onOpenTryOnWithJewellery,
}: GenerateNewDesignsProps = {}) {
  const { token } = useAuth();
  const { toast } = useToast();

  const [budget, setBudget] = useState("");
  const [gender, setGender] = useState<GenerateNewDesignsGender>("Womenswear");
  const [targetAudienceRaw, setTargetAudienceRaw] = useState("");
  const [addMachineInstruction, setAddMachineInstruction] = useState(true);
  const [jewelleryTypes, setJewelleryTypes] = useState<Record<GenerateNewDesignsJewelleryType, boolean>>({
    ring: false,
    necklace: false,
    earrings: false,
    bracelet: false,
    set: false,
  });
  const [metalsRaw, setMetalsRaw] = useState("");
  const [stoneTypesRaw, setStoneTypesRaw] = useState("");
  const [stoneQuantity, setStoneQuantity] = useState("");
  const [stonePlacement, setStonePlacement] = useState("");
  const [size, setSize] = useState("");
  const [style, setStyle] = useState("");
  const [brandsRaw, setBrandsRaw] = useState("");
  const [userInstruction, setUserInstruction] = useState("");

  const [moodboardItems, setMoodboardItems] = useState<FileWithStableId[]>([]);
  const [gemstoneItems, setGemstoneItems] = useState<FileWithStableId[]>([]);
  const [metalItems, setMetalItems] = useState<FileWithStableId[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<GeneratedDesignResult[] | null>(null);

  const toggleJewelleryType = (value: GenerateNewDesignsJewelleryType, checked: boolean) => {
    setJewelleryTypes((prev) => ({ ...prev, [value]: checked }));
  };

  const selectedJewelleryTypeList = (Object.keys(jewelleryTypes) as GenerateNewDesignsJewelleryType[]).filter(
    (k) => jewelleryTypes[k]
  );

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;

    if (!budget.trim()) {
      toast({
        title: "Budget required",
        description: "Enter a budget for the designs (e.g. under ₹50,000, luxury).",
        variant: "destructive",
      });
      return;
    }

    const target_audience = splitToList(targetAudienceRaw);
    if (!target_audience.length) {
      toast({
        title: "Target audience required",
        description: "Enter at least one target audience (comma or newline separated).",
        variant: "destructive",
      });
      return;
    }
    if (!selectedJewelleryTypeList.length) {
      toast({
        title: "Jewellery types required",
        description: "Select at least one jewellery type.",
        variant: "destructive",
      });
      return;
    }

    const metals = splitToList(metalsRaw);
    const stone_types = splitToList(stoneTypesRaw);
    const inspiration_brands = splitToList(brandsRaw);

    setSubmitting(true);
    setResult(null);

    try {
      const moodboard_paths =
        moodboardItems.length > 0
          ? await Promise.all(moodboardItems.map(({ file: f }) => apiUploadTempImage(token, f)))
          : undefined;
      const gemstone_paths =
        gemstoneItems.length > 0
          ? await Promise.all(gemstoneItems.map(({ file: f }) => apiUploadTempImage(token, f)))
          : undefined;
      const metal_paths =
        metalItems.length > 0
          ? await Promise.all(metalItems.map(({ file: f }) => apiUploadTempImage(token, f)))
          : undefined;

      const refs = await apiGenerateNewDesigns(token, {
        budget: budget.trim(),
        gender,
        target_audience,
        add_machine_instruction: addMachineInstruction,
        jewellery_types: selectedJewelleryTypeList,
        metals: metals.length ? metals : undefined,
        moodboard_paths: moodboard_paths?.length ? moodboard_paths : undefined,
        gemstone_paths: gemstone_paths?.length ? gemstone_paths : undefined,
        stone_types: stone_types.length ? stone_types : undefined,
        stone_quantity: stoneQuantity.trim() || undefined,
        stone_placement: stonePlacement.trim() || undefined,
        size: size.trim() || undefined,
        style: style.trim() || undefined,
        metal_paths: metal_paths?.length ? metal_paths : undefined,
        inspiration_brands: inspiration_brands.length ? inspiration_brands : undefined,
        user_instruction: userInstruction.trim() || undefined,
      });

      const keys = refs.map((k) => k.trim()).filter(Boolean);
      const presignedUrls = await Promise.all(keys.map((k) => getPresignedUrl(token, k)));
      const items: GeneratedDesignResult[] = keys.map((s3Key, idx) => ({
        s3Key,
        url: presignedUrls[idx],
      }));

      setResult(items);
      toast({
        title: "Designs ready",
        description: "Your generated designs are ready.",
      });
    } catch (err: unknown) {
      toast({
        title: "Generation failed",
        description: err instanceof Error ? err.message : "Could not generate designs.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownload = async (s3Key: string, filename: string) => {
    if (!token) return;
    try {
      const blob = await downloadImage(token, s3Key);
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch {
      toast({
        title: "Download failed",
        description: "Could not download image",
        variant: "destructive",
      });
    }
  };

  if (submitting) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-6 px-4">
        <div className="relative">
          <div className="h-20 w-20 rounded-full border-4 border-muted" />
          <Loader2 className="absolute inset-0 h-20 w-20 animate-spin text-primary" />
        </div>
        <div className="text-center space-y-2 max-w-md">
          <h2 className="text-xl font-semibold">Generating new designs</h2>
          <p className="text-sm text-muted-foreground">This may take a while. Please don&apos;t close this page.</p>
        </div>
      </div>
    );
  }

  if (result !== null && result.length > 0) {
    return (
      <Card className="overflow-hidden">
        <CardHeader className="flex flex-col gap-4 border-b bg-muted/30 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
          <div>
            <CardTitle className="text-lg">Generate new designs — Results</CardTitle>
            <CardDescription className="mt-1.5">Five concepts from your brief.</CardDescription>
          </div>
          <Button type="button" variant="outline" onClick={() => setResult(null)}>
            New generation
          </Button>
        </CardHeader>
        <CardContent className="space-y-4 p-4 sm:p-6 lg:p-8">
          <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3 md:gap-8">
            {result.map((r, idx) => (
              <div key={`${r.s3Key}-${idx}`} className="flex flex-col space-y-3">
                <p className="text-sm font-medium text-muted-foreground">Option {idx + 1}</p>
                <div className="relative flex-1 min-h-0">
                  <img
                    src={r.url}
                    alt={`Generated design option ${idx + 1}`}
                    className="w-full rounded-lg border bg-muted/20 shadow-sm object-contain max-h-[min(78vh,920px)]"
                  />
                  {onEditImage || onChangeColour || onChangeLength ? (
                    <div className="absolute right-2 top-2 flex items-center gap-2">
                      {onEditImage ? (
                        <button
                          type="button"
                          onClick={() => onEditImage(r.s3Key, r.url)}
                          className="rounded-full bg-background/80 p-1.5 shadow hover:bg-background"
                          title="Edit image"
                        >
                          <Pencil className="h-4 w-4 text-foreground" />
                        </button>
                      ) : null}
                      {onChangeColour ? (
                        <button
                          type="button"
                          onClick={() => onChangeColour(r.s3Key, r.url)}
                          className="rounded-full bg-background/80 p-1.5 shadow hover:bg-background"
                          title="Change colour"
                        >
                          <Palette className="h-4 w-4 text-foreground" />
                        </button>
                      ) : null}
                      {onChangeLength ? (
                        <button
                          type="button"
                          onClick={() => onChangeLength(r.s3Key, r.url)}
                          className="rounded-full bg-background/80 p-1.5 shadow hover:bg-background"
                          title="Change length"
                        >
                          <Scissors className="h-4 w-4 text-foreground" />
                        </button>
                      ) : null}
                      {onOpenTryOnWithJewellery ? (
                        <button
                          type="button"
                          onClick={() => onOpenTryOnWithJewellery(r.s3Key, r.url)}
                          className="rounded-full bg-background/80 p-1.5 shadow hover:bg-background"
                          title="Open try-on with jewellery"
                        >
                          <Gem className="h-4 w-4 text-foreground" />
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full shrink-0 gap-2"
                  onClick={() => handleDownload(r.s3Key, `generated-design-${idx + 1}.png`)}
                  disabled={!token}
                >
                  <Download className="h-4 w-4" /> Download
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-5 w-5" />
          Generate new designs
        </CardTitle>
        <CardDescription>
          Provide a brief and references; moodboard, gemstone, and metal reference images to generate five new designs.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="budget">Budget *</Label>
              <Input
                id="budget"
                placeholder="e.g. under ₹50,000, mid-range, luxury"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Gender</Label>
              <Select value={gender} onValueChange={(v) => setGender(v as GenerateNewDesignsGender)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GENDER_OPTIONS.map((g) => (
                    <SelectItem key={g} value={g}>
                      {g}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="target-audience">Target audience *</Label>
            <Textarea
              id="target-audience"
              placeholder="e.g. Gen Z streetwear, luxury minimalists (comma or newline separated)"
              value={targetAudienceRaw}
              onChange={(e) => setTargetAudienceRaw(e.target.value)}
              rows={3}
              className="resize-y min-h-[80px]"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="add-machine-instruction">Machine manufacturability *</Label>
            <label
              htmlFor="add-machine-instruction"
              className="flex cursor-pointer items-center gap-2 text-sm leading-none"
            >
              <Checkbox
                id="add-machine-instruction"
                checked={addMachineInstruction}
                onCheckedChange={(c) => setAddMachineInstruction(c === true)}
              />
              <span>{addMachineInstruction ? "Yes — ensure that all generated designs can be manufactured by a machine" : "No — the generated designs need not necessarily be manufactured by a machine"}</span>
            </label>
            <p className="text-xs text-muted-foreground">Uncheck if you do not want this constraint in the design generation process.</p>
          </div>

          <div className="space-y-3">
            <Label>Jewellery types *</Label>
            <div className="flex flex-wrap gap-4">
              {JEWELLERY_TYPE_OPTIONS.map(({ value, label }) => (
                <label key={value} className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={jewelleryTypes[value]}
                    onCheckedChange={(c) => toggleJewelleryType(value, c === true)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="metals">Metals (optional)</Label>
              <Input
                id="metals"
                placeholder="Comma-separated, e.g. Yellow gold, Platinum, Rose gold"
                value={metalsRaw}
                onChange={(e) => setMetalsRaw(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="stone-types">Stone types (optional)</Label>
              <Input
                id="stone-types"
                placeholder="Comma-separated, e.g. Diamond, Ruby, Pearl"
                value={stoneTypesRaw}
                onChange={(e) => setStoneTypesRaw(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="stone-quantity">Stone quantity (optional)</Label>
              <Input
                id="stone-quantity"
                placeholder="e.g. solitaire, cluster of 12, halo"
                value={stoneQuantity}
                onChange={(e) => setStoneQuantity(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="stone-placement">Stone placement (optional)</Label>
              <Input
                id="stone-placement"
                placeholder="e.g. centre stone, pave band, all over"
                value={stonePlacement}
                onChange={(e) => setStonePlacement(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="size">Size (optional)</Label>
              <Input
                id="size"
                placeholder="e.g. delicate, statement, ring size 7"
                value={size}
                onChange={(e) => setSize(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="style">Style (optional)</Label>
              <Input
                id="style"
                placeholder="e.g. temple, minimal, bridal, vintage"
                value={style}
                onChange={(e) => setStyle(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <MultiImageField
              id="moodboards"
              label="Moodboard images (optional)"
              items={moodboardItems}
              onItemsChange={setMoodboardItems}
            />
            <MultiImageField
              id="gemstones"
              label="Gemstone reference images (optional)"
              items={gemstoneItems}
              onItemsChange={setGemstoneItems}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <MultiImageField
              id="metals-images"
              label="Metal reference images (optional)"
              items={metalItems}
              onItemsChange={setMetalItems}
            />
            <div className="space-y-2">
              <Label htmlFor="brands">Inspiration brands (optional)</Label>
              <Input
                id="brands"
                placeholder="Comma-separated"
                value={brandsRaw}
                onChange={(e) => setBrandsRaw(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="instruction">Additional instructions (optional)</Label>
            <Textarea
              id="instruction"
              placeholder="Any extra direction for the five designs…"
              value={userInstruction}
              onChange={(e) => setUserInstruction(e.target.value)}
              rows={4}
              className="resize-y min-h-[96px]"
            />
          </div>

          <Button type="submit" className="gap-2">
            <Sparkles className="h-4 w-4" />
            Generate 5 designs
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
