import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Key, AlertCircle, Copy, Check, RefreshCw, Search, KeyRound } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import Pagination from "@/components/Pagination";
import PageSkeleton from "@/components/PageSkeleton";
import EmptyState from "@/components/EmptyState";

interface ApiKeyData {
  id: string;
  user_id: string;
  name: string;
  key_prefix: string;
  revoked: boolean;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
  key?: string; // shown only on creation
}

export default function ApiKeys() {
  const [keys, setKeys] = useState<ApiKeyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const { user } = useAuth();
  const { confirm: confirmRevoke, dialog: confirmDialog } = useConfirmDialog();

  const [newKeyName, setNewKeyName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createdKey, setCreatedKey] = useState<ApiKeyData | null>(null);
  const [copied, setCopied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Search & filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "revoked">("all");

  const filteredKeys = keys.filter((k) => {
    const matchesSearch =
      !searchQuery ||
      k.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      k.key_prefix.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "active" ? !k.revoked : k.revoked);
    return matchesSearch && matchesStatus;
  });

  // Pagination state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const totalPages = Math.max(1, Math.ceil(filteredKeys.length / pageSize));
  const paginatedKeys = filteredKeys.slice((page - 1) * pageSize, page * pageSize);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [searchQuery, statusFilter]);

  const fetchKeys = useCallback(async () => {
    try {
      const res = await fetch("/admin/api/api-keys", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch API keys");
      const json = await res.json();
      setKeys(json.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading API keys");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchKeys();
  }, [fetchKeys]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setCreating(true);
    try {
      const res = await fetch("/admin/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ user_id: user.id, name: newKeyName }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({ error: "Failed to create API key" }));
        throw new Error(json.error);
      }
      const json = await res.json();
      setCreatedKey(json.data);
      setNewKeyName("");
      setShowForm(false);
      await fetchKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create API key");
    } finally {
      setCreating(false);
    }
  }

  async function doRevoke(id: string) {
    try {
      const res = await fetch(`/admin/api/api-keys/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to revoke API key");
      await fetchKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke API key");
    }
  }

  function handleRevoke(id: string) {
    confirmRevoke({
      title: "Revoke API Key",
      message: "Are you sure you want to revoke this API key? This action cannot be undone.",
      confirmLabel: "Revoke",
      variant: "warning",
      onConfirm: () => doRevoke(id),
    });
  }

  async function copyKey(key: string) {
    await navigator.clipboard.writeText(key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return <PageSkeleton columns={6} rows={6} />;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-[1680px] px-4 py-4 lg:px-6">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Key className="size-5 text-muted-foreground" />
            <h1 className="text-lg font-semibold">API Keys</h1>
            <span className="text-sm text-muted-foreground">
              ({filteredKeys.length} of {keys.length})
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setRefreshing(true); void fetchKeys().then(() => setRefreshing(false)); }}
              disabled={refreshing}
              className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-surface-3 px-3 py-2 text-sm text-foreground hover:bg-surface-4 disabled:opacity-50"
            >
              <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} /> Refresh
            </button>
            <button
              onClick={() => { setShowForm(true); setCreatedKey(null); }}
              className="flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-2 text-sm font-medium text-background hover:bg-foreground/90"
            >
              <Plus className="size-4" /> New key
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-danger-muted bg-danger-muted/50 px-3 py-2 text-sm text-danger-fg">
            <AlertCircle className="size-4" /> {error}
          </div>
        )}

        {/* Search & Filter Bar */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by name or prefix..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-10 w-full rounded-lg border border-white/[0.08] bg-surface-3 pl-9 pr-3 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground hover:border-white/12 focus:border-ring focus:ring-2 focus:ring-ring/30"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "all" | "active" | "revoked")}
            className="h-10 rounded-lg border border-white/[0.08] bg-surface-3 px-3 text-sm text-foreground outline-none"
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="revoked">Revoked</option>
          </select>
          {(searchQuery || statusFilter !== "all") && (
            <button
              onClick={() => { setSearchQuery(""); setStatusFilter("all"); }}
              className="h-10 rounded-lg border border-white/[0.08] bg-surface-3 px-3 text-sm text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          )}
        </div>

        {createdKey && (
          <div className="mb-6 rounded-lg border border-success-muted bg-success-muted/30 p-4 space-y-2">
            <p className="text-sm font-medium text-success-fg">API key created. Copy it now — you won&apos;t see it again.</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-lg bg-surface-2 px-3 py-2 text-sm font-mono text-foreground">
                {createdKey.key}
              </code>
              <button
                onClick={() => createdKey.key && copyKey(createdKey.key)}
                className="inline-flex items-center gap-1 rounded-lg border border-white/[0.08] bg-surface-3 px-3 py-2 text-sm hover:bg-surface-4"
              >
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <button
              onClick={() => setCreatedKey(null)}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Dismiss
            </button>
          </div>
        )}

        {showForm && (
          <form onSubmit={handleCreate} className="mb-6 rounded-lg border border-white/[0.06] bg-surface-2 p-4 space-y-3">
            <input
              placeholder="Key name (e.g., Production, Development)"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              required
              className="h-10 w-full rounded-lg border border-white/[0.08] bg-surface-3 px-3 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground hover:border-white/12 focus:border-ring focus:ring-2 focus:ring-ring/30"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={creating}
                className="h-9 rounded-lg bg-foreground px-3 text-sm font-medium text-background hover:bg-foreground/90 disabled:opacity-50"
              >
                {creating ? "Creating..." : "Create key"}
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
                  <th className="px-4 py-3 text-left font-semibold">Prefix</th>
                  <th className="px-4 py-3 text-left font-semibold">Status</th>
                  <th className="px-4 py-3 text-left font-semibold">Created</th>
                  <th className="px-4 py-3 text-left font-semibold">Last Used</th>
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedKeys.map((k) => (
                  <tr key={k.id} className="group relative border-b border-white/[0.04] transition-colors hover:bg-white/[0.03]">
                    <td className="absolute left-0 top-0 bottom-0 w-[2px] bg-foreground/20 opacity-0 transition-opacity group-hover:opacity-100" />
                    <td className="px-4 py-3">{k.name}</td>
                    <td className="px-4 py-3 font-mono text-muted-foreground">{k.key_prefix}...</td>
                    <td className="px-4 py-3">
                      {k.revoked ? (
                        <span className="rounded-md bg-danger-muted px-2 py-0.5 text-xs text-danger-fg">Revoked</span>
                      ) : (
                        <span className="rounded-md bg-success-muted px-2 py-0.5 text-xs text-success-fg">Active</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{new Date(k.created_at).toLocaleString("en-US", { month: "short", day: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {k.last_used_at
                        ? new Date(k.last_used_at).toLocaleString("en-US", { month: "short", day: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
                        : <span className="text-xs italic opacity-60">Never</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!k.revoked && (
                        <button
                          onClick={() => handleRevoke(k.id)}
                          className="inline-flex items-center gap-1 rounded-md border border-danger-muted bg-danger-muted/30 px-2 py-1 text-xs text-danger-fg hover:bg-danger-muted/50"
                        >
                          <Trash2 className="size-3" /> Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {paginatedKeys.length === 0 && (
                  <tr>
                    <td colSpan={6}>
                      <EmptyState
                        icon={KeyRound}
                        title={keys.length === 0 ? "No API keys found" : "No API keys match your filters"}
                        description={keys.length === 0 ? "Create your first API key to start using the gateway." : "Try adjusting your search or filter criteria."}
                        action={keys.length === 0 ? { label: "Create key", onClick: () => setShowForm(true) } : undefined}
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
            totalItems={filteredKeys.length}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </div>
      </div>
      {confirmDialog}
    </div>
  );
}
