import { describe, it, expect } from "vitest";
import {
  applyEditProgressLabel,
  applyViewEditProgressLabel,
  complementaryEditsIncluded,
  complementaryEditsLeft,
  editsLeftLabel,
  modelShootEditsSummary,
  modelShootViewBudget,
  productShootEditsSummary,
  productShootViewBudget,
} from "@/lib/modelShootCopy";

describe("model shoot complementary-edit copy", () => {
  it("treats the first look as the generation and the rest as edits", () => {
    expect(complementaryEditsIncluded(3)).toBe(2);
    expect(complementaryEditsLeft(1, 3)).toBe(2);
    expect(complementaryEditsLeft(2, 3)).toBe(1);
    expect(complementaryEditsLeft(3, 3)).toBe(0);
  });

  it("labels the edit being applied from the current look count", () => {
    expect(applyEditProgressLabel(1, 3)).toBe("Edit 1 of 2");
    expect(applyEditProgressLabel(2, 3)).toBe("Edit 2 of 2");
  });

  it("explains remaining edits in plain language", () => {
    expect(editsLeftLabel(2, 2)).toMatch(/Each model shoot comes with 2 complementary edits/);
    expect(editsLeftLabel(2, 2, "product shoot")).toMatch(
      /Each product shoot comes with 2 complementary edits/
    );
    expect(editsLeftLabel(1, 2)).toBe("1 complementary edit left on this shoot.");
    expect(editsLeftLabel(0, 2)).toBe("Both complementary edits on this shoot have been used.");
  });

  it("tracks complementary edits separately for front and side product views", () => {
    expect(applyViewEditProgressLabel(0)).toBe("Edit 1 of 2");
    expect(applyViewEditProgressLabel(1)).toBe("Edit 2 of 2");
    expect(
      productShootEditsSummary({ views: "both", frontRemaining: 2, sideRemaining: 2 })
    ).toMatch(/Each view comes with 2 complementary edits/);
    expect(
      productShootEditsSummary({ views: "both", frontRemaining: 2, sideRemaining: 0 })
    ).toMatch(/2 complementary edits left on the front view/);

    const budget = productShootViewBudget({
      views: "both",
      generations: [
        { front_image_s3_key: "front-1", side_image_s3_key: "side-1" },
        { front_image_s3_key: "front-1", side_image_s3_key: "side-2", edited_view: "side", applied_edit_prompt: "nudge" },
        { front_image_s3_key: "front-1", side_image_s3_key: "side-3", edited_view: "side", applied_edit_prompt: "nudge" },
      ],
    });
    expect(budget).toMatchObject({
      frontUsed: 0,
      sideUsed: 2,
      frontRemaining: 2,
      sideRemaining: 0,
      canRegenerateFront: true,
      canRegenerateSide: false,
      canRegenerate: true,
    });
  });

  it("tracks complementary edits separately for regular and close-up model views", () => {
    expect(
      modelShootEditsSummary({ views: "both", frontRemaining: 2, closeUpRemaining: 2 })
    ).toMatch(/Each view comes with 2 complementary edits/);
    expect(
      modelShootEditsSummary({ views: "both", frontRemaining: 2, closeUpRemaining: 0 })
    ).toMatch(/2 complementary edits left on the regular view/);
    expect(
      modelShootEditsSummary({ views: "close_up", frontRemaining: 0, closeUpRemaining: 2 })
    ).toMatch(/Each model shoot comes with 2 complementary edits/);

    const budget = modelShootViewBudget({
      views: "both",
      generations: [
        { front_image_s3_key: "front-1", close_up_image_s3_key: "close-1" },
        {
          front_image_s3_key: "front-1",
          close_up_image_s3_key: "close-2",
          edited_view: "close_up",
          applied_edit_prompt: "nudge",
        },
        {
          front_image_s3_key: "front-1",
          close_up_image_s3_key: "close-3",
          edited_view: "close_up",
          applied_edit_prompt: "nudge",
        },
      ],
    });
    expect(budget).toMatchObject({
      frontUsed: 0,
      closeUpUsed: 2,
      frontRemaining: 2,
      closeUpRemaining: 0,
      canRegenerateFront: true,
      canRegenerateCloseUp: false,
      canRegenerate: true,
    });
  });

  it("does not grant regular-view edits for a close-up-only model shoot", () => {
    const budget = modelShootViewBudget({
      views: "close_up",
      generations: [{ front_image_s3_key: "front-1", close_up_image_s3_key: "close-1" }],
    });
    expect(budget).toMatchObject({
      frontUsed: 0,
      closeUpUsed: 0,
      frontRemaining: 0,
      closeUpRemaining: 2,
      canRegenerateFront: false,
      canRegenerateCloseUp: true,
      canRegenerate: true,
    });
  });
});
