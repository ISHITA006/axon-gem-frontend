import { useEffect, useState } from "react";
import {
  Download,
  ArrowLeft,
  Loader2,
  Scissors,
  Palette,
  Pencil,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Save,
} from "lucide-react";
import type { ManualEditTool } from "@/components/ManualPhotoEditor";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import AddToCataloguePanel from "@/components/AddToCataloguePanel";
import { downloadImage, type ModelShootDraft, type ModelShootGeneration, type TryOnAnalysis } from "@/lib/api";
import {
  complementaryEditsIncluded,
  complementaryEditsLeft,
  editsLeftLabel,
} from "@/lib/modelShootCopy";
import { useToast } from "@/hooks/use-toast";

interface TryOnResultsProps {
  loading: boolean;
  results: {
    front: string;
    closeUp?: string;
    frontKey: string;
    closeUpKey?: string;
    analysis?: TryOnAnalysis | null;
  } | null;
  onBack: () => void;
  token: string | null;
  onEditImage?: (s3Key: string, imageUrl: string) => void;
  onChangeColour?: (s3Key: string, imageUrl: string) => void;
  onChangeLength?: (s3Key: string, imageUrl: string) => void;
  onManualPhotoEdit?: (s3Key: string, imageUrl: string, initialTool?: ManualEditTool) => void;
  /** Review session holding every generation for this shoot. */
  draft?: ModelShootDraft | null;
  activeGeneration?: ModelShootGeneration | null;
  onSelectGeneration?: (generationUid: string) => void;
  /** Called with the (possibly user-edited) prompt when an edit is applied. */
  onRegenerate?: (editPrompt: string) => void;
  onSaveGeneration?: () => void;
  regenerating?: boolean;
  saving?: boolean;
  /** Progress label shown while an edit is running, e.g. "Edit 1 of 2". */
  progressLabel?: string | null;
  backLabel?: string;
  loadingTitle?: string;
}

const MISMATCH_LABELS: Record<string, string> = {
  stone_colours_match: "stone colour",
  stone_count_match: "stone count",
  stone_cut_match: "stone cut",
  metal_tone_match: "metal tone",
  setting_match: "setting",
  design_match: "design",
  scale_anchor_match: "scale",
  sizes_of_all_components_match: "component sizes",
  size_ratio_of_components_match: "component proportions",
  necklace_length_match: "necklace length",
  placement_shade_size_match: "shaded placement size",
};

function labelForMismatch(field: string): string {
  return MISMATCH_LABELS[field] ?? field.replace(/_match$/, "").replace(/_/g, " ");
}

function joinTweaks(fields: string[]): string {
  const labels = fields.map(labelForMismatch);
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

export default function TryOnResults({
  loading,
  results,
  onBack,
  token,
  onEditImage,
  onChangeColour,
  onChangeLength,
  onManualPhotoEdit,
  draft,
  activeGeneration,
  onSelectGeneration,
  onRegenerate,
  onSaveGeneration,
  regenerating = false,
  saving = false,
  progressLabel,
  backLabel = "Back to Try On",
  loadingTitle,
}: TryOnResultsProps) {
  const { toast } = useToast();
  const [editPrompt, setEditPrompt] = useState("");

  const activeUid = activeGeneration?.uid ?? null;
  const suggestedPrompt = activeGeneration?.suggested_edit_prompt ?? "";

  // Reset the editable prompt whenever a different look is in view.
  useEffect(() => {
    setEditPrompt(suggestedPrompt);
  }, [activeUid, suggestedPrompt]);

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

  if (loading || regenerating) {
    const label = progressLabel ?? (regenerating ? "Applying edit" : null);
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-6">
        <div className="relative">
          <div className="h-20 w-20 rounded-full border-4 border-muted" />
          <Loader2 className="absolute inset-0 h-20 w-20 animate-spin text-primary" />
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-xl font-semibold">
            {loadingTitle ??
              (regenerating ? "Applying your edit..." : "Generating your try-on images...")}
          </h2>
          {label && <p className="text-sm font-medium text-primary">{label}</p>}
          {!loadingTitle && (
            <p className="text-sm text-muted-foreground">This may take some time. Please don't close this page.</p>
          )}
        </div>
      </div>
    );
  }

  if (!results) return null;

  const generations = draft?.generations ?? [];
  const total = draft?.max_generations ?? 0;
  const includedEdits = complementaryEditsIncluded(total);
  const editsLeft = complementaryEditsLeft(draft?.generations_used ?? generations.length, total);
  const activeIndex = generations.findIndex((gen) => gen.uid === activeUid);
  const canGoPrev = activeIndex > 0;
  const canGoNext = activeIndex >= 0 && activeIndex < generations.length - 1;
  const mismatches = activeGeneration?.mismatches ?? [];
  const tweakSummary = joinTweaks(mismatches);
  const canRegenerate = Boolean(draft?.can_regenerate) && Boolean(onRegenerate);
  const isSaved = Boolean(activeGeneration?.saved);
  const showPager = generations.length > 1;

  const imageItems: Array<{ label: string; url: string; s3Key: string; file: string }> = [
    {
      label: "Front View",
      url: results.front,
      s3Key: results.frontKey,
      file: "tryon-front.png",
    },
    ...(results.closeUp && results.closeUpKey
      ? [
          {
            label: "Close-Up View",
            url: results.closeUp,
            s3Key: results.closeUpKey,
            file: "tryon-close-up.png",
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="ghost" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> {backLabel}
        </Button>
        <AddToCataloguePanel
          token={token}
          analysis={results.analysis}
          images={imageItems.map((i) => ({ url: i.url, s3Key: i.s3Key }))}
        />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base">This look</CardTitle>
            {showPager ? (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  disabled={!canGoPrev}
                  onClick={() => onSelectGeneration?.(generations[activeIndex - 1].uid)}
                  title="Previous look"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm text-muted-foreground">
                  Look {activeIndex + 1} of {generations.length}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  disabled={!canGoNext}
                  onClick={() => onSelectGeneration?.(generations[activeIndex + 1].uid)}
                  title="Next look"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          <div className={`grid gap-6 ${results.closeUp && results.closeUpKey ? "md:grid-cols-2" : "md:max-w-lg"}`}>
            {imageItems.map((item) => (
              <div key={item.label} className="space-y-3">
                <p className="text-sm font-medium text-muted-foreground">{item.label}</p>
                <div className="group relative overflow-hidden rounded-lg border shadow-sm">
                  <img src={item.url} alt={item.label} className="w-full transition group-hover:scale-[1.01]" />
                  <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                    {onEditImage && (
                      <button
                        onClick={() => onEditImage(item.s3Key, item.url)}
                        className="rounded-full bg-background/80 p-1.5 shadow hover:bg-background"
                        title="Edit image"
                      >
                        <Pencil className="h-4 w-4 text-foreground" />
                      </button>
                    )}
                    {onChangeColour && (
                      <button
                        onClick={() => onChangeColour(item.s3Key, item.url)}
                        className="rounded-full bg-background/80 p-1.5 shadow hover:bg-background"
                        title="Change colour"
                      >
                        <Palette className="h-4 w-4 text-foreground" />
                      </button>
                    )}
                    {onManualPhotoEdit && (
                      <button
                        onClick={() => onManualPhotoEdit(item.s3Key, item.url)}
                        className="rounded-full bg-background/80 p-1.5 shadow hover:bg-background"
                        title="Manual photo editing"
                      >
                        <SlidersHorizontal className="h-4 w-4 text-foreground" />
                      </button>
                    )}
                    {onChangeLength && (
                      <button
                        onClick={() => onChangeLength(item.s3Key, item.url)}
                        className="rounded-full bg-background/80 p-1.5 shadow hover:bg-background"
                        title="Change length"
                      >
                        <Scissors className="h-4 w-4 text-foreground" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 gap-2"
                    onClick={() => handleDownload(item.s3Key, item.file)}
                    disabled={!token}
                  >
                    <Download className="h-4 w-4" /> Download {item.label}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {draft && activeGeneration && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {canRegenerate ? "Want a change?" : "Edits used"}
            </CardTitle>
            <p className="text-sm text-muted-foreground">{editsLeftLabel(editsLeft, includedEdits)}</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {activeGeneration.applied_edit_prompt && (
              <div className="rounded-md border bg-muted/30 p-3">
                <p className="text-xs font-medium text-muted-foreground">This look used your last edit</p>
                <p className="mt-1 text-sm">{activeGeneration.applied_edit_prompt}</p>
              </div>
            )}

            {canRegenerate ? (
              <div className="space-y-3">
                {tweakSummary ? (
                  <p className="text-sm">
                    Suggested tweaks: {tweakSummary}.
                    {activeGeneration.notes ? ` ${activeGeneration.notes}` : ""}
                  </p>
                ) : activeGeneration.notes ? (
                  <p className="text-sm text-muted-foreground">{activeGeneration.notes}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    If you’re not happy with this look, describe a change below.
                  </p>
                )}
                <div className="space-y-2">
                  <Label htmlFor="edit-prompt">
                    {suggestedPrompt ? "Suggested edit — change it if you want" : "Describe the change you want"}
                  </Label>
                  <Textarea
                    id="edit-prompt"
                    value={editPrompt}
                    onChange={(e) => setEditPrompt(e.target.value)}
                    placeholder="e.g. Scale the pendant down slightly and match the metal tone to the reference."
                    className="min-h-[104px]"
                  />
                  <p className="text-xs text-muted-foreground">
                    Applies to the look you’re viewing and saves the new version to this shoot.
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    className="gap-2"
                    disabled={!editPrompt.trim() || regenerating}
                    onClick={() => onRegenerate?.(editPrompt.trim())}
                  >
                    <RefreshCw className="h-4 w-4" /> Apply this edit
                  </Button>
                  {onSaveGeneration && !isSaved && (
                    <Button variant="outline" className="gap-2" disabled={saving} onClick={onSaveGeneration}>
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Retry saving to gallery
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Start a new shoot if you want another change.</p>
                {onSaveGeneration && !isSaved && (
                  <Button variant="outline" className="gap-2" disabled={saving} onClick={onSaveGeneration}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Retry saving to gallery
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
