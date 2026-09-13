import { CheckCircle2, XCircle, Info } from "lucide-react";

export default function Toast({ toast }) {
  const tone =
    toast.type === "ok" ? "bg-success text-success-foreground" :
    toast.type === "err" ? "bg-destructive text-destructive-foreground" :
    "border border-border bg-card text-foreground";

  const Icon = toast.type === "ok" ? CheckCircle2 : toast.type === "err" ? XCircle : Info;

  return (
    <div
      className={
        "fixed left-1/2 z-[500] flex w-max max-w-[88vw] -translate-x-1/2 items-center gap-2 text-center px-4 py-2.5 text-sm font-medium shadow-panel-lg transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] " +
        tone + " " +
        (toast.show ? "top-20 opacity-100" : "-top-16 opacity-0 pointer-events-none")
      }
    >
      <Icon className="size-4 shrink-0" />
      {toast.msg}
    </div>
  );
}
