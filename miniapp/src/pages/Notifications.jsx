import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
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

  return (
    <div className="space-y-4">
      <BackLink onClick={() => navigate("profile")} label={t("common.backToProfile")} />
      <h1 className="font-heading text-2xl font-bold uppercase tracking-wide text-foreground">{t("notifications.title")}</h1>

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
