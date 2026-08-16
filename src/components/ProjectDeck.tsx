import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpRightIcon,
  InfoIcon,
} from "@phosphor-icons/react";
import {
  motion,
  type PanInfo,
  useInView,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { projects, type Project } from "../data/projects";

type Filter = "all" | Project["category"];
type DeckPhase = "dealing" | "idle" | "covering" | "retracting" | "drawing" | "revealing";

const filters: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "全部" },
  { id: "project", label: "项目" },
  { id: "experience", label: "经历" },
  { id: "open-source", label: "开源" },
  { id: "direction", label: "方向" },
];

const burstPixels = [
  [-92, -58],
  [-62, -94],
  [-24, -74],
  [20, -102],
  [62, -68],
  [96, -28],
  [-100, 16],
  [-72, 64],
  [-24, 92],
  [20, 76],
  [70, 88],
  [102, 34],
] as const;

const cardSpring = {
  type: "spring",
  stiffness: 470,
  damping: 36,
  mass: 0.72,
} as const;

const centerPose = { opacity: 1, x: "0%", y: 0, scale: 1, rotateZ: 0, zIndex: 4 };
const deckPose = { opacity: 0.7, x: "10%", y: 24, scale: 0.94, rotateZ: 5.5, zIndex: 1 };
const dealSourcePose = { opacity: 0, x: "42%", y: -104, scale: 0.84, rotateZ: 15, zIndex: 4 };

function DecorativeCardBack() {
  return (
    <div className="card-back-design" aria-hidden="true">
      <span className="back-frame"></span>
      <span className="back-orbit back-orbit-one"></span>
      <span className="back-orbit back-orbit-two"></span>
      <span className="back-core"></span>
      <span className="back-pixel back-pixel-one"></span>
      <span className="back-pixel back-pixel-two"></span>
      <span className="back-pixel back-pixel-three"></span>
      <span className="back-pixel back-pixel-four"></span>
    </div>
  );
}

export default function ProjectDeck() {
  const reduceMotion = Boolean(useReducedMotion());
  const [filter, setFilter] = useState<Filter>("all");
  const [current, setCurrent] = useState(0);
  const [direction, setDirection] = useState(1);
  const [phase, setPhase] = useState<DeckPhase>("dealing");
  const [faceUp, setFaceUp] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [dealCount, setDealCount] = useState(0);
  const [burstKey, setBurstKey] = useState(0);
  const stageRef = useRef<HTMLDivElement>(null);
  const dealStartedRef = useRef(false);
  const transitioningRef = useRef(false);
  const timersRef = useRef<number[]>([]);
  const stageInView = useInView(stageRef, { once: true, amount: 0.18 });

  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const rotateX = useSpring(useTransform(pointerY, [-0.5, 0.5], [3.5, -3.5]), {
    stiffness: 280,
    damping: 24,
  });
  const rotateY = useSpring(useTransform(pointerX, [-0.5, 0.5], [-4.5, 4.5]), {
    stiffness: 280,
    damping: 24,
  });

  const filteredProjects = useMemo(
    () => (filter === "all" ? projects : projects.filter((project) => project.category === filter)),
    [filter],
  );
  const selected = filteredProjects[current];
  const previewCards = useMemo(() => {
    const previewCount = Math.min(2, Math.max(0, filteredProjects.length - 1));
    return Array.from({ length: previewCount }, (_, offset) => {
      const index = (current + offset + 1) % filteredProjects.length;
      return { project: filteredProjects[index], index, depth: offset + 1 };
    });
  }, [current, filteredProjects]);

  const schedule = (callback: () => void, delay: number) => {
    const timer = window.setTimeout(callback, delay);
    timersRef.current.push(timer);
  };

  const resetPointer = () => {
    pointerX.set(0);
    pointerY.set(0);
  };

  useEffect(() => () => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
  }, []);

  useEffect(() => {
    if (!stageInView || dealStartedRef.current) return;
    dealStartedRef.current = true;

    if (reduceMotion) {
      setDealCount(3);
      setFaceUp(true);
      setPhase("idle");
      return;
    }

    setDealCount(1);
    schedule(() => setDealCount(2), 150);
    schedule(() => setDealCount(3), 330);
    schedule(() => {
      setPhase("revealing");
      setFaceUp(true);
      setBurstKey((key) => key + 1);
    }, 650);
    schedule(() => setPhase("idle"), 1040);
  }, [stageInView, reduceMotion]);

  const startTransition = (nextIndex: number, nextDirection: number, nextFilter?: Filter) => {
    if (transitioningRef.current || phase !== "idle" || dealCount < 3) return;

    transitioningRef.current = true;
    resetPointer();
    setDetailsOpen(false);
    setDirection(nextDirection);
    setPhase("covering");
    setFaceUp(false);

    if (reduceMotion) {
      schedule(() => {
        if (nextFilter) setFilter(nextFilter);
        setCurrent(nextIndex);
        setFaceUp(true);
        setBurstKey((key) => key + 1);
        setPhase("idle");
        transitioningRef.current = false;
      }, 10);
      return;
    }

    schedule(() => setPhase("retracting"), 260);
    schedule(() => {
      if (nextFilter) setFilter(nextFilter);
      setCurrent(nextIndex);
      setPhase("drawing");
    }, 500);
    schedule(() => {
      setPhase("revealing");
      setFaceUp(true);
      setBurstKey((key) => key + 1);
    }, 810);
    schedule(() => {
      setPhase("idle");
      transitioningRef.current = false;
    }, 1160);
  };

  const chooseFilter = (nextFilter: Filter) => {
    if (nextFilter === filter) return;
    startTransition(0, 1, nextFilter);
  };

  const chooseCard = (index: number) => {
    if (index === current) return;
    const forwardDistance = (index - current + filteredProjects.length) % filteredProjects.length;
    const backwardDistance = (current - index + filteredProjects.length) % filteredProjects.length;
    startTransition(index, forwardDistance <= backwardDistance ? 1 : -1);
  };

  const navigate = (delta: number) => {
    if (filteredProjects.length < 2) return;
    const nextIndex = (current + delta + filteredProjects.length) % filteredProjects.length;
    startTransition(nextIndex, delta > 0 ? 1 : -1);
  };

  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (Math.abs(info.offset.x) < 70 && Math.abs(info.velocity.x) < 420) return;
    navigate(info.offset.x < 0 ? 1 : -1);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (reduceMotion || phase !== "idle" || !faceUp || detailsOpen || event.pointerType === "touch") return;
    const rect = event.currentTarget.getBoundingClientRect();
    pointerX.set((event.clientX - rect.left) / rect.width - 0.5);
    pointerY.set((event.clientY - rect.top) / rect.height - 0.5);
  };

  if (!selected) {
    return (
      <section id="projects" className="projects-section">
        <div className="shell deck-empty-state">
          <h2>暂时没有这一类作品</h2>
          <button type="button" onClick={() => setFilter("all")}>查看全部</button>
        </div>
      </section>
    );
  }

  const busy = phase !== "idle";
  const controlsDisabled = filteredProjects.length < 2 || busy || dealCount < 3;
  const activeInitialPose = phase === "drawing" ? deckPose : dealSourcePose;
  const activePose = phase === "retracting" ? { ...deckPose, rotateZ: 5.5 * direction } : centerPose;

  return (
    <section id="projects" className="projects-section" aria-label="可交互作品牌组">
      <div className="shell projects-grid">
        <div className="projects-copy">
          <p className="pixel-type">WORK DECK</p>
          <h2>作品会增长，牌组不封顶。</h2>
          <p>每张牌记录一个真实问题、一段处理过程，以及可以继续补充的证据。</p>

          <div className="deck-filters" aria-label="筛选作品类型">
            {filters.map((item) => (
              <button
                key={item.id}
                className={filter === item.id ? "is-active" : undefined}
                type="button"
                onClick={() => chooseFilter(item.id)}
                aria-pressed={filter === item.id}
                disabled={busy}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="deck-index" aria-label="作品列表">
            {filteredProjects.map((project, index) => (
              <button
                key={project.id}
                className={current === index ? "is-active" : undefined}
                type="button"
                onClick={() => chooseCard(index)}
                aria-current={current === index ? "true" : undefined}
                disabled={busy}
              >
                <span>{project.title}</span>
                <small className="pixel-type">{project.kind.split(" / ")[0]}</small>
              </button>
            ))}
          </div>

          <div className="delivery-note">
            <strong>不是属性表，是工作现场。</strong>
            <span>技术栈只作为证据，项目链接只在真实可用时出现。</span>
          </div>
        </div>

        <div
          ref={stageRef}
          className="deck-stage"
          tabIndex={0}
          aria-busy={busy}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return;
            if (event.key === "ArrowLeft") navigate(-1);
            if (event.key === "ArrowRight") navigate(1);
            if (event.key === " " || event.key === "Enter") {
              event.preventDefault();
              if (!busy && faceUp) setDetailsOpen((open) => !open);
            }
          }}
        >
          <div className="deck-stack" onPointerMove={handlePointerMove} onPointerLeave={resetPointer}>
            {previewCards.map(({ project, index, depth }) => {
              const dealThreshold = previewCards.length - depth + 1;
              if (dealCount < dealThreshold) return null;
              const previewPose = {
                opacity: depth === 1 ? 0.82 : 0.5,
                x: `${depth * 5.8}%`,
                y: depth * 15,
                scale: 1 - depth * 0.035,
                rotateZ: depth * 3.2,
              };

              return (
                <motion.div
                  key={`preview-${project.id}`}
                  className="deck-preview-card"
                  initial={reduceMotion ? false : phase === "dealing" ? dealSourcePose : { ...previewPose, opacity: 0 }}
                  animate={previewPose}
                  transition={reduceMotion ? { duration: 0.01 } : cardSpring}
                  style={{ zIndex: 3 - depth }}
                  role="button"
                  tabIndex={busy ? -1 : 0}
                  aria-label={`抽取${project.title}`}
                  onClick={() => chooseCard(index)}
                  onKeyDown={(event) => {
                    if (event.key === " " || event.key === "Enter") {
                      event.preventDefault();
                      chooseCard(index);
                    }
                  }}
                >
                  <article className="project-card deck-preview-face">
                    <DecorativeCardBack />
                  </article>
                </motion.div>
              );
            })}

            {dealCount >= 3 && (
              <motion.div
                key={selected.id}
                className="deck-motion-shell"
                initial={reduceMotion ? false : activeInitialPose}
                animate={activePose}
                transition={reduceMotion ? { duration: 0.01 } : cardSpring}
                style={{ transformOrigin: "18% 82%" }}
              >
                <motion.div
                  className="deck-gesture-card"
                  style={reduceMotion ? undefined : { rotateX, rotateY }}
                  drag={filteredProjects.length > 1 && phase === "idle" && faceUp && !detailsOpen ? "x" : false}
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={0.16}
                  onDragEnd={handleDragEnd}
                >
                  <motion.div
                    className="card-scene"
                    initial={false}
                    animate={{ rotateY: faceUp ? 0 : 180 }}
                    transition={reduceMotion ? { duration: 0.01 } : { type: "spring", stiffness: 430, damping: 32, mass: 0.7 }}
                  >
                    <article className={`project-card card-face card-front${detailsOpen ? " is-details-open" : ""}`} aria-hidden={!faceUp}>
                      <header>
                        <span className="pixel-type">{selected.kind}</span>
                        <span className="card-status">{selected.status}</span>
                      </header>

                      <div className="card-title-row">
                        <h3>{selected.title}</h3>
                        <span className="card-number pixel-type">
                          {String(current + 1).padStart(2, "0")} / {String(filteredProjects.length).padStart(2, "0")}
                        </span>
                      </div>

                      <div className="card-body">
                        <p className="card-summary">{selected.summary}</p>
                        <div className="project-media" data-card-art={selected.id}>
                          <span className="card-art-plane card-art-plane-one" aria-hidden="true"></span>
                          <span className="card-art-plane card-art-plane-two" aria-hidden="true"></span>
                          <span className="card-art-axis" aria-hidden="true"></span>
                          <span className="card-art-pixel card-art-pixel-one" aria-hidden="true"></span>
                          <span className="card-art-pixel card-art-pixel-two" aria-hidden="true"></span>
                          <span className="project-media-label">{selected.mediaLabel}</span>
                        </div>

                        <dl className="card-attributes">
                          {selected.attributes.map((attribute) => (
                            <div key={attribute.label}>
                              <dt>{attribute.label}</dt>
                              <dd>{attribute.value}</dd>
                            </div>
                          ))}
                        </dl>
                      </div>

                      <div className="technology-tags" aria-label="技术栈">
                        {selected.technologies.map((technology) => <span key={technology}>{technology}</span>)}
                      </div>

                      <footer className="card-footer">
                        <div className="project-actions" aria-label="项目链接">
                          {selected.links.length > 0 ? selected.links.map((link) => (
                            <a key={link.href} href={link.href} data-link-kind={link.kind} target="_blank" rel="noreferrer">
                              <span>{link.label}</span>
                              <ArrowUpRightIcon size={16} weight="bold" />
                            </a>
                          )) : <span className="project-link-pending">公开链接待补充</span>}
                        </div>
                        <motion.button
                          className="detail-control"
                          type="button"
                          aria-expanded={detailsOpen}
                          aria-controls={`details-${selected.id}`}
                          onClick={() => setDetailsOpen((open) => !open)}
                          whileHover={reduceMotion ? undefined : { scale: 1.04 }}
                          whileTap={reduceMotion ? undefined : { scale: 0.96 }}
                        >
                          <InfoIcon size={19} weight="bold" />
                          <span>{detailsOpen ? "收起详情" : "查看详情"}</span>
                        </motion.button>
                      </footer>

                      <aside id={`details-${selected.id}`} className="card-detail-panel">
                        <p className="pixel-type">PROJECT NOTES</p>
                        <div className="evidence-list">
                          <section>
                            <strong>问题</strong>
                            <p>{selected.problem}</p>
                          </section>
                          <section>
                            <strong>过程</strong>
                            <p>{selected.process}</p>
                          </section>
                          <section>
                            <strong>证据</strong>
                            <p>{selected.evidence}</p>
                          </section>
                        </div>
                      </aside>
                    </article>

                    <article className="project-card card-face card-back" aria-hidden={faceUp}>
                      <DecorativeCardBack />
                    </article>
                  </motion.div>
                </motion.div>
              </motion.div>
            )}

            {!reduceMotion && burstKey > 0 && (
              <div key={burstKey} className="pixel-burst" aria-hidden="true">
                {burstPixels.map(([x, y], index) => (
                  <span
                    key={`${x}-${y}`}
                    style={{ "--burst-x": `${x}px`, "--burst-y": `${y}px`, "--burst-delay": `${index * 9}ms` } as React.CSSProperties}
                  ></span>
                ))}
              </div>
            )}
          </div>

          <div className="deck-controls">
            <motion.button
              className="icon-command"
              type="button"
              onClick={() => navigate(-1)}
              disabled={controlsDisabled}
              aria-label="上一张作品"
              title="上一张作品"
              whileHover={reduceMotion ? undefined : { scale: 1.07 }}
              whileTap={reduceMotion ? undefined : { scale: 0.93 }}
            >
              <ArrowLeftIcon size={24} weight="bold" />
            </motion.button>
            <div className="deck-readout">
              <strong>{selected.title}</strong>
              <span className="pixel-type">{busy ? "DRAWING" : "READY"}</span>
            </div>
            <motion.button
              className="icon-command is-primary"
              type="button"
              onClick={() => navigate(1)}
              disabled={controlsDisabled}
              aria-label="下一张作品"
              title="下一张作品"
              whileHover={reduceMotion ? undefined : { scale: 1.07 }}
              whileTap={reduceMotion ? undefined : { scale: 0.93 }}
            >
              <ArrowRightIcon size={24} weight="bold" />
            </motion.button>
          </div>
          <p className="sr-only" aria-live="polite">当前作品：{selected.title}，{busy ? "正在抽取" : "正面已展示"}</p>
        </div>
      </div>
    </section>
  );
}
