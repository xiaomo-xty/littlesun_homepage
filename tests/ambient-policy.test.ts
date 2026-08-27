import { describe, expect, test } from "bun:test";
import { shouldStartAmbientRuntime } from "../src/lib/ambientPolicy";

describe("ambient runtime policy", () => {
  test("starts the dynamic runtime for the default, WebGPU, and WebGL paths", () => {
    expect(shouldStartAmbientRuntime({ requestedBackend: null, reducedMotion: false, saveData: false })).toBe(true);
    expect(shouldStartAmbientRuntime({ requestedBackend: "webgpu", reducedMotion: false, saveData: false })).toBe(true);
    expect(shouldStartAmbientRuntime({ requestedBackend: "webgl2", reducedMotion: false, saveData: false })).toBe(true);
  });

  test("keeps the SSR ocean static when explicitly requested", () => {
    expect(shouldStartAmbientRuntime({ requestedBackend: "static", reducedMotion: false, saveData: false })).toBe(false);
    expect(shouldStartAmbientRuntime({ requestedBackend: "static", reducedMotion: true, saveData: true })).toBe(false);
  });

  test("does not download the dynamic runtime for reduced motion or Save-Data", () => {
    expect(shouldStartAmbientRuntime({ requestedBackend: null, reducedMotion: true, saveData: false })).toBe(false);
    expect(shouldStartAmbientRuntime({ requestedBackend: null, reducedMotion: false, saveData: true })).toBe(false);
  });

  test("explicit dynamic backends override automatic motion and data-saving fallbacks", () => {
    expect(shouldStartAmbientRuntime({ requestedBackend: "webgpu", reducedMotion: true, saveData: true })).toBe(true);
    expect(shouldStartAmbientRuntime({ requestedBackend: "webgl2", reducedMotion: true, saveData: true })).toBe(true);
  });
});
