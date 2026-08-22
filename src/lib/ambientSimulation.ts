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

export type BoidState = Vector2Like & {
  vx: number;
  vy: number;
};

export type SchoolingOptions = {
  neighborRadius: number;
  separationRadius: number;
  separationWeight: number;
  alignmentWeight: number;
  cohesionWeight: number;
  maxForce: number;
};

export type RibbonPoint = BoidState;

export type AmbientDepthProfile = {
  scale: number;
  opacity: number;
  drift: number;
  interaction: number;
};

export type JellyPulseSample = {
  contraction: number;
  thrust: number;
};

export type FixedStepSchedule = {
  count: number;
  delta: number;
  accumulator: number;
  alpha: number;
  simulatedDelta: number;
  droppedDelta: number;
};

export const AMBIENT_FIXED_STEP = 1 / 60;
export const AMBIENT_MAX_FIXED_STEPS = 8;
export const AMBIENT_ENTITY_RESTITUTION = 0.28;
export const AMBIENT_ENTITY_MAX_SPEED = 0.72;
export const AMBIENT_JELLY_MAX_SPEED = 0.24;

export function scheduleFixedSimulation(
  accumulator: number,
  frameDelta: number,
  fixedStep = AMBIENT_FIXED_STEP,
  maximumSteps = AMBIENT_MAX_FIXED_STEPS,
): FixedStepSchedule {
  const safeStep = Math.max(0.0001, fixedStep);
  const safeMaximumSteps = Math.max(1, Math.floor(maximumSteps));
  const safeAccumulator = Math.max(0, Math.min(safeStep * (1 - 1e-9), accumulator));
  const safeFrameDelta = Math.max(0, frameDelta);
  const acceptedDelta = Math.min(safeFrameDelta, safeStep * safeMaximumSteps);
  const available = safeAccumulator + acceptedDelta;
  const count = Math.min(
    safeMaximumSteps,
    Math.floor((available + safeStep * 1e-9) / safeStep),
  );
  const nextAccumulator = Math.max(0, available - count * safeStep);

  return {
    count,
    delta: safeStep,
    accumulator: nextAccumulator,
    alpha: Math.max(0, Math.min(1, nextAccumulator / safeStep)),
    simulatedDelta: count * safeStep,
    droppedDelta: safeFrameDelta - acceptedDelta,
  };
}

export function limitMotionSpeed<T extends { vx: number; vy: number }>(body: T, maximumSpeed: number): T {
  const safeMaximum = Math.max(0, maximumSpeed);
  const speed = Math.hypot(body.vx, body.vy);
  if (speed > safeMaximum && speed > 0.0001) {
    const scale = safeMaximum / speed;
    body.vx *= scale;
    body.vy *= scale;
  }
  return body;
}

export function limitSolidSpeed<T extends SolidBodyState>(body: T, maximumSpeed = AMBIENT_ENTITY_MAX_SPEED): T {
  return limitMotionSpeed(body, maximumSpeed);
}

export function destructibleWeight(level: number, radius: number) {
  const safeLevel = Math.max(0, level);
  const safeRadius = Math.max(0, radius);
  return safeRadius * safeRadius * (1 + safeLevel * 0.35);
}

export function shouldRegenerateDestructibles(
  currentWeight: number,
  lowerThreshold: number,
  upperThreshold: number,
  currentlyActive: boolean,
) {
  const lower = Math.max(0, Math.min(lowerThreshold, upperThreshold));
  const upper = Math.max(lower, lowerThreshold, upperThreshold);
  const current = Math.max(0, currentWeight);
  return currentlyActive ? current < upper : current < lower;
}

function smoothstep(value: number) {
  const clamped = Math.max(0, Math.min(1, value));
  return clamped * clamped * (3 - 2 * clamped);
}

export function sampleAmbientDepth(depth: number): AmbientDepthProfile {
  const normalized = Math.max(0, Math.min(1, depth));
  const eased = smoothstep(normalized);
  return {
    scale: 0.38 + eased * 1.34,
    opacity: 0.18 + eased * 0.48,
    drift: 0.52 + eased * 0.7,
    interaction: 0.28 + eased * 0.92,
  };
}

export function sampleJellyPulse(phase: number): JellyPulseSample {
  const wrapped = ((phase % 1) + 1) % 1;
  const contractionEnd = 0.18;
  const contraction = wrapped < contractionEnd
    ? smoothstep(wrapped / contractionEnd)
    : 1 - smoothstep((wrapped - contractionEnd) / (1 - contractionEnd));
  const rawThrust = wrapped < contractionEnd
    ? Math.sin(wrapped / contractionEnd * Math.PI) ** 2
    : 0;
  const thrust = rawThrust < 1e-12 ? 0 : rawThrust;
  return { contraction, thrust };
}

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
  return level >= 0 && impact >= 0.82 && entityCount <= entityLimit;
}

export function sampleOceanFlow(
  position: Vector2Like,
  time: number,
  output: Vector2Like = { x: 0, y: 0 },
): Vector2Like {
  const xPhase = position.x * 0.42 + time * 0.11;
  const yPhase = position.y * 0.5 - time * 0.08;
  const crossPhase = (position.x + position.y) * 0.23 + time * 0.045;

  // Curl of a small analytic stream function. The field stays smooth and divergence-light.
  output.x = -0.5 * Math.sin(yPhase) + 0.1035 * Math.cos(crossPhase);
  output.y = -0.42 * Math.cos(xPhase) - 0.1035 * Math.cos(crossPhase);
  const length = Math.hypot(output.x, output.y);
  if (length > 1) {
    output.x /= length;
    output.y /= length;
  }
  return output;
}

export function schoolingSteer(
  subject: BoidState,
  neighbors: readonly BoidState[],
  options: SchoolingOptions,
  output: Vector2Like = { x: 0, y: 0 },
): Vector2Like {
  let separationX = 0;
  let separationY = 0;
  let alignmentX = 0;
  let alignmentY = 0;
  let cohesionX = 0;
  let cohesionY = 0;
  let neighborCount = 0;
  let separationCount = 0;

  neighbors.forEach((neighbor) => {
    if (neighbor === subject) return;
    const dx = neighbor.x - subject.x;
    const dy = neighbor.y - subject.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= 0.0001 || distance > options.neighborRadius) return;

    neighborCount += 1;
    alignmentX += neighbor.vx;
    alignmentY += neighbor.vy;
    cohesionX += neighbor.x;
    cohesionY += neighbor.y;

    if (distance < options.separationRadius) {
      const inverseDistance = 1 / Math.max(0.001, distance * distance);
      separationX -= dx * inverseDistance;
      separationY -= dy * inverseDistance;
      separationCount += 1;
    }
  });

  output.x = 0;
  output.y = 0;
  if (separationCount > 0) {
    output.x += separationX / separationCount * options.separationWeight;
    output.y += separationY / separationCount * options.separationWeight;
  }
  if (neighborCount > 0) {
    output.x += (alignmentX / neighborCount - subject.vx) * options.alignmentWeight;
    output.y += (alignmentY / neighborCount - subject.vy) * options.alignmentWeight;
    output.x += (cohesionX / neighborCount - subject.x) * options.cohesionWeight;
    output.y += (cohesionY / neighborCount - subject.y) * options.cohesionWeight;
  }

  const force = Math.hypot(output.x, output.y);
  if (force > options.maxForce && force > 0) {
    output.x = output.x / force * options.maxForce;
    output.y = output.y / force * options.maxForce;
  }
  return output;
}

export function advanceRibbonChain(
  points: RibbonPoint[],
  head: Vector2Like,
  delta: number,
  segmentLength: number,
  stiffness = 18,
  damping = 5.4,
) {
  if (points.length === 0) return points;
  points[0].x = head.x;
  points[0].y = head.y;
  points[0].vx = 0;
  points[0].vy = 0;

  for (let index = 1; index < points.length; index += 1) {
    const point = points[index];
    const leader = points[index - 1];
    const dx = point.x - leader.x;
    const dy = point.y - leader.y;
    const distance = Math.max(0.0001, Math.hypot(dx, dy));
    const targetX = leader.x + dx / distance * segmentLength;
    const targetY = leader.y + dy / distance * segmentLength;
    point.vx += (targetX - point.x) * stiffness * delta;
    point.vy += (targetY - point.y) * stiffness * delta;
    const drag = Math.exp(-damping * delta);
    point.vx *= drag;
    point.vy *= drag;
    point.x += point.vx * delta;
    point.y += point.vy * delta;
  }
  return points;
}
