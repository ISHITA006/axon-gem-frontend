import { useEffect, useMemo, useState } from "react";
import { Loader2, Upload, Download, ImageIcon, Scissors, Palette, Pencil, Gem } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import {
  apiGenerateEmbroideryVariation,
  apiGeneratePrintVariation,
  downloadImage,
  getPresignedUrl,
} from "@/lib/api";
import { createDisplayableImageObjectUrl } from "@/lib/heicImage";

type VariationMode = "embroidery" | "print" | "";
type PlacementSpecification = "all over" | "positional" | "flexible" | "";
type InspirationMode = "none" | "image" | "text";

type VariationResult = {
  s3Key: string;
  url: string;
};

type Props = {
  onEditImage?: (s3Key: string, imageUrl: string) => void;
  onChangeColour?: (s3Key: string, imageUrl: string) => void;
  onChangeLength?: (s3Key: string, imageUrl: string) => void;
  onOpenTryOnWithJewellery?: (s3Key: string, imageUrl: string) => void;
};

export default function ChangeEmbroideryPrint({ onEditImage, onChangeColour, onChangeLength, onOpenTryOnWithJewellery }: Props) {
  const { token } = useAuth();
  const { toast } = useToast();

  const [mode, setMode] = useState<VariationMode>("");
  const [specification, setSpecification] = useState<PlacementSpecification>("");
  const [inspirationMode, setInspirationMode] = useState<InspirationMode>("none");

  const [garmentFile, setGarmentFile] = useState<File | null>(null);
  const [garmentPreviewUrl, setGarmentPreviewUrl] = useState<string | null>(null);

  const [inspirationFile, setInspirationFile] = useState<File | null>(null);
  const [inspirationPreviewUrl, setInspirationPreviewUrl] = useState<string | null>(null);
  const [inspirationText, setInspirationText] = useState("");

  const [generating, setGenerating] = useState(false);
  const [results, setResults] = useState<VariationResult[] | null>(null);

  const isReady = useMemo(() => {
    return !!garmentFile && !!token;
  }, [garmentFile, token]);

  useEffect(() => {
    // Cleanup object URLs when they change/unmount to avoid memory leaks.
    return () => {
      if (garmentPreviewUrl) URL.revokeObjectURL(garmentPreviewUrl);
      if (inspirationPreviewUrl) URL.revokeObjectURL(inspirationPreviewUrl);
    };
  }, [garmentPreviewUrl, inspirationPreviewUrl]);

  const handleGarmentSelect = async (file: File | null) => {
    if (!file) return;
    try {
      const url = await createDisplayableImageObjectUrl(file);
      setGarmentFile(file);
      setGarmentPreviewUrl(url);
    } catch {
      toast({ title: "Could not load image", description: "Please try a different file.", variant: "destructive" });
    }
  };

  const handleInspirationSelect = async (file: File | null) => {
    if (!file) return;
    try {
      const url = await createDisplayableImageObjectUrl(file);
      setInspirationFile(file);
      setInspirationPreviewUrl(url);
    } catch {
      toast({ title: "Could not load image", description: "Please try a different file.", variant: "destructive" });
    }
  };

  const handleClearInspiration = () => {
    setInspirationFile(null);
    setInspirationPreviewUrl(null);
  };

  const handleInspirationModeChange = (value: string) => {
    const mode = value as InspirationMode;
    setInspirationMode(mode);
    if (mode !== "text") setInspirationText("");
    if (mode !== "image") handleClearInspiration();
  };

  const handleSubmit = async () => {
    if (!token || !garmentFile) {
      toast({
        title: "Missing input",
        description: "Please upload a product image to continue.",
        variant: "destructive",
      });
      return;
    }

    if (!mode) {
      toast({
        title: "Select variation type",
        description: "Please choose either Embroidery or Print.",
        variant: "destructive",
      });
      return;
    }

    if (!specification) {
      toast({
        title: "Select placement specification",
        description: "Please choose all over, positional, or flexible.",
        variant: "destructive",
      });
      return;
    }

    setGenerating(true);
    setResults(null);

    try {
      const trimmedInspirationText = inspirationText.trim();
      const inspiration =
        inspirationMode === "image" && inspirationFile
          ? { file: inspirationFile }
          : inspirationMode === "text" && trimmedInspirationText
            ? { text: trimmedInspirationText }
            : undefined;

      const keys =
        mode === "embroidery"
          ? await apiGenerateEmbroideryVariation(token, garmentFile, specification, inspiration)
          : await apiGeneratePrintVariation(token, garmentFile, specification, inspiration);

      if (!Array.isArray(keys) || keys.length !== 3) {
        throw new Error("Expected exactly 3 result images from the server.");
      }

      const presignedUrls = await Promise.all(keys.map((k) => getPresignedUrl(token, k)));
      const nextResults = keys.map((s3Key, idx) => ({
        s3Key,
        url: presignedUrls[idx],
      }));

      setResults(nextResults);
      toast({ title: "Success", description: "Variations generated!" });
    } catch (err: unknown) {
      toast({
        title: "Generation failed",
        description: err instanceof Error ? err.message : "Please try again",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
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

  const viewTitle =
    mode === "" ? "Change embroidery or print" : mode === "embroidery" ? "Change Embroidery" : "Change Print";

  if (generating) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-6">
        <div className="relative">
          <div className="h-20 w-20 rounded-full border-4 border-muted" />
          <Loader2 className="absolute inset-0 h-20 w-20 animate-spin text-primary" />
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-xl font-semibold">{viewTitle}...</h2>
          <p className="text-sm text-muted-foreground">This may take a moment. Please don&apos;t close this page.</p>
        </div>
      </div>
    );
  }

  if (results) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{viewTitle} - Results</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-6 md:grid-cols-3">
              {results.map((r, idx) => (
                <div key={r.s3Key} className="space-y-3">
                  <p className="text-sm font-medium text-muted-foreground">Option {idx + 1}</p>
                  <div className="relative">
                    <img
                      src={r.url}
                      alt={`${viewTitle} option ${idx + 1}`}
                      className="w-full rounded-lg border shadow-sm object-contain max-h-[60vh]"
                    />
                    {(onEditImage || onChangeColour || onChangeLength) ? (
                      <div className="absolute right-2 top-2 flex items-center gap-2">
                        {onEditImage ? (
                          <button
                            onClick={() => onEditImage(r.s3Key, r.url)}
                            className="rounded-full bg-background/80 p-1.5 shadow hover:bg-background"
                            title="Edit image"
                          >
                            <Pencil className="h-4 w-4 text-foreground" />
                          </button>
                        ) : null}
                        {onChangeColour ? (
                          <button
                            onClick={() => onChangeColour(r.s3Key, r.url)}
                            className="rounded-full bg-background/80 p-1.5 shadow hover:bg-background"
                            title="Change colour"
                          >
                            <Palette className="h-4 w-4 text-foreground" />
                          </button>
                        ) : null}
                        {onChangeLength ? (
                          <button
                            onClick={() => onChangeLength(r.s3Key, r.url)}
                            className="rounded-full bg-background/80 p-1.5 shadow hover:bg-background"
                            title="Change length"
                          >
                            <Scissors className="h-4 w-4 text-foreground" />
                          </button>
                        ) : null}
                        {onOpenTryOnWithJewellery ? (
                          <button
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
                    className="w-full gap-2"
                    onClick={() => handleDownload(r.s3Key, "change-pattern.png")}
                    disabled={!token}
                  >
                    <Download className="h-4 w-4" /> Download
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      <div className="space-y-6">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-3 md:col-span-1">
            <Label htmlFor="variation-type">Select whether you want to change embroidery or print</Label>
            <Select value={mode || undefined} onValueChange={(v) => setMode(v as VariationMode)}>
              <SelectTrigger id="variation-type">
                <SelectValue placeholder="Select one" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="embroidery">Embroidery</SelectItem>
                <SelectItem value="print">Print</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-3 md:col-span-1">
            <Label htmlFor="placement-specification">Placement specification</Label>
            <Select
              value={specification || undefined}
              onValueChange={(v) => setSpecification(v as PlacementSpecification)}
            >
              <SelectTrigger id="placement-specification">
                <SelectValue placeholder="Select placement specification" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all over">All over</SelectItem>
                <SelectItem value="positional">Positional</SelectItem>
                <SelectItem value="flexible">Flexible</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card className="shadow-none border border-dashed bg-muted/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Upload className="h-4 w-4" /> Product image *
              </CardTitle>
            </CardHeader>
            <CardContent>
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/20 p-6 transition hover:border-primary/50 hover:bg-muted/40">
                {garmentPreviewUrl ? (
                  <img src={garmentPreviewUrl} alt="Product preview" className="max-h-48 rounded object-contain" />
                ) : (
                  <>
                    <ImageIcon className="mb-2 h-10 w-10 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Click to upload product image</span>
                  </>
                )}
                <input
                  type="file"
                  accept="image/*,.heic,.heif"
                  className="hidden"
                  onChange={(e) => void handleGarmentSelect(e.target.files?.[0] || null)}
                />
              </label>
            </CardContent>
          </Card>

          <Card
            className={`shadow-none border border-dashed bg-muted/20 ${
              inspirationMode === "none" ? "opacity-50" : ""
            }`}
          >
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Upload className="h-4 w-4" /> Inspiration (optional)
              </CardTitle>
              <RadioGroup
                value={inspirationMode}
                onValueChange={handleInspirationModeChange}
                className="grid gap-3 pt-2"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="none" id="inspiration-none" />
                  <Label htmlFor="inspiration-none" className="cursor-pointer font-normal text-sm">
                    None
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="image" id="inspiration-image" />
                  <Label htmlFor="inspiration-image" className="cursor-pointer font-normal text-sm">
                    Inspiration image
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="text" id="inspiration-text" />
                  <Label htmlFor="inspiration-text" className="cursor-pointer font-normal text-sm">
                    Inspiration text
                  </Label>
                </div>
              </RadioGroup>
            </CardHeader>
            <CardContent className="space-y-3">
              {inspirationMode === "image" ? (
                <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/20 p-6 transition hover:border-primary/50 hover:bg-muted/40">
                  {inspirationPreviewUrl ? (
                    <img
                      src={inspirationPreviewUrl}
                      alt="Inspiration preview"
                      className="max-h-48 rounded object-contain"
                    />
                  ) : (
                    <>
                      <ImageIcon className="mb-2 h-10 w-10 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Click to add inspiration image</span>
                    </>
                  )}
                  <input
                    type="file"
                    accept="image/*,.heic,.heif"
                    className="hidden"
                    onChange={(e) => void handleInspirationSelect(e.target.files?.[0] || null)}
                  />
                </label>
              ) : inspirationMode === "text" ? (
                <div className="space-y-2">
                  <Label htmlFor="inspiration-textarea" className="text-xs text-muted-foreground">
                    Describe the aesthetic, colour palette or motifs you want (optional if left blank—no inspiration is sent)
                  </Label>
                  <Textarea
                    id="inspiration-textarea"
                    placeholder="e.g. paisley motif along the band, fine milgrain detailing…"
                    value={inspirationText}
                    onChange={(e) => setInspirationText(e.target.value)}
                    className="min-h-[100px] resize-y"
                  />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-6">
                  Choose image or text above to add inspiration.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-center pt-2">
          <Button
            size="lg"
            onClick={handleSubmit}
            disabled={!isReady || generating || !mode || !specification}
            className="min-w-[260px]"
          >
            {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {!mode
              ? "Select Embroidery or Print"
              : !specification
                ? "Select Placement Specification"
                : mode === "embroidery"
                  ? "Generate Embroidery Variations"
                  : "Generate Print Variations"}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground text-center">
          This feature returns 3 variations. You can download each one below the results.
        </p>
      </div>
    </div>
  );
}
