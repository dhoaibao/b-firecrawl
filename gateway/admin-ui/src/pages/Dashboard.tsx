import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Activity,
  AlertCircle,
  ArrowUpRight,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Clock,
  Cloud,
  Database,
  Key,
  LogOut,
  Radio,
  RefreshCw,
  Search,
  Server,
  User,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { MetricCard } from "@/components/MetricCard"
import { RequestVolumeChart } from "@/components/RequestVolumeChart"
import { LogTableRow } from "@/components/LogTableRow"
import { useAuth } from "@/contexts/AuthContext"

interface AuditEntry {
  id: string
  created_at: string
  method: string
  path: string
  route_mode: string
  backend_used: string
  fallback_used: boolean
  fallback_reason: string
  status_code: number
  duration_ms: number
  target_url: string
}

interface Totals {
  total: number
  local: number
  cloud: number
  fallbacks: number
  avgDuration: number
}

type BackendFilter = "" | "local" | "cloud"
type StatusFilter = "" | "2xx" | "4xx" | "5xx"

const emptyTotals: Totals = {
  total: 0,
  local: 0,
  cloud: 0,
  fallbacks: 0,
  avgDuration: 0,
}

const backendFilters: Array<{ label: string; value: BackendFilter }> = [
  { label: "All", value: "" },
  { label: "Local", value: "local" },
  { label: "Cloud", value: "cloud" },
]

const statusFilters: Array<{ label: string; value: StatusFilter }> = [
  { label: "All status", value: "" },
  { label: "2xx", value: "2xx" },
  { label: "4xx", value: "4xx" },
  { label: "5xx", value: "5xx" },
]

const pageSizeOptions = [10, 25, 50, 100]
const bucketCount = 24

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return "0%"
  return `${Math.round(value)}%`
}

function formatLatency(value: number): string {
  if (!Number.isFinite(value)) return "0ms"
  if (value >= 1000) return `${(value / 1000).toFixed(2)}s`
  return `${Math.round(value)}ms`
}

function buildRequestBuckets(entries: AuditEntry[]) {
  const buckets = Array.from({ length: bucketCount }, (_, index) => ({
    index,
    success: 0,
    error: 0,
  }))

  entries.slice(0, 180).forEach((entry, entryIndex) => {
    const bucketIndex =
      bucketCount - 1 - Math.min(bucketCount - 1, Math.floor(entryIndex / 4))
    if (entry.status_code >= 200 && entry.status_code < 400) {
      buckets[bucketIndex].success += 1
    } else {
      buckets[bucketIndex].error += 1
    }
  })

  return buckets
}

/* ------------------------------------------------------------------ */
/*  Simple toast system                                                */
/* ------------------------------------------------------------------ */
interface Toast {
  id: number
  message: string
  type: "error" | "success"
}

function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((message: string, type: Toast["type"] = "error") => {
    const id = Date.now() + Math.random()
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 4000)
  }, [])

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return { toasts, addToast, removeToast }
}

/* ------------------------------------------------------------------ */
/*  Skeleton loaders                                                   */
/* ------------------------------------------------------------------ */
function MetricsSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="flex flex-col gap-3 rounded-lg border border-white/[0.06] bg-surface-2 p-5"
        >
          <div className="flex items-center justify-between">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-6 w-6 rounded-md" />
          </div>
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-2.5 w-32" />
        </div>
      ))}
    </div>
  )
}

function TableSkeleton({ rowCount = 8 }: { rowCount?: number }) {
  return (
    <>
      <div className="min-w-[1220px]">
        {/* Header skeleton */}
        <div className="flex h-10 items-center gap-4 border-b border-white/[0.06] bg-surface-3 px-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-3 flex-1" style={{ minWidth: i === 0 ? 140 : 80 }} />
          ))}
        </div>
        {/* Row skeletons */}
        {Array.from({ length: rowCount }).map((_, rowIdx) => (
          <div
            key={rowIdx}
            className="flex h-12 items-center gap-4 border-b border-white/[0.04] bg-surface-1 px-5"
          >
            {Array.from({ length: 10 }).map((__, colIdx) => (
              <Skeleton
                key={colIdx}
                className="h-3 flex-1"
                style={{ minWidth: colIdx === 0 ? 140 : 80 }}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between border-t border-white/[0.06] bg-surface-1 px-5 py-3">
        <Skeleton className="h-3 w-40" />
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-8 w-28" />
        </div>
      </div>
    </>
  )
}

/* ------------------------------------------------------------------ */
/*  Dashboard                                                          */
/* ------------------------------------------------------------------ */
export default function Dashboard() {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [totals, setTotals] = useState<Totals>(emptyTotals)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [live, setLive] = useState(true)
  const [backendFilter, setBackendFilter] = useState<BackendFilter>("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("")
  const [fallbackOnly, setFallbackOnly] = useState(false)
  const [search, setSearch] = useState("")
  const [pageSize, setPageSize] = useState(25)
  const [currentPage, setCurrentPage] = useState(1)

  const { toasts, addToast, removeToast } = useToast()
  const { user, logout } = useAuth()

  const fetchData = useCallback(async () => {
    setRefreshing(true)
    try {
      const res = await fetch("/admin/api/data", { credentials: "include" })
      if (!res.ok) {
        throw new Error(`Request failed with ${res.status}`)
      }
      const json = await res.json()
      setEntries(Array.isArray(json.data) ? json.data : [])
      setTotals(json.totals || emptyTotals)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load audit data"
      addToast(msg, "error")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [addToast])

  useEffect(() => {
    const initialLoad = window.setTimeout(() => {
      void fetchData()
    }, 0)

    let interval: number | undefined
    if (live) {
      interval = window.setInterval(() => {
        void fetchData()
      }, 5000)
    }

    return () => {
      window.clearTimeout(initialLoad)
      if (interval) window.clearInterval(interval)
    }
  }, [fetchData, live])

  const filteredEntries = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()

    return entries.filter((entry) => {
      if (
        normalizedSearch &&
        ![
          entry.path,
          entry.target_url,
          entry.method,
          entry.backend_used,
          entry.route_mode,
          entry.fallback_reason,
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedSearch)
      ) {
        return false
      }
      if (backendFilter && entry.backend_used !== backendFilter) return false
      if (fallbackOnly && !entry.fallback_used) return false
      if (
        statusFilter === "2xx" &&
        !(entry.status_code >= 200 && entry.status_code < 300)
      ) {
        return false
      }
      if (
        statusFilter === "4xx" &&
        !(entry.status_code >= 400 && entry.status_code < 500)
      ) {
        return false
      }
      if (
        statusFilter === "5xx" &&
        !(entry.status_code >= 500 && entry.status_code < 600)
      ) {
        return false
      }
      return true
    })
  }, [backendFilter, entries, fallbackOnly, search, statusFilter])

  const cloudShare = totals.total ? (totals.cloud / totals.total) * 100 : 0
  const fallbackShare = totals.total
    ? (totals.fallbacks / totals.total) * 100
    : 0
  const successCount = entries.filter(
    (entry) => entry.status_code >= 200 && entry.status_code < 300,
  ).length
  const successShare = entries.length
    ? (successCount / entries.length) * 100
    : 0
  const pageCount = Math.max(1, Math.ceil(filteredEntries.length / pageSize))
  const visiblePage = Math.min(currentPage, pageCount)
  const pageStart = filteredEntries.length
    ? (visiblePage - 1) * pageSize
    : 0
  const pageEnd = Math.min(pageStart + pageSize, filteredEntries.length)
  const paginatedEntries = filteredEntries.slice(pageStart, pageEnd)
  const requestBuckets = useMemo(() => buildRequestBuckets(entries), [entries])

  const metrics = useMemo(
    () => [
      {
        label: "Total Requests",
        value: totals.total,
        detail: `${filteredEntries.length} visible`,
        icon: Activity,
      },
      {
        label: "Success Rate",
        value: formatPercent(successShare),
        detail: `${successCount} successful`,
        icon: Radio,
      },
      {
        label: "Local Requests",
        value: totals.local,
        detail: "self-hosted traffic",
        icon: Server,
      },
      {
        label: "Cloud Traffic",
        value: totals.cloud,
        detail: `${formatPercent(cloudShare)} of traffic`,
        icon: Cloud,
      },
      {
        label: "Avg Latency",
        value: formatLatency(totals.avgDuration),
        detail: `${totals.fallbacks} fallbacks`,
        icon: Clock,
      },
    ],
    [
      totals.total,
      totals.local,
      totals.cloud,
      totals.fallbacks,
      totals.avgDuration,
      filteredEntries.length,
      successShare,
      successCount,
      cloudShare,
    ],
  )

  return (
    <main className="min-h-screen bg-background text-foreground">
      {/* Sticky header */}
      <section className="sticky top-0 z-20 border-b border-white/[0.06] bg-surface-2/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1680px] flex-col gap-4 px-4 py-4 lg:px-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
            {/* Left: Refresh + Live */}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                className={cn(
                  "group relative overflow-hidden border-white/[0.08] bg-surface-3 text-foreground shadow-none transition-all hover:-translate-y-px hover:border-white/15 hover:bg-surface-4",
                  refreshing && "border-info-muted bg-info-muted text-info-fg",
                )}
                onClick={() => void fetchData()}
                disabled={refreshing}
              >
                <span
                  className={cn(
                    "absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 transition-all duration-700 group-hover:translate-x-full group-hover:opacity-100",
                    refreshing && "translate-x-full opacity-100",
                  )}
                />
                <RefreshCw
                  className={cn(
                    "relative size-4 transition-transform duration-300 group-hover:rotate-45",
                    refreshing && "animate-spin",
                  )}
                />
                <span className="relative">Refresh</span>
              </Button>

              <Button
                variant={live ? "default" : "outline"}
                className={cn(
                  "gap-2 border-white/[0.08] shadow-none transition-all",
                  live
                    ? "bg-success-muted text-success-fg hover:bg-success-muted/80"
                    : "bg-surface-3 text-muted-foreground hover:bg-surface-4 hover:text-foreground",
                )}
                onClick={() => setLive((v) => !v)}
              >
                <span
                  className={cn(
                    "relative flex size-2",
                    live && "animate-pulse-soft",
                  )}
                >
                  <span
                    className={cn(
                      "absolute inline-flex size-full rounded-full opacity-75",
                      live ? "bg-success" : "bg-muted-foreground",
                    )}
                  />
                  <span
                    className={cn(
                      "relative inline-flex size-2 rounded-full",
                      live ? "bg-success" : "bg-muted-foreground",
                    )}
                  />
                </span>
                {live ? "Live" : "Paused"}
              </Button>
            </div>

            {/* Center: Search */}
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value)
                  setCurrentPage(1)
                }}
                placeholder="Search logs"
                className="h-10 w-full rounded-lg border border-white/[0.08] bg-surface-2 pl-10 pr-3 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground hover:border-white/12 focus:border-ring focus:ring-2 focus:ring-ring/30"
              />
            </div>

            {/* Right: Actions */}
            <div className="flex flex-wrap items-center gap-2">
              {user?.is_admin && (
                <>
                  <Button
                    asChild
                    variant="outline"
                    className="border-white/[0.08] bg-surface-3 text-foreground shadow-none transition-colors hover:bg-surface-4"
                  >
                    <a href="/admin/users">
                      <User className="size-4 mr-1" /> Users
                    </a>
                  </Button>
                </>
              )}
              <Button
                asChild
                variant="outline"
                className="border-white/[0.08] bg-surface-3 text-foreground shadow-none transition-colors hover:bg-surface-4"
              >
                <a href="/admin/api-keys">
                  <Key className="size-4 mr-1" /> Keys
                </a>
              </Button>
              <Button
                asChild
                variant="outline"
                className="border-white/[0.08] bg-surface-3 text-foreground shadow-none transition-colors hover:bg-surface-4"
              >
                <a href="/admin/logs" target="_blank" rel="noreferrer">
                  JSON logs
                  <ArrowUpRight className="size-4" />
                </a>
              </Button>
              <Button
                variant="outline"
                className="border-white/[0.08] bg-surface-3 text-foreground shadow-none transition-colors hover:bg-surface-4"
                onClick={() => logout()}
              >
                <LogOut className="size-4 mr-1" /> Logout
              </Button>
            </div>
          </div>

          {loading ? (
            <MetricsSkeleton />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5 animate-slide-up">
              {metrics.map((metric) => (
                <MetricCard
                  key={metric.label}
                  label={metric.label}
                  value={metric.value}
                  detail={metric.detail}
                  icon={metric.icon}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Main content */}
      <section className="mx-auto flex max-w-[1680px] flex-col gap-4 px-4 py-4 lg:px-6">
        <Card className="gap-0 overflow-hidden rounded-lg border-white/[0.06] bg-surface-2 py-0 shadow-none">
          {/* Chart header */}
          <CardHeader className="border-b border-white/[0.06] bg-surface-3 px-5 py-4">
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <BarChart3 className="size-4 text-muted-foreground" />
                  <CardTitle className="text-sm font-semibold text-foreground">
                    Gateway Request Volume
                  </CardTitle>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <span className="size-2 rounded-full bg-success" />
                    Success
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <span className="size-2 rounded-full bg-danger" />
                    Error
                  </span>
                </div>
              </div>
              <RequestVolumeChart buckets={requestBuckets} />
            </div>
          </CardHeader>

          {/* Table header */}
          <CardHeader className="border-b border-white/[0.06] bg-surface-4 px-5 py-4">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <Database className="size-4 text-muted-foreground" />
                <CardTitle className="text-sm font-semibold text-foreground">
                  Request History
                </CardTitle>
                <Badge
                  variant="outline"
                  className="border-white/[0.06] bg-white/[0.02] text-muted-foreground"
                >
                  {filteredEntries.length} visible
                </Badge>
                <Badge
                  variant="outline"
                  className="border-success-muted bg-success-muted text-success-fg"
                >
                  Success {formatPercent(successShare)}
                </Badge>
                <Badge
                  variant="outline"
                  className="border-info-muted bg-info-muted text-info-fg"
                >
                  Cloud {formatPercent(cloudShare)}
                </Badge>
                <Badge
                  variant="outline"
                  className="border-warning-muted bg-warning-muted text-warning-fg"
                >
                  Fallback {formatPercent(fallbackShare)}
                </Badge>
              </div>

              <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center md:justify-end">
                <div className="flex flex-wrap gap-1.5">
                  {backendFilters.map((filter) => (
                    <Button
                      key={filter.label}
                      variant={
                        backendFilter === filter.value && !fallbackOnly
                          ? "default"
                          : "outline"
                      }
                      size="sm"
                      className={cn(
                        "border-white/[0.08] shadow-none transition-colors",
                        backendFilter === filter.value && !fallbackOnly
                          ? "bg-foreground text-background hover:bg-foreground/90"
                          : "bg-surface-1 text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
                      )}
                      onClick={() => {
                        setBackendFilter(filter.value)
                        setFallbackOnly(false)
                        setCurrentPage(1)
                      }}
                    >
                      {filter.label}
                    </Button>
                  ))}
                  <Button
                    variant={fallbackOnly ? "default" : "outline"}
                    size="sm"
                    className={cn(
                      "border-white/[0.08] shadow-none transition-colors",
                      fallbackOnly
                        ? "bg-foreground text-background hover:bg-foreground/90"
                        : "bg-surface-1 text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
                    )}
                    onClick={() => {
                      setFallbackOnly((value) => !value)
                      setBackendFilter("")
                      setCurrentPage(1)
                    }}
                  >
                    Fallback only
                  </Button>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {statusFilters.map((filter) => (
                    <Button
                      key={filter.label}
                      variant={
                        statusFilter === filter.value ? "secondary" : "outline"
                      }
                      size="sm"
                      className={cn(
                        "border-white/[0.08] shadow-none transition-colors",
                        statusFilter === filter.value
                          ? "bg-white/[0.08] text-foreground"
                          : "bg-surface-1 text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
                      )}
                      onClick={() => {
                        setStatusFilter(filter.value)
                        setCurrentPage(1)
                      }}
                    >
                      {filter.label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </CardHeader>

          {loading ? (
            <TableSkeleton rowCount={8} />
          ) : filteredEntries.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <Table className="min-w-[1220px]">
                  <TableHeader>
                    <TableRow className="border-b border-white/[0.06] bg-surface-3 hover:bg-surface-3">
                      <TableHead className="pl-5 text-xs font-semibold text-foreground">
                        Time
                      </TableHead>
                      <TableHead className="text-xs font-semibold text-foreground">
                        Method
                      </TableHead>
                      <TableHead className="text-xs font-semibold text-foreground">
                        Path
                      </TableHead>
                      <TableHead className="text-xs font-semibold text-foreground">
                        Mode
                      </TableHead>
                      <TableHead className="text-xs font-semibold text-foreground">
                        Backend
                      </TableHead>
                      <TableHead className="text-xs font-semibold text-foreground">
                        Fallback
                      </TableHead>
                      <TableHead className="text-xs font-semibold text-foreground">
                        Reason
                      </TableHead>
                      <TableHead className="text-xs font-semibold text-foreground">
                        Status
                      </TableHead>
                      <TableHead className="text-right text-xs font-semibold text-foreground">
                        Latency
                      </TableHead>
                      <TableHead className="pr-5 text-xs font-semibold text-foreground">
                        Target URL
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedEntries.map((entry) => (
                      <LogTableRow key={entry.id} entry={entry} />
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex flex-col gap-3 border-t border-white/[0.06] bg-surface-1 px-5 py-3 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
                <div className="font-mono text-xs">
                  Showing{" "}
                  <span className="font-medium text-foreground">
                    {filteredEntries.length ? pageStart + 1 : 0}-{pageEnd}
                  </span>{" "}
                  of{" "}
                  <span className="font-medium text-foreground">
                    {filteredEntries.length}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2">
                    <span>Rows</span>
                    <select
                      value={pageSize}
                      onChange={(event) => {
                        setPageSize(Number(event.target.value))
                        setCurrentPage(1)
                      }}
                      className="h-8 rounded-md border border-white/[0.08] bg-surface-3 px-2 text-sm font-medium text-foreground shadow-none outline-none transition-colors hover:bg-surface-4 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30"
                    >
                      {pageSizeOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="flex items-center gap-2">
                    <span className="min-w-20 text-center font-mono text-xs">
                      Page{" "}
                      <span className="font-medium text-foreground">
                        {visiblePage}
                      </span>{" "}
                      / {pageCount}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={visiblePage <= 1}
                      className="border-white/[0.08] bg-surface-3 text-foreground shadow-none transition-colors hover:bg-surface-4"
                      onClick={() =>
                        setCurrentPage(Math.max(1, visiblePage - 1))
                      }
                    >
                      <ChevronLeft className="size-4" />
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={visiblePage >= pageCount}
                      className="border-white/[0.08] bg-surface-3 text-foreground shadow-none transition-colors hover:bg-surface-4"
                      onClick={() =>
                        setCurrentPage(Math.min(pageCount, visiblePage + 1))
                      }
                    >
                      Next
                      <ChevronRight className="size-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 px-6 text-center animate-fade-in">
              <div className="rounded-full border border-white/[0.06] bg-white/[0.02] p-4 text-muted-foreground">
                <Activity className="size-6" />
              </div>
              <div className="font-medium text-foreground">
                No matching requests
              </div>
              <p className="max-w-md text-sm text-muted-foreground">
                Adjust the filters or wait for new gateway traffic to appear.
              </p>
            </div>
          )}
        </Card>
      </section>

      {/* Toast stack */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              "flex items-center gap-3 rounded-lg border px-4 py-3 shadow-lg animate-slide-up backdrop-blur",
              toast.type === "error"
                ? "border-danger-muted bg-danger-muted/90 text-danger-fg"
                : "border-success-muted bg-success-muted/90 text-success-fg",
            )}
          >
            <AlertCircle className="size-4 shrink-0" />
            <span className="text-sm">{toast.message}</span>
            <button
              onClick={() => removeToast(toast.id)}
              className="ml-2 text-xs opacity-70 hover:opacity-100"
            >
              Dismiss
            </button>
          </div>
        ))}
      </div>
    </main>
  )
}
