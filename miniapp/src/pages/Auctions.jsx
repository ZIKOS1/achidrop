import { useEffect, useMemo, useRef, useState } from "react";
import { PackageOpen, SlidersHorizontal, Search, X, Flame, Trophy } from "lucide-react";
import { api } from "../api";
import { useApp } from "../context";
import { wearCode } from "../utils";
import { t } from "../i18n";
import AuctionCard from "../components/AuctionCard";
import AdBannerCarousel from "../components/AdBannerCarousel";
import ActivityTicker from "../components/ActivityTicker";
import CategoryFilterBar from "../components/CategoryFilterBar";
import FilterSidebar, { EMPTY_FILTERS, countActiveFilters } from "../components/FilterSidebar";
import Empty from "../components/Empty";

const sorts = [
  { labelKey: "auctions.sortEnding", value: "ending" },
  { labelKey: "auctions.sortPriceHigh", value: "price-high" },
  { labelKey: "auctions.sortPriceLow", value: "price-low" },
];

const GRID_CLASSES = "grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6";

export default function Auctions() {
  const { navigate, user } = useApp();
  const [list, setList] = useState(null);
  const [error, setError] = useState(false);
  const [, forceTick] = useState(0);
  const [selectedWeapons, setSelectedWeapons] = useState({});
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("ending");
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [debouncedPrice, setDebouncedPrice] = useState({ min: "", max: "" });
  const intervalRef = useRef(null);

  useEffect(() => {
    let alive = true;
    api("/api/auctions").then((data) => alive && setList(data)).catch(() => alive && setError(true));
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!list?.some((a) => a.endTimeMs || a.earlyAccessLocked)) return;
    intervalRef.current = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(intervalRef.current);
  }, [list]);

  // Narx inputlari darhol yoziladi (input lag bo'lmasin), lekin haqiqiy
  // filtrlash 400ms kechikish bilan ishlaydi — har bir bosilgan raqamda
  // butun ro'yxatni qayta hisoblamaslik uchun.
  useEffect(() => {
    const h = setTimeout(() => setDebouncedPrice({ min: filters.minPrice, max: filters.maxPrice }), 400);
    return () => clearTimeout(h);
  }, [filters.minPrice, filters.maxPrice]);

  const active = list?.filter((a) => !a.endTimeMs || a.endTimeMs > Date.now());

  const weaponFilters = useMemo(
    () => Object.values(selectedWeapons).flat().map((w) => w.toLowerCase()),
    [selectedWeapons]
  );

  const favoriteIds = useMemo(() => new Set(user?.favorites || []), [user]);

  const min = debouncedPrice.min === "" ? 0 : Number(debouncedPrice.min);
  const max = debouncedPrice.max === "" ? Infinity : Number(debouncedPrice.max);
  const activeFilterCount = countActiveFilters(filters);

  const filtered = useMemo(() => {
    if (!active) return active;
    const q = search.trim().toLowerCase();
    const now = Date.now();
    let out = active.filter((a) => {
      const n = a.name.toLowerCase();
      if (weaponFilters.length > 0 && !weaponFilters.some((w) => n.includes(w))) return false;
      if (q && !n.includes(q)) return false;
      if (a.price < min || a.price > max) return false;
      if (filters.status === "active" && !a.lastBidderName) return false;
      if (filters.status === "ending" && !(a.endTimeMs && a.endTimeMs - now < 3600000)) return false;
      if (filters.favoritesOnly && !favoriteIds.has(a.id)) return false;
      if (filters.wear.length > 0 && !filters.wear.includes(wearCode(a.float))) return false;
      if (filters.rarity.length > 0 && !filters.rarity.includes(a.rarity)) return false;
      return true;
    });
    out = [...out].sort((a, b) => {
      if (sort === "price-high") return b.price - a.price;
      if (sort === "price-low") return a.price - b.price;
      return (a.endTimeMs || Infinity) - (b.endTimeMs || Infinity);
    });
    return out;
  }, [active, weaponFilters, search, min, max, sort, filters, favoriteIds]);

  return (
    <div className="space-y-8">
      <AdBannerCarousel />

      <ActivityTicker />

      <div className="flex items-start gap-4">
        <FilterSidebar open={filterOpen} onClose={() => setFilterOpen(false)} filters={filters} onChange={setFilters} />

        {/* Feed */}
        <section className="min-w-0 flex-1 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-heading text-xl font-bold uppercase tracking-wide text-foreground">{t("auctions.feedTitle")}</h2>
            <button
              type="button"
              onClick={() => navigate("leaderboard")}
              className="inline-flex items-center gap-1.5 border border-border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
            >
              <Trophy className="size-3.5" />
              {t("auctions.top")}
            </button>
          </div>

          {list === null && !error && <AuctionGridSkeleton />}
          {error && <Empty icon={PackageOpen} title={t("common.error")} desc={t("common.errorRetry")} />}

          {list && list.length > 0 && (
            <>
              <CategoryFilterBar value={selectedWeapons} onChange={setSelectedWeapons} />

              <div className="flex flex-col gap-3 border border-border bg-card p-4 shadow-panel sm:flex-row sm:items-center sm:justify-between">
                <div className="relative flex flex-1 items-center gap-2 sm:max-w-xs">
                  <Search className="pointer-events-none absolute left-3 size-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t("auctions.searchPlaceholder")}
                    className="w-full border border-border bg-secondary py-2 pl-9 pr-8 text-sm text-foreground outline-none focus:border-primary"
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch("")}
                      aria-label={t("auctions.clear")}
                      className="absolute right-2 flex size-5 items-center justify-center text-muted-foreground hover:text-foreground"
                    >
                      <X className="size-4" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setFilterOpen((v) => !v)}
                    className={
                      "flex items-center gap-1.5 border px-3 py-2 text-sm font-medium transition-colors " +
                      (activeFilterCount > 0 || filterOpen
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-border text-muted-foreground hover:text-foreground")
                    }
                  >
                    <SlidersHorizontal className="size-4" />
                    {t("filter.title")}
                    {activeFilterCount > 0 && ` (${activeFilterCount})`}
                  </button>

                  <span className="hidden items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-primary sm:flex">
                    <Flame className="size-4" />
                    {t("auctions.sort")}
                  </span>
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                    className="border border-border bg-secondary px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                  >
                    {sorts.map((s) => (
                      <option key={s.value} value={s.value}>{t(s.labelKey)}</option>
                    ))}
                  </select>
                </div>
              </div>
            </>
          )}

          {list && list.length === 0 && (
            <Empty icon={PackageOpen} title={t("auctions.emptyTitle")} desc={t("auctions.emptyNone")} />
          )}
          {filtered && filtered.length === 0 && list && list.length > 0 && (
            <Empty icon={PackageOpen} title={t("auctions.emptyTitle")} desc={t("auctions.emptyFiltered")} />
          )}

          {filtered && filtered.length > 0 && (
            <div className={GRID_CLASSES}>
              {filtered.map((a, i) => (
                <AuctionCard key={a.id} a={a} style={{ "--fade-delay": `${Math.min(i, 8) * 45}ms` }} className="animate-fade-up" />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function AuctionGridSkeleton() {
  return (
    <div className={GRID_CLASSES}>
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="animate-fade-up overflow-hidden border border-border bg-card shadow-panel" style={{ "--fade-delay": `${i * 45}ms` }}>
          <div className="skeleton aspect-square w-full" />
          <div className="space-y-2 p-3">
            <div className="skeleton h-3 w-1/2" />
            <div className="skeleton h-4 w-4/5" />
            <div className="skeleton h-5 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
