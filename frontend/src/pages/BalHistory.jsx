import { useEffect, useState } from "react";
import { CreditCard, ArrowDownRight, ArrowUpRight } from "lucide-react";
import { api } from "../api";
import { useApp } from "../context";
import { fmtMoney } from "../utils";
import { t } from "../i18n";
import BackLink from "../components/BackLink";
import Empty from "../components/Empty";
import { ListSkeleton } from "../components/Skeleton";

export default function BalHistory() {
  const { navigate } = useApp();
  const [hist, setHist] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api("/api/balance-history").then(setHist).catch(() => setError(true));
  }, []);

  return (
    <div className="space-y-4">
      <BackLink onClick={() => navigate("profile")} label={t("common.backToProfile")} />
      <h1 className="font-heading text-2xl font-bold uppercase tracking-wide text-foreground">{t("history.balTitle")}</h1>

      {hist === null && !error && <ListSkeleton />}
      {error && <Empty title={t("common.genericError")} />}
      {hist && hist.length === 0 && <Empty icon={CreditCard} title={t("history.noBalHistory")} />}

      {hist && hist.length > 0 && (
        <div className="border border-border bg-card shadow-panel-lg">
          <ul className="divide-y divide-border">
            {hist.map((h, i) => {
              const positive = h.amount > 0;
              const Icon = positive ? ArrowDownRight : ArrowUpRight;
              return (
                <li key={i} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-secondary/30">
                  <span className={"flex size-8 shrink-0 items-center justify-center " + (positive ? "bg-success/10 text-success shadow-[0_0_12px_-4px_color-mix(in_oklch,var(--success)_55%,transparent)]" : "bg-primary/10 text-primary shadow-panel")}>
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{h.reason || "-"}</p>
                    <p className="text-xs text-muted-foreground">{h.date ? new Date(h.date).toLocaleString("uz-UZ") : "-"}</p>
                  </div>
                  <span className={"shrink-0 font-heading text-base font-bold tabular-nums " + (positive ? "text-success" : "text-foreground")}>
                    {positive ? "+" : ""}{fmtMoney(h.amount || 0)}
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
