import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import StudioShootResults from "@/components/StudioShootResults";
import QueuedConfirmation, { queuedNoticeFromJob, type QueuedNotice } from "@/components/QueuedConfirmation";
import type { ManualEditTool } from "@/components/ManualPhotoEditor";
import type { VideoCampaignSource } from "@/components/VideoCampaignForm";
import { useToast } from "@/hooks/use-toast";
import { useGenerationQueueOptional } from "@/contexts/GenerationQueueContext";
import {
  apiGetProductShootDraft,
  apiRegenerateProductShoot,
  apiSaveProductShootDraft,
  getPresignedUrl,
  type JewelleryReferenceChange,
  type ProductShootDraft,
  type ProductShootGeneration,
  type StudioShootResult,
} from "@/lib/api";
import {
  ensureGenerationNotifyPermission,
  notifyGenerationError,
} from "@/lib/generationNotify";
import { applyViewEditProgressLabel, productShootViewBudget } from "@/lib/modelShootCopy";

type Props = {
  draftUid: string;
  token: string | null;
  onBack: () => void;
  backLabel?: string;
  initialDraft?: ProductShootDraft | null;
  initialResults?: StudioShootResult | null;
  initialGenerationUid?: string | null;
  loading?: boolean;
  isActive?: boolean;
  onEditImage?: (s3Key: string, imageUrl: string) => void;
  onManualPhotoEdit?: (s3Key: string, imageUrl: string, initialTool?: ManualEditTool) => void;
  onOpenVideoShoot?: (source: VideoCampaignSource) => void;
  onDraftChange?: (draft: ProductShootDraft) => void;
  onViewQueue?: () => void;
};

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong. Please try again.";
}

async function resultsFromGeneration(
  token: string,
  generation: ProductShootGeneration,
  status: StudioShootResult["status"] = "success"
): Promise<StudioShootResult> {
  const frontKey = generation.front_image_s3_key ?? undefined;
  const sideKey = generation.side_image_s3_key ?? undefined;
  const frontUrl = frontKey ? await getPresignedUrl(token, frontKey) : null;
  const sideUrl = sideKey ? await getPresignedUrl(token, sideKey) : null;
  return {
    status,
    frontImageS3Key: frontKey ?? null,
    frontImageUrl: frontUrl,
    sideImageS3Key: sideKey ?? null,
    sideImageUrl: sideUrl,
    fidelity_verified: generation.fidelity_verified,
    mismatches: generation.mismatches,
    notes: generation.notes,
    suggested_edit_prompt: generation.suggested_edit_prompt,
  };
}

export default function ProductShootReviewSession({
  draftUid,
  token,
  onBack,
  backLabel = "Back to Studio Shoot",
  initialDraft = null,
  initialResults = null,
  initialGenerationUid = null,
  loading = false,
  isActive = true,
  onEditImage,
  onManualPhotoEdit,
  onOpenVideoShoot,
  onDraftChange,
  onViewQueue,
}: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const queue = useGenerationQueueOptional();
  const [draft, setDraft] = useState<ProductShootDraft | null>(
    initialDraft?.uid === draftUid ? initialDraft : null
  );
  const [results, setResults] = useState<StudioShootResult | null>(
    initialDraft?.uid === draftUid ? initialResults : null
  );
  const [activeGenerationUid, setActiveGenerationUid] = useState<string | null>(
    initialGenerationUid ?? initialDraft?.latest_generation?.uid ?? null
  );
  const [regenerating, setRegenerating] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [progressLabel, setProgressLabel] = useState<string | null>(null);
  const [loadingDraft, setLoadingDraft] = useState(
    !initialDraft || initialDraft.uid !== draftUid || !initialResults
  );
  const [queuedNotice, setQueuedNotice] = useState<QueuedNotice | null>(null);
  const wasActiveRef = useRef(isActive);

  const activeGeneration = useMemo(() => {
    if (!draft) return null;
    return draft.generations.find((gen) => gen.uid === activeGenerationUid) ?? draft.latest_generation ?? null;
  }, [draft, activeGenerationUid]);

  const applyDraft = useCallback(
    (nextDraft: ProductShootDraft) => {
      setDraft(nextDraft);
      onDraftChange?.(nextDraft);
    },
    [onDraftChange]
  );

  const showGeneration = useCallback(
    async (generation: ProductShootGeneration) => {
      if (!token) return;
      const next = await resultsFromGeneration(token, generation);
      setActiveGenerationUid(generation.uid);
      setResults(next);
    },
    [token]
  );

  const loadDraft = useCallback(
    async (uid: string, preferredGenerationUid?: string | null) => {
      if (!token) return;
      const nextDraft = await apiGetProductShootDraft(token, uid);
      applyDraft(nextDraft);
      const generation =
        nextDraft.generations.find((gen) => gen.uid === preferredGenerationUid) ??
        nextDraft.latest_generation ??
        null;
      if (generation) {
        await showGeneration(generation);
      }
    },
    [token, applyDraft, showGeneration]
  );

  useEffect(() => {
    const becameActive = isActive && !wasActiveRef.current;
    wasActiveRef.current = isActive;
    if (!token || !draftUid || !isActive) return;
    const hasCurrentView = draft?.uid === draftUid && Boolean(results);
    if (hasCurrentView && !becameActive) return;
    let cancelled = false;
    setLoadingDraft(true);
    loadDraft(draftUid, activeGenerationUid)
      .catch((err) => {
        if (!cancelled) {
          toast({
            title: "Could not resume review",
            description: errorMessage(err),
            variant: "destructive",
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingDraft(false);
      });
    return () => {
      cancelled = true;
    };
    // Reload when the session becomes active again so gallery edits stay in sync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, draftUid, isActive]);

  const pendingEdit =
    queue?.jobs.some(
      (job) =>
        job.draft_uid === draftUid &&
        (job.status === "queued" || job.status === "processing") &&
        job.job_type === "product_shoot_edit"
    ) ?? false;

  const seenJobKeys = useRef<Set<string>>(new Set());
  const jobsPrimed = useRef(false);
  useEffect(() => {
    jobsPrimed.current = false;
    seenJobKeys.current.clear();
  }, [draftUid]);
  useEffect(() => {
    if (!queue) return;
    if (!jobsPrimed.current) {
      for (const job of queue.jobs) {
        seenJobKeys.current.add(`${job.uid}:${job.status}`);
      }
      jobsPrimed.current = true;
      return;
    }
    for (const job of queue.jobs) {
      if (job.draft_uid !== draftUid || job.job_type !== "product_shoot_edit") continue;
      const key = `${job.uid}:${job.status}`;
      if (seenJobKeys.current.has(key)) continue;
      seenJobKeys.current.add(key);
      if (job.status === "completed") {
        void loadDraft(draftUid, job.generation_uid);
        setProgressLabel(null);
        void queryClient.invalidateQueries({ queryKey: ["gallery-items"] });
        void queryClient.invalidateQueries({ queryKey: ["gallery-products"] });
      }
      if (job.status === "failed") {
        setProgressLabel(null);
      }
    }
  }, [queue, queue?.jobs, draftUid, loadDraft, queryClient]);

  const handleSelectGeneration = async (generationUid: string) => {
    const generation = draft?.generations.find((gen) => gen.uid === generationUid);
    if (!generation) return;
    try {
      await showGeneration(generation);
    } catch (err) {
      toast({ title: "Could not load generation", description: errorMessage(err), variant: "destructive" });
    }
  };

  const handleRegenerate = async (
    editPrompt: string,
    editView: "front" | "side",
    jewelleryReference?: JewelleryReferenceChange
  ) => {
    if (!token || !draft || !activeGenerationUid) return;
    setRegenerating(true);
    void ensureGenerationNotifyPermission();
    const viewLabel = editView === "front" ? "Front view" : "Side view";
    const budget = productShootViewBudget(draft);
    setProgressLabel(
      `${viewLabel} · ${applyViewEditProgressLabel(
        editView === "front" ? budget.frontUsed : budget.sideUsed
      )}`
    );
    try {
      const job = jewelleryReference
        ? await apiRegenerateProductShoot(
            token,
            draft.uid,
            editPrompt,
            activeGenerationUid,
            editView,
            jewelleryReference
          )
        : await apiRegenerateProductShoot(token, draft.uid, editPrompt, activeGenerationUid, editView);
      queue?.trackJob(job);
      setQueuedNotice(queuedNoticeFromJob(job.title, false));
    } catch (err) {
      const failTitle = "Could not queue this edit";
      const failBody = errorMessage(err);
      toast({ title: failTitle, description: failBody, variant: "destructive" });
      notifyGenerationError(failTitle, failBody);
      setProgressLabel(null);
    } finally {
      setRegenerating(false);
    }
  };

  const handleSaveGeneration = async () => {
    if (!token || !draft || !activeGenerationUid) return;
    setSavingDraft(true);
    try {
      const data = await apiSaveProductShootDraft(token, draft.uid, activeGenerationUid);
      applyDraft(data.draft);
      await queryClient.invalidateQueries({ queryKey: ["gallery-items"] });
      await queryClient.invalidateQueries({ queryKey: ["gallery-products"] });
      toast({ title: "Saved", description: "This look is now in your product-shoot gallery." });
    } catch (err) {
      toast({ title: "Could not save", description: errorMessage(err), variant: "destructive" });
    } finally {
      setSavingDraft(false);
    }
  };

  return (
    <div className="space-y-6">
      <QueuedConfirmation
        notice={queuedNotice}
        onNoticeChange={setQueuedNotice}
        onViewQueue={onViewQueue}
      />
    <StudioShootResults
      loading={loading || loadingDraft}
      results={results}
      onBack={onBack}
      backLabel={backLabel}
      token={token}
      draft={draft}
      activeGeneration={activeGeneration}
      onSelectGeneration={handleSelectGeneration}
      onRegenerate={handleRegenerate}
      onSaveGeneration={handleSaveGeneration}
      regenerating={regenerating || pendingEdit}
      saving={savingDraft}
      progressLabel={progressLabel}
      loadingTitle={loadingDraft && !loading && !regenerating ? "Loading..." : undefined}
      onEditImage={onEditImage}
      onManualPhotoEdit={onManualPhotoEdit}
      onOpenVideoShoot={onOpenVideoShoot}
    />
    </div>
  );
}
