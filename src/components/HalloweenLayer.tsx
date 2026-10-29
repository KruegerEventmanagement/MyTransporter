import { useEffect, useState } from "react";
import { isHalloweenActive } from "@/lib/halloween";

/** Rein dekorativ: Spinnen, Kürbisse, Fledermäuse und ein Vampir beim „Weiter“-Klick. */
export function HalloweenLayer() {
  const [active, setActive] = useState(false);
  const [vampire, setVampire] = useState(0);

  useEffect(() => {
    if (!isHalloweenActive()) return;
    setActive(true);
    document.documentElement.classList.add("halloween");
    let clicks = 0;
    const onClick = (e: MouseEvent) => {
      const btn = (e.target as HTMLElement | null)?.closest("button");
      if (!btn || !/weiter/i.test(btn.textContent ?? "")) return;
      clicks += 1;
      if (clicks % 2 === 0) setVampire(Date.now());
    };
    document.addEventListener("click", onClick, true);
    return () => {
      document.documentElement.classList.remove("halloween");
      document.removeEventListener("click", onClick, true);
    };
  }, []);

  useEffect(() => {
    if (!vampire) return;
    const t = setTimeout(() => setVampire(0), 1800);
    return () => clearTimeout(t);
  }, [vampire]);

  if (!active) return null;
  return (
    <div className="hw-layer" aria-hidden="true">
      <span className="hw-spider" style={{ left: "6%", animationDelay: "0s" }}>🕷️</span>
      <span className="hw-spider" style={{ left: "38%", animationDelay: "2.5s" }}>🕷️</span>
      <span className="hw-spider" style={{ right: "8%", animationDelay: "1.2s" }}>🕷️</span>
      <span className="hw-web" style={{ left: 0 }}>🕸️</span>
      <span className="hw-web" style={{ right: 0, transform: "scaleX(-1)" }}>🕸️</span>
      <span className="hw-bat" style={{ top: "18%", animationDelay: "0s" }}>🦇</span>
      <span className="hw-bat" style={{ top: "42%", animationDelay: "7s" }}>🦇</span>
      <span className="hw-bat" style={{ top: "68%", animationDelay: "13s" }}>🦇</span>
      <span className="hw-pumpkin" style={{ left: 8 }}>🎃</span>
      <span className="hw-pumpkin" style={{ right: 8, animationDelay: "1s" }}>🎃</span>
      {vampire !== 0 && <span key={vampire} className="hw-vampire">🧛</span>}
    </div>
  );
}
