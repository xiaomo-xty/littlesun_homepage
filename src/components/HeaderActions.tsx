import { ListIcon, MoonIcon, SunIcon, XIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

type Theme = "light" | "dark";

const navItems = [
  ["关于", "#about"],
  ["项目", "#projects"],
  ["文章", "#articles"],
  ["生活", "#life"],
] as const;

export default function HeaderActions() {
  const [theme, setTheme] = useState<Theme>("light");
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
  }, []);

  useEffect(() => {
    if (!menuOpen) return;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  const toggleTheme = () => {
    const nextTheme: Theme = theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = nextTheme;
    localStorage.setItem("homepage-theme", nextTheme);
    setTheme(nextTheme);
  };

  return (
    <div className="header-actions">
      <button
        className="icon-control theme-control"
        type="button"
        onClick={toggleTheme}
        aria-label={theme === "light" ? "切换到深色主题" : "切换到浅色主题"}
        title={theme === "light" ? "切换到深色主题" : "切换到浅色主题"}
      >
        {theme === "light" ? <MoonIcon size={19} weight="bold" /> : <SunIcon size={19} weight="bold" />}
      </button>

      <button
        className="icon-control menu-control"
        type="button"
        onClick={() => setMenuOpen((open) => !open)}
        aria-expanded={menuOpen}
        aria-controls="mobile-menu"
        aria-label={menuOpen ? "关闭导航" : "打开导航"}
        title={menuOpen ? "关闭导航" : "打开导航"}
      >
        {menuOpen ? <XIcon size={24} weight="bold" /> : <ListIcon size={24} weight="bold" />}
      </button>

      <div id="mobile-menu" className="mobile-menu" data-open={menuOpen || undefined}>
        <nav aria-label="移动端导航">
          {navItems.map(([label, href]) => (
            <a key={href} href={href} onClick={() => setMenuOpen(false)}>
              <span>{label}</span>
              <span aria-hidden="true">↗</span>
            </a>
          ))}
        </nav>
        <p>littlesun.space</p>
      </div>
    </div>
  );
}
