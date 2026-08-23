import { describe, expect, test } from "bun:test";
import { sampleIdleParallax } from "../src/lib/idleParallax";

describe("sampleIdleParallax", () => {
  test("stays inside its deliberately small motion envelope", () => {
    for (let time = 0; time <= 12_800; time += 32) {
      const sample = sampleIdleParallax(time, 12_800, 0.15, 0.1, 0.35);
      expect(Math.abs(sample.x)).toBeLessThanOrEqual(0.1741);
      expect(Math.abs(sample.y)).toBeLessThanOrEqual(0.1121);
    }
  });

  test("joins the end of each cycle without a position jump", () => {
    const start = sampleIdleParallax(0, 11_200, 0.06, 0.045, 1.2);
    const end = sampleIdleParallax(11_200, 11_200, 0.06, 0.045, 1.2);

    expect(end.x).toBeCloseTo(start.x, 10);
    expect(end.y).toBeCloseTo(start.y, 10);
  });
});
