import { useState, useEffect, useCallback } from "react"
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  Settings,
  Save,
  RotateCcw,
  Plus,
  Trash2,
  Shield,
  CreditCard,
  GripVertical,
  Route,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DEFAULT_ROUTE_MODE, ROUTE_MODES } from "@/lib/routing"
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
  type: "number" | "select"
  category: "security" | "cloud" | "routing"
  icon: React.ComponentType<{ className?: string }>
  min?: number
  step?: number
  options?: { value: string; label: string }[]
}

const FIELDS: SettingField[] = [
  {
    key: "default_route_mode",
    label: "Default Route Mode",
    description: "Default routing behavior when no X-Firecrawl-Route-Mode header or query parameter is provided.",
    type: "select",
    category: "routing",
    icon: Route,
    options: [...ROUTE_MODES],
  },
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
  { key: "routing" as const, label: "Routing", icon: Route },
  { key: "security" as const, label: "Security & Access", icon: Shield },
  { key: "cloud" as const, label: "Firecrawl Cloud API Keys", icon: CreditCard },
] as const

interface ApiKeyRow {
  id: string
  key: string
}

function maskKey(key: string): string {
  if (key.length <= 12) return key
  return `${key.slice(0, 8)}...${key.slice(-4)}`
}

function makeRows(keys: string[]): ApiKeyRow[] {
  return keys.map((key, index) => ({ id: `${index}-${key.slice(0, 8)}`, key }))
}

function SortableApiKeyRow({
  row,
  index,
  usage,
  onRemove,
}: {
  row: ApiKeyRow
  index: number
  usage: CreditUsageItem | undefined
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex flex-col gap-2 rounded-lg border border-white/[0.06] bg-surface-1 px-4 py-3 ${isDragging ? "opacity-50" : ""}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
            aria-label="Drag to reorder"
          >
            <GripVertical className="size-4" />
          </button>
          <span className="rounded bg-surface-3 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
            {index + 1}
          </span>
          <code className="truncate text-sm font-mono text-foreground" title={row.key}>
            {maskKey(row.key)}
          </code>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-7 border-danger-muted bg-danger-muted/30 text-danger-fg hover:bg-danger-muted/50 shrink-0"
          onClick={onRemove}
        >
          <Trash2 className="size-3 mr-1" /> Remove
        </Button>
      </div>
      {usage?.error ? (
        <p className="text-xs text-danger-fg">{usage.error}</p>
      ) : usage ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            {usage.remainingCredits?.toLocaleString() ?? "—"} / {usage.planCredits?.toLocaleString() ?? "—"} credits
          </span>
          <span>
            Renews on {usage.billingPeriodEnd
              ? new Date(usage.billingPeriodEnd).toLocaleDateString()
              : "—"}
          </span>
        </div>
      ) : null}
    </div>
  )
}

export default function Configure() {
  const [settings, setSettings] = useState<SettingsData>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [apiKeyRows, setApiKeyRows] = useState<ApiKeyRow[]>([])
  const [newKey, setNewKey] = useState("")
  const [creditUsage, setCreditUsage] = useState<CreditUsageItem[]>([])
  const { addToast } = useToast()
  const { confirm: confirmReset, dialog: resetDialog } = useConfirmDialog()

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  useEffect(() => {
    document.title = "Configure — Firecrawl Gateway"
  }, [])

  const fetchCreditUsage = useCallback(async () => {
    try {
      const json = await api.get<{ data: CreditUsageItem[] }>("/admin/api/settings/credit-usage")
      setCreditUsage(json.data || [])
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to load credit usage", "error")
    }
  }, [addToast])

  const fetchSettings = useCallback(async () => {
    try {
      const json = await api.get<{ data: SettingsData }>("/admin/api/settings")
      const data = json.data || {}
      setSettings(data)
      setApiKeyRows(makeRows(data.firecrawl_api_keys || []))
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to load settings", "error")
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    void fetchSettings()
  }, [fetchSettings])

  useEffect(() => {
    void fetchCreditUsage()
    const interval = setInterval(() => {
      void fetchCreditUsage()
    }, 60_000)
    return () => clearInterval(interval)
  }, [fetchCreditUsage])

  function updateSetting(key: SettingKey, value: unknown) {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

  function addApiKey() {
    const trimmed = newKey.trim()
    if (!trimmed) return
    if (apiKeyRows.some((row) => row.key === trimmed)) {
      addToast("This key is already in the list", "error")
      return
    }
    setApiKeyRows((prev) => [...prev, { id: `${prev.length}-${trimmed.slice(0, 8)}`, key: trimmed }])
    setNewKey("")
  }

  function removeApiKey(index: number) {
    setApiKeyRows((prev) => prev.filter((_, i) => i !== index))
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (over && active.id !== over.id) {
      setApiKeyRows((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id)
        const newIndex = items.findIndex((item) => item.id === over.id)
        return arrayMove(items, oldIndex, newIndex)
      })
    }
  }

  async function handleSave() {
    setSaving(true)
    try {
      const payload: Partial<SettingsData> = {
        firecrawl_api_keys: apiKeyRows.map((row) => row.key),
        user_inactivity_suspend_days: settings.user_inactivity_suspend_days,
        api_key_inactivity_revoke_days: settings.api_key_inactivity_revoke_days,
      }

      await api.put<{ data: SettingsData }>("/admin/api/settings", payload)
      addToast("Settings saved successfully", "success")
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to save settings", "error")
    } finally {
      setSaving(false)
    }
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
          {Array.from({ length: 2 }).map((_, i) => (
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
                  <p className="text-sm text-muted-foreground">
                    Add Firecrawl API keys in priority order. The gateway uses the first key and tries the next ones on rate limits or auth errors. Drag to reorder.
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Enter Firecrawl API key..."
                      value={newKey}
                      onChange={(e) => setNewKey(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addApiKey() } }}
                      className="h-10 flex-1 rounded-lg border border-white/[0.08] bg-surface-3 px-3 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground hover:border-white/12 focus:border-ring focus:ring-2 focus:ring-ring/30"
                    />
                    <Button variant="outline" size="sm" onClick={addApiKey}>
                      <Plus className="size-4 mr-1" /> Add
                    </Button>
                  </div>
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={apiKeyRows.map((row) => row.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-2">
                        {apiKeyRows.length === 0 && (
                          <div className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-surface-1 px-4 py-3 text-sm text-muted-foreground">
                            No API keys configured. Cloud fallback and cloud-first routing will not work until you add at least one key.
                          </div>
                        )}
                        {apiKeyRows.map((row, i) => (
                          <SortableApiKeyRow
                            key={row.id}
                            row={row}
                            index={i}
                            usage={creditUsage[i]}
                          onRemove={() => removeApiKey(i)}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
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
                    {field.type === "select" ? (
                      <Select
                        value={String(settings[field.key] ?? DEFAULT_ROUTE_MODE)}
                        onValueChange={(value) => updateSetting(field.key, value)}
                      >
                        <SelectTrigger className="h-10 w-full max-w-md text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {field.options?.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
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
                    )}
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
