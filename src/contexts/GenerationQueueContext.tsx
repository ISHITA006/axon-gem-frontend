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

/** Status polling while a job is queued or processing. Idle queues do not poll. */
export const ACTIVE_POLL_INTERVAL_MS = 30_000;

/** Brief pause before reopening dispatch if Cloud Run cut the previous hold. */
const DISPATCH_RECONNECT_MS = 1_000;

function isActiveStatus(status: string): boolean {
  return status === "queued" || status === "processing";
}

function hasActiveJobs(jobs: GenerationJob[]): boolean {
  return jobs.some((job) => isActiveStatus(job.status));
}

function isTabVisible(): boolean {
  return typeof document !== "undefined" && document.visibilityState === "visible";
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
  const pollTimerRef = useRef<number | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const tokenRef = useRef(token);
  tokenRef.current = token;

  const applyJobs = useCallback((next: GenerationJob[]) => {
    jobsRef.current = next;
    setJobs(next);
  }, []);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current != null) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current != null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const pollTickRef = useRef<() => void>(() => {});

  const syncPolling = useCallback(() => {
    const shouldPoll = Boolean(tokenRef.current) && isTabVisible() && hasActiveJobs(jobsRef.current);
    if (!shouldPoll) {
      stopPolling();
      return;
    }
    if (pollTimerRef.current != null) return;
    pollTimerRef.current = window.setInterval(() => {
      pollTickRef.current();
    }, ACTIVE_POLL_INTERVAL_MS);
  }, [stopPolling]);

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
        void queryClient.invalidateQueries({ queryKey: ["gallery-products"] });
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
    syncPolling();
  }, [applyJobs, queryClient, syncPolling, toast, token]);

  const kickDispatch = useCallback(async () => {
    if (!token || dispatchingRef.current) return;
    dispatchingRef.current = true;
    const abort = new AbortController();
    abortRef.current = abort;
    try {
      await apiDispatchGenerationJobs(token, abort.signal);
    } catch {
      // Aborted on logout/unmount, or the request ended; reconnect if jobs remain.
    } finally {
      dispatchingRef.current = false;
      if (abortRef.current === abort) abortRef.current = null;
      if (abort.signal.aborted) return;
      void refresh()
        .catch(() => undefined)
        .then(() => {
          if (abort.signal.aborted || !hasActiveJobs(jobsRef.current)) return;
          clearReconnectTimer();
          reconnectTimerRef.current = window.setTimeout(() => {
            reconnectTimerRef.current = null;
            void kickDispatch();
          }, DISPATCH_RECONNECT_MS);
        });
    }
  }, [clearReconnectTimer, refresh, token]);

  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const kickDispatchRef = useRef(kickDispatch);
  kickDispatchRef.current = kickDispatch;

  pollTickRef.current = () => {
    if (!tokenRef.current || !isTabVisible()) {
      stopPolling();
      return;
    }
    void refreshRef.current()
      .catch(() => undefined)
      .then(() => {
        if (hasActiveJobs(jobsRef.current)) {
          void kickDispatchRef.current();
        }
      });
  };

  useEffect(() => {
    if (!token) {
      applyJobs([]);
      setProcessingCount(0);
      setQueuedCount(0);
      stopPolling();
      clearReconnectTimer();
      abortRef.current?.abort();
      return;
    }
    void ensureGenerationNotifyPermission();
    void refreshRef.current()
      .then(() => {
        if (hasActiveJobs(jobsRef.current)) {
          void kickDispatchRef.current();
        }
      })
      .catch(() => undefined);

    const onVisibility = () => {
      if (!isTabVisible()) {
        stopPolling();
        return;
      }
      if (!tokenRef.current) return;
      void refreshRef.current()
        .catch(() => undefined)
        .then(() => {
          if (hasActiveJobs(jobsRef.current)) {
            void kickDispatchRef.current();
          }
        });
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      stopPolling();
      clearReconnectTimer();
      abortRef.current?.abort();
    };
  }, [applyJobs, clearReconnectTimer, stopPolling, token]);

  const trackJob = useCallback(
    (job: GenerationJob) => {
      applyJobs([job, ...jobsRef.current.filter((existing) => existing.uid !== job.uid)]);
      if (job.status === "queued") {
        setQueuedCount((count) => count + 1);
      }
      syncPolling();
      void kickDispatch();
      void refresh().catch(() => undefined);
    },
    [applyJobs, kickDispatch, refresh, syncPolling]
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
