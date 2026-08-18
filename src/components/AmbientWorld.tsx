import { useEffect, useRef } from "react";
import * as THREE from "three/webgpu";
import {
  advanceRibbonChain,
  canFracture,
  fracturePattern,
  pointerRepulsion,
  resolveCircleCollision,
  sampleOceanFlow,
  schoolingSteer,
  type BoidState,
  type CollisionResult,
  type RibbonPoint,
  type SolidBodyState,
  type SolidKind,
  type Vector2Like,
} from "../lib/ambientSimulation";

type Disposable = { dispose: () => void };
type BackendFlags = { isWebGPUBackend?: boolean; isWebGLBackend?: boolean };

type SceneProfile = {
  energy: number;
  entity: number;
  particle: number;
  school: number;
  raySpeed: number;
  rayBiasY: number;
  flow: number;
};

type OceanEntity = SolidBodyState & {
  id: number;
  kind: SolidKind;
  level: number;
  group: THREE.Group;
  fill: THREE.MeshBasicMaterial;
  edge: THREE.LineBasicMaterial;
  alive: boolean;
  hit: number;
  fractureCooldown: number;
  phase: number;
  depth: number;
};

type OceanParticle = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  size: number;
  phase: number;
  speed: number;
};

type SchoolOrganism = BoidState & {
  phase: number;
  scale: number;
  depth: number;
};

type SafeZone = { left: number; right: number; top: number; bottom: number };
type FractureRequest = { entity: OceanEntity; impact: number };

type CurveRibbon = {
  points: RibbonPoint[];
  curvePoints: THREE.Vector3[];
  curve: THREE.CatmullRomCurve3;
  positions: Float32Array;
  attribute: THREE.BufferAttribute;
  material: THREE.LineBasicMaterial;
  samples: number;
  phase: number;
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
  top: { energy: 0.86, entity: 0.78, particle: 0.72, school: 0.86, raySpeed: 0.82, rayBiasY: 0.12, flow: 0.72 },
  about: { energy: 0.64, entity: 0.58, particle: 0.44, school: 0.62, raySpeed: 0.62, rayBiasY: -0.08, flow: 0.58 },
  projects: { energy: 1, entity: 0.94, particle: 0.88, school: 1, raySpeed: 1, rayBiasY: 0.04, flow: 0.92 },
  articles: { energy: 0.54, entity: 0.48, particle: 0.34, school: 0.54, raySpeed: 0.54, rayBiasY: -0.2, flow: 0.48 },
  life: { energy: 0.82, entity: 0.72, particle: 0.72, school: 0.88, raySpeed: 0.84, rayBiasY: 0.18, flow: 0.8 },
  contact: { energy: 0.58, entity: 0.52, particle: 0.38, school: 0.58, raySpeed: 0.56, rayBiasY: 0, flow: 0.52 },
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
    host.dataset.creature = "space-ray";
    host.dataset.pointerForce = "repel";
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
      const sharedQuaternion = new THREE.Quaternion();
      const sharedPosition = new THREE.Vector3();
      const sharedScale = new THREE.Vector3();
      const zAxis = new THREE.Vector3(0, 0, 1);
      const curveSample = new THREE.Vector3();
      const pointerWorld = new THREE.Vector2();
      const repelForce: Vector2Like = { x: 0, y: 0 };
      const flowForce: Vector2Like = { x: 0, y: 0 };
      const zoneForce = new THREE.Vector2();
      const obstacleForce = new THREE.Vector2();

      const particleCount = balanced ? 34 : 66;
      const particleGeometry = register(new THREE.BoxGeometry(0.05, 0.05, 0.025));
      const particleMaterial = register(new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.2, depthWrite: false }));
      const particleMesh = new THREE.InstancedMesh(particleGeometry, particleMaterial, particleCount);
      particleMesh.frustumCulled = false;
      world.add(particleMesh);
      const particles: OceanParticle[] = Array.from({ length: particleCount }, () => ({
        x: random() * 12 - 6,
        y: random() * 10 - 5,
        z: -2.8 - random() * 3.4,
        vx: 0,
        vy: 0,
        size: 0.42 + random() * 1.12,
        phase: random() * Math.PI * 2,
        speed: 0.035 + random() * 0.12,
      }));

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

      const makeSchoolGeometry = () => {
        const shape = new THREE.Shape();
        shape.moveTo(0.26, 0);
        shape.quadraticCurveTo(0.02, 0.16, -0.18, 0.08);
        shape.quadraticCurveTo(-0.3, 0.16, -0.25, 0);
        shape.quadraticCurveTo(-0.3, -0.16, -0.18, -0.08);
        shape.quadraticCurveTo(0.02, -0.16, 0.26, 0);
        return register(new THREE.ShapeGeometry(shape, 8));
      };

      const schoolCount = balanced ? 10 : 18;
      const schoolMaterial = register(new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false }));
      const schoolMesh = new THREE.InstancedMesh(makeSchoolGeometry(), schoolMaterial, schoolCount);
      schoolMesh.frustumCulled = false;
      world.add(schoolMesh);
      const school: SchoolOrganism[] = Array.from({ length: schoolCount }, () => ({
        x: random() * 9 - 4.5,
        y: random() * 6 - 3,
        vx: 0.24 + random() * 0.28,
        vy: (random() - 0.5) * 0.28,
        phase: random() * Math.PI * 2,
        scale: 0.72 + random() * 0.78,
        depth: -1.7 - random() * 1.6,
      }));
      host.dataset.organismCount = String(schoolCount);
      const schoolForce: Vector2Like = { x: 0, y: 0 };
      const schoolOptions = {
        neighborRadius: balanced ? 1.8 : 2.1,
        separationRadius: 0.52,
        separationWeight: 0.16,
        alignmentWeight: 0.25,
        cohesionWeight: 0.045,
        maxForce: 0.7,
      };

      const entities: OceanEntity[] = [];
      const activeEntities: OceanEntity[] = [];
      const fractureQueue: FractureRequest[] = [];
      const queuedForFracture = new Set<number>();
      const entityLimit = balanced ? 9 : 13;
      const collisionResult: CollisionResult = { collided: false, impact: 0, nx: 0, ny: 0 };

      const createEntityGeometry = (kind: SolidKind, radius: number) => {
        const shape = new THREE.Shape();
        if (kind === "circle") {
          shape.absellipse(0, 0, radius, radius * 0.68, 0, Math.PI * 2, false, 0);
        } else if (kind === "rect") {
          const halfW = radius * 0.98;
          const halfH = radius * 0.48;
          const curve = radius * 0.34;
          shape.moveTo(-halfW + curve, -halfH);
          shape.lineTo(halfW - curve, -halfH);
          shape.quadraticCurveTo(halfW, -halfH, halfW, 0);
          shape.quadraticCurveTo(halfW, halfH, halfW - curve, halfH);
          shape.lineTo(-halfW + curve, halfH);
          shape.quadraticCurveTo(-halfW, halfH, -halfW, 0);
          shape.quadraticCurveTo(-halfW, -halfH, -halfW + curve, -halfH);
        } else {
          shape.moveTo(radius, 0);
          shape.quadraticCurveTo(0.12 * radius, 0.9 * radius, -0.72 * radius, 0.12 * radius);
          shape.quadraticCurveTo(-0.2 * radius, -0.72 * radius, radius, 0);
        }
        return register(new THREE.ShapeGeometry(shape, balanced ? 8 : 12));
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
        const geometry = createEntityGeometry(kind, radius);
        const fill = register(new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false }));
        const mesh = new THREE.Mesh(geometry, fill);
        const edgeGeometry = register(new THREE.EdgesGeometry(geometry, 36));
        const edge = register(new THREE.LineBasicMaterial({ transparent: true, depthWrite: false }));
        const edges = new THREE.LineSegments(edgeGeometry, edge);
        const group = new THREE.Group();
        group.add(mesh, edges);
        world.add(group);

        const entity: OceanEntity = {
          id: nextEntityId,
          kind,
          level,
          group,
          fill,
          edge,
          alive: true,
          hit: 0,
          fractureCooldown: 1.8 + random() * 2.2,
          phase: random() * Math.PI * 2,
          depth: -0.72 - random() * 1.32,
          x,
          y,
          vx,
          vy,
          radius,
          mass: Math.max(0.22, radius * radius * (kind === "rect" ? 1.3 : 1)),
          angularVelocity: (random() - 0.5) * 0.18,
        };
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

      const rayShape = new THREE.Shape();
      rayShape.moveTo(0.88, 0);
      rayShape.quadraticCurveTo(0.2, 0.26, -0.16, 0.72);
      rayShape.quadraticCurveTo(-0.52, 0.48, -0.72, 0.08);
      rayShape.quadraticCurveTo(-0.5, 0, -0.72, -0.08);
      rayShape.quadraticCurveTo(-0.52, -0.48, -0.16, -0.72);
      rayShape.quadraticCurveTo(0.2, -0.26, 0.88, 0);
      const rayGeometry = register(new THREE.ShapeGeometry(rayShape, balanced ? 12 : 18));
      const rayFillMaterial = register(new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false }));
      const rayEdgeMaterial = register(new THREE.LineBasicMaterial({ transparent: true, depthWrite: false }));
      const rayBody = new THREE.Mesh(rayGeometry, rayFillMaterial);
      const rayEdges = new THREE.LineSegments(register(new THREE.EdgesGeometry(rayGeometry, 40)), rayEdgeMaterial);
      const rayGroup = new THREE.Group();
      rayGroup.add(rayBody, rayEdges);
      world.add(rayGroup);

      const createTailRibbon = (index: number): CurveRibbon => {
        const pointCount = balanced ? 6 : 8;
        const samples = balanced ? 24 : 38;
        const points = Array.from({ length: pointCount }, (_, pointIndex) => ({
          x: -2.4 - pointIndex * 0.38,
          y: 0.6 + (index - 1) * 0.18,
          vx: 0,
          vy: 0,
        }));
        const curvePoints = points.map((point) => new THREE.Vector3(point.x, point.y, -0.18));
        const curve = new THREE.CatmullRomCurve3(curvePoints, false, "centripetal", 0.46);
        const positions = new Float32Array(samples * 3);
        const geometry = register(new THREE.BufferGeometry());
        const attribute = new THREE.BufferAttribute(positions, 3);
        attribute.setUsage(THREE.DynamicDrawUsage);
        geometry.setAttribute("position", attribute);
        const material = register(new THREE.LineBasicMaterial({ transparent: true, depthWrite: false }));
        const line = new THREE.Line(geometry, material);
        line.frustumCulled = false;
        world.add(line);
        return { points, curvePoints, curve, positions, attribute, material, samples, phase: index * 1.7 };
      };
      const rayTails = Array.from({ length: 3 }, (_, index) => createTailRibbon(index));
      const rayPosition = new THREE.Vector2(-2.8, 0.8);
      const rayVelocity = new THREE.Vector2(0.52, 0.12);
      const rayForce = new THREE.Vector2();
      const rayDesired = new THREE.Vector2();
      const rayWanderTarget = new THREE.Vector2(2.4, 0.6);
      let rayWanderTimer = 0;
      let rayKickCooldown = 0;

      const applyTheme = () => {
        const styles = getComputedStyle(document.documentElement);
        lightTheme = document.documentElement.dataset.theme !== "dark";
        palette.accent.set(styles.getPropertyValue("--accent").trim() || "#53a3f2");
        palette.accentStrong.set(styles.getPropertyValue("--accent-strong").trim() || "#257bc6");
        palette.line.set(styles.getPropertyValue("--line-strong").trim() || "#6f8ca3");
        palette.surface.set(styles.getPropertyValue("--surface-strong").trim() || "#d7e6f2");
        palette.ink.set(styles.getPropertyValue("--ink").trim() || "#101820");
        particleMaterial.color.copy(palette.accent);
        schoolMaterial.color.copy(lightTheme ? palette.accentStrong : palette.accent);
        rayFillMaterial.color.copy(lightTheme ? palette.surface : palette.accent);
        rayEdgeMaterial.color.copy(lightTheme ? palette.accentStrong : palette.accent);
        rayTails.forEach((tail, index) => tail.material.color.copy(index === 1 ? palette.accentStrong : palette.accent));
        flowRibbons.forEach((ribbon) => ribbon.material.color.copy(lightTheme ? palette.line : palette.accent));
        entities.forEach((entity) => {
          entity.fill.color.copy(palette.surface);
          entity.edge.color.copy(lightTheme ? palette.line : palette.accent);
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
        viewHalfWidth = viewHalfHeight * (width / height);
        camera.left = -viewHalfWidth;
        camera.right = viewHalfWidth;
        camera.top = viewHalfHeight;
        camera.bottom = -viewHalfHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height, false);
        updateSafeZones();
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
        safeZones.forEach((zone) => {
          const margin = 0.035;
          if (screenX < zone.left - margin || screenX > zone.right + margin || screenY < zone.top - margin || screenY > zone.bottom + margin) return;
          const centerX = (zone.left + zone.right) * 0.5;
          const centerY = (zone.top + zone.bottom) * 0.5;
          obstacleForce.set(screenX - centerX, -(screenY - centerY));
          if (obstacleForce.lengthSq() < 0.0001) obstacleForce.set(screenX < 0.5 ? -1 : 1, 0.2);
          obstacleForce.normalize().multiplyScalar(strength);
          target.add(obstacleForce);
        });
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
          ribbon.material.opacity = (lightTheme ? 0.11 : 0.13) * currentProfile.flow;
        });
      };

      const updateEntities = (time: number, delta: number) => {
        const seconds = time * 0.001;
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
          entity.group.rotation.z += entity.angularVelocity * delta;

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

          const breathe = 1 + Math.sin(seconds * 0.42 + entity.phase) * 0.022 + entity.hit * 0.06;
          entity.group.position.set(entity.x, entity.y, entity.depth);
          entity.group.scale.setScalar(breathe);
          entity.fill.color.copy(palette.surface).lerp(palette.accent, entity.hit * 0.38);
          entity.edge.color.copy(lightTheme ? palette.line : palette.accent).lerp(palette.accentStrong, entity.hit * 0.62);
          entity.fill.opacity = (lightTheme ? 0.15 : 0.1) + entity.hit * 0.08;
          entity.edge.opacity = (lightTheme ? 0.52 : 0.42) * currentProfile.entity + entity.hit * 0.16;
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

      const updateSchool = (time: number, delta: number) => {
        const seconds = time * 0.001;
        school.forEach((organism, index) => {
          schoolingSteer(organism, school, schoolOptions, schoolForce);
          sampleOceanFlow(organism, seconds + organism.phase, flowForce);
          organism.vx += (schoolForce.x + flowForce.x * 0.16 * currentProfile.flow) * delta;
          organism.vy += (schoolForce.y + flowForce.y * 0.16 * currentProfile.flow) * delta;

          if (pointer.active) {
            pointerRepulsion(organism, pointerWorld, balanced ? 2.2 : 2.7, 7 + pointer.speed * 14, repelForce);
            organism.vx += repelForce.x * delta;
            organism.vy += repelForce.y * delta;
          }

          zoneForce.set(0, 0);
          addSafeZoneForce(organism.x, organism.y, zoneForce, 1.08);
          organism.vx += zoneForce.x * delta;
          organism.vy += zoneForce.y * delta;

          const speed = Math.hypot(organism.vx, organism.vy);
          const maxSpeed = 0.56 + currentProfile.school * 0.28;
          if (speed > maxSpeed) {
            organism.vx = organism.vx / speed * maxSpeed;
            organism.vy = organism.vy / speed * maxSpeed;
          }
          organism.vx *= Math.exp(-0.12 * delta);
          organism.vy *= Math.exp(-0.12 * delta);
          organism.x += organism.vx * delta;
          organism.y += organism.vy * delta;

          const margin = 0.45;
          if (organism.x < -viewHalfWidth - margin) organism.x = viewHalfWidth + margin;
          if (organism.x > viewHalfWidth + margin) organism.x = -viewHalfWidth - margin;
          if (organism.y < -viewHalfHeight - margin) organism.y = viewHalfHeight + margin;
          if (organism.y > viewHalfHeight + margin) organism.y = -viewHalfHeight - margin;

          const angle = Math.atan2(organism.vy, organism.vx);
          const pulseScale = organism.scale * (1 + Math.sin(seconds * 2 + organism.phase) * 0.06);
          sharedPosition.set(organism.x, organism.y, organism.depth);
          sharedQuaternion.setFromAxisAngle(zAxis, angle);
          sharedScale.set(pulseScale, pulseScale * 0.78, 1);
          sharedMatrix.compose(sharedPosition, sharedQuaternion, sharedScale);
          schoolMesh.setMatrixAt(index, sharedMatrix);
        });
        schoolMesh.instanceMatrix.needsUpdate = true;
        schoolMaterial.opacity = (lightTheme ? 0.36 : 0.32) * currentProfile.school;
      };

      const updateTailRibbon = (ribbon: CurveRibbon, head: THREE.Vector2, time: number, delta: number, index: number) => {
        advanceRibbonChain(ribbon.points, head, delta, 0.34 + index * 0.025, 19, 5.8);
        const seconds = time * 0.001;
        ribbon.points.forEach((point, pointIndex) => {
          const fade = pointIndex / Math.max(1, ribbon.points.length - 1);
          ribbon.curvePoints[pointIndex].set(
            point.x,
            point.y + Math.sin(seconds * 1.18 + ribbon.phase + pointIndex * 0.7) * fade * 0.05,
            -0.22 - index * 0.018,
          );
        });
        for (let sampleIndex = 0; sampleIndex < ribbon.samples; sampleIndex += 1) {
          ribbon.curve.getPoint(sampleIndex / Math.max(1, ribbon.samples - 1), curveSample);
          const offset = sampleIndex * 3;
          ribbon.positions[offset] = curveSample.x;
          ribbon.positions[offset + 1] = curveSample.y;
          ribbon.positions[offset + 2] = curveSample.z;
        }
        ribbon.attribute.needsUpdate = true;
        ribbon.material.opacity = (lightTheme ? 0.48 : 0.44) * currentProfile.energy * (index === 1 ? 1 : 0.74);
      };

      const updateRay = (time: number, delta: number) => {
        const seconds = time * 0.001;
        rayWanderTimer -= delta;
        rayKickCooldown = Math.max(0, rayKickCooldown - delta);
        if (rayWanderTimer <= 0 || rayPosition.distanceTo(rayWanderTarget) < 0.72) {
          rayWanderTarget.set(
            (random() * 1.5 - 0.75) * viewHalfWidth,
            (random() * 1.42 - 0.71) * viewHalfHeight + currentProfile.rayBiasY,
          );
          rayWanderTimer = 3.2 + random() * 4.8;
        }

        rayForce.set(0, 0);
        rayDesired.copy(rayWanderTarget).sub(rayPosition);
        if (rayDesired.lengthSq() > 0.001) rayForce.add(rayDesired.normalize().multiplyScalar(0.38));
        sampleOceanFlow(rayPosition, seconds, flowForce);
        rayForce.x += flowForce.x * 0.22 * currentProfile.flow;
        rayForce.y += flowForce.y * 0.22 * currentProfile.flow;

        let nearestEntity: OceanEntity | undefined;
        let nearestDistance = Number.POSITIVE_INFINITY;
        activeEntities.forEach((entity) => {
          if (entity.level <= 0) return;
          const distance = Math.hypot(entity.x - rayPosition.x, entity.y - rayPosition.y);
          if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestEntity = entity;
          }
        });
        if (nearestEntity && nearestDistance < 4.6) {
          rayDesired.set(nearestEntity.x - rayPosition.x, nearestEntity.y - rayPosition.y);
          if (rayDesired.lengthSq() > 0.001) rayForce.add(rayDesired.normalize().multiplyScalar(0.12));
        }

        if (pointer.active) {
          pointerRepulsion(rayPosition, pointerWorld, balanced ? 2.7 : 3.2, 7 + pointer.speed * 15, repelForce);
          rayForce.x += repelForce.x;
          rayForce.y += repelForce.y;
        }

        addSafeZoneForce(rayPosition.x, rayPosition.y, rayForce, 1.65);
        const boundaryX = viewHalfWidth - 0.88;
        const boundaryY = viewHalfHeight - 0.8;
        if (Math.abs(rayPosition.x) > boundaryX) rayForce.x += -Math.sign(rayPosition.x) * 2.1;
        if (Math.abs(rayPosition.y) > boundaryY) rayForce.y += -Math.sign(rayPosition.y) * 2.1;

        rayVelocity.addScaledVector(rayForce, delta);
        rayVelocity.multiplyScalar(Math.exp(-0.84 * delta));
        rayVelocity.clampLength(0.18, 0.98 * currentProfile.raySpeed);
        rayPosition.addScaledVector(rayVelocity, delta);

        activeEntities.forEach((entity) => {
          const dx = entity.x - rayPosition.x;
          const dy = entity.y - rayPosition.y;
          const distance = Math.max(0.001, Math.hypot(dx, dy));
          const pushDistance = entity.radius + 0.78;
          if (distance >= pushDistance) return;
          const nx = dx / distance;
          const ny = dy / distance;
          const overlap = pushDistance - distance;
          entity.x += nx * overlap * 0.58;
          entity.y += ny * overlap * 0.58;
          rayPosition.x -= nx * overlap * 0.12;
          rayPosition.y -= ny * overlap * 0.12;
          const push = 0.92 + rayVelocity.length() * 0.66;
          entity.vx += nx * push / Math.max(0.28, entity.mass);
          entity.vy += ny * push / Math.max(0.28, entity.mass);
          entity.angularVelocity += (nx - ny) * 0.56;
          entity.hit = 1;
          rayVelocity.x -= nx * 0.12;
          rayVelocity.y -= ny * 0.12;
          if (rayKickCooldown <= 0) {
            queueFracture(entity, 0.88 + push * 0.22);
            rayKickCooldown = 0.48;
          }
        });

        const angle = Math.atan2(rayVelocity.y, rayVelocity.x);
        const wingPulse = Math.sin(seconds * 2.1) * 0.08;
        const baseScale = balanced ? 0.78 : 0.92;
        rayGroup.position.set(rayPosition.x, rayPosition.y, -0.24);
        rayGroup.rotation.z = angle;
        rayGroup.scale.set(baseScale * (1 + wingPulse * 0.22), baseScale * (1 + wingPulse), 1);
        rayFillMaterial.opacity = lightTheme ? 0.2 : 0.15;
        rayEdgeMaterial.opacity = lightTheme ? 0.66 : 0.58;

        rayTails.forEach((tail, index) => {
          const localX = -0.58 * baseScale;
          const localY = (index - 1) * 0.15 * baseScale;
          const head = rayDesired.set(
            rayPosition.x + Math.cos(angle) * localX - Math.sin(angle) * localY,
            rayPosition.y + Math.sin(angle) * localX + Math.cos(angle) * localY,
          );
          updateTailRibbon(tail, head, time, delta, index);
        });
      };

      const updateParticles = (time: number, delta: number) => {
        const seconds = time * 0.001;
        particles.forEach((particle, index) => {
          particle.vx *= Math.exp(-2.4 * delta);
          particle.vy *= Math.exp(-2.4 * delta);
          if (pulse > 0.01) {
            const dx = particle.x - pulseOrigin.x;
            const dy = particle.y - pulseOrigin.y;
            const distance = Math.max(0.2, Math.hypot(dx, dy));
            const strength = Math.max(0, 1 - distance / 5) * pulse * delta * 1.5;
            particle.vx += dx / distance * strength;
            particle.vy += dy / distance * strength;
          }
          sampleOceanFlow(particle, seconds + particle.phase, flowForce);
          particle.x += (flowForce.x * 0.035 + particle.vx) * delta;
          particle.y += (particle.speed * currentProfile.particle + flowForce.y * 0.025 + particle.vy) * delta;
          if (particle.y > viewHalfHeight + 0.3) {
            particle.y = -viewHalfHeight - 0.3;
            particle.x = random() * viewHalfWidth * 2 - viewHalfWidth;
          }
          if (particle.x < -viewHalfWidth - 0.4) particle.x = viewHalfWidth + 0.4;
          if (particle.x > viewHalfWidth + 0.4) particle.x = -viewHalfWidth - 0.4;
          const twinkle = 0.54 + Math.sin(seconds * 0.92 + particle.phase) * 0.34;
          const scale = particle.size * twinkle * (0.72 + currentProfile.particle * 0.28);
          sharedMatrix.makeScale(scale, scale, scale);
          sharedMatrix.setPosition(particle.x, particle.y, particle.z);
          particleMesh.setMatrixAt(index, sharedMatrix);
        });
        particleMesh.instanceMatrix.needsUpdate = true;
        particleMaterial.opacity = (balanced ? 0.15 : 0.2) * (0.72 + currentProfile.particle * 0.28);
      };

      const render = (time: number) => {
        if (destroyed || !pageVisible) return;
        const delta = Math.min(0.04, Math.max(0.001, (time - lastTime) / 1000));
        lastTime = time;
        const profileEase = Math.min(1, delta * 0.72);
        currentProfile.energy = lerp(currentProfile.energy, targetProfile.energy, profileEase);
        currentProfile.entity = lerp(currentProfile.entity, targetProfile.entity, profileEase);
        currentProfile.particle = lerp(currentProfile.particle, targetProfile.particle, profileEase);
        currentProfile.school = lerp(currentProfile.school, targetProfile.school, profileEase);
        currentProfile.raySpeed = lerp(currentProfile.raySpeed, targetProfile.raySpeed, profileEase);
        currentProfile.rayBiasY = lerp(currentProfile.rayBiasY, targetProfile.rayBiasY, profileEase);
        currentProfile.flow = lerp(currentProfile.flow, targetProfile.flow, profileEase);
        pointer.speed *= Math.exp(-3.2 * delta);
        pulse *= Math.exp(-2.8 * delta);
        updatePointerWorld();
        updateFlowRibbons(time);
        updateEntities(time, delta);
        updateSchool(time, delta);
        updateRay(time, delta);
        fractureQueue.forEach(fractureEntity);
        updateParticles(time, delta);
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
        rayVelocity.x += direction * 0.28;
        rayVelocity.y += 0.18;
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
      data-creature="space-ray"
      data-pointer-force="repel"
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
        <span className="ambient-static-shape ambient-static-shape-one"></span>
        <span className="ambient-static-shape ambient-static-shape-two"></span>
        <span className="ambient-static-shape ambient-static-shape-three"></span>
        <span className="ambient-static-ray">
          {Array.from({ length: 3 }, (_, index) => <i key={index}></i>)}
        </span>
        <span className="ambient-static-pixel ambient-static-pixel-one"></span>
        <span className="ambient-static-pixel ambient-static-pixel-two"></span>
        <span className="ambient-static-pixel ambient-static-pixel-three"></span>
      </div>
      <div className="ambient-postprocess"></div>
    </div>
  );
}
