export type Vector2Like = { x: number; y: number };

export type SolidKind = "rect" | "circle" | "triangle";

export type SolidBodyState = Vector2Like & {
  vx: number;
  vy: number;
  radius: number;
  mass: number;
  angularVelocity: number;
};

export type CollisionResult = {
  collided: boolean;
  impact: number;
  nx: number;
  ny: number;
};

export type FracturePiece = {
  kind: SolidKind;
  level: number;
  radiusRatio: number;
  direction: Vector2Like;
};

export function pointerRepulsion(
  position: Vector2Like,
  pointer: Vector2Like,
  range: number,
  intensity: number,
  output: Vector2Like = { x: 0, y: 0 },
): Vector2Like {
  const dx = position.x - pointer.x;
  const dy = position.y - pointer.y;
  const distance = Math.hypot(dx, dy);
  if (distance >= range || range <= 0) {
    output.x = 0;
    output.y = 0;
    return output;
  }

  const nx = distance > 0.0001 ? dx / distance : 1;
  const ny = distance > 0.0001 ? dy / distance : 0;
  const falloff = 1 - distance / range;
  const strength = falloff * falloff * intensity;
  output.x = nx * strength;
  output.y = ny * strength;
  return output;
}

export function resolveCircleCollision(
  first: SolidBodyState,
  second: SolidBodyState,
  restitution = 0.72,
  output: CollisionResult = { collided: false, impact: 0, nx: 0, ny: 0 },
): CollisionResult {
  const dx = second.x - first.x;
  const dy = second.y - first.y;
  const minimumDistance = first.radius + second.radius;
  const distanceSquared = dx * dx + dy * dy;
  if (distanceSquared >= minimumDistance * minimumDistance) {
    output.collided = false;
    output.impact = 0;
    output.nx = 0;
    output.ny = 0;
    return output;
  }

  const distance = Math.sqrt(Math.max(distanceSquared, 0.000001));
  const nx = distance > 0.0001 ? dx / distance : 1;
  const ny = distance > 0.0001 ? dy / distance : 0;
  const inverseFirstMass = 1 / Math.max(0.01, first.mass);
  const inverseSecondMass = 1 / Math.max(0.01, second.mass);
  const inverseMassTotal = inverseFirstMass + inverseSecondMass;
  const overlap = minimumDistance - distance;

  first.x -= nx * overlap * (inverseFirstMass / inverseMassTotal);
  first.y -= ny * overlap * (inverseFirstMass / inverseMassTotal);
  second.x += nx * overlap * (inverseSecondMass / inverseMassTotal);
  second.y += ny * overlap * (inverseSecondMass / inverseMassTotal);

  const relativeX = second.vx - first.vx;
  const relativeY = second.vy - first.vy;
  const normalSpeed = relativeX * nx + relativeY * ny;
  const impact = Math.max(0, -normalSpeed);
  if (normalSpeed < 0) {
    const impulse = -(1 + restitution) * normalSpeed / inverseMassTotal;
    const impulseX = impulse * nx;
    const impulseY = impulse * ny;
    first.vx -= impulseX * inverseFirstMass;
    first.vy -= impulseY * inverseFirstMass;
    second.vx += impulseX * inverseSecondMass;
    second.vy += impulseY * inverseSecondMass;

    const tangentSpeed = relativeX * -ny + relativeY * nx;
    first.angularVelocity -= tangentSpeed * 0.08 * inverseFirstMass;
    second.angularVelocity += tangentSpeed * 0.08 * inverseSecondMass;
  }

  output.collided = true;
  output.impact = impact;
  output.nx = nx;
  output.ny = ny;
  return output;
}

export function fracturePattern(kind: SolidKind, level: number): FracturePiece[] {
  if (level <= 0) return [];
  const nextLevel = level - 1;

  if (kind === "circle") {
    return [0, 1, 2].map((index) => {
      const angle = index / 3 * Math.PI * 2;
      return {
        kind: "triangle" as const,
        level: nextLevel,
        radiusRatio: 0.46,
        direction: { x: Math.cos(angle), y: Math.sin(angle) },
      };
    });
  }

  if (kind === "rect") {
    return [
      { kind: "rect", level: nextLevel, radiusRatio: 0.52, direction: { x: -0.82, y: 0.18 } },
      { kind: "rect", level: nextLevel, radiusRatio: 0.48, direction: { x: 0.78, y: -0.24 } },
      { kind: "triangle", level: nextLevel, radiusRatio: 0.38, direction: { x: -0.2, y: -0.9 } },
      { kind: "triangle", level: nextLevel, radiusRatio: 0.36, direction: { x: 0.28, y: 0.86 } },
    ];
  }

  return [
    { kind: "triangle", level: nextLevel, radiusRatio: 0.58, direction: { x: -0.74, y: -0.36 } },
    { kind: "triangle", level: nextLevel, radiusRatio: 0.56, direction: { x: 0.72, y: 0.4 } },
  ];
}

export function canFracture(level: number, impact: number, entityCount: number, entityLimit: number) {
  return level > 0 && impact >= 0.82 && entityCount < entityLimit;
}
