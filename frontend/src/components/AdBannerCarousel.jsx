import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useApp } from "../context";
import { imgSrc } from "../utils";
import { t } from "../i18n";

const ROTATE_MS = 5000;

function DefaultHeroBanner() {
  return (
    <section className="corner-brackets surface-grid relative overflow-hidden border border-border bg-[linear-gradient(120deg,var(--hero-a)_0%,var(--hero-b)_55%)] p-6 shadow-panel-lg sm:p-10">
      <div className="absolute right-0 top-0 h-full w-1/2 bg-[radial-gradient(circle_at_80%_20%,color-mix(in_oklch,var(--primary)_22%,transparent),transparent_60%)]" />
      <div className="absolute bottom-0 left-0 h-2/3 w-1/3 bg-[radial-gradient(circle_at_10%_100%,color-mix(in_oklch,var(--accent)_16%,transparent),transparent_65%)]" />
      <div className="animate-fade-up relative max-w-xl space-y-4">
        <span className="inline-flex items-center gap-2 border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary shadow-[0_0_20px_-6px_color-mix(in_oklch,var(--primary)_60%,transparent)]">
          <span className="size-1.5 animate-pulse rounded-full bg-primary" />
          {t("auctions.heroBadge")}
        </span>
        <h1 className="text-balance font-heading text-4xl font-bold uppercase leading-[1.05] tracking-wide text-foreground sm:text-5xl">
          {t("auctions.heroTitle1")} <span className="text-primary text-glow-primary">{t("auctions.heroTitleAccent")}</span> {t("auctions.heroTitle2")}
        </h1>
        <p className="text-pretty text-sm leading-relaxed text-muted-foreground sm:text-base">
          {t("auctions.heroDesc")}
        </p>
      </div>
    </section>
  );
}

// Auksionlar sahifasi ustidagi reklama joyi — admin panelda hech qanday
// banner yuklanmagan bo'lsa standart (hardcoded) hero ko'rsatiladi; bitta
// yoki bir nechta banner yuklangan bo'lsa, ular navbat bilan aylanadigan
// karusel sifatida (pastda nuqtachalar bilan) ko'rsatiladi.
export default function AdBannerCarousel() {
  const { navigate } = useApp();
  const [banners, setBanners] = useState(null);
  const [index, setIndex] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    let alive = true;
    api("/api/banners").then((r) => alive && setBanners(r.banners || [])).catch(() => alive && setBanners([]));
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!banners || banners.length <= 1) return;
    timerRef.current = setInterval(() => setIndex((i) => (i + 1) % banners.length), ROTATE_MS);
    return () => clearInterval(timerRef.current);
  }, [banners]);

  if (banners === null) {
    return <div className="skeleton aspect-[16/7] w-full" />;
  }
  if (banners.length === 0) {
    return <DefaultHeroBanner />;
  }

  // Bosish uchun bitta doimiy qatlam (rasm-crossfade ustida) ishlatiladi —
  // agar har bir slayd o'zining alohida pointer-events'ini almashtirsa,
  // CSS opacity o'tishi (transition) bilan bu holat vaqtincha mos kelmay
  // qolib, ko'rinib turgan banner bosilmay qolishi mumkin edi.
  const current = banners[index];
  const clickable = !!current?.linkPage;
  function handleBannerClick() {
    if (current?.linkPage) navigate(current.linkPage, current.linkData ?? null);
  }

  return (
    <section className="relative aspect-[16/7] w-full overflow-hidden border border-border bg-card shadow-panel-lg">
      {banners.map((b, i) => (
        <img
          key={b.id}
          src={imgSrc(b.image)}
          alt=""
          className="pointer-events-none absolute inset-0 size-full object-cover transition-opacity duration-700 ease-in-out"
          style={{ opacity: i === index ? 1 : 0 }}
        />
      ))}
      <button
        type="button"
        onClick={handleBannerClick}
        aria-label={clickable ? "Banner" : undefined}
        tabIndex={clickable ? 0 : -1}
        className={"absolute inset-0 size-full border-0 bg-transparent p-0" + (clickable ? " cursor-pointer" : " cursor-default")}
      />
      {banners.length > 1 && (
        <div className="absolute inset-x-0 bottom-3 flex items-center justify-center gap-2">
          {banners.map((b, i) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Banner ${i + 1}`}
              className={"h-2 rounded-full transition-all duration-300 " + (i === index ? "w-6 bg-primary" : "w-2 bg-background/70 hover:bg-background")}
            />
          ))}
        </div>
      )}
    </section>
  );
}
