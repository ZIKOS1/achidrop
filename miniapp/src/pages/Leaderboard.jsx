import { useEffect, useState } from "react";
import { Trophy, Gem, Award, Medal } from "lucide-react";
import { api } from "../api";
import { useApp } from "../context";
import { badge } from "../utils";
import { t } from "../i18n";
import BackLink from "../components/BackLink";
import Empty from "../components/Empty";
import { ListSkeleton } from "../components/Skeleton";

const BADGE_ICONS = { Legendary: Gem, VIP: Award, Pro: Medal, Rookie: Medal };

export default function Leaderboard() {
  const { navigate, user } = useApp();
  const [top, setTop] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api("/api/leaderboard").then(setTop).catch(() => setError(true));
  }, []);

  return (
    <div className="space-y-4">
      <BackLink onClick={() => navigate("auctions")} label={t("lot.back")} />
      <h1 className="font-heading text-2xl font-bold uppercase tracking-wide text-foreground">{t("leaderboard.title")}</h1>

      {top === null && !error && <ListSkeleton />}
      {error && <Empty title={t("common.genericError")} />}
      {top && top.length === 0 && <Empty icon={Trophy} title={t("leaderboard.empty")} />}

      {top && top.length > 0 && (
        <div className="border border-border bg-card shadow-panel-lg">
          <ul className="divide-y divide-border">
            {top.map((u, i) => {
              const isTop3 = i < 3;
              const isMe = u.id === user?.id;
              const b = badge(u.wins);
              const BadgeIcon = BADGE_ICONS[b];
              return (
                <li
                  key={u.id}
                  className={
                    "animate-fade-up flex items-center gap-3 px-4 py-3 transition-colors" +
                    (isMe ? " bg-primary/5" : "") +
                    (isTop3 ? " bg-gradient-to-r from-warning/[0.06] to-transparent" : "")
                  }
                  style={{ "--fade-delay": `${Math.min(i, 6) * 40}ms` }}
                >
                  <span
                    className={
                      "flex size-9 shrink-0 items-center justify-center font-heading text-lg font-bold " +
                      (isTop3
                        ? "bg-warning/15 text-warning shadow-[0_0_16px_-4px_color-mix(in_oklch,var(--warning)_60%,transparent)] clip-tactical"
                        : "text-primary")
                    }
                  >
                    {isTop3 ? <Trophy className="size-4" /> : i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={"truncate font-medium text-foreground" + (isTop3 ? " font-heading text-base" : " text-sm")}>
                      {u.name}
                      {isMe && <span className="ml-1 text-xs text-primary">({t("leaderboard.you")})</span>}
                    </p>
                  </div>
                  <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                    {u.wins} {t("leaderboard.winsLabel")} · {BadgeIcon && <BadgeIcon className="size-3" />} {b}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
