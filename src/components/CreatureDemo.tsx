import {
  ArrowCounterClockwiseIcon,
  MoonIcon,
  PauseIcon,
  PlayIcon,
  SunIcon,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three/webgpu";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";
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
  deformTail: boolean;
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

function lerpAngle(current: number, target: number, amount: number) {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + delta * amount;
}

export default function CreatureDemo() {
  const hostRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);
  const themeRef = useRef<Theme>("dark");
  const resetVersionRef = useRef(0);
  const [paused, setPaused] = useState(false);
  const [theme, setTheme] = useState<Theme>("dark");
  const [backend, setBackend] = useState("initializing");
  const [status, setStatus] = useState<"loading" | "ready" | "fallback">("loading");

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    themeRef.current = theme;
  }, [theme]);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = host?.querySelector("canvas");
    if (!host || !(canvas instanceof HTMLCanvasElement)) return;

    let destroyed = false;
    let cleanupScene: (() => void) | undefined;

    const initialize = async () => {
      const resources = new Set<Disposable>();
      const register = <T extends Disposable>(resource: T) => {
        resources.add(resource);
        return resource;
      };
      const random = seededRandom(20260819);
      const mobile = window.matchMedia("(max-width: 767px)").matches;
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const lowPower = (navigator.hardwareConcurrency || 8) <= 4;
      const requestedBackend = new URLSearchParams(window.location.search).get("backend");
      if (requestedBackend === "static") {
        host.dataset.status = "fallback";
        host.dataset.backend = "static";
        setBackend("static");
        setStatus("fallback");
        return;
      }
      const webGPUAvailable = window.isSecureContext && "gpu" in navigator;
      const forceWebGL = requestedBackend === "webgl2" || !webGPUAvailable;
      const balanced = mobile || lowPower || forceWebGL;
      const renderer = new THREE.WebGPURenderer({
        canvas,
        antialias: !balanced,
        forceWebGL,
        powerPreference: balanced ? "low-power" : "high-performance",
      });

      try {
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, balanced ? 1.15 : 1.5));
        await renderer.init();
      } catch {
        renderer.dispose();
        if (!destroyed) {
          host.dataset.status = "fallback";
          setBackend("static");
          setStatus("fallback");
        }
        return;
      }

      if (destroyed) {
        renderer.dispose();
        return;
      }

      const backendFlags = renderer.backend as BackendFlags;
      const backendName = backendFlags.isWebGPUBackend ? "webgpu" : backendFlags.isWebGLBackend ? "webgl2" : "static";
      host.dataset.backend = backendName;
      setBackend(backendName);

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
      let lastTime = performance.now();
      let pageVisible = !document.hidden;
      let activeTheme = themeRef.current;
      let resetVersion = resetVersionRef.current;
      let pulse = 0;
      const pulseOrigin = new THREE.Vector2();

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
          const offset = (tentacleIndex - 1.5) * 0.22;
          const points = Array.from({ length: balanced ? 5 : 7 }, (_, pointIndex) => ({
            x: x + offset * scale,
            y: y - pointIndex * 0.18 * scale,
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
          world.add(line);
          return { points, positions, attribute, material, offset };
        });

        const jelly: DemoJelly = {
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
        };
        jellies.push(jelly);
      };

      createJelly(-3.8, 1.7, 0.72, 0.2);
      createJelly(3.35, -1.55, 0.58, 2.5);
      if (!balanced) createJelly(1.1, 2.65, 0.42, 4.1);

      let dolphinData: Awaited<ReturnType<SVGLoader["loadAsync"]>>;
      try {
        dolphinData = await new SVGLoader().loadAsync("/labs/twemoji-dolphin.svg");
      } catch {
        resources.forEach((resource) => resource.dispose());
        renderer.dispose();
        if (!destroyed) {
          host.dataset.status = "fallback";
          setBackend("static");
          setStatus("fallback");
        }
        return;
      }
      const dolphin = new THREE.Group();
      const dolphinParts: DolphinPart[] = [];
      const dolphinMaterials: THREE.MeshBasicMaterial[] = [];
      dolphinData.paths.forEach((path, pathIndex) => {
        const fill = path.userData?.style?.fill;
        if (fill === "none") return;
        const material = register(new THREE.MeshBasicMaterial({
          color: path.color,
          transparent: true,
          depthTest: false,
          depthWrite: false,
          side: THREE.DoubleSide,
        }));
        dolphinMaterials.push(material);
        SVGLoader.createShapes(path).forEach((shape) => {
          const geometry = register(new THREE.ShapeGeometry(shape, balanced ? 8 : 16));
          geometry.translate(-18, -18, 0);
          geometry.scale(3.05 / 36, -3.05 / 36, 1);
          const attribute = geometry.getAttribute("position") as THREE.BufferAttribute;
          attribute.setUsage(THREE.DynamicDrawUsage);
          dolphinParts.push({
            attribute,
            basePositions: new Float32Array(attribute.array as ArrayLike<number>),
            deformTail: pathIndex === 0,
          });
          const mesh = new THREE.Mesh(geometry, material);
          mesh.position.z = pathIndex * 0.004;
          mesh.renderOrder = 100 + pathIndex;
          dolphin.add(mesh);
        });
      });
      dolphin.frustumCulled = false;
      world.add(dolphin);

      const dolphinPosition = new THREE.Vector2(-1.8, 0.4);
      const dolphinVelocity = new THREE.Vector2(0.62, 0.08);
      const dolphinTarget = new THREE.Vector2(2.8, 0.7);
      const dolphinForce = new THREE.Vector2();
      const dolphinDesired = new THREE.Vector2();
      let dolphinAngle = 0;
      let wanderTimer = 0;

      const applyPalette = () => {
        activeTheme = themeRef.current;
        const dark = activeTheme === "dark";
        palette.accent.set(dark ? "#61bff0" : "#267aa8");
        palette.accentSoft.set(dark ? "#b6eafa" : "#73b8d7");
        palette.line.set(dark ? "#31566a" : "#8eb5c7");
        palette.jelly.set(dark ? "#3c8fb4" : "#4f9ebe");
        palette.page.set(dark ? "#071722" : "#f8faf8");
        renderer.setClearColor(palette.page, 1);
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

      const resetSimulation = () => {
        dolphinPosition.set(-Math.min(2.2, viewHalfWidth * 0.32), 0.35);
        dolphinVelocity.set(0.62, 0.08);
        dolphinTarget.set(Math.min(3, viewHalfWidth * 0.42), 0.7);
        wanderTimer = 0;
        jellies.forEach((jelly, index) => {
          jelly.x = [-3.8, 3.35, 1.1][index] || 0;
          jelly.y = [1.7, -1.55, 2.65][index] || 0;
          jelly.vx = 0.05 + index * 0.018;
          jelly.vy = 0.035;
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
          flowLine.material.opacity = activeTheme === "dark" ? 0.28 : 0.32;
        });
      };

      const updateDolphin = (time: number, delta: number) => {
        const seconds = time * 0.001;
        wanderTimer -= delta;
        if (wanderTimer <= 0 || dolphinPosition.distanceTo(dolphinTarget) < 0.8) {
          dolphinTarget.set(
            (random() * 1.35 - 0.675) * viewHalfWidth,
            (random() * 1.32 - 0.66) * viewHalfHeight,
          );
          wanderTimer = 3.4 + random() * 4.2;
        }

        dolphinForce.set(0, 0);
        dolphinDesired.copy(dolphinTarget).sub(dolphinPosition);
        if (dolphinDesired.lengthSq() > 0.001) dolphinForce.add(dolphinDesired.normalize().multiplyScalar(0.42));
        sampleOceanFlow(dolphinPosition, seconds, flowForce);
        dolphinForce.x += flowForce.x * 0.2;
        dolphinForce.y += flowForce.y * 0.2;
        if (pointer.active) {
          pointerRepulsion(dolphinPosition, pointerWorld, mobile ? 2.5 : 3.1, 6.2 + pointer.speed * 13, repelForce);
          dolphinForce.x += repelForce.x;
          dolphinForce.y += repelForce.y;
        }

        const marginX = Math.max(1.15, Math.min(1.5, viewHalfWidth * 0.2));
        const boundX = Math.max(0.6, viewHalfWidth - marginX);
        const boundY = viewHalfHeight - 1.25;
        if (Math.abs(dolphinPosition.x) > boundX) dolphinForce.x += -Math.sign(dolphinPosition.x) * 2.4;
        if (Math.abs(dolphinPosition.y) > boundY) dolphinForce.y += -Math.sign(dolphinPosition.y) * 2.4;

        dolphinVelocity.addScaledVector(dolphinForce, delta);
        dolphinVelocity.multiplyScalar(Math.exp(-0.72 * delta));
        dolphinVelocity.clampLength(0.24, mobile ? 0.76 : 0.92);
        dolphinPosition.addScaledVector(dolphinVelocity, delta);
        const bankTarget = THREE.MathUtils.clamp(
          Math.atan2(dolphinVelocity.y, Math.abs(dolphinVelocity.x) + 0.18),
          -0.48,
          0.48,
        );
        dolphinAngle = lerpAngle(dolphinAngle, bankTarget, Math.min(1, delta * 2.2));

        const tailAmplitude = 0.16 + dolphinVelocity.length() * 0.09;
        dolphinParts.forEach((part) => {
          if (!part.deformTail) return;
          const positions = part.attribute.array as Float32Array;
          for (let index = 0; index < positions.length; index += 3) {
            const baseX = part.basePositions[index];
            const baseY = part.basePositions[index + 1];
            const verticalWeight = clamp01((-baseY - 0.48) / 0.82);
            const horizontalWeight = 1 - clamp01((Math.abs(baseX) - 0.66) / 0.42);
            const weight = verticalWeight * horizontalWeight;
            const bend = Math.sin(seconds * 4.1 + weight * 1.45) * tailAmplitude * weight * weight;
            const pivotX = 0.02;
            const pivotY = -0.52;
            const dx = baseX - pivotX;
            const dy = baseY - pivotY;
            const cosine = Math.cos(bend);
            const sine = Math.sin(bend);
            positions[index] = pivotX + dx * cosine - dy * sine;
            positions[index + 1] = pivotY + dx * sine + dy * cosine;
          }
          part.attribute.needsUpdate = true;
        });
        dolphin.position.set(dolphinPosition.x, dolphinPosition.y, -0.25);
        dolphin.rotation.z = dolphinAngle;
        const breathe = 1 + Math.sin(seconds * 1.7) * 0.018;
        const baseScale = mobile ? 0.78 : 0.92;
        const facing = dolphinVelocity.x >= 0 ? -1 : 1;
        dolphin.scale.set(facing * baseScale * breathe, baseScale / breathe, 1);
        dolphinMaterials.forEach((material) => {
          material.opacity = activeTheme === "dark" ? 0.84 : 0.78;
        });
      };

      const updateJellies = (time: number, delta: number) => {
        const seconds = time * 0.001;
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
          if (jelly.x < -viewHalfWidth - margin) jelly.x = viewHalfWidth + margin;
          if (jelly.x > viewHalfWidth + margin) jelly.x = -viewHalfWidth - margin;
          if (jelly.y > viewHalfHeight + margin) jelly.y = -viewHalfHeight - margin;
          if (jelly.y < -viewHalfHeight - margin) jelly.y = viewHalfHeight + margin;

          const breath = Math.sin(seconds * 1.45 + jelly.phase);
          const scaleX = jelly.scale * (1 + breath * 0.08);
          const scaleY = jelly.scale * (1 - breath * 0.12);
          jelly.group.position.set(jelly.x, jelly.y, -0.82);
          jelly.group.rotation.z = Math.sin(seconds * 0.4 + jelly.phase) * 0.09;
          jelly.group.scale.set(scaleX, scaleY, 1);
          jelly.fill.opacity = activeTheme === "dark" ? 0.38 : 0.32;
          jelly.edge.opacity = activeTheme === "dark" ? 0.72 : 0.64;

          jelly.tentacles.forEach((tentacle, tentacleIndex) => {
            const anchor = {
              x: jelly.x + tentacle.offset * scaleX,
              y: jelly.y - 0.03 * scaleY,
            };
            advanceRibbonChain(tentacle.points, anchor, delta, 0.17 * jelly.scale, 18, 5.6);
            tentacle.points.forEach((point, pointIndex) => {
              const offset = pointIndex * 3;
              const trail = pointIndex / Math.max(1, tentacle.points.length - 1);
              tentacle.positions[offset] = point.x + Math.sin(seconds * 1.1 + jelly.phase + tentacleIndex + pointIndex * 0.5) * trail * 0.025;
              tentacle.positions[offset + 1] = point.y;
              tentacle.positions[offset + 2] = -0.84;
            });
            tentacle.attribute.needsUpdate = true;
            tentacle.material.opacity = (activeTheme === "dark" ? 0.62 : 0.54) * (0.75 + jelly.scale * 0.25);
          });
        });
      };

      const updateParticles = (time: number, delta: number) => {
        const seconds = time * 0.001;
        particles.forEach((particle, index) => {
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
          const dolphinDistance = Math.max(0.25, Math.hypot(particle.x - dolphinPosition.x, particle.y - dolphinPosition.y));
          if (dolphinDistance < 1.6) {
            const wake = (1 - dolphinDistance / 1.6) * delta * 0.38;
            particle.vx -= dolphinVelocity.x * wake;
            particle.vy -= dolphinVelocity.y * wake;
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
        particleMaterial.opacity = activeTheme === "dark" ? 0.48 : 0.4;
      };

      const render = (time: number) => {
        if (destroyed || !pageVisible) return;
        const delta = Math.min(0.04, Math.max(0.001, (time - lastTime) / 1000));
        lastTime = time;
        if (activeTheme !== themeRef.current) applyPalette();
        if (resetVersion !== resetVersionRef.current) {
          resetVersion = resetVersionRef.current;
          resetSimulation();
        }
        pointer.speed *= Math.exp(-3.2 * delta);
        pulse *= Math.exp(-2.8 * delta);
        updatePointerWorld();
        if (!pausedRef.current && !reduceMotion) {
          updateFlowLines(time);
          updateDolphin(time, delta);
          updateJellies(time, delta);
          updateParticles(time, delta);
        }
        renderer.render(scene, camera);
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
        const elapsed = Math.max(8, now - pointer.updatedAt);
        const distance = Math.hypot(event.clientX - pointer.previousX, event.clientY - pointer.previousY);
        pointer.speed = pointer.active ? Math.min(2.4, distance / elapsed) : 0;
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
        pulse = 1;
      };

      const handleVisibility = () => {
        pageVisible = !document.hidden;
        ensureRunning();
      };

      const resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(host);
      window.addEventListener("pointermove", handlePointerMove, { passive: true });
      window.addEventListener("pointerdown", handlePointerDown, { passive: true });
      document.documentElement.addEventListener("pointerleave", handlePointerLeave);
      document.addEventListener("visibilitychange", handleVisibility);

      applyPalette();
      resize();
      resetSimulation();
      host.dataset.status = "ready";
      setStatus("ready");
      ensureRunning();

      cleanupScene = () => {
        window.cancelAnimationFrame(frame);
        resizeObserver.disconnect();
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerdown", handlePointerDown);
        document.documentElement.removeEventListener("pointerleave", handlePointerLeave);
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

  const togglePaused = () => setPaused((value) => !value);
  const toggleTheme = () => setTheme((value) => value === "dark" ? "light" : "dark");
  const reset = () => {
    resetVersionRef.current += 1;
    setPaused(false);
  };

  return (
    <main className="creature-demo" data-theme={theme} data-status={status}>
      <div ref={hostRef} className="creature-demo-world" data-status={status} data-backend={backend}>
        <canvas aria-hidden="true" />
        <img className="creature-demo-static" src="/labs/twemoji-dolphin.svg" alt="" />
        <div className="creature-demo-post" aria-hidden="true"></div>
      </div>

      <header className="creature-demo-header">
        <p>Animation prototype 01</p>
        <h1>Drift Companions</h1>
      </header>

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

      <footer className="creature-demo-footer">
        <div className="creature-demo-status">
          <i data-ready={status === "ready" || undefined}></i>
          <span>{backend}</span>
          <span>{paused ? "paused" : status}</span>
        </div>
        <a href="https://github.com/jdecked/twemoji/blob/main/assets/svg/1f42c.svg" target="_blank" rel="noreferrer">
          Dolphin: Twemoji / CC BY 4.0
        </a>
      </footer>
    </main>
  );
}
