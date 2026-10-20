import { useEffect, useState } from "react";
import { Bell, Trash2 } from "lucide-react";
import { api } from "../api";
import { useApp } from "../context";
import { t } from "../i18n";
import BackLink from "../components/BackLink";
import Empty from "../components/Empty";
import { ListSkeleton } from "../components/Skeleton";

export default function Notifications() {
  const { navigate } = useApp();
  const [list, setList] = useState(null);
  const [error, setError] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    api("/api/notifications")
      .then((data) => {
        setList(data);
        data.filter((n) => !n.read).forEach((n) => {
          api(`/api/notifications/${n.id}/read`, { method: "POST" }).catch(() => {});
        });
      })
      .catch(() => setError(true));
  }, []);

  const clearAll = () => {
    setClearing(true);
    api("/api/notifications/clear", { method: "POST" })
      .then(() => setList([]))
      .catch(() => {})
      .finally(() => { setClearing(false); setConfirming(false); });
  };

  return (
    <div className="space-y-4">
      <BackLink onClick={() => navigate("profile")} label={t("common.backToProfile")} />
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-bold uppercase tracking-wide text-foreground">{t("notifications.title")}</h1>
        {list && list.length > 0 && !confirming && (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="inline-flex items-center gap-1.5 border border-border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:border-[#C9392F] hover:text-[#C9392F]"
          >
            <Trash2 className="size-3.5" />
            {t("notifications.clear")}
          </button>
        )}
      </div>

      {confirming && (
        <div className="flex flex-wrap items-center justify-between gap-3 border border-[#C9392F]/40 bg-[#C9392F]/[0.06] px-4 py-3">
          <p className="text-sm text-foreground">{t("notifications.clearConfirm")}</p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={clearing}
              onClick={() => setConfirming(false)}
              className="border border-border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              disabled={clearing}
              onClick={clearAll}
              className="bg-[#C9392F] px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white disabled:opacity-60"
            >
              {t("notifications.clear")}
            </button>
          </div>
        </div>
      )}

      {list === null && !error && <ListSkeleton />}
      {error && <Empty title={t("common.error")} />}
      {list && list.length === 0 && <Empty icon={Bell} title={t("notifications.emptyDesc")} />}

      {list && list.length > 0 && (
        <div className="border border-border bg-card shadow-panel-lg">
          <ul className="divide-y divide-border">
            {list.map((n) => (
              <li key={n.id} className={"px-4 py-3 transition-colors hover:bg-secondary/30" + (!n.read ? " border-l-2 border-primary bg-primary/[0.03]" : "")}>
                <p className="whitespace-pre-line text-sm text-foreground">{String(n.text || "").replace(/\*/g, "")}</p>
                <p className="mt-1 text-xs text-muted-foreground">{n.date ? new Date(n.date).toLocaleString("uz-UZ") : "-"}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
