import { describe, expect, test } from "bun:test";
import {
  DOLPHIN_JOINT_LENGTHS,
  DOLPHIN_MAX_BENDS,
  advanceDolphinRoutePhase,
  advanceDolphinSpine,
  createDolphinSpine,
  rotateAngleTowards,
  sampleDolphinRoute,
  sampleDolphinRoutePhase,
  shortestAngleDelta,
} from "../src/lib/dolphinSimulation";

describe("procedural dolphin simulation", () => {
  test("spine solver preserves every joint length", () => {
    const scale = 0.84;
    const spine = createDolphinSpine({ x: 0, y: 0 }, 0.3, scale);
    for (let frame = 0; frame < 240; frame += 1) {
      const time = frame / 60;
      const route = sampleDolphinRoute(time, "figure8", 4.2, 1.8);
      advanceDolphinSpine(spine, route.position, time, 1 / 60, scale);
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
      advanceDolphinSpine(spine, route.position, time, 1 / 60);
      let parentAngle = Math.atan2(
        spine[1].y - spine[0].y,
        spine[1].x - spine[0].x,
      );
      for (let index = 2; index < spine.length; index += 1) {
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

  test("figure-eight head travel stays nearly constant instead of pausing to pivot", () => {
    let phase = 0;
    let previous = sampleDolphinRoutePhase(phase, "figure8", 4.2, 1.55).position;
    const distances: number[] = [];
    for (let frame = 0; frame < 900; frame += 1) {
      phase = advanceDolphinRoutePhase(phase, "figure8", 4.2, 1.55, 1 / 60);
      const next = sampleDolphinRoutePhase(phase, "figure8", 4.2, 1.55).position;
      distances.push(Math.hypot(next.x - previous.x, next.y - previous.y));
      previous = next;
    }
    expect(Math.min(...distances)).toBeGreaterThan(0.015);
    expect(Math.max(...distances)).toBeLessThan(0.0175);
  });

  test("the head pulls the first body segment instead of rotating the body in place", () => {
    const spine = createDolphinSpine({ x: 0, y: 0 }, 0);
    const previousFirstBodyPoint = { ...spine[1] };

    advanceDolphinSpine(spine, { x: 0, y: 0.1 }, 0, 1 / 60);

    const firstBodyTravel = Math.hypot(
      spine[1].x - previousFirstBodyPoint.x,
      spine[1].y - previousFirstBodyPoint.y,
    );
    const frontTangent = {
      x: spine[0].x - spine[1].x,
      y: spine[0].y - spine[1].y,
    };
    const tangentLength = Math.hypot(frontTangent.x, frontTangent.y);

    expect(firstBodyTravel).toBeLessThan(0.03);
    expect(frontTangent.x / tangentLength).toBeGreaterThan(0.95);
    expect(frontTangent.y / tangentLength).toBeLessThan(0.3);
  });

  test("angle steering crosses pi without a mirror-like jump", () => {
    const current = Math.PI - 0.02;
    const target = -Math.PI + 0.03;
    const next = rotateAngleTowards(current, target, 0.015);
    expect(shortestAngleDelta(current, next)).toBeCloseTo(0.015, 6);
    expect(Math.abs(shortestAngleDelta(next, target))).toBeLessThan(0.05);
  });
});
