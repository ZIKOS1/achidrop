import { useEffect, useState } from "react";
import { PackageOpen, Send, Lock, Package, CheckSquare, Square } from "lucide-react";
import { api } from "../api";
import { useApp } from "../context";
import { fmtMoney, hap, imgSrc, confirmTg, rarityColor } from "../utils";
import { t } from "../i18n";
import { cn } from "../lib/cn";
import Empty from "../components/Empty";
import { CardRowsSkeleton } from "../components/Skeleton";
import { RarityBar, SkinName, WearBadge } from "../components/SkinBadges";
import FloatStickersDisplay from "../components/FloatStickersDisplay";
import SupportChat from "../components/SupportChat";
import TradeOnboardingWizard from "../components/TradeOnboardingWizard";
import { SteamLogo } from "../components/BrandIcons";

const CARD_HOVER = "group relative flex flex-col overflow-hidden border border-border bg-card shadow-panel transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-1 hover:border-primary/50 ";

// Steam trade-ban qolgan muddatini "X kun Y soat" ko'rinishida qaytaradi,
// muddat o'tib ketgan bo'lsa null (ban tugagan, cheklov qo'yilmaydi).
function banRemaining(tradeBanUntil) {
  if (!tradeBanUntil) return null;
  const ms = new Date(tradeBanUntil).getTime() - Date.now();
  if (ms <= 0) return null;
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  return { days, hours };
}

// "Chiqarib olish" tugmasi bilan bir xil shart — bulk tanlash checkbox'i ham
// aynan shu itemlarnigina belgilashi kerak (band/trade-ban'li skinlar tanlab
// bo'lmaydi). "requested" ham qayta so'rashga ochiq — bu holat avtomatik
// yuborish (masalan Steam'ning "juda ko'p taklif" cheklovi) muvaffaqiyatsiz
// bo'lib, qo'lda-admin navbatiga tushgan itemlarga tegishli; admin hali
// "Skin yuborildi" bosmagan ekan (bosgan bo'lsa status "delivered"ga o'tadi),
// qayta urinish xavfsiz — eng yomon holatda yana muvaffaqiyatsiz bo'lib,
// yana shu holatda qoladi.
function canWithdrawWin(w) {
  const ban = banRemaining(w.tradeBanUntil);
  return (!w.status || ["pending", "rejected", "auto_failed", "requested"].includes(w.status)) && !ban;
}

const TAG_KEYS = {
  pending: ["border-warning/40 bg-warning/10 text-warning", "inventory.pending"],
  requested: ["border-accent/40 bg-accent/10 text-accent", "inventory.requested"],
  auto_sent: ["border-accent/40 bg-accent/10 text-accent", "inventory.autoSent"],
  delivered: ["border-success/40 bg-success/10 text-success", "inventory.delivered"],
  rejected: ["border-destructive/40 bg-destructive/10 text-destructive", "inventory.rejected"],
  auto_failed: ["border-destructive/40 bg-destructive/10 text-destructive", "inventory.autoFailed"],
};

// Float/stikerlar bo'lsa, kartaga bosilganda ochiladigan/yopiladigan qism —
// ikkala ro'yxatda ham (yutilgan skinlar va Steam-dagi itemlar) bir xil.
function ExpandableFloatStickers({ floatValue, stickers, open }) {
  if (!open || (floatValue == null && !(stickers?.length > 0))) return null;
  return (
    <div className="mt-3 animate-fade-up border-t border-border pt-3">
      <FloatStickersDisplay
        floatValue={floatValue}
        stickers={(stickers || []).map((s) => ({
          icon: s.icon,
          wearPercent: s.wear == null ? 100 : Math.round((1 - s.wear) * 100),
        }))}
      />
    </div>
  );
}

export default function Inventory() {
  const { user, setUser, showToast, navigate } = useApp();
  const [wins, setWins] = useState(null);
  const [error, setError] = useState(false);
  const [expandedWin, setExpandedWin] = useState(null);
  const [supportLotId, setSupportLotId] = useState(null);
  const [showWizard, setShowWizard] = useState(false);
  const [pendingLotId, setPendingLotId] = useState(null);
  const [pendingBulkIds, setPendingBulkIds] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const [steamItems, setSteamItems] = useState(null);
  const [steamError, setSteamError] = useState(false);
  const [expandedSteam, setExpandedSteam] = useState(null);

  function load() {
    api("/api/inventory").then(setWins).catch(() => setError(true));
  }
  useEffect(load, []);

  useEffect(() => {
    if (!user?.steamId64) return;
    api("/api/trade-inventory").then(setSteamItems).catch(() => setSteamError(true));
  }, [user?.steamId64]);

  if (!user) {
    return (
      <Empty icon={PackageOpen} title={t("common.loginRequired")}>
        <button type="button" onClick={() => navigate("login")} className="bg-primary px-5 py-2.5 font-heading text-sm font-bold uppercase tracking-wide text-primary-foreground transition-colors hover:bg-primary/90">
          {t("common.login")}
        </button>
      </Empty>
    );
  }

  async function sendWithdrawRequest(lotId) {
    try {
      const r = await api(`/api/withdraw/${lotId}`, { method: "POST" });
      showToast(t(r?.auto ? "inventory.autoSentToast" : "inventory.requestSent"), "ok");
      hap("notif", "success");
      // Serverda status allaqachon saqlangan (auto_sent/requested) — kartani
      // darhol yangilash uchun to'liq qayta yuklashni kutmasdan optimistik
      // belgilaymiz, load() esa fon rejimida haqiqiy holatni tasdiqlaydi.
      setWins((prev) => prev && prev.map((w) => (w.lotId === lotId ? { ...w, status: r?.auto ? "auto_sent" : "requested" } : w)));
      load();
    } catch (e) {
      showToast(e.error || t("common.genericError"), "err");
    }
  }

  // `confirmTg()` (utils.js) — real Telegram ichida native tasdiq oynasini,
  // brauzerda esa `window.confirm()`ni ishlatadi. Telegram WebApp SDK skripti
  // saytda (Telegram tashqarisida) ham yuklangani uchun `tg.showConfirm()`ni
  // to'g'ridan-to'g'ri chaqirish "WebAppMethodUnsupported" degan SINXRON xato
  // tashlab, butun tugmani "ishlamay qoladigan" qilib qo'yardi — shu sabab bu
  // yerda ham (avval faqat trade/obmen sahifalarida ishlatilgan) shu xavfsiz
  // umumiy funksiyaga o'tkazildi.
  async function confirmAndWithdraw(lotId, tradeLink) {
    const confirmMsg = `"${tradeLink}" ${t("inventory.confirmWithdraw")}`;
    if (await confirmTg(confirmMsg)) sendWithdrawRequest(lotId);
  }

  // Trade Link hali kiritilmagan bo'lsa — oddiy alert() o'rniga (ba'zi
  // brauzerlarda "bu sahifadan boshqa oyna chiqmasin" belgilanib qo'yilsa
  // butunlay ko'rinmay qolishi mumkin edi, foydalanuvchi buni "hech narsa
  // bo'lmayapti" deb topgan edi) Obmen'dagi bilan bir xil yo'riqnoma-wizard
  // ochamiz — link kiritilgach, so'ralgan chiqarish avtomatik davom etadi.
  function withdraw(lotId) {
    if (!user?.tradeLink) {
      setPendingLotId(lotId);
      setShowWizard(true);
      return;
    }
    confirmAndWithdraw(lotId, user.tradeLink);
  }

  function handleWizardDone(patch) {
    setShowWizard(false);
    if (patch?.tradeLink) {
      setUser((u) => (u ? { ...u, tradeLink: patch.tradeLink, ...(patch.steamPublicConfirmed ? { steamPublicConfirmed: true } : {}) } : u));
      if (pendingLotId != null) confirmAndWithdraw(pendingLotId, patch.tradeLink);
      if (pendingBulkIds != null) runBulkWithdraw(pendingBulkIds);
    }
    setPendingLotId(null);
    setPendingBulkIds(null);
  }

  function toggleSelect(lotId) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(lotId)) next.delete(lotId);
      else next.add(lotId);
      return next;
    });
  }

  const withdrawableWins = (wins || []).filter(canWithdrawWin);
  const allSelected = withdrawableWins.length > 0 && withdrawableWins.every((w) => selected.has(w.lotId));

  function toggleSelectAll() {
    setSelected(allSelected ? new Set() : new Set(withdrawableWins.map((w) => w.lotId)));
  }

  // Tanlangan har bir lot uchun MAVJUD bitta-item /api/withdraw/:lotId'ni
  // KETMA-KET (parallel emas) chaqiradi — relay/Steam'ga bir zumda ko'p
  // trade-offer so'rovi tashlab yubormaslik uchun. Backend o'zgarmagan —
  // foydalanuvchi uchun bitta tugma bosish "bittada chiqarib olish".
  async function runBulkWithdraw(lotIds) {
    setBulkBusy(true);
    let ok = 0;
    for (const lotId of lotIds) {
      try {
        const r = await api(`/api/withdraw/${lotId}`, { method: "POST" });
        ok++;
        setWins((prev) => prev && prev.map((w) => (w.lotId === lotId ? { ...w, status: r?.auto ? "auto_sent" : "requested" } : w)));
      } catch {
        // shu itemni o'tkazib yuboramiz, qolganlarini davom ettiramiz
      }
    }
    setBulkBusy(false);
    setSelected(new Set());
    hap("notif", ok === lotIds.length ? "success" : "warning");
    showToast(t("inventory.bulkDone", { ok, total: lotIds.length }), ok === lotIds.length ? "ok" : "err");
    load();
  }

  async function withdrawSelected() {
    const lotIds = Array.from(selected);
    if (lotIds.length === 0) return;
    if (!user?.tradeLink) {
      setPendingBulkIds(lotIds);
      setShowWizard(true);
      return;
    }
    const msg = `${lotIds.length} ${t("inventory.confirmWithdrawBulk")}\n"${user.tradeLink}"`;
    if (await confirmTg(msg)) runBulkWithdraw(lotIds);
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-bold uppercase tracking-wide text-foreground">{t("inventory.title")}</h1>
        {withdrawableWins.length > 1 && (
          <button
            type="button"
            onClick={toggleSelectAll}
            className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
          >
            {allSelected ? <CheckSquare className="size-4 text-primary" /> : <Square className="size-4" />}
            {t(allSelected ? "inventory.deselectAll" : "inventory.selectAll")}
          </button>
        )}
      </div>

      {wins === null && !error && <CardRowsSkeleton />}
      {error && <Empty title={t("common.error")} />}
      {wins && wins.length === 0 && <Empty icon={PackageOpen} title={t("inventory.empty")} desc={t("inventory.emptyDesc")} />}

      {wins && wins.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {wins.map((w, i) => {
            const [cls, lblKey] = TAG_KEYS[w.status || "pending"];
            const ban = banRemaining(w.tradeBanUntil);
            const canWithdraw = canWithdrawWin(w);
            const hasDetail = w.float != null || w.stickers?.length > 0;
            const isOpen = expandedWin === i;
            return (
              <div
                key={i}
                className={cn(CARD_HOVER, "animate-fade-up")}
                style={{ "--fade-delay": `${Math.min(i, 8) * 40}ms` }}
              >
                <RarityBar color={rarityColor(w.rarity)} rarity={w.rarity} />

                <div
                  className={cn(
                    "relative aspect-[16/10] overflow-hidden bg-[radial-gradient(circle_at_50%_35%,color-mix(in_oklch,var(--foreground)_6%,var(--card)),var(--card))]",
                    hasDetail && "cursor-pointer"
                  )}
                  onClick={hasDetail ? () => setExpandedWin(isOpen ? null : i) : undefined}
                  role={hasDetail ? "button" : undefined}
                  tabIndex={hasDetail ? 0 : undefined}
                >
                  {w.image ? (
                    <img
                      src={imgSrc(w.image)}
                      alt=""
                      loading="lazy"
                      onError={(e) => { e.currentTarget.style.display = "none"; }}
                      className="absolute inset-0 size-full object-contain p-4 transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.08]"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center"><Package className="size-10 text-muted-foreground" /></div>
                  )}
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-card/70 to-transparent" />
                  <div className="absolute left-2 top-2 flex flex-col gap-1">
                    <WearBadge float={w.float} short />
                  </div>
                  <span className={"absolute right-2 top-2 border px-2 py-1 text-[11px] font-semibold uppercase tracking-wide backdrop-blur " + cls}>{t(lblKey)}</span>
                  {canWithdraw && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); toggleSelect(w.lotId); }}
                      className="absolute bottom-2 left-2 flex size-7 items-center justify-center border border-border bg-background/80 text-muted-foreground backdrop-blur transition-colors hover:text-foreground"
                    >
                      {selected.has(w.lotId) ? <CheckSquare className="size-4 text-primary" /> : <Square className="size-4" />}
                    </button>
                  )}
                </div>

                <div className="flex flex-1 flex-col gap-3 p-4">
                  <div>
                    {w.date && <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{new Date(w.date).toLocaleDateString("uz-UZ")}</p>}
                    <h3 className="font-heading text-lg font-bold leading-tight text-foreground"><SkinName name={w.lotName || "?"} /></h3>
                  </div>

                  <p className="font-heading text-xl font-bold tracking-tight text-primary">{fmtMoney(w.price || 0)}</p>

                  <ExpandableFloatStickers floatValue={w.float} stickers={w.stickers} open={isOpen} />

                  {w.status === "rejected" && w.rejectComment && (
                    <p className="border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{w.rejectComment}</p>
                  )}
                  {w.status === "auto_failed" && w.lastFailReason && (
                    <p className="border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{w.lastFailReason}</p>
                  )}
                  {w.status === "auto_sent" && (
                    <p className="border border-accent/30 bg-accent/10 px-3 py-2 text-xs text-accent">{t("inventory.autoSentHint")}</p>
                  )}
                  {ban && (
                    <p className="flex items-center gap-1.5 border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
                      <Lock className="size-3.5 shrink-0" />
                      {t("inventory.tradeBan")}: {ban.days > 0 ? `${ban.days} ${t("inventory.days")} ` : ""}{ban.hours} {t("inventory.hours")}
                    </p>
                  )}
                  {canWithdraw && (
                    <button
                      type="button"
                      onClick={() => withdraw(w.lotId)}
                      className="mt-auto flex w-full items-center justify-center gap-2 bg-primary py-2 font-heading text-sm font-bold uppercase tracking-wide text-primary-foreground shadow-panel transition-all duration-300 group-hover:bg-primary/90 "
                    >
                      <Send className="size-4" />
                      {["rejected", "auto_failed", "requested"].includes(w.status) ? t("inventory.retry") : t("inventory.take")}
                    </button>
                  )}
                  {w.status === "auto_failed" && (
                    <button
                      type="button"
                      onClick={() => setSupportLotId(supportLotId === w.lotId ? null : w.lotId)}
                      className="flex w-full items-center justify-center gap-1.5 border border-destructive/30 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-destructive"
                    >
                      {t("support.problemButton")}
                    </button>
                  )}
                  {supportLotId === w.lotId && (
                    <SupportChat lotId={w.lotId} onClose={() => setSupportLotId(null)} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {user.steamId64 && (
        <div className="space-y-4">
          <h2 className="flex items-center gap-2 font-heading text-lg font-bold uppercase tracking-wide text-foreground">
            <SteamLogo className="size-5 text-accent" />
            {t("inventory.steamItemsTitle")}
          </h2>

          {steamItems === null && !steamError && <CardRowsSkeleton />}
          {steamError && <Empty title={t("common.error")} />}
          {steamItems && steamItems.length === 0 && <Empty icon={Package} title={t("inventory.steamItemsEmpty")} />}

          {steamItems && steamItems.length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {steamItems.map((it) => {
                const hasDetail = it.float != null || it.stickers?.length > 0;
                const isOpen = expandedSteam === it.assetId;
                return (
                  <div key={it.assetId} className={cn(CARD_HOVER, "animate-fade-up")}>
                    <RarityBar color={rarityColor(it.rarity)} rarity={it.rarity} />

                    <div
                      className={cn(
                        "relative aspect-[16/10] overflow-hidden bg-[radial-gradient(circle_at_50%_35%,color-mix(in_oklch,var(--foreground)_6%,var(--card)),var(--card))]",
                        hasDetail && "cursor-pointer"
                      )}
                      onClick={hasDetail ? () => setExpandedSteam(isOpen ? null : it.assetId) : undefined}
                      role={hasDetail ? "button" : undefined}
                      tabIndex={hasDetail ? 0 : undefined}
                    >
                      {it.image ? (
                        <img
                          src={imgSrc(it.image)}
                          alt=""
                          loading="lazy"
                          onError={(e) => { e.currentTarget.style.display = "none"; }}
                          className="absolute inset-0 size-full object-contain p-4 transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.08]"
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center"><Package className="size-10 text-muted-foreground" /></div>
                      )}
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-card/70 to-transparent" />
                      <div className="absolute left-2 top-2 flex flex-col gap-1">
                        <WearBadge float={it.float} short />
                      </div>
                      {it.rarity && (
                        <span className="absolute right-2 top-2 border border-border bg-background/70 px-2 py-1 text-[11px] font-medium text-muted-foreground backdrop-blur">{it.rarity}</span>
                      )}
                    </div>

                    <div className="flex flex-1 flex-col gap-3 p-4">
                      <h3 className="font-heading text-lg font-bold leading-tight text-foreground"><SkinName name={it.name} /></h3>
                      <ExpandableFloatStickers floatValue={it.float} stickers={it.stickers} open={isOpen} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {selected.size > 0 && (
        <div className="fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-md items-center justify-between gap-3 border border-primary/40 bg-card px-4 py-3 shadow-panel-lg animate-fade-up">
          <span className="text-sm font-semibold text-foreground">{selected.size} {t("inventory.selectedCount")}</span>
          <button
            type="button"
            disabled={bulkBusy}
            onClick={withdrawSelected}
            className="flex items-center gap-2 bg-primary px-4 py-2 font-heading text-xs font-bold uppercase tracking-wide text-primary-foreground disabled:opacity-50"
          >
            <Send className="size-4" />
            {bulkBusy ? t("inventory.bulkSending") : t("inventory.withdrawSelected")}
          </button>
        </div>
      )}

      {showWizard && <TradeOnboardingWizard onDone={handleWizardDone} />}
    </div>
  );
}
