import { type ReactNode } from "react"
import type { LucideIcon } from "lucide-react"

interface PageLayoutProps {
  title: string
  icon: LucideIcon
  count?: { filtered: number; total: number }
  description?: string
  actions?: ReactNode
  children: ReactNode
}

export default function PageLayout({
  title,
  icon: Icon,
  count,
  description,
  actions,
  children,
}: PageLayoutProps) {
  return (
    <div id="content" className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-[1680px] px-4 py-4 lg:px-6">
        <div className="mb-6 flex items-center justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Icon className="size-5 shrink-0 text-muted-foreground" />
              <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
              {count && (
                <span className="text-sm text-muted-foreground">
                  ({count.filtered} of {count.total})
                </span>
              )}
            </div>
            {description && (
              <p className="mt-1 pl-7 text-sm text-muted-foreground">{description}</p>
            )}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>

        {children}
      </div>
    </div>
  )
}
