import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import TryOnResults from "@/components/TryOnResults";
import type { ModelShootDraft, ModelShootGeneration } from "@/lib/api";

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/components/AddToCataloguePanel", () => ({ default: () => null }));

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
    saved: false,
    saved_at: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeDraft(generations: ModelShootGeneration[], overrides: Partial<ModelShootDraft> = {}): ModelShootDraft {
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
    gallery_uid: null,
    placement_guided: false,
    generations,
    latest_generation: generations[generations.length - 1] ?? null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

const results = {
  front: "https://example.com/front.png",
  frontKey: "on-model-images/gen1.png",
  analysis: null,
};

beforeEach(cleanup);

describe("model shoot review flow", () => {
  it("explains complementary edits and offers a suggested tweak without a warning", () => {
    const generation = makeGeneration();
    render(
      <TryOnResults
        loading={false}
        results={results}
        onBack={() => {}}
        token="t"
        draft={makeDraft([generation])}
        activeGeneration={generation}
        onRegenerate={() => {}}
        onSaveGeneration={() => {}}
      />
    );

    expect(screen.getByText("Want a change?")).toBeInTheDocument();
    expect(screen.getByText(/Each model shoot comes with 2 complementary edits/)).toBeInTheDocument();
    expect(screen.queryByText("Needs review")).not.toBeInTheDocument();
    expect(screen.getByText(/Suggested tweaks: stone count/)).toBeInTheDocument();
    expect(screen.getByText(/Generated piece has 10 stones/)).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveValue("Increase the stone count to 12.");
  });

  it("sends the user's edited prompt when an edit is applied", () => {
    const onRegenerate = vi.fn();
    const generation = makeGeneration();
    render(
      <TryOnResults
        loading={false}
        results={results}
        onBack={() => {}}
        token="t"
        draft={makeDraft([generation])}
        activeGeneration={generation}
        onRegenerate={onRegenerate}
        onSaveGeneration={() => {}}
      />
    );

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Increase the stone count to 12 and warm the lighting." },
    });
    fireEvent.click(screen.getByRole("button", { name: /Apply this edit/i }));

    expect(onRegenerate).toHaveBeenCalledWith("Increase the stone count to 12 and warm the lighting.");
  });

  it("blocks applying an edit with an empty prompt", () => {
    const onRegenerate = vi.fn();
    const generation = makeGeneration({ suggested_edit_prompt: null, mismatches: [], fidelity_verified: true });
    render(
      <TryOnResults
        loading={false}
        results={results}
        onBack={() => {}}
        token="t"
        draft={makeDraft([generation])}
        activeGeneration={generation}
        onRegenerate={onRegenerate}
        onSaveGeneration={() => {}}
      />
    );

    expect(screen.queryByText("Fidelity check passed")).not.toBeInTheDocument();
    expect(screen.getByText(/not happy with this look/)).toBeInTheDocument();
    const button = screen.getByRole("button", { name: /Apply this edit/i });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onRegenerate).not.toHaveBeenCalled();
  });

  it("pages between stored looks", () => {
    const onSelectGeneration = vi.fn();
    const first = makeGeneration();
    const second = makeGeneration({
      uid: "gen-2",
      attempt_index: 2,
      attempt_label: "2/3",
      applied_edit_prompt: "Increase the stone count to 12.",
    });
    render(
      <TryOnResults
        loading={false}
        results={results}
        onBack={() => {}}
        token="t"
        draft={makeDraft([first, second])}
        activeGeneration={second}
        onSelectGeneration={onSelectGeneration}
        onRegenerate={() => {}}
        onSaveGeneration={() => {}}
      />
    );

    expect(screen.getByText("Look 2 of 2")).toBeInTheDocument();
    expect(screen.getByText(/This look used your last edit/)).toBeInTheDocument();
    expect(screen.getByTitle("Next look")).toBeDisabled();
    fireEvent.click(screen.getByTitle("Previous look"));
    expect(onSelectGeneration).toHaveBeenCalledWith("gen-1");
  });

  it("stops offering edits once both complementary edits are used", () => {
    const generations = [1, 2, 3].map((i) =>
      makeGeneration({
        uid: `gen-${i}`,
        attempt_index: i,
        attempt_label: `${i}/3`,
        saved: true,
        saved_at: new Date().toISOString(),
      })
    );
    render(
      <TryOnResults
        loading={false}
        results={results}
        onBack={() => {}}
        token="t"
        draft={makeDraft(generations)}
        activeGeneration={generations[2]}
        onRegenerate={() => {}}
        onSaveGeneration={() => {}}
      />
    );

    expect(screen.queryByRole("button", { name: /Apply this edit/i })).toBeNull();
    expect(screen.getByText(/Both complementary edits on this shoot have been used/)).toBeInTheDocument();
    expect(screen.getByText(/Start a new shoot if you want another change/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Retry saving to gallery/i })).toBeNull();
  });

  it("keeps complementary edits available after an autosave", () => {
    const onRegenerate = vi.fn();
    const saved = makeGeneration({ saved: true, saved_at: new Date().toISOString() });
    render(
      <TryOnResults
        loading={false}
        results={results}
        onBack={() => {}}
        token="t"
        draft={makeDraft([saved], { gallery_uid: "gallery-1" })}
        activeGeneration={saved}
        onRegenerate={onRegenerate}
        onSaveGeneration={() => {}}
      />
    );

    expect(screen.getByText(/Each model shoot comes with 2 complementary edits/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /saving to gallery/i })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Apply this edit/i }));
    expect(onRegenerate).toHaveBeenCalledWith("Increase the stone count to 12.");
  });

  it("offers a retry when a look was not autosaved", () => {
    const onSaveGeneration = vi.fn();
    const first = makeGeneration({ saved: true, saved_at: new Date().toISOString() });
    const second = makeGeneration({ uid: "gen-2", attempt_index: 2, attempt_label: "2/3" });
    render(
      <TryOnResults
        loading={false}
        results={results}
        onBack={() => {}}
        token="t"
        draft={makeDraft([first, second], { gallery_uid: "gallery-1" })}
        activeGeneration={second}
        onRegenerate={() => {}}
        onSaveGeneration={onSaveGeneration}
      />
    );

    const retryButton = screen.getByRole("button", { name: /Retry saving to gallery/i });
    expect(retryButton).toBeEnabled();
    fireEvent.click(retryButton);
    expect(onSaveGeneration).toHaveBeenCalled();
  });

  it("shows the complementary-edit progress label while applying", () => {
    const generation = makeGeneration();
    render(
      <TryOnResults
        loading={false}
        results={results}
        onBack={() => {}}
        token="t"
        draft={makeDraft([generation])}
        activeGeneration={generation}
        regenerating
        progressLabel="Edit 1 of 2"
      />
    );

    expect(screen.getByText("Applying your edit...")).toBeInTheDocument();
    expect(screen.getByText("Edit 1 of 2")).toBeInTheDocument();
  });

  it("uses a gallery back label when resuming from My Gallery", () => {
    const generation = makeGeneration();
    render(
      <TryOnResults
        loading={false}
        results={results}
        onBack={() => {}}
        backLabel="Back to gallery"
        token="t"
        draft={makeDraft([generation], { gallery_uid: "gallery-1" })}
        activeGeneration={generation}
        onRegenerate={() => {}}
      />
    );

    expect(screen.getByRole("button", { name: /Back to gallery/i })).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveValue("Increase the stone count to 12.");
    expect(screen.getByRole("button", { name: /Apply this edit/i })).toBeEnabled();
  });
});
