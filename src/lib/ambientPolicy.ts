export type AmbientRuntimePolicy = {
  requestedBackend: string | null;
  reducedMotion: boolean;
  saveData: boolean;
};

export function shouldStartAmbientRuntime({
  requestedBackend,
  reducedMotion,
  saveData,
}: AmbientRuntimePolicy) {
  return requestedBackend !== "static" && !reducedMotion && !saveData;
}
