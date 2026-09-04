import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  apiCancelGenerationJob,
  apiDispatchGenerationJobs,
  apiListGenerationJobs,
  type GenerationJob,
} from "@/lib/api";
import {
  ensureGenerationNotifyPermission,
  notifyGenerationError,
  notifyGenerationSuccess,
} from "@/lib/generationNotify";

type GenerationQueueValue = {
  jobs: GenerationJob[];
  maxConcurrent: number;
  processingCount: number;
  queuedCount: number;
  activeCount: number;
  completedVisibleLimit: number;
  refresh: () => Promise<void>;
  trackJob: (job: GenerationJob) => void;
  cancelJob: (jobUid: string) => Promise<void>;
  hasActiveJobForDraft: (draftUid: string) => boolean;
};

const GenerationQueueContext = createContext<GenerationQueueValue | null>(null);

function isActiveStatus(status: string): boolean {
  return status === "queued" || status === "processing";
}

export function GenerationQueueProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  const [maxConcurrent, setMaxConcurrent] = useState(2);
  const [processingCount, setProcessingCount] = useState(0);
  const [queuedCount, setQueuedCount] = useState(0);
  const [completedVisibleLimit, setCompletedVisibleLimit] = useState(5);
  const jobsRef = useRef<GenerationJob[]>([]);
  const dispatchingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const applyJobs = useCallback((next: GenerationJob[]) => {
    jobsRef.current = next;
    setJobs(next);
  }, []);

  const refresh = useCallback(async () => {
    if (!token) return;
    const data = await apiListGenerationJobs(token);
    const previous = new Map(jobsRef.current.map((job) => [job.uid, job]));
    for (const job of data.jobs) {
      const before = previous.get(job.uid);
      if (!before || before.status === job.status) continue;
      if (job.status === "completed") {
        const description = "Open Generation Queue to view the result.";
        toast({ title: `${job.title} is ready`, description });
        notifyGenerationSuccess(`${job.title} is ready`, description);
        void queryClient.invalidateQueries({ queryKey: ["gallery-items"] });
      } else if (job.status === "failed") {
        const description = job.error_message || "Generation failed. You can submit it again.";
        toast({ title: `${job.title} failed`, description, variant: "destructive" });
        notifyGenerationError(`${job.title} failed`, description);
      }
    }
    applyJobs(data.jobs);
    setMaxConcurrent(data.max_concurrent);
    setProcessingCount(data.processing_count);
    setQueuedCount(data.queued_count);
    if (typeof data.completed_visible_limit === "number" && data.completed_visible_limit > 0) {
      setCompletedVisibleLimit(data.completed_visible_limit);
    }
  }, [applyJobs, queryClient, toast, token]);

  const kickDispatch = useCallback(async () => {
    if (!token || dispatchingRef.current) return;
    dispatchingRef.current = true;
    const abort = new AbortController();
    abortRef.current = abort;
    try {
      await apiDispatchGenerationJobs(token, abort.signal);
    } catch {
      // Aborted on logout/unmount, or the request ended; polling retries.
    } finally {
      dispatchingRef.current = false;
      if (abortRef.current === abort) abortRef.current = null;
      void refresh().catch(() => undefined);
    }
  }, [refresh, token]);

  useEffect(() => {
    if (!token) {
      applyJobs([]);
      setProcessingCount(0);
      setQueuedCount(0);
      abortRef.current?.abort();
      return;
    }
    void ensureGenerationNotifyPermission();
    void refresh()
      .then(() => {
        if (jobsRef.current.some((job) => isActiveStatus(job.status))) {
          void kickDispatch();
        }
      })
      .catch(() => undefined);

    const interval = window.setInterval(() => {
      void refresh().catch(() => undefined);
      if (jobsRef.current.some((job) => isActiveStatus(job.status))) {
        void kickDispatch();
      }
    }, 3000);

    return () => {
      window.clearInterval(interval);
      abortRef.current?.abort();
    };
  }, [applyJobs, kickDispatch, refresh, token]);

  const trackJob = useCallback(
    (job: GenerationJob) => {
      applyJobs([job, ...jobsRef.current.filter((existing) => existing.uid !== job.uid)]);
      if (job.status === "queued") {
        setQueuedCount((count) => count + 1);
      }
      void kickDispatch();
      void refresh().catch(() => undefined);
    },
    [applyJobs, kickDispatch, refresh]
  );

  const cancelJob = useCallback(
    async (jobUid: string) => {
      if (!token) return;
      const updated = await apiCancelGenerationJob(token, jobUid);
      applyJobs(jobsRef.current.map((job) => (job.uid === updated.uid ? updated : job)));
      await refresh();
    },
    [applyJobs, refresh, token]
  );

  const hasActiveJobForDraft = useCallback((draftUid: string) => {
    return jobsRef.current.some(
      (job) => job.draft_uid === draftUid && isActiveStatus(job.status)
    );
  }, []);

  const value = useMemo<GenerationQueueValue>(
    () => ({
      jobs,
      maxConcurrent,
      processingCount,
      queuedCount,
      activeCount: queuedCount + processingCount,
      completedVisibleLimit,
      refresh,
      trackJob,
      cancelJob,
      hasActiveJobForDraft,
    }),
    [
      jobs,
      maxConcurrent,
      processingCount,
      queuedCount,
      completedVisibleLimit,
      refresh,
      trackJob,
      cancelJob,
      hasActiveJobForDraft,
    ]
  );

  return (
    <GenerationQueueContext.Provider value={value}>{children}</GenerationQueueContext.Provider>
  );
}

export function useGenerationQueue(): GenerationQueueValue {
  const ctx = useContext(GenerationQueueContext);
  if (!ctx) throw new Error("useGenerationQueue must be used within GenerationQueueProvider");
  return ctx;
}

export function useGenerationQueueOptional(): GenerationQueueValue | null {
  return useContext(GenerationQueueContext);
}
