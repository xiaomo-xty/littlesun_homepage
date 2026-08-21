export type DolphinRoute = "wander" | "cruise";

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

export type CubicBezierSegment = {
  start: Vec2;
  control1: Vec2;
  control2: Vec2;
  end: Vec2;
};

export type DolphinBezierPath = {
  guidePoints: Vec2[];
  segments: CubicBezierSegment[];
  arcLengthSamples: Array<{ distance: number; parameter: number }>;
  segmentLengths: number[];
  totalLength: number;
};

export type DolphinPathBounds = {
  x: number;
  y: number;
};

export type DolphinPathStream = {
  route: DolphinRoute;
  bounds: DolphinPathBounds;
  spacing: number;
  guidePoints: Vec2[];
  path: DolphinBezierPath;
  target: Vec2;
  targetStepsRemaining: number;
  heading: number;
  turnRate: number;
  revision: number;
  random: () => number;
};

export type DolphinPathAdvance = {
  distance: number;
  advancedSegments: number;
};

export type RepulsionState = Vec2 & {
  vx: number;
  vy: number;
};

export const DOLPHIN_JOINT_LENGTHS = [0.43, 0.48, 0.5, 0.48, 0.43, 0.37, 0.31] as const;
export const DOLPHIN_MAX_BENDS = [0.12, 0.14, 0.17, 0.22, 0.3, 0.4, 0.52] as const;
export const DOLPHIN_BODY_LENGTH = DOLPHIN_JOINT_LENGTHS.reduce((sum, length) => sum + length, 0);
export const DOLPHIN_SIMULATION_STEP = 1 / 120;
export const DOLPHIN_MAX_SUBSTEPS = 5;

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

export function calculateSimulationSubsteps(
  delta: number,
  maximumStep = DOLPHIN_SIMULATION_STEP,
  maximumSubsteps = DOLPHIN_MAX_SUBSTEPS,
) {
  const safeMaximumStep = Math.max(0.0001, maximumStep);
  const safeMaximumSubsteps = Math.max(1, Math.floor(maximumSubsteps));
  const simulatedDelta = clamp(delta, 0, safeMaximumStep * safeMaximumSubsteps);
  if (simulatedDelta === 0) return { count: 0, delta: 0, simulatedDelta: 0 };
  const count = Math.min(safeMaximumSubsteps, Math.ceil(simulatedDelta / safeMaximumStep));
  return {
    count,
    delta: simulatedDelta / count,
    simulatedDelta,
  };
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
  time: number,
  delta: number,
  scale = 1,
  lengths: readonly number[] = DOLPHIN_JOINT_LENGTHS,
  maximumBends: readonly number[] = DOLPHIN_MAX_BENDS,
) {
  if (points.length !== lengths.length + 1) {
    throw new Error("Dolphin spine point count must match its joint lengths");
  }

  const previousSegmentAngles = points.slice(1).map((point, index) => Math.atan2(
    point.y - points[index].y,
    point.x - points[index].x,
  ));
  points[0].x = head.x;
  points[0].y = head.y;
  let parentBehindAngle: number | undefined;

  for (let index = 1; index < points.length; index += 1) {
    const parent = points[index - 1];
    const point = points[index];
    const tailProgress = index / (points.length - 1);
    const bendLimit = maximumBends[index - 1] ?? maximumBends[maximumBends.length - 1] ?? 0.4;
    let nextBehindAngle = Math.atan2(point.y - parent.y, point.x - parent.x);

    if (parentBehindAngle !== undefined) {
      const relativeBend = clamp(
        shortestAngleDelta(parentBehindAngle, nextBehindAngle),
        -bendLimit,
        bendLimit,
      );
      nextBehindAngle = parentBehindAngle + relativeBend;

      const waveTarget = parentBehindAngle
        + Math.sin(time * 4.15 - index * 0.78)
        * Math.pow(tailProgress, 2.15)
        * bendLimit
        * 0.48;
      const waveFollow = 1 - Math.exp(-(0.7 + tailProgress * 1.7) * delta);
      nextBehindAngle += shortestAngleDelta(nextBehindAngle, waveTarget) * waveFollow;
      const temporalLimit = (2.2 + tailProgress * 1.1) * delta;
      nextBehindAngle = rotateAngleTowards(
        previousSegmentAngles[index - 1],
        nextBehindAngle,
        temporalLimit,
      );
      nextBehindAngle = parentBehindAngle + clamp(
        shortestAngleDelta(parentBehindAngle, nextBehindAngle),
        -bendLimit,
        bendLimit,
      );
    }

    const segmentLength = lengths[index - 1] * scale;
    point.x = parent.x + Math.cos(nextBehindAngle) * segmentLength;
    point.y = parent.y + Math.sin(nextBehindAngle) * segmentLength;
    parentBehindAngle = nextBehindAngle;
  }

  return points;
}

function weightedPoint(...terms: Array<[Vec2, number]>): Vec2 {
  return terms.reduce(
    (point, [term, weight]) => ({
      x: point.x + term.x * weight,
      y: point.y + term.y * weight,
    }),
    { x: 0, y: 0 },
  );
}

export function createOpenBezierSegments(guidePoints: readonly Vec2[]) {
  if (guidePoints.length < 4) throw new Error("Open Bezier path requires at least four guide points");
  return Array.from({ length: guidePoints.length - 3 }, (_, index): CubicBezierSegment => {
    const previous = guidePoints[index];
    const point = guidePoints[index + 1];
    const next = guidePoints[index + 2];
    const nextAfter = guidePoints[index + 3];
    return {
      start: weightedPoint([previous, 1 / 6], [point, 4 / 6], [next, 1 / 6]),
      control1: weightedPoint([point, 4 / 6], [next, 2 / 6]),
      control2: weightedPoint([point, 2 / 6], [next, 4 / 6]),
      end: weightedPoint([point, 1 / 6], [next, 4 / 6], [nextAfter, 1 / 6]),
    };
  });
}

export function sampleCubicBezier(segment: CubicBezierSegment, amount: number): RouteSample {
  const t = clamp(amount, 0, 1);
  const inverse = 1 - t;
  const x = inverse ** 3 * segment.start.x
    + 3 * inverse ** 2 * t * segment.control1.x
    + 3 * inverse * t ** 2 * segment.control2.x
    + t ** 3 * segment.end.x;
  const y = inverse ** 3 * segment.start.y
    + 3 * inverse ** 2 * t * segment.control1.y
    + 3 * inverse * t ** 2 * segment.control2.y
    + t ** 3 * segment.end.y;
  const vx = 3 * inverse ** 2 * (segment.control1.x - segment.start.x)
    + 6 * inverse * t * (segment.control2.x - segment.control1.x)
    + 3 * t ** 2 * (segment.end.x - segment.control2.x);
  const vy = 3 * inverse ** 2 * (segment.control1.y - segment.start.y)
    + 6 * inverse * t * (segment.control2.y - segment.control1.y)
    + 3 * t ** 2 * (segment.end.y - segment.control2.y);
  return {
    position: { x, y },
    velocity: { x: vx, y: vy },
    heading: Math.atan2(vy, vx),
  };
}

function buildArcLengthSamples(segments: readonly CubicBezierSegment[], samplesPerSegment: number) {
  if (segments.length === 0) throw new Error("Dolphin path requires at least one Bezier segment");
  const arcLengthSamples = [{ distance: 0, parameter: 0 }];
  const segmentLengths: number[] = [];
  let previous = sampleCubicBezier(segments[0], 0).position;
  let totalLength = 0;
  segments.forEach((segment, segmentIndex) => {
    const segmentStartDistance = totalLength;
    for (let sampleIndex = 1; sampleIndex <= samplesPerSegment; sampleIndex += 1) {
      const amount = sampleIndex / samplesPerSegment;
      const position = sampleCubicBezier(segment, amount).position;
      totalLength += Math.hypot(position.x - previous.x, position.y - previous.y);
      arcLengthSamples.push({
        distance: totalLength,
        parameter: segmentIndex + amount,
      });
      previous = position;
    }
    segmentLengths.push(totalLength - segmentStartDistance);
  });
  return { arcLengthSamples, segmentLengths, totalLength };
}

export function createOpenDolphinBezierPath(guidePoints: readonly Vec2[]): DolphinBezierPath {
  const copiedGuidePoints = guidePoints.map((point) => ({ ...point }));
  const segments = createOpenBezierSegments(copiedGuidePoints);
  const { arcLengthSamples, segmentLengths, totalLength } = buildArcLengthSamples(segments, 32);
  return {
    guidePoints: copiedGuidePoints,
    segments,
    arcLengthSamples,
    segmentLengths,
    totalLength,
  };
}

export function sampleDolphinBezierPath(path: DolphinBezierPath, distance: number) {
  const clampedDistance = clamp(distance, 0, path.totalLength);
  const samples = path.arcLengthSamples;
  let lowerIndex = 0;
  let upperIndex = samples.length - 1;
  while (lowerIndex < upperIndex) {
    const midpoint = Math.floor((lowerIndex + upperIndex) / 2);
    if (samples[midpoint].distance < clampedDistance) lowerIndex = midpoint + 1;
    else upperIndex = midpoint;
  }
  const upper = samples[lowerIndex];
  const lower = samples[Math.max(0, lowerIndex - 1)];
  const sampleSpan = upper.distance - lower.distance;
  const amount = sampleSpan > 0 ? (clampedDistance - lower.distance) / sampleSpan : 0;
  const parameter = lower.parameter + (upper.parameter - lower.parameter) * amount;
  const segmentIndex = Math.min(path.segments.length - 1, Math.floor(parameter));
  return sampleCubicBezier(path.segments[segmentIndex], parameter - segmentIndex);
}

type DolphinGuideState = Omit<DolphinPathStream, "path" | "revision">;

function pickDistantTarget(state: DolphinGuideState) {
  const current = state.guidePoints[state.guidePoints.length - 1];
  let selected = { x: -current.x * 0.75, y: -current.y * 0.75 };
  let selectedScore = -Infinity;
  for (let index = 0; index < 8; index += 1) {
    const candidate = {
      x: (state.random() * 2 - 1) * state.bounds.x * 0.76,
      y: (state.random() * 2 - 1) * state.bounds.y * 0.76,
    };
    const normalizedDistance = Math.hypot(
      (candidate.x - current.x) / state.bounds.x,
      (candidate.y - current.y) / state.bounds.y,
    );
    const heading = Math.atan2(candidate.y - current.y, candidate.x - current.x);
    const turnCost = Math.abs(shortestAngleDelta(state.heading, heading)) / Math.PI;
    const score = normalizedDistance - turnCost * (state.route === "wander" ? 0.08 : 0.16);
    if (score > selectedScore) {
      selected = candidate;
      selectedScore = score;
    }
  }
  state.target = selected;
  state.targetStepsRemaining = state.route === "wander"
    ? 12 + Math.floor(state.random() * 13)
    : 18 + Math.floor(state.random() * 13);
}

function boundaryPressure(value: number, limit: number) {
  const normalized = Math.abs(value) / limit;
  if (normalized <= 0.18) return 0;
  const amount = (normalized - 0.18) / 0.82;
  return -Math.sign(value) * amount * amount * 12;
}

function appendDolphinGuidePoint(state: DolphinGuideState) {
  const current = state.guidePoints[state.guidePoints.length - 1];
  const targetDistance = Math.hypot(state.target.x - current.x, state.target.y - current.y);
  if (state.targetStepsRemaining <= 0 || targetDistance < state.spacing * 1.8) {
    pickDistantTarget(state);
  }

  const targetX = state.target.x - current.x;
  const targetY = state.target.y - current.y;
  const targetLength = Math.max(0.0001, Math.hypot(targetX, targetY));
  const projectedX = current.x + Math.cos(state.heading) * state.spacing * 10;
  const projectedY = current.y + Math.sin(state.heading) * state.spacing * 10;
  const desiredX = targetX / targetLength + boundaryPressure(projectedX, state.bounds.x);
  const desiredY = targetY / targetLength + boundaryPressure(projectedY, state.bounds.y);
  const jitter = (state.random() * 2 - 1) * (state.route === "wander" ? 0.1 : 0.035);
  const desiredHeading = Math.atan2(desiredY, desiredX) + jitter;
  const maximumTurn = state.route === "wander" ? 0.48 : 0.34;

  let selectedHeading = rotateAngleTowards(state.heading, desiredHeading, maximumTurn);
  let selectedTurnRate = shortestAngleDelta(state.heading, selectedHeading);
  let selectedScore = -Infinity;
  const needsBoundaryTurn = (
    Math.abs(current.x) > state.bounds.x * 0.48
    && current.x * Math.cos(state.heading) > 0
  ) || (
    Math.abs(current.y) > state.bounds.y * 0.48
    && current.y * Math.sin(state.heading) > 0
  );
  for (let index = 0; index <= 32; index += 1) {
    const offset = -maximumTurn + maximumTurn * 2 * index / 32;
    if (
      needsBoundaryTurn
      && Math.abs(state.turnRate) > 0.01
      && (
        state.turnRate * offset < 0
        || Math.abs(offset) < maximumTurn * 0.82
      )
    ) continue;
    const candidateHeading = state.heading + offset;
    const candidateX = current.x + Math.cos(candidateHeading) * state.spacing;
    const candidateY = current.y + Math.sin(candidateHeading) * state.spacing;
    if (Math.abs(candidateX) > state.bounds.x || Math.abs(candidateY) > state.bounds.y) continue;
    let lookaheadX = current.x;
    let lookaheadY = current.y;
    let lookaheadHeading = state.heading;
    let lookaheadOverflow = 0;
    for (let lookaheadStep = 0; lookaheadStep < 10; lookaheadStep += 1) {
      lookaheadHeading += offset * 0.86 ** lookaheadStep;
      lookaheadX += Math.cos(lookaheadHeading) * state.spacing;
      lookaheadY += Math.sin(lookaheadHeading) * state.spacing;
      lookaheadOverflow += Math.max(
        0,
        Math.abs(lookaheadX) / state.bounds.x - 0.8,
      ) ** 2 + Math.max(
        0,
        Math.abs(lookaheadY) / state.bounds.y - 0.8,
      ) ** 2;
    }
    const clearance = Math.min(
      1 - Math.abs(candidateX) / state.bounds.x,
      1 - Math.abs(candidateY) / state.bounds.y,
    );
    const turnReversal = state.turnRate * offset < 0
      ? Math.abs(state.turnRate - offset)
      : 0;
    const score = -Math.abs(shortestAngleDelta(candidateHeading, desiredHeading))
      - lookaheadOverflow * 1000
      - Math.abs(offset - state.turnRate) * 0.18
      - turnReversal * 1.4
      + clearance * 0.18;
    if (score > selectedScore) {
      selectedHeading = candidateHeading;
      selectedTurnRate = offset;
      selectedScore = score;
    }
  }

  if (selectedScore === -Infinity) {
    throw new Error(
      `Dolphin path could not extend at (${current.x.toFixed(3)}, ${current.y.toFixed(3)})`
      + ` with heading ${state.heading.toFixed(3)} and spacing ${state.spacing.toFixed(3)}`,
    );
  }

  const next = {
    x: current.x + Math.cos(selectedHeading) * state.spacing,
    y: current.y + Math.sin(selectedHeading) * state.spacing,
  };
  state.guidePoints.push(next);
  state.heading = selectedHeading;
  state.turnRate = selectedTurnRate;
  state.targetStepsRemaining -= 1;
  return next;
}

export function createDolphinPathStream(
  route: DolphinRoute,
  bounds: DolphinPathBounds,
  random: () => number = Math.random,
  guidePointCount = 8,
  spacing?: number,
): DolphinPathStream {
  const safeBounds = {
    x: Math.max(0.6, bounds.x * 0.94),
    y: Math.max(0.6, bounds.y * 0.9),
  };
  const baseSpacing = clamp(Math.min(safeBounds.x * 0.2, safeBounds.y * 0.22), 0.2, 0.32);
  const resolvedSpacing = spacing ?? (route === "cruise" ? Math.max(0.18, baseSpacing * 0.72) : baseSpacing);
  const start = {
    x: (random() * 2 - 1) * safeBounds.x * 0.24,
    y: (random() * 2 - 1) * safeBounds.y * 0.24,
  };
  const state: DolphinGuideState = {
    route,
    bounds: safeBounds,
    spacing: resolvedSpacing,
    guidePoints: [start],
    target: { ...start },
    targetStepsRemaining: 0,
    heading: random() * Math.PI * 2,
    turnRate: 0,
    random,
  };
  pickDistantTarget(state);
  state.heading = Math.atan2(state.target.y - start.y, state.target.x - start.x);
  const pointCount = Math.max(7, Math.floor(guidePointCount));
  while (state.guidePoints.length < pointCount) appendDolphinGuidePoint(state);
  return {
    ...state,
    path: createOpenDolphinBezierPath(state.guidePoints),
    revision: 0,
  };
}

export function advanceDolphinPathStream(
  stream: DolphinPathStream,
  distance: number,
  travel: number,
): DolphinPathAdvance {
  let nextDistance = Math.max(0, distance + Math.max(0, travel));
  let advancedSegments = 0;
  let firstSegmentLength = stream.path.segmentLengths[0];
  while (nextDistance >= firstSegmentLength) {
    nextDistance -= firstSegmentLength;
    stream.guidePoints.shift();
    appendDolphinGuidePoint(stream);
    stream.path = createOpenDolphinBezierPath(stream.guidePoints);
    stream.revision += 1;
    advancedSegments += 1;
    firstSegmentLength = stream.path.segmentLengths[0];
  }
  return { distance: nextDistance, advancedSegments };
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
