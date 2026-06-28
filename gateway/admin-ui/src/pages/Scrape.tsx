import { useState, useEffect } from "react"
import { Globe, Play } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import PageLayout from "@/components/PageLayout"
import PlaygroundResult from "@/components/PlaygroundResult"
import { playgroundScrape, type ScrapeRequest } from "@/lib/playground"
import { DEFAULT_ROUTE_MODE, ROUTE_MODES, type RouteMode } from "@/lib/routing"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/useToast"

const FORMAT_OPTIONS = [
  { value: "markdown", label: "Markdown" },
  { value: "html", label: "HTML" },
  { value: "rawHtml", label: "Raw HTML" },
  { value: "links", label: "Links" },
  { value: "screenshot", label: "Screenshot (Cloud)" },
]

export default function ScrapePage() {
  const [url, setUrl] = useState("")
  const [formats, setFormats] = useState<string[]>(["markdown"])
  const [onlyMainContent, setOnlyMainContent] = useState(true)
  const [waitFor, setWaitFor] = useState("")
  const [routeMode, setRouteMode] = useState<RouteMode>(DEFAULT_ROUTE_MODE)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<unknown>(undefined)
  const [error, setError] = useState<string | null>(null)
  const { addToast } = useToast()

  useEffect(() => {
    document.title = "Scrape a Web Page — Firecrawl Gateway"
  }, [])

  function toggleFormat(value: string) {
    setFormats((prev) =>
      prev.includes(value) ? prev.filter((f) => f !== value) : [...prev, value],
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!url.trim()) {
      addToast("URL is required", "error")
      return
    }

    const controller = new AbortController()
    setLoading(true)
    setError(null)
    setResult(undefined)

    const body: ScrapeRequest = { url: url.trim() }
    if (formats.length > 0) body.formats = formats
    if (!onlyMainContent) body.onlyMainContent = false
    if (waitFor) body.waitFor = Number(waitFor)

    try {
      const json = await playgroundScrape(body, routeMode, controller.signal)
      setResult(json)
    } catch (err) {
      if (controller.signal.aborted) return
      setError(err instanceof Error ? err.message : "Scrape failed")
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false)
      }
    }
  }

  return (
    <PageLayout title="Scrape a Web Page" icon={Globe}>
      <div className="space-y-4">
        <Card className="border-white/[0.06] bg-surface-2 shadow-none">
          <CardContent className="px-5 py-5">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label htmlFor="scrape-url" className="mb-1 block text-sm font-medium text-foreground">
                    URL
                  </label>
                  <input
                    id="scrape-url"
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://example.com"
                    className="h-10 w-full rounded-lg border border-white/[0.08] bg-surface-3 px-3 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground hover:border-white/12 focus:border-ring focus:ring-2 focus:ring-ring/30"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-foreground">Formats</label>
                  <div className="flex flex-wrap gap-2">
                    {FORMAT_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={formats.includes(option.value)}
                        onClick={() => toggleFormat(option.value)}
                        className={cn(
                          "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                          formats.includes(option.value)
                            ? "border-ring bg-ring/20 text-foreground"
                            : "border-white/[0.08] bg-surface-1 text-muted-foreground hover:bg-surface-3 hover:text-foreground",
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    id="scrape-main-content"
                    type="checkbox"
                    checked={onlyMainContent}
                    onChange={(e) => setOnlyMainContent(e.target.checked)}
                    className="size-4 rounded border-white/[0.08] bg-surface-3 text-ring focus:ring-ring/30"
                  />
                  <label htmlFor="scrape-main-content" className="text-sm text-foreground">
                    Only main content
                  </label>
                </div>
                <div>
                  <label htmlFor="scrape-wait" className="mb-1 block text-sm font-medium text-foreground">
                    Wait For (ms)
                  </label>
                  <input
                    id="scrape-wait"
                    type="number"
                    min={0}
                    value={waitFor}
                    onChange={(e) => setWaitFor(e.target.value)}
                    placeholder="0"
                    className="h-10 w-full rounded-lg border border-white/[0.08] bg-surface-3 px-3 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground hover:border-white/12 focus:border-ring focus:ring-2 focus:ring-ring/30"
                  />
                </div>
                <div>
                  <label htmlFor="scrape-route-mode" className="mb-1 block text-sm font-medium text-foreground">
                    Route Mode
                  </label>
                  <Select value={routeMode} onValueChange={(value) => setRouteMode(value as RouteMode)}>
                    <SelectTrigger id="scrape-route-mode" className="h-10 w-full text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROUTE_MODES.map((mode) => (
                        <SelectItem key={mode.value} value={mode.value}>
                          {mode.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center justify-end">
                <Button type="submit" disabled={loading || !url.trim()}>
                  <Play className="size-4 mr-1" />
                  {loading ? "Scraping..." : "Run Scrape"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
        <PlaygroundResult loading={loading} error={error} result={result} />
      </div>
    </PageLayout>
  )
}
