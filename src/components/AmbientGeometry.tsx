import { useEffect, useRef } from "react";

type PixelParticle = {
  x: number;
  y: number;
  size: number;
  targetSize: number;
  brightness: number;
  targetBrightness: number;
  driftX: number;
  targetDriftX: number;
  changeAt: number;
  speed: number;
  phase: number;
  depth: number;
};

type GeometryShape = {
  baseX: number;
  baseY: number;
  offsetX: number;
  offsetY: number;
  targetOffsetX: number;
  targetOffsetY: number;
  width: number;
  height: number;
  rotation: number;
  depth: number;
  scale: number;
  targetScale: number;
  brightness: number;
  targetBrightness: number;
  kind: number;
  nextKind: number;
  morph: number;
  phase: number;
  changeAt: number;
};

const shapeKinds = ["rect", "triangle", "arc", "cross"] as const;

function seededRandom(seed: number) {
  let value = seed;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

export default function AmbientGeometry() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const canvas = host.querySelector("canvas");
    if (!(canvas instanceof HTMLCanvasElement)) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const mobile = window.matchMedia("(max-width: 767px)").matches;
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    const lowPower = (navigator.hardwareConcurrency || 8) <= 4 || Boolean(connection?.saveData);
    const pixelCount = lowPower ? 18 : mobile ? 28 : 52;
    const shapeCount = lowPower ? 5 : mobile ? 7 : 12;
    const random = seededRandom(20260816);
    const pixels: PixelParticle[] = [];
    const shapes: GeometryShape[] = [];
    let width = 0;
    let height = 0;
    let frame = 0;
    let lastTime = 0;
    let pageVisible = !document.hidden;
    let destroyed = false;
    let pointerX = -1000;
    let pointerY = -1000;
    let pointerTargetX = 0;
    let pointerTargetY = 0;
    let pointerDriftX = 0;
    let pointerDriftY = 0;
    let palette = { accent: "#53a3f2", line: "#7890a8" };

    const buildScene = () => {
      pixels.length = 0;
      shapes.length = 0;

      for (let index = 0; index < pixelCount; index += 1) {
        pixels.push({
          x: random() * width,
          y: random() * height,
          size: random() > 0.82 ? 5 : random() > 0.55 ? 3 : 2,
          targetSize: 2 + random() * 4,
          brightness: 0.4 + random() * 0.6,
          targetBrightness: 0.4 + random() * 0.6,
          driftX: 0,
          targetDriftX: (random() - 0.5) * 24,
          changeAt: 700 + random() * 1800,
          speed: 3 + random() * 8,
          phase: random() * Math.PI * 2,
          depth: 0.25 + random() * 0.75,
        });
      }

      for (let index = 0; index < shapeCount; index += 1) {
        const kind = index % shapeKinds.length;
        shapes.push({
          baseX: random() * width,
          baseY: random() * height,
          offsetX: 0,
          offsetY: 0,
          targetOffsetX: (random() - 0.5) * 54,
          targetOffsetY: (random() - 0.5) * 44,
          width: 70 + random() * 180,
          height: 54 + random() * 150,
          rotation: (random() - 0.5) * 0.5,
          depth: 0.18 + random() * 0.5,
          scale: 0.9 + random() * 0.2,
          targetScale: 0.8 + random() * 0.4,
          brightness: 0.45 + random() * 0.4,
          targetBrightness: 0.4 + random() * 0.55,
          kind,
          nextKind: kind,
          morph: 1,
          phase: random() * Math.PI * 2,
          changeAt: 1800 + random() * 3000,
        });
      }
    };

    const applyTheme = () => {
      const styles = getComputedStyle(document.documentElement);
      palette = {
        accent: styles.getPropertyValue("--accent").trim() || "#53a3f2",
        line: styles.getPropertyValue("--line-strong").trim() || "#7890a8",
      };
      if (reduceMotion.matches) draw(0);
    };

    const resize = () => {
      const rect = host.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      width = rect.width;
      height = rect.height;
      const dpr = Math.min(window.devicePixelRatio || 1, lowPower ? 1 : mobile ? 1.2 : 1.5);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildScene();
      if (reduceMotion.matches) draw(0);
    };

    const drawShape = (shape: GeometryShape, time: number) => {
      const organicDrift = Math.sin(time * 0.00008 + shape.phase) * 6 * shape.depth;
      const x = shape.baseX + shape.offsetX + pointerDriftX * shape.depth * 24;
      const y = shape.baseY + shape.offsetY + pointerDriftY * shape.depth * 18 + organicDrift;
      const formPulse = Math.sin(time * 0.00022 + shape.phase);
      const widthPulse = 1 + formPulse * 0.055;
      const heightPulse = 1 - formPulse * 0.04;
      context.save();
      context.translate(x, y);
      context.rotate(shape.rotation + Math.sin(time * 0.00005 + shape.phase) * 0.025);
      context.strokeStyle = palette.line;
      context.lineWidth = 1;

      const renderKind = (kindIndex: number, alpha: number) => {
        const kind = shapeKinds[kindIndex];
        const shapeWidth = shape.width * shape.scale * widthPulse;
        const shapeHeight = shape.height * shape.scale * heightPulse;
        context.globalAlpha = (0.035 + shape.brightness * 0.07) * alpha;

        if (kind === "rect") {
          const skew = formPulse * 9;
          context.beginPath();
          context.moveTo(-shapeWidth / 2 + skew, -shapeHeight / 2);
          context.lineTo(shapeWidth / 2, -shapeHeight / 2 + skew * 0.35);
          context.lineTo(shapeWidth / 2 - skew, shapeHeight / 2);
          context.lineTo(-shapeWidth / 2, shapeHeight / 2 - skew * 0.35);
          context.closePath();
          context.stroke();
        } else if (kind === "triangle") {
          context.beginPath();
          context.moveTo(formPulse * shapeWidth * 0.08, -shapeHeight / 2);
          context.lineTo(shapeWidth / 2, shapeHeight / 2);
          context.lineTo(-shapeWidth / 2, shapeHeight / 2 - formPulse * 8);
          context.closePath();
          context.stroke();
        } else if (kind === "arc") {
          context.beginPath();
          context.ellipse(0, 0, shapeWidth / 2, shapeHeight / 2, 0, -0.25 + formPulse * 0.08, Math.PI * (1.25 + formPulse * 0.08));
          context.stroke();
        } else {
          context.beginPath();
          context.moveTo(-shapeWidth / 2, formPulse * 6);
          context.lineTo(shapeWidth / 2, -formPulse * 6);
          context.moveTo(formPulse * 5, -shapeHeight / 2);
          context.lineTo(-formPulse * 5, shapeHeight / 2);
          context.stroke();
        }
      };

      renderKind(shape.kind, 1 - shape.morph);
      renderKind(shape.nextKind, shape.morph);
      context.restore();
    };

    const drawPixel = (pixel: PixelParticle, time: number) => {
      let x = pixel.x + pixel.driftX + Math.sin(time * 0.00035 + pixel.phase) * 8 * pixel.depth;
      let y = pixel.y;
      const deltaX = x - pointerX;
      const deltaY = y - pointerY;
      const distance = Math.hypot(deltaX, deltaY);

      if (distance > 0 && distance < 150) {
        const response = (1 - distance / 150) * 9;
        x += (deltaX / distance) * response;
        y += (deltaY / distance) * response;
      }

      const twinkle = 0.72 + Math.sin(time * 0.0012 + pixel.phase) * 0.28;
      const renderedSize = Math.max(1, pixel.size * (0.9 + Math.sin(time * 0.0007 + pixel.phase) * 0.1));
      context.globalAlpha = (0.055 + pixel.depth * 0.13) * pixel.brightness * twinkle;
      context.fillStyle = palette.accent;
      context.fillRect(Math.round(x), Math.round(y), Math.round(renderedSize), Math.round(renderedSize));
    };

    const draw = (time: number) => {
      if (destroyed || width < 1 || height < 1) return;
      context.clearRect(0, 0, width, height);
      pointerDriftX += (pointerTargetX - pointerDriftX) * 0.035;
      pointerDriftY += (pointerTargetY - pointerDriftY) * 0.035;
      shapes.forEach((shape) => drawShape(shape, time));
      pixels.forEach((pixel) => drawPixel(pixel, time));
      context.globalAlpha = 1;
      host.dataset.status = "ready";
    };

    const render = (time: number) => {
      if (destroyed || !pageVisible) return;
      const delta = Math.min(32, time - lastTime || 16) / 1000;
      lastTime = time;
      pixels.forEach((pixel) => {
        if (time >= pixel.changeAt) {
          pixel.targetSize = 1.5 + random() * 4.5;
          pixel.targetBrightness = 0.28 + random() * 0.72;
          pixel.targetDriftX = (random() - 0.5) * 34;
          pixel.changeAt = time + 800 + random() * 2200;
        }
        const pixelEase = Math.min(1, delta * 1.4);
        pixel.size += (pixel.targetSize - pixel.size) * pixelEase;
        pixel.brightness += (pixel.targetBrightness - pixel.brightness) * pixelEase;
        pixel.driftX += (pixel.targetDriftX - pixel.driftX) * pixelEase;
        pixel.y -= pixel.speed * delta;
        if (pixel.y < -8) {
          pixel.y = height + 8;
          pixel.x = random() * width;
        }
      });
      shapes.forEach((shape) => {
        if (time >= shape.changeAt) {
          shape.targetOffsetX = (random() - 0.5) * Math.min(90, width * 0.08);
          shape.targetOffsetY = (random() - 0.5) * Math.min(70, height * 0.07);
          shape.targetScale = 0.72 + random() * 0.56;
          shape.targetBrightness = 0.25 + random() * 0.75;
          shape.nextKind = Math.floor(random() * shapeKinds.length);
          shape.morph = shape.nextKind === shape.kind ? 1 : 0;
          shape.changeAt = time + 2200 + random() * 4200;
        }
        const shapeEase = Math.min(1, delta * 0.42);
        shape.offsetX += (shape.targetOffsetX - shape.offsetX) * shapeEase;
        shape.offsetY += (shape.targetOffsetY - shape.offsetY) * shapeEase;
        shape.scale += (shape.targetScale - shape.scale) * shapeEase;
        shape.brightness += (shape.targetBrightness - shape.brightness) * shapeEase;
        if (shape.morph < 1) {
          shape.morph = Math.min(1, shape.morph + delta * 0.42);
          if (shape.morph === 1) shape.kind = shape.nextKind;
        }
      });
      draw(time);
      frame = window.requestAnimationFrame(render);
    };

    const ensureRunning = () => {
      window.cancelAnimationFrame(frame);
      if (!pageVisible) return;
      if (reduceMotion.matches) draw(0);
      else frame = window.requestAnimationFrame(render);
    };

    const handlePointer = (event: PointerEvent) => {
      pointerX = event.clientX;
      pointerY = event.clientY;
      pointerTargetX = event.clientX / Math.max(width, 1) - 0.5;
      pointerTargetY = event.clientY / Math.max(height, 1) - 0.5;
    };

    const handlePointerLeave = () => {
      pointerX = -1000;
      pointerY = -1000;
      pointerTargetX = 0;
      pointerTargetY = 0;
    };

    const handleVisibility = () => {
      pageVisible = !document.hidden;
      lastTime = performance.now();
      ensureRunning();
    };

    const handleMotionPreference = () => ensureRunning();
    const resizeObserver = new ResizeObserver(resize);
    const themeObserver = new MutationObserver(applyTheme);
    resizeObserver.observe(host);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    reduceMotion.addEventListener("change", handleMotionPreference);
    window.addEventListener("pointermove", handlePointer, { passive: true });
    document.documentElement.addEventListener("pointerleave", handlePointerLeave);
    document.addEventListener("visibilitychange", handleVisibility);

    applyTheme();
    resize();
    ensureRunning();

    return () => {
      destroyed = true;
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      themeObserver.disconnect();
      reduceMotion.removeEventListener("change", handleMotionPreference);
      window.removeEventListener("pointermove", handlePointer);
      document.documentElement.removeEventListener("pointerleave", handlePointerLeave);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  return (
    <div ref={hostRef} className="ambient-geometry" data-status="loading" aria-hidden="true">
      <canvas />
    </div>
  );
}
