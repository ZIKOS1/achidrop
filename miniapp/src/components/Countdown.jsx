import { useEffect, useState } from "react";
import { cn } from "../lib/cn";
import { t } from "../i18n";

function diff(target) {
  const total = Math.max(0, target - Date.now());
  const hours = Math.floor(total / 3600000);
  const minutes = Math.floor((total % 3600000) / 60000);
  const seconds = Math.floor((total % 60000) / 1000);
  return { total, hours, minutes, seconds };
}

const pad = (n) => n.toString().padStart(2, "0");

export default function Countdown({ endMs, className, variant = "inline" }) {
  const [mounted, setMounted] = useState(false);
  const [time, setTime] = useState(() => diff(endMs));

  useEffect(() => {
    if (!endMs) return;
    setMounted(true);
    setTime(diff(endMs));
    const i = setInterval(() => setTime(diff(endMs)), 1000);
    return () => clearInterval(i);
  }, [endMs]);

  if (!endMs) return <span className={cn("font-heading font-semibold", className)}>∞</span>;

  const urgent = mounted && time.total > 0 && time.total < 3600000;
  const ended = mounted && time.total <= 0;

  if (variant === "blocks") {
    const parts = [
      { v: time.hours, l: t("countdown.hours") },
      { v: time.minutes, l: t("countdown.minutes") },
      { v: time.seconds, l: t("countdown.seconds") },
    ];
    return (
      <div className={cn("flex items-center gap-2", className)}>
        {parts.map((p, i) => (
          <div key={p.l} className="flex items-center gap-2">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "flex min-w-[52px] items-center justify-center border border-border bg-secondary px-2 py-2 font-heading text-2xl font-bold tabular-nums shadow-panel transition-colors duration-300",
                  urgent ? "border-primary/40 text-primary text-glow-primary" : "text-foreground"
                )}
              >
                {mounted ? pad(p.v) : "--"}
              </span>
              <span className="mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">{p.l}</span>
            </div>
            {i < parts.length - 1 && <span className="font-heading text-2xl font-bold text-muted-foreground">:</span>}
          </div>
        ))}
      </div>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-heading font-semibold tabular-nums",
        ended ? "text-muted-foreground" : urgent ? "text-primary" : "text-foreground",
        urgent && "animate-pulse",
        className
      )}
    >
      {!mounted ? "--:--:--" : ended ? t("countdown.ended") : `${pad(time.hours)}:${pad(time.minutes)}:${pad(time.seconds)}`}
    </span>
  );
}
