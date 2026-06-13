import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Key, Copy, Check, RefreshCw, Search, KeyRound } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/useToast";
import Pagination from "@/components/Pagination";
import PageSkeleton from "@/components/PageSkeleton";
import EmptyState from "@/components/EmptyState";
import DataTable from "@/components/DataTable";
import PageLayout from "@/components/PageLayout";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/date";
import type { ApiKeyData } from "@/types";

export default function ApiKeys() {
  const [keys, setKeys] = useState<ApiKeyData[]>([]);
  const [loading, setLoading] = useState(true);
  const { addToast } = useToast();
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

  // Pagination state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => { document.title = "API Keys — Firecrawl Gateway" }, []);

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

  const totalPages = Math.max(1, Math.ceil(filteredKeys.length / pageSize));
  const paginatedKeys = filteredKeys.slice((page - 1) * pageSize, page * pageSize);

  const fetchKeys = useCallback(async () => {
    try {
      const json = await api.get<{ data: ApiKeyData[] }>("/admin/api/api-keys");
      setKeys(json.data || []);
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Error loading API keys", "error");
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    // Load API keys on mount: standard React pattern for loading authenticated data.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchKeys();
  }, [fetchKeys]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setCreating(true);
    try {
      const json = await api.post<{ data: ApiKeyData }>("/admin/api/api-keys", {
        name: newKeyName,
      });
      setCreatedKey(json.data);
      setNewKeyName("");
      setShowForm(false);
      await fetchKeys();
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to create API key", "error");
    } finally {
      setCreating(false);
    }
  }

  async function doRevoke(id: string) {
    try {
      await api.delete(`/admin/api/api-keys/${id}`);
      addToast("API key revoked", "success");
      await fetchKeys();
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to revoke API key", "error");
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
    <PageLayout
      title="API Keys"
      icon={Key}
      count={{ filtered: filteredKeys.length, total: keys.length }}
      actions={
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setRefreshing(true); void fetchKeys().then(() => setRefreshing(false)); }}
            disabled={refreshing}
          >
            <RefreshCw className={`size-4 mr-1 ${refreshing ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button size="sm" onClick={() => { setShowForm(true); setCreatedKey(null); }}>
            <Plus className="size-4 mr-1" /> New key
          </Button>
        </>
      }
    >
      {/* Search & Filter Bar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by name or prefix..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
            className="h-10 w-full rounded-lg border border-white/[0.08] bg-surface-3 pl-9 pr-3 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground hover:border-white/12 focus:border-ring focus:ring-2 focus:ring-ring/30"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as "all" | "active" | "revoked"); setPage(1); }}>
          <SelectTrigger className="h-10 bg-surface-3 text-sm px-3">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="revoked">Revoked</SelectItem>
          </SelectContent>
        </Select>
        {(searchQuery || statusFilter !== "all") && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setSearchQuery(""); setStatusFilter("all"); setPage(1); }}
          >
            Clear
          </Button>
        )}
      </div>

      {createdKey && (
        <div className="mb-6 rounded-lg border border-success-muted bg-success-muted/30 p-4 space-y-2">
          <p className="text-sm font-medium text-success-fg">API key created. Copy it now — you won&apos;t see it again.</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-lg bg-surface-2 px-3 py-2 text-sm font-mono text-foreground">
              {createdKey.key}
            </code>
            <Button variant="outline" size="sm" onClick={() => createdKey.key && copyKey(createdKey.key)}>
              {copied ? <Check className="size-4 mr-1" /> : <Copy className="size-4 mr-1" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <button onClick={() => setCreatedKey(null)} className="text-sm text-muted-foreground hover:text-foreground">
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
            <Button type="submit" size="sm" disabled={creating}>
              {creating ? "Creating..." : "Create key"}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      <div className="rounded-lg border border-white/[0.06] bg-surface-2 overflow-hidden">
        <DataTable
          columns={[
            { key: "name", header: "Name", render: (k) => k.name },
            { key: "prefix", header: "Prefix", className: "font-mono text-muted-foreground", render: (k) => `${k.key_prefix}...` },
            {
              key: "status",
              header: "Status",
              render: (k) =>
                k.revoked ? (
                  <span className="rounded-md bg-danger-muted px-2 py-0.5 text-xs text-danger-fg">Revoked</span>
                ) : (
                  <span className="rounded-md bg-success-muted px-2 py-0.5 text-xs text-success-fg">Active</span>
                ),
            },
            { key: "created", header: "Created", className: "text-muted-foreground", render: (k) => formatDate(k.created_at) },
            {
              key: "lastUsed",
              header: "Last Used",
              className: "text-muted-foreground",
              render: (k) =>
                k.last_used_at ? formatDate(k.last_used_at) : <span className="text-xs italic opacity-60">Never</span>,
            },
            {
              key: "actions",
              header: "Actions",
              align: "right",
              render: (k) =>
                !k.revoked && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 border-danger-muted bg-danger-muted/30 text-danger-fg hover:bg-danger-muted/50"
                    onClick={() => handleRevoke(k.id)}
                  >
                    <Trash2 className="size-3 mr-1" /> Revoke
                  </Button>
                ),
            },
          ]}
          data={paginatedKeys}
          keyExtractor={(k) => k.id}
          emptyState={
            <EmptyState
              icon={KeyRound}
              title={keys.length === 0 ? "No API keys found" : "No API keys match your filters"}
              description={keys.length === 0 ? "Create your first API key to start using the gateway." : "Try adjusting your search or filter criteria."}
              action={keys.length === 0 ? { label: "Create key", onClick: () => setShowForm(true) } : undefined}
            />
          }
        />
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          totalItems={filteredKeys.length}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </div>

      {confirmDialog}
    </PageLayout>
  );
}
