/** First look is the generation; remaining slots are complementary edits. */

export const COMPLEMENTARY_EDITS_PER_VIEW = 2;

export function complementaryEditsIncluded(maxGenerations: number): number {
  return Math.max(0, maxGenerations - 1);
}

export function complementaryEditsLeft(generationsUsed: number, maxGenerations: number): number {
  return Math.max(0, maxGenerations - generationsUsed);
}

/** Label while applying the next complementary edit (1-based). */
export function applyEditProgressLabel(generationsUsed: number, maxGenerations: number): string {
  const total = complementaryEditsIncluded(maxGenerations);
  const n = Math.max(1, generationsUsed);
  return `Edit ${n} of ${total}`;
}

export function applyViewEditProgressLabel(
  editsAlreadyUsed: number,
  included = COMPLEMENTARY_EDITS_PER_VIEW
): string {
  const n = Math.min(included, Math.max(1, editsAlreadyUsed + 1));
  return `Edit ${n} of ${included}`;
}

export function editsLeftLabel(
  left: number,
  included: number,
  shootKind = "model shoot"
): string {
  if (left <= 0) {
    if (included === 2) return "Both complementary edits on this shoot have been used.";
    return `All ${included} complementary edit${included === 1 ? " has" : "s have"} been used.`;
  }
  if (left === included) {
    return `Each ${shootKind} comes with ${included} complementary edit${included === 1 ? "" : "s"}. Use one if you’re not happy with this look.`;
  }
  if (left === 1) return "1 complementary edit left on this shoot.";
  return `${left} complementary edits left on this shoot.`;
}

function remainingPhrase(viewLabel: string, left: number, included: number): string {
  if (left <= 0) return `${viewLabel} edits are used.`;
  if (left === included) return `${included} complementary edits left on the ${viewLabel}.`;
  if (left === 1) return `1 complementary edit left on the ${viewLabel}.`;
  return `${left} complementary edits left on the ${viewLabel}.`;
}

export function productShootEditsSummary(args: {
  views: "front" | "side" | "both";
  frontRemaining: number;
  sideRemaining: number;
  included?: number;
}): string {
  const included = args.included ?? COMPLEMENTARY_EDITS_PER_VIEW;
  if (args.views !== "both") {
    const left = args.views === "side" ? args.sideRemaining : args.frontRemaining;
    return editsLeftLabel(left, included, "product shoot");
  }
  const { frontRemaining: frontLeft, sideRemaining: sideLeft } = args;
  if (frontLeft <= 0 && sideLeft <= 0) {
    return "Both complementary edits on the front view and the side view have been used.";
  }
  if (frontLeft === included && sideLeft === included) {
    return "Each view comes with 2 complementary edits. Apply them separately to the front or side.";
  }
  return `${remainingPhrase("front view", frontLeft, included)} ${remainingPhrase("side view", sideLeft, included)}`;
}

export type ProductShootViewBudget = {
  frontUsed: number;
  sideUsed: number;
  frontRemaining: number;
  sideRemaining: number;
  canRegenerateFront: boolean;
  canRegenerateSide: boolean;
  canRegenerate: boolean;
};

type ProductShootBudgetSource = {
  views?: "front" | "side" | "both";
  front_edits_used?: number | null;
  front_edits_remaining?: number | null;
  can_regenerate_front?: boolean | null;
  side_edits_used?: number | null;
  side_edits_remaining?: number | null;
  can_regenerate_side?: boolean | null;
  generations?: Array<{
    edited_view?: "front" | "side" | null;
    applied_edit_prompt?: string | null;
    front_image_s3_key?: string | null;
    side_image_s3_key?: string | null;
  }>;
};

export function productShootViewBudget(draft: ProductShootBudgetSource | null | undefined): ProductShootViewBudget {
  const views = draft?.views ?? "front";
  const included = COMPLEMENTARY_EDITS_PER_VIEW;
  const tracksFront = views === "front" || views === "both";
  const tracksSide = views === "side" || views === "both";
  const hasExplicit =
    draft?.front_edits_remaining != null ||
    draft?.side_edits_remaining != null ||
    draft?.front_edits_used != null ||
    draft?.side_edits_used != null;

  let frontUsed = 0;
  let sideUsed = 0;
  if (hasExplicit) {
    frontUsed = draft?.front_edits_used ?? Math.max(0, included - (draft?.front_edits_remaining ?? included));
    sideUsed = draft?.side_edits_used ?? Math.max(0, included - (draft?.side_edits_remaining ?? included));
  } else {
    let unlabeled = 0;
    for (const gen of draft?.generations ?? []) {
      if (gen.edited_view === "front") frontUsed += 1;
      else if (gen.edited_view === "side") sideUsed += 1;
      else if (gen.applied_edit_prompt) {
        if (gen.front_image_s3_key && tracksFront) frontUsed += 1;
        if (gen.side_image_s3_key && tracksSide) sideUsed += 1;
        if (tracksFront && !gen.front_image_s3_key && !gen.side_image_s3_key) frontUsed += 1;
      } else {
        unlabeled += 1;
      }
    }
    const extra = Math.max(0, unlabeled - 1);
    if (extra && views === "side") sideUsed += extra;
    else if (extra && views === "front") frontUsed += extra;
  }

  const frontRemaining = tracksFront ? Math.max(0, included - frontUsed) : 0;
  const sideRemaining = tracksSide ? Math.max(0, included - sideUsed) : 0;
  return {
    frontUsed,
    sideUsed,
    frontRemaining,
    sideRemaining,
    canRegenerateFront: tracksFront && frontRemaining > 0,
    canRegenerateSide: tracksSide && sideRemaining > 0,
    canRegenerate: (tracksFront && frontRemaining > 0) || (tracksSide && sideRemaining > 0),
  };
}
