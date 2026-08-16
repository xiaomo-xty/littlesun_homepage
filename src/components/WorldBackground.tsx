import { useEffect, useRef } from "react";
import * as THREE from "three";

type Disposable = {
  dispose: () => void;
};

function seededRandom(seed: number) {
  let value = seed;
  return () => {
    value = (value * 9301 + 49297) % 233280;
    return value / 233280;
  };
}

export default function WorldBackground() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = host?.querySelector("canvas");
    if (!host || !(canvas instanceof HTMLCanvasElement)) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const saveData = "connection" in navigator && Boolean((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData);
    const lowPower = (navigator.hardwareConcurrency || 8) <= 4 || saveData;
    const mobile = window.matchMedia("(max-width: 767px)").matches;
    const particleCount = lowPower ? 14 : mobile ? 24 : 40;
    const disposables: Disposable[] = [];
    let renderer: THREE.WebGLRenderer;

    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: !lowPower,
        powerPreference: lowPower ? "low-power" : "high-performance",
      });
    } catch {
      host.dataset.status = "unsupported";
      return;
    }

    if (!renderer.getContext()) {
      host.dataset.status = "unsupported";
      renderer.dispose();
      return;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowPower ? 1 : mobile ? 1.25 : 1.6));

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 50);
    camera.position.set(0, 0, 8);

    const world = new THREE.Group();
    scene.add(world);

    const panelMaterials: THREE.MeshBasicMaterial[] = [];
    const edgeMaterials: THREE.LineBasicMaterial[] = [];

    const addPanel = (width: number, height: number, x: number, y: number, z: number, rotateZ: number, opacity: number) => {
      const geometry = new THREE.BoxGeometry(width, height, 0.1);
      const material = new THREE.MeshBasicMaterial({ transparent: true, opacity, depthWrite: false });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, y, z);
      mesh.rotation.z = rotateZ;
      world.add(mesh);

      const edgeGeometry = new THREE.EdgesGeometry(geometry);
      const edgeMaterial = new THREE.LineBasicMaterial({ transparent: true, opacity: Math.min(opacity + 0.18, 0.5) });
      const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
      mesh.add(edges);

      disposables.push(geometry, edgeGeometry, material, edgeMaterial);
      panelMaterials.push(material);
      edgeMaterials.push(edgeMaterial);
    };

    addPanel(4.3, 5.3, 2.7, -0.05, -2.8, -0.08, 0.09);
    addPanel(3.8, 4.5, 3.7, -0.55, -1.5, 0.06, 0.075);
    addPanel(3.1, 3.6, 4.25, -1.1, -0.7, 0.12, 0.06);
    addPanel(2.2, 2.7, 1.5, 0.8, -3.8, 0.04, 0.05);

    const axisGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0.8, -2.9, -0.8),
      new THREE.Vector3(5.2, 0.25, -0.8),
    ]);
    const axisMaterial = new THREE.LineBasicMaterial({ transparent: true, opacity: mobile ? 0.14 : 0.32 });
    const axis = new THREE.Line(axisGeometry, axisMaterial);
    world.add(axis);
    disposables.push(axisGeometry, axisMaterial);

    const pixelGeometry = new THREE.BoxGeometry(0.045, 0.045, 0.045);
    const pixelMaterial = new THREE.MeshBasicMaterial();
    const pixels = new THREE.InstancedMesh(pixelGeometry, pixelMaterial, particleCount);
    const random = seededRandom(20260816);
    const matrix = new THREE.Matrix4();

    for (let index = 0; index < particleCount; index += 1) {
      const x = random() < 0.18 ? -0.8 + random() * 1.4 : 1 + random() * 5.1;
      const y = -3.2 + random() * 6.4;
      const z = -3.6 + random() * 2.8;
      const scale = 0.4 + random();
      matrix.makeScale(scale, scale, scale);
      matrix.setPosition(x, y, z);
      pixels.setMatrixAt(index, matrix);
    }

    pixels.instanceMatrix.needsUpdate = true;
    world.add(pixels);
    disposables.push(pixelGeometry, pixelMaterial);

    const applyTheme = () => {
      const dark = document.documentElement.dataset.theme === "dark";
      const panelColor = new THREE.Color(dark ? 0x324a61 : 0xb9d0e7);
      const edgeColor = new THREE.Color(dark ? 0x55728e : 0x7898b7);
      const accentColor = new THREE.Color(dark ? 0x63b3ff : 0x3f96e8);

      panelMaterials.forEach((material) => material.color.copy(panelColor));
      edgeMaterials.forEach((material) => material.color.copy(edgeColor));
      axisMaterial.color.copy(edgeColor);
      pixelMaterial.color.copy(accentColor);
    };

    applyTheme();
    const themeObserver = new MutationObserver(applyTheme);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    let pointerX = 0;
    let pointerY = 0;
    let frame = 0;
    let inView = true;
    let pageVisible = !document.hidden;
    let destroyed = false;

    const resize = () => {
      const rect = host.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      renderer.setSize(rect.width, rect.height, false);
      camera.aspect = rect.width / rect.height;
      camera.updateProjectionMatrix();
    };

    const render = (time = 0) => {
      if (destroyed || !inView || !pageVisible) return;

      if (!reduceMotion.matches) {
        world.rotation.y += (pointerX * 0.08 - world.rotation.y) * 0.035;
        world.rotation.x += (-pointerY * 0.045 - world.rotation.x) * 0.035;
        pixels.rotation.z = Math.sin(time * 0.00012) * 0.018;
        pixels.position.y = Math.sin(time * 0.0003) * 0.035;
      }

      renderer.render(scene, camera);
      host.dataset.status = "ready";

      if (!reduceMotion.matches) frame = window.requestAnimationFrame(render);
    };

    const ensureRunning = () => {
      window.cancelAnimationFrame(frame);
      if (inView && pageVisible) frame = window.requestAnimationFrame(render);
    };

    const handlePointer = (event: PointerEvent) => {
      pointerX = event.clientX / window.innerWidth - 0.5;
      pointerY = event.clientY / window.innerHeight - 0.5;
    };

    const handleVisibility = () => {
      pageVisible = !document.hidden;
      ensureRunning();
    };

    const resizeObserver = new ResizeObserver(() => {
      resize();
      if (reduceMotion.matches) render();
    });
    resizeObserver.observe(host);

    const intersectionObserver = new IntersectionObserver(
      ([entry]) => {
        inView = entry.isIntersecting;
        ensureRunning();
      },
      { threshold: 0.01 },
    );
    intersectionObserver.observe(host);

    resize();
    render();
    window.addEventListener("pointermove", handlePointer, { passive: true });
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      destroyed = true;
      window.cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", handlePointer);
      document.removeEventListener("visibilitychange", handleVisibility);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      themeObserver.disconnect();
      scene.clear();
      disposables.forEach((resource) => resource.dispose());
      renderer.dispose();
    };
  }, []);

  return (
    <div ref={hostRef} className="world-canvas" data-status="loading" aria-hidden="true">
      <canvas />
    </div>
  );
}
