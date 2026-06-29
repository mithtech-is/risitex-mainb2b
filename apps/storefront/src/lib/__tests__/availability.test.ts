import { describe, it, expect } from "vitest";
import { clampToAvailable } from "../availability";

/**
 * FR-9.02 — the PDP buy panel must not let an MBO key in more units than
 * are sellable (physical − reserved). clampToAvailable is the guard.
 */
describe("clampToAvailable", () => {
  it("leaves a quantity within availability untouched", () => {
    expect(clampToAvailable(5, 10)).toBe(5);
  });

  it("caps a quantity that exceeds availability", () => {
    expect(clampToAvailable(20, 10)).toBe(10);
  });

  it("does not cap when availability is unknown/unmanaged (null)", () => {
    expect(clampToAvailable(20, null)).toBe(20);
  });

  it("floors negatives to zero", () => {
    expect(clampToAvailable(-3, 10)).toBe(0);
  });

  it("returns zero when nothing is available", () => {
    expect(clampToAvailable(5, 0)).toBe(0);
  });
});
