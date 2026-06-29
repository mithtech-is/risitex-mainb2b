import { describe, it, expect } from "vitest";
import { gstStateCode, gstBreakdown } from "../india-gst";

/**
 * FR-4.02 — the wholesale checkout must show the real GST the backend computes
 * (CGST/SGST intra-state vs IGST inter-state), not a hardcoded flat rate.
 * Amounts always come from the cart's tax_total; these helpers map the buyer's
 * state to a code and split that total into the right display lines.
 */
describe("gstStateCode", () => {
  it("maps Karnataka to the seller-home code", () => {
    expect(gstStateCode("Karnataka")).toBe("ka");
  });

  it("maps other states to their ISO subdivision code", () => {
    expect(gstStateCode("Maharashtra")).toBe("mh");
    expect(gstStateCode("Tamil Nadu")).toBe("tn");
    expect(gstStateCode("Delhi")).toBe("dl");
  });

  it("is case- and whitespace-insensitive", () => {
    expect(gstStateCode("  karnataka ")).toBe("ka");
  });

  it("returns null for an unknown state", () => {
    expect(gstStateCode("Atlantis")).toBeNull();
  });
});

describe("gstBreakdown", () => {
  it("splits intra-state tax into equal CGST + SGST", () => {
    expect(gstBreakdown("ka", "ka", 1000)).toEqual([
      { label: "CGST", amountPaise: 500 },
      { label: "SGST", amountPaise: 500 },
    ]);
  });

  it("puts the odd paisa on CGST so the halves still sum to the total", () => {
    expect(gstBreakdown("ka", "ka", 1001)).toEqual([
      { label: "CGST", amountPaise: 501 },
      { label: "SGST", amountPaise: 500 },
    ]);
  });

  it("reports a single IGST line inter-state", () => {
    expect(gstBreakdown("mh", "ka", 1000)).toEqual([
      { label: "IGST", amountPaise: 1000 },
    ]);
  });

  it("treats an unknown buyer state as inter-state (IGST)", () => {
    expect(gstBreakdown(null, "ka", 1000)).toEqual([
      { label: "IGST", amountPaise: 1000 },
    ]);
  });

  it("returns no lines when there is no tax", () => {
    expect(gstBreakdown("ka", "ka", 0)).toEqual([]);
  });
});
