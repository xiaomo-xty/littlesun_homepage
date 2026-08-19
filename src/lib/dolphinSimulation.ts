export type DolphinRoute = "figure8" | "orbit";

export type Vec2 = {
  x: number;
  y: number;
};

export type DolphinSpinePoint = Vec2;

export type RouteSample = {
  position: Vec2;
  velocity: Vec2;
  heading: number;
};

export type RepulsionState = Vec2 & {
  vx: number;
  vy: number;
};

export const DOLPHIN_JOINT_LENGTHS = [0.43, 0.48, 0.5, 0.48, 0.43, 0.37, 0.31] as const;
export const DOLPHIN_MAX_BENDS = [0.12, 0.14, 0.17, 0.22, 0.3, 0.4, 0.52] as const;
export const DOLPHIN_BODY_LENGTH = DOLPHIN_JOINT_LENGTHS.reduce((sum, length) => sum + length, 0);

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function normalizeAngle(angle: number) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

export function shortestAngleDelta(from: number, to: number) {
  return normalizeAngle(to - from);
}

export function rotateAngleTowards(current: number, target: number, maximumStep: number) {
  const delta = shortestAngleDelta(current, target);
  return current + clamp(delta, -maximumStep, maximumStep);
}

export function createDolphinSpine(
  head: Vec2,
  heading: number,
  scale = 1,
  lengths: readonly number[] = DOLPHIN_JOINT_LENGTHS,
) {
  const points: DolphinSpinePoint[] = [{ x: head.x, y: head.y }];
  let x = head.x;
  let y = head.y;
  const behind = heading + Math.PI;
  for (const length of lengths) {
    x += Math.cos(behind) * length * scale;
    y += Math.sin(behind) * length * scale;
    points.push({ x, y });
  }
  return points;
}

export function advanceDolphinSpine(
  points: DolphinSpinePoint[],
  head: Vec2,
  heading: number,
  time: number,
  delta: number,
  scale = 1,
  lengths: readonly number[] = DOLPHIN_JOINT_LENGTHS,
  maximumBends: readonly number[] = DOLPHIN_MAX_BENDS,
) {
  if (points.length !== lengths.length + 1) {
    throw new Error("Dolphin spine point count must match its joint lengths");
  }

  points[0].x = head.x;
  points[0].y = head.y;
  let parentBehindAngle = heading + Math.PI;

  for (let index = 1; index < points.length; index += 1) {
    const parent = points[index - 1];
    const point = points[index];
    const tailProgress = index / (points.length - 1);
    const bendLimit = maximumBends[index - 1] ?? maximumBends[maximumBends.length - 1] ?? 0.4;
    const currentBehindAngle = Math.atan2(point.y - parent.y, point.x - parent.x);
    const wave = Math.sin(time * 4.15 - index * 0.78)
      * Math.pow(tailProgress, 1.85)
      * bendLimit
      * 0.72;
    const desiredBehindAngle = parentBehindAngle + wave;
    const response = 3.8 + tailProgress * 4.4;
    let nextBehindAngle = rotateAngleTowards(
      currentBehindAngle,
      desiredBehindAngle,
      Math.max(0.001, response * delta),
    );
    const relativeBend = clamp(shortestAngleDelta(parentBehindAngle, nextBehindAngle), -bendLimit, bendLimit);
    nextBehindAngle = parentBehindAngle + relativeBend;

    const segmentLength = lengths[index - 1] * scale;
    point.x = parent.x + Math.cos(nextBehindAngle) * segmentLength;
    point.y = parent.y + Math.sin(nextBehindAngle) * segmentLength;
    parentBehindAngle = nextBehindAngle;
  }

  return points;
}

export function sampleDolphinRoute(
  seconds: number,
  route: DolphinRoute,
  radiusX: number,
  radiusY: number,
  speed = 0.24,
): RouteSample {
  const phase = seconds * speed;
  let x: number;
  let y: number;
  let vx: number;
  let vy: number;

  if (route === "orbit") {
    x = Math.cos(phase) * radiusX;
    y = Math.sin(phase) * radiusY;
    vx = -Math.sin(phase) * radiusX * speed;
    vy = Math.cos(phase) * radiusY * speed;
  } else {
    x = Math.sin(phase) * radiusX;
    y = Math.sin(phase * 2) * radiusY;
    vx = Math.cos(phase) * radiusX * speed;
    vy = Math.cos(phase * 2) * radiusY * speed * 2;
  }

  return {
    position: { x, y },
    velocity: { x: vx, y: vy },
    heading: Math.atan2(vy, vx),
  };
}

export function advanceRepulsionOffset(
  state: RepulsionState,
  force: Vec2,
  delta: number,
  spring = 1.7,
  damping = 3.3,
) {
  state.vx += (force.x - state.x * spring) * delta;
  state.vy += (force.y - state.y * spring) * delta;
  const drag = Math.exp(-damping * delta);
  state.vx *= drag;
  state.vy *= drag;
  state.x += state.vx * delta;
  state.y += state.vy * delta;
  return state;
}

export function sampleSpineFrame(points: readonly DolphinSpinePoint[], progress: number) {
  if (points.length < 2) throw new Error("Dolphin spine requires at least two points");
  const clampedProgress = clamp(progress, 0, 1);
  const scaled = clampedProgress * (points.length - 1);
  const index = Math.min(points.length - 2, Math.floor(scaled));
  const amount = Math.min(1, scaled - index);
  const front = points[index];
  const back = points[index + 1];
  const x = front.x + (back.x - front.x) * amount;
  const y = front.y + (back.y - front.y) * amount;
  const backwardX = back.x - front.x;
  const backwardY = back.y - front.y;
  const length = Math.max(0.0001, Math.hypot(backwardX, backwardY));
  const tangent = { x: -backwardX / length, y: -backwardY / length };
  return {
    position: { x, y },
    tangent,
    normal: { x: -tangent.y, y: tangent.x },
  };
}
