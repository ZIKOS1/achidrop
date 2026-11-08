import { useEffect, useMemo, useState } from "react";
import { Trophy, Flame, Timer, Gift, Users, Zap, TrendingUp, Medal, Sparkles, Check, Star, Lock, Diamond } from "lucide-react";
import { api } from "../api";
import { useApp } from "../context";
import { t } from "../i18n";
import { cn } from "../lib/cn";
import Empty from "../components/Empty";
import { ListSkeleton } from "../components/Skeleton";

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString("ru-RU").replace(/,/g, " ");

function useTick(active) {
  const [, set] = useState(0);
  useEffect(() => {
    if (!active) return;
    const i = setInterval(() => set((x) => x + 1), 1000);
    return () => clearInterval(i);
  }, [active]);
}

function TimeLeft({ targetMs }) {
  useTick(!!targetMs);
  const total = Math.max(0, targetMs - Date.now());
  const parts = [
    { v: Math.floor(total / 86400000), l: t("rating.d") },
    { v: Math.floor((total % 86400000) / 3600000), l: t("rating.h") },
    { v: Math.floor((total % 3600000) / 60000), l: t("rating.m") },
    { v: Math.floor((total % 60000) / 1000), l: t("rating.s") },
  ];
  return (
    <div className="flex gap-1.5">
      {parts.map((p, i) => (
        <div key={i} className="rt-time flex min-w-[52px] flex-col items-center rounded-xl px-2 py-1.5">
          <span className="font-logo text-[22px] tabular-nums text-[var(--heading)]">{String(p.v).padStart(2, "0")}</span>
          <span className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">{p.l}</span>
        </div>
      ))}
    </div>
  );
}

const TIER_ORDER = ["bronze", "silver", "gold", "platinum", "diamond", "legend"];
const tierName = (k) => t(`rating.tier.${k || "bronze"}`);

// Daraja ramkasi (Claude Design "Darajalar va ramkalar" ranglari) — avatar atrofida.
function Avatar({ u, size = 44, tier, place }) {
  const initials = (u?.name || "?").trim().slice(0, 2).toUpperCase();
  return (
    <span
      className={cn("rt-frame", `rt-t-${tier || "bronze"}`, place && `rt-frame-p${place}`)}
      style={{ width: size, height: size }}
    >
      <span className="rt-frame-in font-logo" style={{ fontSize: size * 0.34 }}>
        {u?.avatar ? <img src={u.avatar} alt="" className="size-full rounded-full object-cover" loading="lazy" /> : initials}
      </span>
    </span>
  );
}

function TierBadge({ tier, size = 44, dim }) {
  return (
    <span className={cn("rt-oct", `rt-t-${tier}`, dim && "opacity-45")} style={{ width: size, height: size }}>
      <span className="rt-oct-in font-logo" style={{ fontSize: size * 0.42 }}>{tierName(tier).slice(0, 1)}</span>
    </span>
  );
}

function TierTag({ tier }) {
  return (
    <span className={cn("rt-tier-tag inline-flex items-center gap-1", `rt-t-${tier || "bronze"}`)}>
      <Diamond className="size-2.5 fill-current" /> {tierName(tier)}
    </span>
  );
}

function Tabs({ value, onChange }) {
  const items = [
    { k: "contest", label: t("rating.tabContest"), icon: Flame },
    { k: "general", label: t("rating.tabGeneral"), icon: TrendingUp },
  ];
  return (
    <div className="ad-panel relative grid grid-cols-2 rounded-2xl p-1">
      <span
        className="rt-tab-pill absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-xl transition-transform duration-300"
        style={{ transform: value === "general" ? "translateX(100%)" : "none" }}
        aria-hidden
      />
      {items.map(({ k, label, icon: Icon }) => (
        <button
          key={k}
          type="button"
          onClick={() => onChange(k)}
          className={cn(
            "relative z-[1] flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-bold uppercase tracking-[0.08em] transition-colors",
            value === k ? "text-white" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Icon className="size-4" />
          {label}
        </button>
      ))}
    </div>
  );
}

function StatePill({ state }) {
  if (state === "active")
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[rgba(227,20,31,.16)] px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-primary">
        <span className="rt-live size-1.5 rounded-full bg-primary" /> {t("rating.live")}
      </span>
    );
  return (
    <span className="inline-flex items-center rounded-full bg-[var(--row-hov)] px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
      {state === "upcoming" ? t("rating.upcoming") : t("rating.finished")}
    </span>
  );
}

function RulesLine({ rules }) {
  if (!rules) return null;
  return (
    <div className="flex flex-wrap gap-2 text-xs">
      <span className="ad-field inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-foreground">
        <Zap className="size-3.5 text-primary" /> {t("rating.perSale", { x: fmt(rules.xpPerSale) })}
      </span>
      <span className="ad-field inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-foreground">
        <TrendingUp className="size-3.5 text-primary" /> {t("rating.per1000", { x: fmt(rules.xpPer1000Som) })}
      </span>
    </div>
  );
}

function ContestHero({ contest, participants, rules }) {
  const startMs = Date.parse(contest.startAt);
  const endMs = contest.endAt ? Date.parse(contest.endAt) : null;
  const target = contest.state === "upcoming" ? startMs : contest.state === "active" ? endMs : null;
  const prizes = contest.prizes?.length ? contest.prizes : contest.prize ? [contest.prize] : [];
  return (
    <div className="ad-frame animate-fade-up">
      <div className="ad-frame-in relative overflow-hidden px-5 pb-6 pt-5 sm:px-7">
        <div className="rt-hero-glow" aria-hidden />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <StatePill state={contest.state} />
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <Users className="size-3.5" /> {t("rating.participants", { n: fmt(participants) })}
              </span>
            </div>
            <h2 className="font-logo text-[34px] uppercase leading-[0.95] text-[var(--heading)] sm:text-[44px]">{contest.title}</h2>
            <RulesLine rules={rules} />
          </div>
          {target && (
            <div className="space-y-1.5">
              <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                <Timer className="size-3.5" /> {contest.state === "upcoming" ? t("rating.startsIn") : t("rating.endsIn")}
              </p>
              <TimeLeft targetMs={target} />
            </div>
          )}
        </div>
        {prizes.length > 0 && (
          <div className="relative mt-5 grid gap-2 sm:grid-cols-3">
            {prizes.slice(0, 6).map((p, i) => (
              <div key={i} className={cn("rt-prize flex items-center gap-3 rounded-xl px-3.5 py-2.5", i < 3 && `rt-prize-${i + 1}`)}>
                <span className="font-logo text-xl text-[var(--heading)]">#{i + 1}</span>
                <span className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-foreground">
                  <Gift className="size-4 shrink-0 text-primary" />
                  <span className="truncate">{p}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="ad-frame-glow" />
    </div>
  );
}

function TierCard({ me, contest }) {
  if (!me) return null;
  const pct = Math.round((me.progress || 0) * 100);
  return (
    <div className="ad-frame-sm animate-fade-up">
      <div className="relative overflow-hidden px-5 py-5 sm:px-6">
        <div className={cn("rt-tier-glow", `rt-t-${me.tier}`)} aria-hidden />
        <div className="relative flex items-center gap-4 sm:gap-5">
          {me.rank && me.rank <= 10
            ? <RankFrame rank={me.rank} u={me} className="w-[92px] -my-3" />
            : <Avatar u={me} size={76} tier={me.tier} />}
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{t("rating.yourPlace")}</p>
                <p className="flex items-baseline gap-2">
                  <span className="font-logo text-[30px] leading-none text-[var(--heading)]">{me.rank ? `#${me.rank}` : "—"}</span>
                  <TierTag tier={me.tier} />
                </p>
              </div>
              <p className="shrink-0 text-right font-logo text-[22px] leading-none text-[var(--heading)]">
                {fmt(me.xp)} <span className="text-sm text-primary">XP</span>
                {contest && <span className="block pt-1 font-sans text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{t("rating.inContest")}</span>}
              </p>
            </div>
            <div className={cn("h-2 overflow-hidden rounded-full bg-[var(--row-hov)]", `rt-t-${me.nextTier || me.tier}`)}>
              <div className="rt-bar bar-fill h-full rounded-full" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-[11px] text-muted-foreground">
              {me.nextTier
                ? t("rating.toNextTier", { x: fmt(Math.max(0, me.nextTierXp - me.generalXp)), t: tierName(me.nextTier) })
                : t("rating.maxTier")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function TiersPanel({ tiers, me }) {
  if (!tiers?.length) return null;
  const curIdx = me ? TIER_ORDER.indexOf(me.tier) : -1;
  return (
    <div className="ad-panel overflow-hidden rounded-2xl">
      <div className="border-b border-[var(--ad-line)] px-4 py-3.5">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{t("rating.tiersTitle")}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{t("rating.tiersDesc")}</p>
      </div>
      <ul className="divide-y divide-[var(--ad-line)]">
        {tiers.map((tr, i) => {
          const next = tiers[i + 1];
          const state = curIdx < 0 ? null : i < curIdx ? "done" : i === curIdx ? "current" : "locked";
          return (
            <li key={tr.key} className={cn("flex items-center gap-3 px-4 py-3", state === "current" && "bg-[var(--row-sel)]")}>
              <TierBadge tier={tr.key} size={42} dim={state === "locked"} />
              <div className="min-w-0 flex-1">
                <p className={cn("rt-tier-name font-bold", `rt-t-${tr.key}`)}>{tierName(tr.key)}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {next ? `${fmt(tr.minXp)} – ${fmt(next.minXp - 1)} XP` : `${fmt(tr.minXp)}+ XP`}
                </p>
              </div>
              {state === "done" && <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-bold text-success"><Check className="size-3" />{t("rating.unlocked")}</span>}
              {state === "current" && <span className="inline-flex items-center gap-1 rounded-full bg-[var(--row-hov)] px-2 py-0.5 text-[10px] font-bold text-[var(--heading)]"><Star className="size-3 fill-current" />{t("rating.current")}</span>}
              {state === "locked" && <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"><Lock className="size-3" />{t("rating.locked")}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// Claude Design handoff "Reyting ramkalari" (Top 1–10): shaffof PNG ramka avatar
// USTIDA turadi; avatar teshikka frames.json foizlari bilan joylashadi.
const RANK_HOLES = {
  1: [24.4, 23.8, 56.4], 2: [24.1, 20.1, 56.2], 3: [19.4, 20.2, 55.8], 4: [21.7, 17.7, 55.2], 5: [20.6, 18, 55.2],
  6: [18.7, 17.4, 57.4], 7: [17.9, 17.6, 56.8], 8: [25.4, 13.9, 57.6], 9: [22.1, 13.7, 57.6], 10: [22.1, 13.9, 57.6],
};

function RankFrame({ rank, u, className, style }) {
  const h = RANK_HOLES[rank];
  if (!h) return null;
  const initials = (u?.name || "?").trim().slice(0, 2).toUpperCase();
  return (
    <div className={cn("rt-rankframe relative aspect-square shrink-0", className)} style={style}>
      <div
        className="rt-rankframe-ava absolute flex items-center justify-center overflow-hidden rounded-full font-logo"
        style={{ left: `${h[0]}%`, top: `${h[1]}%`, width: `${h[2]}%`, height: `${h[2]}%` }}
      >
        {u?.avatar ? <img src={u.avatar} alt="" className="size-full object-cover" loading="lazy" /> : <span>{initials}</span>}
      </div>
      <img src={`/frames/top${rank}.png`} alt={`Top ${rank}`} draggable={false} className="pointer-events-none absolute inset-0 size-full select-none" />
    </div>
  );
}

const PODIUM_ORDER = [1, 0, 2]; // 2-o'rin chapda, 1-markazda, 3-o'ngda

function Podium({ top, meId }) {
  const three = top.slice(0, 3);
  if (!three.length) return null;
  return (
    <div className="grid grid-cols-3 items-end gap-2 sm:gap-4">
      {PODIUM_ORDER.map((idx) => {
        const u = three[idx];
        if (!u) return <div key={idx} />;
        const place = idx + 1;
        return (
          <div
            key={u.id}
            className={cn("animate-fade-up", place === 1 ? "order-2" : place === 2 ? "order-1" : "order-3")}
            style={{ "--fade-delay": `${place * 90}ms` }}
          >
            <div className={cn("rt-pod", `rt-pod-${place}`)}>
              <div className={cn("rt-pod-in flex flex-col items-center px-1.5 text-center sm:px-2", place === 1 ? "pb-5 pt-3" : "pb-4 pt-3")}>
                <RankFrame rank={place} u={u} className={cn("w-full", place === 1 ? "rt-podframe-1" : "rt-podframe-23")} />
                <p className={cn("mt-1 w-full truncate font-semibold text-foreground", place === 1 ? "text-[15px]" : "text-[13px]")}>
                  {u.name}
                  {String(u.id) === String(meId) && <span className="ml-1 text-primary">•</span>}
                </p>
                <p className={cn("font-logo leading-none text-[var(--heading)]", place === 1 ? "mt-1 text-[26px]" : "mt-1 text-[20px]")}>
                  {fmt(u.xp)}
                  <span className="ml-0.5 text-[12px] text-primary">XP</span>
                </p>
                <p className="mt-1.5 flex flex-wrap items-center justify-center gap-x-1.5 text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                  <TierTag tier={u.tier} /> <span>· {t("rating.sales", { n: u.sales })}</span>
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Row({ u, isMe, delay }) {
  return (
    <li
      className={cn("animate-fade-up flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--row-hov)]", isMe && "bg-[var(--row-sel)]")}
      style={{ "--fade-delay": `${delay}ms` }}
    >
      <span className="w-8 shrink-0 text-center font-logo text-lg text-muted-foreground tabular-nums">{u.rank ?? "—"}</span>
      {u.rank && u.rank <= 10
        ? <RankFrame rank={u.rank} u={u} className="rt-rowframe -my-2" />
        : <Avatar u={u} size={42} tier={u.tier} />}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">
          {u.name}
          {isMe && <span className="ml-1.5 rounded-full bg-primary px-1.5 py-px text-[10px] font-bold uppercase text-white">{t("rating.you")}</span>}
        </p>
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <TierTag tier={u.tier} /> · {t("rating.sales", { n: u.sales })}
        </p>
      </div>
      <span className="shrink-0 font-logo text-lg text-[var(--heading)] tabular-nums">
        {fmt(u.xp)} <span className="text-xs text-primary">XP</span>
      </span>
    </li>
  );
}

export default function Rating() {
  const { user, navigate } = useApp();
  const [tab, setTab] = useState(() => {
    try { return localStorage.getItem("rating.tab") || "contest"; } catch { return "contest"; }
  });
  const [data, setData] = useState({});
  const [error, setError] = useState(false);

  useEffect(() => {
    try { localStorage.setItem("rating.tab", tab); } catch {}
    setError(false);
    let alive = true;
    api(`/api/rating?type=${tab}`)
      .then((r) => alive && setData((d) => ({ ...d, [tab]: r })))
      .catch(() => alive && setError(true));
    return () => { alive = false; };
  }, [tab]);

  const cur = data[tab];
  const meInTop = useMemo(() => cur?.me && cur.top.some((u) => String(u.id) === String(cur.me.id)), [cur]);

  return (
    <div className="space-y-5 pb-20">
      <div className="flex items-end justify-between gap-3">
        <div className="space-y-1.5">
          <h1 className="flex items-center gap-2.5 text-[30px] font-bold leading-[1.05] tracking-[-0.01em] text-[var(--heading)] lg:text-[40px]">
            <Trophy className="size-7 text-primary lg:size-8" /> {t("rating.title")}
          </h1>
          <p className="text-[15px] text-muted-foreground [text-wrap:pretty]">{t("rating.subtitle")}</p>
        </div>
      </div>

      <Tabs value={tab} onChange={setTab} />

      {!cur && !error && <ListSkeleton />}
      {error && !cur && <Empty title={t("common.genericError")} />}

      {cur && (
        <div key={tab} className="swap-in space-y-5">
          {tab === "contest" && !cur.contest && (
            <div className="ad-frame-sm">
              <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
                <Sparkles className="size-9 text-primary" />
                <p className="font-logo text-2xl uppercase text-[var(--heading)]">{t("rating.noContest")}</p>
                <p className="max-w-sm text-sm text-muted-foreground">{t("rating.noContestDesc")}</p>
                <button type="button" onClick={() => setTab("general")} className="ad-cta mt-2 rounded-xl px-5 py-2.5 text-sm uppercase">
                  {t("rating.seeGeneral")}
                </button>
              </div>
            </div>
          )}

          {tab === "contest" && cur.contest && <ContestHero contest={cur.contest} participants={cur.participants} rules={cur.rules} />}

          {(tab === "general" || cur.contest) && (
            <>
              {cur.me ? <TierCard me={cur.me} contest={tab === "contest"} /> : (
                <div className="ad-panel flex items-center justify-between gap-3 rounded-2xl p-4">
                  <p className="text-sm text-muted-foreground">{t("rating.loginHint")}</p>
                  <button type="button" onClick={() => navigate("login")} className="btn-grad shrink-0 rounded-xl px-4 py-2 text-sm font-semibold">{t("rating.login")}</button>
                </div>
              )}
              {tab === "general" && <RulesLine rules={cur.rules} />}

              {cur.top.length === 0 ? (
                <Empty icon={Medal} title={t("rating.empty")} />
              ) : (
                <Podium top={cur.top} meId={cur.me?.id} />
              )}

              <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
                <div className="space-y-3">
                  {cur.top.length > 3 && (
                    <div className="ad-panel overflow-hidden rounded-2xl">
                      <div className="flex items-center justify-between border-b border-[var(--ad-line)] px-4 py-3">
                        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{t("rating.topSellers")}</p>
                        <p className="text-[11px] text-muted-foreground">{t("rating.participants", { n: fmt(cur.participants) })}</p>
                      </div>
                      <ul className="divide-y divide-[var(--ad-line)]">
                        {cur.top.slice(3).map((u, i) => (
                          <Row key={u.id} u={u} isMe={String(u.id) === String(cur.me?.id)} delay={Math.min(i, 8) * 35} />
                        ))}
                      </ul>
                    </div>
                  )}
                  {cur.me && !meInTop && cur.me.xp > 0 && (
                    <div className="sticky bottom-3 z-10">
                      <div className="ad-frame-sm shadow-[0_12px_40px_-12px_rgba(0,0,0,.7)]">
                        <ul><Row u={cur.me} isMe delay={0} /></ul>
                      </div>
                    </div>
                  )}
                </div>
                <TiersPanel tiers={cur.tiers} me={cur.me} />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
