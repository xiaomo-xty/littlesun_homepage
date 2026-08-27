import { useEffect, useState } from "react";

const phrases = ["高性能图形", "游戏引擎工具", "跨平台系统"];

export default function TypewriterLine() {
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [length, setLength] = useState(phrases[0].length);
  const [experienceReady, setExperienceReady] = useState(false);
  const [heroInView, setHeroInView] = useState(false);

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
    const syncPresence = () => setHeroInView(section?.dataset.revealState === "visible");
    const handlePresence = (event: Event) => {
      const detail = (event as CustomEvent<{ id?: string; visible?: boolean }>).detail;
      if (detail?.id === "top") setHeroInView(Boolean(detail.visible));
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
    if (!experienceReady || !heroInView) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      setPhraseIndex(0);
      setLength(phrases[0].length);
      return;
    }

    const phrase = phrases[phraseIndex];
    const complete = length === phrase.length;
    const timer = window.setTimeout(
      () => {
        if (complete) {
          const nextIndex = (phraseIndex + 1) % phrases.length;
          setPhraseIndex(nextIndex);
          setLength(0);
          return;
        }
        setLength((current) => current + 1);
      },
      complete ? 1700 : 82,
    );

    return () => window.clearTimeout(timer);
  }, [experienceReady, heroInView, length, phraseIndex]);

  return (
    <span className="typewriter-line" data-active={heroInView} aria-label={phrases.join("、")}>
      <span className="pixel-type" aria-hidden="true">FOCUS / </span>
      <span aria-hidden="true">{phrases[phraseIndex].slice(0, length)}</span>
      <span className="typewriter-caret" aria-hidden="true"></span>
    </span>
  );
}

