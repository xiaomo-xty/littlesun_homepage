export type IdleParallaxSample = {
  x: number;
  y: number;
};

export function sampleIdleParallax(
  timeMs: number,
  periodMs: number,
  amplitudeX: number,
  amplitudeY: number,
  phaseOffset = 0,
): IdleParallaxSample {
  const safePeriod = Math.max(1, periodMs);
  const wrappedTime = ((timeMs % safePeriod) + safePeriod) % safePeriod;
  const phase = (wrappedTime / safePeriod) * Math.PI * 2 + phaseOffset;

  return {
    x: amplitudeX * (Math.sin(phase) + Math.sin(phase * 2 + 0.72) * 0.16),
    y: amplitudeY * (Math.cos(phase + 0.34) + Math.sin(phase * 3 - 0.28) * 0.12),
  };
}
