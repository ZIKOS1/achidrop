import { useState } from "react";
import { Gavel, Users, Package, Lock, Heart, Clock } from "lucide-react";
import { useApp } from "../context";
import { api } from "../api";
import { fmtMoney, hap, imgSrc, rarityColor, parseSkinName } from "../utils";
import { t } from "../i18n";
import { cn } from "../lib/cn";
import Countdown from "./Countdown";
import { RarityBar, WearBadge } from "./SkinBadges";

// lis-skins.com uslubi: kartada odatda faqat rasm/narx ko'rinadi, stavka
// tugmasi va timer FAQAT hover/tap qilinganda pastdan chiqadi. Touch
// qurilmalarda hover yo'q, shu sabab birinchi tap panelni ochadi (navigatsiya
// qilmaydi), ikkinchi tap (yoki "Stavka qo'yish"ning o'zi) sahifaga o'tadi.
export default function AuctionCard({ a, style, className }) {
  const { navigate, user, setUser, showToast } = useApp();
  const [tapped, setTapped] = useState(false);
  const [favBusy, setFavBusy] = useState(false);

  const locked = a.earlyAccessLocked && a.earlyAccessUntilMs > Date.now();
  const rColor = rarityColor(a.rarity);
  const { weapon, skin } = parseSkinName(a.name);
  const isFavorited = (user?.favorites || []).includes(a.id);

  function goToDetail() {
    hap("impact");
    navigate("auction-detail", a.id);
  }

  function handleCardClick(e) {
    const isTouch = e.nativeEvent?.pointerType === "touch" || (typeof window !== "undefined" && window.matchMedia?.("(hover: none)").matches);
    if (isTouch && !tapped) {
      setTapped(true);
      return;
    }
    goToDetail();
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      goToDetail();
    }
  }

  async function toggleFavorite(e) {
    e.stopPropagation();
    if (!user) { navigate("login"); return; }
    if (favBusy) return;
    setFavBusy(true);
    try {
      const r = await api(`/api/auctions/${a.id}/favorite`, { method: "POST" });
      setUser((u) => (u ? { ...u, favorites: r.favorites } : u));
      hap("impact", "light");
    } catch {
      showToast(t("common.genericError"), "err");
    } finally {
      setFavBusy(false);
    }
  }

  function handleBidClick(e) {
    e.stopPropagation();
    goToDetail();
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleCardClick}
      onKeyDown={handleKeyDown}
      style={style}
      className={cn(
        "group relative flex cursor-pointer flex-col overflow-hidden rounded-lg border border-white/5 bg-[#16161a] text-left transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-1 hover:bg-[#1c1c22] hover:shadow-[0_20px_44px_-16px_color-mix(in_oklch,var(--primary)_35%,transparent),0_0_0_1px_color-mix(in_oklch,var(--primary)_40%,transparent)]",
        className
      )}
    >
      <RarityBar color={rColor} rarity={a.rarity} />

      <div className="relative aspect-square overflow-hidden bg-[radial-gradient(circle_at_50%_35%,color-mix(in_oklch,var(--foreground)_6%,var(--card)),var(--card))]">
        {a.image ? (
          <img
            src={imgSrc(a.image)}
            alt={a.name}
            loading="lazy"
            onError={(e) => { e.currentTarget.style.display = "none"; }}
            className="absolute inset-0 size-full object-contain p-4 transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center"><Package className="size-10 text-muted-foreground" /></div>
        )}

        <div className="absolute left-2 top-2"><WearBadge float={a.float} short /></div>

        <button
          type="button"
          onClick={toggleFavorite}
          aria-label={t("filter.favorites")}
          aria-pressed={isFavorited}
          className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-full bg-background/70 text-muted-foreground backdrop-blur transition-colors hover:text-primary"
        >
          <Heart className={"size-3.5 " + (isFavorited ? "fill-primary text-primary" : "")} />
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-0.5 p-3">
        {weapon && (
          <p className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {a.statTrak && <span className="text-warning">StatTrak™ </span>}
            {weapon}
          </p>
        )}
        <p className="truncate font-heading text-sm font-bold leading-tight text-foreground">{skin || a.name}</p>
        <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
          <Clock className="size-3" />
          <Countdown endMs={a.endTimeMs} className="text-foreground" />
          <span>{t("auctions.left")}</span>
        </div>
        <div className="mt-1.5 flex items-end justify-between gap-2">
          <p className="font-heading text-lg font-bold tracking-tight text-primary">{fmtMoney(a.price)}</p>
          <span className="flex items-center gap-1 pb-0.5 text-xs text-muted-foreground">
            <Users className="size-3" />
            {a.bidCount ?? 0}
          </span>
        </div>
      </div>

      {/* Hover (desktop) / tap (touch) panel — kartaning o'zida joy egallamaydi,
          pastdan ustiga chiqadi (absolute), shu sabab default balandlik o'zgarmaydi. */}
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 translate-y-full bg-gradient-to-t from-[#0b0b0d] via-[#0b0b0df0] to-transparent p-3 pt-10 transition-transform duration-[250ms] ease-out group-hover:translate-y-0",
          tapped && "translate-y-0"
        )}
      >
        {locked ? (
          <div className="flex items-center justify-center gap-1.5 border border-warning/40 bg-background/85 px-2 py-2 text-[11px] font-bold uppercase tracking-wide text-warning backdrop-blur">
            <Lock className="size-3" />
            {t("auctions.vipLocked")}
          </div>
        ) : (
          <button
            type="button"
            onClick={handleBidClick}
            className="flex w-full items-center justify-center gap-2 bg-primary py-2 font-heading text-sm font-bold uppercase tracking-wide text-primary-foreground shadow-[0_6px_16px_-6px_color-mix(in_oklch,var(--primary)_70%,transparent)] transition-colors hover:bg-primary/90"
          >
            <Gavel className="size-4" />
            {t("auctions.placeBidShort")}
          </button>
        )}
      </div>
    </div>
  );
}
