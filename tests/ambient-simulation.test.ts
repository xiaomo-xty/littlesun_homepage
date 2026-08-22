import { describe, expect, test } from "bun:test";
import {
  AMBIENT_ENTITY_MAX_SPEED,
  AMBIENT_ENTITY_RESTITUTION,
  AMBIENT_JELLY_MAX_SPEED,
  advanceRibbonChain,
  gentlyDisplaceBody,
  limitMotionSpeed,
  limitSolidSpeed,
  pointerRepulsion,
  resolveCircleCollision,
  sampleAmbientDepth,
  sampleJellyLuminescence,
  sampleJellyPulse,
  sampleOceanFlow,
  scheduleFixedSimulation,
  schoolingSteer,
  wrapDriftingBody,
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

  test("jelly luminescence peaks with propulsion and settles into a dim afterglow", () => {
    const resting = sampleJellyLuminescence(0);
    const propelling = sampleJellyLuminescence(0.09);
    const relaxing = sampleJellyLuminescence(0.48);

    expect(resting).toBeLessThan(0.05);
    expect(propelling).toBeGreaterThan(resting + 0.75);
    expect(relaxing).toBeLessThan(propelling);
    expect(relaxing).toBeGreaterThanOrEqual(0.08);
    expect(Math.abs(sampleJellyLuminescence(0.9999) - resting)).toBeLessThan(0.002);
    for (let index = -20; index <= 120; index += 1) {
      expect(sampleJellyLuminescence(index / 100)).toBeWithin(0, 1);
    }
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

  test("ambient contacts settle with low restitution and capped travel speed", () => {
    const first: SolidBodyState = { x: -0.4, y: 0, vx: 1, vy: 0, radius: 0.6, mass: 1, angularVelocity: 0 };
    const second: SolidBodyState = { x: 0.4, y: 0, vx: -1, vy: 0, radius: 0.6, mass: 1, angularVelocity: 0 };
    resolveCircleCollision(first, second, AMBIENT_ENTITY_RESTITUTION);
    expect(first.vx).toBeCloseTo(-AMBIENT_ENTITY_RESTITUTION, 8);
    expect(second.vx).toBeCloseTo(AMBIENT_ENTITY_RESTITUTION, 8);

    second.vx = 3;
    second.vy = 4;
    limitSolidSpeed(second);
    expect(Math.hypot(second.vx, second.vy)).toBeCloseTo(AMBIENT_ENTITY_MAX_SPEED, 8);
    expect(second.vx / second.vy).toBeCloseTo(3 / 4, 8);
  });

  test("jelly motion uses a separate gentle speed cap", () => {
    const jelly = { vx: 3, vy: 4 };
    limitMotionSpeed(jelly, AMBIENT_JELLY_MAX_SPEED);
    expect(Math.hypot(jelly.vx, jelly.vy)).toBeCloseTo(AMBIENT_JELLY_MAX_SPEED, 8);
    expect(jelly.vx / jelly.vy).toBeCloseTo(3 / 4, 8);
  });

  test("drifting bodies wrap through the offscreen margin without sticking to an edge", () => {
    const body = { x: -6.42, y: 3.31 };
    expect(wrapDriftingBody(body, 5, 2.5, 0.4)).toBe(true);
    expect(body.x).toBeCloseTo(4.38, 8);
    expect(body.y).toBeCloseTo(-2.49, 8);

    const inside = { x: 5.39, y: -2.89 };
    expect(wrapDriftingBody(inside, 5, 2.5, 0.4)).toBe(false);
    expect(inside).toEqual({ x: 5.39, y: -2.89 });
  });

  test("dolphin contact gently separates a relic and keeps its speed capped", () => {
    const relic: SolidBodyState = {
      x: 0.22,
      y: 0,
      vx: 0.02,
      vy: 0,
      radius: 0.32,
      mass: 1,
      angularVelocity: 0,
    };
    const contacted = gentlyDisplaceBody(relic, { x: 0, y: 0 }, 0.7, { x: 1.1, y: 0 });

    expect(contacted).toBe(true);
    expect(relic.x).toBeGreaterThan(0.22);
    expect(relic.vx).toBeGreaterThan(0);
    expect(Math.hypot(relic.vx, relic.vy)).toBeLessThanOrEqual(AMBIENT_ENTITY_MAX_SPEED);

    for (let index = 0; index < 120; index += 1) {
      gentlyDisplaceBody(relic, { x: relic.x - 0.05, y: relic.y }, 0.7, { x: 2, y: 0 });
    }
    expect(Math.hypot(relic.vx, relic.vy)).toBeLessThanOrEqual(AMBIENT_ENTITY_MAX_SPEED);
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
