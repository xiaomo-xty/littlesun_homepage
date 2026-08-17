import { useEffect, useRef } from "react";
import * as THREE from "three/webgpu";

type Disposable = { dispose: () => void };
type BackendFlags = { isWebGPUBackend?: boolean; isWebGLBackend?: boolean };

type SceneProfile = {
  energy: number;
  geometry: number;
  particle: number;
  raySpeed: number;
  rayBiasY: number;
};

type AmbientShape = {
  group: THREE.Group;
  fill: THREE.MeshBasicMaterial;
  edge: THREE.LineBasicMaterial;
  nx: number;
  ny: number;
  phase: number;
  amplitudeX: number;
  amplitudeY: number;
  rotation: number;
  scale: number;
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

const profiles: Record<string, SceneProfile> = {
  top: { energy: 1, geometry: 1, particle: 1, raySpeed: 1, rayBiasY: 0.12 },
  about: { energy: 0.72, geometry: 0.82, particle: 0.58, raySpeed: 0.7, rayBiasY: -0.08 },
  technology: { energy: 0.88, geometry: 1.08, particle: 0.8, raySpeed: 0.82, rayBiasY: 0.2 },
  projects: { energy: 1.12, geometry: 1.18, particle: 1.15, raySpeed: 1.08, rayBiasY: 0.04 },
  articles: { energy: 0.58, geometry: 0.7, particle: 0.42, raySpeed: 0.58, rayBiasY: -0.2 },
  life: { energy: 0.92, geometry: 0.9, particle: 0.92, raySpeed: 0.9, rayBiasY: 0.18 },
  contact: { energy: 0.64, geometry: 0.72, particle: 0.48, raySpeed: 0.62, rayBiasY: 0 },
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
      const balanced = lowPower || mobile;
      const webGPUAvailable = window.isSecureContext && "gpu" in navigator;
      const forceWebGL = requestedBackend === "webgl2" || !webGPUAvailable;
      const random = seededRandom(20260816);
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
        line: new THREE.Color(),
        surface: new THREE.Color(),
      };
      let themeContrast = 1;

      const shapes: AmbientShape[] = [];
      const shapeCount = balanced ? 6 : 10;
      for (let index = 0; index < shapeCount; index += 1) {
        const geometry = register(new THREE.BoxGeometry(
          0.9 + random() * 1.8,
          0.7 + random() * 1.5,
          0.03 + random() * 0.05,
        ));
        const fill = register(new THREE.MeshBasicMaterial({
          transparent: true,
          opacity: 0.025,
          depthWrite: false,
        }));
        const mesh = new THREE.Mesh(geometry, fill);
        const edgeGeometry = register(new THREE.EdgesGeometry(geometry));
        const edge = register(new THREE.LineBasicMaterial({
          transparent: true,
          opacity: 0.2,
          depthWrite: false,
        }));
        const edges = new THREE.LineSegments(edgeGeometry, edge);
        const group = new THREE.Group();
        group.add(mesh, edges);
        world.add(group);
        shapes.push({
          group,
          fill,
          edge,
          nx: random() * 1.9 - 0.95,
          ny: random() * 1.8 - 0.9,
          phase: random() * Math.PI * 2,
          amplitudeX: 0.28 + random() * 0.72,
          amplitudeY: 0.2 + random() * 0.58,
          rotation: (random() - 0.5) * 0.5,
          scale: 0.72 + random() * 0.52,
        });
      }

      const particleCount = balanced ? 34 : 72;
      const particleGeometry = register(new THREE.BoxGeometry(0.055, 0.055, 0.035));
      const particleMaterial = register(new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: balanced ? 0.48 : 0.62,
        depthWrite: false,
      }));
      const particleMesh = new THREE.InstancedMesh(particleGeometry, particleMaterial, particleCount);
      particleMesh.frustumCulled = false;
      world.add(particleMesh);
      const particleMatrix = new THREE.Matrix4();
      const particles: PixelState[] = Array.from({ length: particleCount }, () => ({
        x: random() * 12 - 6,
        y: random() * 10 - 5,
        z: -1.5 - random() * 4,
        vx: 0,
        vy: 0,
        size: 0.55 + random() * 1.35,
        phase: random() * Math.PI * 2,
        speed: 0.08 + random() * 0.22,
      }));

      const rayShape = new THREE.Shape();
      rayShape.moveTo(0.74, 0);
      rayShape.bezierCurveTo(0.28, 0.16, -0.26, 0.58, -1.02, 0.4);
      rayShape.quadraticCurveTo(-0.56, 0.04, -0.18, -0.07);
      rayShape.lineTo(-0.66, -0.37);
      rayShape.bezierCurveTo(-0.08, -0.46, 0.4, -0.14, 0.74, 0);
      const rayGeometry = register(new THREE.ShapeGeometry(rayShape));
      const rayMaterial = register(new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0.15,
        side: THREE.DoubleSide,
        depthWrite: false,
      }));
      const rayMesh = new THREE.Mesh(rayGeometry, rayMaterial);
      const rayEdgeGeometry = register(new THREE.EdgesGeometry(rayGeometry));
      const rayEdgeMaterial = register(new THREE.LineBasicMaterial({
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
      }));
      const rayEdges = new THREE.LineSegments(rayEdgeGeometry, rayEdgeMaterial);
      const rayGroup = new THREE.Group();
      rayGroup.scale.setScalar(balanced ? 0.58 : 0.72);
      rayGroup.add(rayMesh, rayEdges);
      world.add(rayGroup);

      const trailCount = balanced ? 12 : 20;
      const trailPoints = Array.from({ length: trailCount }, () => new THREE.Vector3(-2.8, 0.8, -0.4));
      const trailArray = new Float32Array(trailCount * 3);
      const trailGeometry = register(new THREE.BufferGeometry());
      const trailAttribute = new THREE.BufferAttribute(trailArray, 3);
      trailGeometry.setAttribute("position", trailAttribute);
      const trailMaterial = register(new THREE.LineBasicMaterial({
        transparent: true,
        opacity: 0.34,
        depthWrite: false,
      }));
      const trailLine = new THREE.Line(trailGeometry, trailMaterial);
      world.add(trailLine);

      const tailPixelCount = balanced ? 5 : 9;
      const tailPixelGeometry = register(new THREE.BoxGeometry(0.045, 0.045, 0.025));
      const tailPixelMaterial = register(new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0.66,
        depthWrite: false,
      }));
      const tailPixels = new THREE.InstancedMesh(tailPixelGeometry, tailPixelMaterial, tailPixelCount);
      tailPixels.frustumCulled = false;
      world.add(tailPixels);

      const rayPosition = new THREE.Vector2(-2.8, 0.8);
      const rayVelocity = new THREE.Vector2(0.62, 0.14);
      const force = new THREE.Vector2();
      const pointerWorld = new THREE.Vector2();
      const obstacleForce = new THREE.Vector2();

      const applyTheme = () => {
        const styles = getComputedStyle(document.documentElement);
        themeContrast = document.documentElement.dataset.theme === "dark" ? 0.82 : 1.34;
        palette.accent.set(styles.getPropertyValue("--accent").trim() || "#53a3f2");
        palette.line.set(styles.getPropertyValue("--line-strong").trim() || "#7890a8");
        palette.surface.set(styles.getPropertyValue("--surface-strong").trim() || "#cddbeb");
        particleMaterial.color.copy(palette.accent);
        tailPixelMaterial.color.copy(palette.accent);
        trailMaterial.color.copy(palette.accent);
        rayMaterial.color.copy(palette.accent);
        rayEdgeMaterial.color.copy(palette.accent);
        shapes.forEach((shape) => {
          shape.fill.color.copy(palette.surface);
          shape.edge.color.copy(palette.line);
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

      const updateShapes = (time: number) => {
        const seconds = time * 0.001;
        shapes.forEach((shape, index) => {
          const baseX = shape.nx * viewHalfWidth;
          const baseY = shape.ny * viewHalfHeight;
          const idleX = Math.sin(seconds * (0.11 + index * 0.007) + shape.phase) * shape.amplitudeX;
          const idleY = Math.cos(seconds * (0.08 + index * 0.006) + shape.phase) * shape.amplitudeY;
          let pointerX = 0;
          let pointerY = 0;
          if (pointer.active) {
            const dx = baseX - pointerWorld.x;
            const dy = baseY - pointerWorld.y;
            const distance = Math.max(0.2, Math.hypot(dx, dy));
            const response = Math.max(0, 1 - distance / 4.2) * 0.22;
            pointerX = dx / distance * response;
            pointerY = dy / distance * response;
          }
          shape.group.position.set(
            baseX + idleX * currentProfile.geometry + pointerX,
            baseY + idleY * currentProfile.geometry + pointerY,
            -2.5 - (index % 4) * 1.1,
          );
          shape.group.rotation.z = shape.rotation + Math.sin(seconds * 0.07 + shape.phase) * 0.1;
          const breathe = 1 + Math.sin(seconds * 0.23 + shape.phase) * 0.09;
          shape.group.scale.setScalar(shape.scale * breathe);
          shape.edge.opacity = (balanced ? 0.12 : 0.18) * currentProfile.geometry * themeContrast * (0.72 + Math.sin(seconds * 0.31 + shape.phase) * 0.28);
          shape.fill.opacity = (0.018 + currentProfile.energy * 0.018) * themeContrast;
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
          particleMatrix.makeScale(scale, scale, scale);
          particleMatrix.setPosition(particle.x, particle.y, particle.z);
          particleMesh.setMatrixAt(index, particleMatrix);
        });
        particleMesh.instanceMatrix.needsUpdate = true;
        particleMaterial.opacity = (balanced ? 0.34 : 0.5) * themeContrast * (0.7 + currentProfile.particle * 0.3);
      };

      const updateRay = (time: number, delta: number) => {
        const seconds = time * 0.001;
        force.set(
          Math.cos(seconds * 0.29) * 0.34 + Math.sin(seconds * 0.13) * 0.22,
          Math.sin(seconds * 0.23) * 0.3 + targetProfile.rayBiasY * 0.38,
        );

        if (pointer.active) {
          const dx = pointerWorld.x - rayPosition.x;
          const dy = pointerWorld.y - rayPosition.y;
          const distance = Math.max(0.15, Math.hypot(dx, dy));
          const fastPointer = pointer.speed > 0.85;
          const range = fastPointer ? 3.4 : 4.8;
          const strength = Math.max(0, 1 - distance / range);
          if (fastPointer) {
            force.x -= dx / distance * strength * 2.8;
            force.y -= dy / distance * strength * 2.8;
          } else {
            force.x += dx / distance * strength * 0.82 - dy / distance * strength * 0.28;
            force.y += dy / distance * strength * 0.82 + dx / distance * strength * 0.28;
          }
        }

        const screenX = rayPosition.x / (viewHalfWidth * 2) + 0.5;
        const screenY = 0.5 - rayPosition.y / (viewHalfHeight * 2);
        safeZones.forEach((zone) => {
          const margin = 0.035;
          if (screenX < zone.left - margin || screenX > zone.right + margin || screenY < zone.top - margin || screenY > zone.bottom + margin) return;
          const centerX = (zone.left + zone.right) * 0.5;
          const centerY = (zone.top + zone.bottom) * 0.5;
          obstacleForce.set(screenX - centerX, -(screenY - centerY));
          if (obstacleForce.lengthSq() < 0.0001) obstacleForce.set(screenX < 0.5 ? -1 : 1, 0.2);
          obstacleForce.normalize().multiplyScalar(1.8);
          force.add(obstacleForce);
        });

        shapes.forEach((shape) => {
          const dx = rayPosition.x - shape.group.position.x;
          const dy = rayPosition.y - shape.group.position.y;
          const distance = Math.max(0.15, Math.hypot(dx, dy));
          if (distance < 1.35) {
            const strength = (1 - distance / 1.35) * 1.6;
            force.x += dx / distance * strength;
            force.y += dy / distance * strength;
            shape.group.rotation.z += strength * delta * 0.3;
          }
        });

        const boundaryX = viewHalfWidth - 0.65;
        const boundaryY = viewHalfHeight - 0.55;
        if (Math.abs(rayPosition.x) > boundaryX) force.x += -Math.sign(rayPosition.x) * 2.2;
        if (Math.abs(rayPosition.y) > boundaryY) force.y += -Math.sign(rayPosition.y) * 2.2;

        rayVelocity.addScaledVector(force, delta);
        rayVelocity.multiplyScalar(Math.exp(-1.05 * delta));
        rayVelocity.clampLength(0.38, 1.25 * currentProfile.raySpeed);
        rayPosition.addScaledVector(rayVelocity, delta);
        rayGroup.position.set(rayPosition.x, rayPosition.y, -0.35);
        rayGroup.rotation.z = Math.atan2(rayVelocity.y, rayVelocity.x);
        const wingPulse = 1 + Math.sin(seconds * 4.1) * 0.09;
        rayMesh.scale.y = wingPulse;
        rayEdges.scale.y = wingPulse;
        rayMaterial.opacity = (balanced ? 0.1 : 0.14) * themeContrast * currentProfile.energy;
        rayEdgeMaterial.opacity = (balanced ? 0.48 : 0.68) * themeContrast * currentProfile.energy;

        trailPoints[0].set(rayPosition.x - rayVelocity.x * 0.32, rayPosition.y - rayVelocity.y * 0.32, -0.42);
        for (let index = 1; index < trailPoints.length; index += 1) {
          trailPoints[index].lerp(trailPoints[index - 1], Math.min(1, delta * (7.8 - index * 0.12)));
        }
        trailPoints.forEach((point, index) => {
          trailArray[index * 3] = point.x;
          trailArray[index * 3 + 1] = point.y;
          trailArray[index * 3 + 2] = point.z;
        });
        trailAttribute.needsUpdate = true;
        trailMaterial.opacity = (balanced ? 0.2 : 0.32) * themeContrast * currentProfile.energy;

        for (let index = 0; index < tailPixelCount; index += 1) {
          const point = trailPoints[Math.min(trailPoints.length - 1, 2 + index * 2)];
          const scale = Math.max(0.26, 0.82 - index * 0.07) * (0.75 + Math.sin(seconds * 2.1 + index) * 0.25);
          particleMatrix.makeScale(scale, scale, scale);
          particleMatrix.setPosition(point.x, point.y, point.z - 0.02);
          tailPixels.setMatrixAt(index, particleMatrix);
        }
        tailPixels.instanceMatrix.needsUpdate = true;
      };

      const render = (time: number) => {
        if (destroyed || !pageVisible) return;
        const delta = Math.min(0.04, Math.max(0.001, (time - lastTime) / 1000));
        lastTime = time;
        const profileEase = Math.min(1, delta * 0.72);
        currentProfile.energy = lerp(currentProfile.energy, targetProfile.energy, profileEase);
        currentProfile.geometry = lerp(currentProfile.geometry, targetProfile.geometry, profileEase);
        currentProfile.particle = lerp(currentProfile.particle, targetProfile.particle, profileEase);
        currentProfile.raySpeed = lerp(currentProfile.raySpeed, targetProfile.raySpeed, profileEase);
        currentProfile.rayBiasY = lerp(currentProfile.rayBiasY, targetProfile.rayBiasY, profileEase);
        pointer.speed *= Math.exp(-3.2 * delta);
        pulse *= Math.exp(-2.8 * delta);
        updatePointerWorld();
        updateShapes(time);
        updateParticles(time, delta);
        updateRay(time, delta);
        renderer.render(scene, camera);
        host.dataset.status = "ready";
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
        pointer.speed = Math.min(2.4, distance / elapsed);
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
        pulse = Math.max(pulse, 0.48);
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
        rayVelocity.x += direction * 0.42;
        rayVelocity.y += 0.28;
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
    <div ref={hostRef} className="ambient-world" data-status="loading" data-backend="static" data-quality="static" aria-hidden="true">
      <canvas />
      <div className="ambient-static-fallback">
        <span className="ambient-static-grid"></span>
        <span className="ambient-static-shape ambient-static-shape-one"></span>
        <span className="ambient-static-shape ambient-static-shape-two"></span>
        <span className="ambient-static-shape ambient-static-shape-three"></span>
        <span className="ambient-static-ray"></span>
        <span className="ambient-static-pixel ambient-static-pixel-one"></span>
        <span className="ambient-static-pixel ambient-static-pixel-two"></span>
        <span className="ambient-static-pixel ambient-static-pixel-three"></span>
      </div>
      <div className="ambient-postprocess"></div>
    </div>
  );
}
