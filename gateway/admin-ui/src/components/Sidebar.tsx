import { useState } from "react"
import { useLocation, Link } from "react-router-dom"
import {
  LayoutDashboard,
  Key,
  Users,
  LogOut,
  Menu,
  X,
  Shield,
  Settings,
  FileText,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useAuth } from "@/contexts/AuthContext"

interface NavItem {
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  adminOnly?: boolean
}

const navItems: NavItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Parse a File", href: "/parse", icon: FileText },
  { label: "API Keys", href: "/api-keys", icon: Key },
  { label: "Users", href: "/users", icon: Users, adminOnly: true },
  { label: "Configure", href: "/configure", icon: Settings, adminOnly: true },
]

export default function Sidebar() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)

  const isActive = (href: string) => {
    if (href === "/") {
      return location.pathname === "/"
    }
    return location.pathname === href
  }

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="flex h-14 items-center gap-2.5 border-b border-white/[0.06] px-4">
        <div className="flex size-8 items-center justify-center rounded-lg border border-white/[0.08] bg-surface-2">
          <Shield className="size-4 text-foreground" />
        </div>
        <span className="text-sm font-semibold text-foreground">
          Firecrawl Gateway
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-3" aria-label="Main">
        <ul className="space-y-1">
          {navItems
            .filter((item) => !item.adminOnly || user?.is_admin)
            .map((item) => {
              const active = isActive(item.href)
              return (
                <li key={item.href}>
                  <Link
                    to={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      "relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                      active
                        ? "bg-white/[0.06] font-medium text-foreground before:absolute before:left-0 before:top-1.5 before:h-5 before:w-[3px] before:rounded-r-full before:bg-foreground before:shadow-[0_0_8px_2px_rgba(255,255,255,0.08)]"
                        : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
                    )}
                    aria-current={active ? "page" : undefined}
                  >
                    <item.icon className="size-4" />
                    {item.label}
                  </Link>
                </li>
              )
            })}
        </ul>
      </nav>

      {/* User + Logout */}
      <div className="border-t border-white/[0.06] px-3 py-3">
        <div className="mb-2 px-3">
          <div className="text-sm font-medium text-foreground">
            {user?.name || "User"}
          </div>
          <div className="text-xs text-muted-foreground">{user?.email}</div>
        </div>
        <button
          onClick={() => logout()}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-white/[0.04] hover:text-foreground"
        >
          <LogOut className="size-4" />
          Logout
        </button>
      </div>
    </>
  )

  return (
    <>
      {/* Mobile top bar */}
      <div className="fixed left-0 right-0 top-0 z-30 flex h-14 items-center justify-between border-b border-white/[0.06] bg-surface-2/90 px-4 backdrop-blur lg:hidden">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-lg border border-white/[0.08] bg-surface-2">
            <Shield className="size-4 text-foreground" />
          </div>
          <span className="text-sm font-semibold text-foreground">
            Firecrawl
          </span>
        </div>
        <button
          onClick={() => setMobileOpen((v) => !v)}
          className="flex size-8 items-center justify-center rounded-lg border border-white/[0.08] bg-surface-3 text-foreground"
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? <X className="size-4" /> : <Menu className="size-4" />}
        </button>
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar — mobile drawer / desktop fixed */}
      <aside
        className={cn(
          "fixed bottom-0 left-0 top-0 z-50 flex w-60 flex-col border-r border-white/[0.06] bg-surface-1 transition-transform duration-200 lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {sidebarContent}
      </aside>

      {/* Spacer for desktop sidebar */}
      <div className="hidden lg:block lg:w-60" />
    </>
  )
}
