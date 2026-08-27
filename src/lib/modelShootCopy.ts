/** First look is the generation; remaining slots are complementary edits. */

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

export function editsLeftLabel(left: number, included: number): string {
  if (left <= 0) {
    if (included === 2) return "Both complementary edits on this shoot have been used.";
    return `All ${included} complementary edit${included === 1 ? " has" : "s have"} been used.`;
  }
  if (left === included) {
    return `Each model shoot comes with ${included} complementary edit${included === 1 ? "" : "s"}. Use one if you’re not happy with this look.`;
  }
  if (left === 1) return "1 complementary edit left on this shoot.";
  return `${left} complementary edits left on this shoot.`;
}
