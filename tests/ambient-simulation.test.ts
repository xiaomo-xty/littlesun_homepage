import { describe, expect, test } from "bun:test";
import {
  advanceRibbonChain,
  canFracture,
  fracturePattern,
  pointerRepulsion,
  resolveCircleCollision,
  sampleAmbientDepth,
  sampleJellyPulse,
  sampleOceanFlow,
  scheduleFixedSimulation,
  schoolingSteer,
  type SolidBodyState,
} from "../src/lib/ambientSimulation";

describe("ambient entity rules", () => {
  test("fixed-step scheduling produces identical logic ticks at 30, 60, and 120 fps", () => {
    const countTicks = (fps: number, seconds: number) => {
      let accumulator = 0;
      let ticks = 0;
      let simulatedTime = 0;
      for (let frame = 0; frame < fps * seconds; frame += 1) {
        const schedule = scheduleFixedSimulation(accumulator, 1 / fps);
        accumulator = schedule.accumulator;
        ticks += schedule.count;
        simulatedTime += schedule.simulatedDelta;
      }
      return { accumulator, ticks, simulatedTime };
    };

    const at30 = countTicks(30, 12);
    const at60 = countTicks(60, 12);
    const at120 = countTicks(120, 12);

    expect(at30.ticks).toBe(720);
    expect(at60.ticks).toBe(at30.ticks);
    expect(at120.ticks).toBe(at30.ticks);
    expect(at30.simulatedTime).toBeCloseTo(12, 10);
    expect(at60.simulatedTime).toBeCloseTo(at30.simulatedTime, 10);
    expect(at120.simulatedTime).toBeCloseTo(at30.simulatedTime, 10);
    expect(at120.accumulator).toBeLessThan(1e-9);
  });

  test("fixed-step scheduling caps catch-up work after a long frame", () => {
    const schedule = scheduleFixedSimulation(0, 2);
    expect(schedule.count).toBe(8);
    expect(schedule.simulatedDelta).toBeCloseTo(8 / 60, 10);
    expect(schedule.droppedDelta).toBeGreaterThan(1.8);
    expect(schedule.alpha).toBe(0);
  });

  test("depth profiles make distant pixels smaller, dimmer and slower", () => {
    const far = sampleAmbientDepth(0.08);
    const middle = sampleAmbientDepth(0.5);
    const near = sampleAmbientDepth(0.92);

    expect(far.scale).toBeLessThan(middle.scale);
    expect(middle.scale).toBeLessThan(near.scale);
    expect(far.opacity).toBeLessThan(middle.opacity);
    expect(middle.opacity).toBeLessThan(near.opacity);
    expect(far.drift).toBeLessThan(near.drift);
    expect(far.interaction).toBeLessThan(near.interaction);
  });

  test("jelly pulse contracts quickly, relaxes slowly and closes continuously", () => {
    const resting = sampleJellyPulse(0);
    const contracted = sampleJellyPulse(0.18);
    const relaxing = sampleJellyPulse(0.6);
    const loopEnd = sampleJellyPulse(0.99999);

    expect(resting).toEqual({ contraction: 0, thrust: 0 });
    expect(contracted.contraction).toBeCloseTo(1, 6);
    expect(contracted.thrust).toBe(0);
    expect(relaxing.contraction).toBeGreaterThan(0.35);
    expect(loopEnd.contraction).toBeLessThan(0.00001);
    expect(sampleJellyPulse(0.09).thrust).toBeCloseTo(1, 6);
    expect(sampleJellyPulse(0.4).thrust).toBe(0);
  });

  test("pointer force always points away from the cursor", () => {
    const force = pointerRepulsion({ x: 1, y: 0.5 }, { x: 0, y: 0 }, 3, 2);
    expect(force.x).toBeGreaterThan(0);
    expect(force.y).toBeGreaterThan(0);
    expect(force.x * 1 + force.y * 0.5).toBeGreaterThan(0);
  });

  test("pointer force is zero outside its range", () => {
    expect(pointerRepulsion({ x: 4, y: 0 }, { x: 0, y: 0 }, 3, 2)).toEqual({ x: 0, y: 0 });
  });

  test("solid bodies separate and exchange momentum", () => {
    const first: SolidBodyState = { x: -0.4, y: 0, vx: 1, vy: 0, radius: 0.6, mass: 1, angularVelocity: 0 };
    const second: SolidBodyState = { x: 0.4, y: 0, vx: -1, vy: 0, radius: 0.6, mass: 1, angularVelocity: 0 };
    const result = resolveCircleCollision(first, second, 0.8);
    expect(result.collided).toBe(true);
    expect(result.impact).toBeGreaterThan(1.9);
    expect(first.vx).toBeLessThan(0);
    expect(second.vx).toBeGreaterThan(0);
    expect(second.x - first.x).toBeCloseTo(1.2, 5);
  });

  test("complex shapes fracture into simpler bounded sets", () => {
    const circle = fracturePattern("circle", 2);
    const rectangle = fracturePattern("rect", 2);
    const triangle = fracturePattern("triangle", 1);
    expect(circle).toHaveLength(3);
    expect(circle.every((piece) => piece.kind === "triangle" && piece.level === 1)).toBe(true);
    expect(rectangle.map((piece) => piece.kind)).toEqual(["rect", "rect", "triangle", "triangle"]);
    expect(triangle).toHaveLength(2);
    expect(triangle.every((piece) => piece.level === 0)).toBe(true);
  });

  test("fracturing respects impact, complexity and entity limits", () => {
    expect(canFracture(2, 1.1, 6, 14)).toBe(true);
    expect(canFracture(0, 1.1, 6, 14)).toBe(false);
    expect(canFracture(2, 0.4, 6, 14)).toBe(false);
    expect(canFracture(2, 1.1, 14, 14)).toBe(false);
  });

  test("ocean flow is smooth and bounded", () => {
    const first = sampleOceanFlow({ x: 1.2, y: -0.4 }, 3);
    const second = sampleOceanFlow({ x: 1.21, y: -0.39 }, 3.01);
    expect(Math.hypot(first.x, first.y)).toBeLessThanOrEqual(1.00001);
    expect(Math.hypot(first.x - second.x, first.y - second.y)).toBeLessThan(0.05);
  });

  test("schooling separates close organisms while respecting force limits", () => {
    const subject = { x: 0, y: 0, vx: 0.4, vy: 0 };
    const closeNeighbor = { x: 0.1, y: 0, vx: 0.4, vy: 0 };
    const force = schoolingSteer(subject, [subject, closeNeighbor], {
      neighborRadius: 2,
      separationRadius: 0.5,
      separationWeight: 1,
      alignmentWeight: 0.2,
      cohesionWeight: 0.05,
      maxForce: 0.8,
    });
    expect(force.x).toBeLessThan(0);
    expect(Math.hypot(force.x, force.y)).toBeLessThanOrEqual(0.80001);
  });

  test("ribbon chain keeps its head attached and pulls trailing points", () => {
    const points = [
      { x: 0, y: 0, vx: 0, vy: 0 },
      { x: -1.2, y: 0, vx: 0, vy: 0 },
      { x: -2.4, y: 0, vx: 0, vy: 0 },
    ];
    advanceRibbonChain(points, { x: 1, y: 0.5 }, 0.1, 0.5);
    expect(points[0]).toEqual({ x: 1, y: 0.5, vx: 0, vy: 0 });
    expect(points[1].x).toBeGreaterThan(-1.2);
  });
});
