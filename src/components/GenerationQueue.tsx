import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  ImageIcon,
  Images,
  ListOrdered,
  Loader2,
  PauseCircle,
  RotateCw,
  Wand2,
  XCircle,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useGenerationQueue } from "@/contexts/GenerationQueueContext";
import { useToast } from "@/hooks/use-toast";
import {
  generationJobDraftUid,
  generationJobResultS3Key,
  generationJobThumbnails,
  getPresignedUrl,
  type GenerationJob,
  type GenerationJobStatus,
  type GenerationJobThumbnail,
} from "@/lib/api";
import ModelShootReviewSession from "@/components/ModelShootReviewSession";
import ProductShootReviewSession from "@/components/ProductShootReviewSession";
import type { ManualEditTool } from "@/components/ManualPhotoEditor";
import type { VideoCampaignSource } from "@/components/VideoCampaignForm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  onEditImage?: (s3Key: string, imageUrl: string) => void;
  onManualPhotoEdit?: (s3Key: string, imageUrl: string, initialTool?: ManualEditTool) => void;
  onOpenVideoShoot?: (source: VideoCampaignSource) => void;
  onOpenModelPoses?: () => void;
  onOpenGallery?: () => void;
};

const STATUS_LABEL: Record<GenerationJobStatus, string> = {
  queued: "Queued",
  processing: "Processing",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

function statusVariant(status: GenerationJobStatus): "default" | "secondary" | "destructive" | "outline" {
  if (status === "completed") return "default";
  if (status === "processing") return "secondary";
  if (status === "failed") return "destructive";
  return "outline";
}

function formatTime(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
}

function isShootJob(job: GenerationJob): boolean {
  return (
    job.job_type === "model_shoot" ||
    job.job_type === "model_shoot_edit" ||
    job.job_type === "product_shoot" ||
    job.job_type === "product_shoot_edit"
  );
}

const THUMBNAIL_SLOTS = 2;

function ThumbnailFace({
  item,
  urls,
}: {
  item?: GenerationJobThumbnail;
  urls: Record<string, string>;
}) {
  const url = item ? urls[item.s3_key] : undefined;
  if (item && url) {
    return <img src={url} alt={item.label} className="h-full w-full object-cover" />;
  }
  return (
    <div className="flex h-full w-full items-center justify-center bg-muted">
      <ImageIcon className="h-5 w-5 text-muted-foreground" />
    </div>
  );
}

function JobThumbnails({
  items,
  urls,
}: {
  items: GenerationJobThumbnail[];
  urls: Record<string, string>;
}) {
  const slots = items.slice(0, THUMBNAIL_SLOTS);
  return (
    <div className="w-full">
      <div className="aspect-square w-full overflow-hidden rounded-md border bg-muted">
        {slots.length <= 1 ? (
          <ThumbnailFace item={slots[0]} urls={urls} />
        ) : (
          <div className="grid h-full grid-cols-2 divide-x divide-border">
            {slots.map((item) => (
              <ThumbnailFace key={`${item.label}:${item.s3_key}`} item={item} urls={urls} />
            ))}
          </div>
        )}
      </div>
      <div className={`mt-1 grid h-3 gap-1 ${slots.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
        {(slots.length > 0 ? slots : [{ label: "", s3_key: "" }]).map((item, index) => (
          <p
            key={item.s3_key || `label-${index}`}
            className="truncate text-center text-[10px] leading-tight text-muted-foreground"
          >
            {item.label}
          </p>
        ))}
      </div>
    </div>
  );
}

export default function GenerationQueue({
  onEditImage,
  onManualPhotoEdit,
  onOpenVideoShoot,
  onOpenModelPoses,
  onOpenGallery,
}: Props) {
  const { token } = useAuth();
  const { toast } = useToast();
  const { jobs, maxConcurrent, processingCount, queuedCount, completedVisibleLimit, cancelJob, refresh } =
    useGenerationQueue();
  const [selected, setSelected] = useState<GenerationJob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cancellingUid, setCancellingUid] = useState<string | null>(null);
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<string, string>>({});
  const fetchedThumbnailKeys = useRef<Set<string>>(new Set());

  const thumbnailKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const job of jobs) {
      for (const item of generationJobThumbnails(job)) {
        keys.add(item.s3_key);
      }
    }
    return [...keys].sort();
  }, [jobs]);

  useEffect(() => {
    if (!token) return;
    const missing = thumbnailKeys.filter((key) => !fetchedThumbnailKeys.current.has(key));
    if (missing.length === 0) return;
    let cancelled = false;
    missing.forEach((key) => fetchedThumbnailKeys.current.add(key));
    void (async () => {
      const entries = await Promise.all(
        missing.map(async (key) => {
          try {
            return [key, await getPresignedUrl(token, key)] as const;
          } catch {
            return [key, ""] as const;
          }
        })
      );
      if (cancelled) return;
      setThumbnailUrls((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
    })();
    return () => {
      cancelled = true;
    };
  }, [thumbnailKeys, token]);

  const selectedDraftUid = selected ? generationJobDraftUid(selected) : null;

  useEffect(() => {
    let cancelled = false;
    const loadPreview = async () => {
      if (!token || !selected || selected.status !== "completed") {
        setPreviewUrl(null);
        return;
      }
      const key = generationJobResultS3Key(selected);
      if (!key) {
        setPreviewUrl(null);
        return;
      }
      try {
        const url = await getPresignedUrl(token, key);
        if (!cancelled) setPreviewUrl(url);
      } catch {
        if (!cancelled) setPreviewUrl(null);
      }
    };
    void loadPreview();
    return () => {
      cancelled = true;
    };
  }, [selected, token]);

  const liveSelected = useMemo(() => {
    if (!selected) return null;
    return jobs.find((job) => job.uid === selected.uid) ?? selected;
  }, [jobs, selected]);

  const handleCancel = async (job: GenerationJob) => {
    setCancellingUid(job.uid);
    try {
      await cancelJob(job.uid);
      toast({ title: "Cancelled", description: `${job.title} was removed from the queue.` });
    } catch (err) {
      toast({
        title: "Could not cancel",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setCancellingUid(null);
    }
  };

  if (liveSelected && liveSelected.status === "completed" && selectedDraftUid) {
    const back = () => setSelected(null);
    if (liveSelected.job_type === "model_shoot" || liveSelected.job_type === "model_shoot_edit") {
      return (
        <ModelShootReviewSession
          draftUid={selectedDraftUid}
          token={token}
          onBack={back}
          backLabel="Back to queue"
          onEditImage={onEditImage}
          onManualPhotoEdit={onManualPhotoEdit}
          onOpenVideoShoot={onOpenVideoShoot}
          onViewQueue={back}
        />
      );
    }
    if (liveSelected.job_type === "product_shoot" || liveSelected.job_type === "product_shoot_edit") {
      return (
        <ProductShootReviewSession
          draftUid={selectedDraftUid}
          token={token}
          onBack={back}
          backLabel="Back to queue"
          onEditImage={onEditImage}
          onManualPhotoEdit={onManualPhotoEdit}
          onOpenVideoShoot={onOpenVideoShoot}
          onViewQueue={back}
        />
      );
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ListOrdered className="h-4 w-4" />
            Generation Queue
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3 text-sm">
          <Badge variant="secondary">{processingCount} processing</Badge>
          <Badge variant="outline">{queuedCount} queued</Badge>
          <Button type="button" variant="ghost" size="sm" onClick={() => void refresh()}>
            <RotateCw className="mr-1 h-3.5 w-3.5" />
            Refresh
          </Button>
        </CardContent>
      </Card>

      {jobs.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            No generation requests yet. Product shoots, model shoots, edits, and model poses you
            submit will show up here.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <Card key={job.uid}>
              <CardContent className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-x-4 gap-y-3 p-4 sm:grid-cols-[5.5rem_minmax(0,1fr)_12rem] sm:gap-x-5">
                <JobThumbnails items={generationJobThumbnails(job)} urls={thumbnailUrls} />
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge className="shrink-0" variant={statusVariant(job.status)}>
                      {job.status === "processing" && job.status_message
                        ? "Paused"
                        : STATUS_LABEL[job.status]}
                    </Badge>
                    {job.status === "queued" && job.queue_position ? (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        Position {job.queue_position}
                      </span>
                    ) : null}
                  </div>
                  <p className="truncate font-medium">{job.title}</p>
                  {job.subtitle ? (
                    <p className="truncate text-sm text-muted-foreground">{job.subtitle}</p>
                  ) : null}
                  <p className="truncate text-xs text-muted-foreground">
                    Submitted {formatTime(job.created_at)}
                    {job.status === "processing" && job.started_at
                      ? ` · started ${formatTime(job.started_at)}`
                      : ""}
                    {job.completed_at ? ` · finished ${formatTime(job.completed_at)}` : ""}
                  </p>
                  {job.status === "failed" && job.error_message ? (
                    <p className="truncate text-sm text-destructive">{job.error_message}</p>
                  ) : null}
                  {job.status === "processing" && job.status_message ? (
                    <p className="truncate text-sm text-amber-800">{job.status_message}</p>
                  ) : null}
                </div>
                <div className="col-span-2 flex w-full flex-col items-stretch justify-center gap-2 sm:col-span-1">
                  {job.status === "queued" ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full"
                      disabled={cancellingUid === job.uid}
                      onClick={() => void handleCancel(job)}
                    >
                      {cancellingUid === job.uid ? (
                        <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <XCircle className="mr-1 h-3.5 w-3.5" />
                      )}
                      Cancel
                    </Button>
                  ) : null}
                  {job.status === "processing" ? (
                    <span className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md border border-transparent text-sm text-muted-foreground">
                      {job.status_message ? (
                        <>
                          <PauseCircle className="h-3.5 w-3.5 text-amber-700" />
                          Paused
                        </>
                      ) : (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Generating
                        </>
                      )}
                    </span>
                  ) : null}
                  {job.status === "completed" && isShootJob(job) && generationJobDraftUid(job) ? (
                    <Button type="button" size="sm" className="w-full" onClick={() => setSelected(job)}>
                      <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                      Open result
                    </Button>
                  ) : null}
                  {job.status === "completed" && job.job_type === "image_edit" ? (
                    <Button type="button" size="sm" className="w-full" onClick={() => setSelected(job)}>
                      <Wand2 className="mr-1 h-3.5 w-3.5" />
                      View edit
                    </Button>
                  ) : null}
                  {job.status === "completed" && job.job_type === "model_pose" && onOpenModelPoses ? (
                    <Button type="button" size="sm" className="w-full" onClick={onOpenModelPoses}>
                      Open model poses
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}
          <p className="px-1 pt-1 text-sm text-muted-foreground">
            Earlier completed generations are saved in My Gallery.
            {onOpenGallery ? " " : null}
            {onOpenGallery ? (
              <button
                type="button"
                className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline"
                onClick={onOpenGallery}
              >
                <Images className="h-3.5 w-3.5" />
                Open My Gallery
              </button>
            ) : null}
          </p>
        </div>
      )}

      {liveSelected?.job_type === "image_edit" && liveSelected.status === "completed" ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Edited image</CardTitle>
            <Button type="button" variant="ghost" size="sm" onClick={() => setSelected(null)}>
              Close
            </Button>
          </CardHeader>
          <CardContent>
            {previewUrl ? (
              <img src={previewUrl} alt="Edited result" className="max-h-[32rem] rounded-md border" />
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <ImageIcon className="h-4 w-4" />
                Saved to Edited Images in My Gallery.
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
