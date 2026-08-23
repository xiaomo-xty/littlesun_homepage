import { useEffect, useRef } from "react";
import * as THREE from "three/webgpu";
import {
  AMBIENT_ENTITY_MAX_SPEED,
  AMBIENT_ENTITY_RESTITUTION,
  AMBIENT_FIXED_STEP,
  AMBIENT_JELLY_MAX_SPEED,
  advanceRibbonChain,
  gentlyDisplaceBody,
  limitMotionSpeed,
  limitSolidSpeed,
  pointerRepulsion,
  resolveCircleCollision,
  sampleAmbientDepth,
  sampleJellyLuminescence,
  sampleJellyPose,
  sampleOceanFlow,
  scheduleFixedSimulation,
  wrapDriftingBody,
  type CollisionResult,
  type RibbonPoint,
  type SolidBodyState,
  type SolidKind,
  type Vector2Like,
} from "../lib/ambientSimulation";
import {
  DOLPHIN_BODY_LENGTH,
  advanceDolphinPathStream,
  advanceDolphinSpine,
  advanceRepulsionOffset,
  createDolphinPathStream,
  createDolphinSpine,
  sampleDolphinBezierPath,
  sampleSpineFrame,
  type DolphinPathStream,
  type DolphinSpinePoint,
  type RepulsionState,
} from "../lib/dolphinSimulation";
import {
  createDolphinBellyShape,
  createDolphinBodyShape,
  createDolphinDorsalFinShape,
  createDolphinPectoralFinShape,
  createDolphinTailShape,
} from "../lib/dolphinGeometry";

type Disposable = { dispose: () => void };
type BackendFlags = { isWebGPUBackend?: boolean; isWebGLBackend?: boolean };

type SceneProfile = {
  energy: number;
  entity: number;
  particle: number;
  jelly: number;
  dolphinSpeed: number;
  dolphinBiasY: number;
  flow: number;
};

type OceanEntity = SolidBodyState & {
  relic: MarineRelicKind;
  group: THREE.Group;
  fill: THREE.MeshBasicMaterial;
  edge: THREE.LineBasicMaterial;
  detail: THREE.LineBasicMaterial;
  glow?: THREE.MeshBasicMaterial;
  hit: number;
  phase: number;
  depth: number;
  previousX: number;
  previousY: number;
  rotation: number;
  previousRotation: number;
  restRotation: number;
  age: number;
  colorShift: number;
};

type MarineRelicKind = "sea-bloom" | "sea-glass" | "coral";

type OceanParticle = {
  x: number;
  y: number;
  previousX: number;
  previousY: number;
  z: number;
  vx: number;
  vy: number;
  depth: number;
  depthScale: number;
  depthOpacity: number;
  drift: number;
  interaction: number;
  size: number;
  phase: number;
  speed: number;
};

type ParticleLayer = {
  mesh: THREE.InstancedMesh;
  material: THREE.MeshBasicMaterial;
  glowMesh?: THREE.InstancedMesh;
  glowMaterial?: THREE.MeshBasicMaterial;
  particles: OceanParticle[];
  depthRange: readonly [number, number];
};

type JellyTentacle = {
  points: RibbonPoint[];
  positions: Float32Array;
  attribute: THREE.BufferAttribute;
  material: THREE.LineBasicMaterial;
  offset: number;
};

type AmbientJelly = Vector2Like & {
  previousX: number;
  previousY: number;
  vx: number;
  vy: number;
  phase: number;
  scale: number;
  depth: number;
  cycleDuration: number;
  pulseStrength: number;
  swimRate: number;
  heading: number;
  previousHeading: number;
  group: THREE.Group;
  fill: THREE.MeshBasicMaterial;
  edge: THREE.LineBasicMaterial;
  glow: THREE.MeshBasicMaterial;
  outerGlow: THREE.MeshBasicMaterial;
  halo: THREE.Mesh;
  outerHalo: THREE.Mesh;
  colorShift: number;
  tentacles: JellyTentacle[];
};

type SafeZone = { left: number; right: number; top: number; bottom: number };

type DolphinPart = {
  attribute: THREE.BufferAttribute;
  basePositions: Float32Array;
};

type FlowRibbon = {
  controlPoints: THREE.Vector3[];
  curve: THREE.CatmullRomCurve3;
  positions: Float32Array;
  attribute: THREE.BufferAttribute;
  material: THREE.LineBasicMaterial;
  samples: number;
  phase: number;
  baseY: number;
  depth: number;
};

const profiles: Record<string, SceneProfile> = {
  top: { energy: 0.86, entity: 0.78, particle: 0.72, jelly: 0.86, dolphinSpeed: 0.82, dolphinBiasY: 0.12, flow: 0.72 },
  about: { energy: 0.64, entity: 0.58, particle: 0.44, jelly: 0.62, dolphinSpeed: 0.62, dolphinBiasY: -0.08, flow: 0.58 },
  projects: { energy: 1, entity: 0.94, particle: 0.88, jelly: 1, dolphinSpeed: 1, dolphinBiasY: 0.04, flow: 0.92 },
  articles: { energy: 0.54, entity: 0.48, particle: 0.34, jelly: 0.54, dolphinSpeed: 0.54, dolphinBiasY: -0.2, flow: 0.48 },
  life: { energy: 0.82, entity: 0.72, particle: 0.72, jelly: 0.88, dolphinSpeed: 0.84, dolphinBiasY: 0.18, flow: 0.8 },
  contact: { energy: 0.58, entity: 0.52, particle: 0.38, jelly: 0.58, dolphinSpeed: 0.56, dolphinBiasY: 0, flow: 0.52 },
};

const defaultProfile = profiles.top;

function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function lerp(current: number, target: number, amount: number) {
  return current + (target - current) * amount;
}

function lerpAngle(current: number, target: number, amount: number) {
  return current + Math.atan2(Math.sin(target - current), Math.cos(target - current)) * amount;
}

const marineRelicForSolid: Record<SolidKind, MarineRelicKind> = {
  circle: "sea-bloom",
  rect: "sea-glass",
  triangle: "coral",
};

export default function AmbientWorld() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = host?.querySelector("canvas");
    if (!host || !(canvas instanceof HTMLCanvasElement)) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const mobile = window.matchMedia("(max-width: 767px)").matches;
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    const saveData = Boolean(connection?.saveData);
    const lowPower = (navigator.hardwareConcurrency || 8) <= 4 || saveData;
    const requestedBackend = new URLSearchParams(window.location.search).get("ambient");
    const staticOnly = requestedBackend === "static" || reduceMotion.matches || saveData;

    const signalAmbientReady = () => {
      if (host.dataset.status === "ready") return;
      host.dataset.status = "ready";
      document.documentElement.dataset.ambientReady = "true";
      window.dispatchEvent(new CustomEvent("homepage:ambient-ready", {
        detail: { backend: host.dataset.backend || "static" },
      }));
    };

    host.dataset.backend = "static";
    host.dataset.quality = "static";
    host.dataset.creature = "same-side-dolphin";
    host.dataset.pointerForce = "repel";
    host.dataset.entityVisual = "marine-still-life";
    host.dataset.contactModel = "gentle-displacement";
    host.dataset.entityModel = "fixed-drift";
    host.dataset.glowModel = "selective-additive";
    host.dataset.jellyMotion = "pulse-glide";
    host.dataset.jellyPropulsion = "pulse-recoil";
    host.dataset.staticOverlay = "fallback-only";
    host.dataset.entityScale = "small";
    host.dataset.relicSet = "sea-bloom-sea-glass-coral";
    host.dataset.entityRadiusMax = "0";
    host.dataset.entitySpeedMax = "0";
    host.dataset.jellySpeedMax = "0";
    host.dataset.coralAngleDeviation = "0";
    host.dataset.simulationStep = "60hz";
    host.dataset.entityCount = "0";
    host.dataset.organismCount = "0";
    document.documentElement.dataset.ambientBackend = "static";

    if (staticOnly) {
      signalAmbientReady();
      return;
    }

    let destroyed = false;
    let cleanupScene: (() => void) | undefined;

    const initialize = async () => {
      const resources = new Set<Disposable>();
      const register = <T extends Disposable>(resource: T) => {
        resources.add(resource);
        return resource;
      };
      const webGPUAvailable = window.isSecureContext && "gpu" in navigator;
      const forceWebGL = requestedBackend === "webgl2" || !webGPUAvailable;
      const balanced = lowPower || mobile || forceWebGL;
      const random = seededRandom(20260818);
      const renderer = new THREE.WebGPURenderer({
        canvas,
        alpha: true,
        antialias: !balanced,
        forceWebGL,
        powerPreference: balanced ? "low-power" : "high-performance",
      });

      try {
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.setClearColor(0x000000, 0);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, balanced ? 1.1 : 1.42));
        await renderer.init();
      } catch {
        renderer.dispose();
        if (!destroyed) signalAmbientReady();
        return;
      }

      if (destroyed) {
        renderer.dispose();
        return;
      }

      const backend = renderer.backend as BackendFlags;
      const backendName = backend.isWebGPUBackend ? "webgpu" : backend.isWebGLBackend ? "webgl2" : "static";
      host.dataset.backend = backendName;
      host.dataset.quality = balanced || backendName === "webgl2" ? "balanced" : "full";
      document.documentElement.dataset.ambientBackend = backendName;

      const scene = new THREE.Scene();
      const camera = new THREE.OrthographicCamera(-8, 8, 5, -5, 0.1, 40);
      camera.position.z = 12;
      const world = new THREE.Group();
      scene.add(world);

      let width = 1;
      let height = 1;
      let viewHalfWidth = 8;
      const viewHalfHeight = 5;
      let frame = 0;
      let lastTime = performance.now();
      let pageVisible = !document.hidden;
      let safeZones: SafeZone[] = [];
      let currentProfile = { ...defaultProfile };
      let targetProfile = { ...defaultProfile };
      let pulse = 0;
      let hasRendered = false;
      let simulationAccumulator = 0;
      let simulationTick = 0;
      let lightTheme = true;
      const pulseOrigin = new THREE.Vector2();

      const pointer = {
        active: false,
        x: 0,
        y: 0,
        previousX: 0,
        previousY: 0,
        speed: 0,
        updatedAt: performance.now(),
      };

      const palette = {
        accent: new THREE.Color(),
        accentStrong: new THREE.Color(),
        line: new THREE.Color(),
        surface: new THREE.Color(),
        ink: new THREE.Color(),
      };

      const sharedMatrix = new THREE.Matrix4();
      const sharedColor = new THREE.Color();
      const curveSample = new THREE.Vector3();
      const pointerWorld = new THREE.Vector2();
      const repelForce: Vector2Like = { x: 0, y: 0 };
      const flowForce: Vector2Like = { x: 0, y: 0 };
      const zoneForce = new THREE.Vector2();
      const obstacleForce = new THREE.Vector2();

      const particleGeometry = register(new THREE.BoxGeometry(0.05, 0.05, 0.025));
      const particleLayerSpecs = [
        { count: balanced ? 28 : 48, depthRange: [0.02, 0.34] as const, renderOrder: 18, glow: false },
        { count: balanced ? 14 : 26, depthRange: [0.38, 0.72] as const, renderOrder: 70, glow: false },
        { count: balanced ? 6 : 10, depthRange: [0.8, 1] as const, renderOrder: 112, glow: true },
      ];
      const particleLayers: ParticleLayer[] = particleLayerSpecs.map((spec) => {
        const material = register(new THREE.MeshBasicMaterial({
          transparent: true,
          depthTest: false,
          depthWrite: false,
          vertexColors: true,
        }));
        const mesh = new THREE.InstancedMesh(particleGeometry, material, spec.count);
        mesh.frustumCulled = false;
        mesh.renderOrder = spec.renderOrder;
        world.add(mesh);
        const glowMaterial = spec.glow
          ? register(new THREE.MeshBasicMaterial({
              transparent: true,
              depthTest: false,
              depthWrite: false,
              vertexColors: true,
              blending: THREE.AdditiveBlending,
              toneMapped: false,
            }))
          : undefined;
        const glowMesh = glowMaterial
          ? new THREE.InstancedMesh(particleGeometry, glowMaterial, spec.count)
          : undefined;
        if (glowMesh) {
          glowMesh.frustumCulled = false;
          glowMesh.renderOrder = spec.renderOrder - 1;
          world.add(glowMesh);
        }
        const layerParticles = Array.from({ length: spec.count }, (): OceanParticle => {
          const depth = spec.depthRange[0] + random() * (spec.depthRange[1] - spec.depthRange[0]);
          const depthProfile = sampleAmbientDepth(depth);
          return {
            x: random() * 12 - 6,
            y: random() * 10 - 5,
            previousX: 0,
            previousY: 0,
            z: -5.4 + depth * 5.8,
            vx: 0,
            vy: 0,
            depth,
            depthScale: depthProfile.scale,
            depthOpacity: depthProfile.opacity,
            drift: depthProfile.drift,
            interaction: depthProfile.interaction,
            size: 0.62 + random() * 0.88,
            phase: random() * Math.PI * 2,
            speed: 0.035 + random() * 0.12,
          };
        }).map((particle) => {
          particle.previousX = particle.x;
          particle.previousY = particle.y;
          return particle;
        });
        return {
          mesh,
          material,
          glowMesh,
          glowMaterial,
          particles: layerParticles,
          depthRange: spec.depthRange,
        };
      });
      const particles = particleLayers.flatMap((layer) => layer.particles);

      const createFlowRibbon = (index: number): FlowRibbon => {
        const controlCount = balanced ? 6 : 8;
        const samples = balanced ? 34 : 52;
        const controlPoints = Array.from({ length: controlCount }, () => new THREE.Vector3());
        const curve = new THREE.CatmullRomCurve3(controlPoints, false, "centripetal", 0.42);
        const positions = new Float32Array(samples * 3);
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
          samples,
          phase: random() * Math.PI * 2,
          baseY: -3.6 + index * 2.35,
          depth: -3.4 - index * 0.28,
        };
      };
      const flowRibbons = Array.from({ length: balanced ? 3 : 4 }, (_, index) => createFlowRibbon(index));

      const jellyShape = new THREE.Shape();
      jellyShape.moveTo(-0.55, 0);
      jellyShape.bezierCurveTo(-0.5, 0.48, -0.2, 0.68, 0, 0.68);
      jellyShape.bezierCurveTo(0.2, 0.68, 0.5, 0.48, 0.55, 0);
      jellyShape.quadraticCurveTo(0.36, -0.12, 0.2, 0);
      jellyShape.quadraticCurveTo(0, -0.14, -0.2, 0);
      jellyShape.quadraticCurveTo(-0.36, -0.12, -0.55, 0);
      const jellyGeometry = register(new THREE.ShapeGeometry(jellyShape, balanced ? 10 : 18));
      const jellyEdgeGeometry = register(new THREE.EdgesGeometry(jellyGeometry, 34));
      const jellies: AmbientJelly[] = [];

      const resetJellyTentacles = (jelly: AmbientJelly) => {
        jelly.tentacles.forEach((tentacle) => {
          tentacle.points.forEach((point, pointIndex) => {
            point.x = tentacle.offset;
            point.y = -pointIndex * 0.16;
            point.vx = 0;
            point.vy = 0;
          });
        });
      };

      const createJelly = (x: number, y: number, scale: number, phase: number, depth: number) => {
        const fill = register(new THREE.MeshBasicMaterial({
          transparent: true,
          side: THREE.DoubleSide,
          depthTest: false,
          depthWrite: false,
        }));
        const edge = register(new THREE.LineBasicMaterial({
          transparent: true,
          depthTest: false,
          depthWrite: false,
        }));
        const glow = register(new THREE.MeshBasicMaterial({
          transparent: true,
          side: THREE.DoubleSide,
          depthTest: false,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          toneMapped: false,
        }));
        const outerGlow = register(new THREE.MeshBasicMaterial({
          transparent: true,
          side: THREE.DoubleSide,
          depthTest: false,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          toneMapped: false,
        }));
        const outerHalo = new THREE.Mesh(jellyGeometry, outerGlow);
        const halo = new THREE.Mesh(jellyGeometry, glow);
        const bell = new THREE.Mesh(jellyGeometry, fill);
        const outline = new THREE.LineSegments(jellyEdgeGeometry, edge);
        const group = new THREE.Group();
        const renderOrder = 52 + Math.round(depth * 30);
        outerHalo.renderOrder = renderOrder - 2;
        outerHalo.scale.set(1.42, 1.34, 1);
        halo.renderOrder = renderOrder - 1;
        halo.scale.set(1.17, 1.12, 1);
        bell.renderOrder = renderOrder;
        outline.renderOrder = renderOrder + 1;
        group.add(outerHalo, halo, bell, outline);
        group.position.set(x, y, -3.2 + depth * 2.4);
        group.frustumCulled = false;
        world.add(group);

        const tentacles: JellyTentacle[] = Array.from({ length: 4 }, (_, tentacleIndex) => {
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
          const material = register(new THREE.LineBasicMaterial({
            transparent: true,
            depthTest: false,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            toneMapped: false,
          }));
          const line = new THREE.Line(geometry, material);
          line.frustumCulled = false;
          line.renderOrder = renderOrder + 2;
          group.add(line);
          return { points, positions, attribute, material, offset };
        });

        const heading = Math.PI * (0.34 + random() * 0.32);
        jellies.push({
          x,
          y,
          previousX: x,
          previousY: y,
          vx: 0.04 + random() * 0.07,
          vy: 0.02 + random() * 0.04,
          depth,
          phase,
          scale,
          cycleDuration: 2.15 + random() * 0.85,
          pulseStrength: 0.36 + random() * 0.14,
          swimRate: 0.18 + random() * 0.08,
          heading,
          previousHeading: heading,
          group,
          fill,
          edge,
          glow,
          outerGlow,
          halo,
          outerHalo,
          colorShift: random() * 2 - 1,
          tentacles,
        });
      };

      createJelly(-3.8, 1.7, 0.62, 0.2, 0.62);
      createJelly(3.35, -1.55, 0.52, 2.5, 0.38);
      if (!balanced) createJelly(1.1, 2.65, 0.38, 4.1, 0.72);
      host.dataset.organismCount = String(jellies.length);

      const entities: OceanEntity[] = [];
      const collisionResult: CollisionResult = { collided: false, impact: 0, nx: 0, ny: 0 };

      const createEntityShape = (kind: SolidKind, radius: number) => {
        const shape = new THREE.Shape();
        if (kind === "circle") {
          const samples = balanced ? 40 : 64;
          for (let index = 0; index <= samples; index += 1) {
            const angle = index / samples * Math.PI * 2 - Math.PI / 2;
            const bloomRadius = radius * (
              0.63
              + Math.cos(angle * 5 + 0.36) * 0.12
              + Math.sin(angle * 3 - 0.42) * 0.035
            );
            const x = Math.cos(angle) * bloomRadius;
            const y = Math.sin(angle) * bloomRadius;
            if (index === 0) shape.moveTo(x, y);
            else shape.lineTo(x, y);
          }
          shape.closePath();
        } else if (kind === "rect") {
          shape.moveTo(-radius * 0.78, -radius * 0.22);
          shape.bezierCurveTo(-radius * 0.72, -radius * 0.58, -radius * 0.28, -radius * 0.66, radius * 0.18, -radius * 0.56);
          shape.bezierCurveTo(radius * 0.66, -radius * 0.5, radius * 0.88, -radius * 0.2, radius * 0.78, radius * 0.2);
          shape.bezierCurveTo(radius * 0.66, radius * 0.56, radius * 0.18, radius * 0.64, -radius * 0.28, radius * 0.56);
          shape.bezierCurveTo(-radius * 0.72, radius * 0.48, -radius * 0.9, radius * 0.14, -radius * 0.78, -radius * 0.22);
        } else {
          shape.moveTo(-radius * 0.2, -radius * 0.78);
          shape.lineTo(radius * 0.16, -radius * 0.76);
          shape.lineTo(radius * 0.15, -radius * 0.24);
          shape.lineTo(radius * 0.48, -radius * 0.02);
          shape.lineTo(radius * 0.66, -radius * 0.25);
          shape.lineTo(radius * 0.82, -radius * 0.08);
          shape.lineTo(radius * 0.52, radius * 0.26);
          shape.lineTo(radius * 0.2, radius * 0.06);
          shape.lineTo(radius * 0.08, radius * 0.74);
          shape.lineTo(-radius * 0.16, radius * 0.7);
          shape.lineTo(-radius * 0.2, radius * 0.2);
          shape.lineTo(-radius * 0.52, radius * 0.5);
          shape.lineTo(-radius * 0.72, radius * 0.3);
          shape.lineTo(-radius * 0.42, 0);
          shape.lineTo(-radius * 0.18, radius * 0.1);
        }
        return shape;
      };

      const createEntityDetailGeometry = (kind: SolidKind, radius: number) => {
        const points: THREE.Vector3[] = [];
        const segment = (x1: number, y1: number, x2: number, y2: number) => {
          points.push(
            new THREE.Vector3(x1 * radius, y1 * radius, -0.012),
            new THREE.Vector3(x2 * radius, y2 * radius, -0.012),
          );
        };
        if (kind === "circle") {
          const cubicPoint = (
            start: Vector2Like,
            controlA: Vector2Like,
            controlB: Vector2Like,
            end: Vector2Like,
            amount: number,
          ) => {
            const inverse = 1 - amount;
            return {
              x: inverse ** 3 * start.x
                + 3 * inverse ** 2 * amount * controlA.x
                + 3 * inverse * amount ** 2 * controlB.x
                + amount ** 3 * end.x,
              y: inverse ** 3 * start.y
                + 3 * inverse ** 2 * amount * controlA.y
                + 3 * inverse * amount ** 2 * controlB.y
                + amount ** 3 * end.y,
            };
          };
          const drawCubic = (
            start: Vector2Like,
            controlA: Vector2Like,
            controlB: Vector2Like,
            end: Vector2Like,
          ) => {
            let previous = start;
            const samples = balanced ? 6 : 9;
            for (let index = 1; index <= samples; index += 1) {
              const current = cubicPoint(start, controlA, controlB, end, index / samples);
              segment(previous.x, previous.y, current.x, current.y);
              previous = current;
            }
          };
          const lengths = [0.88, 1, 0.82, 0.94, 0.76];
          const widths = [0.2, 0.23, 0.18, 0.21, 0.17];
          lengths.forEach((length, index) => {
            const angle = -Math.PI / 2 + index / lengths.length * Math.PI * 2 + index * 0.035;
            const forward = { x: Math.cos(angle), y: Math.sin(angle) };
            const side = { x: -forward.y, y: forward.x };
            const width = widths[index];
            const start = { x: side.x * 0.025, y: side.y * 0.025 };
            const tip = { x: forward.x * length, y: forward.y * length };
            const end = { x: -side.x * 0.025, y: -side.y * 0.025 };
            drawCubic(
              start,
              { x: forward.x * length * 0.3 + side.x * width, y: forward.y * length * 0.3 + side.y * width },
              { x: forward.x * length * 0.78 + side.x * width * 0.82, y: forward.y * length * 0.78 + side.y * width * 0.82 },
              tip,
            );
            drawCubic(
              tip,
              { x: forward.x * length * 0.76 - side.x * width * 0.86, y: forward.y * length * 0.76 - side.y * width * 0.86 },
              { x: forward.x * length * 0.28 - side.x * width, y: forward.y * length * 0.28 - side.y * width },
              end,
            );
          });
        } else if (kind === "rect") {
          segment(-0.45, 0.26, 0.38, 0.38);
          segment(-0.5, 0.12, 0.56, 0.25);
        } else {
          segment(-0.02, -0.62, -0.02, 0.58);
          segment(-0.02, -0.1, 0.52, 0.02);
          segment(-0.04, 0.12, -0.48, 0.35);
        }
        return new THREE.BufferGeometry().setFromPoints(points);
      };

      const createEntity = (
        kind: SolidKind,
        radius: number,
        x: number,
        y: number,
        vx: number,
        vy: number,
      ) => {
        const geometry = register(new THREE.ShapeGeometry(createEntityShape(kind, radius), balanced ? 8 : 12));
        const fill = register(new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false }));
        const mesh = new THREE.Mesh(geometry, fill);
        const glow = kind === "triangle"
          ? undefined
          : register(new THREE.MeshBasicMaterial({
              transparent: true,
              side: THREE.DoubleSide,
              depthTest: false,
              depthWrite: false,
              blending: THREE.AdditiveBlending,
              toneMapped: false,
            }));
        const halo = glow ? new THREE.Mesh(geometry, glow) : undefined;
        const edgeGeometry = register(new THREE.EdgesGeometry(geometry, 36));
        const edge = register(new THREE.LineBasicMaterial({ transparent: true, depthWrite: false }));
        const edges = new THREE.LineSegments(edgeGeometry, edge);
        const detail = register(new THREE.LineBasicMaterial({ transparent: true, depthWrite: false }));
        const detailGeometry = register(createEntityDetailGeometry(kind, radius));
        const details = new THREE.LineSegments(detailGeometry, detail);
        const group = new THREE.Group();
        if (halo) {
          halo.renderOrder = 32;
          halo.scale.setScalar(kind === "circle" ? 1.24 : 1.16);
          group.add(halo);
        }
        mesh.renderOrder = 33;
        edges.renderOrder = 34;
        details.renderOrder = 35;
        group.add(mesh, edges, details);
        world.add(group);
        const rotation = (random() - 0.5) * 0.34;
        const coral = kind === "triangle";

        const entity: OceanEntity = {
          relic: marineRelicForSolid[kind],
          group,
          fill,
          edge,
          detail,
          glow,
          hit: 0,
          phase: random() * Math.PI * 2,
          depth: -0.72 - random() * 1.32,
          x,
          y,
          previousX: x,
          previousY: y,
          vx,
          vy,
          radius,
          mass: Math.max(0.22, radius * radius * (kind === "rect" ? 1.3 : 1)),
          angularVelocity: (random() - 0.5) * (coral ? 0.012 : 0.035),
          rotation,
          previousRotation: rotation,
          restRotation: rotation,
          age: 0,
          colorShift: random() * 2 - 1,
        };
        entities.push(entity);
        return entity;
      };

      const initialEntityCount = balanced ? 6 : 8;
      const kinds: SolidKind[] = ["rect", "circle", "triangle"];
      const spawnSlots = [
        [-0.72, 0.58],
        [0.62, 0.5],
        [-0.34, -0.56],
        [0.46, -0.42],
        [0.04, 0.12],
        [-0.78, -0.08],
        [0.78, -0.12],
        [0.12, -0.76],
      ] as const;
      for (let index = 0; index < initialEntityCount; index += 1) {
        const radius = 0.2 + random() * (balanced ? 0.14 : 0.18);
        const slot = spawnSlots[index];
        const driftAngle = random() * Math.PI * 2;
        const driftSpeed = 0.025 + random() * 0.04;
        createEntity(
          kinds[index % kinds.length],
          radius,
          (slot[0] + (random() - 0.5) * 0.08) * viewHalfWidth,
          (slot[1] + (random() - 0.5) * 0.08) * viewHalfHeight,
          Math.cos(driftAngle) * driftSpeed,
          Math.sin(driftAngle) * driftSpeed,
        );
      }
      host.dataset.entityCount = String(initialEntityCount);
      host.dataset.entityRadiusMax = entities.reduce(
        (maximum, entity) => Math.max(maximum, entity.radius),
        0,
      ).toFixed(3);
      const dolphinParts: DolphinPart[] = [];
      const createDolphinMaterial = (color: number) => register(new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
      }));
      const dolphinBodyMaterial = createDolphinMaterial(0x58b4dc);
      const dolphinBellyMaterial = createDolphinMaterial(0xb5e4ec);
      const dolphinFinMaterial = createDolphinMaterial(0x3c94bd);
      const dolphinEyeMaterial = createDolphinMaterial(0x071722);
      const dolphinGlowMaterial = createDolphinMaterial(0x58b4dc);
      dolphinGlowMaterial.blending = THREE.AdditiveBlending;
      dolphinGlowMaterial.toneMapped = false;
      const dolphinOutlineMaterial = register(new THREE.LineBasicMaterial({
        color: 0xc4eff7,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }));
      const dolphinMouthMaterial = register(new THREE.LineBasicMaterial({
        color: 0x17526d,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }));

      const addDolphinPart = (
        geometry: THREE.BufferGeometry,
        object: THREE.Object3D,
        renderOrder: number,
      ) => {
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

      const addDolphinShape = (shape: THREE.Shape, material: THREE.MeshBasicMaterial, order: number) => {
        const geometry = register(new THREE.ShapeGeometry(shape, balanced ? 18 : 28));
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.z = -0.2 + order * 0.001;
        addDolphinPart(geometry, mesh, order);
      };

      const addDolphinGlowShape = (shape: THREE.Shape) => {
        const geometry = register(new THREE.ShapeGeometry(shape, balanced ? 18 : 28));
        geometry.scale(1.035, 1.16, 1);
        const mesh = new THREE.Mesh(geometry, dolphinGlowMaterial);
        mesh.position.z = -0.115;
        addDolphinPart(geometry, mesh, 87);
      };

      const dolphinBodyShape = createDolphinBodyShape();
      addDolphinGlowShape(dolphinBodyShape);
      addDolphinShape(createDolphinTailShape(), dolphinFinMaterial, 88);
      addDolphinShape(createDolphinDorsalFinShape(), dolphinFinMaterial, 89);
      addDolphinShape(dolphinBodyShape, dolphinBodyMaterial, 90);
      addDolphinShape(createDolphinBellyShape(), dolphinBellyMaterial, 91);
      addDolphinShape(createDolphinPectoralFinShape(), dolphinFinMaterial, 92);

      const contourPoints = dolphinBodyShape.getSpacedPoints(balanced ? 44 : 72);
      const contourPositions = new Float32Array((contourPoints.length + 1) * 3);
      contourPoints.forEach((point, index) => {
        contourPositions[index * 3] = point.x;
        contourPositions[index * 3 + 1] = point.y;
      });
      contourPositions[contourPoints.length * 3] = contourPoints[0].x;
      contourPositions[contourPoints.length * 3 + 1] = contourPoints[0].y;
      const contourGeometry = register(new THREE.BufferGeometry());
      contourGeometry.setAttribute("position", new THREE.BufferAttribute(contourPositions, 3));
      const dolphinContour = new THREE.Line(contourGeometry, dolphinOutlineMaterial);
      dolphinContour.position.z = -0.105;
      addDolphinPart(contourGeometry, dolphinContour, 93);

      const mouthPositions = new Float32Array([
        0.38, -0.065, 0,
        0.3, -0.085, 0,
        0.22, -0.1, 0,
        0.14, -0.11, 0,
        0.06, -0.115, 0,
      ]);
      const mouthGeometry = register(new THREE.BufferGeometry());
      mouthGeometry.setAttribute("position", new THREE.BufferAttribute(mouthPositions, 3));
      const dolphinMouth = new THREE.Line(mouthGeometry, dolphinMouthMaterial);
      dolphinMouth.position.z = -0.1;
      addDolphinPart(mouthGeometry, dolphinMouth, 94);

      const eyeGeometry = register(new THREE.CircleGeometry(0.052, balanced ? 12 : 18));
      eyeGeometry.translate(-0.13, 0.22, 0);
      const dolphinEye = new THREE.Mesh(eyeGeometry, dolphinEyeMaterial);
      dolphinEye.position.z = -0.095;
      addDolphinPart(eyeGeometry, dolphinEye, 95);

      const routeSeed = new Uint32Array(1);
      globalThis.crypto.getRandomValues(routeSeed);
      const routeRandom = seededRandom(routeSeed[0] || 20260822);
      let dolphinScale = mobile ? 0.5 : 0.74;
      let dolphinStream: DolphinPathStream | undefined;
      let dolphinRouteDistance = 0;
      let dolphinSwimClock = 0;
      let simulationClock = 0;
      let dolphinSpine: DolphinSpinePoint[] = createDolphinSpine({ x: 0, y: 0 }, 0, dolphinScale);
      let previousDolphinSpine = dolphinSpine.map((point) => ({ ...point }));
      let renderDolphinSpine = dolphinSpine.map((point) => ({ ...point }));
      const dolphinHead = new THREE.Vector2();
      const dolphinForward = new THREE.Vector2(1, 0);
      const dolphinRepulsion: RepulsionState = { x: 0, y: 0, vx: 0, vy: 0 };
      let dolphinTextVisibility = 1;

      const updateDolphinGeometry = (spine: readonly DolphinSpinePoint[]) => {
        const headFrame = sampleSpineFrame(spine, 0);
        const tailFrame = sampleSpineFrame(spine, 1);
        dolphinParts.forEach((part) => {
          for (let index = 0; index < part.basePositions.length; index += 3) {
            const baseX = part.basePositions[index];
            const baseY = part.basePositions[index + 1] * dolphinScale;
            const longitudinal = -baseX;
            let frameSample;
            let along = 0;
            if (longitudinal < 0) {
              frameSample = headFrame;
              along = -longitudinal * dolphinScale;
            } else if (longitudinal > DOLPHIN_BODY_LENGTH) {
              frameSample = tailFrame;
              along = -(longitudinal - DOLPHIN_BODY_LENGTH) * dolphinScale;
            } else {
              frameSample = sampleSpineFrame(spine, longitudinal / DOLPHIN_BODY_LENGTH);
            }
            part.attribute.setXYZ(
              index / 3,
              frameSample.position.x + frameSample.tangent.x * along + frameSample.normal.x * baseY,
              frameSample.position.y + frameSample.tangent.y * along + frameSample.normal.y * baseY,
              part.basePositions[index + 2],
            );
          }
          part.attribute.needsUpdate = true;
        });
      };

      const resetDolphinPath = () => {
        dolphinRouteDistance = 0;
        dolphinSwimClock = 0;
        dolphinRepulsion.x = 0;
        dolphinRepulsion.y = 0;
        dolphinRepulsion.vx = 0;
        dolphinRepulsion.vy = 0;
        dolphinScale = mobile
          ? Math.min(0.52, Math.max(0.45, viewHalfWidth / 4.6))
          : 0.74;
        dolphinStream = createDolphinPathStream(
          "wander",
          {
            x: mobile ? Math.max(2.35, viewHalfWidth * 1.18) : viewHalfWidth * 1.04,
            y: viewHalfHeight * (mobile ? 1.02 : 1.06),
          },
          routeRandom,
          mobile ? 8 : 10,
        );
        const routeSample = sampleDolphinBezierPath(dolphinStream.path, 0);
        dolphinHead.set(routeSample.position.x, routeSample.position.y + currentProfile.dolphinBiasY);
        dolphinSpine = createDolphinSpine(dolphinHead, routeSample.heading, dolphinScale);
        previousDolphinSpine = dolphinSpine.map((point) => ({ ...point }));
        renderDolphinSpine = dolphinSpine.map((point) => ({ ...point }));
        dolphinForward.set(Math.cos(routeSample.heading), Math.sin(routeSample.heading));
        updateDolphinGeometry(dolphinSpine);
      };

      const applyTheme = () => {
        const styles = getComputedStyle(document.documentElement);
        lightTheme = document.documentElement.dataset.theme !== "dark";
        palette.accent.set(styles.getPropertyValue("--accent").trim() || "#53a3f2");
        palette.accentStrong.set(styles.getPropertyValue("--accent-strong").trim() || "#257bc6");
        palette.line.set(styles.getPropertyValue("--line-strong").trim() || "#6f8ca3");
        palette.surface.set(styles.getPropertyValue("--surface-strong").trim() || "#d7e6f2");
        palette.ink.set(styles.getPropertyValue("--ink").trim() || "#101820");
        dolphinBodyMaterial.color.copy(lightTheme ? palette.accentStrong : palette.accent);
        dolphinBellyMaterial.color.copy(palette.surface).lerp(palette.accent, lightTheme ? 0.12 : 0.3);
        dolphinFinMaterial.color.copy(palette.accentStrong);
        dolphinEyeMaterial.color.set(lightTheme ? 0x071722 : 0x050f16);
        dolphinGlowMaterial.color.copy(lightTheme ? palette.accentStrong : palette.accent);
        host.dataset.dolphinEye = lightTheme ? "deep-ink-light" : "deep-ink-dark";
        host.dataset.glowTheme = lightTheme ? "highlight" : "bioluminescent";
        dolphinOutlineMaterial.color.copy(lightTheme ? palette.accentStrong : palette.surface);
        dolphinMouthMaterial.color.copy(palette.ink);
        dolphinBodyMaterial.opacity = lightTheme ? 0.74 : 0.68;
        dolphinBellyMaterial.opacity = lightTheme ? 0.62 : 0.58;
        dolphinFinMaterial.opacity = lightTheme ? 0.72 : 0.66;
        dolphinGlowMaterial.opacity = lightTheme ? 0.012 : 0.075;
        dolphinOutlineMaterial.opacity = lightTheme ? 0.78 : 0.72;
        dolphinMouthMaterial.opacity = lightTheme ? 0.68 : 0.62;
        jellies.forEach((jelly) => {
          const hue = jelly.colorShift * 0.016;
          const lightness = jelly.colorShift * 0.022;
          jelly.fill.color.copy(lightTheme ? palette.surface : palette.accent)
            .offsetHSL(hue, -0.012, lightness);
          jelly.edge.color.copy(lightTheme ? palette.accentStrong : palette.surface)
            .offsetHSL(hue, -0.01, lightness * 0.72);
          jelly.glow.color.copy(lightTheme ? palette.accentStrong : palette.accent)
            .offsetHSL(hue, -0.008, Math.max(0, lightness));
          jelly.outerGlow.color.copy(jelly.glow.color);
          jelly.tentacles.forEach((tentacle) => {
            tentacle.material.color.copy(palette.accent).offsetHSL(hue, -0.012, lightness * 0.54);
          });
        });
        flowRibbons.forEach((ribbon) => ribbon.material.color.copy(lightTheme ? palette.line : palette.accent));
        entities.forEach((entity) => {
          const hue = entity.colorShift * 0.014;
          const lightness = entity.colorShift * 0.02;
          entity.fill.color.copy(palette.surface).offsetHSL(hue, -0.016, lightness);
          entity.edge.color.copy(lightTheme ? palette.line : palette.accent)
            .offsetHSL(hue, -0.012, lightness * 0.7);
          entity.detail.color.copy(lightTheme ? palette.accentStrong : palette.surface)
            .offsetHSL(hue, -0.01, lightness * 0.65);
          entity.glow?.color.copy(lightTheme ? palette.accentStrong : palette.accent)
            .offsetHSL(hue, -0.01, Math.max(0, lightness));
        });
      };

      const updateSafeZones = () => {
        const selectors = [
          "[data-reveal-state='visible'] h1",
          "[data-reveal-state='visible'] h2",
          "[data-reveal-state='visible'] .hero-intro",
          "[data-reveal-state='visible'] .hero-actions",
          "[data-reveal-state='visible'] .project-card",
          "[data-reveal-state='visible'] .project-sideboard",
        ].join(",");
        safeZones = Array.from(document.querySelectorAll<HTMLElement>(selectors))
          .map((element) => element.getBoundingClientRect())
          .filter((rect) => rect.width > 24 && rect.height > 18 && rect.bottom > 0 && rect.top < height)
          .slice(0, 10)
          .map((rect) => ({
            left: rect.left / width,
            right: rect.right / width,
            top: rect.top / height,
            bottom: rect.bottom / height,
          }));
      };

      const resize = () => {
        const rect = host.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) return;
        width = rect.width;
        height = rect.height;
        const nextHalfWidth = viewHalfHeight * (width / height);
        const resetPath = !dolphinStream || Math.abs(nextHalfWidth - viewHalfWidth) > 0.28;
        viewHalfWidth = nextHalfWidth;
        camera.left = -viewHalfWidth;
        camera.right = viewHalfWidth;
        camera.top = viewHalfHeight;
        camera.bottom = -viewHalfHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height, false);
        updateSafeZones();
        if (resetPath) resetDolphinPath();
      };

      const updatePointerWorld = () => {
        pointerWorld.set(
          (pointer.x / Math.max(width, 1) * 2 - 1) * viewHalfWidth,
          (1 - pointer.y / Math.max(height, 1) * 2) * viewHalfHeight,
        );
      };

      const addSafeZoneForce = (x: number, y: number, target: THREE.Vector2, strength: number) => {
        const screenX = x / (viewHalfWidth * 2) + 0.5;
        const screenY = 0.5 - y / (viewHalfHeight * 2);
        let overlapCount = 0;
        safeZones.forEach((zone) => {
          const margin = 0.035;
          if (screenX < zone.left - margin || screenX > zone.right + margin || screenY < zone.top - margin || screenY > zone.bottom + margin) return;
          overlapCount += 1;
          const centerX = (zone.left + zone.right) * 0.5;
          const centerY = (zone.top + zone.bottom) * 0.5;
          obstacleForce.set(screenX - centerX, -(screenY - centerY));
          if (obstacleForce.lengthSq() < 0.0001) obstacleForce.set(screenX < 0.5 ? -1 : 1, 0.2);
          obstacleForce.normalize().multiplyScalar(strength);
          target.add(obstacleForce);
        });
        return overlapCount;
      };

      const updateFlowRibbons = (time: number) => {
        const seconds = time * 0.001;
        flowRibbons.forEach((ribbon, ribbonIndex) => {
          ribbon.controlPoints.forEach((point, index) => {
            const progress = index / Math.max(1, ribbon.controlPoints.length - 1);
            point.set(
              lerp(-viewHalfWidth - 1, viewHalfWidth + 1, progress),
              ribbon.baseY + Math.sin(progress * Math.PI * 2.2 + seconds * 0.12 + ribbon.phase) * (0.42 + ribbonIndex * 0.05),
              ribbon.depth,
            );
          });
          for (let index = 0; index < ribbon.samples; index += 1) {
            ribbon.curve.getPoint(index / Math.max(1, ribbon.samples - 1), curveSample);
            const offset = index * 3;
            ribbon.positions[offset] = curveSample.x;
            ribbon.positions[offset + 1] = curveSample.y;
            ribbon.positions[offset + 2] = curveSample.z;
          }
          ribbon.attribute.needsUpdate = true;
          ribbon.material.opacity = (lightTheme ? 0.14 : 0.13) * currentProfile.flow;
        });
      };

      const simulateEntities = (seconds: number, delta: number) => {
        entities.forEach((entity) => {
          entity.age += delta;
          entity.hit *= Math.exp(-4.2 * delta);
          const coral = entity.relic === "coral";
          const interactionScale = coral ? 0.58 : 1;

          if (pointer.active) {
            pointerRepulsion(entity, pointerWorld, 1.5 + entity.radius, 1.1 + pointer.speed * 2.4, repelForce);
            entity.vx += repelForce.x * delta * interactionScale;
            entity.vy += repelForce.y * delta * interactionScale;
            if (Math.abs(repelForce.x) + Math.abs(repelForce.y) > 0.16) entity.hit = Math.max(entity.hit, 0.34);
          }

          if (pulse > 0.01) {
            const dx = entity.x - pulseOrigin.x;
            const dy = entity.y - pulseOrigin.y;
            const distance = Math.max(0.2, Math.hypot(dx, dy));
            const strength = Math.max(0, 1 - distance / 4.2) * pulse * delta * 0.42;
            entity.vx += dx / distance * strength * interactionScale;
            entity.vy += dy / distance * strength * interactionScale;
          }

          sampleOceanFlow(entity, seconds + entity.phase * 0.34, flowForce);
          const flowScale = coral ? 0.62 : 1;
          const independentX = Math.cos(seconds * 0.19 + entity.phase) * 0.012;
          const independentY = Math.sin(seconds * 0.16 + entity.phase * 1.17) * 0.01;
          entity.vx += (flowForce.x * 0.072 * currentProfile.flow + independentX) * delta * flowScale;
          entity.vy += (flowForce.y * 0.072 * currentProfile.flow + independentY) * delta * flowScale;
          zoneForce.set(0, 0);
          addSafeZoneForce(entity.x, entity.y, zoneForce, 0.34);
          entity.vx += zoneForce.x * delta * interactionScale;
          entity.vy += zoneForce.y * delta * interactionScale;

          if (coral) {
            const targetRotation = entity.restRotation + Math.sin(seconds * 0.32 + entity.phase) * 0.055;
            const rotationError = Math.atan2(
              Math.sin(targetRotation - entity.rotation),
              Math.cos(targetRotation - entity.rotation),
            );
            entity.angularVelocity += rotationError * delta * 3.8;
          } else {
            entity.angularVelocity += Math.sin(seconds * 0.14 + entity.phase) * delta * 0.006;
          }

          entity.vx *= Math.exp(-(coral ? 1.16 : 0.82) * delta);
          entity.vy *= Math.exp(-(coral ? 1.16 : 0.82) * delta);
          entity.angularVelocity *= Math.exp(-(coral ? 5.2 : 1.35) * delta);
          limitSolidSpeed(entity, coral ? AMBIENT_ENTITY_MAX_SPEED * 0.68 : AMBIENT_ENTITY_MAX_SPEED);
          entity.x += entity.vx * delta * currentProfile.entity;
          entity.y += entity.vy * delta * currentProfile.entity;
          entity.rotation += entity.angularVelocity * delta;

          const wrapped = wrapDriftingBody(
            entity,
            viewHalfWidth,
            viewHalfHeight,
            entity.radius * 1.8 + 0.24,
          );
          if (wrapped) {
            entity.previousX = entity.x;
            entity.previousY = entity.y;
          }
        });

        for (let firstIndex = 0; firstIndex < entities.length; firstIndex += 1) {
          for (let secondIndex = firstIndex + 1; secondIndex < entities.length; secondIndex += 1) {
            const first = entities[firstIndex];
            const second = entities[secondIndex];
            const firstAngularVelocity = first.angularVelocity;
            const secondAngularVelocity = second.angularVelocity;
            const result = resolveCircleCollision(first, second, AMBIENT_ENTITY_RESTITUTION, collisionResult);
            if (!result.collided) continue;
            if (first.relic === "coral") {
              first.angularVelocity = firstAngularVelocity + (first.angularVelocity - firstAngularVelocity) * 0.08;
            }
            if (second.relic === "coral") {
              second.angularVelocity = secondAngularVelocity + (second.angularVelocity - secondAngularVelocity) * 0.08;
            }
            const response = Math.min(0.62, 0.12 + result.impact * 0.34);
            first.hit = Math.max(first.hit, response);
            second.hit = Math.max(second.hit, response);
            first.angularVelocity -= result.ny * result.impact * 0.05 * (first.relic === "coral" ? 0.08 : 1);
            second.angularVelocity += result.nx * result.impact * 0.05 * (second.relic === "coral" ? 0.08 : 1);
          }
        }
        entities.forEach((entity) => {
          limitSolidSpeed(entity, entity.relic === "coral" ? AMBIENT_ENTITY_MAX_SPEED * 0.68 : AMBIENT_ENTITY_MAX_SPEED);
          const wrapped = wrapDriftingBody(
            entity,
            viewHalfWidth,
            viewHalfHeight,
            entity.radius * 1.8 + 0.24,
          );
          if (wrapped) {
            entity.previousX = entity.x;
            entity.previousY = entity.y;
          }
        });
      };

      const renderEntities = (seconds: number, alpha: number) => {
        entities.forEach((entity) => {
          const breathe = 1 + Math.sin(seconds * 0.42 + entity.phase) * 0.022 + entity.hit * 0.06;
          const coralSway = entity.relic === "coral" ? Math.sin(seconds * 0.52 + entity.phase) * 0.012 : 0;
          const birthVisibility = Math.min(1, entity.age / 0.9);
          entity.group.position.set(
            lerp(entity.previousX, entity.x, alpha),
            lerp(entity.previousY, entity.y, alpha),
            entity.depth,
          );
          entity.group.rotation.z = lerpAngle(entity.previousRotation, entity.rotation, alpha) + coralSway;
          entity.group.scale.setScalar(breathe);
          const hue = entity.colorShift * 0.014;
          const lightness = entity.colorShift * 0.02;
          const coralTint = entity.relic === "coral" ? 0.1 + (entity.colorShift + 1) * 0.035 : 0;
          entity.fill.color.copy(palette.surface)
            .lerp(palette.accentStrong, coralTint)
            .offsetHSL(hue, -0.016, lightness)
            .lerp(palette.accent, entity.hit * 0.32);
          entity.edge.color.copy(lightTheme ? palette.line : palette.accent)
            .offsetHSL(hue, -0.012, lightness * 0.7)
            .lerp(palette.accentStrong, entity.hit * 0.56);
          entity.detail.color.copy(lightTheme ? palette.accentStrong : palette.surface)
            .offsetHSL(hue, -0.01, lightness * 0.65)
            .lerp(palette.accent, entity.hit * 0.34);
          const bloom = entity.relic === "sea-bloom";
          entity.fill.opacity = ((bloom ? (lightTheme ? 0.045 : 0.025) : (lightTheme ? 0.24 : 0.12)) + entity.hit * 0.045)
            * birthVisibility;
          entity.edge.opacity = (bloom ? (lightTheme ? 0.32 : 0.2) : (lightTheme ? 0.78 : 0.46))
            * (currentProfile.entity + entity.hit * 0.1) * birthVisibility;
          entity.detail.opacity = (bloom ? (lightTheme ? 0.72 : 0.46) : (lightTheme ? 0.6 : 0.34))
            * (currentProfile.entity + entity.hit * 0.08) * birthVisibility;
          if (entity.glow) {
            const shimmer = 0.5 + Math.sin(seconds * 0.74 + entity.phase) * 0.5;
            const glowBase = bloom ? 0.12 : 0.072;
            entity.glow.color.copy(lightTheme ? palette.accentStrong : palette.accent)
              .offsetHSL(hue, -0.01, Math.max(0, lightness))
              .multiplyScalar(lightTheme ? 1 : 0.92 + shimmer * 0.48);
            entity.glow.opacity = (lightTheme ? 0.018 : glowBase)
              * (0.58 + shimmer * 0.42)
              * (currentProfile.entity + entity.hit * 0.12)
              * birthVisibility;
          }
        });
      };

      const simulateJellies = (seconds: number, delta: number) => {
        jellies.forEach((jelly) => {
          const pulsePhase = seconds / jelly.cycleDuration + jelly.phase / (Math.PI * 2);
          const speedRatio = Math.hypot(jelly.vx, jelly.vy) / AMBIENT_JELLY_MAX_SPEED;
          const pose = sampleJellyPose(pulsePhase, speedRatio);
          sampleOceanFlow(jelly, seconds + jelly.phase, flowForce);
          const wander = Math.sin(seconds * jelly.swimRate + jelly.phase) * 0.13
            + Math.sin(seconds * jelly.swimRate * 0.47 + jelly.phase * 1.7) * 0.05;
          const desiredHeading = Math.atan2(
            0.07 + flowForce.y * 0.42 + jelly.vy * 0.32,
            flowForce.x * 0.66 + jelly.vx * 0.32,
          ) + wander;
          const headingDelta = Math.atan2(
            Math.sin(desiredHeading - jelly.heading),
            Math.cos(desiredHeading - jelly.heading),
          );
          jelly.heading += headingDelta * Math.min(1, delta * (0.34 + currentProfile.flow * 0.08));
          jelly.vx += flowForce.x * delta * 0.07 * currentProfile.flow;
          jelly.vy += (flowForce.y * 0.052 * currentProfile.flow + 0.012) * delta;
          const thrust = pose.thrust * jelly.pulseStrength * 1.9
            * (0.76 + jelly.depth * 0.24) * currentProfile.jelly;
          jelly.vx += Math.cos(jelly.heading) * thrust * delta;
          jelly.vy += Math.sin(jelly.heading) * thrust * delta;

          if (pointer.active) {
            pointerRepulsion(
              jelly,
              pointerWorld,
              balanced ? 0.95 : 1.08,
              0.12 + Math.min(pointer.speed, 1.1) * 0.38,
              repelForce,
            );
            jelly.vx += repelForce.x * delta;
            jelly.vy += repelForce.y * delta;
          }
          zoneForce.set(0, 0);
          addSafeZoneForce(jelly.x, jelly.y, zoneForce, 0.9);
          jelly.vx += zoneForce.x * delta;
          jelly.vy += zoneForce.y * delta;
          jelly.vx *= Math.exp(-1.08 * delta);
          jelly.vy *= Math.exp(-1.08 * delta);
          limitMotionSpeed(jelly, AMBIENT_JELLY_MAX_SPEED);
          jelly.x += jelly.vx * delta;
          jelly.y += jelly.vy * delta;

          const margin = 0.9;
          let wrapped = false;
          if (jelly.x < -viewHalfWidth - margin) {
            jelly.x = viewHalfWidth + margin;
            wrapped = true;
          }
          if (jelly.x > viewHalfWidth + margin) {
            jelly.x = -viewHalfWidth - margin;
            wrapped = true;
          }
          if (jelly.y < -viewHalfHeight - margin) {
            jelly.y = viewHalfHeight + margin;
            wrapped = true;
          }
          if (jelly.y > viewHalfHeight + margin) {
            jelly.y = -viewHalfHeight - margin;
            wrapped = true;
          }
          if (wrapped) {
            jelly.previousX = jelly.x;
            jelly.previousY = jelly.y;
            resetJellyTentacles(jelly);
          }

          jelly.tentacles.forEach((tentacle) => {
            advanceRibbonChain(
              tentacle.points,
              {
                x: tentacle.offset * pose.tentacleRootScaleX,
                y: pose.tentacleRootY,
              },
              delta,
              0.158 * (1 - pose.contraction * 0.04),
              16,
              6.4,
            );
          });
        });
      };

      const renderJellies = (seconds: number, alpha: number) => {
        jellies.forEach((jelly) => {
          const pulsePhase = seconds / jelly.cycleDuration + jelly.phase / (Math.PI * 2);
          const speedRatio = Math.hypot(jelly.vx, jelly.vy) / AMBIENT_JELLY_MAX_SPEED;
          const pose = sampleJellyPose(pulsePhase, speedRatio);
          const luminescence = sampleJellyLuminescence(pulsePhase);
          const ambientBreath = Math.sin(seconds * 0.54 + jelly.phase) * 0.008;
          const depthProfile = sampleAmbientDepth(jelly.depth);
          const perspectiveScale = 0.82 + depthProfile.scale * 0.18;
          const renderHeading = lerpAngle(jelly.previousHeading, jelly.heading, alpha);
          jelly.group.position.set(
            lerp(jelly.previousX, jelly.x, alpha),
            lerp(jelly.previousY, jelly.y, alpha),
            -3.2 + jelly.depth * 2.4,
          );
          jelly.group.rotation.z = renderHeading - Math.PI / 2
            + Math.sin(seconds * 0.38 + jelly.phase) * 0.012;
          jelly.group.scale.set(
            jelly.scale * perspectiveScale * (pose.bellScaleX + ambientBreath),
            jelly.scale * perspectiveScale * (pose.bellScaleY - ambientBreath * 0.35),
            1,
          );
          const visibility = (0.72 + jelly.depth * 0.28) * currentProfile.jelly;
          const hue = jelly.colorShift * 0.016;
          const lightness = jelly.colorShift * 0.022;
          const glowColorScale = lightTheme ? 1 : 0.78 + luminescence * 0.82;
          jelly.fill.color.copy(lightTheme ? palette.surface : palette.accent)
            .offsetHSL(hue, -0.012, lightness)
            .lerp(lightTheme ? palette.accent : palette.surface, luminescence * (lightTheme ? 0.035 : 0.16));
          jelly.edge.color.copy(lightTheme ? palette.accentStrong : palette.surface)
            .offsetHSL(hue, -0.01, lightness * 0.72)
            .lerp(palette.surface, luminescence * (lightTheme ? 0.04 : 0.2));
          jelly.glow.color.copy(lightTheme ? palette.accentStrong : palette.accent)
            .offsetHSL(hue, -0.008, Math.max(0, lightness))
            .multiplyScalar(glowColorScale);
          jelly.outerGlow.color.copy(jelly.glow.color).multiplyScalar(lightTheme ? 0.92 : 1.12);
          jelly.fill.opacity = (lightTheme ? 0.27 + luminescence * 0.035 : 0.17 + luminescence * 0.12) * visibility;
          jelly.edge.opacity = (lightTheme ? 0.56 + luminescence * 0.1 : 0.34 + luminescence * 0.32) * visibility;
          jelly.glow.opacity = (lightTheme ? 0.005 + luminescence * 0.055 : 0.01 + luminescence * 0.34) * visibility;
          jelly.outerGlow.opacity = (lightTheme ? 0.001 + luminescence * 0.018 : 0.002 + luminescence * 0.16) * visibility;
          jelly.halo.scale.set(
            1.15 + luminescence * 0.08,
            1.1 + luminescence * 0.06,
            1,
          );
          jelly.outerHalo.scale.set(
            1.36 + luminescence * 0.16,
            1.29 + luminescence * 0.13,
            1,
          );

          jelly.tentacles.forEach((tentacle, tentacleIndex) => {
            tentacle.points.forEach((point, pointIndex) => {
              const offset = pointIndex * 3;
              const trail = pointIndex / Math.max(1, tentacle.points.length - 1);
              const trailWave = seconds * (0.62 + Math.min(1, speedRatio) * 0.42)
                + jelly.phase + tentacleIndex * 0.5 - pointIndex * 0.52;
              tentacle.positions[offset] = point.x
                + Math.sin(trailWave) * trail * pose.tentacleWave;
              tentacle.positions[offset + 1] = point.y
                + Math.cos(trailWave * 0.74) * trail * pose.tentacleWave * 0.28;
              tentacle.positions[offset + 2] = -0.02;
            });
            tentacle.attribute.needsUpdate = true;
            tentacle.material.opacity = (lightTheme ? 0.3 + luminescence * 0.06 : 0.24 + luminescence * 0.3) * visibility;
          });
        });
      };

      const simulateDolphin = (delta: number) => {
        if (!dolphinStream) return;
        dolphinSwimClock += delta;
        const speed = 0.78 + currentProfile.dolphinSpeed * 0.36;
        dolphinRouteDistance = advanceDolphinPathStream(
          dolphinStream,
          dolphinRouteDistance,
          speed * delta,
        ).distance;
        const routeSample = sampleDolphinBezierPath(dolphinStream.path, dolphinRouteDistance);
        repelForce.x = 0;
        repelForce.y = 0;
        if (pointer.active) {
          pointerRepulsion(
            dolphinHead,
            pointerWorld,
            balanced ? 2.25 : 2.8,
            5.2 + pointer.speed * 9,
            repelForce,
          );
        }
        zoneForce.set(0, 0);
        let safeOverlap = 0;
        dolphinSpine.forEach((point, index) => {
          if (index % 2 !== 0 && index !== dolphinSpine.length - 1) return;
          safeOverlap += addSafeZoneForce(point.x, point.y, zoneForce, 0.58);
        });
        zoneForce.clampLength(0, 3.1);
        dolphinTextVisibility = lerp(
          dolphinTextVisibility,
          safeOverlap > 0 ? 0.52 : 1,
          Math.min(1, delta * 4.8),
        );
        repelForce.x += zoneForce.x;
        repelForce.y += zoneForce.y;
        advanceRepulsionOffset(dolphinRepulsion, repelForce, delta, 1.9, 3.1);
        dolphinHead.set(
          routeSample.position.x + dolphinRepulsion.x,
          routeSample.position.y + dolphinRepulsion.y + currentProfile.dolphinBiasY,
        );
        advanceDolphinSpine(dolphinSpine, dolphinHead, dolphinSwimClock, delta, dolphinScale);
        const headFrame = sampleSpineFrame(dolphinSpine, 0);
        dolphinForward.set(headFrame.tangent.x, headFrame.tangent.y);
      };

      const interactDolphinWithEntities = () => {
        const dolphinVelocity = {
          x: dolphinForward.x * (0.78 + currentProfile.dolphinSpeed * 0.36),
          y: dolphinForward.y * (0.78 + currentProfile.dolphinSpeed * 0.36),
        };
        entities.forEach((entity) => {
          let nearestPoint = dolphinSpine[0];
          let nearestDistance = Number.POSITIVE_INFINITY;
          dolphinSpine.forEach((point) => {
            const distance = Math.hypot(entity.x - point.x, entity.y - point.y);
            if (distance < nearestDistance) {
              nearestDistance = distance;
              nearestPoint = point;
            }
          });
          const contactDistance = entity.radius + dolphinScale * 0.42;
          const speedLimit = entity.relic === "coral"
            ? AMBIENT_ENTITY_MAX_SPEED * 0.68
            : AMBIENT_ENTITY_MAX_SPEED;
          if (!gentlyDisplaceBody(entity, nearestPoint, contactDistance, dolphinVelocity, speedLimit)) return;
          const offsetX = entity.x - nearestPoint.x;
          const offsetY = entity.y - nearestPoint.y;
          const distance = Math.max(0.001, Math.hypot(offsetX, offsetY));
          const nx = offsetX / distance;
          const ny = offsetY / distance;
          entity.angularVelocity += (nx - ny) * 0.018 * (entity.relic === "coral" ? 0.08 : 1);
          entity.hit = Math.max(entity.hit, 0.58);
          const wrapped = wrapDriftingBody(
            entity,
            viewHalfWidth,
            viewHalfHeight,
            entity.radius * 1.8 + 0.24,
          );
          if (wrapped) {
            entity.previousX = entity.x;
            entity.previousY = entity.y;
          }
        });
      };

      const renderDolphin = (alpha: number) => {
        if (renderDolphinSpine.length !== dolphinSpine.length) {
          renderDolphinSpine = dolphinSpine.map((point) => ({ ...point }));
        }
        dolphinSpine.forEach((point, index) => {
          const previous = previousDolphinSpine[index] || point;
          renderDolphinSpine[index].x = lerp(previous.x, point.x, alpha);
          renderDolphinSpine[index].y = lerp(previous.y, point.y, alpha);
        });
        updateDolphinGeometry(renderDolphinSpine);
        const visibility = (0.72 + currentProfile.energy * 0.28) * dolphinTextVisibility;
        dolphinBodyMaterial.opacity = (lightTheme ? 0.74 : 0.68) * visibility;
        dolphinBellyMaterial.opacity = (lightTheme ? 0.62 : 0.58) * visibility;
        dolphinFinMaterial.opacity = (lightTheme ? 0.72 : 0.66) * visibility;
        dolphinGlowMaterial.opacity = (lightTheme ? 0.014 : 0.078) * visibility;
        dolphinEyeMaterial.opacity = 0.9 * visibility;
        dolphinOutlineMaterial.opacity = (lightTheme ? 0.78 : 0.72) * visibility;
        dolphinMouthMaterial.opacity = (lightTheme ? 0.68 : 0.62) * visibility;
      };

      const simulateParticles = (seconds: number, delta: number) => {
        particles.forEach((particle) => {
          particle.vx *= Math.exp(-2.4 * delta);
          particle.vy *= Math.exp(-2.4 * delta);
          if (pointer.active) {
            pointerRepulsion(
              particle,
              pointerWorld,
              (balanced ? 1.45 : 1.85) * (0.78 + particle.depth * 0.3),
              (3.2 + pointer.speed * 8) * particle.interaction,
              repelForce,
            );
            particle.vx += repelForce.x * delta;
            particle.vy += repelForce.y * delta;
          }
          if (pulse > 0.01) {
            const dx = particle.x - pulseOrigin.x;
            const dy = particle.y - pulseOrigin.y;
            const distance = Math.max(0.2, Math.hypot(dx, dy));
            const strength = Math.max(0, 1 - distance / 5)
              * pulse * delta * 1.5 * particle.interaction;
            particle.vx += dx / distance * strength;
            particle.vy += dy / distance * strength;
          }
          const dolphinDistance = Math.max(
            0.25,
            Math.hypot(particle.x - dolphinHead.x, particle.y - dolphinHead.y),
          );
          if (dolphinDistance < 1.5) {
            const wake = (1 - dolphinDistance / 1.5) * delta * 0.26 * particle.interaction;
            particle.vx -= dolphinForward.x * wake;
            particle.vy -= dolphinForward.y * wake;
          }
          sampleOceanFlow(particle, seconds + particle.phase, flowForce);
          particle.x += (flowForce.x * 0.035 * particle.drift + particle.vx) * delta;
          particle.y += (
            particle.speed * currentProfile.particle * particle.drift
            + flowForce.y * 0.025 * particle.drift
            + particle.vy
          ) * delta;
          if (particle.y > viewHalfHeight + 0.3) {
            particle.y = -viewHalfHeight - 0.3;
            particle.x = random() * viewHalfWidth * 2 - viewHalfWidth;
            particle.previousX = particle.x;
            particle.previousY = particle.y;
          }
          if (particle.x < -viewHalfWidth - 0.4) {
            particle.x = viewHalfWidth + 0.4;
            particle.previousX = particle.x;
          }
          if (particle.x > viewHalfWidth + 0.4) {
            particle.x = -viewHalfWidth - 0.4;
            particle.previousX = particle.x;
          }
        });
      };

      const renderParticles = (seconds: number, alpha: number) => {
        particleLayers.forEach((layer) => {
          layer.particles.forEach((particle, index) => {
            const twinkle = 0.68 + Math.sin(seconds * (0.72 + particle.speed) + particle.phase) * 0.28;
            const scale = particle.size * particle.depthScale * twinkle
              * (0.74 + currentProfile.particle * 0.26);
            const renderX = lerp(particle.previousX, particle.x, alpha)
              + Math.sin(seconds * 0.32 + particle.phase) * 0.05 * particle.drift;
            const renderY = lerp(particle.previousY, particle.y, alpha)
              + Math.cos(seconds * 0.27 + particle.phase) * 0.04 * particle.drift;
            sharedMatrix.makeScale(scale, scale, scale);
            sharedMatrix.setPosition(renderX, renderY, particle.z);
            layer.mesh.setMatrixAt(index, sharedMatrix);
            sharedColor.copy(lightTheme ? palette.surface : palette.ink).lerp(
              palette.accent,
              Math.min(1, 0.32 + particle.depthOpacity * 0.92),
            );
            sharedColor.lerp(palette.accentStrong, Math.max(0, twinkle - 0.5) * 0.42);
            layer.mesh.setColorAt(index, sharedColor);
            if (layer.glowMesh) {
              const glowScale = scale * (1.82 + twinkle * 0.34);
              sharedMatrix.makeScale(glowScale, glowScale, glowScale * 0.72);
              sharedMatrix.setPosition(renderX, renderY, particle.z - 0.012);
              layer.glowMesh.setMatrixAt(index, sharedMatrix);
              sharedColor.lerp(palette.surface, lightTheme ? 0.1 : 0.24);
              layer.glowMesh.setColorAt(index, sharedColor);
            }
          });
          layer.mesh.instanceMatrix.needsUpdate = true;
          if (layer.mesh.instanceColor) layer.mesh.instanceColor.needsUpdate = true;
          const representativeDepth = (layer.depthRange[0] + layer.depthRange[1]) * 0.5;
          const representativeProfile = sampleAmbientDepth(representativeDepth);
          layer.material.opacity = representativeProfile.opacity
            * (balanced ? 0.55 : 0.62) * (0.7 + currentProfile.particle * 0.3);
          if (layer.glowMesh && layer.glowMaterial) {
            layer.glowMesh.instanceMatrix.needsUpdate = true;
            if (layer.glowMesh.instanceColor) layer.glowMesh.instanceColor.needsUpdate = true;
            layer.glowMaterial.opacity = (lightTheme ? 0.028 : 0.115)
              * representativeProfile.opacity
              * (0.72 + currentProfile.particle * 0.28);
          }
        });
      };

      const snapshotSimulationState = () => {
        entities.forEach((entity) => {
          entity.previousX = entity.x;
          entity.previousY = entity.y;
          entity.previousRotation = entity.rotation;
        });
        jellies.forEach((jelly) => {
          jelly.previousX = jelly.x;
          jelly.previousY = jelly.y;
          jelly.previousHeading = jelly.heading;
        });
        particles.forEach((particle) => {
          particle.previousX = particle.x;
          particle.previousY = particle.y;
        });
        if (previousDolphinSpine.length !== dolphinSpine.length) {
          previousDolphinSpine = dolphinSpine.map((point) => ({ ...point }));
        } else {
          dolphinSpine.forEach((point, index) => {
            previousDolphinSpine[index].x = point.x;
            previousDolphinSpine[index].y = point.y;
          });
        }
      };

      const simulateFixedStep = (delta: number) => {
        snapshotSimulationState();
        const profileEase = Math.min(1, delta * 0.72);
        currentProfile.energy = lerp(currentProfile.energy, targetProfile.energy, profileEase);
        currentProfile.entity = lerp(currentProfile.entity, targetProfile.entity, profileEase);
        currentProfile.particle = lerp(currentProfile.particle, targetProfile.particle, profileEase);
        currentProfile.jelly = lerp(currentProfile.jelly, targetProfile.jelly, profileEase);
        currentProfile.dolphinSpeed = lerp(currentProfile.dolphinSpeed, targetProfile.dolphinSpeed, profileEase);
        currentProfile.dolphinBiasY = lerp(currentProfile.dolphinBiasY, targetProfile.dolphinBiasY, profileEase);
        currentProfile.flow = lerp(currentProfile.flow, targetProfile.flow, profileEase);
        pointer.speed *= Math.exp(-3.2 * delta);
        pulse *= Math.exp(-2.8 * delta);
        simulationClock += delta;
        simulationTick += 1;
        simulateDolphin(delta);
        simulateJellies(simulationClock, delta);
        simulateParticles(simulationClock, delta);
        simulateEntities(simulationClock, delta);
        interactDolphinWithEntities();
      };

      const render = (time: number) => {
        if (destroyed || !pageVisible) return;
        const frameDelta = Math.max(0, (time - lastTime) / 1000);
        lastTime = time;
        const schedule = scheduleFixedSimulation(simulationAccumulator, frameDelta);
        simulationAccumulator = schedule.accumulator;
        updatePointerWorld();
        for (let step = 0; step < schedule.count; step += 1) {
          simulateFixedStep(schedule.delta);
        }
        const renderSeconds = Math.max(
          0,
          simulationClock - AMBIENT_FIXED_STEP + schedule.alpha * AMBIENT_FIXED_STEP,
        );
        host.dataset.simulationTick = String(simulationTick);
        host.dataset.simulationStep = "60hz";
        host.dataset.entitySpeedMax = entities.reduce(
          (maximum, entity) => Math.max(maximum, Math.hypot(entity.vx, entity.vy)),
          0,
        ).toFixed(3);
        host.dataset.jellySpeedMax = jellies.reduce(
          (maximum, jelly) => Math.max(maximum, Math.hypot(jelly.vx, jelly.vy)),
          0,
        ).toFixed(3);
        host.dataset.coralAngleDeviation = entities.reduce((maximum, entity) => {
          if (entity.relic !== "coral") return maximum;
          const deviation = Math.abs(Math.atan2(
            Math.sin(entity.rotation - entity.restRotation),
            Math.cos(entity.rotation - entity.restRotation),
          ));
          return Math.max(maximum, deviation);
        }, 0).toFixed(3);
        if (schedule.droppedDelta > 0) {
          host.dataset.droppedTimeMs = schedule.droppedDelta.toFixed(3);
        }
        updateFlowRibbons(renderSeconds * 1000);
        renderEntities(renderSeconds, schedule.alpha);
        renderDolphin(schedule.alpha);
        renderJellies(renderSeconds, schedule.alpha);
        renderParticles(renderSeconds, schedule.alpha);
        renderer.render(scene, camera);
        if (!hasRendered) {
          signalAmbientReady();
          hasRendered = true;
        }
        frame = window.requestAnimationFrame(render);
      };

      const ensureRunning = () => {
        window.cancelAnimationFrame(frame);
        if (!pageVisible || destroyed) return;
        lastTime = performance.now();
        simulationAccumulator = 0;
        frame = window.requestAnimationFrame(render);
      };

      const handlePointerMove = (event: PointerEvent) => {
        const now = performance.now();
        if (!pointer.active) {
          pointer.previousX = event.clientX;
          pointer.previousY = event.clientY;
          pointer.speed = 0;
        } else {
          const elapsed = Math.max(8, now - pointer.updatedAt);
          const distance = Math.hypot(event.clientX - pointer.previousX, event.clientY - pointer.previousY);
          pointer.speed = Math.min(2.4, distance / elapsed);
        }
        pointer.active = event.pointerType !== "touch";
        pointer.x = event.clientX;
        pointer.y = event.clientY;
        pointer.previousX = event.clientX;
        pointer.previousY = event.clientY;
        pointer.updatedAt = now;
      };

      const handlePointerLeave = () => {
        pointer.active = false;
        pointer.speed = 0;
      };

      const handlePointerDown = (event: PointerEvent) => {
        pointer.x = event.clientX;
        pointer.y = event.clientY;
        updatePointerWorld();
        pulseOrigin.copy(pointerWorld);
        pulse = Math.max(pulse, 0.5);
      };

      const handleSectionPresence = (event: Event) => {
        const detail = (event as CustomEvent<{ id?: string; visible?: boolean }>).detail;
        if (!detail?.visible || !detail.id) return;
        targetProfile = { ...(profiles[detail.id] || defaultProfile) };
        window.requestAnimationFrame(updateSafeZones);
      };

      const handleProjectPulse = (event: Event) => {
        const direction = (event as CustomEvent<{ direction?: number }>).detail?.direction || 1;
        pulseOrigin.set(viewHalfWidth * 0.26, -0.1);
        pulse = 1;
        dolphinRepulsion.vx += direction * 0.24;
        dolphinRepulsion.vy += 0.14;
      };

      const handleVisibility = () => {
        pageVisible = !document.hidden;
        ensureRunning();
      };

      const resizeObserver = new ResizeObserver(resize);
      const themeObserver = new MutationObserver(applyTheme);
      resizeObserver.observe(host);
      themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
      window.addEventListener("pointermove", handlePointerMove, { passive: true });
      window.addEventListener("pointerdown", handlePointerDown, { passive: true });
      document.documentElement.addEventListener("pointerleave", handlePointerLeave);
      window.addEventListener("homepage:section-presence", handleSectionPresence);
      window.addEventListener("homepage:project-pulse", handleProjectPulse);
      document.addEventListener("visibilitychange", handleVisibility);

      applyTheme();
      resize();
      ensureRunning();

      cleanupScene = () => {
        window.cancelAnimationFrame(frame);
        resizeObserver.disconnect();
        themeObserver.disconnect();
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerdown", handlePointerDown);
        document.documentElement.removeEventListener("pointerleave", handlePointerLeave);
        window.removeEventListener("homepage:section-presence", handleSectionPresence);
        window.removeEventListener("homepage:project-pulse", handleProjectPulse);
        document.removeEventListener("visibilitychange", handleVisibility);
        scene.clear();
        resources.forEach((resource) => resource.dispose());
        renderer.dispose();
      };
    };

    void initialize();

    return () => {
      destroyed = true;
      cleanupScene?.();
    };
  }, []);

  return (
    <div
      ref={hostRef}
      className="ambient-world"
      data-status="loading"
      data-backend="static"
      data-quality="static"
      data-creature="same-side-dolphin"
      data-pointer-force="repel"
      data-entity-visual="marine-still-life"
      data-contact-model="gentle-displacement"
      data-entity-model="fixed-drift"
      data-glow-model="selective-additive"
      data-glow-theme="highlight"
      data-jelly-motion="pulse-glide"
      data-jelly-propulsion="pulse-recoil"
      data-static-overlay="fallback-only"
      data-entity-scale="small"
      data-relic-set="sea-bloom-sea-glass-coral"
      data-entity-radius-max="0"
      data-entity-speed-max="0"
      data-jelly-speed-max="0"
      data-coral-angle-deviation="0"
      data-simulation-step="60hz"
      data-entity-count="0"
      data-organism-count="0"
      aria-hidden="true"
    >
      <canvas />
      <div className="ambient-static-fallback">
        <span className="ambient-static-flow ambient-static-flow-one"></span>
        <span className="ambient-static-flow ambient-static-flow-two"></span>
        <span className="ambient-static-flow ambient-static-flow-three"></span>
        <svg className="ambient-static-sea-bloom" viewBox="-1.2 -1.2 2.4 2.4">
          {[0, 72, 144, 216, 288].map((angle, index) => (
            <ellipse
              key={angle}
              cx="0"
              cy={index % 2 === 0 ? "-0.46" : "-0.42"}
              rx={index % 2 === 0 ? "0.19" : "0.17"}
              ry={index % 2 === 0 ? "0.55" : "0.49"}
              transform={`rotate(${angle})`}
            />
          ))}
          <circle cx="0" cy="0" r="0.075" />
        </svg>
        <span className="ambient-static-relic ambient-static-sea-glass"></span>
        <span className="ambient-static-relic ambient-static-coral"></span>
        <svg className="ambient-static-dolphin" viewBox="-4.05 -1.05 4.7 2.1">
          <path className="ambient-static-dolphin-fin" d="M-1.12-.58C-1.38-.95-1.69-1.02-1.91-.46C-1.62-.53-1.36-.57-1.12-.58Z" />
          <path className="ambient-static-dolphin-tail" d="M-2.93-.08C-3.19-.14-3.39-.4-3.76-.49C-3.67-.24-3.52-.08-3.21-.005C-3.52.04-3.72.18-3.86.42C-3.43.37-3.2.16-2.95.07Z" />
          <path className="ambient-static-dolphin-body" d="M.43-.025C.35-.055.23-.075.08-.105C.09-.31-.06-.49-.31-.56C-.86-.72-1.62-.61-2.19-.39C-2.5-.27-2.77-.17-3.02-.09L-3.04.075C-2.76.13-2.49.2-2.2.31C-1.61.52-.9.53-.39.37C-.11.28.09.17.29.135C.37.115.44.055.43-.025Z" />
          <path className="ambient-static-dolphin-belly" d="M.38.045C.21.08.04.17-.2.25C-.72.44-1.42.46-2.18.3C-1.55.53-.86.53-.38.37C-.1.28.1.17.29.135C.35.11.39.075.38.045Z" />
          <path className="ambient-static-dolphin-fin" d="M-.68.23C-.88.52-1.12.91-1.42.93C-1.33.53-1.14.24-.77.12C-.71.14-.68.18-.68.23Z" />
          <circle className="ambient-static-dolphin-eye" cx="-.13" cy="-.22" r=".052" />
          <path className="ambient-static-dolphin-mouth" d="M.38.065C.3.085.18.11.06.115" />
        </svg>
        <span className="ambient-static-pixel ambient-static-pixel-one"></span>
        <span className="ambient-static-pixel ambient-static-pixel-two"></span>
        <span className="ambient-static-pixel ambient-static-pixel-three"></span>
      </div>
      <div className="ambient-structural-light" aria-hidden="true">
        <i className="ambient-light-band ambient-light-band-one"></i>
        <i className="ambient-light-band ambient-light-band-two"></i>
      </div>
      <div className="ambient-postprocess"></div>
    </div>
  );
}
