import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, User, ShieldOff, ShieldCheck, Clock, RefreshCw, Search, Users as UsersIcon, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/useToast";
import { ToastStack } from "@/components/ToastStack";
import Pagination from "@/components/Pagination";
import PageSkeleton from "@/components/PageSkeleton";
import EmptyState from "@/components/EmptyState";

interface UserData {
  id: string;
  email: string;
  name: string;
  is_admin: boolean;
  status: "active" | "suspended" | "blocked";
  suspended_until: string | null;
  created_at: string;
  updated_at: string;
}

type SuspendUnit = "hours" | "days" | "weeks";

export default function Users() {
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const { toasts, addToast, removeToast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const { user: currentUser } = useAuth();
  const { confirm: confirmDelete, dialog: confirmDialog } = useConfirmDialog();
  const { confirm: confirmBlock, dialog: blockDialog } = useConfirmDialog();

  const [newUser, setNewUser] = useState({ email: "", name: "", password: "", is_admin: false });
  const [creating, setCreating] = useState(false);

  const [suspendTarget, setSuspendTarget] = useState<UserData | null>(null);
  const [suspendDuration, setSuspendDuration] = useState(1);
  const [suspendUnit, setSuspendUnit] = useState<SuspendUnit>("days");
  const [suspending, setSuspending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activatingId, setActivatingId] = useState<string | null>(null);

  // Search & filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "suspended" | "blocked">("all");
  const [roleFilter, setRoleFilter] = useState<"all" | "admin" | "user">("all");

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      !searchQuery ||
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || u.status === statusFilter;
    const matchesRole = roleFilter === "all" || (roleFilter === "admin" ? u.is_admin : !u.is_admin);
    return matchesSearch && matchesStatus && matchesRole;
  });

  useEffect(() => { document.title = "Users — Firecrawl Gateway" }, [])

  // Pagination state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  const paginatedUsers = filteredUsers.slice((page - 1) * pageSize, page * pageSize);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [searchQuery, statusFilter, roleFilter]);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch("/admin/api/users", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch users");
      const json = await res.json();
      setUsers(json.data || []);
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Error loading users", "error");
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
      addToast("User created successfully", "success");
      await fetchUsers();
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to create user", "error");
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
      addToast("User deleted", "success");
      await fetchUsers();
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to delete user", "error");
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

  async function handleSuspend(userId: string) {
    setSuspending(true);
    try {
      const res = await fetch(`/admin/api/users/${userId}/suspend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ duration: suspendDuration, unit: suspendUnit }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({ error: "Failed to suspend user" }));
        throw new Error(json.error);
      }
      setSuspendTarget(null);
      addToast("User suspended", "success");
      await fetchUsers();
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to suspend user", "error");
    } finally {
      setSuspending(false);
    }
  }

  function openSuspend(user: UserData) {
    setSuspendTarget(user);
    setSuspendDuration(1);
    setSuspendUnit("days");
  }

  function handleBlock(user: UserData) {
    confirmBlock({
      title: "Block User",
      message: `Are you sure you want to permanently block ${user.name}? They will be unable to log in or use API keys until manually activated.`,
      confirmLabel: "Block",
      variant: "danger",
      onConfirm: async () => {
        try {
          const res = await fetch(`/admin/api/users/${user.id}/block`, {
            method: "POST",
            credentials: "include",
          });
          if (!res.ok) throw new Error("Failed to block user");
          addToast("User blocked", "success");
          await fetchUsers();
        } catch (err) {
          addToast(err instanceof Error ? err.message : "Failed to block user", "error");
        }
      },
    });
  }

  async function handleActivate(id: string) {
    setActivatingId(id);
    try {
      const res = await fetch(`/admin/api/users/${id}/activate`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to activate user");
      addToast("User activated", "success");
      await fetchUsers();
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to activate user", "error");
    } finally {
      setActivatingId(null);
    }
  }

  function statusBadge(status: string, suspendedUntil: string | null) {
    if (status === "blocked") {
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-danger-muted px-2 py-0.5 text-xs text-danger-fg">
          <ShieldOff className="size-3" /> Blocked
        </span>
      );
    }
    if (status === "suspended") {
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-warning-muted px-2 py-0.5 text-xs text-warning-fg">
          <Clock className="size-3" /> Suspended
          {suspendedUntil && (
            <span className="opacity-70">
              until {new Date(suspendedUntil).toLocaleString("en-US", { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-success-muted px-2 py-0.5 text-xs text-success-fg">
        <ShieldCheck className="size-3" /> Active
      </span>
    );
  }

  if (loading) {
    return <PageSkeleton columns={6} rows={6} />;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-[1680px] px-4 py-4 lg:px-6">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <User className="size-5 text-muted-foreground" />
            <h1 className="text-lg font-semibold">Users</h1>
            <span className="text-sm text-muted-foreground">
              ({filteredUsers.length} of {users.length})
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setRefreshing(true); void fetchUsers().then(() => setRefreshing(false)); }}
              disabled={refreshing}
              className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-surface-3 px-3 py-2 text-sm text-foreground hover:bg-surface-4 disabled:opacity-50"
            >
              <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} /> Refresh
            </button>
            <button
              onClick={() => setShowForm((v) => !v)}
              className="flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-2 text-sm font-medium text-background hover:bg-foreground/90"
            >
              <Plus className="size-4" /> Add user
            </button>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-10 w-full rounded-lg border border-white/[0.08] bg-surface-3 pl-9 pr-3 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground hover:border-white/12 focus:border-ring focus:ring-2 focus:ring-ring/30"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as "all" | "active" | "suspended" | "blocked")}>
            <SelectTrigger className="h-10 bg-surface-3 text-sm px-3">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
              <SelectItem value="blocked">Blocked</SelectItem>
            </SelectContent>
          </Select>
          <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as "all" | "admin" | "user")}>
            <SelectTrigger className="h-10 bg-surface-3 text-sm px-3">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="user">User</SelectItem>
            </SelectContent>
          </Select>
          {(searchQuery || statusFilter !== "all" || roleFilter !== "all") && (
            <button
              onClick={() => { setSearchQuery(""); setStatusFilter("all"); setRoleFilter("all"); }}
              className="h-10 rounded-lg border border-white/[0.08] bg-surface-3 px-3 text-sm text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          )}
        </div>

        {showForm && (
          <form onSubmit={handleCreate} className="mb-6 rounded-lg border border-white/[0.06] bg-surface-2 p-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                placeholder="Name"
                value={newUser.name}
                onChange={(e) => setNewUser((u) => ({ ...u, name: e.target.value }))}
                required
                className="h-10 rounded-lg border border-white/[0.08] bg-surface-3 px-3 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground hover:border-white/12 focus:border-ring focus:ring-2 focus:ring-ring/30"
              />
              <input
                type="email"
                placeholder="Email"
                value={newUser.email}
                onChange={(e) => setNewUser((u) => ({ ...u, email: e.target.value }))}
                required
                className="h-10 rounded-lg border border-white/[0.08] bg-surface-3 px-3 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground hover:border-white/12 focus:border-ring focus:ring-2 focus:ring-ring/30"
              />
              <input
                type="password"
                placeholder="Password"
                value={newUser.password}
                onChange={(e) => setNewUser((u) => ({ ...u, password: e.target.value }))}
                required
                className="h-10 rounded-lg border border-white/[0.08] bg-surface-3 px-3 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground hover:border-white/12 focus:border-ring focus:ring-2 focus:ring-ring/30"
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
                  <th className="px-4 py-3 text-left font-semibold">Status</th>
                  <th className="px-4 py-3 text-left font-semibold">Created</th>
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedUsers.map((u) => (
                  <tr key={u.id} className="group relative border-b border-white/[0.04] transition-colors hover:bg-white/[0.03]"
                  >
                    <td className="absolute left-0 top-0 bottom-0 w-[2px] bg-foreground/20 opacity-0 transition-opacity group-hover:opacity-100" />
                    <td className="px-4 py-3">{u.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                    <td className="px-4 py-3">
                      {u.is_admin ? (
                        <span className="rounded-md bg-warning-muted px-2 py-0.5 text-xs text-warning-fg">Admin</span>
                      ) : (
                        <span className="rounded-md bg-surface-4 px-2 py-0.5 text-xs text-muted-foreground">User</span>
                      )}
                    </td>
                    <td className="px-4 py-3">{statusBadge(u.status, u.suspended_until)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{new Date(u.created_at).toLocaleString("en-US", { month: "short", day: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {u.status === "active" && currentUser?.id !== u.id && (
                          <button
                            onClick={() => openSuspend(u)}
                            className="inline-flex items-center gap-1 rounded-md border border-warning-muted bg-warning-muted/30 px-2 py-1 text-xs text-warning-fg hover:bg-warning-muted/50"
                          >
                            <Clock className="size-3" /> Suspend
                          </button>
                        )}
                        {u.status !== "blocked" && currentUser?.id !== u.id && (
                          <button
                            onClick={() => handleBlock(u)}
                            className="inline-flex items-center gap-1 rounded-md border border-danger-muted bg-danger-muted/30 px-2 py-1 text-xs text-danger-fg hover:bg-danger-muted/50"
                          >
                            <ShieldOff className="size-3" /> Block
                          </button>
                        )}
                        {u.status !== "active" && (
                          <button
                            onClick={() => handleActivate(u.id)}
                            disabled={activatingId === u.id}
                            className="inline-flex items-center gap-1 rounded-md border border-success-muted bg-success-muted/30 px-2 py-1 text-xs text-success-fg hover:bg-success-muted/50 disabled:opacity-50"
                          >
                            {activatingId === u.id ? <Loader2 className="size-3 animate-spin" /> : <ShieldCheck className="size-3" />} Activate
                          </button>
                        )}
                        {currentUser?.id !== u.id && (
                          <button
                            onClick={() => handleDelete(u.id)}
                            className="inline-flex items-center gap-1 rounded-md border border-white/[0.08] bg-surface-3 px-2 py-1 text-xs text-muted-foreground hover:bg-surface-4"
                          >
                            <Trash2 className="size-3" /> Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {paginatedUsers.length === 0 && (
                  <tr>
                    <td colSpan={6}>
                      <EmptyState
                        icon={UsersIcon}
                        title={users.length === 0 ? "No users found" : "No users match your filters"}
                        description={users.length === 0 ? "Get started by adding your first user." : "Try adjusting your search or filter criteria."}
                        action={users.length === 0 ? { label: "Add user", onClick: () => setShowForm(true) } : undefined}
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            totalItems={filteredUsers.length}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </div>
      </div>

      {/* Suspend Dialog */}
      {suspendTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={(e) => { if (e.target === e.currentTarget) setSuspendTarget(null); }}
        >
          <div className="w-full max-w-sm rounded-xl border border-white/[0.08] bg-surface-2 p-5 shadow-xl space-y-4">
            <h3 className="text-base font-semibold">Suspend User</h3>
            <p className="text-sm text-muted-foreground">
              Suspend <span className="font-medium text-foreground">{suspendTarget.name}</span> for a period of time. They will be unable to log in or use API keys until the suspension expires.
            </p>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Duration</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={suspendDuration}
                    onChange={(e) => setSuspendDuration(Math.max(1, parseInt(e.target.value) || 1))}
                    className="h-9 w-20 rounded-lg border border-white/[0.08] bg-surface-3 px-3 text-sm text-foreground outline-none"
                  />
                  <Select value={suspendUnit} onValueChange={(v) => setSuspendUnit(v as SuspendUnit)}>
                    <SelectTrigger className="h-9 flex-1 bg-surface-3 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hours">Hour(s)</SelectItem>
                      <SelectItem value="days">Day(s)</SelectItem>
                      <SelectItem value="weeks">Week(s)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setSuspendTarget(null)}
                className="h-9 rounded-lg border border-white/[0.08] bg-surface-3 px-3 text-sm text-foreground hover:bg-surface-4"
              >
                Cancel
              </button>
              <button
                onClick={() => handleSuspend(suspendTarget.id)}
                disabled={suspending}
                className="h-9 rounded-lg bg-warning-fg px-3 text-sm font-medium text-background hover:bg-warning-fg/90 disabled:opacity-50"
              >
                {suspending ? "Suspending..." : "Suspend"}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDialog}
      {blockDialog}
      <ToastStack toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
