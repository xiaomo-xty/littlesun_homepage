import {
  ArrowCounterClockwiseIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
} from "@phosphor-icons/react";
import {
  AnimatePresence,
  motion,
  type PanInfo,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";
import { useMemo, useState } from "react";
import { projects, type Project } from "../data/projects";

type Filter = "all" | Project["category"];

const filters: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "全部" },
  { id: "project", label: "项目" },
  { id: "experience", label: "经历" },
  { id: "open-source", label: "开源" },
  { id: "direction", label: "方向" },
];

const burstPixels = [
  [-88, -54],
  [-56, -92],
  [-18, -70],
  [24, -96],
  [64, -62],
  [94, -24],
  [-96, 18],
  [-70, 62],
  [-24, 88],
  [22, 72],
  [68, 84],
  [98, 32],
] as const;

export default function ProjectDeck() {
  const reduceMotion = useReducedMotion();
  const [filter, setFilter] = useState<Filter>("all");
  const [current, setCurrent] = useState(0);
  const [direction, setDirection] = useState(1);
  const [flipped, setFlipped] = useState(false);
  const [burstKey, setBurstKey] = useState(0);

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

  const chooseFilter = (nextFilter: Filter) => {
    setFilter(nextFilter);
    setCurrent(0);
    setDirection(1);
    setFlipped(false);
  };

  const chooseCard = (index: number) => {
    if (index === current) return;
    setDirection(index > current ? 1 : -1);
    setCurrent(index);
    setFlipped(false);
    setBurstKey((key) => key + 1);
  };

  const navigate = (delta: number) => {
    if (filteredProjects.length < 2) return;
    setDirection(delta > 0 ? 1 : -1);
    setCurrent((index) => (index + delta + filteredProjects.length) % filteredProjects.length);
    setFlipped(false);
    setBurstKey((key) => key + 1);
  };

  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (Math.abs(info.offset.x) < 70 && Math.abs(info.velocity.x) < 420) return;
    navigate(info.offset.x < 0 ? 1 : -1);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (reduceMotion || event.pointerType === "touch") return;
    const rect = event.currentTarget.getBoundingClientRect();
    pointerX.set((event.clientX - rect.left) / rect.width - 0.5);
    pointerY.set((event.clientY - rect.top) / rect.height - 0.5);
  };

  const resetPointer = () => {
    pointerX.set(0);
    pointerY.set(0);
  };

  if (!selected) {
    return (
      <section id="projects" className="projects-section">
        <div className="shell deck-empty-state">
          <h2>暂时没有这一类作品</h2>
          <button type="button" onClick={() => chooseFilter("all")}>查看全部</button>
        </div>
      </section>
    );
  }

  return (
    <section
      id="projects"
      className="projects-section"
      aria-label="可交互作品牌组"
    >
      <div className="shell projects-grid">
        <div className="projects-copy">
          <p className="pixel-type">WORK DECK</p>
          <h2>作品会增长，牌组不封顶。</h2>
          <p>项目、经历与协作记录使用同一套证据结构：问题、过程与证据。</p>

          <div className="deck-filters" aria-label="筛选作品类型">
            {filters.map((item) => (
              <button
                key={item.id}
                className={filter === item.id ? "is-active" : undefined}
                type="button"
                onClick={() => chooseFilter(item.id)}
                aria-pressed={filter === item.id}
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
              >
                <span>{project.title}</span>
                <small className="pixel-type">{project.kind.split(" / ")[0]}</small>
              </button>
            ))}
          </div>

          <div className="delivery-note">
            <strong>先交付，再扩展。</strong>
            <span>卡牌只承载已经发生、可以解释的工作。</span>
          </div>
        </div>

        <div
          className="deck-stage"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return;
            if (event.key === "ArrowLeft") navigate(-1);
            if (event.key === "ArrowRight") navigate(1);
            if (event.key === " " || event.key === "Enter") {
              event.preventDefault();
              setFlipped((value) => !value);
            }
          }}
        >
          <div
            className="deck-stack"
            onPointerMove={handlePointerMove}
            onPointerLeave={resetPointer}
          >
            <span className="deck-shadow-card deck-shadow-third" aria-hidden="true"></span>
            <span className="deck-shadow-card deck-shadow-second" aria-hidden="true"></span>

            <AnimatePresence custom={direction} mode="wait" initial={false}>
              <motion.div
                key={selected.id}
                className="deck-motion-shell"
                custom={direction}
                initial={reduceMotion ? false : { opacity: 0, x: direction * 90, rotateZ: direction * 3 }}
                animate={{ opacity: 1, x: 0, rotateZ: 0 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: direction * -110, rotateZ: direction * -4 }}
                transition={reduceMotion ? { duration: 0.01 } : { type: "spring", stiffness: 280, damping: 24 }}
              >
                <motion.div
                  className="deck-gesture-card"
                  style={reduceMotion ? undefined : { rotateX, rotateY }}
                  drag={filteredProjects.length > 1 && !flipped ? "x" : false}
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={0.16}
                  onDragEnd={handleDragEnd}
                >
                  <motion.div
                    className="card-scene"
                    animate={{ rotateY: flipped ? 180 : 0 }}
                    transition={reduceMotion ? { duration: 0.01 } : { type: "spring", stiffness: 240, damping: 24 }}
                  >
                    <article className="project-card card-face card-front" aria-hidden={flipped}>
                      <header>
                        <span className="pixel-type">{selected.kind}</span>
                        <strong>{selected.status}</strong>
                      </header>
                      <h3>{selected.title}</h3>
                      <p className="card-summary">{selected.summary}</p>
                      <div className="project-media">
                        <span className="pixel-corner corner-nw" aria-hidden="true"></span>
                        <span className="pixel-corner corner-ne" aria-hidden="true"></span>
                        <span className="pixel-corner corner-sw" aria-hidden="true"></span>
                        <span className="pixel-corner corner-se" aria-hidden="true"></span>
                        <span>{selected.mediaLabel}</span>
                      </div>
                      <p className="technology-line">{selected.technologies.join(" / ")}</p>
                      <motion.button
                        className="flip-control"
                        type="button"
                        onClick={() => setFlipped(true)}
                        whileHover={reduceMotion ? undefined : { scale: 1.04 }}
                        whileTap={reduceMotion ? undefined : { scale: 0.96 }}
                      >
                        <ArrowCounterClockwiseIcon size={22} weight="bold" />
                        <span>查看背面</span>
                      </motion.button>
                    </article>

                    <article className="project-card card-face card-back" aria-hidden={!flipped}>
                      <header>
                        <span className="pixel-type">EVIDENCE / BACK</span>
                        <strong>{selected.status}</strong>
                      </header>
                      <h3>{selected.title}</h3>
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
                      <p className="technology-line">{selected.technologies.join(" / ")}</p>
                      <motion.button
                        className="flip-control"
                        type="button"
                        onClick={() => setFlipped(false)}
                        whileHover={reduceMotion ? undefined : { scale: 1.04 }}
                        whileTap={reduceMotion ? undefined : { scale: 0.96 }}
                      >
                        <ArrowCounterClockwiseIcon size={22} weight="bold" />
                        <span>返回正面</span>
                      </motion.button>
                    </article>
                  </motion.div>
                </motion.div>
              </motion.div>
            </AnimatePresence>

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
              disabled={filteredProjects.length < 2}
              aria-label="上一张作品"
              title="上一张作品"
              whileHover={reduceMotion ? undefined : { scale: 1.07 }}
              whileTap={reduceMotion ? undefined : { scale: 0.93 }}
            >
              <ArrowLeftIcon size={24} weight="bold" />
            </motion.button>
            <strong>{selected.title}</strong>
            <motion.button
              className="icon-command is-primary"
              type="button"
              onClick={() => navigate(1)}
              disabled={filteredProjects.length < 2}
              aria-label="下一张作品"
              title="下一张作品"
              whileHover={reduceMotion ? undefined : { scale: 1.07 }}
              whileTap={reduceMotion ? undefined : { scale: 0.93 }}
            >
              <ArrowRightIcon size={24} weight="bold" />
            </motion.button>
          </div>
          <p className="sr-only" aria-live="polite">当前作品：{selected.title}，{flipped ? "背面" : "正面"}</p>
        </div>
      </div>
    </section>
  );
}
