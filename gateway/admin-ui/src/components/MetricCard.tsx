import { type LucideIcon } from "lucide-react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"

interface MetricCardProps {
  label: string
  value: string | number
  detail: string
  icon: LucideIcon
}

export function MetricCard({ label, value, detail, icon: Icon }: MetricCardProps) {
  return (
    <Card className="gap-2 rounded-lg border-white/[0.06] bg-surface-2 py-5 shadow-none transition-colors duration-200 hover:bg-surface-3">
      <CardHeader className="flex flex-row items-center justify-between gap-3 px-5 pb-0">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <div className="rounded-md border border-white/[0.06] bg-white/[0.02] p-1.5 text-muted-foreground">
          <Icon className="size-3.5" />
        </div>
      </CardHeader>
      <CardContent className="space-y-0.5 px-5 pt-0">
        <div className="font-mono text-[28px] font-semibold leading-tight tabular-nums tracking-tight text-foreground">
          {value}
        </div>
        <p className="text-[11px] text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  )
}
