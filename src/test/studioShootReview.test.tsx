import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import StudioShootResults from "@/components/StudioShootResults";
import type { ProductShootDraft, ProductShootGeneration } from "@/lib/api";

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

function makeGeneration(overrides: Partial<ProductShootGeneration> = {}): ProductShootGeneration {
  return {
    uid: "gen-1",
    attempt_index: 1,
    attempt_label: "1/3",
    front_image_s3_key: "studio-shoots/gen1.png",
    side_image_s3_key: null,
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

function makeDraft(
  generations: ProductShootGeneration[],
  overrides: Partial<ProductShootDraft> = {}
): ProductShootDraft {
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
    views: "front",
    generations,
    latest_generation: generations[generations.length - 1] ?? null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

const results = {
  status: "success" as const,
  frontImageS3Key: "studio-shoots/gen1.png",
  frontImageUrl: "https://example.com/front.png",
};

beforeEach(cleanup);

describe("product shoot review flow", () => {
  it("explains complementary edits and offers a suggested tweak", () => {
    const generation = makeGeneration();
    render(
      <StudioShootResults
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
    expect(screen.getByText(/Each product shoot comes with 2 complementary edits/)).toBeInTheDocument();
    expect(screen.getByText(/Suggested tweaks: stone count/)).toBeInTheDocument();
    expect(screen.getByText(/Generated piece has 10 stones/)).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveValue("Increase the stone count to 12.");
  });

  it("sends the user's edited prompt when an edit is applied", () => {
    const onRegenerate = vi.fn();
    const generation = makeGeneration();
    render(
      <StudioShootResults
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

    expect(onRegenerate).toHaveBeenCalledWith("Increase the stone count to 12 and warm the lighting.", "front");
  });

  it("blocks applying an edit with an empty prompt", () => {
    const onRegenerate = vi.fn();
    const generation = makeGeneration({
      suggested_edit_prompt: null,
      mismatches: [],
      fidelity_verified: true,
    });
    render(
      <StudioShootResults
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
      <StudioShootResults
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
      <StudioShootResults
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
    expect(screen.getByText(/Start a new edit session if you want another change/)).toBeInTheDocument();
  });

  it("keeps complementary edits available after an autosave", () => {
    const onRegenerate = vi.fn();
    const saved = makeGeneration({ saved: true, saved_at: new Date().toISOString() });
    render(
      <StudioShootResults
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

    expect(screen.getByText(/Each product shoot comes with 2 complementary edits/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /saving to gallery/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Apply this edit/i }));
    expect(onRegenerate).toHaveBeenCalledWith("Increase the stone count to 12.", "front");
  });

  it("offers a retry when a look was not autosaved", () => {
    const onSaveGeneration = vi.fn();
    const first = makeGeneration({ saved: true, saved_at: new Date().toISOString() });
    const second = makeGeneration({ uid: "gen-2", attempt_index: 2, attempt_label: "2/3" });
    render(
      <StudioShootResults
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

    fireEvent.click(screen.getByRole("button", { name: /Retry saving to gallery/i }));
    expect(onSaveGeneration).toHaveBeenCalled();
  });

  it("shows the complementary-edit progress label while applying", () => {
    const generation = makeGeneration();
    render(
      <StudioShootResults
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

  it("lets the user apply a front edit without regenerating the side view", () => {
    const onRegenerate = vi.fn();
    const generation = makeGeneration({
      side_image_s3_key: "studio-shoots/gen1-side.png",
      front_suggested_edit_prompt: "Increase the stone count to 12.",
      side_suggested_edit_prompt: "Rotate the hoop a little more.",
      front_mismatches: ["stone_count_match"],
      side_mismatches: [],
      suggested_edit_prompt: "Front view: Increase the stone count to 12.\n\nSide view: Rotate the hoop a little more.",
    });
    render(
      <StudioShootResults
        loading={false}
        results={{
          status: "success",
          frontImageS3Key: "studio-shoots/gen1.png",
          frontImageUrl: "https://example.com/front.png",
          sideImageS3Key: "studio-shoots/gen1-side.png",
          sideImageUrl: "https://example.com/side.png",
        }}
        onBack={() => {}}
        token="t"
        draft={makeDraft([generation], { views: "both" })}
        activeGeneration={generation}
        onRegenerate={onRegenerate}
        onSaveGeneration={() => {}}
      />
    );

    expect(screen.getByText("Front view")).toBeInTheDocument();
    expect(screen.getByText("Side view")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Apply this edit/i })).toBeNull();

    const [frontBox, sideBox] = screen.getAllByRole("textbox");
    expect(frontBox).toHaveValue("Increase the stone count to 12.");
    expect(sideBox).toHaveValue("Rotate the hoop a little more.");

    fireEvent.change(frontBox, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /Apply front edit/i }));
    expect(onRegenerate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Apply side edit/i }));
    expect(onRegenerate).toHaveBeenCalledTimes(1);
    expect(onRegenerate).toHaveBeenCalledWith("Rotate the hoop a little more.", "side");

    fireEvent.change(frontBox, { target: { value: "Increase the stone count to 12." } });
    fireEvent.click(screen.getByRole("button", { name: /Apply front edit/i }));
    expect(onRegenerate).toHaveBeenCalledWith("Increase the stone count to 12.", "front");
  });

  it("keeps front-view edits after the side view has used both of its edits", () => {
    const onRegenerate = vi.fn();
    const initial = makeGeneration({
      side_image_s3_key: "studio-shoots/gen1-side.png",
      front_suggested_edit_prompt: "Increase the stone count to 12.",
      side_suggested_edit_prompt: "Rotate the hoop a little more.",
    });
    const sideEdits = [2, 3].map((i) =>
      makeGeneration({
        uid: `gen-${i}`,
        attempt_index: i,
        attempt_label: `${i}/5`,
        side_image_s3_key: `studio-shoots/gen${i}-side.png`,
        edited_view: "side",
        applied_edit_prompt: "Rotate the hoop a little more.",
        side_applied_edit_prompt: "Rotate the hoop a little more.",
        front_suggested_edit_prompt: "Increase the stone count to 12.",
        suggested_edit_prompt: "Increase the stone count to 12.",
      })
    );
    const latest = sideEdits[1];
    render(
      <StudioShootResults
        loading={false}
        results={{
          status: "success",
          frontImageS3Key: "studio-shoots/gen1.png",
          frontImageUrl: "https://example.com/front.png",
          sideImageS3Key: "studio-shoots/gen3-side.png",
          sideImageUrl: "https://example.com/side.png",
        }}
        onBack={() => {}}
        token="t"
        draft={makeDraft([initial, ...sideEdits], { views: "both" })}
        activeGeneration={latest}
        onRegenerate={onRegenerate}
        onSaveGeneration={() => {}}
      />
    );

    expect(screen.getByText(/2 complementary edits left on the front view/)).toBeInTheDocument();
    expect(screen.getByText(/side view edits are used/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Apply front edit/i })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /Apply side edit/i })).toBeNull();
    expect(screen.getByText(/Both complementary edits on this side view have been used/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Apply front edit/i }));
    expect(onRegenerate).toHaveBeenCalledWith("Increase the stone count to 12.", "front");
  });

  it("sends a swapped jewellery reference with the edit", () => {
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:preview"),
      revokeObjectURL: vi.fn(),
    });
    const onRegenerate = vi.fn();
    const generation = makeGeneration();
    render(
      <StudioShootResults
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

    fireEvent.click(screen.getByRole("radio", { name: /Swap original jewellery reference/i }));
    const file = new File(["jewels"], "new-jewellery.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("New jewellery reference"), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: /Apply this edit/i }));

    expect(onRegenerate).toHaveBeenCalledWith("Increase the stone count to 12.", "front", {
      mode: "swap",
      file,
    });
    vi.unstubAllGlobals();
  });
});
