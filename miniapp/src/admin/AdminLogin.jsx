import { useState } from "react";
import { Crosshair, Lock, User } from "lucide-react";
import { api } from "./api";

export default function AdminLogin({ onLoggedIn }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setBusy(true);
    setError("");
    try {
      const r = await api("/api/admin/login", { method: "POST", body: JSON.stringify({ username: username.trim(), password }) });
      onLoggedIn(r.role);
    } catch (e) {
      setError(e.error || "Login yoki parol xato");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <form
        onSubmit={submit}
        className="animate-fade-up w-full max-w-sm space-y-5 border border-border bg-card p-8 shadow-panel-lg"
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex size-14 items-center justify-center bg-primary text-primary-foreground shadow-[0_0_36px_-6px_color-mix(in_oklch,var(--primary)_70%,transparent)] clip-tactical">
            <Crosshair className="size-7" strokeWidth={2.5} />
          </span>
          <div>
            <h1 className="font-heading text-xl font-bold uppercase tracking-wide text-foreground">Admin panel</h1>
            <p className="mt-1 text-sm text-muted-foreground">Kirish uchun login va parolni kiriting</p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2 border border-border bg-secondary px-3">
            <User className="size-4 shrink-0 text-muted-foreground" />
            <input
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Login"
              className="w-full bg-transparent py-2.5 text-sm text-foreground outline-none"
            />
          </div>
          <div className="flex items-center gap-2 border border-border bg-secondary px-3">
            <Lock className="size-4 shrink-0 text-muted-foreground" />
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Parol"
              className="w-full bg-transparent py-2.5 text-sm text-foreground outline-none"
            />
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <button
          type="submit"
          disabled={busy || !username.trim() || !password}
          className="flex w-full items-center justify-center gap-2 bg-primary py-3 font-heading text-sm font-bold uppercase tracking-wide text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {busy ? "..." : "Kirish"}
        </button>
      </form>
    </div>
  );
}
