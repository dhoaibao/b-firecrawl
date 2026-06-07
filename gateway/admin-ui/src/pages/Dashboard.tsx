import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Activity,
  AlertCircle,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
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
  SlidersHorizontal,
  Trash2,
  User,
  X,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { MetricCard } from "@/components/MetricCard"
import { RequestVolumeChart } from "@/components/RequestVolumeChart"
import { StatusCodeChart } from "@/components/StatusCodeChart"
import { TopEndpointsChart } from "@/components/TopEndpointsChart"
import { LatencyDistributionChart } from "@/components/LatencyDistributionChart"
import { LogTableRow } from "@/components/LogTableRow"
import { useAuth } from "@/contexts/AuthContext"

export interface AuditEntry {
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
  user_id?: string
}

interface UserData {
  id: string
  email: string
  name: string
  is_admin: boolean
  created_at: string
  updated_at: string
}

type BackendFilter = "" | "local" | "cloud"
type StatusFilter = "" | "2xx" | "4xx" | "5xx"

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

type DateRange = "all" | "today" | "week" | "month" | "custom"

const datePresets: Array<{ label: string; value: DateRange }> = [
  { label: "All", value: "all" },
  { label: "Today", value: "today" },
  { label: "This Week", value: "week" },
  { label: "This Month", value: "month" },
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
  const [users, setUsers] = useState<UserData[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [live, setLive] = useState(true)
  const [backendFilter, setBackendFilter] = useState<BackendFilter>("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("")
  const [fallbackOnly, setFallbackOnly] = useState(false)
  const [search, setSearch] = useState("")
  const [dateRange, setDateRange] = useState<
    "all" | "today" | "week" | "month" | "custom"
  >("all")
  const [dayFilter, setDayFilter] = useState("all")
  const [monthFilter, setMonthFilter] = useState("all")
  const [yearFilter, setYearFilter] = useState("all")
  const [userFilter, setUserFilter] = useState("all")
  const [pageSize, setPageSize] = useState(25)
  const [currentPage, setCurrentPage] = useState(1)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleteFilter, setDeleteFilter] = useState<
    "today" | "week" | "month" | "all"
  >("today")
  const [deleting, setDeleting] = useState(false)

  const activeFilters = useMemo(() => {
    const filters: Array<{
      key: string
      label: string
      clear: () => void
    }> = []
    if (dateRange !== "all") {
      const preset = datePresets.find((p) => p.value === dateRange)
      filters.push({
        key: "dateRange",
        label: preset?.label || "Custom",
        clear: () => setDateRange("all"),
      })
    }
    if (dayFilter !== "all" && dateRange === "custom") {
      filters.push({
        key: "day",
        label: `Day: ${dayFilter}`,
        clear: () => setDayFilter("all"),
      })
    }
    if (monthFilter !== "all" && dateRange === "custom") {
      filters.push({
        key: "month",
        label: `Month: ${monthFilter}`,
        clear: () => setMonthFilter("all"),
      })
    }
    if (yearFilter !== "all" && dateRange === "custom") {
      filters.push({
        key: "year",
        label: `Year: ${yearFilter}`,
        clear: () => setYearFilter("all"),
      })
    }
    if (backendFilter) {
      filters.push({
        key: "backend",
        label: `Backend: ${backendFilter.charAt(0).toUpperCase() + backendFilter.slice(1)}`,
        clear: () => setBackendFilter(""),
      })
    }
    if (fallbackOnly) {
      filters.push({
        key: "fallback",
        label: "Fallback",
        clear: () => setFallbackOnly(false),
      })
    }
    if (statusFilter) {
      const label =
        statusFilters.find((f) => f.value === statusFilter)?.label || statusFilter
      filters.push({
        key: "status",
        label: `Status: ${label}`,
        clear: () => setStatusFilter(""),
      })
    }
    if (userFilter !== "all") {
      const u = users.find((usr) => usr.id === userFilter)
      filters.push({
        key: "user",
        label: `User: ${u?.name || u?.email || userFilter.slice(0, 8)}`,
        clear: () => setUserFilter("all"),
      })
    }
    if (search.trim()) {
      filters.push({
        key: "search",
        label: `Search: "${search.trim()}"`,
        clear: () => setSearch(""),
      })
    }
    return filters
  }, [
    dateRange,
    dayFilter,
    monthFilter,
    yearFilter,
    backendFilter,
    fallbackOnly,
    statusFilter,
    userFilter,
    search,
    users,
  ])

  const clearAllFilters = useCallback(() => {
    setDateRange("all")
    setDayFilter("all")
    setMonthFilter("all")
    setYearFilter("all")
    setBackendFilter("")
    setFallbackOnly(false)
    setStatusFilter("")
    setUserFilter("all")
    setSearch("")
    setCurrentPage(1)
  }, [])

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
      setUsers(Array.isArray(json.users) ? json.users : [])
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load audit data"
      addToast(msg, "error")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [addToast])

  const handleDeleteHistory = useCallback(async () => {
    setDeleting(true)
    try {
      const res = await fetch(
        `/admin/api/logs?filter=${deleteFilter}`,
        { method: "DELETE", credentials: "include" },
      )
      if (!res.ok) {
        const json = await res.json().catch(() => ({ error: "Delete failed" }))
        throw new Error(json.error || "Delete failed")
      }
      const json = await res.json()
      addToast(
        json.deleted === -1
          ? "All history deleted"
          : `${json.deleted} entries deleted`,
        "success",
      )
      setShowDeleteDialog(false)
      void fetchData()
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to delete history"
      addToast(msg, "error")
    } finally {
      setDeleting(false)
    }
  }, [deleteFilter, addToast, fetchData])

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
      // Date range filter
      const entryDate = new Date(entry.created_at)
      const now = new Date()
      if (dateRange === "today") {
        const entryDay = entryDate.getDate()
        const entryMonth = entryDate.getMonth()
        const entryYear = entryDate.getFullYear()
        if (
          entryDay !== now.getDate() ||
          entryMonth !== now.getMonth() ||
          entryYear !== now.getFullYear()
        ) {
          return false
        }
      } else if (dateRange === "week") {
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        weekAgo.setHours(0, 0, 0, 0)
        if (entryDate < weekAgo) return false
      } else if (dateRange === "month") {
        if (
          entryDate.getMonth() !== now.getMonth() ||
          entryDate.getFullYear() !== now.getFullYear()
        ) {
          return false
        }
      } else if (dateRange === "custom") {
        if (dayFilter !== "all") {
          const day = String(entryDate.getDate()).padStart(2, "0")
          if (day !== dayFilter) return false
        }
        if (monthFilter !== "all") {
          const month = String(entryDate.getMonth() + 1).padStart(2, "0")
          if (month !== monthFilter) return false
        }
        if (yearFilter !== "all") {
          const year = String(entryDate.getFullYear())
          if (year !== yearFilter) return false
        }
      }
      // User filter
      if (userFilter !== "all" && entry.user_id !== userFilter) return false
      return true
    })
  }, [backendFilter, entries, fallbackOnly, search, statusFilter, dateRange, dayFilter, monthFilter, yearFilter, userFilter])

  // Filtered metrics
  const filteredTotal = filteredEntries.length
  const filteredLocal = filteredEntries.filter(
    (entry) => entry.backend_used === "local",
  ).length
  const filteredCloud = filteredEntries.filter(
    (entry) => entry.backend_used === "cloud",
  ).length
  const filteredFallbacks = filteredEntries.filter(
    (entry) => entry.fallback_used,
  ).length
  const filteredDurations = filteredEntries
    .map((entry) => Number(entry.duration_ms))
    .filter((value) => Number.isFinite(value))
  const filteredAvgDuration = filteredDurations.length
    ? Math.round(
        filteredDurations.reduce((sum, value) => sum + value, 0) /
          filteredDurations.length,
      )
    : 0
  const filteredSuccessCount = filteredEntries.filter(
    (entry) => entry.status_code >= 200 && entry.status_code < 300,
  ).length
  const filteredSuccessShare = filteredTotal
    ? (filteredSuccessCount / filteredTotal) * 100
    : 0
  const filteredCloudShare = filteredTotal
    ? (filteredCloud / filteredTotal) * 100
    : 0
  const filteredFallbackShare = filteredTotal
    ? (filteredFallbacks / filteredTotal) * 100
    : 0

  const pageCount = Math.max(1, Math.ceil(filteredEntries.length / pageSize))
  const visiblePage = Math.min(currentPage, pageCount)
  const pageStart = filteredEntries.length
    ? (visiblePage - 1) * pageSize
    : 0
  const pageEnd = Math.min(pageStart + pageSize, filteredEntries.length)
  const paginatedEntries = filteredEntries.slice(pageStart, pageEnd)
  const requestBuckets = useMemo(
    () => buildRequestBuckets(filteredEntries),
    [filteredEntries],
  )

  const metrics = useMemo(
    () => [
      {
        label: "Total Requests",
        value: filteredTotal,
        detail: `${filteredTotal} visible`,
        icon: Activity,
      },
      {
        label: "Success Rate",
        value: formatPercent(filteredSuccessShare),
        detail: `${filteredSuccessCount} successful`,
        icon: Radio,
      },
      {
        label: "Local Requests",
        value: filteredLocal,
        detail: "self-hosted traffic",
        icon: Server,
      },
      {
        label: "Cloud Traffic",
        value: filteredCloud,
        detail: `${formatPercent(filteredCloudShare)} of traffic`,
        icon: Cloud,
      },
      {
        label: "Avg Latency",
        value: formatLatency(filteredAvgDuration),
        detail: `${filteredFallbacks} fallbacks`,
        icon: Clock,
      },
    ],
    [
      filteredTotal,
      filteredLocal,
      filteredCloud,
      filteredFallbacks,
      filteredAvgDuration,
      filteredSuccessShare,
      filteredSuccessCount,
      filteredCloudShare,
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

      {/* Charts grid */}
      <section className="mx-auto flex max-w-[1680px] flex-col gap-4 px-4 py-4 lg:px-6">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Request Volume */}
          <Card className="gap-0 overflow-hidden rounded-lg border-white/[0.06] bg-surface-2 py-0 shadow-none">
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
          </Card>

          {/* Status Code Distribution */}
          <Card className="gap-0 overflow-hidden rounded-lg border-white/[0.06] bg-surface-2 py-0 shadow-none">
            <CardHeader className="border-b border-white/[0.06] bg-surface-3 px-5 py-4">
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-2">
                  <Activity className="size-4 text-muted-foreground" />
                  <CardTitle className="text-sm font-semibold text-foreground">
                    Status Code Distribution
                  </CardTitle>
                </div>
                <StatusCodeChart entries={filteredEntries} />
              </div>
            </CardHeader>
          </Card>

          {/* Top Endpoints */}
          <Card className="gap-0 overflow-hidden rounded-lg border-white/[0.06] bg-surface-2 py-0 shadow-none">
            <CardHeader className="border-b border-white/[0.06] bg-surface-3 px-5 py-4">
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-2">
                  <Server className="size-4 text-muted-foreground" />
                  <CardTitle className="text-sm font-semibold text-foreground">
                    Top Endpoints
                  </CardTitle>
                </div>
                <TopEndpointsChart entries={filteredEntries} />
              </div>
            </CardHeader>
          </Card>

          {/* Latency Distribution */}
          <Card className="gap-0 overflow-hidden rounded-lg border-white/[0.06] bg-surface-2 py-0 shadow-none">
            <CardHeader className="border-b border-white/[0.06] bg-surface-3 px-5 py-4">
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-2">
                  <Clock className="size-4 text-muted-foreground" />
                  <CardTitle className="text-sm font-semibold text-foreground">
                    Latency Distribution
                  </CardTitle>
                </div>
                <LatencyDistributionChart entries={filteredEntries} />
              </div>
            </CardHeader>
          </Card>
        </div>

        {/* Request History table */}
        <Card className="gap-0 overflow-hidden rounded-lg border-white/[0.06] bg-surface-2 py-0 shadow-none">

          {/* Table header */}
          <CardHeader className="border-b border-white/[0.06] bg-surface-4 px-5 py-4">
            {/* Title + summary badges */}
            <div className="flex flex-wrap items-center justify-between gap-3">
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
                  Success {formatPercent(filteredSuccessShare)}
                </Badge>
                <Badge
                  variant="outline"
                  className="border-info-muted bg-info-muted text-info-fg"
                >
                  Cloud {formatPercent(filteredCloudShare)}
                </Badge>
                <Badge
                  variant="outline"
                  className="border-warning-muted bg-warning-muted text-warning-fg"
                >
                  Fallback {formatPercent(filteredFallbackShare)}
                </Badge>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-6 border-danger-muted/50 bg-danger-muted/20 text-danger-fg shadow-none transition-colors hover:bg-danger-muted/40"
                onClick={() => {
                  setDeleteFilter("today")
                  setShowDeleteDialog(true)
                }}
              >
                <Trash2 className="size-3" />
                Delete History
              </Button>
            </div>

            {/* Active filter chips */}
            {activeFilters.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-3">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Active
                </span>
                {activeFilters.map((filter) => (
                  <Badge
                    key={filter.key}
                    variant="secondary"
                    className="cursor-pointer gap-1 border-white/[0.06] bg-white/[0.06] text-foreground transition-colors hover:bg-white/[0.12]"
                    onClick={filter.clear}
                  >
                    {filter.label}
                    <X className="size-3" />
                  </Badge>
                ))}
                <button
                  type="button"
                  className="ml-auto text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                  onClick={clearAllFilters}
                >
                  Clear all
                </button>
              </div>
            )}

            {/* Filter grid */}
            <div className="grid grid-cols-1 gap-5 border-t border-white/[0.06] pt-3 md:grid-cols-2 lg:grid-cols-4">
              {/* Period */}
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  <CalendarDays className="size-3" /> Period
                </label>
                <div className="flex flex-wrap gap-1">
                  {datePresets.map((preset) => (
                    <Button
                      key={preset.value}
                      variant={dateRange === preset.value ? "default" : "outline"}
                      size="sm"
                      className={cn(
                        "h-6 border-white/[0.08] px-2.5 text-[11px] shadow-none transition-colors",
                        dateRange === preset.value
                          ? "bg-foreground text-background hover:bg-foreground/90"
                          : "bg-surface-1 text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
                      )}
                      onClick={() => {
                        setDateRange(preset.value)
                        setCurrentPage(1)
                      }}
                    >
                      {preset.label}
                    </Button>
                  ))}
                  <Button
                    variant={dateRange === "custom" ? "default" : "outline"}
                    size="sm"
                    className={cn(
                      "h-6 border-white/[0.08] px-2.5 text-[11px] shadow-none transition-colors",
                      dateRange === "custom"
                        ? "bg-foreground text-background hover:bg-foreground/90"
                        : "bg-surface-1 text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
                    )}
                    onClick={() => {
                      setDateRange((prev) => (prev === "custom" ? "all" : "custom"))
                      setCurrentPage(1)
                    }}
                  >
                    <SlidersHorizontal className="size-2.5" />
                    Custom
                  </Button>
                </div>
                {dateRange === "custom" && (
                  <div className="flex gap-1 pt-0.5">
                    <Select
                      value={dayFilter}
                      onValueChange={(value) => {
                        setDayFilter(value)
                        setCurrentPage(1)
                      }}
                    >
                      <SelectTrigger className="h-6 w-[4.5rem] text-[11px]">
                        <SelectValue placeholder="Day" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All days</SelectItem>
                        {Array.from({ length: 31 }, (_, i) => {
                          const d = String(i + 1).padStart(2, "0")
                          return (
                            <SelectItem key={d} value={d}>
                              {d}
                            </SelectItem>
                          )
                        })}
                      </SelectContent>
                    </Select>
                    <Select
                      value={monthFilter}
                      onValueChange={(value) => {
                        setMonthFilter(value)
                        setCurrentPage(1)
                      }}
                    >
                      <SelectTrigger className="h-6 w-[5.5rem] text-[11px]">
                        <SelectValue placeholder="Month" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All months</SelectItem>
                        {[
                          ["01", "Jan"],
                          ["02", "Feb"],
                          ["03", "Mar"],
                          ["04", "Apr"],
                          ["05", "May"],
                          ["06", "Jun"],
                          ["07", "Jul"],
                          ["08", "Aug"],
                          ["09", "Sep"],
                          ["10", "Oct"],
                          ["11", "Nov"],
                          ["12", "Dec"],
                        ].map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={yearFilter}
                      onValueChange={(value) => {
                        setYearFilter(value)
                        setCurrentPage(1)
                      }}
                    >
                      <SelectTrigger className="h-6 w-[4.5rem] text-[11px]">
                        <SelectValue placeholder="Year" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All years</SelectItem>
                        {Array.from({ length: 5 }, (_, i) => {
                          const y = String(new Date().getFullYear() - i)
                          return (
                            <SelectItem key={y} value={y}>
                              {y}
                            </SelectItem>
                          )
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {/* Backend */}
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  <Server className="size-3" /> Backend
                </label>
                <div className="flex flex-wrap gap-1">
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
                        "h-6 border-white/[0.08] px-2.5 text-[11px] shadow-none transition-colors",
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
                      "h-6 border-white/[0.08] px-2.5 text-[11px] shadow-none transition-colors",
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
                    Fallback
                  </Button>
                </div>
              </div>

              {/* Status */}
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  <Activity className="size-3" /> Status
                </label>
                <div className="flex flex-wrap gap-1">
                  {statusFilters.map((filter) => (
                    <Button
                      key={filter.label}
                      variant={
                        statusFilter === filter.value ? "default" : "outline"
                      }
                      size="sm"
                      className={cn(
                        "h-6 border-white/[0.08] px-2.5 text-[11px] shadow-none transition-colors",
                        statusFilter === filter.value
                          ? "bg-foreground text-background hover:bg-foreground/90"
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

              {/* User */}
              {users.length > 0 && (
                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    <User className="size-3" /> User
                  </label>
                  <Select
                    value={userFilter}
                    onValueChange={(value) => {
                      setUserFilter(value)
                      setCurrentPage(1)
                    }}
                  >
                    <SelectTrigger className="h-6 w-full text-[11px]">
                      <SelectValue placeholder="All users" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All users</SelectItem>
                      {users.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name || u.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
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
                      <TableHead className="text-xs font-semibold text-foreground">
                        User
                      </TableHead>
                      <TableHead className="pr-5 text-xs font-semibold text-foreground">
                        Target URL
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedEntries.map((entry) => (
                      <LogTableRow key={entry.id} entry={entry} users={users} />
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

      {/* Delete History Dialog */}
      {showDeleteDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowDeleteDialog(false)
          }}
        >
          <div className="w-full max-w-sm rounded-lg border border-white/[0.06] bg-surface-2 p-6 shadow-xl animate-slide-up">
            <div className="mb-4 flex items-center gap-3">
              <div className="rounded-full bg-danger-muted/50 p-2">
                <Trash2 className="size-5 text-danger-fg" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-foreground">
                  Delete History
                </h3>
                <p className="text-xs text-muted-foreground">
                  Choose a time range to delete
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              {[
                { value: "today" as const, label: "Today" },
                { value: "week" as const, label: "This Week" },
                { value: "month" as const, label: "This Month" },
                { value: "all" as const, label: "All History" },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setDeleteFilter(option.value)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors",
                    deleteFilter === option.value
                      ? "bg-white/[0.08] text-foreground"
                      : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "size-4 rounded-full border-2",
                      deleteFilter === option.value
                        ? "border-foreground bg-foreground"
                        : "border-white/20",
                    )}
                  >
                    {deleteFilter === option.value && (
                      <span className="block size-full rounded-full border-2 border-surface-2 bg-foreground" />
                    )}
                  </span>
                  {option.label}
                </button>
              ))}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                className="border-white/[0.08] bg-surface-3 text-foreground shadow-none hover:bg-surface-4"
                onClick={() => setShowDeleteDialog(false)}
                disabled={deleting}
              >
                Cancel
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="border-danger-muted bg-danger-muted text-danger-fg shadow-none hover:bg-danger-muted/80"
                onClick={() => void handleDeleteHistory()}
                disabled={deleting}
              >
                {deleting ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}

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
