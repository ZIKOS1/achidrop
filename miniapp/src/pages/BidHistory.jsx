import { useEffect, useState } from "react";
import { BarChart3 } from "lucide-react";
import { api } from "../api";
import { useApp } from "../context";
import { fmtMoney } from "../utils";
import { t } from "../i18n";
import BackLink from "../components/BackLink";
import Empty from "../components/Empty";
import { ListSkeleton } from "../components/Skeleton";

export default function BidHistory() {
  const { navigate } = useApp();
  const [bids, setBids] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api("/api/bid-history").then(setBids).catch(() => setError(true));
  }, []);

  return (
    <div className="space-y-4">
      <BackLink onClick={() => navigate("profile")} label={t("common.backToProfile")} />
      <h1 className="font-heading text-2xl font-bold uppercase tracking-wide text-foreground">{t("history.bidTitle")}</h1>

      {bids === null && !error && <ListSkeleton />}
      {error && <Empty title={t("common.genericError")} />}
      {bids && bids.length === 0 && <Empty icon={BarChart3} title={t("history.noBidsYet")} />}

      {bids && bids.length > 0 && (
        <div className="border border-border bg-card shadow-panel-lg">
          <ul className="divide-y divide-border">
            {bids.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-secondary/30">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{b.lotName || "?"}</p>
                  <p className="text-xs text-muted-foreground">{b.date ? new Date(b.date).toLocaleString("uz-UZ") : "-"}</p>
                </div>
                <span className="shrink-0 font-heading text-base font-bold text-foreground">-{fmtMoney(b.amount || 0)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
