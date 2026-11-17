import { describe, it, expect } from "vitest";
import { validateBundle } from "../types/schema";
import { indexBundle } from "./model";
import { isLow, quantile, summarize, targetStats } from "./targetStats";

describe("targetStats", () => {
  it("zählt Belegung und Häufigkeit; fehlende Aggregate gelten als unbelegt", () => {
    const idx = indexBundle(
      validateBundle({
        meta: { name: "mini" },
        entities: [{ id: "a", label: "A" }, { id: "b" }],
        time_slices: [
          { id: "t0", index: 0 },
          { id: "t1", index: 1 },
          { id: "t2", index: 2 },
        ],
        anchors: [],
        aggregates: [
          { entity_id: "a", time_slice_id: "t0", coords_3d: [0, 0, 0], freq: 5 },
          { entity_id: "a", time_slice_id: "t1", coords_3d: [0, 0, 0], freq: 0 },
          { entity_id: "a", time_slice_id: "t2", coords_3d: [0, 0, 0], freq: 3 },
          { entity_id: "b", time_slice_id: "t1", coords_3d: [0, 0, 0], freq: 7 },
        ],
      }),
    );
    const [a, b] = targetStats(idx);
    expect(a).toMatchObject({ label: "A", freqs: [5, 0, 3], belegt: 2, total: 8 });
    expect(b).toMatchObject({ label: "b", freqs: [0, 7, 0], belegt: 1, total: 7 });
  });
});

describe("quantile / summarize / isLow", () => {
  it("interpoliert linear", () => {
    expect(quantile([1, 2, 3, 4], 0.25)).toBeCloseTo(1.75);
    expect(quantile([1, 2, 3, 4], 0.5)).toBeCloseTo(2.5);
    expect(quantile([7], 0.25)).toBe(7);
  });

  it("fasst zusammen", () => {
    expect(summarize([4, 1, 3, 2])).toEqual({ n: 4, min: 1, q1: 1.75, median: 2.5, mean: 2.5, q3: 3.25, max: 4 });
    expect(summarize([])).toBeNull();
  });

  it("markiert das untere Quartil, aber nicht bei fehlender Streuung", () => {
    const s = summarize([1, 2, 3, 4]);
    expect(isLow(1, s)).toBe(true);
    expect(isLow(2, s)).toBe(false);
    expect(isLow(5, summarize([5, 5, 5]))).toBe(false);
  });
});
