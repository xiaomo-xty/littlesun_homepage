import { describe, expect, test } from "bun:test";
import {
  DOLPHIN_JOINT_LENGTHS,
  DOLPHIN_MAX_BENDS,
  advanceDolphinPathStream,
  advanceDolphinSpine,
  calculateSimulationSubsteps,
  createDolphinPathStream,
  createDolphinSpine,
  rotateAngleTowards,
  sampleDolphinBezierPath,
  shortestAngleDelta,
  type CubicBezierSegment,
  type DolphinPathBounds,
  type DolphinPathStream,
  type DolphinRoute,
} from "../src/lib/dolphinSimulation";

function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function createStream(
  seed = 1,
  route: DolphinRoute = "wander",
  bounds: DolphinPathBounds = { x: 4.2, y: 1.55 },
  guidePointCount = 10,
) {
  return createDolphinPathStream(route, bounds, seededRandom(seed), guidePointCount);
}

function advanceOneSegment(stream: DolphinPathStream, distance: number) {
  return advanceDolphinPathStream(
    stream,
    distance,
    stream.path.segmentLengths[0] - distance + 1e-9,
  ).distance;
}

function firstDerivative(segment: CubicBezierSegment, atEnd: boolean) {
  const first = atEnd ? segment.control2 : segment.start;
  const second = atEnd ? segment.end : segment.control1;
  return {
    x: 3 * (second.x - first.x),
    y: 3 * (second.y - first.y),
  };
}

function secondDerivative(segment: CubicBezierSegment, atEnd: boolean) {
  const first = atEnd ? segment.control1 : segment.start;
  const second = atEnd ? segment.control2 : segment.control1;
  const third = atEnd ? segment.end : segment.control2;
  return {
    x: 6 * (third.x - 2 * second.x + first.x),
    y: 6 * (third.y - 2 * second.y + first.y),
  };
}

describe("procedural dolphin simulation", () => {
  const simulateAtFrameRate = (framesPerSecond: number, duration: number) => {
    const scale = 0.9;
    const frameDelta = 1 / framesPerSecond;
    const stream = createStream(20260821);
    const initial = sampleDolphinBezierPath(stream.path, 0);
    let distance = 0;
    let clock = 0;
    const spine = createDolphinSpine(initial.position, initial.heading, scale);

    for (let frame = 0; frame < framesPerSecond * duration; frame += 1) {
      const substeps = calculateSimulationSubsteps(frameDelta);
      for (let step = 0; step < substeps.count; step += 1) {
        clock += substeps.delta;
        distance = advanceDolphinPathStream(stream, distance, 1.08 * substeps.delta).distance;
        const route = sampleDolphinBezierPath(stream.path, distance);
        advanceDolphinSpine(spine, route.position, clock, substeps.delta, scale);
      }
    }

    return { distance, revision: stream.revision, spine };
  };

  test("open Bezier joins preserve position, tangent, and curvature", () => {
    const path = createStream(7).path;
    path.segments.slice(0, -1).forEach((segment, index) => {
      const next = path.segments[index + 1];
      const outgoingFirst = firstDerivative(segment, true);
      const incomingFirst = firstDerivative(next, false);
      const outgoingSecond = secondDerivative(segment, true);
      const incomingSecond = secondDerivative(next, false);

      expect(segment.end.x).toBeCloseTo(next.start.x, 10);
      expect(segment.end.y).toBeCloseTo(next.start.y, 10);
      expect(outgoingFirst.x).toBeCloseTo(incomingFirst.x, 10);
      expect(outgoingFirst.y).toBeCloseTo(incomingFirst.y, 10);
      expect(outgoingSecond.x).toBeCloseTo(incomingSecond.x, 10);
      expect(outgoingSecond.y).toBeCloseTo(incomingSecond.y, 10);
    });
  });

  test("stream rebuild preserves the completed segment end frame", () => {
    const stream = createStream(19);
    const completed = stream.path.segments[0];
    const endPosition = completed.end;
    const endFirst = firstDerivative(completed, true);
    const endSecond = secondDerivative(completed, true);
    const advance = advanceDolphinPathStream(stream, 0, stream.path.segmentLengths[0] + 1e-9);
    const next = stream.path.segments[0];

    expect(advance.advancedSegments).toBe(1);
    expect(next.start.x).toBeCloseTo(endPosition.x, 10);
    expect(next.start.y).toBeCloseTo(endPosition.y, 10);
    expect(firstDerivative(next, false).x).toBeCloseTo(endFirst.x, 10);
    expect(firstDerivative(next, false).y).toBeCloseTo(endFirst.y, 10);
    expect(secondDerivative(next, false).x).toBeCloseTo(endSecond.x, 10);
    expect(secondDerivative(next, false).y).toBeCloseTo(endSecond.y, 10);
  });

  test("generated guide points stay equally spaced, bounded, and gently steered", () => {
    for (let seed = 1; seed <= 24; seed += 1) {
      const stream = createStream(seed);
      let distance = 0;
      const penultimatePoint = stream.guidePoints[stream.guidePoints.length - 2];
      let previousPoint = stream.guidePoints.at(-1)!;
      let previousHeading = Math.atan2(
        previousPoint.y - penultimatePoint.y,
        previousPoint.x - penultimatePoint.x,
      );

      for (let segment = 0; segment < 400; segment += 1) {
        distance = advanceOneSegment(stream, distance);
        const point = stream.guidePoints.at(-1)!;
        const heading = Math.atan2(point.y - previousPoint.y, point.x - previousPoint.x);
        expect(Math.hypot(point.x - previousPoint.x, point.y - previousPoint.y))
          .toBeCloseTo(stream.spacing, 10);
        expect(Math.abs(point.x)).toBeLessThanOrEqual(stream.bounds.x + 1e-9);
        expect(Math.abs(point.y)).toBeLessThanOrEqual(stream.bounds.y + 1e-9);
        expect(Math.abs(shortestAngleDelta(previousHeading, heading))).toBeLessThanOrEqual(0.481);
        previousPoint = point;
        previousHeading = heading;
      }
    }
  });

  test("the route extends for hundreds of segments without wrapping", () => {
    const stream = createStream(37);
    const initialGuides = stream.guidePoints.map((point) => ({ ...point }));
    const generated: Array<{ x: number; y: number }> = [];
    let distance = 0;
    for (let segment = 0; segment < 500; segment += 1) {
      distance = advanceOneSegment(stream, distance);
      generated.push({ ...stream.guidePoints.at(-1)! });
    }

    const exactOriginalMatches = generated.filter((point) => initialGuides.some((initial) => (
      Math.abs(point.x - initial.x) < 1e-10 && Math.abs(point.y - initial.y) < 1e-10
    )));
    const quantizedPositions = new Set(generated.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`));
    expect(stream.revision).toBe(500);
    expect(exactOriginalMatches).toHaveLength(0);
    expect(quantizedPositions.size).toBeGreaterThan(300);
  });

  test("long-running wander does not settle into a small repeated circle", () => {
    const stream = createStream(83);
    const generated: Array<{ x: number; y: number }> = [];
    let distance = 0;
    for (let segment = 0; segment < 700; segment += 1) {
      distance = advanceOneSegment(stream, distance);
      generated.push({ ...stream.guidePoints.at(-1)! });
    }
    const tail = generated.slice(-220);
    const xSpan = Math.max(...tail.map((point) => point.x)) - Math.min(...tail.map((point) => point.x));
    const ySpan = Math.max(...tail.map((point) => point.y)) - Math.min(...tail.map((point) => point.y));
    const occupiedCells = new Set(tail.map((point) => (
      `${Math.floor((point.x + stream.bounds.x) / 0.5)},${Math.floor((point.y + stream.bounds.y) / 0.35)}`
    )));

    expect(xSpan).toBeGreaterThan(stream.bounds.x * 1.25);
    expect(ySpan).toBeGreaterThan(stream.bounds.y * 1.1);
    expect(occupiedCells.size).toBeGreaterThan(35);
  });

  test("different seeds create distinct streaming routes", () => {
    const first = createStream(17);
    const second = createStream(29);
    let difference = 0;
    for (let index = 0; index < first.guidePoints.length; index += 1) {
      difference += Math.hypot(
        first.guidePoints[index].x - second.guidePoints[index].x,
        first.guidePoints[index].y - second.guidePoints[index].y,
      );
    }
    expect(difference).toBeGreaterThan(1);
  });

  test("arc-length sampling keeps head travel nearly constant across stream extensions", () => {
    const stream = createStream(42);
    const travel = 1 / 60;
    let distance = 0;
    let previous = sampleDolphinBezierPath(stream.path, distance).position;
    const distances: number[] = [];
    for (let frame = 0; frame < 2400; frame += 1) {
      distance = advanceDolphinPathStream(stream, distance, travel).distance;
      const next = sampleDolphinBezierPath(stream.path, distance).position;
      distances.push(Math.hypot(next.x - previous.x, next.y - previous.y));
      previous = next;
    }
    expect(Math.min(...distances)).toBeGreaterThan(0.0155);
    expect(Math.max(...distances)).toBeLessThan(0.0171);
  });

  test("path heading stays continuous while the stream grows", () => {
    const stream = createStream(73);
    let distance = 0;
    let previous = sampleDolphinBezierPath(stream.path, distance).heading;
    let maximumChange = 0;
    for (let sampleIndex = 0; sampleIndex < 6000; sampleIndex += 1) {
      distance = advanceDolphinPathStream(stream, distance, 1 / 120).distance;
      const heading = sampleDolphinBezierPath(stream.path, distance).heading;
      maximumChange = Math.max(maximumChange, Math.abs(shortestAngleDelta(previous, heading)));
      previous = heading;
    }
    expect(maximumChange).toBeLessThan(0.025);
  });

  test("desktop and mobile streams keep their requested lookahead and bounds", () => {
    const desktop = createStream(91, "wander", { x: 4.2, y: 1.55 }, 10);
    const mobile = createStream(92, "wander", { x: 1.72, y: 1.25 }, 8);
    expect(desktop.guidePoints).toHaveLength(10);
    expect(desktop.path.segments).toHaveLength(7);
    expect(mobile.guidePoints).toHaveLength(8);
    expect(mobile.path.segments).toHaveLength(5);
    mobile.guidePoints.forEach((point) => {
      expect(Math.abs(point.x)).toBeLessThanOrEqual(mobile.bounds.x + 1e-9);
      expect(Math.abs(point.y)).toBeLessThanOrEqual(mobile.bounds.y + 1e-9);
    });
  });

  test("spine solver preserves every joint length", () => {
    const scale = 0.84;
    const stream = createStream(101);
    const initial = sampleDolphinBezierPath(stream.path, 0);
    const spine = createDolphinSpine(initial.position, initial.heading, scale);
    let distance = 0;
    for (let frame = 0; frame < 480; frame += 1) {
      const time = frame / 60;
      distance = advanceDolphinPathStream(stream, distance, 1.08 / 60).distance;
      const route = sampleDolphinBezierPath(stream.path, distance);
      advanceDolphinSpine(spine, route.position, time, 1 / 60, scale);
      for (let index = 1; index < spine.length; index += 1) {
        const dx = spine[index].x - spine[index - 1].x;
        const dy = spine[index].y - spine[index - 1].y;
        expect(Math.hypot(dx, dy)).toBeCloseTo(DOLPHIN_JOINT_LENGTHS[index - 1] * scale, 6);
      }
    }
  });

  test("spine solver keeps adjacent bends inside segment limits", () => {
    const stream = createStream(131, "cruise");
    const initial = sampleDolphinBezierPath(stream.path, 0);
    const spine = createDolphinSpine(initial.position, initial.heading);
    let distance = 0;
    for (let frame = 0; frame < 720; frame += 1) {
      const time = frame / 60;
      distance = advanceDolphinPathStream(stream, distance, 1.08 / 60).distance;
      const route = sampleDolphinBezierPath(stream.path, distance);
      advanceDolphinSpine(spine, route.position, time, 1 / 60);
      let parentAngle = Math.atan2(spine[1].y - spine[0].y, spine[1].x - spine[0].x);
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

  test("fixed substeps keep the same streaming motion at 30, 60, and 120 fps", () => {
    const at30 = simulateAtFrameRate(30, 12);
    const at60 = simulateAtFrameRate(60, 12);
    const at120 = simulateAtFrameRate(120, 12);

    expect(at30.revision).toBe(at120.revision);
    expect(at60.revision).toBe(at120.revision);
    expect(at30.distance).toBeCloseTo(at120.distance, 9);
    expect(at60.distance).toBeCloseTo(at120.distance, 9);
    at120.spine.forEach((point, index) => {
      expect(at30.spine[index].x).toBeCloseTo(point.x, 8);
      expect(at30.spine[index].y).toBeCloseTo(point.y, 8);
      expect(at60.spine[index].x).toBeCloseTo(point.x, 8);
      expect(at60.spine[index].y).toBeCloseTo(point.y, 8);
    });
  });

  test("substepping bounds visible joint-angle changes at 30 fps", () => {
    const scale = 0.9;
    const stream = createStream(211);
    const initial = sampleDolphinBezierPath(stream.path, 0);
    let distance = 0;
    let clock = 0;
    const spine = createDolphinSpine(initial.position, initial.heading, scale);
    let previousAngles = spine.slice(1).map((point, index) => Math.atan2(
      point.y - spine[index].y,
      point.x - spine[index].x,
    ));
    let maximumFrameChange = 0;

    for (let frame = 0; frame < 30 * 12; frame += 1) {
      const substeps = calculateSimulationSubsteps(1 / 30);
      for (let step = 0; step < substeps.count; step += 1) {
        clock += substeps.delta;
        distance = advanceDolphinPathStream(stream, distance, 1.08 * substeps.delta).distance;
        const route = sampleDolphinBezierPath(stream.path, distance);
        advanceDolphinSpine(spine, route.position, clock, substeps.delta, scale);
      }
      const nextAngles = spine.slice(1).map((point, index) => Math.atan2(
        point.y - spine[index].y,
        point.x - spine[index].x,
      ));
      nextAngles.forEach((angle, index) => {
        maximumFrameChange = Math.max(
          maximumFrameChange,
          Math.abs(shortestAngleDelta(previousAngles[index], angle)),
        );
      });
      previousAngles = nextAngles;
    }

    expect(maximumFrameChange).toBeLessThan(0.14);
  });
});
