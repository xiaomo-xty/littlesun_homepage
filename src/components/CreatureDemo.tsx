import {
  ArrowCounterClockwiseIcon,
  MoonIcon,
  PauseIcon,
  PlayIcon,
  SunIcon,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three/webgpu";
import {
  DOLPHIN_BODY_LENGTH,
  advanceDolphinPathStream,
  advanceDolphinSpine,
  advanceRepulsionOffset,
  calculateSimulationSubsteps,
  createDolphinPathStream,
  createDolphinSpine,
  sampleDolphinBezierPath,
  sampleSpineFrame,
  type DolphinPathStream,
  type DolphinRoute,
  type DolphinSpinePoint,
  type RepulsionState,
} from "../lib/dolphinSimulation";
import {
  advanceRibbonChain,
  pointerRepulsion,
  sampleOceanFlow,
  type RibbonPoint,
  type Vector2Like,
} from "../lib/ambientSimulation";

type Theme = "light" | "dark";
type Disposable = { dispose: () => void };
type BackendFlags = { isWebGPUBackend?: boolean; isWebGLBackend?: boolean };

type PixelParticle = Vector2Like & {
  vx: number;
  vy: number;
  z: number;
  size: number;
  speed: number;
  phase: number;
};

type Tentacle = {
  points: RibbonPoint[];
  positions: Float32Array;
  attribute: THREE.BufferAttribute;
  material: THREE.LineBasicMaterial;
  offset: number;
};

type DemoJelly = Vector2Like & {
  vx: number;
  vy: number;
  phase: number;
  scale: number;
  group: THREE.Group;
  fill: THREE.MeshBasicMaterial;
  edge: THREE.LineBasicMaterial;
  tentacles: Tentacle[];
};

type FlowLine = {
  controlPoints: THREE.Vector3[];
  curve: THREE.CatmullRomCurve3;
  positions: Float32Array;
  attribute: THREE.BufferAttribute;
  material: THREE.LineBasicMaterial;
  phase: number;
  baseY: number;
};

type DolphinPart = {
  attribute: THREE.BufferAttribute;
  basePositions: Float32Array;
};

function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function createBodyShape() {
  const shape = new THREE.Shape();
  shape.moveTo(0.43, 0.025);
  shape.bezierCurveTo(0.35, 0.055, 0.23, 0.075, 0.08, 0.105);
  shape.bezierCurveTo(0.09, 0.31, -0.06, 0.49, -0.31, 0.56);
  shape.bezierCurveTo(-0.86, 0.72, -1.62, 0.61, -2.19, 0.39);
  shape.bezierCurveTo(-2.5, 0.27, -2.77, 0.17, -3.02, 0.09);
  shape.lineTo(-3.04, -0.075);
  shape.bezierCurveTo(-2.76, -0.13, -2.49, -0.2, -2.2, -0.31);
  shape.bezierCurveTo(-1.61, -0.52, -0.9, -0.53, -0.39, -0.37);
  shape.bezierCurveTo(-0.11, -0.28, 0.09, -0.17, 0.29, -0.135);
  shape.bezierCurveTo(0.37, -0.115, 0.44, -0.055, 0.43, 0.025);
  shape.closePath();
  return shape;
}

function createBellyShape() {
  const shape = new THREE.Shape();
  shape.moveTo(0.38, -0.045);
  shape.bezierCurveTo(0.21, -0.08, 0.04, -0.17, -0.2, -0.25);
  shape.bezierCurveTo(-0.72, -0.44, -1.42, -0.46, -2.18, -0.3);
  shape.bezierCurveTo(-1.55, -0.53, -0.86, -0.53, -0.38, -0.37);
  shape.bezierCurveTo(-0.1, -0.28, 0.1, -0.17, 0.29, -0.135);
  shape.bezierCurveTo(0.35, -0.11, 0.39, -0.075, 0.38, -0.045);
  shape.closePath();
  return shape;
}

function createDorsalFinShape() {
  const shape = new THREE.Shape();
  shape.moveTo(-1.12, 0.58);
  shape.bezierCurveTo(-1.38, 0.95, -1.69, 1.02, -1.91, 0.46);
  shape.bezierCurveTo(-1.62, 0.53, -1.36, 0.57, -1.12, 0.58);
  shape.closePath();
  return shape;
}

function createPectoralFinShape() {
  const shape = new THREE.Shape();
  shape.moveTo(-0.68, -0.23);
  shape.bezierCurveTo(-0.88, -0.52, -1.12, -0.91, -1.42, -0.93);
  shape.bezierCurveTo(-1.33, -0.53, -1.14, -0.24, -0.77, -0.12);
  shape.bezierCurveTo(-0.71, -0.14, -0.68, -0.18, -0.68, -0.23);
  shape.closePath();
  return shape;
}

function createTailShape() {
  const shape = new THREE.Shape();
  shape.moveTo(-2.93, 0.08);
  shape.bezierCurveTo(-3.19, 0.14, -3.39, 0.4, -3.76, 0.49);
  shape.bezierCurveTo(-3.67, 0.24, -3.52, 0.08, -3.21, 0.005);
  shape.bezierCurveTo(-3.52, -0.04, -3.72, -0.18, -3.86, -0.42);
  shape.bezierCurveTo(-3.43, -0.37, -3.2, -0.16, -2.95, -0.07);
  shape.closePath();
  return shape;
}

export default function CreatureDemo() {
  const hostRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);
  const themeRef = useRef<Theme>("dark");
  const routeRef = useRef<DolphinRoute>("wander");
  const resetVersionRef = useRef(0);
  const [paused, setPaused] = useState(false);
  const [theme, setTheme] = useState<Theme>("dark");
  const [route, setRoute] = useState<DolphinRoute>("wander");
  const [backend, setBackend] = useState("initializing");
  const [status, setStatus] = useState<"loading" | "ready" | "fallback">("loading");

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    themeRef.current = theme;
  }, [theme]);

  useEffect(() => {
    routeRef.current = route;
  }, [route]);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = host?.querySelector("canvas");
    if (!host || !(canvas instanceof HTMLCanvasElement)) return;

    let destroyed = false;
    let cleanupScene: (() => void) | undefined;
    const searchParams = new URLSearchParams(window.location.search);
    const debugEnabled = searchParams.get("debug") === "1";
    const diagnostics = host.querySelector<HTMLElement>("[data-diagnostics]");
    const diagnosticLines: string[] = [];
    const diagnosticStart = performance.now();
    const describeError = (error: unknown) => error instanceof Error
      ? `${error.name}: ${error.message}`
      : String(error);
    const logDiagnostic = (stage: string, details: Record<string, unknown> = {}) => {
      host.dataset.stage = stage;
      if (!debugEnabled) return;
      const elapsed = `${((performance.now() - diagnosticStart) / 1000).toFixed(2)}s`;
      const detailText = Object.keys(details).length > 0 ? ` ${JSON.stringify(details)}` : "";
      const line = `${elapsed} ${stage}${detailText}`;
      diagnosticLines.push(line);
      if (diagnosticLines.length > 18) diagnosticLines.shift();
      if (diagnostics) {
        diagnostics.textContent = diagnosticLines.join("\n");
        diagnostics.scrollTop = diagnostics.scrollHeight;
      }
      if (stage.includes("error") || stage.includes("fatal") || stage.includes("timeout")) {
        console.error(`[CreatureDemo] ${line}`);
      } else {
        console.info(`[CreatureDemo] ${line}`);
      }
    };

    host.dataset.debug = debugEnabled ? "true" : "false";
    logDiagnostic("boot", {
      hidden: document.hidden,
      secureContext: window.isSecureContext,
      webGPU: "gpu" in navigator,
      hardwareConcurrency: navigator.hardwareConcurrency || "unknown",
    });

    const initialize = async () => {
      const resources = new Set<Disposable>();
      const register = <T extends Disposable>(resource: T) => {
        resources.add(resource);
        return resource;
      };
      const random = seededRandom(20260820);
      const routeSeed = new Uint32Array(1);
      globalThis.crypto.getRandomValues(routeSeed);
      const routeRandom = seededRandom(routeSeed[0] || 20260821);
      const mobile = window.matchMedia("(max-width: 767px)").matches;
      const lowPower = (navigator.hardwareConcurrency || 8) <= 4;
      const requestedBackend = searchParams.get("backend");
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
        && searchParams.get("motion") !== "full";
      pausedRef.current = reduceMotion;
      setPaused(reduceMotion);
      host.dataset.motion = reduceMotion ? "reduced" : "full";
      logDiagnostic("settings", {
        requestedBackend: requestedBackend || "auto",
        motion: reduceMotion ? "reduced" : "full",
        mobile,
        lowPower,
      });
      if (requestedBackend === "static") {
        host.dataset.status = "fallback";
        host.dataset.backend = "static";
        setBackend("static");
        setStatus("fallback");
        logDiagnostic("renderer:static", { reason: "requested" });
        return;
      }

      const webGPUAvailable = window.isSecureContext && "gpu" in navigator;
      const forceWebGL = requestedBackend === "webgl2" || !webGPUAvailable;
      const initializeRenderer = async (useWebGL: boolean) => {
        const useBalancedQuality = mobile || lowPower || useWebGL;
        const candidateBackend = useWebGL ? "webgl2" : "webgpu";
        const rendererStart = performance.now();
        logDiagnostic("renderer:init:start", { backend: candidateBackend });
        const candidate = new THREE.WebGPURenderer({
          canvas,
          antialias: !useBalancedQuality,
          forceWebGL: useWebGL,
          powerPreference: useBalancedQuality ? "low-power" : "high-performance",
        });
        let timeout = 0;

        try {
          candidate.outputColorSpace = THREE.SRGBColorSpace;
          candidate.setPixelRatio(Math.min(window.devicePixelRatio || 1, useBalancedQuality ? 1.15 : 1.5));
          await Promise.race([
            candidate.init(),
            new Promise<never>((_, reject) => {
              timeout = window.setTimeout(() => {
                logDiagnostic("renderer:init:timeout", { backend: candidateBackend, limitMs: 5000 });
                reject(new Error("Renderer initialization timed out"));
              }, 5000);
            }),
          ]);
          logDiagnostic("renderer:init:ready", {
            backend: candidateBackend,
            durationMs: Math.round(performance.now() - rendererStart),
          });
          return candidate;
        } catch (error) {
          logDiagnostic("renderer:init:error", {
            backend: candidateBackend,
            error: describeError(error),
          });
          candidate.dispose();
          throw error;
        } finally {
          window.clearTimeout(timeout);
        }
      };

      let renderer: THREE.WebGPURenderer;
      let selectedForceWebGL = forceWebGL;
      try {
        renderer = await initializeRenderer(selectedForceWebGL);
      } catch {
        if (destroyed || selectedForceWebGL) {
          if (!destroyed) {
            host.dataset.status = "fallback";
            setBackend("static");
            setStatus("fallback");
            logDiagnostic("renderer:static", { reason: "webgl2-init" });
          }
          return;
        }

        selectedForceWebGL = true;
        host.dataset.fallbackReason = "webgpu-init";
        logDiagnostic("renderer:fallback", { from: "webgpu", to: "webgl2" });
        try {
          renderer = await initializeRenderer(true);
        } catch {
          if (!destroyed) {
            host.dataset.status = "fallback";
            setBackend("static");
            setStatus("fallback");
            logDiagnostic("renderer:static", { reason: "webgl2-init" });
          }
          return;
        }
      }

      if (destroyed) {
        renderer.dispose();
        return;
      }

      const balanced = mobile || lowPower || selectedForceWebGL;

      const backendFlags = renderer.backend as BackendFlags;
      const backendName = backendFlags.isWebGPUBackend ? "webgpu" : backendFlags.isWebGLBackend ? "webgl2" : "static";
      host.dataset.backend = backendName;
      host.dataset.creature = "same-side-dolphin";
      setBackend(backendName);
      logDiagnostic("scene:build:start", { backend: backendName, balanced });

      const scene = new THREE.Scene();
      const camera = new THREE.OrthographicCamera(-8, 8, 5, -5, 0.1, 30);
      camera.position.z = 12;
      const world = new THREE.Group();
      scene.add(world);

      let width = 1;
      let height = 1;
      let viewHalfWidth = 8;
      const viewHalfHeight = 5;
      let frame = 0;
      let renderedFrames = 0;
      let lastHeartbeat = 0;
      let hiddenLogged = false;
      let lastTime = performance.now();
      let activeTheme = themeRef.current;
      let activeRoute = routeRef.current;
      let resetVersion = resetVersionRef.current;
      let routeDistance = 0;
      let routeGeneration = 0;
      let dolphinStream: DolphinPathStream | undefined;
      let swimClock = 0;
      let simulationClock = 0;
      let pulse = 0;
      let dolphinScale = mobile ? 0.56 : 0.9;
      let dolphinSpine: DolphinSpinePoint[] = createDolphinSpine({ x: 0, y: 0 }, 0, dolphinScale);
      const dolphinHead = new THREE.Vector2();
      const dolphinForward = new THREE.Vector2(1, 0);
      const pulseOrigin = new THREE.Vector2();
      const repulsionOffset: RepulsionState = { x: 0, y: 0, vx: 0, vy: 0 };

      const pointer = {
        active: false,
        x: 0,
        y: 0,
        speed: 0,
        previousX: 0,
        previousY: 0,
        updatedAt: performance.now(),
      };
      const pointerWorld = new THREE.Vector2();
      const repelForce: Vector2Like = { x: 0, y: 0 };
      const flowForce: Vector2Like = { x: 0, y: 0 };
      const sharedMatrix = new THREE.Matrix4();
      const sharedColor = new THREE.Color();
      const curveSample = new THREE.Vector3();

      const palette = {
        accent: new THREE.Color(),
        accentSoft: new THREE.Color(),
        line: new THREE.Color(),
        jelly: new THREE.Color(),
        page: new THREE.Color(),
      };

      const particleCount = balanced ? 72 : 124;
      const particleGeometry = register(new THREE.BoxGeometry(0.055, 0.055, 0.028));
      const particleMaterial = register(new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.48,
        depthWrite: false,
        vertexColors: true,
      }));
      const particleMesh = new THREE.InstancedMesh(particleGeometry, particleMaterial, particleCount);
      particleMesh.frustumCulled = false;
      world.add(particleMesh);
      const particles: PixelParticle[] = Array.from({ length: particleCount }, () => ({
        x: random() * 14 - 7,
        y: random() * 10 - 5,
        z: -3.4 - random() * 2.8,
        vx: 0,
        vy: 0,
        size: 0.5 + random() * 1.65,
        speed: 0.035 + random() * 0.13,
        phase: random() * Math.PI * 2,
      }));

      const makeFlowLine = (index: number): FlowLine => {
        const controlPoints = Array.from({ length: balanced ? 6 : 8 }, () => new THREE.Vector3());
        const curve = new THREE.CatmullRomCurve3(controlPoints, false, "centripetal", 0.42);
        const positions = new Float32Array((balanced ? 38 : 58) * 3);
        const geometry = register(new THREE.BufferGeometry());
        const attribute = new THREE.BufferAttribute(positions, 3);
        attribute.setUsage(THREE.DynamicDrawUsage);
        geometry.setAttribute("position", attribute);
        const material = register(new THREE.LineBasicMaterial({ transparent: true, depthWrite: false }));
        const line = new THREE.Line(geometry, material);
        line.frustumCulled = false;
        world.add(line);
        return {
          controlPoints,
          curve,
          positions,
          attribute,
          material,
          phase: random() * Math.PI * 2,
          baseY: -3.4 + index * 2.25,
        };
      };
      const flowLines = Array.from({ length: balanced ? 3 : 4 }, (_, index) => makeFlowLine(index));

      const jellyShape = new THREE.Shape();
      jellyShape.moveTo(-0.55, 0);
      jellyShape.bezierCurveTo(-0.5, 0.48, -0.2, 0.68, 0, 0.68);
      jellyShape.bezierCurveTo(0.2, 0.68, 0.5, 0.48, 0.55, 0);
      jellyShape.quadraticCurveTo(0.36, -0.12, 0.2, 0);
      jellyShape.quadraticCurveTo(0, -0.14, -0.2, 0);
      jellyShape.quadraticCurveTo(-0.36, -0.12, -0.55, 0);
      const jellyGeometry = register(new THREE.ShapeGeometry(jellyShape, balanced ? 10 : 18));
      const jellyEdgeGeometry = register(new THREE.EdgesGeometry(jellyGeometry, 34));
      const jellies: DemoJelly[] = [];

      const resetTentacles = (jelly: DemoJelly) => {
        jelly.tentacles.forEach((tentacle) => {
          tentacle.points.forEach((point, pointIndex) => {
            point.x = tentacle.offset;
            point.y = -pointIndex * 0.16;
            point.vx = 0;
            point.vy = 0;
          });
        });
      };

      const createJelly = (x: number, y: number, scale: number, phase: number) => {
        const fill = register(new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false }));
        const edge = register(new THREE.LineBasicMaterial({ transparent: true, depthWrite: false }));
        const bell = new THREE.Mesh(jellyGeometry, fill);
        const outline = new THREE.LineSegments(jellyEdgeGeometry, edge);
        const group = new THREE.Group();
        group.add(bell, outline);
        group.position.set(x, y, -0.8);
        group.frustumCulled = false;
        world.add(group);

        const tentacles: Tentacle[] = Array.from({ length: 4 }, (_, tentacleIndex) => {
          const offset = (tentacleIndex - 1.5) * 0.21;
          const points = Array.from({ length: balanced ? 5 : 6 }, (_, pointIndex) => ({
            x: offset,
            y: -pointIndex * 0.16,
            vx: 0,
            vy: 0,
          }));
          const positions = new Float32Array(points.length * 3);
          const geometry = register(new THREE.BufferGeometry());
          const attribute = new THREE.BufferAttribute(positions, 3);
          attribute.setUsage(THREE.DynamicDrawUsage);
          geometry.setAttribute("position", attribute);
          const material = register(new THREE.LineBasicMaterial({ transparent: true, depthWrite: false }));
          const line = new THREE.Line(geometry, material);
          line.frustumCulled = false;
          group.add(line);
          return { points, positions, attribute, material, offset };
        });

        jellies.push({
          x,
          y,
          vx: 0.05 + random() * 0.08,
          vy: 0.025 + random() * 0.05,
          phase,
          scale,
          group,
          fill,
          edge,
          tentacles,
        });
      };

      createJelly(-3.8, 1.7, 0.72, 0.2);
      createJelly(3.35, -1.55, 0.58, 2.5);
      if (!balanced) createJelly(1.1, 2.65, 0.42, 4.1);

      const dolphinParts: DolphinPart[] = [];
      const createMaterial = (color: number) => register(new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
      }));
      const bodyMaterial = createMaterial(0x58b4dc);
      const bellyMaterial = createMaterial(0xb5e4ec);
      const finMaterial = createMaterial(0x3c94bd);
      const eyeMaterial = createMaterial(0x071722);
      const outlineMaterial = register(new THREE.LineBasicMaterial({
        color: 0xc4eff7,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }));
      const mouthMaterial = register(new THREE.LineBasicMaterial({
        color: 0x17526d,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }));

      const addDynamicPart = (geometry: THREE.BufferGeometry, object: THREE.Object3D, renderOrder: number) => {
        const attribute = geometry.getAttribute("position") as THREE.BufferAttribute;
        attribute.setUsage(THREE.DynamicDrawUsage);
        dolphinParts.push({
          attribute,
          basePositions: new Float32Array(attribute.array as ArrayLike<number>),
        });
        object.renderOrder = renderOrder;
        object.frustumCulled = false;
        world.add(object);
      };

      const addShapePart = (shape: THREE.Shape, material: THREE.MeshBasicMaterial, order: number) => {
        const geometry = register(new THREE.ShapeGeometry(shape, balanced ? 18 : 28));
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.z = -0.2 + order * 0.001;
        addDynamicPart(geometry, mesh, order);
      };

      const bodyShape = createBodyShape();
      addShapePart(createTailShape(), finMaterial, 88);
      addShapePart(createDorsalFinShape(), finMaterial, 89);
      addShapePart(bodyShape, bodyMaterial, 90);
      addShapePart(createBellyShape(), bellyMaterial, 91);
      addShapePart(createPectoralFinShape(), finMaterial, 92);

      const contourPoints = bodyShape.getSpacedPoints(balanced ? 44 : 72);
      const contourPositions = new Float32Array((contourPoints.length + 1) * 3);
      contourPoints.forEach((point, index) => {
        contourPositions[index * 3] = point.x;
        contourPositions[index * 3 + 1] = point.y;
      });
      contourPositions[contourPoints.length * 3] = contourPoints[0].x;
      contourPositions[contourPoints.length * 3 + 1] = contourPoints[0].y;
      const contourGeometry = register(new THREE.BufferGeometry());
      contourGeometry.setAttribute("position", new THREE.BufferAttribute(contourPositions, 3));
      const contour = new THREE.Line(contourGeometry, outlineMaterial);
      contour.position.z = -0.105;
      addDynamicPart(contourGeometry, contour, 93);

      const mouthPositions = new Float32Array([
        0.38, -0.065, 0,
        0.3, -0.085, 0,
        0.22, -0.1, 0,
        0.14, -0.11, 0,
        0.06, -0.115, 0,
      ]);
      const mouthGeometry = register(new THREE.BufferGeometry());
      mouthGeometry.setAttribute("position", new THREE.BufferAttribute(mouthPositions, 3));
      const mouth = new THREE.Line(mouthGeometry, mouthMaterial);
      mouth.position.z = -0.1;
      addDynamicPart(mouthGeometry, mouth, 94);

      const eyeGeometry = register(new THREE.CircleGeometry(0.052, balanced ? 12 : 18));
      eyeGeometry.translate(-0.13, 0.22, 0);
      const eye = new THREE.Mesh(eyeGeometry, eyeMaterial);
      eye.position.z = -0.095;
      addDynamicPart(eyeGeometry, eye, 95);

      const applyPalette = () => {
        activeTheme = themeRef.current;
        const dark = activeTheme === "dark";
        palette.accent.set(dark ? "#61bff0" : "#267aa8");
        palette.accentSoft.set(dark ? "#b6eafa" : "#73b8d7");
        palette.line.set(dark ? "#31566a" : "#7faabc");
        palette.jelly.set(dark ? "#3c8fb4" : "#4f9ebe");
        palette.page.set(dark ? "#071722" : "#f8faf8");
        renderer.setClearColor(palette.page, 1);
        bodyMaterial.color.set(dark ? "#58b4dc" : "#2b82a9");
        bellyMaterial.color.set(dark ? "#b5e4ec" : "#9ed0dc");
        finMaterial.color.set(dark ? "#3c94bd" : "#236e94");
        eyeMaterial.color.set(dark ? "#071722" : "#092632");
        outlineMaterial.color.set(dark ? "#c4eff7" : "#155d7b");
        mouthMaterial.color.set(dark ? "#17526d" : "#164c62");
        bodyMaterial.opacity = dark ? 0.94 : 0.9;
        bellyMaterial.opacity = dark ? 0.88 : 0.8;
        finMaterial.opacity = dark ? 0.9 : 0.84;
        outlineMaterial.opacity = dark ? 0.78 : 0.68;
        mouthMaterial.opacity = dark ? 0.72 : 0.7;
        flowLines.forEach((line) => line.material.color.copy(palette.line));
        jellies.forEach((jelly) => {
          jelly.fill.color.copy(palette.jelly);
          jelly.edge.color.copy(palette.accentSoft);
          jelly.tentacles.forEach((tentacle) => tentacle.material.color.copy(palette.accent));
        });
      };

      const resize = () => {
        const rect = host.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) return;
        width = rect.width;
        height = rect.height;
        viewHalfWidth = viewHalfHeight * width / height;
        dolphinScale = mobile ? Math.min(0.58, Math.max(0.5, viewHalfWidth / 4.2)) : 0.9;
        camera.left = -viewHalfWidth;
        camera.right = viewHalfWidth;
        camera.top = viewHalfHeight;
        camera.bottom = -viewHalfHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height, false);
      };

      const updatePointerWorld = () => {
        pointerWorld.set(
          (pointer.x / Math.max(width, 1) * 2 - 1) * viewHalfWidth,
          (1 - pointer.y / Math.max(height, 1) * 2) * viewHalfHeight,
        );
      };

      const updateDolphinGeometry = () => {
        const modelScale = dolphinScale;
        const headFrame = sampleSpineFrame(dolphinSpine, 0);
        const tailFrame = sampleSpineFrame(dolphinSpine, 1);
        dolphinParts.forEach((part) => {
          for (let index = 0; index < part.basePositions.length; index += 3) {
            const baseX = part.basePositions[index];
            const baseY = part.basePositions[index + 1] * modelScale;
            const longitudinal = -baseX;
            let frameSample;
            let along = 0;
            if (longitudinal < 0) {
              frameSample = headFrame;
              along = -longitudinal * modelScale;
            } else if (longitudinal > DOLPHIN_BODY_LENGTH) {
              frameSample = tailFrame;
              along = -(longitudinal - DOLPHIN_BODY_LENGTH) * modelScale;
            } else {
              frameSample = sampleSpineFrame(dolphinSpine, longitudinal / DOLPHIN_BODY_LENGTH);
            }
            const x = frameSample.position.x
              + frameSample.tangent.x * along
              + frameSample.normal.x * baseY;
            const y = frameSample.position.y
              + frameSample.tangent.y * along
              + frameSample.normal.y * baseY;
            part.attribute.setXYZ(index / 3, x, y, part.basePositions[index + 2]);
          }
          part.attribute.needsUpdate = true;
        });
      };

      const resetSimulation = () => {
        routeDistance = 0;
        swimClock = 0;
        simulationClock = 0;
        repulsionOffset.x = 0;
        repulsionOffset.y = 0;
        repulsionOffset.vx = 0;
        repulsionOffset.vy = 0;
        const radiusX = mobile
          ? Math.max(2.45, viewHalfWidth * 1.22)
          : viewHalfWidth * 1.04;
        const radiusY = viewHalfHeight * (mobile ? 1.02 : 1.06);
        dolphinStream = createDolphinPathStream(
          routeRef.current,
          { x: radiusX, y: radiusY },
          routeRandom,
          mobile ? 8 : 10,
        );
        routeGeneration += 1;
        logDiagnostic("route:generated", {
          generation: routeGeneration,
          route: routeRef.current,
          guidePoints: dolphinStream.guidePoints.length,
          spacing: Number(dolphinStream.spacing.toFixed(3)),
          lookaheadLength: Number(dolphinStream.path.totalLength.toFixed(3)),
          signature: dolphinStream.guidePoints.slice(0, 3).map((point) => [
            Number(point.x.toFixed(2)),
            Number(point.y.toFixed(2)),
          ]),
        });
        const routeSample = sampleDolphinBezierPath(dolphinStream.path, 0);
        dolphinHead.set(routeSample.position.x, routeSample.position.y + (mobile ? -0.2 : -0.45));
        dolphinSpine = createDolphinSpine(dolphinHead, routeSample.heading, dolphinScale);
        dolphinForward.set(Math.cos(routeSample.heading), Math.sin(routeSample.heading));
        updateDolphinGeometry();
        jellies.forEach((jelly, index) => {
          jelly.x = [-3.8, 3.35, 1.1][index] || 0;
          jelly.y = [1.7, -1.55, 2.65][index] || 0;
          jelly.vx = 0.05 + index * 0.018;
          jelly.vy = 0.035;
          resetTentacles(jelly);
        });
        particles.forEach((particle) => {
          particle.x = random() * viewHalfWidth * 2 - viewHalfWidth;
          particle.y = random() * viewHalfHeight * 2 - viewHalfHeight;
          particle.vx = 0;
          particle.vy = 0;
        });
        pulse = 0;
      };

      const updateFlowLines = (time: number) => {
        const seconds = time * 0.001;
        flowLines.forEach((flowLine, lineIndex) => {
          flowLine.controlPoints.forEach((point, pointIndex) => {
            const progress = pointIndex / Math.max(1, flowLine.controlPoints.length - 1);
            point.set(
              -viewHalfWidth - 1 + progress * (viewHalfWidth * 2 + 2),
              flowLine.baseY + Math.sin(progress * Math.PI * 2.15 + seconds * 0.14 + flowLine.phase) * (0.35 + lineIndex * 0.04),
              -4.6,
            );
          });
          const sampleCount = flowLine.positions.length / 3;
          for (let index = 0; index < sampleCount; index += 1) {
            flowLine.curve.getPoint(index / Math.max(1, sampleCount - 1), curveSample);
            const offset = index * 3;
            flowLine.positions[offset] = curveSample.x;
            flowLine.positions[offset + 1] = curveSample.y;
            flowLine.positions[offset + 2] = curveSample.z;
          }
          flowLine.attribute.needsUpdate = true;
          flowLine.material.opacity = activeTheme === "dark" ? 0.28 : 0.3;
        });
      };

      const simulateDolphin = (delta: number) => {
        if (!dolphinStream) return;
        swimClock += delta;
        const advance = advanceDolphinPathStream(
          dolphinStream,
          routeDistance,
          (mobile ? 0.92 : 1.08) * delta,
        );
        routeDistance = advance.distance;
        if (advance.advancedSegments > 0) {
          logDiagnostic("route:extended", {
            streamRevision: dolphinStream.revision,
            advancedSegments: advance.advancedSegments,
            target: [
              Number(dolphinStream.target.x.toFixed(2)),
              Number(dolphinStream.target.y.toFixed(2)),
            ],
          });
        }
        const routeSample = sampleDolphinBezierPath(dolphinStream.path, routeDistance);
        repelForce.x = 0;
        repelForce.y = 0;
        if (pointer.active) {
          pointerRepulsion(
            dolphinHead,
            pointerWorld,
            mobile ? 2.2 : 2.9,
            5.8 + pointer.speed * 10,
            repelForce,
          );
        }
        advanceRepulsionOffset(repulsionOffset, repelForce, delta, 1.9, 3.1);
        dolphinHead.set(
          routeSample.position.x + repulsionOffset.x,
          routeSample.position.y + repulsionOffset.y + (mobile ? -0.2 : -0.45),
        );
        advanceDolphinSpine(
          dolphinSpine,
          dolphinHead,
          swimClock,
          delta,
          dolphinScale,
        );
      };

      const renderDolphin = () => {
        const headFrame = sampleSpineFrame(dolphinSpine, 0);
        dolphinForward.set(headFrame.tangent.x, headFrame.tangent.y);
        updateDolphinGeometry();
      };

      const simulateJellies = (seconds: number, delta: number) => {
        jellies.forEach((jelly) => {
          sampleOceanFlow(jelly, seconds + jelly.phase, flowForce);
          jelly.vx += flowForce.x * delta * 0.1;
          jelly.vy += (flowForce.y * 0.07 + 0.018) * delta;
          if (pointer.active) {
            pointerRepulsion(jelly, pointerWorld, 1.7, 3.8 + pointer.speed * 8, repelForce);
            jelly.vx += repelForce.x * delta;
            jelly.vy += repelForce.y * delta;
          }
          jelly.vx *= Math.exp(-0.45 * delta);
          jelly.vy *= Math.exp(-0.45 * delta);
          jelly.x += jelly.vx * delta;
          jelly.y += jelly.vy * delta;

          const margin = 1;
          let wrapped = false;
          if (jelly.x < -viewHalfWidth - margin) {
            jelly.x = viewHalfWidth + margin;
            wrapped = true;
          }
          if (jelly.x > viewHalfWidth + margin) {
            jelly.x = -viewHalfWidth - margin;
            wrapped = true;
          }
          if (jelly.y > viewHalfHeight + margin) {
            jelly.y = -viewHalfHeight - margin;
            wrapped = true;
          }
          if (jelly.y < -viewHalfHeight - margin) {
            jelly.y = viewHalfHeight + margin;
            wrapped = true;
          }
          if (wrapped) resetTentacles(jelly);

          jelly.tentacles.forEach((tentacle) => {
            const anchor = { x: tentacle.offset, y: -0.03 };
            advanceRibbonChain(tentacle.points, anchor, delta, 0.16, 20, 6.4);
          });
        });
      };

      const renderJellies = (seconds: number) => {
        jellies.forEach((jelly) => {
          const breath = Math.sin(seconds * 1.45 + jelly.phase);
          const scaleX = jelly.scale * (1 + breath * 0.08);
          const scaleY = jelly.scale * (1 - breath * 0.12);
          jelly.group.position.set(jelly.x, jelly.y, -0.82);
          jelly.group.rotation.z = Math.sin(seconds * 0.4 + jelly.phase) * 0.09;
          jelly.group.scale.set(scaleX, scaleY, 1);
          jelly.fill.opacity = activeTheme === "dark" ? 0.38 : 0.3;
          jelly.edge.opacity = activeTheme === "dark" ? 0.72 : 0.6;

          jelly.tentacles.forEach((tentacle, tentacleIndex) => {
            tentacle.points.forEach((point, pointIndex) => {
              const offset = pointIndex * 3;
              const trail = pointIndex / Math.max(1, tentacle.points.length - 1);
              tentacle.positions[offset] = point.x
                + Math.sin(seconds * 1.1 + jelly.phase + tentacleIndex + pointIndex * 0.5) * trail * 0.022;
              tentacle.positions[offset + 1] = point.y;
              tentacle.positions[offset + 2] = -0.02;
            });
            tentacle.attribute.needsUpdate = true;
            tentacle.material.opacity = (activeTheme === "dark" ? 0.62 : 0.5) * (0.75 + jelly.scale * 0.25);
          });
        });
      };

      const simulateParticles = (seconds: number, delta: number) => {
        particles.forEach((particle) => {
          particle.vx *= Math.exp(-2.1 * delta);
          particle.vy *= Math.exp(-2.1 * delta);
          if (pointer.active) {
            pointerRepulsion(particle, pointerWorld, mobile ? 1.45 : 1.9, 3.6 + pointer.speed * 9, repelForce);
            particle.vx += repelForce.x * delta;
            particle.vy += repelForce.y * delta;
          }
          if (pulse > 0.01) {
            const dx = particle.x - pulseOrigin.x;
            const dy = particle.y - pulseOrigin.y;
            const distance = Math.max(0.18, Math.hypot(dx, dy));
            const strength = Math.max(0, 1 - distance / 4.6) * pulse * delta * 1.8;
            particle.vx += dx / distance * strength;
            particle.vy += dy / distance * strength;
          }
          const dolphinDistance = Math.max(0.25, Math.hypot(particle.x - dolphinHead.x, particle.y - dolphinHead.y));
          if (dolphinDistance < 1.6) {
            const wake = (1 - dolphinDistance / 1.6) * delta * 0.3;
            particle.vx -= dolphinForward.x * wake;
            particle.vy -= dolphinForward.y * wake;
          }
          sampleOceanFlow(particle, seconds + particle.phase, flowForce);
          particle.x += (flowForce.x * 0.055 + particle.vx) * delta;
          particle.y += (particle.speed + flowForce.y * 0.04 + particle.vy) * delta;
          if (particle.y > viewHalfHeight + 0.35) {
            particle.y = -viewHalfHeight - 0.35;
            particle.x = random() * viewHalfWidth * 2 - viewHalfWidth;
          }
          if (particle.x < -viewHalfWidth - 0.4) particle.x = viewHalfWidth + 0.4;
          if (particle.x > viewHalfWidth + 0.4) particle.x = -viewHalfWidth - 0.4;
        });
      };

      const renderParticles = (seconds: number) => {
        particles.forEach((particle, index) => {
          const twinkle = 0.66 + Math.sin(seconds * (0.78 + particle.speed) + particle.phase) * 0.32;
          const scale = particle.size * twinkle;
          sharedMatrix.makeScale(scale, scale, scale);
          sharedMatrix.setPosition(
            particle.x + Math.sin(seconds * 0.32 + particle.phase) * 0.06,
            particle.y + Math.cos(seconds * 0.27 + particle.phase) * 0.045,
            particle.z,
          );
          particleMesh.setMatrixAt(index, sharedMatrix);
          sharedColor.copy(palette.accent).lerp(palette.accentSoft, clamp01(twinkle - 0.46) * 0.64);
          particleMesh.setColorAt(index, sharedColor);
        });
        particleMesh.instanceMatrix.needsUpdate = true;
        if (particleMesh.instanceColor) particleMesh.instanceColor.needsUpdate = true;
        particleMaterial.opacity = activeTheme === "dark" ? 0.48 : 0.38;
      };

      const render = (time: number) => {
        if (destroyed) return;
        frame = window.requestAnimationFrame(render);
        if (document.hidden) {
          if (!hiddenLogged) logDiagnostic("loop:hidden");
          hiddenLogged = true;
          lastTime = time;
          return;
        }
        if (hiddenLogged) logDiagnostic("loop:visible");
        hiddenLogged = false;

        try {
          const frameDelta = Math.max(0, (time - lastTime) / 1000);
          lastTime = time;
          if (activeTheme !== themeRef.current) applyPalette();
          if (activeRoute !== routeRef.current) {
            activeRoute = routeRef.current;
            resetSimulation();
          }
          if (resetVersion !== resetVersionRef.current) {
            resetVersion = resetVersionRef.current;
            resetSimulation();
          }
          const substeps = calculateSimulationSubsteps(frameDelta);
          pointer.speed *= Math.exp(-3.2 * substeps.simulatedDelta);
          pulse *= Math.exp(-2.8 * substeps.simulatedDelta);
          updatePointerWorld();
          if (!pausedRef.current) {
            for (let step = 0; step < substeps.count; step += 1) {
              simulationClock += substeps.delta;
              simulateDolphin(substeps.delta);
              simulateJellies(simulationClock, substeps.delta);
              simulateParticles(simulationClock, substeps.delta);
            }
            updateFlowLines(simulationClock * 1000);
            renderDolphin();
            renderJellies(simulationClock);
            renderParticles(simulationClock);
          }
          renderer.render(scene, camera);
          renderedFrames += 1;
          if (renderedFrames === 1) {
            logDiagnostic("frame:first", { backend: backendName, paused: pausedRef.current });
          }
          if (debugEnabled && time - lastHeartbeat >= 2000) {
            lastHeartbeat = time;
            logDiagnostic("frame:heartbeat", {
              frames: renderedFrames,
              route: activeRoute,
              segmentProgress: dolphinStream
                ? Number((routeDistance / dolphinStream.path.segmentLengths[0]).toFixed(3))
                : 0,
              streamRevision: dolphinStream?.revision || 0,
              paused: pausedRef.current,
            });
          }
        } catch (error) {
          window.cancelAnimationFrame(frame);
          logDiagnostic("frame:fatal", { error: describeError(error), frame: renderedFrames });
          host.dataset.status = "fallback";
          setBackend("static");
          setStatus("fallback");
        }
      };

      const ensureRunning = () => {
        window.cancelAnimationFrame(frame);
        if (destroyed) return;
        lastTime = performance.now();
        frame = window.requestAnimationFrame(render);
      };

      const handlePointerMove = (event: PointerEvent) => {
        const rect = host.getBoundingClientRect();
        const localX = event.clientX - rect.left;
        const localY = event.clientY - rect.top;
        const now = performance.now();
        const elapsed = Math.max(8, now - pointer.updatedAt);
        const distance = Math.hypot(localX - pointer.previousX, localY - pointer.previousY);
        pointer.speed = pointer.active ? Math.min(2.4, distance / elapsed) : 0;
        pointer.active = event.pointerType !== "touch";
        pointer.x = localX;
        pointer.y = localY;
        pointer.previousX = localX;
        pointer.previousY = localY;
        pointer.updatedAt = now;
      };

      const handlePointerLeave = () => {
        pointer.active = false;
        pointer.speed = 0;
      };

      const handlePointerDown = (event: PointerEvent) => {
        const rect = host.getBoundingClientRect();
        pointer.x = event.clientX - rect.left;
        pointer.y = event.clientY - rect.top;
        updatePointerWorld();
        pulseOrigin.copy(pointerWorld);
        pulse = 1;
      };

      const handleVisibility = () => {
        ensureRunning();
      };

      const resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(host);
      host.addEventListener("pointermove", handlePointerMove, { passive: true });
      host.addEventListener("pointerdown", handlePointerDown, { passive: true });
      host.addEventListener("pointerleave", handlePointerLeave);
      document.addEventListener("visibilitychange", handleVisibility);

      applyPalette();
      resize();
      resetSimulation();
      updateFlowLines(0);
      renderDolphin();
      renderJellies(0);
      renderParticles(0);
      host.dataset.status = "ready";
      setStatus("ready");
      logDiagnostic("scene:ready", {
        backend: backendName,
        particles: particleCount,
        jellies: jellies.length,
      });
      ensureRunning();

      cleanupScene = () => {
        window.cancelAnimationFrame(frame);
        resizeObserver.disconnect();
        host.removeEventListener("pointermove", handlePointerMove);
        host.removeEventListener("pointerdown", handlePointerDown);
        host.removeEventListener("pointerleave", handlePointerLeave);
        document.removeEventListener("visibilitychange", handleVisibility);
        scene.clear();
        resources.forEach((resource) => resource.dispose());
        renderer.dispose();
      };
    };

    void initialize().catch((error) => {
      if (destroyed) return;
      logDiagnostic("initialize:fatal", { error: describeError(error) });
      host.dataset.status = "fallback";
      host.dataset.backend = "static";
      setBackend("static");
      setStatus("fallback");
    });

    return () => {
      destroyed = true;
      cleanupScene?.();
    };
  }, []);

  const togglePaused = () => setPaused((value) => {
    pausedRef.current = !value;
    return !value;
  });
  const toggleTheme = () => setTheme((value) => value === "dark" ? "light" : "dark");
  const selectRoute = (nextRoute: DolphinRoute) => {
    routeRef.current = nextRoute;
    setRoute(nextRoute);
  };
  const reset = () => {
    resetVersionRef.current += 1;
    pausedRef.current = false;
    setPaused(false);
  };

  return (
    <main className="creature-demo" data-theme={theme} data-status={status} data-route={route}>
      <div
        ref={hostRef}
        className="creature-demo-world"
        data-status={status}
        data-backend={backend}
        data-facing="same-side"
      >
        <canvas aria-hidden="true" />
        <svg className="creature-demo-static" viewBox="-4.05 -1.05 4.7 2.1" aria-hidden="true">
          <path className="creature-demo-static-fin" d="M-1.12-.58C-1.38-.95-1.69-1.02-1.91-.46C-1.62-.53-1.36-.57-1.12-.58Z" />
          <path className="creature-demo-static-tail" d="M-2.93-.08C-3.19-.14-3.39-.4-3.76-.49C-3.67-.24-3.52-.08-3.21-.005C-3.52.04-3.72.18-3.86.42C-3.43.37-3.2.16-2.95.07Z" />
          <path className="creature-demo-static-body" d="M.43-.025C.35-.055.23-.075.08-.105C.09-.31-.06-.49-.31-.56C-.86-.72-1.62-.61-2.19-.39C-2.5-.27-2.77-.17-3.02-.09L-3.04.075C-2.76.13-2.49.2-2.2.31C-1.61.52-.9.53-.39.37C-.11.28.09.17.29.135C.37.115.44.055.43-.025Z" />
          <path className="creature-demo-static-belly" d="M.38.045C.21.08.04.17-.2.25C-.72.44-1.42.46-2.18.3C-1.55.53-.86.53-.38.37C-.1.28.1.17.29.135C.35.11.39.075.38.045Z" />
          <path className="creature-demo-static-fin" d="M-.68.23C-.88.52-1.12.91-1.42.93C-1.33.53-1.14.24-.77.12C-.71.14-.68.18-.68.23Z" />
          <circle className="creature-demo-static-eye" cx="-.13" cy="-.22" r=".052" />
          <path className="creature-demo-static-mouth" d="M.38.065C.3.085.18.11.06.115" />
        </svg>
        <div className="creature-demo-post" aria-hidden="true"></div>
        <pre className="creature-demo-diagnostics" data-diagnostics aria-live="polite"></pre>
      </div>

      <header className="creature-demo-header">
        <p>Same-side procedural motion</p>
        <h1>Dolphin motion study</h1>
      </header>

      <div className="creature-demo-toolbar">
        <div className="creature-demo-route" role="group" aria-label="游动路径">
          <button type="button" aria-pressed={route === "wander"} onClick={() => selectRoute("wander")}>漫游</button>
          <button type="button" aria-pressed={route === "cruise"} onClick={() => selectRoute("cruise")}>巡游</button>
        </div>
        <div className="creature-demo-controls" role="toolbar" aria-label="演示控制">
          <button type="button" onClick={togglePaused} aria-pressed={paused} title={paused ? "继续" : "暂停"} aria-label={paused ? "继续动画" : "暂停动画"}>
            {paused ? <PlayIcon size={19} weight="fill" /> : <PauseIcon size={19} weight="fill" />}
          </button>
          <button type="button" onClick={reset} title="重置" aria-label="重置动画">
            <ArrowCounterClockwiseIcon size={20} weight="bold" />
          </button>
          <button type="button" onClick={toggleTheme} title={theme === "dark" ? "浅色主题" : "深色主题"} aria-label={theme === "dark" ? "切换到浅色主题" : "切换到深色主题"}>
            {theme === "dark" ? <SunIcon size={20} weight="bold" /> : <MoonIcon size={20} weight="bold" />}
          </button>
        </div>
      </div>

      <footer className="creature-demo-footer">
        <div className="creature-demo-status">
          <i data-ready={status === "ready" || undefined}></i>
          <span>{backend}</span>
          <span>{paused ? "paused" : status}</span>
        </div>
      </footer>
    </main>
  );
}
