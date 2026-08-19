import { describe, expect, test } from "bun:test";
import {
  DOLPHIN_JOINT_LENGTHS,
  DOLPHIN_MAX_BENDS,
  advanceDolphinSpine,
  createDolphinSpine,
  rotateAngleTowards,
  sampleDolphinRoute,
  shortestAngleDelta,
} from "../src/lib/dolphinSimulation";

describe("procedural dolphin simulation", () => {
  test("spine solver preserves every joint length", () => {
    const scale = 0.84;
    const spine = createDolphinSpine({ x: 0, y: 0 }, 0.3, scale);
    for (let frame = 0; frame < 240; frame += 1) {
      const time = frame / 60;
      const route = sampleDolphinRoute(time, "figure8", 4.2, 1.8);
      advanceDolphinSpine(spine, route.position, route.heading, time, 1 / 60, scale);
      for (let index = 1; index < spine.length; index += 1) {
        const dx = spine[index].x - spine[index - 1].x;
        const dy = spine[index].y - spine[index - 1].y;
        expect(Math.hypot(dx, dy)).toBeCloseTo(DOLPHIN_JOINT_LENGTHS[index - 1] * scale, 6);
      }
    }
  });

  test("spine solver keeps adjacent bends inside segment limits", () => {
    const spine = createDolphinSpine({ x: 0, y: 0 }, 0);
    for (let frame = 0; frame < 480; frame += 1) {
      const time = frame / 60;
      const route = sampleDolphinRoute(time, "orbit", 3.8, 2.2, 0.36);
      advanceDolphinSpine(spine, route.position, route.heading, time, 1 / 60);
      let parentAngle = route.heading + Math.PI;
      for (let index = 1; index < spine.length; index += 1) {
        const angle = Math.atan2(
          spine[index].y - spine[index - 1].y,
          spine[index].x - spine[index - 1].x,
        );
        expect(Math.abs(shortestAngleDelta(parentAngle, angle)))
          .toBeLessThanOrEqual(DOLPHIN_MAX_BENDS[index - 1] + 0.000001);
        parentAngle = angle;
      }
    }
  });

  test("route heading remains continuous through the angle wrap", () => {
    let previous = sampleDolphinRoute(0, "orbit", 4, 2.2, 0.4).heading;
    for (let frame = 1; frame <= 1200; frame += 1) {
      const heading = sampleDolphinRoute(frame / 60, "orbit", 4, 2.2, 0.4).heading;
      expect(Math.abs(shortestAngleDelta(previous, heading))).toBeLessThan(0.03);
      previous = heading;
    }
  });

  test("angle steering crosses pi without a mirror-like jump", () => {
    const current = Math.PI - 0.02;
    const target = -Math.PI + 0.03;
    const next = rotateAngleTowards(current, target, 0.015);
    expect(shortestAngleDelta(current, next)).toBeCloseTo(0.015, 6);
    expect(Math.abs(shortestAngleDelta(next, target))).toBeLessThan(0.05);
  });
});
