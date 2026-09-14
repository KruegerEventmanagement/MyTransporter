import { useEffect, useRef, useState } from "react";

/**
 * Hochwertiger Zähler-Effekt: die Ziffern rollen kurz und rasten dann ein.
 * Respektiert prefers-reduced-motion (dann sofortiger Wechsel).
 */
export function RollingNumber({
  value,
  className = "",
  suffix = " €",
}: {
  value: string;
  className?: string;
  suffix?: string;
}) {
  const [display, setDisplay] = useState(value);
  const [rolling, setRolling] = useState(false);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setDisplay(value);
      return;
    }
    setRolling(true);
    const digits = "0123456789";
    let step = 0;
    const id = window.setInterval(() => {
      step++;
      setDisplay(
        value
          .split("")
          .map((ch) => (/\d/.test(ch) ? digits[Math.floor(Math.random() * 10)] : ch))
          .join(""),
      );
      if (step >= 6) {
        window.clearInterval(id);
        setDisplay(value);
        setRolling(false);
      }
    }, 45);
    timers.current.push(id);
    return () => window.clearInterval(id);
  }, [value]);

  return (
    <span
      className={`inline-flex items-baseline tabular-nums transition-transform duration-150 ${rolling ? "scale-[1.02]" : "scale-100"} ${className}`}
      aria-label={`${value}${suffix}`}
    >
      {display.split("").map((ch, i) => (
        <span
          key={`${i}-${ch}`}
          className={
            /\d/.test(ch)
              ? "inline-block w-[0.62em] text-center"
              : "inline-block px-[0.02em] text-center"
          }
        >
          {ch}
        </span>
      ))}
      <span className="ml-1 text-[0.5em] font-medium text-muted-foreground">{suffix.trim()}</span>
    </span>
  );
}
