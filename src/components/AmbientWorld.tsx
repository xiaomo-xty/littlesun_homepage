import { useEffect, useRef } from "react";
import * as THREE from "three/webgpu";
import {
  AMBIENT_FIXED_STEP,
  advanceRibbonChain,
  canFracture,
  fracturePattern,
  pointerRepulsion,
  resolveCircleCollision,
  sampleAmbientDepth,
  sampleJellyPulse,
  sampleOceanFlow,
  scheduleFixedSimulation,
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
  id: number;
  kind: SolidKind;
  relic: MarineRelicKind;
  level: number;
  group: THREE.Group;
  fill: THREE.MeshBasicMaterial;
  edge: THREE.LineBasicMaterial;
  detail: THREE.LineBasicMaterial;
  alive: boolean;
  hit: number;
  fractureCooldown: number;
  phase: number;
  depth: number;
  previousX: number;
  previousY: number;
  rotation: number;
  previousRotation: number;
};

type MarineRelicKind = "shell" | "sea-glass" | "coral";

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
  heading: number;
  previousHeading: number;
  group: THREE.Group;
  fill: THREE.MeshBasicMaterial;
  edge: THREE.LineBasicMaterial;
  tentacles: JellyTentacle[];
};

type SafeZone = { left: number; right: number; top: number; bottom: number };
type FractureRequest = { entity: OceanEntity; impact: number };

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
  circle: "shell",
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

    host.dataset.backend = "static";
    host.dataset.quality = "static";
    host.dataset.creature = "same-side-dolphin";
    host.dataset.pointerForce = "repel";
    host.dataset.entityVisual = "marine-still-life";
    host.dataset.simulationStep = "60hz";
    host.dataset.entityCount = "0";
    host.dataset.organismCount = "0";
    host.dataset.fractureCount = "0";
    document.documentElement.dataset.ambientBackend = "static";

    if (staticOnly) {
      host.dataset.status = "ready";
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
        if (!destroyed) host.dataset.status = "ready";
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
      let fractureCount = 0;
      let hasRendered = false;
      let simulationAccumulator = 0;
      let simulationTick = 0;
      let nextEntityId = 1;
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
        { count: balanced ? 28 : 48, depthRange: [0.02, 0.34] as const, renderOrder: 18 },
        { count: balanced ? 14 : 26, depthRange: [0.38, 0.72] as const, renderOrder: 70 },
        { count: balanced ? 6 : 10, depthRange: [0.8, 1] as const, renderOrder: 112 },
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
        return { mesh, material, particles: layerParticles, depthRange: spec.depthRange };
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
        const bell = new THREE.Mesh(jellyGeometry, fill);
        const outline = new THREE.LineSegments(jellyEdgeGeometry, edge);
        const group = new THREE.Group();
        const renderOrder = 52 + Math.round(depth * 30);
        bell.renderOrder = renderOrder;
        outline.renderOrder = renderOrder + 1;
        group.add(bell, outline);
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
          cycleDuration: 2.9 + random() * 1.05,
          pulseStrength: 0.28 + random() * 0.14,
          heading,
          previousHeading: heading,
          group,
          fill,
          edge,
          tentacles,
        });
      };

      createJelly(-3.8, 1.7, 0.62, 0.2, 0.62);
      createJelly(3.35, -1.55, 0.52, 2.5, 0.38);
      if (!balanced) createJelly(1.1, 2.65, 0.38, 4.1, 0.72);
      host.dataset.organismCount = String(jellies.length);

      const entities: OceanEntity[] = [];
      const activeEntities: OceanEntity[] = [];
      const fractureQueue: FractureRequest[] = [];
      const queuedForFracture = new Set<number>();
      const entityLimit = balanced ? 9 : 13;
      const collisionResult: CollisionResult = { collided: false, impact: 0, nx: 0, ny: 0 };

      const createEntityShape = (kind: SolidKind, radius: number) => {
        const shape = new THREE.Shape();
        if (kind === "circle") {
          shape.moveTo(0, -radius * 0.62);
          shape.bezierCurveTo(-radius * 0.46, -radius * 0.56, -radius * 0.9, -radius * 0.24, -radius * 0.92, radius * 0.12);
          shape.bezierCurveTo(-radius * 0.9, radius * 0.54, -radius * 0.5, radius * 0.82, 0, radius * 0.84);
          shape.bezierCurveTo(radius * 0.5, radius * 0.82, radius * 0.9, radius * 0.54, radius * 0.92, radius * 0.12);
          shape.bezierCurveTo(radius * 0.9, -radius * 0.24, radius * 0.46, -radius * 0.56, 0, -radius * 0.62);
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
          [-0.62, -0.32, 0, 0.32, 0.62].forEach((x) => segment(0, -0.5, x, 0.58 - Math.abs(x) * 0.12));
          segment(-0.48, -0.18, 0.48, -0.18);
        } else if (kind === "rect") {
          segment(-0.45, 0.26, 0.38, 0.38);
          segment(-0.5, 0.12, 0.56, 0.25);
        } else {
          segment(-0.02, -0.62, -0.02, 0.58);
          segment(-0.02, -0.1, 0.52, 0.02);
          segment(-0.04, 0.12, -0.48, 0.35);
        }
        return register(new THREE.BufferGeometry().setFromPoints(points));
      };

      const createEntity = (
        kind: SolidKind,
        level: number,
        radius: number,
        x: number,
        y: number,
        vx: number,
        vy: number,
      ) => {
        const geometry = register(new THREE.ShapeGeometry(createEntityShape(kind, radius), balanced ? 8 : 12));
        const fill = register(new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false }));
        const mesh = new THREE.Mesh(geometry, fill);
        const edgeGeometry = register(new THREE.EdgesGeometry(geometry, 36));
        const edge = register(new THREE.LineBasicMaterial({ transparent: true, depthWrite: false }));
        const edges = new THREE.LineSegments(edgeGeometry, edge);
        const detail = register(new THREE.LineBasicMaterial({ transparent: true, depthWrite: false }));
        const details = new THREE.LineSegments(createEntityDetailGeometry(kind, radius), detail);
        const group = new THREE.Group();
        group.add(mesh, edges, details);
        world.add(group);

        const entity: OceanEntity = {
          id: nextEntityId,
          kind,
          relic: marineRelicForSolid[kind],
          level,
          group,
          fill,
          edge,
          detail,
          alive: true,
          hit: 0,
          fractureCooldown: 1.8 + random() * 2.2,
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
          angularVelocity: (random() - 0.5) * 0.18,
          rotation: (random() - 0.5) * 0.34,
          previousRotation: 0,
        };
        entity.previousRotation = entity.rotation;
        nextEntityId += 1;
        entities.push(entity);
        return entity;
      };

      const initialEntityCount = balanced ? 6 : 8;
      const kinds: SolidKind[] = ["rect", "circle", "triangle"];
      for (let index = 0; index < initialEntityCount; index += 1) {
        const radius = 0.4 + random() * (balanced ? 0.34 : 0.5);
        createEntity(
          kinds[index % kinds.length],
          index < 3 ? 2 : 1,
          radius,
          (random() * 1.7 - 0.85) * viewHalfWidth,
          (random() * 1.56 - 0.78) * viewHalfHeight,
          (random() - 0.5) * 0.12,
          (random() - 0.5) * 0.12,
        );
      }
      host.dataset.entityCount = String(initialEntityCount);

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

      const dolphinBodyShape = createDolphinBodyShape();
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
      let dolphinEntityCooldown = 0;
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
        host.dataset.dolphinEye = lightTheme ? "deep-ink-light" : "deep-ink-dark";
        dolphinOutlineMaterial.color.copy(lightTheme ? palette.accentStrong : palette.surface);
        dolphinMouthMaterial.color.copy(palette.ink);
        dolphinBodyMaterial.opacity = lightTheme ? 0.74 : 0.68;
        dolphinBellyMaterial.opacity = lightTheme ? 0.62 : 0.58;
        dolphinFinMaterial.opacity = lightTheme ? 0.72 : 0.66;
        dolphinOutlineMaterial.opacity = lightTheme ? 0.78 : 0.72;
        dolphinMouthMaterial.opacity = lightTheme ? 0.68 : 0.62;
        jellies.forEach((jelly) => {
          jelly.fill.color.copy(lightTheme ? palette.surface : palette.accent);
          jelly.edge.color.copy(lightTheme ? palette.accentStrong : palette.surface);
          jelly.tentacles.forEach((tentacle) => tentacle.material.color.copy(palette.accent));
        });
        flowRibbons.forEach((ribbon) => ribbon.material.color.copy(lightTheme ? palette.line : palette.accent));
        entities.forEach((entity) => {
          entity.fill.color.copy(palette.surface);
          entity.edge.color.copy(lightTheme ? palette.line : palette.accent);
          entity.detail.color.copy(lightTheme ? palette.accentStrong : palette.surface);
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

      const queueFracture = (entity: OceanEntity, impact: number) => {
        if (!entity.alive || entity.fractureCooldown > 0 || queuedForFracture.has(entity.id)) return;
        if (!canFracture(entity.level, impact, activeEntities.length, entityLimit)) return;
        queuedForFracture.add(entity.id);
        fractureQueue.push({ entity, impact });
      };

      const updateEntityCount = () => {
        const count = entities.reduce((total, entity) => total + Number(entity.alive), 0);
        host.dataset.entityCount = String(count);
        return count;
      };

      const fractureEntity = (request: FractureRequest) => {
        const parent = request.entity;
        if (!parent.alive) return;
        const pattern = fracturePattern(parent.kind, parent.level);
        const available = entityLimit - (updateEntityCount() - 1);
        const pieces = pattern.slice(0, Math.max(0, available));
        if (pieces.length < 2) return;

        parent.alive = false;
        world.remove(parent.group);
        pieces.forEach((piece, index) => {
          const radius = Math.max(0.16, parent.radius * piece.radiusRatio);
          const tangent = index % 2 === 0 ? -0.14 : 0.14;
          const child = createEntity(
            piece.kind,
            piece.level,
            radius,
            parent.x + piece.direction.x * parent.radius * 0.46,
            parent.y + piece.direction.y * parent.radius * 0.46,
            parent.vx + piece.direction.x * (0.54 + request.impact * 0.24) - piece.direction.y * tangent,
            parent.vy + piece.direction.y * (0.54 + request.impact * 0.24) + piece.direction.x * tangent,
          );
          child.angularVelocity += (index - pieces.length * 0.5) * 0.28;
          child.hit = 1;
          child.fractureCooldown = 1.9;
          child.fill.color.copy(palette.surface);
          child.edge.color.copy(lightTheme ? palette.line : palette.accent);
          child.detail.color.copy(lightTheme ? palette.accentStrong : palette.surface);
        });
        fractureCount += 1;
        host.dataset.fractureCount = String(fractureCount);
        pulseOrigin.set(parent.x, parent.y);
        pulse = Math.max(pulse, 0.72);
        updateEntityCount();
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
        activeEntities.length = 0;
        fractureQueue.length = 0;
        queuedForFracture.clear();

        entities.forEach((entity) => {
          if (!entity.alive) return;
          activeEntities.push(entity);
          entity.fractureCooldown = Math.max(0, entity.fractureCooldown - delta);
          entity.hit *= Math.exp(-4.2 * delta);

          if (pointer.active) {
            pointerRepulsion(entity, pointerWorld, 2.1 + entity.radius, 4.8 + pointer.speed * 11, repelForce);
            entity.vx += repelForce.x * delta;
            entity.vy += repelForce.y * delta;
            if (Math.abs(repelForce.x) + Math.abs(repelForce.y) > 0.16) entity.hit = Math.max(entity.hit, 0.34);
          }

          if (pulse > 0.01) {
            const dx = entity.x - pulseOrigin.x;
            const dy = entity.y - pulseOrigin.y;
            const distance = Math.max(0.2, Math.hypot(dx, dy));
            const strength = Math.max(0, 1 - distance / 4.6) * pulse * delta * 1.8;
            entity.vx += dx / distance * strength;
            entity.vy += dy / distance * strength;
          }

          sampleOceanFlow(entity, seconds, flowForce);
          entity.vx += flowForce.x * delta * 0.12 * currentProfile.flow;
          entity.vy += flowForce.y * delta * 0.12 * currentProfile.flow;
          zoneForce.set(0, 0);
          addSafeZoneForce(entity.x, entity.y, zoneForce, 0.66);
          entity.vx += zoneForce.x * delta;
          entity.vy += zoneForce.y * delta;

          entity.vx *= Math.exp(-0.36 * delta);
          entity.vy *= Math.exp(-0.36 * delta);
          entity.angularVelocity *= Math.exp(-0.22 * delta);
          entity.x += entity.vx * delta * currentProfile.entity;
          entity.y += entity.vy * delta * currentProfile.entity;
          entity.rotation += entity.angularVelocity * delta;

          const boundaryX = viewHalfWidth - entity.radius * 0.7;
          const boundaryY = viewHalfHeight - entity.radius * 0.7;
          if (entity.x < -boundaryX || entity.x > boundaryX) {
            entity.x = Math.max(-boundaryX, Math.min(boundaryX, entity.x));
            entity.vx *= -0.74;
            entity.hit = Math.max(entity.hit, 0.48);
          }
          if (entity.y < -boundaryY || entity.y > boundaryY) {
            entity.y = Math.max(-boundaryY, Math.min(boundaryY, entity.y));
            entity.vy *= -0.74;
            entity.hit = Math.max(entity.hit, 0.48);
          }

        });

        for (let firstIndex = 0; firstIndex < activeEntities.length; firstIndex += 1) {
          for (let secondIndex = firstIndex + 1; secondIndex < activeEntities.length; secondIndex += 1) {
            const first = activeEntities[firstIndex];
            const second = activeEntities[secondIndex];
            const result = resolveCircleCollision(first, second, 0.7, collisionResult);
            if (!result.collided) continue;
            const response = Math.min(1, 0.22 + result.impact * 0.52);
            first.hit = Math.max(first.hit, response);
            second.hit = Math.max(second.hit, response);
            first.angularVelocity -= result.ny * result.impact * 0.13;
            second.angularVelocity += result.nx * result.impact * 0.13;
            if (result.impact >= 0.82) queueFracture(first.level >= second.level ? first : second, result.impact);
          }
        }
      };

      const renderEntities = (seconds: number, alpha: number) => {
        entities.forEach((entity) => {
          if (!entity.alive) return;
          const breathe = 1 + Math.sin(seconds * 0.42 + entity.phase) * 0.022 + entity.hit * 0.06;
          entity.group.position.set(
            lerp(entity.previousX, entity.x, alpha),
            lerp(entity.previousY, entity.y, alpha),
            entity.depth,
          );
          entity.group.rotation.z = lerpAngle(entity.previousRotation, entity.rotation, alpha);
          entity.group.scale.setScalar(breathe);
          entity.fill.color.copy(palette.surface).lerp(palette.accent, entity.hit * 0.32);
          entity.edge.color.copy(lightTheme ? palette.line : palette.accent).lerp(palette.accentStrong, entity.hit * 0.56);
          entity.detail.color.copy(lightTheme ? palette.accentStrong : palette.surface).lerp(palette.accent, entity.hit * 0.34);
          entity.fill.opacity = (lightTheme ? 0.24 : 0.12) + entity.hit * 0.07;
          entity.edge.opacity = (lightTheme ? 0.78 : 0.46) * currentProfile.entity + entity.hit * 0.14;
          entity.detail.opacity = (lightTheme ? 0.6 : 0.34) * currentProfile.entity + entity.hit * 0.1;
        });
      };

      const simulateJellies = (seconds: number, delta: number) => {
        jellies.forEach((jelly) => {
          const pulseSample = sampleJellyPulse(seconds / jelly.cycleDuration + jelly.phase / (Math.PI * 2));
          sampleOceanFlow(jelly, seconds + jelly.phase, flowForce);
          const desiredHeading = Math.atan2(
            0.15 + flowForce.y * 0.42 + jelly.vy * 0.24,
            flowForce.x * 0.62 + jelly.vx * 0.24,
          );
          const headingDelta = Math.atan2(
            Math.sin(desiredHeading - jelly.heading),
            Math.cos(desiredHeading - jelly.heading),
          );
          jelly.heading += headingDelta * Math.min(1, delta * 0.54);
          jelly.vx += flowForce.x * delta * 0.08 * currentProfile.flow;
          jelly.vy += (flowForce.y * 0.058 * currentProfile.flow + 0.01) * delta;
          const thrust = pulseSample.thrust * jelly.pulseStrength
            * (0.76 + jelly.depth * 0.24) * currentProfile.jelly;
          jelly.vx += Math.cos(jelly.heading) * thrust * delta;
          jelly.vy += Math.sin(jelly.heading) * thrust * delta;

          if (pointer.active) {
            pointerRepulsion(jelly, pointerWorld, balanced ? 1.55 : 1.8, 3.4 + pointer.speed * 7, repelForce);
            jelly.vx += repelForce.x * delta;
            jelly.vy += repelForce.y * delta;
          }
          zoneForce.set(0, 0);
          addSafeZoneForce(jelly.x, jelly.y, zoneForce, 0.9);
          jelly.vx += zoneForce.x * delta;
          jelly.vy += zoneForce.y * delta;
          jelly.vx *= Math.exp(-0.54 * delta);
          jelly.vy *= Math.exp(-0.54 * delta);
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
                x: tentacle.offset * (1 - pulseSample.contraction * 0.14),
                y: -0.03 + pulseSample.contraction * 0.075,
              },
              delta,
              0.16 * (1 - pulseSample.contraction * 0.06),
              20,
              6.4,
            );
          });
        });
      };

      const renderJellies = (seconds: number, alpha: number) => {
        jellies.forEach((jelly) => {
          const pulseSample = sampleJellyPulse(seconds / jelly.cycleDuration + jelly.phase / (Math.PI * 2));
          const ambientBreath = Math.sin(seconds * 0.68 + jelly.phase) * 0.02;
          const depthProfile = sampleAmbientDepth(jelly.depth);
          const perspectiveScale = 0.82 + depthProfile.scale * 0.18;
          jelly.group.position.set(
            lerp(jelly.previousX, jelly.x, alpha),
            lerp(jelly.previousY, jelly.y, alpha),
            -3.2 + jelly.depth * 2.4,
          );
          jelly.group.rotation.z = lerpAngle(jelly.previousHeading, jelly.heading, alpha) - Math.PI / 2
            + Math.sin(seconds * 0.46 + jelly.phase) * 0.032;
          jelly.group.scale.set(
            jelly.scale * perspectiveScale * (1 - pulseSample.contraction * 0.14 + ambientBreath),
            jelly.scale * perspectiveScale * (1 + pulseSample.contraction * 0.1 - ambientBreath * 0.7),
            1,
          );
          const visibility = (0.72 + jelly.depth * 0.28) * currentProfile.jelly;
          jelly.fill.opacity = (lightTheme ? 0.3 : 0.22) * visibility;
          jelly.edge.opacity = (lightTheme ? 0.64 : 0.5) * visibility;

          jelly.tentacles.forEach((tentacle, tentacleIndex) => {
            tentacle.points.forEach((point, pointIndex) => {
              const offset = pointIndex * 3;
              const trail = pointIndex / Math.max(1, tentacle.points.length - 1);
              tentacle.positions[offset] = point.x
                + Math.sin(seconds * 1.1 + jelly.phase + tentacleIndex + pointIndex * 0.5)
                * trail * (0.022 + pulseSample.thrust * 0.016);
              tentacle.positions[offset + 1] = point.y;
              tentacle.positions[offset + 2] = -0.02;
            });
            tentacle.attribute.needsUpdate = true;
            tentacle.material.opacity = (lightTheme ? 0.48 : 0.42) * visibility;
          });
        });
      };

      const simulateDolphin = (delta: number) => {
        if (!dolphinStream) return;
        dolphinSwimClock += delta;
        dolphinEntityCooldown = Math.max(0, dolphinEntityCooldown - delta);
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
        activeEntities.forEach((entity) => {
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
          if (nearestDistance >= contactDistance) return;
          const distance = Math.max(0.001, nearestDistance);
          const nx = (entity.x - nearestPoint.x) / distance;
          const ny = (entity.y - nearestPoint.y) / distance;
          const overlap = contactDistance - distance;
          entity.x += nx * overlap * 0.66;
          entity.y += ny * overlap * 0.66;
          const push = 0.7 + currentProfile.dolphinSpeed * 0.45;
          entity.vx += (nx * push + dolphinForward.x * 0.24) / Math.max(0.28, entity.mass);
          entity.vy += (ny * push + dolphinForward.y * 0.24) / Math.max(0.28, entity.mass);
          entity.angularVelocity += (nx - ny) * 0.42;
          entity.hit = 1;
          dolphinRepulsion.vx -= nx * 0.09;
          dolphinRepulsion.vy -= ny * 0.09;
          if (dolphinEntityCooldown <= 0) {
            queueFracture(entity, 0.86 + push * 0.18);
            dolphinEntityCooldown = 0.52;
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
            sharedMatrix.makeScale(scale, scale, scale);
            sharedMatrix.setPosition(
              lerp(particle.previousX, particle.x, alpha)
                + Math.sin(seconds * 0.32 + particle.phase) * 0.05 * particle.drift,
              lerp(particle.previousY, particle.y, alpha)
                + Math.cos(seconds * 0.27 + particle.phase) * 0.04 * particle.drift,
              particle.z,
            );
            layer.mesh.setMatrixAt(index, sharedMatrix);
            sharedColor.copy(lightTheme ? palette.surface : palette.ink).lerp(
              palette.accent,
              Math.min(1, 0.32 + particle.depthOpacity * 0.92),
            );
            sharedColor.lerp(palette.accentStrong, Math.max(0, twinkle - 0.5) * 0.42);
            layer.mesh.setColorAt(index, sharedColor);
          });
          layer.mesh.instanceMatrix.needsUpdate = true;
          if (layer.mesh.instanceColor) layer.mesh.instanceColor.needsUpdate = true;
          const representativeDepth = (layer.depthRange[0] + layer.depthRange[1]) * 0.5;
          layer.material.opacity = sampleAmbientDepth(representativeDepth).opacity
            * (balanced ? 0.55 : 0.62) * (0.7 + currentProfile.particle * 0.3);
        });
      };

      const snapshotSimulationState = () => {
        entities.forEach((entity) => {
          if (!entity.alive) return;
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
        fractureQueue.forEach(fractureEntity);
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
          host.dataset.status = "ready";
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
      data-simulation-step="60hz"
      data-entity-count="0"
      data-organism-count="0"
      data-fracture-count="0"
      aria-hidden="true"
    >
      <canvas />
      <div className="ambient-static-fallback">
        <span className="ambient-static-flow ambient-static-flow-one"></span>
        <span className="ambient-static-flow ambient-static-flow-two"></span>
        <span className="ambient-static-flow ambient-static-flow-three"></span>
        <span className="ambient-static-relic ambient-static-shell"></span>
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
      <div className="ambient-postprocess"></div>
    </div>
  );
}
