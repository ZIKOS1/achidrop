import { ArrowLeft } from "lucide-react";

export default function BackLink({ onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="size-4" />
      {label}
    </button>
  );
}
