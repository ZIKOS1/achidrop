import { useState } from "react";
import { ShieldOff } from "lucide-react";
import { api } from "../api";
import { t } from "../i18n";

// VPN yoqilgan bo'lsa (admin Sozlamalar → VPN blok) sayt o'rniga shu oyna
// chiqadi; yopib bo'lmaydi — faqat VPN o'chirilib "Qayta tekshirish" bosiladi.
export default function VpnBlock({ onCleared }) {
  const [checking, setChecking] = useState(false);
  async function recheck() {
    setChecking(true);
    try {
      const r = await api("/api/vpn-status");
      if (!r.blocked) onCleared();
    } catch {
      // tarmoq xatosi — oyna qoladi
    } finally {
      setChecking(false);
    }
  }
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-background/90 p-4 backdrop-blur-sm">
      <div className="animate-fade-up w-full max-w-sm border border-border bg-card p-6 text-center shadow-panel-lg">
        <span className="mx-auto mb-3 flex size-12 items-center justify-center bg-destructive/15 text-destructive shadow-panel clip-tactical">
          <ShieldOff className="size-6" />
        </span>
        <h2 className="font-heading text-lg font-bold uppercase tracking-wide text-foreground">{t("vpn.title")}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t("vpn.desc")}</p>
        <button
          type="button"
          onClick={recheck}
          disabled={checking}
          className="mt-5 w-full bg-gold-grad py-3 font-heading text-sm font-bold uppercase tracking-wide text-white transition-all active:scale-[0.97] disabled:opacity-60"
        >
          {checking ? "..." : t("vpn.retry")}
        </button>
      </div>
    </div>
  );
}
