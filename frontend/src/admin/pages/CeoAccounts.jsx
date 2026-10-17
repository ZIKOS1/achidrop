import { useEffect, useState } from "react";
import { Crown, Plus, Trash2, Lock, ShieldOff, ShieldCheck } from "lucide-react";
import { api } from "../api";
import { useApp } from "../context";
import { confirmTg } from "../../utils";

export default function CeoAccounts() {
  const { showToast, openModal, closeModal } = useApp();
  const [accounts, setAccounts] = useState(null);
  const [error, setError] = useState(false);
  const [form, setForm] = useState({ username: "", password: "", role: "admin" });
  const [creating, setCreating] = useState(false);

  function load() {
    api("/api/admin/accounts").then(setAccounts).catch(() => setError(true));
  }
  useEffect(load, []);

  async function createAccount(e) {
    e.preventDefault();
    if (!form.username.trim() || !form.password) return;
    setCreating(true);
    try {
      await api("/api/admin/accounts", { method: "POST", body: JSON.stringify(form) });
      setForm({ username: "", password: "", role: "admin" });
      showToast("Yangi admin qo'shildi", "ok");
      load();
    } catch (e) {
      showToast(e.error || "Xato", "err");
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(acc) {
    try {
      await api(`/api/admin/accounts/${acc.id}`, { method: "PATCH", body: JSON.stringify({ active: !acc.active }) });
      load();
    } catch (e) {
      showToast(e.error || "Xato", "err");
    }
  }

  async function removeAccount(acc) {
    if (!(await confirmTg(`"${acc.username}" admin akkauntini butunlay o'chirmoqchimisiz?`))) return;
    try {
      await api(`/api/admin/accounts/${acc.id}`, { method: "DELETE" });
      showToast("O'chirildi", "ok");
      load();
    } catch (e) {
      showToast(e.error || "Xato", "err");
    }
  }

  function resetPassword(acc) {
    openModal({
      title: "Yangi parol o'rnatish",
      placeholder: "Yangi parol",
      okLabel: "Saqlash",
      info: `Login: ${acc.username}`,
      onSubmit: async (password) => {
        if (!password) return showToast("Parol kiriting", "err");
        try {
          await api(`/api/admin/accounts/${acc.id}`, { method: "PATCH", body: JSON.stringify({ password }) });
          showToast("Parol yangilandi", "ok");
          closeModal();
        } catch (e) {
          showToast(e.error || "Xato", "err");
        }
      },
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 font-heading text-2xl font-bold uppercase tracking-wide text-foreground">
          <Crown className="size-6 text-primary" />
          CEO — Adminlar
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Admin panelga kiruvchi akkauntlarni shu yerdan boshqaring.</p>
      </div>

      <form onSubmit={createAccount} className="border border-border bg-card p-5 shadow-panel">
        <h2 className="mb-3 flex items-center gap-1.5 font-heading text-sm font-bold uppercase tracking-wide text-foreground">
          <Plus className="size-4 text-primary" />
          Yangi admin qo'shish
        </h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <input
            type="text"
            value={form.username}
            onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
            placeholder="Login"
            className="border border-border bg-secondary px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
          />
          <input
            type="text"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            placeholder="Parol"
            className="border border-border bg-secondary px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
          />
          <select
            value={form.role}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
            className="border border-border bg-secondary px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
          >
            <option value="admin">Admin</option>
            <option value="ceo">CEO</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={creating || !form.username.trim() || !form.password}
          className="mt-3 flex w-full items-center justify-center gap-2 bg-primary py-2.5 font-heading text-sm font-bold uppercase tracking-wide text-primary-foreground disabled:opacity-50 sm:w-auto sm:px-6"
        >
          {creating ? "..." : "Qo'shish"}
        </button>
      </form>

      {error && <p className="text-sm text-destructive">Xato yuz berdi</p>}
      {accounts && (
        <div className="divide-y divide-border border border-border bg-card shadow-panel">
          {accounts.map((acc) => (
            <div key={acc.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  {acc.username}
                  {acc.role === "ceo" && <Crown className="size-3.5 text-primary" title="CEO" />}
                </p>
                <p className="text-xs text-muted-foreground">
                  {acc.role === "ceo" ? "CEO" : "Admin"} · {new Date(acc.createdAt).toLocaleDateString("uz-UZ")}
                </p>
              </div>
              <span className={"border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide " + (acc.active !== false ? "border-success/40 bg-success/10 text-success" : "border-destructive/40 bg-destructive/10 text-destructive")}>
                {acc.active !== false ? "Faol" : "O'chirilgan"}
              </span>
              <button
                type="button"
                onClick={() => resetPassword(acc)}
                title="Parolni yangilash"
                className="flex items-center gap-1 border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-accent/40 hover:text-accent"
              >
                <Lock className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => toggleActive(acc)}
                title={acc.active !== false ? "O'chirish (vaqtincha)" : "Yoqish"}
                className="flex items-center gap-1 border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-warning/40 hover:text-warning"
              >
                {acc.active !== false ? <ShieldOff className="size-3.5" /> : <ShieldCheck className="size-3.5" />}
              </button>
              <button
                type="button"
                onClick={() => removeAccount(acc)}
                title="Butunlay o'chirish"
                className="flex items-center gap-1 border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
