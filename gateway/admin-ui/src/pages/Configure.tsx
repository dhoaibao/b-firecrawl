import { useState, useEffect, useCallback } from "react"
import {
  Settings,
  Save,
  RotateCcw,
  Plus,
  Trash2,
  Shield,
  Server,
  AlertTriangle,
  CreditCard,
  RefreshCw,
  Eye,
  EyeOff,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/hooks/useToast"
import { useConfirmDialog } from "@/components/ConfirmDialog"
import PageLayout from "@/components/PageLayout"
import { api } from "@/lib/api"
import type { SettingsData, CreditUsageItem } from "@/types"

type SettingKey = keyof SettingsData

interface SettingField {
  key: SettingKey
  label: string
  description: string
  type: "number"
  category: "security"
  icon: React.ComponentType<{ className?: string }>
  min?: number
  step?: number
}

const FIELDS: SettingField[] = [
  {
    key: "user_inactivity_suspend_days",
    label: "User Inactivity Suspension",
    description: "Days of inactivity before a user account is automatically suspended. Set to 0 to disable.",
    type: "number",
    category: "security",
    icon: Shield,
    min: 0,
    step: 1,
  },
  {
    key: "api_key_inactivity_revoke_days",
    label: "API Key Inactivity Revocation",
    description: "Days of inactivity before an API key is automatically revoked. Set to 0 to disable.",
    type: "number",
    category: "security",
    icon: Shield,
    min: 0,
    step: 1,
  },
]

const CATEGORIES = [
  { key: "security" as const, label: "Security & Access", icon: Shield },
  { key: "cloud" as const, label: "Firecrawl Cloud", icon: CreditCard },
  { key: "fallback" as const, label: "Fallback Keys", icon: Server },
] as const

export default function Configure() {
  const [settings, setSettings] = useState<SettingsData>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [fallbackKeys, setFallbackKeys] = useState<string[]>([])
  const [newKey, setNewKey] = useState("")
  const [showPrimaryKey, setShowPrimaryKey] = useState(false)
  const [creditUsage, setCreditUsage] = useState<CreditUsageItem[]>([])
  const [creditUsageLoading, setCreditUsageLoading] = useState(false)
  const { addToast } = useToast()
  const { confirm: confirmReset, dialog: resetDialog } = useConfirmDialog()

  useEffect(() => {
    document.title = "Configure — Firecrawl Gateway"
  }, [])

  const fetchSettings = useCallback(async () => {
    try {
      const json = await api.get<{ data: SettingsData }>("/admin/api/settings")
      const data = json.data || {}
      setSettings(data)
      setFallbackKeys(data.fallback_firecrawl_api_keys || [])
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to load settings", "error")
    } finally {
      setLoading(false)
    }
  }, [addToast])

  const fetchCreditUsage = useCallback(async () => {
    setCreditUsageLoading(true)
    try {
      const json = await api.get<{ data: CreditUsageItem[] }>("/admin/api/settings/credit-usage")
      setCreditUsage(json.data || [])
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to load credit usage", "error")
    } finally {
      setCreditUsageLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    // Load settings on mount: standard React pattern for loading authenticated data.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchSettings()
  }, [fetchSettings])

  function updateSetting(key: SettingKey, value: unknown) {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

  function addFallbackKey() {
    const trimmed = newKey.trim()
    if (!trimmed) return
    if (fallbackKeys.includes(trimmed)) {
      addToast("This key is already in the list", "error")
      return
    }
    setFallbackKeys((prev) => [...prev, trimmed])
    setNewKey("")
  }

  function removeFallbackKey(index: number) {
    setFallbackKeys((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleSave() {
    setSaving(true)
    try {
      const payload: SettingsData = { ...settings }
      payload.fallback_firecrawl_api_keys = fallbackKeys

      await api.put<{ data: SettingsData }>("/admin/api/settings", payload)
      addToast("Settings saved successfully", "success")
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to save settings", "error")
    } finally {
      setSaving(false)
    }
  }

  function formatCredits(value: number | null): string {
    if (value === null) return "—"
    return value.toLocaleString()
  }

  function formatDate(value: string | null): string {
    if (!value) return "—"
    return new Date(value).toLocaleDateString()
  }

  function handleReset() {
    confirmReset({
      title: "Reset Settings",
      message: "This will discard any unsaved changes and reload the last saved settings. Are you sure?",
      confirmLabel: "Reset",
      variant: "warning",
      onConfirm: async () => {
        setLoading(true)
        await fetchSettings()
        addToast("Settings reset", "success")
      },
    })
  }

  if (loading) {
    return (
      <PageLayout title="Configure" icon={Settings}>
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="h-40 animate-pulse border-white/[0.06] bg-surface-2">
              <div className="h-full bg-white/[0.02]" />
            </Card>
          ))}
        </div>
      </PageLayout>
    )
  }

  return (
    <PageLayout
      title="Configure"
      icon={Settings}
      actions={
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleReset()}
            disabled={saving}
          >
            <RotateCcw className="size-4 mr-1" /> Reset
          </Button>
          <Button size="sm" onClick={() => void handleSave()} disabled={saving}>
            <Save className="size-4 mr-1" /> {saving ? "Saving..." : "Save Changes"}
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        {CATEGORIES.map((cat) => {
          const catFields = FIELDS.filter((f) => f.category === cat.key)
          if (cat.key === "cloud") {
            return (
              <Card key={cat.key} className="border-white/[0.06] bg-surface-2 py-0 shadow-none">
                <CardHeader className="border-b border-white/[0.06] bg-surface-3 px-5 py-4">
                  <div className="flex items-center gap-2">
                    <cat.icon className="size-4 text-muted-foreground" />
                    <CardTitle className="text-sm font-semibold text-foreground">{cat.label}</CardTitle>
                  </div>
                </CardHeader>
                <div className="space-y-4 px-5 py-4">
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-foreground">Primary Firecrawl API Key</label>
                    <p className="text-xs text-muted-foreground">
                      This key is used for all Firecrawl Cloud requests and local-to-cloud fallbacks.
                    </p>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <input
                          type={showPrimaryKey ? "text" : "password"}
                          placeholder="Enter Firecrawl API key..."
                          value={settings.firecrawl_api_key || ""}
                          onChange={(e) => updateSetting("firecrawl_api_key", e.target.value)}
                          className="h-10 w-full rounded-lg border border-white/[0.08] bg-surface-3 px-3 pr-10 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground hover:border-white/12 focus:border-ring focus:ring-2 focus:ring-ring/30"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPrimaryKey((prev) => !prev)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          aria-label={showPrimaryKey ? "Hide API key" : "Show API key"}
                        >
                          {showPrimaryKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-sm font-medium text-foreground">Credit Usage</label>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void fetchCreditUsage()}
                        disabled={creditUsageLoading}
                      >
                        <RefreshCw className={`size-4 mr-1 ${creditUsageLoading ? "animate-spin" : ""}`} /> Check Usage
                      </Button>
                    </div>
                    {creditUsage.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Click "Check Usage" to see remaining credits for the primary and fallback keys.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {creditUsage.map((item, i) => (
                          <div
                            key={`${item.keyPrefix}-${i}`}
                            className="flex flex-col gap-1 rounded-lg border border-white/[0.06] bg-surface-1 px-4 py-3"
                          >
                            <div className="flex items-center justify-between">
                              <code className="text-xs font-mono text-muted-foreground">{item.keyPrefix}</code>
                              {item.error ? (
                                <span className="text-xs text-danger-fg">{item.error}</span>
                              ) : (
                                <span className="text-sm font-medium text-foreground">
                                  {formatCredits(item.remainingCredits)} / {formatCredits(item.planCredits)} credits
                                </span>
                              )}
                            </div>
                            {!item.error && (
                              <p className="text-xs text-muted-foreground">
                                Billing period: {formatDate(item.billingPeriodStart)} – {formatDate(item.billingPeriodEnd)}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            )
          }

          if (cat.key === "fallback") {
            return (
              <Card key={cat.key} className="border-white/[0.06] bg-surface-2 py-0 shadow-none">
                <CardHeader className="border-b border-white/[0.06] bg-surface-3 px-5 py-4">
                  <div className="flex items-center gap-2">
                    <cat.icon className="size-4 text-muted-foreground" />
                    <CardTitle className="text-sm font-semibold text-foreground">{cat.label}</CardTitle>
                  </div>
                </CardHeader>
                <div className="space-y-4 px-5 py-4">
                  <p className="text-sm text-muted-foreground">
                    Add multiple Firecrawl API keys as fallbacks. When the primary key fails with a rate limit or auth error, the gateway will try these keys in order.
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Enter fallback API key..."
                      value={newKey}
                      onChange={(e) => setNewKey(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addFallbackKey() } }}
                      className="h-10 flex-1 rounded-lg border border-white/[0.08] bg-surface-3 px-3 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground hover:border-white/12 focus:border-ring focus:ring-2 focus:ring-ring/30"
                    />
                    <Button variant="outline" size="sm" onClick={addFallbackKey}>
                      <Plus className="size-4 mr-1" /> Add
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {fallbackKeys.length === 0 && (
                      <div className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-surface-1 px-4 py-3 text-sm text-muted-foreground">
                        <AlertTriangle className="size-4" />
                        No fallback keys configured.
                      </div>
                    )}
                    {fallbackKeys.map((key, i) => (
                      <div
                        key={`${key.slice(0, 8)}-${i}`}
                        className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-surface-1 px-4 py-2.5"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="rounded bg-surface-3 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                            {i + 1}
                          </span>
                          <code className="truncate text-sm font-mono text-foreground">
                            {key.slice(0, 12)}...{key.slice(-4)}
                          </code>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 border-danger-muted bg-danger-muted/30 text-danger-fg hover:bg-danger-muted/50 shrink-0"
                          onClick={() => removeFallbackKey(i)}
                        >
                          <Trash2 className="size-3 mr-1" /> Remove
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            )
          }

          if (catFields.length === 0) return null

          return (
            <Card key={cat.key} className="border-white/[0.06] bg-surface-2 py-0 shadow-none">
              <CardHeader className="border-b border-white/[0.06] bg-surface-3 px-5 py-4">
                <div className="flex items-center gap-2">
                  <cat.icon className="size-4 text-muted-foreground" />
                  <CardTitle className="text-sm font-semibold text-foreground">{cat.label}</CardTitle>
                </div>
              </CardHeader>
              <div className="divide-y divide-white/[0.04]">
                {catFields.map((field) => (
                  <div key={field.key} className="px-5 py-4">
                    <label className="mb-1 block text-sm font-medium text-foreground">
                      {field.label}
                    </label>
                    <p className="mb-3 text-xs text-muted-foreground">{field.description}</p>
                    <input
                      type="number"
                      min={field.min}
                      step={field.step}
                      value={settings[field.key] ?? 0}
                      onChange={(e) => {
                        const val = e.target.value === "" ? 0 : Number(e.target.value)
                        updateSetting(field.key, val)
                      }}
                      className="h-10 w-full max-w-xs rounded-lg border border-white/[0.08] bg-surface-3 px-3 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground hover:border-white/12 focus:border-ring focus:ring-2 focus:ring-ring/30"
                    />
                  </div>
                ))}
              </div>
            </Card>
          )
        })}
      </div>
      {resetDialog}
    </PageLayout>
  )
}
