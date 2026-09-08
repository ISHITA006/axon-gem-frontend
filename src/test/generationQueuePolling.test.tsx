import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  ACTIVE_POLL_INTERVAL_MS,
  GenerationQueueProvider,
  useGenerationQueue,
} from "@/contexts/GenerationQueueContext";
import type { GenerationJob, GenerationJobsResponse } from "@/lib/api";

const { listMock, dispatchMock, cancelMock, toastMock } = vi.hoisted(() => ({
  listMock: vi.fn(),
  dispatchMock: vi.fn(),
  cancelMock: vi.fn(),
  toastMock: vi.fn(),
}));

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: toastMock }) }));
vi.mock("@/lib/generationNotify", () => ({
  ensureGenerationNotifyPermission: vi.fn(async () => undefined),
  notifyGenerationSuccess: vi.fn(),
  notifyGenerationError: vi.fn(),
  notifyGenerationPause: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    token: "test-token",
    isAuthenticated: true,
    login: vi.fn(),
    logout: vi.fn(),
  }),
}));
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    apiListGenerationJobs: (...args: unknown[]) => listMock(...args),
    apiDispatchGenerationJobs: (...args: unknown[]) => dispatchMock(...args),
    apiCancelGenerationJob: (...args: unknown[]) => cancelMock(...args),
  };
});

function makeJob(overrides: Partial<GenerationJob> = {}): GenerationJob {
  return {
    uid: "job-1",
    job_type: "product_shoot",
    status: "queued",
    title: "Product shoot",
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function makePayload(overrides: Partial<GenerationJobsResponse> = {}): GenerationJobsResponse {
  return {
    jobs: [],
    max_concurrent: 2,
    processing_count: 0,
    queued_count: 0,
    completed_visible_limit: 5,
    ...overrides,
  };
}

function Probe() {
  const { jobs } = useGenerationQueue();
  return <span data-testid="job-count">{jobs.length}</span>;
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <GenerationQueueProvider>{children}</GenerationQueueProvider>
    </QueryClientProvider>
  );
}

function setTabVisible(visible: boolean) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => (visible ? "visible" : "hidden"),
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

function pollCallbacks(): Array<() => void> {
  return vi
    .mocked(window.setInterval)
    .mock.calls.filter((call) => call[1] === ACTIVE_POLL_INTERVAL_MS)
    .map((call) => call[0] as () => void);
}

describe("generation queue polling", () => {
  beforeEach(() => {
    listMock.mockReset();
    dispatchMock.mockReset();
    cancelMock.mockReset();
    dispatchMock.mockImplementation(() => new Promise(() => {}));
    setTabVisible(true);
    vi.spyOn(window, "setInterval");
    vi.spyOn(window, "clearInterval");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setTabVisible(true);
  });

  it("does not poll while the queue is idle", async () => {
    listMock.mockResolvedValue(makePayload());
    render(<Probe />, { wrapper });

    await waitFor(() => expect(listMock).toHaveBeenCalledTimes(1));
    expect(pollCallbacks()).toHaveLength(0);
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it("polls every 10s while jobs are queued or processing", async () => {
    listMock.mockResolvedValue(
      makePayload({
        jobs: [makeJob({ status: "processing" })],
        processing_count: 1,
      })
    );
    render(<Probe />, { wrapper });

    await waitFor(() => expect(listMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(dispatchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(pollCallbacks().length).toBeGreaterThan(0));

    const callsBeforeTick = listMock.mock.calls.length;
    await act(async () => {
      pollCallbacks().at(-1)!();
    });
    await waitFor(() => expect(listMock.mock.calls.length).toBeGreaterThan(callsBeforeTick));
  });

  it("stops polling after the queue becomes idle", async () => {
    listMock
      .mockResolvedValueOnce(
        makePayload({
          jobs: [makeJob({ status: "processing" })],
          processing_count: 1,
        })
      )
      .mockResolvedValue(makePayload({ jobs: [makeJob({ status: "completed" })] }));

    render(<Probe />, { wrapper });
    await waitFor(() => expect(pollCallbacks().length).toBeGreaterThan(0));
    const tick = pollCallbacks().at(-1)!;

    await act(async () => {
      tick();
    });
    await waitFor(() => expect(listMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(window.clearInterval).toHaveBeenCalled());
  });

  it("pauses polling while the tab is hidden and refreshes when it is visible again", async () => {
    listMock.mockResolvedValue(
      makePayload({
        jobs: [makeJob({ status: "queued" })],
        queued_count: 1,
      })
    );
    render(<Probe />, { wrapper });
    await waitFor(() => expect(pollCallbacks().length).toBeGreaterThan(0));
    await waitFor(() => expect(listMock).toHaveBeenCalledTimes(1));

    await act(async () => {
      setTabVisible(false);
    });
    expect(window.clearInterval).toHaveBeenCalled();

    await act(async () => {
      setTabVisible(true);
    });
    await waitFor(() => expect(listMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(pollCallbacks().length).toBeGreaterThan(0));
  });

  it("toasts when a processing job reports that the Premium model is paused", async () => {
    const processing = makeJob({ status: "processing" });
    listMock
      .mockResolvedValueOnce(
        makePayload({
          jobs: [processing],
          processing_count: 1,
        })
      )
      .mockResolvedValue(
        makePayload({
          jobs: [
            makeJob({
              status: "processing",
              status_message:
                "Generation is paused as the Premium model was unavailable. Trying again in some time.",
            }),
          ],
          processing_count: 1,
        })
      );

    render(<Probe />, { wrapper });
    await waitFor(() => expect(pollCallbacks().length).toBeGreaterThan(0));
    const tick = pollCallbacks().at(-1)!;

    await act(async () => {
      tick();
    });
    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Product shoot paused",
          description:
            "Generation is paused as the Premium model was unavailable. Trying again in some time.",
        })
      )
    );
  });
});
