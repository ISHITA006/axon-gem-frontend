import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Pencil,
  RefreshCw,
  Save,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ManualEditTool } from "@/components/ManualPhotoEditor";
import { JewelleryReferencePicker, type JewelleryReferencePickerValue } from "@/components/JewelleryReferencePicker";
import {
  downloadImage,
  type JewelleryReferenceChange,
  type ProductShootDraft,
  type ProductShootGeneration,
  type ProductShootView,
  type StudioShootResult,
} from "@/lib/api";
import {
  COMPLEMENTARY_EDITS_PER_VIEW,
  productShootEditsSummary,
  productShootViewBudget,
} from "@/lib/modelShootCopy";
import { useToast } from "@/hooks/use-toast";

interface StudioShootResultsProps {
  loading: boolean;
  results: StudioShootResult | null;
  onBack: () => void;
  token: string | null;
  backLabel?: string;
  loadingTitle?: string;
  draft?: ProductShootDraft | null;
  activeGeneration?: ProductShootGeneration | null;
  onSelectGeneration?: (generationUid: string) => void;
  onRegenerate?: (
    editPrompt: string,
    editView: ProductShootView,
    jewelleryReference?: JewelleryReferenceChange
  ) => void;
  onSaveGeneration?: () => void;
  regenerating?: boolean;
  saving?: boolean;
  progressLabel?: string | null;
  onEditImage?: (s3Key: string, imageUrl: string) => void;
  onManualPhotoEdit?: (s3Key: string, imageUrl: string, initialTool?: ManualEditTool) => void;
}

const MISMATCH_LABELS: Record<string, string> = {
  stone_count_match: "stone count",
  stone_color_match: "stone colour",
  metal_color_match: "metal tone",
  component_count_match: "component count",
  setting_match: "setting",
  design_match: "design",
  component_layout_match: "layout",
  sizes_of_all_components_match: "component sizes",
  size_ratio_of_components_match: "component proportions",
  no_extraneous_elements: "extra items",
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

function viewEditState(
  generation: ProductShootGeneration | null | undefined,
  view: ProductShootView,
  bothViews: boolean
) {
  const suggested =
    (view === "front" ? generation?.front_suggested_edit_prompt : generation?.side_suggested_edit_prompt) ||
    (!bothViews ? generation?.suggested_edit_prompt : "") ||
    "";
  const mismatches =
    (view === "front" ? generation?.front_mismatches : generation?.side_mismatches) ||
    (!bothViews ? generation?.mismatches : []) ||
    [];
  const notes =
    (view === "front" ? generation?.front_notes : generation?.side_notes) ||
    (!bothViews ? generation?.notes : null);
  const applied =
    (view === "front" ? generation?.front_applied_edit_prompt : generation?.side_applied_edit_prompt) ||
    (generation?.edited_view === view ? generation?.applied_edit_prompt : null) ||
    (!bothViews ? generation?.applied_edit_prompt : null);
  return { suggested, mismatches, notes: notes ?? null, applied: applied ?? null };
}

function ViewEditPanel({
  view,
  label,
  suggested,
  mismatches,
  notes,
  applied,
  prompt,
  onPromptChange,
  onApply,
  regenerating,
  bothViews,
  canApply,
  remaining,
}: {
  view: ProductShootView;
  label?: string;
  suggested: string;
  mismatches: string[];
  notes: string | null;
  applied: string | null;
  prompt: string;
  onPromptChange: (value: string) => void;
  onApply: (jewelleryReference?: JewelleryReferenceChange) => void;
  regenerating: boolean;
  bothViews: boolean;
  canApply: boolean;
  remaining: number;
}) {
  const tweakSummary = joinTweaks(mismatches);
  const inputId = `product-edit-prompt-${view}`;
  const applyLabel = bothViews
    ? view === "front"
      ? "Apply front edit"
      : "Apply side edit"
    : "Apply this edit";
  const viewName = `${view} view`;
  const [jewelleryReference, setJewelleryReference] = useState<JewelleryReferencePickerValue>({
    mode: "keep",
    file: null,
  });
  const needsReferenceFile = jewelleryReference.mode !== "keep";
  const canSubmit =
    Boolean(prompt.trim()) && (!needsReferenceFile || Boolean(jewelleryReference.file)) && !regenerating;

  const handleApply = () => {
    if (!canSubmit) return;
    const change: JewelleryReferenceChange | undefined =
      jewelleryReference.mode !== "keep" && jewelleryReference.file
        ? { mode: jewelleryReference.mode, file: jewelleryReference.file }
        : undefined;
    onApply(change);
  };

  return (
    <div className="space-y-3">
      {label ? <p className="text-sm font-medium">{label}</p> : null}
      {applied && (
        <div className="rounded-md border bg-muted/30 p-3">
          <p className="text-xs font-medium text-muted-foreground">
            {bothViews
              ? `This ${view} view used your last edit`
              : "This look used your last edit"}
          </p>
          <p className="mt-1 text-sm">{applied}</p>
        </div>
      )}
      {!canApply ? (
        <p className="text-sm text-muted-foreground">
          Both complementary edits on this {viewName} have been used.
        </p>
      ) : (
        <>
          {tweakSummary ? (
            <p className="text-sm">
              Suggested tweaks: {tweakSummary}.
              {notes ? ` ${notes}` : ""}
            </p>
          ) : notes ? (
            <p className="text-sm text-muted-foreground">{notes}</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              If you’re not happy with this {bothViews ? viewName : "look"}, describe a change below.
            </p>
          )}
          <div className="space-y-2">
            <Label htmlFor={inputId}>
              {suggested ? "Suggested edit — change it if you want" : "Describe the change you want"}
            </Label>
            <Textarea
              id={inputId}
              value={prompt}
              onChange={(e) => onPromptChange(e.target.value)}
              placeholder="e.g. Match the stone count to the reference and keep the metal tone warm."
              className="min-h-[104px]"
            />
            <p className="text-xs text-muted-foreground">
              {bothViews
                ? `Applies only to the ${view} view you’re seeing and saves that new image to this shoot.`
                : "Applies to the look you’re viewing and saves the new version to this shoot."}
              {remaining === 1
                ? " 1 complementary edit left on this view."
                : remaining < COMPLEMENTARY_EDITS_PER_VIEW
                  ? ` ${remaining} complementary edits left on this view.`
                  : ""}
            </p>
          </div>
          <JewelleryReferencePicker
            id={`product-jewellery-ref-${view}`}
            value={jewelleryReference}
            onChange={setJewelleryReference}
          />
          <Button className="gap-2" disabled={!canSubmit} onClick={handleApply}>
            <RefreshCw className="h-4 w-4" /> {applyLabel}
          </Button>
        </>
      )}
    </div>
  );
}

export default function StudioShootResults({
  loading,
  results,
  onBack,
  token,
  backLabel = "Back to Studio Shoot",
  loadingTitle,
  draft,
  activeGeneration,
  onSelectGeneration,
  onRegenerate,
  onSaveGeneration,
  regenerating = false,
  saving = false,
  progressLabel,
  onEditImage,
  onManualPhotoEdit,
}: StudioShootResultsProps) {
  const { toast } = useToast();
  const [frontPrompt, setFrontPrompt] = useState("");
  const [sidePrompt, setSidePrompt] = useState("");

  const activeUid = activeGeneration?.uid ?? null;
  const hasFront = Boolean(results?.frontImageS3Key && results.frontImageUrl);
  const hasSide = Boolean(results?.sideImageS3Key && results.sideImageUrl);
  const bothViews = hasFront && hasSide;
  const frontEdit = viewEditState(activeGeneration, "front", bothViews);
  const sideEdit = viewEditState(activeGeneration, "side", bothViews);

  useEffect(() => {
    setFrontPrompt(frontEdit.suggested);
    setSidePrompt(sideEdit.suggested);
  }, [activeUid, frontEdit.suggested, sideEdit.suggested]);

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

  const imageItems = useMemo(() => {
    const items: Array<{ label: string; url: string; s3Key: string; file: string }> = [];
    if (results?.frontImageS3Key && results.frontImageUrl) {
      items.push({
        label: "Front View",
        url: results.frontImageUrl,
        s3Key: results.frontImageS3Key,
        file: "studio-shoot-front.png",
      });
    }
    if (results?.sideImageS3Key && results.sideImageUrl) {
      items.push({
        label: "Side View",
        url: results.sideImageUrl,
        s3Key: results.sideImageS3Key,
        file: "studio-shoot-side.png",
      });
    }
    return items;
  }, [results]);

  if (loading || regenerating) {
    const label = progressLabel ?? (regenerating ? "Applying edit" : null);
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center space-y-6">
        <div className="relative">
          <div className="h-20 w-20 rounded-full border-4 border-muted" />
          <Loader2 className="absolute inset-0 h-20 w-20 animate-spin text-primary" />
        </div>
        <div className="space-y-2 text-center">
          <h2 className="text-xl font-semibold">
            {loadingTitle ??
              (regenerating ? "Applying your edit..." : "Generating your studio shoot images...")}
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
  const budget = productShootViewBudget(draft);
  const activeIndex = generations.findIndex((gen) => gen.uid === activeUid);
  const canGoPrev = activeIndex > 0;
  const canGoNext = activeIndex >= 0 && activeIndex < generations.length - 1;
  const canRegenerate = budget.canRegenerate && Boolean(onRegenerate);
  const isSaved = Boolean(activeGeneration?.saved);
  const showPager = generations.length > 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="ghost" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> {backLabel}
        </Button>
      </div>

      {results.status === "partial" && (results.frontError || results.sideError) && (
        <Card className="border-amber-200/70 bg-amber-50/50">
          <CardContent className="space-y-1 pt-6 text-sm text-amber-800">
            {results.frontError && <p>Front view: {results.frontError}</p>}
            {results.sideError && <p>Side view: {results.sideError}</p>}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base">
              {draft ? "This look" : "Generated Studio Shoot Images"}
            </CardTitle>
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
          <div className={`grid gap-6 ${imageItems.length > 1 ? "md:grid-cols-2" : "md:max-w-lg"}`}>
            {imageItems.map((item) => (
              <div key={item.label} className="space-y-3">
                <p className="text-sm font-medium text-muted-foreground">{item.label}</p>
                <div className="group relative overflow-hidden rounded-lg border shadow-sm">
                  <img src={item.url} alt={item.label} className="w-full object-contain" />
                  <div className="absolute right-2 top-2 flex gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                    {onEditImage && (
                      <button
                        onClick={() => onEditImage(item.s3Key, item.url)}
                        className="rounded-full bg-background/80 p-1.5 shadow hover:bg-background"
                        title="Edit image"
                      >
                        <Pencil className="h-4 w-4 text-foreground" />
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
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-2"
                  onClick={() => handleDownload(item.s3Key, item.file)}
                  disabled={!token}
                >
                  <Download className="h-4 w-4" /> Download {item.label}
                </Button>
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
            <p className="text-sm text-muted-foreground">
              {productShootEditsSummary({
                views: bothViews ? "both" : hasSide && !hasFront ? "side" : "front",
                frontRemaining: budget.frontRemaining,
                sideRemaining: budget.sideRemaining,
              })}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {canRegenerate ? (
              <div className={bothViews ? "grid gap-6 md:grid-cols-2" : "space-y-3"}>
                {hasFront ? (
                  <ViewEditPanel
                    key={`${activeUid}-front`}
                    view="front"
                    label={bothViews ? "Front view" : undefined}
                    suggested={frontEdit.suggested}
                    mismatches={frontEdit.mismatches}
                    notes={frontEdit.notes}
                    applied={frontEdit.applied}
                    prompt={frontPrompt}
                    onPromptChange={setFrontPrompt}
                    onApply={(jewelleryReference) =>
                      jewelleryReference
                        ? onRegenerate?.(frontPrompt.trim(), "front", jewelleryReference)
                        : onRegenerate?.(frontPrompt.trim(), "front")
                    }
                    regenerating={regenerating}
                    bothViews={bothViews}
                    canApply={budget.canRegenerateFront}
                    remaining={budget.frontRemaining}
                  />
                ) : null}
                {hasSide ? (
                  <ViewEditPanel
                    key={`${activeUid}-side`}
                    view="side"
                    label={bothViews ? "Side view" : undefined}
                    suggested={sideEdit.suggested}
                    mismatches={sideEdit.mismatches}
                    notes={sideEdit.notes}
                    applied={sideEdit.applied}
                    prompt={sidePrompt}
                    onPromptChange={setSidePrompt}
                    onApply={(jewelleryReference) =>
                      jewelleryReference
                        ? onRegenerate?.(sidePrompt.trim(), "side", jewelleryReference)
                        : onRegenerate?.(sidePrompt.trim(), "side")
                    }
                    regenerating={regenerating}
                    bothViews={bothViews}
                    canApply={budget.canRegenerateSide}
                    remaining={budget.sideRemaining}
                  />
                ) : null}
                {onSaveGeneration && !isSaved && (
                  <div className={bothViews ? "md:col-span-2" : undefined}>
                    <Button variant="outline" className="gap-2" disabled={saving} onClick={onSaveGeneration}>
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Retry saving to gallery
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {frontEdit.applied || sideEdit.applied || activeGeneration.applied_edit_prompt ? (
                  <div className="space-y-2">
                    {frontEdit.applied && (
                      <div className="rounded-md border bg-muted/30 p-3">
                        <p className="text-xs font-medium text-muted-foreground">Front view used this edit</p>
                        <p className="mt-1 text-sm">{frontEdit.applied}</p>
                      </div>
                    )}
                    {sideEdit.applied && (
                      <div className="rounded-md border bg-muted/30 p-3">
                        <p className="text-xs font-medium text-muted-foreground">Side view used this edit</p>
                        <p className="mt-1 text-sm">{sideEdit.applied}</p>
                      </div>
                    )}
                  </div>
                ) : null}
                <p className="text-sm text-muted-foreground">Start a new edit session if you want another change.</p>
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
