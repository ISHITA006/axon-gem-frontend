import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import ModelShootReviewSession from "@/components/ModelShootReviewSession";
import type { ModelShootDraft, ModelShootGeneration } from "@/lib/api";

const { getDraftMock, getPresignedUrlMock, regenerateMock } = vi.hoisted(() => ({
  getDraftMock: vi.fn(),
  getPresignedUrlMock: vi.fn(),
  regenerateMock: vi.fn(),
}));

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/components/AddToCataloguePanel", () => ({ default: () => null }));
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    apiGetModelShootDraft: (...args: unknown[]) => getDraftMock(...args),
    apiRegenerateModelShoot: (...args: unknown[]) => regenerateMock(...args),
    getPresignedUrl: (...args: unknown[]) => getPresignedUrlMock(...args),
  };
});

function makeGeneration(overrides: Partial<ModelShootGeneration> = {}): ModelShootGeneration {
  return {
    uid: "gen-1",
    attempt_index: 1,
    attempt_label: "1/3",
    front_image_s3_key: "on-model-images/gen1.png",
    close_up_image_s3_key: null,
    fidelity_verified: false,
    mismatches: ["stone_count_match"],
    notes: "Generated piece has 10 stones, reference has 12.",
    suggested_edit_prompt: "Increase the stone count to 12.",
    applied_edit_prompt: null,
    saved: true,
    saved_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeDraft(generations: ModelShootGeneration[]): ModelShootDraft {
  return {
    uid: "draft-1",
    status: "in_review",
    max_generations: 3,
    generations_used: generations.length,
    generations_remaining: 3 - generations.length,
    generations_saved: generations.filter((gen) => gen.saved).length,
    can_regenerate: generations.length < 3,
    can_resume_review: generations.length < 3,
    analysis: null,
    gallery_uid: "gallery-1",
    placement_guided: false,
    generations,
    latest_generation: generations[generations.length - 1] ?? null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  getDraftMock.mockReset();
  getPresignedUrlMock.mockReset();
  regenerateMock.mockReset();
  getPresignedUrlMock.mockResolvedValue("https://example.com/front.png");
});

describe("resume model shoot review from gallery", () => {
  it("loads the stored draft and edit prompt without regenerating", async () => {
    const generation = makeGeneration();
    getDraftMock.mockResolvedValue(makeDraft([generation]));

    render(
      <ModelShootReviewSession draftUid="draft-1" token="t" onBack={() => {}} backLabel="Back to gallery" />,
      { wrapper }
    );

    await waitFor(() => {
      expect(screen.getByRole("textbox")).toHaveValue("Increase the stone count to 12.");
    });

    expect(getDraftMock).toHaveBeenCalledWith("t", "draft-1");
    expect(regenerateMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Back to gallery/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Apply this edit/i })).toBeEnabled();
    expect(screen.getByText(/Each model shoot comes with 2 complementary edits/)).toBeInTheDocument();
  });

  it("does not offer an edit after both complementary edits are used", async () => {
    const generations = [1, 2, 3].map((i) =>
      makeGeneration({
        uid: `gen-${i}`,
        attempt_index: i,
        attempt_label: `${i}/3`,
        saved: true,
        saved_at: new Date().toISOString(),
      })
    );
    getDraftMock.mockResolvedValue(makeDraft(generations));

    render(<ModelShootReviewSession draftUid="draft-1" token="t" onBack={() => {}} />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText(/Both complementary edits on this shoot have been used/)).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: /Apply this edit/i })).toBeNull();
    expect(regenerateMock).not.toHaveBeenCalled();
  });

  it("resumes review when the close-up view is spent but the regular view still has edits", async () => {
    const initial = makeGeneration({
      close_up_image_s3_key: "on-model-images/gen1-close.png",
      front_suggested_edit_prompt: "Increase the stone count to 12.",
      close_up_suggested_edit_prompt: "Tighten the crop on the pendant.",
    });
    const closeUpEdits = [2, 3].map((i) =>
      makeGeneration({
        uid: `gen-${i}`,
        attempt_index: i,
        attempt_label: `${i}/5`,
        close_up_image_s3_key: `on-model-images/gen${i}-close.png`,
        edited_view: "close_up",
        applied_edit_prompt: "Tighten the crop on the pendant.",
        close_up_applied_edit_prompt: "Tighten the crop on the pendant.",
        front_suggested_edit_prompt: "Increase the stone count to 12.",
        suggested_edit_prompt: "Increase the stone count to 12.",
        saved: true,
        saved_at: new Date().toISOString(),
      })
    );
    getDraftMock.mockResolvedValue({
      ...makeDraft([initial, ...closeUpEdits]),
      views: "both" as const,
    });

    render(
      <ModelShootReviewSession
        draftUid="draft-1"
        token="t"
        onBack={() => {}}
        backLabel="Back to gallery"
      />,
      { wrapper }
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Apply regular edit/i })).toBeEnabled();
    });
    expect(screen.getByText(/2 complementary edits left on the regular view/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Apply close-up edit/i })).toBeNull();
    expect(regenerateMock).not.toHaveBeenCalled();
  });
});
