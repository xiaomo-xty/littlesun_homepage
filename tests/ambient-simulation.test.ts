import { describe, expect, test } from "bun:test";
import {
  canFracture,
  fracturePattern,
  pointerRepulsion,
  resolveCircleCollision,
  type SolidBodyState,
} from "../src/lib/ambientSimulation";

describe("ambient entity rules", () => {
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
});
