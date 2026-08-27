import { describe, it, expect } from "vitest";
import {
  applyEditProgressLabel,
  complementaryEditsIncluded,
  complementaryEditsLeft,
  editsLeftLabel,
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
    expect(editsLeftLabel(1, 2)).toBe("1 complementary edit left on this shoot.");
    expect(editsLeftLabel(0, 2)).toBe("Both complementary edits on this shoot have been used.");
  });
});
