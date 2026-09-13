import { useEffect, useState } from "react";
import {
  Gavel,
  Users,
  TrendingUp,
  Package,
  Plus,
  Ticket,
  Lock,
  Gamepad2,
  Coins,
  X,
  Image as ImageIcon,
  Gift,
} from "lucide-react";
import { api } from "../api";
import { useApp } from "../context";
import { fmtMoney, hap } from "../../utils";
import Empty from "../../components/Empty";
import { StatCardsSkeleton, BlockSkeleton } from "../../components/Skeleton";

export default function AdminHome() {
  const { navigate, showToast, tg } = useApp();
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(false);
  const [settings, setSettings] = useState(null);
  const [toggling, setToggling] = useState(false);
  const [steamConnecting, setSteamConnecting] = useState(false);
  const [refBonus, setRefBonus] = useState("");
  const [savingRefBonus, setSavingRefBonus] = useState(false);
  const [feeTiers, setFeeTiers] = useState([{ max: "", fee: "" }]); // dinamik ro'yxat — admin qo'shishi/o'chirishi mumkin
  const [savingFeeTiers, setSavingFeeTiers] = useState(false);

  useEffect(() => {
    api("/api/admin/stats").then(setStats).catch(() => setError(true));
    api("/api/admin/settings").then((r) => {
      setSettings(r);
      setRefBonus(String(r.referralBonus ?? 10000));
      if (Array.isArray(r.tradeFeeTiers) && r.tradeFeeTiers.length) {
        setFeeTiers(r.tradeFeeTiers.map((t) => ({ max: String(t.max), fee: String(t.fee) })));
      }
    }).catch(() => {});
  }, []);

  function setFeeTierField(i, key, value) {
    setFeeTiers((arr) => arr.map((t, idx) => (idx === i ? { ...t, [key]: value } : t)));
  }
  function addFeeTier() {
    setFeeTiers((arr) => [...arr, { max: "", fee: "" }]);
  }
  function removeFeeTier(i) {
    setFeeTiers((arr) => (arr.length > 1 ? arr.filter((_, idx) => idx !== i) : arr));
  }

  async function saveFeeTiers() {
    const tiers = feeTiers.map((t) => ({ max: Number(t.max), fee: Number(t.fee) }));
    if (tiers.some((t) => isNaN(t.max) || t.max <= 0 || isNaN(t.fee) || t.fee < 0)) {
      return showToast("Barcha maydonlarni musbat raqam bilan to'ldiring", "err");
    }
    for (let i = 1; i < tiers.length; i++) {
      if (tiers[i].max <= tiers[i - 1].max) return showToast("Darajalar o'sish tartibida bo'lishi kerak", "err");
    }
    setSavingFeeTiers(true);
    try {
      const r = await api("/api/admin/settings", { method: "POST", body: JSON.stringify({ tradeFeeTiers: tiers }) });
      setSettings(r);
      hap("notif", "success");
      showToast("Komissiya darajalari yangilandi", "ok");
    } catch (e) {
      showToast(e.error || "Xato", "err");
    } finally {
      setSavingFeeTiers(false);
    }
  }

  async function saveRefBonus() {
    const val = Number(refBonus);
    if (isNaN(val) || val < 0) return showToast("Musbat raqam kiriting", "err");
    setSavingRefBonus(true);
    try {
      const r = await api("/api/admin/settings", { method: "POST", body: JSON.stringify({ referralBonus: val }) });
      setSettings(r);
      hap("notif", "success");
      showToast("Referral bonus yangilandi", "ok");
    } catch (e) {
      showToast(e.error || "Xato", "err");
    } finally {
      setSavingRefBonus(false);
    }
  }

  async function toggleEarlyAccess() {
    setToggling(true);
    try {
      const r = await api("/api/admin/settings", { method: "POST", body: JSON.stringify({ earlyAccessEnabled: !settings.earlyAccessEnabled }) });
      setSettings(r);
      hap("notif", "success");
      showToast(r.earlyAccessEnabled ? "Erta kirish yoqildi" : "Erta kirish o'chirildi", "ok");
    } catch (e) {
      showToast(e.error || "Xato", "err");
    } finally {
      setToggling(false);
    }
  }

  async function connectSteam() {
    setSteamConnecting(true);
    try {
      const r = await api("/api/admin/steam-login-url");
      if (tg?.openLink) tg.openLink(r.url);
      else window.open(r.url, "_blank");
    } catch (e) {
      showToast(e.error || "Xato", "err");
    } finally {
      setSteamConnecting(false);
    }
  }

  const statCards = stats && [
    { label: "Jami auksionlar", value: stats.totalAuctions.toString(), icon: Gavel, color: "text-primary" },
    { label: "Foydalanuvchilar", value: stats.totalUsers.toString(), icon: Users, color: "text-accent" },
    { label: "Jami tushgan pul", value: fmtMoney(stats.totalRevenue), icon: TrendingUp, color: "text-success" },
    { label: "Jami bidlar", value: stats.totalBids.toString(), icon: Package, color: "text-warning" },
    { label: "Obmen komissiyasi", value: fmtMoney(stats.totalTradeFees), icon: Coins, color: "text-accent" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-primary">Admin</span>
          <h1 className="font-heading text-2xl font-bold uppercase tracking-wide text-foreground">Boshqaruv paneli</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">Auksionlar, foydalanuvchilar va sozlamalarni shu yerdan boshqaring.</p>
      </div>

      {error && <Empty title="Xato yuz berdi" />}
      {!stats && !error && <StatCardsSkeleton />}

      {statCards && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {statCards.map((s, i) => {
            const Icon = s.icon;
            return (
              <div
                key={s.label}
                className="hover-lift animate-fade-up border border-border bg-card p-4 shadow-panel"
                style={{ "--fade-delay": `${i * 40}ms` }}
              >
                <Icon className={"size-5 " + s.color} />
                <p className="mt-3 font-heading text-2xl font-bold tracking-tight text-foreground">{s.value}</p>
                <p className="truncate text-xs text-muted-foreground">{s.label}</p>
              </div>
            );
          })}
        </div>
      )}

      <div className="border border-border bg-card shadow-panel">
        <div className="border-b border-border px-4 py-3">
          <h2 className="font-heading text-sm font-bold uppercase tracking-wide text-foreground">Boshqaruv</h2>
        </div>
        <div className="divide-y divide-border">
          {[
            { icon: Package, label: "Auksionlar", page: "admin-auctions" },
            { icon: Plus, label: "Yangi auction ochish", page: "admin-auction-form" },
            { icon: Users, label: "Foydalanuvchilar", page: "admin-users" },
            { icon: Ticket, label: "Promo kodlar", page: "admin-promos" },
            { icon: ImageIcon, label: "Reklama bannerlari", page: "admin-banners" },
          ].map((l) => {
            const Icon = l.icon;
            return (
              <button
                key={l.page}
                type="button"
                onClick={() => navigate(l.page, l.page === "admin-auction-form" ? null : undefined)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary/40"
              >
                <Icon className="size-4 text-primary" />
                <span className="flex-1 text-sm font-medium text-foreground">{l.label}</span>
                <span className="text-muted-foreground">›</span>
              </button>
            );
          })}
        </div>
      </div>

      {stats && (
        <div className="border border-border bg-card p-4">
          <h2 className="mb-3 font-heading text-sm font-bold uppercase tracking-wide text-foreground">Statistika</h2>
          <dl className="space-y-2 text-sm">
            {[
              ["Bloklangan userlar", stats.blockedUsers],
              ["Jami auksionlar", stats.totalAuctions],
              ["Aktiv", stats.activeAuctions],
              ["Tugagan", stats.finishedAuctions],
              ["Bekor qilingan", stats.cancelledAuctions],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="font-heading font-bold text-foreground">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      <div>
        <h2 className="mb-3 flex items-center gap-2 font-heading text-sm font-bold uppercase tracking-wide text-foreground">
          <Lock className="size-4 text-primary" />
          Sozlamalar
        </h2>
        <div className="space-y-4">
          {settings && (
            <div className="border border-border bg-card p-5">
              <p className="flex items-center gap-1.5 font-heading text-sm font-bold text-foreground"><Gift className="size-3.5" /> Referral bonusi</p>
              <p className="mt-1 text-xs text-muted-foreground">Do'st taklif qilgan va taklif qilingan foydalanuvchiga beriladigan bonus (so'm).</p>
              <div className="mt-3 flex gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  value={refBonus}
                  onChange={(e) => setRefBonus(e.target.value)}
                  placeholder="10000"
                  className="w-full border border-border bg-secondary px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
                />
                <button
                  type="button"
                  disabled={savingRefBonus}
                  onClick={saveRefBonus}
                  className="shrink-0 bg-primary px-4 font-heading text-sm font-bold uppercase tracking-wide text-primary-foreground disabled:opacity-50"
                >
                  {savingRefBonus ? "..." : "Saqlash"}
                </button>
              </div>
            </div>
          )}

          {settings && (
            <div className="border border-border bg-card p-5">
              <p className="flex items-center gap-2 font-heading text-sm font-bold text-foreground">
                <Coins className="size-4 text-accent" />
                Obmen komissiyasi
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Har bir daraja "shu narxgacha" (so'm) va shu daraja uchun qat'iy komissiya (so'm) — sotuvchidan ushlab qolinadi. Darajalarni o'zingiz qo'shishingiz/o'chirishingiz mumkin.</p>
              <div className="mt-3 space-y-2">
                {feeTiers.map((tier, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-6 shrink-0 text-xs text-muted-foreground">{i + 1}</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={tier.max}
                      onChange={(e) => setFeeTierField(i, "max", e.target.value)}
                      placeholder="Narxgacha (so'm)"
                      className="w-full border border-border bg-secondary px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                    />
                    <input
                      type="number"
                      inputMode="numeric"
                      value={tier.fee}
                      onChange={(e) => setFeeTierField(i, "fee", e.target.value)}
                      placeholder="Komissiya (so'm)"
                      className="w-full border border-border bg-secondary px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                    />
                    <button
                      type="button"
                      disabled={feeTiers.length <= 1}
                      onClick={() => removeFeeTier(i)}
                      className="shrink-0 text-muted-foreground transition-colors hover:text-destructive disabled:opacity-30"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addFeeTier}
                  className="flex w-full items-center justify-center gap-1.5 border border-dashed border-border py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
                >
                  <Plus className="size-3.5" />
                  Yana daraja qo'shish
                </button>
                <button
                  type="button"
                  disabled={savingFeeTiers}
                  onClick={saveFeeTiers}
                  className="w-full bg-primary py-2.5 font-heading text-sm font-bold uppercase tracking-wide text-primary-foreground disabled:opacity-50"
                >
                  {savingFeeTiers ? "..." : "Saqlash"}
                </button>
              </div>
            </div>
          )}

          {settings ? (
            <div className="border border-border bg-card p-5">
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-1.5 font-heading text-sm font-bold text-foreground"><Lock className="size-3.5" /> Erta kirish (VIP+)</p>
                <span className={"border px-2 py-0.5 text-xs font-semibold " + (settings.earlyAccessEnabled ? "border-success/40 bg-success/10 text-success" : "border-destructive/40 bg-destructive/10 text-destructive")}>
                  {settings.earlyAccessEnabled ? "Yoqilgan" : "O'chirilgan"}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">O'chirilgan bo'lsa, barcha auksionlar hamma uchun bir vaqtda ochiladi.</p>
              <button
                type="button"
                disabled={toggling}
                onClick={toggleEarlyAccess}
                className={"mt-3 w-full py-2.5 font-heading text-sm font-bold uppercase tracking-wide transition-colors disabled:opacity-50 " + (settings.earlyAccessEnabled ? "bg-destructive/15 text-destructive hover:bg-destructive/25" : "bg-success/15 text-success hover:bg-success/25")}
              >
                {toggling ? "..." : settings.earlyAccessEnabled ? "O'chirish" : "Yoqish"}
              </button>
            </div>
          ) : (
            <BlockSkeleton lines={2} />
          )}

          {settings && (
            <div className="border border-border bg-card p-5">
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-2 font-heading text-sm font-bold text-foreground">
                  <Gamepad2 className="size-4 text-accent" />
                  Steam
                </p>
                <span className={"border px-2 py-0.5 text-xs font-semibold " + (settings.steamId64 ? "border-success/40 bg-success/10 text-success" : "border-border text-muted-foreground")}>
                  {settings.steamId64 ? "Ulangan" : "Ulanmagan"}
                </span>
              </div>
              <p className="mt-1 break-all text-xs text-muted-foreground">
                {settings.steamId64 ? `SteamID64: ${settings.steamId64}` : "Steam bilan ulab, SteamID64'ni avtomatik oling."}
              </p>
              <button
                type="button"
                disabled={steamConnecting}
                onClick={connectSteam}
                className="mt-3 w-full border border-border bg-secondary py-2.5 font-heading text-sm font-bold uppercase tracking-wide text-foreground transition-colors hover:bg-secondary/70 disabled:opacity-50"
              >
                {steamConnecting ? "..." : settings.steamId64 ? "Qayta ulash" : "Steam bilan ulash"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
