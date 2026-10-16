import { Component } from "react";
import { RefreshCw } from "lucide-react";
import { t } from "../i18n";

// Bitta sahifada kutilmagan xato bo'lsa butun sayt oq ekranga aylanmasin —
// menyu joyida qoladi, sahifa o'rnida "Qayta yuklash" chiqadi.
export default class ErrorBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(err) { console.error("[AchiDrop] page error:", err); }
  componentDidUpdate(prev) { if (prev.resetKey !== this.props.resetKey && this.state.failed) this.setState({ failed: false }); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="mx-auto max-w-md rounded-3xl border border-border bg-card p-6 text-center">
        <p className="text-sm text-foreground">{t("common.genericError")}</p>
        <button type="button" onClick={() => location.reload()} className="btn-grad mx-auto mt-4 flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-semibold">
          <RefreshCw className="size-4" />
          {t("sell.refresh")}
        </button>
      </div>
    );
  }
}
