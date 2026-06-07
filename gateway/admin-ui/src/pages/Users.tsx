import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, Plus, Trash2, User, AlertCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useConfirmDialog } from "@/components/ConfirmDialog";

interface UserData {
  id: string;
  email: string;
  name: string;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
}

export default function Users() {
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const { user: currentUser } = useAuth();
  const { confirm: confirmDelete, dialog: confirmDialog } = useConfirmDialog();

  const [newUser, setNewUser] = useState({ email: "", name: "", password: "", is_admin: false });
  const [creating, setCreating] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch("/admin/api/users", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch users");
      const json = await res.json();
      setUsers(json.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading users");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch("/admin/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(newUser),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({ error: "Failed to create user" }));
        throw new Error(json.error);
      }
      setNewUser({ email: "", name: "", password: "", is_admin: false });
      setShowForm(false);
      await fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setCreating(false);
    }
  }

  async function doDelete(id: string) {
    try {
      const res = await fetch(`/admin/api/users/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete user");
      await fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete user");
    }
  }

  function handleDelete(id: string) {
    confirmDelete({
      title: "Delete User",
      message: "Are you sure you want to delete this user? This action cannot be undone.",
      confirmLabel: "Delete",
      variant: "danger",
      onConfirm: () => doDelete(id),
    });
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading users...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-[1680px] px-4 py-4 lg:px-6">
        <div className="mb-6 flex items-center gap-4">
          <a href="/admin" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" /> Back
          </a>
        </div>

        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <User className="size-5 text-muted-foreground" />
            <h1 className="text-lg font-semibold">Users</h1>
            <span className="text-sm text-muted-foreground">({users.length})</span>
          </div>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-2 text-sm font-medium text-background hover:bg-foreground/90"
          >
            <Plus className="size-4" /> Add user
          </button>
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-danger-muted bg-danger-muted/50 px-3 py-2 text-sm text-danger-fg">
            <AlertCircle className="size-4" /> {error}
          </div>
        )}

        {showForm && (
          <form onSubmit={handleCreate} className="mb-6 rounded-lg border border-white/[0.06] bg-surface-2 p-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                placeholder="Name"
                value={newUser.name}
                onChange={(e) => setNewUser((u) => ({ ...u, name: e.target.value }))}
                required
                className="h-10 rounded-lg border border-white/[0.08] bg-surface-3 px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
              <input
                type="email"
                placeholder="Email"
                value={newUser.email}
                onChange={(e) => setNewUser((u) => ({ ...u, email: e.target.value }))}
                required
                className="h-10 rounded-lg border border-white/[0.08] bg-surface-3 px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
              <input
                type="password"
                placeholder="Password"
                value={newUser.password}
                onChange={(e) => setNewUser((u) => ({ ...u, password: e.target.value }))}
                required
                className="h-10 rounded-lg border border-white/[0.08] bg-surface-3 px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={newUser.is_admin}
                  onChange={(e) => setNewUser((u) => ({ ...u, is_admin: e.target.checked }))}
                  className="size-4"
                />
                Admin
              </label>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={creating}
                className="h-9 rounded-lg bg-foreground px-3 text-sm font-medium text-background hover:bg-foreground/90 disabled:opacity-50"
              >
                {creating ? "Creating..." : "Create user"}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="h-9 rounded-lg border border-white/[0.08] bg-surface-3 px-3 text-sm text-foreground hover:bg-surface-4"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        <div className="rounded-lg border border-white/[0.06] bg-surface-2 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06] bg-surface-3">
                  <th className="px-4 py-3 text-left font-semibold">Name</th>
                  <th className="px-4 py-3 text-left font-semibold">Email</th>
                  <th className="px-4 py-3 text-left font-semibold">Role</th>
                  <th className="px-4 py-3 text-left font-semibold">Created</th>
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                    <td className="px-4 py-3">{u.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                    <td className="px-4 py-3">
                      {u.is_admin ? (
                        <span className="rounded-md bg-warning-muted px-2 py-0.5 text-xs text-warning-fg">Admin</span>
                      ) : (
                        <span className="rounded-md bg-surface-4 px-2 py-0.5 text-xs text-muted-foreground">User</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{new Date(u.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-right">
                      {currentUser?.id !== u.id && (
                        <button
                          onClick={() => handleDelete(u.id)}
                          className="inline-flex items-center gap-1 rounded-md border border-danger-muted bg-danger-muted/30 px-2 py-1 text-xs text-danger-fg hover:bg-danger-muted/50"
                        >
                          <Trash2 className="size-3" /> Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                      No users found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {confirmDialog}
    </div>
  );
}
