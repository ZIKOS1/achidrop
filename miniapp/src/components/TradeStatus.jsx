import { CircleDot, MessagesSquare, Clock, Send, PackageCheck, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { t } from "../i18n";

export const STATUS_CLASSES = {
  open: "border-success/40 bg-success/10 text-success",
  negotiating: "border-accent/40 bg-accent/10 text-accent",
  awaiting_confirmations: "border-warning/40 bg-warning/10 text-warning",
  seller_sending: "border-warning/40 bg-warning/10 text-warning",
  buyer_confirming: "border-warning/40 bg-warning/10 text-warning",
  completed: "border-border bg-secondary text-muted-foreground",
  cancelled: "border-destructive/40 bg-destructive/10 text-destructive",
  disputed: "border-destructive/40 bg-destructive/10 text-destructive",
};

const STATUS_ICONS = {
  open: CircleDot,
  negotiating: MessagesSquare,
  awaiting_confirmations: Clock,
  seller_sending: Send,
  buyer_confirming: PackageCheck,
  completed: CheckCircle2,
  cancelled: XCircle,
  disputed: AlertTriangle,
};

export default function TradeStatusBadge({ status, className }) {
  const Icon = STATUS_ICONS[status];
  return (
    <span className={"inline-flex items-center gap-1 border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide " + (STATUS_CLASSES[status] || "") + (className ? " " + className : "")}>
      {Icon && <Icon className="size-3" />}
      {t(`trade.status.${status}`) || status}
    </span>
  );
}
