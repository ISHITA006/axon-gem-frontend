import { useEffect, useState } from "react";
import {
  Download,
  ArrowLeft,
  Loader2,
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
import {
  downloadImage,
  type ModelShootDraft,
  type ModelShootGeneration,
  type ModelShootView,
  type TryOnAnalysis,
} from "@/lib/api";
import {
  COMPLEMENTARY_EDITS_PER_VIEW,
  modelShootEditsSummary,
  modelShootViewBudget,
  resolveModelShootViews,
} from "@/lib/modelShootCopy";
import { useToast } from "@/hooks/use-toast";

interface TryOnResultsProps {
  loading: boolean;
  results: {
    front?: string;
    closeUp?: string;
    frontKey?: string;
    closeUpKey?: string;
    analysis?: TryOnAnalysis | null;
  } | null;
  onBack: () => void;
  token: string | null;
  onEditImage?: (s3Key: string, imageUrl: string) => void;
  onManualPhotoEdit?: (s3Key: string, imageUrl: string, initialTool?: ManualEditTool) => void;
  /** Review session holding every generation for this shoot. */
  draft?: ModelShootDraft | null;
  activeGeneration?: ModelShootGeneration | null;
  onSelectGeneration?: (generationUid: string) => void;
  /** Called with the (possibly user-edited) prompt when an edit is applied to one view. */
  onRegenerate?: (editPrompt: string, editView: ModelShootView) => void;
  onSaveGeneration?: () => void;
  regenerating?: boolean;
  saving?: boolean;
  /** Progress label shown while an edit is running, e.g. "Regular view · Edit 1 of 2". */
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

function viewLabel(view: ModelShootView): string {
  return view === "front" ? "regular view" : "close-up view";
}

function viewEditState(
  generation: ModelShootGeneration | null | undefined,
  view: ModelShootView,
  bothViews: boolean
) {
  const suggested =
    (view === "front" ? generation?.front_suggested_edit_prompt : generation?.close_up_suggested_edit_prompt) ||
    (!bothViews ? generation?.suggested_edit_prompt : "") ||
    "";
  const mismatches =
    (view === "front" ? generation?.front_mismatches : generation?.close_up_mismatches) ||
    (!bothViews ? generation?.mismatches : []) ||
    [];
  const notes =
    (view === "front" ? generation?.front_notes : generation?.close_up_notes) ||
    (!bothViews ? generation?.notes : null);
  const applied =
    (view === "front" ? generation?.front_applied_edit_prompt : generation?.close_up_applied_edit_prompt) ||
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
  view: ModelShootView;
  label?: string;
  suggested: string;
  mismatches: string[];
  notes: string | null;
  applied: string | null;
  prompt: string;
  onPromptChange: (value: string) => void;
  onApply: () => void;
  regenerating: boolean;
  bothViews: boolean;
  canApply: boolean;
  remaining: number;
}) {
  const tweakSummary = joinTweaks(mismatches);
  const inputId = `model-edit-prompt-${view}`;
  const applyLabel = bothViews
    ? view === "front"
      ? "Apply regular edit"
      : "Apply close-up edit"
    : "Apply this edit";
  const name = viewLabel(view);
  return (
    <div className="space-y-3">
      {label ? <p className="text-sm font-medium">{label}</p> : null}
      {applied && (
        <div className="rounded-md border bg-muted/30 p-3">
          <p className="text-xs font-medium text-muted-foreground">
            {bothViews ? `This ${name} used your last edit` : "This look used your last edit"}
          </p>
          <p className="mt-1 text-sm">{applied}</p>
        </div>
      )}
      {!canApply ? (
        <p className="text-sm text-muted-foreground">
          Both complementary edits on this {name} have been used.
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
              If you’re not happy with this {bothViews ? name : "look"}, describe a change below.
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
              placeholder="e.g. Scale the pendant down slightly and match the metal tone to the reference."
              className="min-h-[104px]"
            />
            <p className="text-xs text-muted-foreground">
              {bothViews
                ? `Applies only to the ${name} you’re seeing and saves that new image to this shoot.`
                : "Applies to the look you’re viewing and saves the new version to this shoot."}
              {remaining === 1
                ? " 1 complementary edit left on this view."
                : remaining < COMPLEMENTARY_EDITS_PER_VIEW
                  ? ` ${remaining} complementary edits left on this view.`
                  : ""}
            </p>
          </div>
          <Button className="gap-2" disabled={!prompt.trim() || regenerating} onClick={onApply}>
            <RefreshCw className="h-4 w-4" /> {applyLabel}
          </Button>
        </>
      )}
    </div>
  );
}

export default function TryOnResults({
  loading,
  results,
  onBack,
  token,
  onEditImage,
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
  const [frontPrompt, setFrontPrompt] = useState("");
  const [closeUpPrompt, setCloseUpPrompt] = useState("");

  const activeUid = activeGeneration?.uid ?? null;
  const hasFront = Boolean(results?.front && results.frontKey);
  const hasCloseUp = Boolean(results?.closeUp && results.closeUpKey);
  const bothViews = hasFront && hasCloseUp;
  const frontEdit = viewEditState(activeGeneration, "front", bothViews);
  const closeUpEdit = viewEditState(activeGeneration, "close_up", bothViews);

  useEffect(() => {
    setFrontPrompt(frontEdit.suggested);
    setCloseUpPrompt(closeUpEdit.suggested);
  }, [activeUid, frontEdit.suggested, closeUpEdit.suggested]);

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
  const budget = modelShootViewBudget(draft);
  const activeIndex = generations.findIndex((gen) => gen.uid === activeUid);
  const canGoPrev = activeIndex > 0;
  const canGoNext = activeIndex >= 0 && activeIndex < generations.length - 1;
  const canRegenerate = budget.canRegenerate && Boolean(onRegenerate);
  const isSaved = Boolean(activeGeneration?.saved);
  const showPager = generations.length > 1;

  const imageItems: Array<{ label: string; url: string; s3Key: string; file: string }> = [
    ...(hasFront && results.front && results.frontKey
      ? [
          {
            label: "Regular View",
            url: results.front,
            s3Key: results.frontKey,
            file: "tryon-front.png",
          },
        ]
      : []),
    ...(hasCloseUp && results.closeUp && results.closeUpKey
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
          <div className={`grid gap-6 ${bothViews ? "md:grid-cols-2" : "md:max-w-lg"}`}>
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
            <p className="text-sm text-muted-foreground">
              {modelShootEditsSummary({
                views: resolveModelShootViews(draft.views, draft.generations),
                frontRemaining: budget.frontRemaining,
                closeUpRemaining: budget.closeUpRemaining,
              })}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {canRegenerate ? (
              <div className={bothViews ? "grid gap-6 md:grid-cols-2" : "space-y-3"}>
                {hasFront ? (
                  <ViewEditPanel
                    view="front"
                    label={bothViews ? "Regular view" : undefined}
                    suggested={frontEdit.suggested}
                    mismatches={frontEdit.mismatches}
                    notes={frontEdit.notes}
                    applied={frontEdit.applied}
                    prompt={frontPrompt}
                    onPromptChange={setFrontPrompt}
                    onApply={() => onRegenerate?.(frontPrompt.trim(), "front")}
                    regenerating={regenerating}
                    bothViews={bothViews}
                    canApply={budget.canRegenerateFront}
                    remaining={budget.frontRemaining}
                  />
                ) : null}
                {hasCloseUp ? (
                  <ViewEditPanel
                    view="close_up"
                    label={bothViews ? "Close-up view" : undefined}
                    suggested={closeUpEdit.suggested}
                    mismatches={closeUpEdit.mismatches}
                    notes={closeUpEdit.notes}
                    applied={closeUpEdit.applied}
                    prompt={closeUpPrompt}
                    onPromptChange={setCloseUpPrompt}
                    onApply={() => onRegenerate?.(closeUpPrompt.trim(), "close_up")}
                    regenerating={regenerating}
                    bothViews={bothViews}
                    canApply={budget.canRegenerateCloseUp}
                    remaining={budget.closeUpRemaining}
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
                {frontEdit.applied || closeUpEdit.applied || activeGeneration.applied_edit_prompt ? (
                  <div className="space-y-2">
                    {frontEdit.applied && (
                      <div className="rounded-md border bg-muted/30 p-3">
                        <p className="text-xs font-medium text-muted-foreground">
                          {bothViews ? "Regular view used this edit" : "This look used your last edit"}
                        </p>
                        <p className="mt-1 text-sm">{frontEdit.applied}</p>
                      </div>
                    )}
                    {closeUpEdit.applied && (
                      <div className="rounded-md border bg-muted/30 p-3">
                        <p className="text-xs font-medium text-muted-foreground">Close-up view used this edit</p>
                        <p className="mt-1 text-sm">{closeUpEdit.applied}</p>
                      </div>
                    )}
                  </div>
                ) : null}
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
