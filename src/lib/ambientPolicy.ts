export type AmbientRuntimePolicy = {
  requestedBackend: string | null;
  reducedMotion: boolean;
  saveData: boolean;
};

export function isExplicitDynamicAmbient(requestedBackend: string | null) {
  return requestedBackend === "webgpu" || requestedBackend === "webgl2";
}

export function shouldStartAmbientRuntime({
  requestedBackend,
  reducedMotion,
  saveData,
}: AmbientRuntimePolicy) {
  if (requestedBackend === "static") return false;
  if (isExplicitDynamicAmbient(requestedBackend)) return true;
  return !reducedMotion && !saveData;
}
