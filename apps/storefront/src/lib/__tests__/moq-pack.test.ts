import { describe, it, expect } from "vitest";
import {
  packSizeOf,
  cellPieces,
  maxPacksForStock,
  meetsMoq,
} from "../moq-pack";

describe("moq-pack", () => {
  it("packSizeOf defaults to 1", () => {
    expect(packSizeOf(undefined)).toBe(1);
    expect(packSizeOf(0)).toBe(1);
    expect(packSizeOf(-3)).toBe(1);
    expect(packSizeOf(4)).toBe(4);
  });

  it("cellPieces multiplies pack count by pack size", () => {
    expect(cellPieces(1, 4)).toBe(4);
    expect(cellPieces(3, 1)).toBe(3);
    expect(cellPieces(0, 4)).toBe(0);
  });

  it("maxPacksForStock floors available pieces by pack size", () => {
    expect(maxPacksForStock(10, 4)).toBe(2);
    expect(maxPacksForStock(8, 4)).toBe(2);
    expect(maxPacksForStock(null, 4)).toBe(Infinity);
    expect(maxPacksForStock(3, 1)).toBe(3);
  });

  it("meetsMoq compares total pieces to moq", () => {
    expect(meetsMoq(4, 4)).toBe(true);
    expect(meetsMoq(3, 4)).toBe(false);
    expect(meetsMoq(0, 0)).toBe(true);
  });
});
