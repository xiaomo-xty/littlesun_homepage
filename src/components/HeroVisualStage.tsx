import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ImageSquareIcon,
  MonitorPlayIcon,
  UserFocusIcon,
  type Icon,
} from "@phosphor-icons/react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { sampleIdleParallax } from "../lib/idleParallax";

type VisualMode = {
  id: "portrait" | "workspace" | "work";
  label: string;
  index: string;
  title: string;
  description: string;
  placeholder: string;
  icon: Icon;
  src?: string;
  alt?: string;
};

const modes: VisualMode[] = [
  {
    id: "portrait",
    label: "人物",
    index: "01",
    title: "人物视角",
    description: "用于一张自然、清晰、不过度摆拍的个人照片。",
    placeholder: "真实人像占位",
    icon: UserFocusIcon,
  },
  {
    id: "workspace",
    label: "现场",
    index: "02",
    title: "工作现场",
    description: "用于真实的开发环境、调试过程或工作状态照片。",
    placeholder: "工作现场占位",
    icon: MonitorPlayIcon,
  },
  {
    id: "work",
    label: "作品",
    index: "03",
    title: "个人作品",
    description: "用于 SceneScope 或其他作品中最能说明问题的一帧。",
    placeholder: "个人作品图占位",
    icon: ImageSquareIcon,
  },
];

const wrapIndex = (value: number) => (value + modes.length) % modes.length;

export default function HeroVisualStage() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [experienceReady, setExperienceReady] = useState(false);
  const [stageInView, setStageInView] = useState(false);
  const pointerStart = useRef<number | null>(null);
  const pointerActive = useRef(false);
  const reducedMotion = useReducedMotion();
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const smoothX = useSpring(pointerX, { stiffness: 150, damping: 22, mass: 0.42 });
  const smoothY = useSpring(pointerY, { stiffness: 150, damping: 22, mass: 0.42 });
  const rotateY = useTransform(smoothX, [-1, 1], [-2.6, 2.6]);
  const rotateX = useTransform(smoothY, [-1, 1], [2.1, -2.1]);
  const mediaX = useTransform(smoothX, [-1, 1], [-5, 5]);
  const mediaY = useTransform(smoothY, [-1, 1], [-4, 4]);
  const lightX = useTransform(smoothX, [-1, 1], [-18, 18]);
  const lightY = useTransform(smoothY, [-1, 1], [-11, 11]);
  const activeMode = modes[activeIndex];
  const ActiveIcon = activeMode.icon;

  useEffect(() => {
    if (document.documentElement.dataset.experience === "ready") {
      setExperienceReady(true);
      return;
    }

    const handleReady = () => setExperienceReady(true);
    window.addEventListener("homepage:experience-ready", handleReady, { once: true });
    return () => window.removeEventListener("homepage:experience-ready", handleReady);
  }, []);

  useEffect(() => {
    const section = document.querySelector<HTMLElement>("[data-reveal='hero']");
    const syncPresence = () => setStageInView(section?.dataset.revealState === "visible");
    const handlePresence = (event: Event) => {
      const detail = (event as CustomEvent<{ id?: string; visible?: boolean }>).detail;
      if (detail?.id === "top") setStageInView(Boolean(detail.visible));
    };

    window.addEventListener("homepage:section-presence", handlePresence);
    const presenceObserver = section ? new MutationObserver(syncPresence) : null;
    presenceObserver?.observe(section!, { attributes: true, attributeFilter: ["data-reveal-state"] });
    const frame = window.requestAnimationFrame(syncPresence);
    return () => {
      window.cancelAnimationFrame(frame);
      presenceObserver?.disconnect();
      window.removeEventListener("homepage:section-presence", handlePresence);
    };
  }, []);

  useEffect(() => {
    if (!experienceReady || reducedMotion || !stageInView) return;
    let frame = 0;
    const updateIdleParallax = (time: number) => {
      if (!pointerActive.current) {
        const idle = sampleIdleParallax(time, 12_800, 0.15, 0.1, 0.35);
        pointerX.set(idle.x);
        pointerY.set(idle.y);
      }
      frame = window.requestAnimationFrame(updateIdleParallax);
    };
    frame = window.requestAnimationFrame(updateIdleParallax);
    return () => window.cancelAnimationFrame(frame);
  }, [experienceReady, pointerX, pointerY, reducedMotion, stageInView]);

  const selectMode = (nextIndex: number) => {
    const wrapped = wrapIndex(nextIndex);
    if (wrapped === activeIndex) return;
    const forwardDistance = (wrapped - activeIndex + modes.length) % modes.length;
    setDirection(forwardDistance <= modes.length / 2 ? 1 : -1);
    setActiveIndex(wrapped);
  };

  const moveBy = (offset: number) => {
    setDirection(offset > 0 ? 1 : -1);
    setActiveIndex((current) => wrapIndex(current + offset));
  };

  const handlePointerMove = (event: PointerEvent<HTMLElement>) => {
    if (reducedMotion || event.pointerType === "touch") return;
    pointerActive.current = true;
    const bounds = event.currentTarget.getBoundingClientRect();
    pointerX.set(((event.clientX - bounds.left) / bounds.width - 0.5) * 2);
    pointerY.set(((event.clientY - bounds.top) / bounds.height - 0.5) * 2);
  };

  const resetPointer = () => {
    pointerActive.current = false;
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveBy(-1);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      moveBy(1);
    }
  };

  const handlePointerDown = (event: PointerEvent<HTMLElement>) => {
    if (event.pointerType === "touch") pointerStart.current = event.clientX;
  };

  const handlePointerUp = (event: PointerEvent<HTMLElement>) => {
    if (event.pointerType !== "touch" || pointerStart.current === null) return;
    const delta = event.clientX - pointerStart.current;
    pointerStart.current = null;
    if (Math.abs(delta) > 42) moveBy(delta > 0 ? -1 : 1);
  };

  return (
    <motion.figure
      className="hero-visual-stage"
      data-hero-visual-stage
      aria-label="个人视觉档案，可切换人物、工作现场和个人作品占位"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onPointerMove={handlePointerMove}
      onPointerLeave={resetPointer}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      style={reducedMotion ? undefined : { rotateX, rotateY }}
    >
      <span className="visual-stage-depth visual-stage-depth-back" data-stage-layer aria-hidden="true" />
      <span className="visual-stage-depth visual-stage-depth-mid" data-stage-layer aria-hidden="true" />

      <div className="visual-stage-surface" data-stage-layer>
        <header className="visual-stage-header">
          <span className="pixel-type">VISUAL ARCHIVE</span>
          <span className="visual-stage-counter" aria-hidden="true">
            {activeMode.index}<i />{String(modes.length).padStart(2, "0")}
          </span>
        </header>

        <div
          className="visual-stage-viewport"
          id="visual-stage-panel"
          role="tabpanel"
          aria-label={`${activeMode.label}视觉素材`}
          aria-live="polite"
        >
          <motion.span
            className="visual-stage-light-field"
            style={reducedMotion ? undefined : { x: lightX, y: lightY }}
            aria-hidden="true"
          ><i /></motion.span>

          <AnimatePresence initial={false} custom={direction} mode="popLayout">
            <motion.div
              key={activeMode.id}
              className="visual-stage-frame"
              data-visual-mode={activeMode.id}
              custom={direction}
              initial={reducedMotion ? { opacity: 0 } : { opacity: 0, x: direction * 46, rotate: direction * 1.4, scale: 0.985 }}
              animate={{ opacity: 1, x: 0, rotate: 0, scale: 1 }}
              exit={reducedMotion ? { opacity: 0 } : { opacity: 0, x: direction * -34, rotate: direction * -0.8, scale: 0.99 }}
              transition={{ duration: reducedMotion ? 0.08 : 0.46, ease: [0.22, 1, 0.36, 1] }}
            >
              {activeMode.src ? (
                <img src={activeMode.src} alt={activeMode.alt ?? activeMode.title} />
              ) : (
                <motion.div className="visual-stage-placeholder" style={reducedMotion ? undefined : { x: mediaX, y: mediaY }}>
                  <span className="visual-guide visual-guide-vertical" aria-hidden="true" />
                  <span className="visual-guide visual-guide-horizontal" aria-hidden="true" />
                  <span className="visual-aperture" aria-hidden="true">
                    <ActiveIcon size={46} weight="light" />
                  </span>
                  <div className="visual-placeholder-copy">
                    <span>{activeMode.placeholder}</span>
                    <small>待替换真实素材</small>
                  </div>
                  <span className="visual-stage-pixel visual-stage-pixel-one" aria-hidden="true" />
                  <span className="visual-stage-pixel visual-stage-pixel-two" aria-hidden="true" />
                  <span className="visual-stage-pixel visual-stage-pixel-three" aria-hidden="true" />
                </motion.div>
              )}

              <div className="visual-stage-label">
                <span className="pixel-type">{activeMode.index} / {activeMode.label}</span>
                <strong>{activeMode.title}</strong>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="visual-stage-controls">
          <div className="visual-stage-tabs" role="tablist" aria-label="选择视觉素材类型">
            {modes.map((mode, index) => {
              const ModeIcon = mode.icon;
              return (
                <button
                  key={mode.id}
                  type="button"
                  role="tab"
                  aria-selected={index === activeIndex}
                  aria-controls="visual-stage-panel"
                  onClick={() => selectMode(index)}
                >
                  <ModeIcon size={17} weight={index === activeIndex ? "fill" : "regular"} />
                  <span>{mode.label}</span>
                </button>
              );
            })}
          </div>

          <div className="visual-stage-arrows">
            <button type="button" aria-label="上一张视觉素材" title="上一张" onClick={() => moveBy(-1)}>
              <ArrowLeftIcon size={18} weight="bold" />
            </button>
            <button type="button" aria-label="下一张视觉素材" title="下一张" onClick={() => moveBy(1)}>
              <ArrowRightIcon size={18} weight="bold" />
            </button>
          </div>
        </div>
      </div>

      <figcaption id="visual-stage-description" aria-live="polite">
        <span>{activeMode.description}</span>
        <i aria-hidden="true" />
      </figcaption>
    </motion.figure>
  );
}
