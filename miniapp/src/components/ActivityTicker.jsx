import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import { api } from "../api";
import { fmtMoney, imgSrc } from "../utils";
import { t } from "../i18n";

function ActivityItem({ a }) {
  return (
    <div className="flex shrink-0 items-center gap-2.5 border border-border bg-card px-3 py-2 shadow-panel">
      <span className="flex size-9 shrink-0 items-center justify-center border border-border bg-secondary/40">
        {a.image ? <img src={imgSrc(a.image)} alt="" className="size-full object-contain" /> : <Trophy className="size-4 text-muted-foreground" />}
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-foreground">{a.name}</p>
        <p className="text-[11px] text-muted-foreground">
          <span className="font-heading font-bold text-primary">{fmtMoney(a.price)}</span>
          {" — "}
          <span className="text-accent">{a.winnerName}</span>
        </p>
      </div>
    </div>
  );
}

// Auksionlar sahifasidagi banner ostida uzluksiz aylanadigan "so'nggi
// yutuqlar" lentasi — ro'yxat ikki marta ketma-ket takrorlanadi va CSS
// animatsiyasi orqali chapga uzluksiz aylantiriladi (JS interval shart emas).
export default function ActivityTicker() {
  const [items, setItems] = useState(null);

  useEffect(() => {
    let alive = true;
    api("/api/activity").then((d) => alive && setItems(d)).catch(() => alive && setItems([]));
    return () => { alive = false; };
  }, []);

  if (!items || items.length === 0) return null;

  return (
    <div className="group relative overflow-hidden border-y border-border bg-secondary/20 py-3">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-gradient-to-r from-background to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-background to-transparent" />
      <p className="mb-2 px-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("auctions.activityTitle")}</p>
      <div className="flex w-max gap-3 px-4 [animation:ticker_40s_linear_infinite] group-hover:[animation-play-state:paused]">
        {[...items, ...items].map((a, i) => (
          <ActivityItem key={`${a.id}-${i}`} a={a} />
        ))}
      </div>
    </div>
  );
}
