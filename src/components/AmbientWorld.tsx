import { useEffect, useRef } from "react";
import * as THREE from "three/webgpu";
import {
  canFracture,
  fracturePattern,
  pointerRepulsion,
  resolveCircleCollision,
  type CollisionResult,
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
  creatureSpeed: number;
  creatureBiasY: number;
};

type AmbientEntity = SolidBodyState & {
  id: number;
  kind: SolidKind;
  level: number;
  group: THREE.Group;
  fill: THREE.MeshBasicMaterial;
  edge: THREE.LineBasicMaterial;
  shadow: THREE.MeshBasicMaterial;
  alive: boolean;
  hit: number;
  fractureCooldown: number;
  phase: number;
  depth: number;
};

type PixelState = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  size: number;
  phase: number;
  speed: number;
};

type SafeZone = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

type FractureRequest = {
  entity: AmbientEntity;
  impact: number;
};

const profiles: Record<string, SceneProfile> = {
  top: { energy: 1, entity: 0.92, particle: 0.86, creatureSpeed: 0.9, creatureBiasY: 0.12 },
  about: { energy: 0.7, entity: 0.72, particle: 0.52, creatureSpeed: 0.68, creatureBiasY: -0.08 },
  projects: { energy: 1.12, entity: 1.18, particle: 1.08, creatureSpeed: 1.14, creatureBiasY: 0.04 },
  articles: { energy: 0.56, entity: 0.62, particle: 0.38, creatureSpeed: 0.58, creatureBiasY: -0.2 },
  life: { energy: 0.9, entity: 0.88, particle: 0.84, creatureSpeed: 0.92, creatureBiasY: 0.18 },
  contact: { energy: 0.62, entity: 0.66, particle: 0.44, creatureSpeed: 0.62, creatureBiasY: 0 },
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
    host.dataset.creature = "arthropod";
    host.dataset.pointerForce = "repel";
    host.dataset.entityCount = "0";
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
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, balanced ? 1.15 : 1.5));
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

      const particleCount = balanced ? 34 : 72;
      const particleGeometry = register(new THREE.BoxGeometry(0.055, 0.055, 0.035));
      const particleMaterial = register(new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: balanced ? 0.34 : 0.46,
        depthWrite: false,
      }));
      const particleMesh = new THREE.InstancedMesh(particleGeometry, particleMaterial, particleCount);
      particleMesh.frustumCulled = false;
      world.add(particleMesh);
      const sharedMatrix = new THREE.Matrix4();
      const particles: PixelState[] = Array.from({ length: particleCount }, () => ({
        x: random() * 12 - 6,
        y: random() * 10 - 5,
        z: -2.4 - random() * 3.2,
        vx: 0,
        vy: 0,
        size: 0.55 + random() * 1.35,
        phase: random() * Math.PI * 2,
        speed: 0.08 + random() * 0.22,
      }));

      const entities: AmbientEntity[] = [];
      const activeEntities: AmbientEntity[] = [];
      const fractureQueue: FractureRequest[] = [];
      const queuedForFracture = new Set<number>();
      const entityLimit = balanced ? 10 : 14;
      const collisionResult: CollisionResult = { collided: false, impact: 0, nx: 0, ny: 0 };
      const repelForce: Vector2Like = { x: 0, y: 0 };

      const createEntityGeometry = (kind: SolidKind, radius: number) => {
        if (kind === "circle") return register(new THREE.CircleGeometry(radius, 16));
        if (kind === "triangle") return register(new THREE.CircleGeometry(radius, 3));
        return register(new THREE.BoxGeometry(radius * 1.72, radius * 1.08, 0.045));
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
        const fill = register(new THREE.MeshBasicMaterial({
          transparent: true,
          side: THREE.DoubleSide,
          depthWrite: false,
        }));
        const mesh = new THREE.Mesh(geometry, fill);
        const edgeGeometry = register(new THREE.EdgesGeometry(geometry));
        const edge = register(new THREE.LineBasicMaterial({ transparent: true, depthWrite: false }));
        const edges = new THREE.LineSegments(edgeGeometry, edge);
        const shadowGeometry = register(new THREE.CircleGeometry(radius, 16));
        const shadow = register(new THREE.MeshBasicMaterial({ color: 0x0b1720, transparent: true, depthWrite: false }));
        const shadowMesh = new THREE.Mesh(shadowGeometry, shadow);
        shadowMesh.scale.set(1.2, 0.34, 1);
        shadowMesh.position.set(0.08, -radius * 0.18, -0.08);
        const group = new THREE.Group();
        group.add(shadowMesh, mesh, edges);
        world.add(group);

        const entity: AmbientEntity = {
          id: nextEntityId,
          kind,
          level,
          group,
          fill,
          edge,
          shadow,
          alive: true,
          hit: 0,
          fractureCooldown: 1.6 + random() * 1.8,
          phase: random() * Math.PI * 2,
          depth: -0.9 - random() * 1.1,
          x,
          y,
          vx,
          vy,
          radius,
          mass: Math.max(0.22, radius * radius * (kind === "rect" ? 1.3 : 1)),
          angularVelocity: (random() - 0.5) * 0.25,
        };
        nextEntityId += 1;
        entities.push(entity);
        return entity;
      };

      const initialEntityCount = balanced ? 6 : 9;
      const kinds: SolidKind[] = ["rect", "circle", "triangle"];
      for (let index = 0; index < initialEntityCount; index += 1) {
        const radius = 0.42 + random() * (balanced ? 0.38 : 0.56);
        createEntity(
          kinds[index % kinds.length],
          index < 3 ? 2 : 1,
          radius,
          (random() * 1.72 - 0.86) * viewHalfWidth,
          (random() * 1.64 - 0.82) * viewHalfHeight,
          (random() - 0.5) * 0.16,
          (random() - 0.5) * 0.16,
        );
      }
      host.dataset.entityCount = String(initialEntityCount);

      const creatureGroup = new THREE.Group();
      const creatureBodyGeometry = register(new THREE.CircleGeometry(0.55, 14));
      const creatureHeadGeometry = register(new THREE.CircleGeometry(0.24, 10));
      const creatureBodyMaterial = register(new THREE.MeshBasicMaterial({
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
      }));
      const creatureBody = new THREE.Mesh(creatureBodyGeometry, creatureBodyMaterial);
      creatureBody.scale.set(1.18, 0.74, 1);
      const creatureHead = new THREE.Mesh(creatureHeadGeometry, creatureBodyMaterial);
      creatureHead.position.set(0.56, 0, 0.015);
      const creatureEdgeMaterial = register(new THREE.LineBasicMaterial({ transparent: true, depthWrite: false }));
      const creatureBodyEdges = new THREE.LineSegments(register(new THREE.EdgesGeometry(creatureBodyGeometry)), creatureEdgeMaterial);
      creatureBodyEdges.scale.copy(creatureBody.scale);
      const creatureHeadEdges = new THREE.LineSegments(register(new THREE.EdgesGeometry(creatureHeadGeometry)), creatureEdgeMaterial);
      creatureHeadEdges.position.copy(creatureHead.position);

      const legArray = new Float32Array(8 * 4 * 3);
      const legGeometry = register(new THREE.BufferGeometry());
      const legAttribute = new THREE.BufferAttribute(legArray, 3);
      legAttribute.setUsage(THREE.DynamicDrawUsage);
      legGeometry.setAttribute("position", legAttribute);
      const legMaterial = register(new THREE.LineBasicMaterial({ transparent: true, depthWrite: false }));
      const creatureLegs = new THREE.LineSegments(legGeometry, legMaterial);
      creatureLegs.position.z = -0.015;

      const footGeometry = register(new THREE.BoxGeometry(0.065, 0.065, 0.025));
      const footMaterial = register(new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));
      const creatureFeet = new THREE.InstancedMesh(footGeometry, footMaterial, 8);
      creatureFeet.frustumCulled = false;
      creatureFeet.position.z = 0.02;

      const creatureShadowMaterial = register(new THREE.MeshBasicMaterial({ color: 0x0b1720, transparent: true, depthWrite: false }));
      const creatureShadow = new THREE.Mesh(register(new THREE.CircleGeometry(0.66, 16)), creatureShadowMaterial);
      creatureShadow.scale.set(1.35, 0.36, 1);
      creatureShadow.position.set(0.08, -0.14, -0.08);

      creatureGroup.add(creatureShadow, creatureLegs, creatureFeet, creatureBody, creatureBodyEdges, creatureHead, creatureHeadEdges);
      creatureGroup.scale.setScalar(balanced ? 0.82 : 1);
      world.add(creatureGroup);

      const creaturePosition = new THREE.Vector2(-2.8, 0.8);
      const creatureVelocity = new THREE.Vector2(0.58, 0.12);
      const creatureForce = new THREE.Vector2();
      const creatureWanderTarget = new THREE.Vector2(2.4, 0.6);
      const creatureDesired = new THREE.Vector2();
      const obstacleForce = new THREE.Vector2();
      const pointerWorld = new THREE.Vector2();
      let creatureWanderTimer = 0;
      let creatureKickCooldown = 0;

      const applyTheme = () => {
        const styles = getComputedStyle(document.documentElement);
        lightTheme = document.documentElement.dataset.theme !== "dark";
        palette.accent.set(styles.getPropertyValue("--accent").trim() || "#53a3f2");
        palette.accentStrong.set(styles.getPropertyValue("--accent-strong").trim() || "#257bc6");
        palette.line.set(styles.getPropertyValue("--line-strong").trim() || "#6f8ca3");
        palette.surface.set(styles.getPropertyValue("--surface-strong").trim() || "#d7e6f2");
        palette.ink.set(styles.getPropertyValue("--ink").trim() || "#101820");
        particleMaterial.color.copy(palette.accent);
        creatureBodyMaterial.color.copy(lightTheme ? palette.accent : palette.surface);
        creatureEdgeMaterial.color.copy(lightTheme ? palette.accentStrong : palette.accent);
        legMaterial.color.copy(lightTheme ? palette.line : palette.accent);
        footMaterial.color.copy(palette.accentStrong);
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

      const queueFracture = (entity: AmbientEntity, impact: number) => {
        if (!entity.alive || entity.fractureCooldown > 0 || queuedForFracture.has(entity.id)) return;
        if (!canFracture(entity.level, impact, activeEntities.length, entityLimit)) return;
        queuedForFracture.add(entity.id);
        fractureQueue.push({ entity, impact });
      };

      const updateEntityCount = () => {
        let count = 0;
        entities.forEach((entity) => {
          if (entity.alive) count += 1;
        });
        host.dataset.entityCount = String(count);
        return count;
      };

      const fractureEntity = (request: FractureRequest) => {
        const parent = request.entity;
        if (!parent.alive) return;
        const pattern = fracturePattern(parent.kind, parent.level);
        const activeCount = updateEntityCount();
        const available = entityLimit - (activeCount - 1);
        const pieces = pattern.slice(0, Math.max(0, available));
        if (pieces.length < 2) return;

        parent.alive = false;
        world.remove(parent.group);
        pieces.forEach((piece, index) => {
          const radius = Math.max(0.16, parent.radius * piece.radiusRatio);
          const tangent = index % 2 === 0 ? -0.16 : 0.16;
          const child = createEntity(
            piece.kind,
            piece.level,
            radius,
            parent.x + piece.direction.x * parent.radius * 0.46,
            parent.y + piece.direction.y * parent.radius * 0.46,
            parent.vx + piece.direction.x * (0.62 + request.impact * 0.28) - piece.direction.y * tangent,
            parent.vy + piece.direction.y * (0.62 + request.impact * 0.28) + piece.direction.x * tangent,
          );
          child.angularVelocity += (index - pieces.length * 0.5) * 0.34;
          child.hit = 1;
          child.fractureCooldown = 1.8;
          child.fill.color.copy(palette.surface);
          child.edge.color.copy(lightTheme ? palette.line : palette.accent);
        });
        fractureCount += 1;
        host.dataset.fractureCount = String(fractureCount);
        pulseOrigin.set(parent.x, parent.y);
        pulse = Math.max(pulse, 0.78);
        updateEntityCount();
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
          entity.hit *= Math.exp(-4.4 * delta);

          if (pointer.active) {
            pointerRepulsion(entity, pointerWorld, 2.2 + entity.radius, 5.2 + pointer.speed * 12, repelForce);
            entity.vx += repelForce.x * delta;
            entity.vy += repelForce.y * delta;
            if (Math.abs(repelForce.x) + Math.abs(repelForce.y) > 0.18) entity.hit = Math.max(entity.hit, 0.38);
          }

          if (pulse > 0.01) {
            const dx = entity.x - pulseOrigin.x;
            const dy = entity.y - pulseOrigin.y;
            const distance = Math.max(0.2, Math.hypot(dx, dy));
            const strength = Math.max(0, 1 - distance / 4.6) * pulse * delta * 2.1;
            entity.vx += dx / distance * strength;
            entity.vy += dy / distance * strength;
          }

          entity.vx += Math.sin(seconds * 0.17 + entity.phase) * 0.035 * delta * currentProfile.entity;
          entity.vy += Math.cos(seconds * 0.13 + entity.phase) * 0.028 * delta * currentProfile.entity;
          const zoneForce = creatureForce.set(0, 0);
          addSafeZoneForce(entity.x, entity.y, zoneForce, 0.72);
          entity.vx += zoneForce.x * delta;
          entity.vy += zoneForce.y * delta;

          entity.vx *= Math.exp(-0.34 * delta);
          entity.vy *= Math.exp(-0.34 * delta);
          entity.angularVelocity *= Math.exp(-0.22 * delta);
          entity.x += entity.vx * delta * currentProfile.entity;
          entity.y += entity.vy * delta * currentProfile.entity;
          entity.group.rotation.z += entity.angularVelocity * delta;

          const boundaryX = viewHalfWidth - entity.radius * 0.7;
          const boundaryY = viewHalfHeight - entity.radius * 0.7;
          if (entity.x < -boundaryX || entity.x > boundaryX) {
            entity.x = Math.max(-boundaryX, Math.min(boundaryX, entity.x));
            entity.vx *= -0.78;
            entity.angularVelocity += entity.vy * 0.08;
            entity.hit = Math.max(entity.hit, 0.52);
          }
          if (entity.y < -boundaryY || entity.y > boundaryY) {
            entity.y = Math.max(-boundaryY, Math.min(boundaryY, entity.y));
            entity.vy *= -0.78;
            entity.angularVelocity -= entity.vx * 0.08;
            entity.hit = Math.max(entity.hit, 0.52);
          }

          const breathe = 1 + Math.sin(seconds * 0.48 + entity.phase) * 0.025 + entity.hit * 0.08;
          entity.group.position.set(entity.x, entity.y, entity.depth);
          entity.group.scale.setScalar(breathe);
          entity.fill.color.copy(palette.surface).lerp(palette.accent, entity.hit * 0.42);
          entity.edge.color.copy(lightTheme ? palette.line : palette.accent).lerp(palette.accentStrong, entity.hit * 0.7);
          entity.fill.opacity = (lightTheme ? 0.36 : 0.13) + entity.hit * 0.12;
          entity.edge.opacity = (lightTheme ? 0.72 : 0.58) * currentProfile.entity + entity.hit * 0.18;
          entity.shadow.opacity = lightTheme ? 0.075 : 0.12;
        });

        for (let firstIndex = 0; firstIndex < activeEntities.length; firstIndex += 1) {
          for (let secondIndex = firstIndex + 1; secondIndex < activeEntities.length; secondIndex += 1) {
            const first = activeEntities[firstIndex];
            const second = activeEntities[secondIndex];
            const result = resolveCircleCollision(first, second, 0.74, collisionResult);
            if (!result.collided) continue;
            const response = Math.min(1, 0.25 + result.impact * 0.55);
            first.hit = Math.max(first.hit, response);
            second.hit = Math.max(second.hit, response);
            first.angularVelocity -= result.ny * result.impact * 0.15;
            second.angularVelocity += result.nx * result.impact * 0.15;
            if (result.impact >= 0.82) queueFracture(first.level >= second.level ? first : second, result.impact);
          }
        }
      };

      const updateCreatureLegs = (time: number, speed: number) => {
        const seconds = time * 0.001;
        const gaitSpeed = 3.2 + speed * 5.2;
        const bodyXs = [-0.34, -0.12, 0.12, 0.34];
        let offset = 0;
        let footIndex = 0;
        for (let sideIndex = 0; sideIndex < 2; sideIndex += 1) {
          const side = sideIndex === 0 ? -1 : 1;
          for (let legIndex = 0; legIndex < 4; legIndex += 1) {
            const phase = seconds * gaitSpeed + legIndex * 1.42 + sideIndex * Math.PI;
            const hipX = bodyXs[legIndex];
            const hipY = side * (0.26 + Math.abs(legIndex - 1.5) * 0.025);
            const jointX = hipX + (legIndex - 1.5) * 0.055 + Math.cos(phase) * 0.035;
            const jointY = side * (0.54 + Math.sin(phase) * 0.035);
            const footX = hipX + (legIndex - 1.5) * 0.12 + Math.cos(phase) * (0.08 + speed * 0.045);
            const footY = side * (0.82 + Math.sin(phase) * (0.05 + speed * 0.025));

            legArray[offset] = hipX;
            legArray[offset + 1] = hipY;
            legArray[offset + 2] = 0;
            legArray[offset + 3] = jointX;
            legArray[offset + 4] = jointY;
            legArray[offset + 5] = 0;
            legArray[offset + 6] = jointX;
            legArray[offset + 7] = jointY;
            legArray[offset + 8] = 0;
            legArray[offset + 9] = footX;
            legArray[offset + 10] = footY;
            legArray[offset + 11] = 0;
            offset += 12;

            sharedMatrix.makeScale(0.72, 0.72, 0.72);
            sharedMatrix.setPosition(footX, footY, 0.01);
            creatureFeet.setMatrixAt(footIndex, sharedMatrix);
            footIndex += 1;
          }
        }
        legAttribute.needsUpdate = true;
        creatureFeet.instanceMatrix.needsUpdate = true;
      };

      const updateCreature = (time: number, delta: number) => {
        const seconds = time * 0.001;
        creatureWanderTimer -= delta;
        creatureKickCooldown = Math.max(0, creatureKickCooldown - delta);
        if (creatureWanderTimer <= 0 || creaturePosition.distanceTo(creatureWanderTarget) < 0.72) {
          creatureWanderTarget.set(
            (random() * 1.5 - 0.75) * viewHalfWidth,
            (random() * 1.45 - 0.725) * viewHalfHeight + currentProfile.creatureBiasY,
          );
          creatureWanderTimer = 2.6 + random() * 3.8;
        }

        creatureForce.set(0, 0);
        creatureDesired.copy(creatureWanderTarget).sub(creaturePosition);
        if (creatureDesired.lengthSq() > 0.001) creatureForce.add(creatureDesired.normalize().multiplyScalar(0.48));

        let nearestEntity: AmbientEntity | undefined;
        let nearestDistance = Number.POSITIVE_INFINITY;
        activeEntities.forEach((entity) => {
          if (entity.level <= 0) return;
          const distance = Math.hypot(entity.x - creaturePosition.x, entity.y - creaturePosition.y);
          if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestEntity = entity;
          }
        });
        if (nearestEntity && nearestDistance < 4.8) {
          creatureDesired.set(nearestEntity.x - creaturePosition.x, nearestEntity.y - creaturePosition.y);
          if (creatureDesired.lengthSq() > 0.001) creatureForce.add(creatureDesired.normalize().multiplyScalar(0.2));
        }

        if (pointer.active) {
          pointerRepulsion(creaturePosition, pointerWorld, balanced ? 2.8 : 3.4, 7.2 + pointer.speed * 16, repelForce);
          creatureForce.x += repelForce.x;
          creatureForce.y += repelForce.y;
        }

        addSafeZoneForce(creaturePosition.x, creaturePosition.y, creatureForce, 1.9);
        const boundaryX = viewHalfWidth - 0.72;
        const boundaryY = viewHalfHeight - 0.7;
        if (Math.abs(creaturePosition.x) > boundaryX) creatureForce.x += -Math.sign(creaturePosition.x) * 2.4;
        if (Math.abs(creaturePosition.y) > boundaryY) creatureForce.y += -Math.sign(creaturePosition.y) * 2.4;

        creatureVelocity.addScaledVector(creatureForce, delta);
        creatureVelocity.multiplyScalar(Math.exp(-0.92 * delta));
        creatureVelocity.clampLength(0.22, 1.18 * currentProfile.creatureSpeed);
        creaturePosition.addScaledVector(creatureVelocity, delta);

        activeEntities.forEach((entity) => {
          const dx = entity.x - creaturePosition.x;
          const dy = entity.y - creaturePosition.y;
          const distance = Math.max(0.001, Math.hypot(dx, dy));
          const kickDistance = entity.radius + 0.72;
          if (distance >= kickDistance) return;
          const nx = dx / distance;
          const ny = dy / distance;
          const overlap = kickDistance - distance;
          entity.x += nx * overlap * 0.62;
          entity.y += ny * overlap * 0.62;
          creaturePosition.x -= nx * overlap * 0.16;
          creaturePosition.y -= ny * overlap * 0.16;
          const kick = 1.1 + creatureVelocity.length() * 0.72;
          entity.vx += nx * kick / Math.max(0.28, entity.mass);
          entity.vy += ny * kick / Math.max(0.28, entity.mass);
          entity.angularVelocity += (nx - ny) * 0.74;
          entity.hit = 1;
          creatureVelocity.x -= nx * 0.16;
          creatureVelocity.y -= ny * 0.16;
          if (creatureKickCooldown <= 0) {
            queueFracture(entity, 0.9 + kick * 0.22);
            creatureKickCooldown = 0.42;
          }
        });

        const speed = creatureVelocity.length();
        creatureGroup.position.set(creaturePosition.x, creaturePosition.y, -0.28);
        creatureGroup.rotation.z = Math.atan2(creatureVelocity.y, creatureVelocity.x);
        const bodyPulse = 1 + Math.sin(seconds * 3.2) * 0.025 + Math.min(0.04, speed * 0.025);
        creatureBody.scale.set(1.18 * bodyPulse, 0.74 / bodyPulse, 1);
        creatureBodyEdges.scale.copy(creatureBody.scale);
        creatureBodyMaterial.opacity = lightTheme ? 0.3 : 0.17;
        creatureEdgeMaterial.opacity = lightTheme ? 0.9 : 0.78;
        legMaterial.opacity = lightTheme ? 0.78 : 0.7;
        footMaterial.opacity = lightTheme ? 0.84 : 0.74;
        creatureShadowMaterial.opacity = lightTheme ? 0.085 : 0.14;
        updateCreatureLegs(time, speed);
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
            const strength = Math.max(0, 1 - distance / 5) * pulse * delta * 1.8;
            particle.vx += dx / distance * strength;
            particle.vy += dy / distance * strength;
          }
          particle.x += (Math.sin(seconds * 0.26 + particle.phase) * 0.06 + particle.vx) * delta;
          particle.y += (particle.speed * currentProfile.particle + particle.vy) * delta;
          if (particle.y > viewHalfHeight + 0.3) {
            particle.y = -viewHalfHeight - 0.3;
            particle.x = random() * viewHalfWidth * 2 - viewHalfWidth;
          }
          if (particle.x < -viewHalfWidth - 0.4) particle.x = viewHalfWidth + 0.4;
          if (particle.x > viewHalfWidth + 0.4) particle.x = -viewHalfWidth - 0.4;
          const twinkle = 0.62 + Math.sin(seconds * 1.2 + particle.phase) * 0.38;
          const scale = particle.size * twinkle * (0.72 + currentProfile.particle * 0.28);
          sharedMatrix.makeScale(scale, scale, scale);
          sharedMatrix.setPosition(particle.x, particle.y, particle.z);
          particleMesh.setMatrixAt(index, sharedMatrix);
        });
        particleMesh.instanceMatrix.needsUpdate = true;
        particleMaterial.opacity = (balanced ? 0.28 : 0.4) * (0.72 + currentProfile.particle * 0.28);
      };

      const render = (time: number) => {
        if (destroyed || !pageVisible) return;
        const delta = Math.min(0.04, Math.max(0.001, (time - lastTime) / 1000));
        lastTime = time;
        const profileEase = Math.min(1, delta * 0.72);
        currentProfile.energy = lerp(currentProfile.energy, targetProfile.energy, profileEase);
        currentProfile.entity = lerp(currentProfile.entity, targetProfile.entity, profileEase);
        currentProfile.particle = lerp(currentProfile.particle, targetProfile.particle, profileEase);
        currentProfile.creatureSpeed = lerp(currentProfile.creatureSpeed, targetProfile.creatureSpeed, profileEase);
        currentProfile.creatureBiasY = lerp(currentProfile.creatureBiasY, targetProfile.creatureBiasY, profileEase);
        pointer.speed *= Math.exp(-3.2 * delta);
        pulse *= Math.exp(-2.8 * delta);
        updatePointerWorld();
        updateEntities(time, delta);
        updateCreature(time, delta);
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
        pulse = Math.max(pulse, 0.54);
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
        creatureVelocity.x += direction * 0.34;
        creatureVelocity.y += 0.22;
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
      data-creature="arthropod"
      data-pointer-force="repel"
      data-entity-count="0"
      data-fracture-count="0"
      aria-hidden="true"
    >
      <canvas />
      <div className="ambient-static-fallback">
        <span className="ambient-static-grid"></span>
        <span className="ambient-static-shape ambient-static-shape-one"></span>
        <span className="ambient-static-shape ambient-static-shape-two"></span>
        <span className="ambient-static-shape ambient-static-shape-three"></span>
        <span className="ambient-static-creature">
          {Array.from({ length: 8 }, (_, index) => <i key={index}></i>)}
        </span>
        <span className="ambient-static-pixel ambient-static-pixel-one"></span>
        <span className="ambient-static-pixel ambient-static-pixel-two"></span>
        <span className="ambient-static-pixel ambient-static-pixel-three"></span>
      </div>
      <div className="ambient-postprocess"></div>
    </div>
  );
}
