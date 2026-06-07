import { useMemo, useState } from "react"

import type { AuditEntry } from "@/pages/Dashboard"

interface LatencyDistributionChartProps {
  entries: AuditEntry[]
}

export function LatencyDistributionChart({ entries }: LatencyDistributionChartProps) {
  const [hovered, setHovered] = useState<string | null>(null)

  const buckets = useMemo(() => {
    const result: Record<string, number> = {
      "<50ms": 0,
      "50-100ms": 0,
      "100-500ms": 0,
      "500ms-1s": 0,
      "1s-3s": 0,
      ">3s": 0,
    }
    entries.forEach((entry) => {
      const ms = Number(entry.duration_ms)
      if (!Number.isFinite(ms)) return
      if (ms < 50) result["<50ms"]++
      else if (ms < 100) result["50-100ms"]++
      else if (ms < 500) result["100-500ms"]++
      else if (ms < 1000) result["500ms-1s"]++
      else if (ms < 3000) result["1s-3s"]++
      else result[">3s"]++
    })
    return result
  }, [entries])

  const maxCount = Math.max(1, ...Object.values(buckets))
  const total = Object.values(buckets).reduce((sum, c) => sum + c, 0) || 1

  const barMeta = [
    { key: "<50ms", label: "<50ms", color: "bg-success", text: "text-success-fg" },
    { key: "50-100ms", label: "50-100", color: "bg-info", text: "text-info-fg" },
    { key: "100-500ms", label: "100-500", color: "bg-warning", text: "text-warning-fg" },
    { key: "500ms-1s", label: "500ms-1s", color: "bg-warning/70", text: "text-warning-fg/70" },
    { key: "1s-3s", label: "1s-3s", color: "bg-danger/70", text: "text-danger-fg/70" },
    { key: ">3s", label: ">3s", color: "bg-danger", text: "text-danger-fg" },
  ] as const

  return (
    <div className="relative h-36 overflow-hidden rounded-sm border border-white/5 bg-surface-2 px-4 py-3">
      {total <= 0 ? (
        <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
          No data
        </div>
      ) : (
        <div className="flex h-full flex-col justify-center gap-2">
          {barMeta.map((bar) => {
            const count = buckets[bar.key]
            const pct = Math.round((count / total) * 100)
            const width = Math.max(count ? 4 : 0, (count / maxCount) * 100)
            const isHovered = hovered === bar.key

            return (
              <div
                key={bar.key}
                className="flex items-center gap-2"
                onMouseEnter={() => setHovered(bar.key)}
                onMouseLeave={() => setHovered(null)}
              >
                <span className="w-20 shrink-0 text-[10px] text-muted-foreground">
                  {bar.label}
                </span>
                <div className="relative h-4 flex-1 rounded-sm bg-white/[0.04]">
                  <div
                    className={`h-full rounded-sm ${bar.color} transition-all duration-300 ${isHovered ? "opacity-100" : "opacity-80"}`}
                    style={{ width: `${width}%` }}
                  />
                </div>
                <span className={`w-12 shrink-0 text-right text-[10px] font-medium ${bar.text}`}>
                  {count} ({pct}%)
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
