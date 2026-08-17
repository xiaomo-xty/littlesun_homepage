import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpRightIcon,
  InfoIcon,
} from "@phosphor-icons/react";
import {
  AnimatePresence,
  motion,
  type PanInfo,
  useAnimate,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { projects, type Project } from "../data/projects";

type Filter = "all" | Project["category"];

type DeckTransition = {
  token: number;
  direction: 1 | -1;
  from: Project;
  to: Project;
  toIndex: number;
  nextFilter?: Filter;
  targetProjects: Project[];
};

const filters: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "全部" },
  { id: "project", label: "项目" },
  { id: "experience", label: "经历" },
  { id: "open-source", label: "开源" },
  { id: "direction", label: "方向" },
];

const burstPixels = [
  [-92, -58], [-62, -94], [-24, -74], [20, -102], [62, -68], [96, -28],
  [-100, 16], [-72, 64], [-24, 92], [20, 76], [70, 88], [102, 34],
] as const;

const cardSpring = {
  type: "spring",
  stiffness: 470,
  damping: 36,
  mass: 0.72,
} as const;

const drawEase = [0.16, 1, 0.3, 1] as const;
const flipEase = [0.65, 0, 0.35, 1] as const;
const retractEase = [0.4, 0, 1, 1] as const;

function getProjects(filter: Filter) {
  return filter === "all" ? projects : projects.filter((project) => project.category === filter);
}

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

type CardFrontProps = {
  project: Project;
  position: number;
  total: number;
  instanceKey: string;
  detailsOpen: boolean;
  onToggleDetails: () => void;
  interactive?: boolean;
};

function CardFront({
  project,
  position,
  total,
  instanceKey,
  detailsOpen,
  onToggleDetails,
  interactive = true,
}: CardFrontProps) {
  const detailsId = `details-${project.id}-${instanceKey}`;

  return (
    <article
      className={`project-card card-face card-front${detailsOpen ? " is-details-open" : ""}`}
      aria-hidden={!interactive}
      inert={interactive ? undefined : true}
    >
      <header>
        <span className="pixel-type">{project.kind}</span>
        <span className="card-status">{project.status}</span>
      </header>

      <div className="card-title-row">
        <h3>{project.title}</h3>
        <span className="card-number pixel-type">
          {String(position + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
        </span>
      </div>

      <div className="card-body">
        <p className="card-summary">{project.summary}</p>
        <div className="project-media" data-card-art={project.id}>
          <span className="card-art-plane card-art-plane-one" aria-hidden="true"></span>
          <span className="card-art-plane card-art-plane-two" aria-hidden="true"></span>
          <span className="card-art-axis" aria-hidden="true"></span>
          <span className="card-art-pixel card-art-pixel-one" aria-hidden="true"></span>
          <span className="card-art-pixel card-art-pixel-two" aria-hidden="true"></span>
          <span className="project-media-label">{project.mediaLabel}</span>
        </div>

        <dl className="card-attributes">
          {project.attributes.map((attribute) => (
            <div key={attribute.label}>
              <dt>{attribute.label}</dt>
              <dd>{attribute.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="technology-tags" aria-label="技术栈">
        {project.technologies.map((technology) => <span key={technology}>{technology}</span>)}
      </div>

      <footer className="card-footer">
        <div className="project-actions" aria-label="项目链接">
          {project.links.length > 0 ? project.links.map((link) => (
            <a key={link.href} href={link.href} data-link-kind={link.kind} target="_blank" rel="noreferrer" tabIndex={interactive ? undefined : -1}>
              <span>{link.label}</span>
              <ArrowUpRightIcon size={16} weight="bold" />
            </a>
          )) : <span className="project-link-pending">公开链接待补充</span>}
        </div>
        <motion.button
          className="detail-control"
          type="button"
          aria-expanded={detailsOpen}
          aria-controls={detailsId}
          onClick={onToggleDetails}
          disabled={!interactive}
          whileHover={interactive ? { scale: 1.04 } : undefined}
          whileTap={interactive ? { scale: 0.96 } : undefined}
        >
          <InfoIcon size={19} weight="bold" />
          <span>{detailsOpen ? "收起详情" : "查看详情"}</span>
        </motion.button>
      </footer>

      <aside id={detailsId} className="card-detail-panel">
        <p className="pixel-type">PROJECT NOTES</p>
        <div className="evidence-list">
          <section><strong>问题</strong><p>{project.problem}</p></section>
          <section><strong>过程</strong><p>{project.process}</p></section>
          <section><strong>证据</strong><p>{project.evidence}</p></section>
        </div>
      </aside>
    </article>
  );
}

type CardSceneProps = CardFrontProps & {
  sceneRole?: string;
  initialBack?: boolean;
};

function CardScene({ sceneRole, initialBack = false, ...props }: CardSceneProps) {
  return (
    <motion.div
      className="card-scene"
      data-role={sceneRole}
      initial={initialBack ? { rotateY: 180 } : false}
      style={{ transformStyle: "preserve-3d" }}
    >
      <CardFront {...props} />
      <article className="project-card card-face card-back" aria-hidden="true">
        <DecorativeCardBack />
      </article>
    </motion.div>
  );
}

export default function ProjectDeck() {
  const reduceMotion = Boolean(useReducedMotion());
  const [filter, setFilter] = useState<Filter>("all");
  const [current, setCurrent] = useState(0);
  const [transition, setTransition] = useState<DeckTransition | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [dealCycle, setDealCycle] = useState(0);
  const [ready, setReady] = useState(false);
  const [stageInView, setStageInView] = useState(false);
  const [scope, animate] = useAnimate();
  const stageRef = useRef<HTMLDivElement>(null);
  const operationRef = useRef(0);
  const transitionTokenRef = useRef(0);
  const wasInViewRef = useRef(false);

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

  const filteredProjects = useMemo(() => getProjects(filter), [filter]);
  const selected = filteredProjects[current];
  const deckProjects = transition?.targetProjects ?? filteredProjects;
  const deckIndex = transition?.toIndex ?? current;
  const sideboardProject = transition?.to ?? selected;

  const previewCards = useMemo(() => {
    const previewCount = Math.min(2, Math.max(0, deckProjects.length - 1));
    return Array.from({ length: previewCount }, (_, offset) => {
      const index = (deckIndex + offset + 1) % deckProjects.length;
      return { project: deckProjects[index], index, depth: offset + 1 };
    });
  }, [deckIndex, deckProjects]);

  const resetPointer = () => {
    pointerX.set(0);
    pointerY.set(0);
  };

  useEffect(() => {
    const section = document.querySelector<HTMLElement>("[data-project-stage]");
    const syncPresence = () => {
      setStageInView(section?.dataset.revealState === "visible");
    };
    const handlePresence = (event: Event) => {
      const detail = (event as CustomEvent<{ id?: string; visible?: boolean }>).detail;
      if (detail?.id === "projects") setStageInView(Boolean(detail.visible));
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
    if (stageInView && !wasInViewRef.current) {
      wasInViewRef.current = true;
      if (!transition) setDealCycle((cycle) => cycle + 1);
      return;
    }

    if (!stageInView && wasInViewRef.current) {
      wasInViewRef.current = false;
      if (transition || reduceMotion) return;
      setReady(false);
      void animate([
        ["[data-role='active-shell']", { opacity: 0.35, y: -10 }, { duration: 0.24, ease: retractEase }],
        ["[data-preview-card]", { opacity: 0.18, y: -6 }, { duration: 0.22, ease: retractEase, at: 0 }],
      ]);
    }
  }, [animate, reduceMotion, stageInView, transition]);

  useEffect(() => {
    if (dealCycle === 0) return;
    const operation = ++operationRef.current;
    setDetailsOpen(false);
    setReady(false);

    const run = async () => {
      if (reduceMotion) {
        setReady(true);
        return;
      }

      await animate([
        ["[data-preview-depth='2']", { opacity: [0, 0.5], x: ["36%", "11.6%"], y: [-92, 30], scale: [0.82, 0.93], rotateZ: [14, 6.4] }, { duration: 0.36, ease: drawEase }],
        ["[data-preview-depth='1']", { opacity: [0, 0.82], x: ["40%", "5.8%"], y: [-98, 15], scale: [0.84, 0.965], rotateZ: [12, 3.2] }, { duration: 0.4, ease: drawEase, at: 0.12 }],
        ["[data-role='active-shell']", { opacity: [0, 1], x: ["42%", "0%"], y: [-104, 0], scale: [0.84, 1.025, 1], rotateZ: [15, -1.2, 0] }, { duration: 0.58, ease: drawEase, at: 0.24 }],
        ["[data-role='active-scene']", { rotateY: [180, 0] }, { duration: 0.38, ease: flipEase, at: 0.43 }],
      ]);

      if (operation === operationRef.current) setReady(true);
    };

    void run();
    return () => { operationRef.current += 1; };
  }, [animate, dealCycle, reduceMotion]);

  useEffect(() => {
    if (!transition) return;
    const activeTransition = transition;
    const operation = ++operationRef.current;

    const finish = () => {
      if (activeTransition.nextFilter) setFilter(activeTransition.nextFilter);
      setCurrent(activeTransition.toIndex);
      setTransition(null);
      setReady(true);
    };

    const run = async () => {
      if (reduceMotion) {
        finish();
        return;
      }

      await animate([
        ["[data-role='outgoing-scene']", { rotateY: [0, 180] }, { duration: 0.26, ease: flipEase }],
        ["[data-role='outgoing-shell']", {
          opacity: [1, 0.55],
          x: ["0%", `${activeTransition.direction * 10}%`],
          y: [0, 24],
          scale: [1, 0.94],
          rotateZ: [0, activeTransition.direction * 5.5],
        }, { duration: 0.46, ease: retractEase, at: 0.08 }],
        ["[data-role='incoming-shell']", {
          opacity: [0.32, 1],
          x: [activeTransition.direction > 0 ? "24%" : "-18%", "0%"],
          y: [-74, 0],
          scale: [0.88, 1.025, 1],
          rotateZ: [activeTransition.direction * 9, -activeTransition.direction * 1.2, 0],
        }, { duration: 0.6, ease: drawEase, at: 0.22 }],
        ["[data-role='incoming-scene']", { rotateY: [180, 0] }, { duration: 0.4, ease: flipEase, at: 0.4 }],
      ]);

      if (operation === operationRef.current) finish();
    };

    void run();
    return () => { operationRef.current += 1; };
  }, [animate, reduceMotion, transition]);

  const startTransition = (
    nextIndex: number,
    direction: 1 | -1,
    nextFilter?: Filter,
  ) => {
    if (!selected || transition || !ready) return;
    const targetProjects = nextFilter ? getProjects(nextFilter) : filteredProjects;
    const target = targetProjects[nextIndex];
    if (!target) return;

    resetPointer();
    setDetailsOpen(false);
    setReady(false);
    window.dispatchEvent(new CustomEvent("homepage:project-pulse", {
      detail: { direction, project: target.id },
    }));
    transitionTokenRef.current += 1;
    setTransition({
      token: transitionTokenRef.current,
      direction,
      from: selected,
      to: target,
      toIndex: nextIndex,
      nextFilter,
      targetProjects,
    });
  };

  const chooseFilter = (nextFilter: Filter) => {
    if (nextFilter === filter || transition || !ready) return;
    const target = getProjects(nextFilter)[0];

    if (target?.id === selected.id) {
      resetPointer();
      setDetailsOpen(false);
      setFilter(nextFilter);
      setCurrent(0);
      return;
    }

    startTransition(0, 1, nextFilter);
  };

  const chooseCard = (index: number) => {
    if (index === current || filteredProjects.length < 2) return;
    const forward = (index - current + filteredProjects.length) % filteredProjects.length;
    const backward = (current - index + filteredProjects.length) % filteredProjects.length;
    startTransition(index, forward <= backward ? 1 : -1);
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
    if (reduceMotion || transition || !ready || detailsOpen || event.pointerType === "touch") return;
    const rect = event.currentTarget.getBoundingClientRect();
    pointerX.set((event.clientX - rect.left) / rect.width - 0.5);
    pointerY.set((event.clientY - rect.top) / rect.height - 0.5);
  };

  if (!selected || !sideboardProject) {
    return (
      <section id="projects" className="projects-section">
        <div className="shell deck-empty-state">
          <h2>暂时没有这一类作品</h2>
          <button type="button" onClick={() => setFilter("all")}>查看全部</button>
        </div>
      </section>
    );
  }

  const busy = Boolean(transition) || !ready;
  const controlsDisabled = filteredProjects.length < 2 || busy;
  const displayPosition = transition?.toIndex ?? current;
  const displayTotal = deckProjects.length;

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
              >{item.label}</button>
            ))}
          </div>

          <aside className="project-sideboard" aria-live="polite">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={sideboardProject.id}
                className="sideboard-content"
                initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
                transition={{ duration: reduceMotion ? 0.01 : 0.32, delay: transition ? 0.16 : 0, ease: drawEase }}
              >
                <header>
                  <span className="pixel-type">CURRENT CARD</span>
                  <span className="pixel-type">{String(displayPosition + 1).padStart(2, "0")} / {String(displayTotal).padStart(2, "0")}</span>
                </header>
                <h3>{sideboardProject.title} 的证据面板</h3>
                <div className="sideboard-story">
                  <section><strong className="pixel-type">PROBLEM</strong><p>{sideboardProject.problem}</p></section>
                  <section><strong className="pixel-type">PROCESS</strong><p>{sideboardProject.process}</p></section>
                  <section><strong className="pixel-type">EVIDENCE</strong><p>{sideboardProject.evidence}</p></section>
                </div>
              </motion.div>
            </AnimatePresence>

            <div className="deck-rail" aria-label="当前牌组">
              {deckProjects.map((project, index) => (
                <button
                  key={project.id}
                  className={displayPosition === index ? "is-active" : undefined}
                  type="button"
                  onClick={() => chooseCard(index)}
                  disabled={busy || transition?.nextFilter !== undefined}
                  aria-label={`抽取${project.title}`}
                >
                  <span aria-hidden="true"></span>
                  <small className="pixel-type">{project.title}</small>
                </button>
              ))}
            </div>
          </aside>
        </div>

        <div
          ref={stageRef}
          className="deck-stage"
          tabIndex={0}
          aria-busy={busy}
          data-deal-cycle={dealCycle}
          data-in-view={stageInView}
          data-ready={ready}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return;
            if (event.key === "ArrowLeft") navigate(-1);
            if (event.key === "ArrowRight") navigate(1);
            if (event.key === " " || event.key === "Enter") {
              event.preventDefault();
              if (!busy) setDetailsOpen((open) => !open);
            }
          }}
        >
          <div ref={scope} className="deck-stack" onPointerMove={handlePointerMove} onPointerLeave={resetPointer}>
            {previewCards.map(({ project, index, depth }) => {
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
                  data-preview-card
                  data-preview-depth={depth}
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
                  <article className="project-card deck-preview-face"><DecorativeCardBack /></article>
                </motion.div>
              );
            })}

            {transition ? (
              <>
                <motion.div className="deck-motion-shell transition-card" data-role="outgoing-shell" style={{ zIndex: 4 }}>
                  <CardScene
                    project={transition.from}
                    position={current}
                    total={filteredProjects.length}
                    instanceKey={`outgoing-${transition.token}`}
                    detailsOpen={false}
                    onToggleDetails={() => undefined}
                    interactive={false}
                    sceneRole="outgoing-scene"
                  />
                </motion.div>
                <motion.div
                  key={`incoming-${transition.token}`}
                  className="deck-motion-shell transition-card"
                  data-role="incoming-shell"
                  initial={{ opacity: 0.32, x: transition.direction > 0 ? "24%" : "-18%", y: -74, scale: 0.88, rotateZ: transition.direction * 9 }}
                  style={{ zIndex: 5 }}
                >
                  <CardScene
                    project={transition.to}
                    position={transition.toIndex}
                    total={transition.targetProjects.length}
                    instanceKey={`incoming-${transition.token}`}
                    detailsOpen={false}
                    onToggleDetails={() => undefined}
                    interactive={false}
                    sceneRole="incoming-scene"
                    initialBack
                  />
                </motion.div>
              </>
            ) : (
              <motion.div className="deck-motion-shell" data-role="active-shell" style={{ zIndex: 4 }}>
                <motion.div
                  className="deck-gesture-card"
                  style={reduceMotion ? undefined : { rotateX, rotateY }}
                  drag={filteredProjects.length > 1 && ready && !detailsOpen ? "x" : false}
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={0.16}
                  onDragEnd={handleDragEnd}
                >
                  <CardScene
                    project={selected}
                    position={current}
                    total={filteredProjects.length}
                    instanceKey="active"
                    detailsOpen={detailsOpen}
                    onToggleDetails={() => setDetailsOpen((open) => !open)}
                    interactive={ready}
                    sceneRole="active-scene"
                  />
                </motion.div>
              </motion.div>
            )}

            {(transition || dealCycle > 0) && !reduceMotion && (
              <div key={transition?.token ?? `deal-${dealCycle}`} className="pixel-burst" aria-hidden="true">
                {burstPixels.map(([x, y], index) => (
                  <span
                    key={`${x}-${y}`}
                    style={{
                      "--burst-x": `${x}px`,
                      "--burst-y": `${y}px`,
                      "--burst-delay": `${(transition ? 390 : 540) + index * 9}ms`,
                    } as React.CSSProperties}
                  ></span>
                ))}
              </div>
            )}
          </div>

          <button
            className="mobile-evidence-summary"
            type="button"
            aria-expanded={detailsOpen}
            onClick={() => setDetailsOpen((open) => !open)}
            disabled={busy}
          >
            <span><small className="pixel-type">PROBLEM / PROCESS / EVIDENCE</small>{sideboardProject.summary}</span>
            <strong>{detailsOpen ? "收起" : "展开详情"} +</strong>
          </button>

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
            ><ArrowLeftIcon size={24} weight="bold" /></motion.button>
            <div className="deck-readout">
              <strong>{sideboardProject.title}</strong>
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
            ><ArrowRightIcon size={24} weight="bold" /></motion.button>
          </div>
          <p className="sr-only" aria-live="polite">当前作品：{sideboardProject.title}，{busy ? "正在抽取" : "正面已展示"}</p>
        </div>
      </div>
    </section>
  );
}
