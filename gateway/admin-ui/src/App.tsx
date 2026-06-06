import { useCallback, useEffect, useMemo, useState } from "react"
import type { ComponentProps } from "react"
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
  MoreVertical,
  Radio,
  RefreshCw,
  Search,
  Server,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

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

type BadgeVariant = NonNullable<ComponentProps<typeof Badge>["variant"]>

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

function formatTime(value: string): string {
  if (!value) return "unknown"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

function statusVariant(status: number): BadgeVariant {
  if (!Number.isFinite(status)) return "outline"
  if (status < 300) return "success"
  if (status < 500) return "warning"
  return "destructive"
}

function backendVariant(backend: string): BadgeVariant {
  if (backend === "local") return "success"
  if (backend === "cloud") return "info"
  return "outline"
}

function methodClassName(method: string): string {
  switch (method) {
    case "GET":
      return "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
    case "POST":
      return "border-sky-400/30 bg-sky-400/10 text-sky-200"
    case "DELETE":
      return "border-rose-400/30 bg-rose-400/10 text-rose-200"
    default:
      return "border-white/10 bg-white/[0.03] text-slate-200"
  }
}

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

export default function App() {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [totals, setTotals] = useState<Totals>(emptyTotals)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState("")
  const [backendFilter, setBackendFilter] = useState<BackendFilter>("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("")
  const [fallbackOnly, setFallbackOnly] = useState(false)
  const [search, setSearch] = useState("")
  const [pageSize, setPageSize] = useState(25)
  const [currentPage, setCurrentPage] = useState(1)

  const fetchData = useCallback(async () => {
    setRefreshing(true)
    try {
      const res = await fetch("/admin/api/data")
      if (!res.ok) {
        throw new Error(`Request failed with ${res.status}`)
      }
      const json = await res.json()
      setEntries(Array.isArray(json.data) ? json.data : [])
      setTotals(json.totals || emptyTotals)
      setError("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load audit data")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    const initialLoad = window.setTimeout(() => {
      void fetchData()
    }, 0)
    const interval = window.setInterval(() => {
      void fetchData()
    }, 5000)
    return () => {
      window.clearTimeout(initialLoad)
      window.clearInterval(interval)
    }
  }, [fetchData])

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
  const maxBucketValue = Math.max(
    1,
    ...requestBuckets.map((bucket) => bucket.success + bucket.error),
  )

  const metrics = [
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
  ]

  return (
    <main className="min-h-screen bg-[#111216] text-slate-100">
      <section className="sticky top-0 z-20 border-b border-white/10 bg-[#14151a]/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1680px] flex-col gap-3 px-4 py-3 lg:px-5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                className={cn(
                  "group relative overflow-hidden border-white/10 bg-[#202127] text-slate-100 shadow-none hover:-translate-y-px hover:border-white/20 hover:bg-[#292a31]",
                  refreshing && "border-sky-400/40 bg-sky-400/10 text-sky-100",
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
                <span className="relative">
                  {refreshing ? "Refreshing" : "Refresh"}
                </span>
              </Button>
              <Button
                variant="outline"
                className="border-white/10 bg-slate-100 text-slate-950 shadow-none hover:bg-white"
              >
                <Radio className="size-4" />
                Live
              </Button>
            </div>

            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value)
                  setCurrentPage(1)
                }}
                placeholder="Search logs"
                className="h-10 w-full rounded-md border border-white/10 bg-[#1c1d22] pl-10 pr-3 text-sm text-slate-100 outline-none transition-colors placeholder:text-slate-500 hover:border-white/15 focus:border-slate-500 focus:ring-2 focus:ring-slate-500/20"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                className="border-white/10 bg-[#202127] text-slate-100 shadow-none hover:bg-[#292a31]"
              >
                <Clock className="size-4" />
                Last hour
              </Button>
              <Button
                asChild
                variant="outline"
                className="border-white/10 bg-[#202127] text-slate-100 shadow-none hover:bg-[#292a31]"
              >
                <a href="/admin/logs" target="_blank" rel="noreferrer">
                  JSON logs
                  <ArrowUpRight className="size-4" />
                </a>
              </Button>
              <Button
                variant="outline"
                size="icon"
                aria-label="More actions"
                className="border-white/10 bg-[#202127] text-slate-100 shadow-none hover:bg-[#292a31]"
              >
                <MoreVertical className="size-4" />
              </Button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {metrics.map((metric) => {
              const Icon = metric.icon
              return (
                <Card
                  key={metric.label}
                  className="gap-3 rounded-md border-white/10 bg-[#16171c] py-4 shadow-none"
                >
                  <CardHeader className="flex flex-row items-center justify-between gap-3 px-4">
                    <div className="text-xs font-medium text-slate-400">
                      {metric.label}
                    </div>
                    <div className="rounded-md border border-white/10 bg-white/[0.03] p-1.5 text-slate-500">
                      <Icon className="size-3.5" />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-1 px-4">
                    <div className="font-mono text-2xl font-semibold tabular-nums text-slate-50">
                      {metric.value}
                    </div>
                    <p className="text-xs text-slate-500">{metric.detail}</p>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      </section>

      <section className="mx-auto flex max-w-[1680px] flex-col gap-3 px-4 py-3 lg:px-5">
        {error ? (
          <Card className="rounded-md border-rose-400/30 bg-rose-400/10 py-0 shadow-none">
            <CardContent className="flex items-center gap-3 px-4 py-3 text-sm text-rose-100">
              <AlertCircle className="size-4" />
              {error}
            </CardContent>
          </Card>
        ) : null}

        <Card className="gap-0 overflow-hidden rounded-md border-white/10 bg-[#15161b] py-0 shadow-none">
          <CardHeader className="border-b border-white/10 bg-[#17181d] px-4 py-3">
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <BarChart3 className="size-4 text-slate-500" />
                  <CardTitle className="text-sm font-semibold text-slate-200">
                    Gateway Request Volume
                  </CardTitle>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="inline-flex items-center gap-1.5 text-slate-400">
                    <span className="size-2 rounded-full bg-emerald-400" />
                    Success
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-slate-400">
                    <span className="size-2 rounded-full bg-rose-400" />
                    Error
                  </span>
                </div>
              </div>

              <div className="relative h-36 overflow-hidden rounded-sm border border-white/5 bg-[#131419] px-4 py-3">
                <div className="absolute inset-x-4 top-1/2 border-t border-dashed border-white/10" />
                <div className="absolute inset-x-4 bottom-8 border-t border-dashed border-white/10" />
                <div className="relative flex h-full items-end gap-1">
                  {requestBuckets.map((bucket) => {
                    const successHeight = Math.max(
                      bucket.success ? 10 : 0,
                      (bucket.success / maxBucketValue) * 100,
                    )
                    const errorHeight = Math.max(
                      bucket.error ? 10 : 0,
                      (bucket.error / maxBucketValue) * 100,
                    )

                    return (
                      <div
                        key={bucket.index}
                        className="flex h-full flex-1 items-end justify-center"
                        title={`${bucket.success} success, ${bucket.error} error`}
                      >
                        <div className="flex h-full w-full max-w-6 flex-col justify-end gap-0.5">
                          {bucket.error > 0 ? (
                            <div
                              className="rounded-t-sm bg-rose-500/85"
                              style={{ height: `${errorHeight}%` }}
                            />
                          ) : null}
                          {bucket.success > 0 ? (
                            <div
                              className="rounded-t-sm bg-emerald-500/80"
                              style={{ height: `${successHeight}%` }}
                            />
                          ) : (
                            <div className="h-1 rounded-full bg-white/5" />
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </CardHeader>

          <CardHeader className="border-b border-white/10 bg-[#202127] px-4 py-3">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <Database className="size-4 text-slate-500" />
                <CardTitle className="text-sm font-semibold text-slate-100">
                  Request History
                </CardTitle>
                <Badge
                  variant="outline"
                  className="border-white/10 bg-white/[0.03] text-slate-300"
                >
                  {filteredEntries.length} visible
                </Badge>
                <Badge
                  variant="outline"
                  className="border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
                >
                  Success {formatPercent(successShare)}
                </Badge>
                <Badge
                  variant="outline"
                  className="border-sky-400/20 bg-sky-400/10 text-sky-200"
                >
                  Cloud {formatPercent(cloudShare)}
                </Badge>
                <Badge
                  variant="outline"
                  className="border-amber-400/20 bg-amber-400/10 text-amber-200"
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
                        "border-white/10 shadow-none",
                        backendFilter === filter.value && !fallbackOnly
                          ? "bg-slate-100 text-slate-950 hover:bg-white"
                          : "bg-[#15161b] text-slate-300 hover:bg-white/[0.06] hover:text-slate-100",
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
                      "border-white/10 shadow-none",
                      fallbackOnly
                        ? "bg-slate-100 text-slate-950 hover:bg-white"
                        : "bg-[#15161b] text-slate-300 hover:bg-white/[0.06] hover:text-slate-100",
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
                        "border-white/10 shadow-none",
                        statusFilter === filter.value
                          ? "bg-white/[0.08] text-slate-100"
                          : "bg-[#15161b] text-slate-300 hover:bg-white/[0.06] hover:text-slate-100",
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
            <div className="flex min-h-[320px] items-center justify-center text-sm text-slate-500">
              Loading gateway activity...
            </div>
          ) : filteredEntries.length > 0 ? (
            <>
              <Table className="min-w-[1220px]">
                <TableHeader>
                  <TableRow className="border-b border-white/10 bg-[#24252b] hover:bg-[#24252b]">
                    <TableHead className="pl-5 text-xs font-semibold text-slate-100">
                      Time
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-slate-100">
                      Method
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-slate-100">
                      Path
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-slate-100">
                      Mode
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-slate-100">
                      Backend
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-slate-100">
                      Fallback
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-slate-100">
                      Reason
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-slate-100">
                      Status
                    </TableHead>
                    <TableHead className="text-right text-xs font-semibold text-slate-100">
                      Latency
                    </TableHead>
                    <TableHead className="pr-5 text-xs font-semibold text-slate-100">
                      Target URL
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedEntries.map((entry) => (
                    <TableRow
                      key={entry.id}
                      className="group border-white/10 bg-[#15161b] hover:bg-[#1d1e24]"
                    >
                      <TableCell className="relative pl-5 text-xs text-slate-400">
                        <span
                          className={cn(
                            "absolute left-0 top-3 h-6 w-1 rounded-r-full",
                            entry.status_code >= 200 && entry.status_code < 400
                              ? "bg-emerald-400"
                              : "bg-rose-400",
                          )}
                        />
                        {formatTime(entry.created_at)}
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            "inline-flex min-w-14 justify-center rounded-md border px-2 py-1 font-mono text-[11px] font-semibold shadow-none",
                            methodClassName(entry.method),
                          )}
                        >
                          {entry.method}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[280px] whitespace-normal break-all font-mono text-xs font-medium text-slate-100">
                        {entry.path}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className="border-white/10 bg-white/[0.03] font-mono text-[11px] text-slate-300"
                        >
                          {entry.route_mode}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={backendVariant(entry.backend_used)}
                          className="border-white/10"
                        >
                          {entry.backend_used || "none"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {entry.fallback_used ? (
                          <Badge
                            variant="warning"
                            className="border-amber-400/25 bg-amber-400/10 text-amber-200"
                          >
                            fallback
                          </Badge>
                        ) : (
                          <span className="text-xs text-slate-500">no</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[280px] whitespace-normal break-words text-xs text-slate-400">
                        {entry.fallback_reason || "-"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={statusVariant(entry.status_code)}
                          className="font-mono"
                        >
                          {entry.status_code}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs font-medium tabular-nums text-slate-100">
                        {entry.duration_ms
                          ? formatLatency(entry.duration_ms)
                          : "-"}
                      </TableCell>
                      <TableCell className="max-w-[320px] whitespace-normal break-all pr-5 font-mono text-xs font-medium">
                        {entry.target_url ? (
                          <a
                            href={entry.target_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-slate-100 underline-offset-4 transition-colors hover:text-white hover:underline"
                          >
                            {entry.target_url}
                          </a>
                        ) : (
                          <span className="text-slate-500">none</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex flex-col gap-3 border-t border-white/10 bg-[#15161b] px-5 py-3 text-sm text-slate-400 md:flex-row md:items-center md:justify-between">
                <div className="font-mono text-xs">
                  Showing{" "}
                  <span className="font-medium text-slate-100">
                    {filteredEntries.length ? pageStart + 1 : 0}-{pageEnd}
                  </span>{" "}
                  of{" "}
                  <span className="font-medium text-slate-100">
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
                      className="h-8 rounded-md border border-white/10 bg-[#202127] px-2 text-sm font-medium text-slate-100 shadow-none outline-none transition-colors hover:bg-[#292a31] focus-visible:border-slate-500 focus-visible:ring-[3px] focus-visible:ring-slate-500/30"
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
                      <span className="font-medium text-slate-100">
                        {visiblePage}
                      </span>{" "}
                      / {pageCount}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={visiblePage <= 1}
                      className="border-white/10 bg-[#202127] text-slate-100 shadow-none hover:bg-[#292a31]"
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
                      className="border-white/10 bg-[#202127] text-slate-100 shadow-none hover:bg-[#292a31]"
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
            <div className="flex min-h-[320px] flex-col items-center justify-center gap-2 px-6 text-center">
              <div className="rounded-full border border-white/10 bg-white/[0.03] p-3 text-slate-500">
                <Activity className="size-5" />
              </div>
              <div className="font-medium text-slate-100">
                No matching requests
              </div>
              <p className="max-w-md text-sm text-slate-500">
                Adjust the filters or wait for new gateway traffic to appear.
              </p>
            </div>
          )}
        </Card>
      </section>
    </main>
  )
}
