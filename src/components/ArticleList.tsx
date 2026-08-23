import { ArrowUpRightIcon, CaretDownIcon } from "@phosphor-icons/react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";
import { useState, type PointerEvent } from "react";
import { articles, type Article } from "../data/articles";
import SectionGuide from "./SectionGuide";

const revealEase = [0.16, 1, 0.3, 1] as const;

type ArticleRowProps = {
  article: Article;
  index: number;
};

function ArticleRow({ article, index }: ArticleRowProps) {
  const reduceMotion = Boolean(useReducedMotion());
  const [expanded, setExpanded] = useState(false);
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const rotateX = useSpring(useTransform(pointerY, [-0.5, 0.5], [1.2, -1.2]), {
    stiffness: 250,
    damping: 28,
  });
  const rotateY = useSpring(useTransform(pointerX, [-0.5, 0.5], [-1.8, 1.8]), {
    stiffness: 250,
    damping: 28,
  });
  const detailsId = `article-details-${index}`;
  const entryOffset = index % 2 === 0 ? -34 : 34;

  const resetPointer = () => {
    pointerX.set(0);
    pointerY.set(0);
  };

  const handlePointerMove = (event: PointerEvent<HTMLElement>) => {
    if (reduceMotion || event.pointerType !== "mouse") return;
    const bounds = event.currentTarget.getBoundingClientRect();
    pointerX.set((event.clientX - bounds.left) / bounds.width - 0.5);
    pointerY.set((event.clientY - bounds.top) / bounds.height - 0.5);
  };

  const title = article.status === "占位" ? `[文章占位] ${article.title}` : article.title;

  return (
    <motion.article
      className={`article-entry${expanded ? " is-expanded" : ""}`}
      initial={reduceMotion ? false : { opacity: 0, x: entryOffset, scale: 0.985 }}
      whileInView={{ opacity: 1, x: 0, scale: 1 }}
      viewport={{ once: false, amount: 0.28, margin: "-5% 0px -8% 0px" }}
      transition={{ duration: reduceMotion ? 0 : 0.58, delay: reduceMotion ? 0 : index * 0.055, ease: revealEase }}
      whileHover={reduceMotion ? undefined : { y: -3, scale: 1.006 }}
      whileTap={reduceMotion ? undefined : { scale: 0.994 }}
      onPointerMove={handlePointerMove}
      onPointerLeave={resetPointer}
      style={reduceMotion ? undefined : { rotateX, rotateY, transformPerspective: 1200 }}
    >
      <div className="article-copy">
        <div className="article-heading-row">
          {article.href ? (
            <a className="article-title-link" href={article.href} target="_blank" rel="noreferrer">
              <h3>{title}</h3>
              <ArrowUpRightIcon size={18} weight="bold" aria-hidden="true" />
            </a>
          ) : (
            <h3>{title}</h3>
          )}
        </div>

        <div className="article-meta">
          <p className="article-topic">{article.topic}</p>
          <span className="article-status pixel-type">{article.status}</span>
        </div>

        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              id={detailsId}
              className="article-description"
              initial={reduceMotion ? false : { opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
              transition={{ duration: reduceMotion ? 0 : 0.24, ease: revealEase }}
            >
              <p>{article.description}</p>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="article-controls">
          <motion.button
            type="button"
            aria-expanded={expanded}
            aria-controls={detailsId}
            onClick={() => setExpanded((current) => !current)}
            whileHover={reduceMotion ? undefined : { x: 3 }}
            whileTap={reduceMotion ? undefined : { scale: 0.96 }}
          >
            <motion.span animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: reduceMotion ? 0 : 0.22 }}>
              <CaretDownIcon size={17} weight="bold" aria-hidden="true" />
            </motion.span>
            {expanded ? "收起摘要" : "展开摘要"}
          </motion.button>
        </div>
      </div>

      <div className="article-thumbnail" aria-label="文章配图待补充">
        <span className="article-thumbnail-label">配图待补充</span>
        <span className="pixel-corner corner-nw" aria-hidden="true"></span>
        <span className="pixel-corner corner-ne" aria-hidden="true"></span>
        <span className="pixel-corner corner-sw" aria-hidden="true"></span>
        <span className="pixel-corner corner-se" aria-hidden="true"></span>
      </div>
    </motion.article>
  );
}

export default function ArticleList() {
  const reduceMotion = Boolean(useReducedMotion());

  return (
    <section id="articles" className="shell articles-section" data-reveal="articles" data-motion-group>
      <motion.div
        className="section-heading"
        initial={reduceMotion ? false : { opacity: 0, y: 24, scale: 0.985 }}
        whileInView={{ opacity: 1, y: 0, scale: 1 }}
        viewport={{ once: false, amount: 0.5, margin: "-5% 0px -8% 0px" }}
        transition={{ duration: reduceMotion ? 0 : 0.52, ease: revealEase }}
      >
        <h2>代表文章</h2>
        <p>只展示 3-5 篇来自真实项目、调试、性能分析和架构决策的文章。</p>
      </motion.div>

      <div className="article-list">
        {articles.map((article, index) => (
          <ArticleRow key={article.title} article={article} index={index} />
        ))}
      </div>
      <SectionGuide target="#life" label="前往生活侧面" />
    </section>
  );
}
