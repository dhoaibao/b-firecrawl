import {
  Activity,
  Cloud,
  Clock,
  Radio,
  Server,
} from "lucide-react"
import { MetricCard } from "@/components/MetricCard"
import { Skeleton } from "@/components/ui/skeleton"
import { formatPercent, formatLatency } from "@/hooks/useAuditMetrics"
import type { AuditMetrics } from "@/hooks/useAuditMetrics"

interface MetricsGridProps {
  metrics: AuditMetrics
  loading: boolean
}

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

export default function MetricsGrid({ metrics, loading }: MetricsGridProps) {
  if (loading) {
    return <MetricsSkeleton />
  }

  const cards = [
    {
      label: "Total Requests",
      value: metrics.total,
      detail: `${metrics.total} visible`,
      icon: Activity,
    },
    {
      label: "Success Rate",
      value: formatPercent(metrics.successShare),
      detail: `${metrics.successCount} successful`,
      icon: Radio,
    },
    {
      label: "Local Requests",
      value: metrics.local,
      detail: "self-hosted traffic",
      icon: Server,
    },
    {
      label: "Cloud Traffic",
      value: metrics.cloud,
      detail: `${formatPercent(metrics.cloudShare)} of traffic`,
      icon: Cloud,
    },
    {
      label: "Avg Latency",
      value: formatLatency(metrics.avgDuration),
      detail: `${metrics.fallbacks} fallbacks`,
      icon: Clock,
    },
  ]

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5 animate-slide-up">
      {cards.map((card) => (
        <MetricCard
          key={card.label}
          label={card.label}
          value={card.value}
          detail={card.detail}
          icon={card.icon}
        />
      ))}
    </div>
  )
}
