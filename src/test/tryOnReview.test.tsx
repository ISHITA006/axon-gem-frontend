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
  it("shows the generation counter, mismatches and the editable suggested prompt", () => {
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

    expect(screen.getByText("1/3")).toBeInTheDocument();
    expect(screen.getByText("1 of 3 used")).toBeInTheDocument();
    expect(screen.getByText("Needs review")).toBeInTheDocument();
    expect(screen.getByText("stone count")).toBeInTheDocument();
    expect(screen.getByText(/Generated piece has 10 stones/)).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveValue("Increase the stone count to 12.");
  });

  it("sends the user's edited prompt when regeneration is approved", () => {
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
    fireEvent.click(screen.getByRole("button", { name: /Approve & regenerate/i }));

    expect(onRegenerate).toHaveBeenCalledWith("Increase the stone count to 12 and warm the lighting.");
  });

  it("blocks regeneration with an empty prompt", () => {
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

    expect(screen.getByText("Fidelity check passed")).toBeInTheDocument();
    const button = screen.getByRole("button", { name: /Approve & regenerate/i });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onRegenerate).not.toHaveBeenCalled();
  });

  it("pages between stored generations", () => {
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

    expect(screen.getByText("2/3")).toBeInTheDocument();
    expect(screen.getByText(/Edit applied to produce this generation/)).toBeInTheDocument();
    expect(screen.getByTitle("Next generation")).toBeDisabled();
    fireEvent.click(screen.getByTitle("Previous generation"));
    expect(onSelectGeneration).toHaveBeenCalledWith("gen-1");
  });

  it("stops offering regeneration once all generations are used", () => {
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

    expect(screen.queryByRole("button", { name: /Approve & regenerate/i })).toBeNull();
    expect(
      screen.getByText(/All 3 generations have been used and saved to this model shoot/)
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Retry saving to gallery/i })).toBeNull();
  });

  it("reports an autosaved generation and keeps editing available", () => {
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

    expect(screen.getByText("Saved to shoot")).toBeInTheDocument();
    expect(screen.getByText("1 of 3 used · 1 in gallery")).toBeInTheDocument();
    expect(screen.getByText(/saved to this model shoot automatically/i)).toBeInTheDocument();
    // Autosaved generations need no save button at all.
    expect(screen.queryByRole("button", { name: /saving to gallery/i })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Approve & regenerate/i }));
    expect(onRegenerate).toHaveBeenCalledWith("Increase the stone count to 12.");
  });

  it("offers a retry when a generation was not autosaved", () => {
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

    expect(screen.getByText("Not in gallery")).toBeInTheDocument();
    const retryButton = screen.getByRole("button", { name: /Retry saving to gallery/i });
    expect(retryButton).toBeEnabled();
    fireEvent.click(retryButton);
    expect(onSaveGeneration).toHaveBeenCalled();
  });

  it("shows the generation progress label while regenerating", () => {
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
        progressLabel="2/3"
      />
    );

    expect(screen.getByText("Applying your edit...")).toBeInTheDocument();
    expect(screen.getByText("Generation 2/3")).toBeInTheDocument();
  });
});
